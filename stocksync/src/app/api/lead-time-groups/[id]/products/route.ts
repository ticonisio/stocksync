import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const productsSchema = z.object({
  products: z.array(
    z.object({
      productId: z.string().min(1),
      leadTimeOverride: z.number().int().min(1).nullable().optional(),
    })
  ),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const group = await prisma.leadTimeGroup.findFirst({
    where: { id: params.id, storeId: store.id },
  });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = productsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { products } = parsed.data;
  const productIds = products.map((p) => p.productId);

  // Verify all products belong to this store
  if (productIds.length > 0) {
    const owned = await prisma.product.findMany({
      where: { id: { in: productIds }, storeId: store.id },
      select: { id: true },
    });
    if (owned.length !== productIds.length) {
      return NextResponse.json({ error: 'Forbidden: some products do not belong to this store' }, { status: 403 });
    }
  }

  await prisma.$transaction(async (tx) => {
    // Step 1: Clear all current products from THIS group (complete replacement)
    await tx.productLeadTimeGroup.deleteMany({
      where: { leadTimeGroupId: group.id },
    });

    // Step 2: Remove selected products from any OTHER group (exclusivity)
    if (productIds.length > 0) {
      await tx.productLeadTimeGroup.deleteMany({
        where: { productId: { in: productIds } },
      });
    }

    // Step 3: Create new associations for selected products
    if (productIds.length > 0) {
      await tx.productLeadTimeGroup.createMany({
        data: productIds.map((productId) => ({
          productId,
          leadTimeGroupId: group.id,
        })),
      });
    }

    // Step 4: Update leadTimeOverride for each product
    for (const p of products) {
      const overrideValue = p.leadTimeOverride ?? null;
      await tx.product.update({
        where: { id: p.productId },
        data: { leadTimeOverride: overrideValue },
      });
    }
  });

  const updatedGroup = await prisma.leadTimeGroup.findUnique({
    where: { id: group.id },
    include: { products: { select: { productId: true } } },
  });

  return NextResponse.json({ group: updatedGroup });
}
