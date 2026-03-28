import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const matchRequestSchema = z.object({
  items: z.array(
    z.object({
      rawTitle: z.string().min(1),
      rawSku: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = matchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { items } = parsed.data;

  // Deduplicate titles for batch query
  const uniqueTitles = [...new Set(items.map((i) => i.rawTitle.toLowerCase().trim()))];

  // Fetch all products that match any of the titles
  const allProducts = await prisma.product.findMany({
    where: {
      storeId: store.id,
      OR: uniqueTitles.map((title) => ({
        title: { contains: title, mode: 'insensitive' as const },
      })),
    },
    select: {
      id: true,
      title: true,
      variants: {
        select: {
          id: true,
          title: true,
          sku: true,
          availableStock: true,
        },
      },
    },
  });

  // Build match results for each item
  const results = items.map((item) => {
    const normalizedTitle = item.rawTitle.toLowerCase().trim();

    // Find products whose title contains the search term (case-insensitive)
    const matches = allProducts.filter((p) =>
      p.title.toLowerCase().includes(normalizedTitle) ||
      normalizedTitle.includes(p.title.toLowerCase())
    );

    // Check for exact match first
    const exactMatches = matches.filter(
      (p) => p.title.toLowerCase() === normalizedTitle
    );

    // If SKU provided, try to narrow down
    if (item.rawSku) {
      const skuMatch = matches.find((p) =>
        p.variants.some((v) => v.sku?.toLowerCase() === item.rawSku!.toLowerCase())
      );
      if (skuMatch) {
        const matchedVariant = skuMatch.variants.find(
          (v) => v.sku?.toLowerCase() === item.rawSku!.toLowerCase()
        );
        return {
          rawTitle: item.rawTitle,
          rawSku: item.rawSku,
          matchStatus: 'MATCHED' as const,
          candidates: [skuMatch],
          matchedProductId: skuMatch.id,
          matchedVariantId: matchedVariant?.id ?? skuMatch.variants[0]?.id,
        };
      }
    }

    if (exactMatches.length === 1) {
      return {
        rawTitle: item.rawTitle,
        rawSku: item.rawSku,
        matchStatus: 'MATCHED' as const,
        candidates: exactMatches,
        matchedProductId: exactMatches[0].id,
        matchedVariantId: exactMatches[0].variants[0]?.id,
      };
    }

    if (matches.length === 1) {
      return {
        rawTitle: item.rawTitle,
        rawSku: item.rawSku,
        matchStatus: 'MATCHED' as const,
        candidates: matches,
        matchedProductId: matches[0].id,
        matchedVariantId: matches[0].variants[0]?.id,
      };
    }

    if (matches.length > 1) {
      return {
        rawTitle: item.rawTitle,
        rawSku: item.rawSku,
        matchStatus: 'AMBIGUOUS' as const,
        candidates: matches,
        matchedProductId: null,
        matchedVariantId: null,
      };
    }

    return {
      rawTitle: item.rawTitle,
      rawSku: item.rawSku,
      matchStatus: 'UNMATCHED' as const,
      candidates: [],
      matchedProductId: null,
      matchedVariantId: null,
    };
  });

  return NextResponse.json({ results });
}
