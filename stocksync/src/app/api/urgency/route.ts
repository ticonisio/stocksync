import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUrgencyItems, parsePeriod } from '@/services/inventory/urgency-service';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const period = parsePeriod(searchParams.get('period'));

  const items = await getUrgencyItems(store.id, period);

  const summary = {
    critical: items.filter((i) => i.status === 'CRÍTICO').length,
    warning: items.filter((i) => i.status === 'ATENÇÃO').length,
    ok: items.filter((i) => i.status === 'OK').length,
  };

  return NextResponse.json({ items, summary });
}
