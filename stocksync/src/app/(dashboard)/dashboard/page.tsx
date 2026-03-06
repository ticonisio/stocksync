import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollectionFilter } from '@/components/inventory/CollectionFilter';

function StockBadge({ stock }: { stock: number }) {
  const color =
    stock >= 10
      ? 'bg-green-100 text-green-800'
      : stock > 0
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {stock}
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { collection?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/onboarding/connect-shopify');

  const [products, collections] = await Promise.all([
    prisma.product.findMany({
      where: {
        storeId: store.id,
        ...(searchParams.collection
          ? { collections: { some: { collectionId: searchParams.collection } } }
          : {}),
      },
      include: {
        variants: { orderBy: { title: 'asc' } },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.collection.findMany({
      where: { storeId: store.id },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
  ]);

  const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);
  const totalUnits = products.reduce(
    (sum, p) => sum + p.variants.reduce((s, v) => s + v.availableStock, 0),
    0
  );

  if (products.length === 0 && !searchParams.collection) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <p className="text-muted-foreground text-lg">Nenhum produto sincronizado ainda.</p>
          <Link
            href="/onboarding/syncing"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Sincronizar agora
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{products.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Variantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalVariants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unidades em estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalUnits}</p>
          </CardContent>
        </Card>
      </div>

      {/* Collection filter */}
      {collections.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por coleção:</span>
          <CollectionFilter collections={collections} selected={searchParams.collection} />
        </div>
      )}

      {/* Empty state when filtered */}
      {products.length === 0 && searchParams.collection && (
        <p className="text-muted-foreground py-8 text-center">
          Nenhum produto nesta coleção.
        </p>
      )}

      {/* Product list */}
      <div className="space-y-4">
        {products.map((product) => {
          const productTotal = product.variants.reduce((sum, v) => sum + v.availableStock, 0);
          return (
            <Card key={product.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{product.title}</CardTitle>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{product.variants.length} variante{product.variants.length !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>
                      Total: <StockBadge stock={productTotal} />
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {product.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{variant.title}</span>
                        <span className="text-xs text-muted-foreground">
                          SKU: {variant.sku ?? '—'}
                        </span>
                      </div>
                      <StockBadge stock={variant.availableStock} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
