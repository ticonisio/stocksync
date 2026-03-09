import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { aggregateVelocityByProduct } from '@/lib/insightsAggregator';

const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof VALID_PERIODS)[number];

function parsePeriod(raw: string | null): Period {
  if (VALID_PERIODS.includes(raw as Period)) return raw as Period;
  return '30d';
}

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

  const velocities = await prisma.salesVelocity.findMany({
    where: { storeId: store.id, period },
    include: {
      variant: {
        select: {
          productId: true,
          title: true,
          availableStock: true,
          product: { select: { title: true } },
        },
      },
    },
  });

  const rollups = aggregateVelocityByProduct(velocities);

  const products = rollups
    .filter((p) => p.velocityPerDay > 0 && p.totalAvailableStock < p.velocityPerDay * 14)
    .map((p) => ({
      ...p,
      diasRestantes: Math.max(0, Math.floor(p.totalAvailableStock / p.velocityPerDay)),
    }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  return NextResponse.json({ products });
}
