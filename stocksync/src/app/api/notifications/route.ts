import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/notifications — lista notificações não lidas + recentes */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const notifications = await prisma.notification.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      readAt: true,
      createdAt: true,
      productId: true,
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { storeId: store.id, readAt: null },
  });

  return NextResponse.json({ notifications, unreadCount });
}

/** PATCH /api/notifications — marca notificações como lidas */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const body = (await req.json()) as { ids?: string[]; all?: boolean };

  if (body.all) {
    await prisma.notification.updateMany({
      where: { storeId: store.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (body.ids && body.ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, storeId: store.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
