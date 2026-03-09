import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const groupSchema = z.object({
  name: z.string().min(1).max(100),
  leadTimeDays: z.number().int().min(1).max(365),
  bufferDays: z.number().int().min(0).max(90).nullable().optional(),
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Suppress unused variable warning for req
  void req;

  const rawGroups = await prisma.leadTimeGroup.findMany({
    where: { storeId: store.id },
    include: { products: { select: { productId: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const groups = rawGroups.map(({ products, ...group }) => ({
    ...group,
    productCount: products.length,
  }));

  return NextResponse.json({ groups });
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

  const body = await req.json().catch(() => null);
  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, leadTimeDays, bufferDays } = parsed.data;

  const group = await prisma.leadTimeGroup.create({
    data: {
      storeId: store.id,
      name,
      leadTimeDays,
      bufferDays: bufferDays ?? null,
    },
  });

  return NextResponse.json({ group }, { status: 201 });
}
