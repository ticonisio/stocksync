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

async function getAuthorizedGroup(userId: string, groupId: string) {
  const store = await prisma.store.findFirst({ where: { userId } });
  if (!store) return { store: null, group: null };

  const group = await prisma.leadTimeGroup.findFirst({
    where: { id: groupId, storeId: store.id },
  });

  return { store, group };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { store, group } = await getAuthorizedGroup(session.user.id, id);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const fullGroup = await prisma.leadTimeGroup.findUnique({
    where: { id: group.id },
    include: { products: { select: { productId: true } } },
  });

  return NextResponse.json({ group: fullGroup });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { store, group } = await getAuthorizedGroup(session.user.id, id);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, leadTimeDays, bufferDays } = parsed.data;

  const updated = await prisma.leadTimeGroup.update({
    where: { id: group.id },
    data: { name, leadTimeDays, bufferDays: bufferDays ?? null },
  });

  return NextResponse.json({ group: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { store, group } = await getAuthorizedGroup(session.user.id, id);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  await prisma.leadTimeGroup.delete({ where: { id: group.id } });

  return NextResponse.json({ success: true });
}
