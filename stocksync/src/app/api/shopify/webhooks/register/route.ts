import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { registerWebhooks } from '@/services/shopify/webhooks';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({
    where: { userId: session.user.id },
    select: { id: true, shopifyDomain: true },
  });

  if (!store) {
    return NextResponse.json({ error: 'Nenhuma loja conectada' }, { status: 404 });
  }

  await registerWebhooks(store.id);

  return NextResponse.json({
    ok: true,
    message: `Webhooks re-registrados para ${store.shopifyDomain}`,
  });
}
