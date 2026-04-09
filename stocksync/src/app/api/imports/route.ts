import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { checkImportLimit, isSubscriptionActive, getSubscription } from '@/lib/subscription';

const importItemSchema = z.object({
  rawTitle: z.string().min(1),
  rawSku: z.string().optional(),
  quantity: z.number().int().positive('Quantidade deve ser maior que 0'),
  unitCost: z.number().positive('Custo unitário deve ser maior que 0'),
  matchedProductId: z.string().nullable(),
  matchedVariantId: z.string().nullable(),
  matchStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNMATCHED']),
});

const importRequestSchema = z.object({
  fileName: z.string().min(1),
  items: z.array(importItemSchema).min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const imports = await prisma.import.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json({ imports });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Check active subscription
  const subscription = await getSubscription(store.id);
  if (!isSubscriptionActive(subscription)) {
    return NextResponse.json({ error: 'Assinatura inativa. Escolha um plano em Configurações.' }, { status: 403 });
  }

  // Check import limit for current plan
  const importCheck = await checkImportLimit(store.id);
  if (!importCheck.allowed) {
    return NextResponse.json(
      { error: `Limite de importações atingido (${importCheck.used}/${importCheck.limit} este mês). Faça upgrade do plano.` },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { fileName, items } = parsed.data;
  const matchedItems = items.filter(
    (i) => i.matchStatus === 'MATCHED' && i.matchedVariantId
  );

  let importId: string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Import record
      const importRecord = await tx.import.create({
        data: {
          storeId: store.id,
          fileName,
          status: 'PROCESSING',
          totalRows: items.length,
          matchedRows: matchedItems.length,
        },
      });

      // 2. Create ImportItem records
      await tx.importItem.createMany({
        data: items.map((item, index) => ({
          importId: importRecord.id,
          rowNumber: index + 1,
          rawTitle: item.rawTitle,
          rawSku: item.rawSku,
          quantity: item.quantity,
          unitCost: item.unitCost,
          matchedProductId: item.matchStatus === 'MATCHED' ? item.matchedProductId : null,
          matchedVariantId: item.matchStatus === 'MATCHED' ? item.matchedVariantId : null,
          matchStatus: item.matchStatus,
        })),
      });

      // 3. For MATCHED items: increment stock (NEVER set/decrement)
      for (const item of matchedItems) {
        await tx.variant.update({
          where: { id: item.matchedVariantId! },
          data: {
            availableStock: { increment: item.quantity },
          },
        });
      }

      // 4. Recalculate averageCost for affected variants
      const affectedVariantIds = [
        ...new Set(matchedItems.map((i) => i.matchedVariantId!)),
      ];

      for (const variantId of affectedVariantIds) {
        const allItems = await tx.importItem.findMany({
          where: { matchedVariantId: variantId, matchStatus: 'MATCHED' },
        });

        const totalQty = allItems.reduce((s, i) => s + i.quantity, 0);
        const totalCost = allItems.reduce(
          (s, i) => s + i.quantity * Number(i.unitCost),
          0
        );
        const averageCost = totalQty > 0 ? totalCost / totalQty : null;

        await tx.variant.update({
          where: { id: variantId },
          data: { averageCost },
        });
      }

      // 5. Mark as DONE
      await tx.import.update({
        where: { id: importRecord.id },
        data: { status: 'DONE' },
      });

      return importRecord;
    });

    importId = result.id;
  } catch (error) {
    console.error('Import failed:', error);

    // Try to mark as ERROR if we have an import record
    return NextResponse.json(
      { error: 'Falha ao processar importação' },
      { status: 500 }
    );
  }

  return NextResponse.json({ importId }, { status: 201 });
}
