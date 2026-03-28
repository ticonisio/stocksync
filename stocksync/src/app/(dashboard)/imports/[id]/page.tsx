import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ArrowLeft } from 'lucide-react';

export default async function ImportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-shopify');

  const importRecord = await prisma.import.findFirst({
    where: {
      id: params.id,
      storeId: store.id,
    },
    include: {
      items: {
        orderBy: { rowNumber: 'asc' },
        include: {
          matchedProduct: { select: { id: true, title: true } },
          matchedVariant: { select: { id: true, title: true, sku: true, availableStock: true } },
        },
      },
    },
  });

  if (!importRecord) redirect('/imports');

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    DONE: 'bg-green-100 text-green-800',
    ERROR: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<string, string> = {
    PENDING: 'Pendente',
    PROCESSING: 'Processando',
    DONE: 'Concluído',
    ERROR: 'Erro',
  };

  const matchStatusColors: Record<string, string> = {
    MATCHED: 'bg-green-100 text-green-800',
    AMBIGUOUS: 'bg-yellow-100 text-yellow-800',
    UNMATCHED: 'bg-red-100 text-red-800',
  };

  const matched = importRecord.items.filter((i) => i.matchStatus === 'MATCHED').length;
  const unmatched = importRecord.items.filter((i) => i.matchStatus === 'UNMATCHED').length;
  const ambiguous = importRecord.items.filter((i) => i.matchStatus === 'AMBIGUOUS').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/imports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Detalhes da Importação</h1>
        <p className="text-sm text-muted-foreground mt-1">{importRecord.fileName}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Data</p>
          <p className="text-sm font-medium text-foreground mt-1">
            {new Date(importRecord.createdAt).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${statusColors[importRecord.status]}`}>
            {statusLabels[importRecord.status]}
          </span>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-sm font-medium text-foreground mt-1">{importRecord.totalRows} itens</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Matched</p>
          <p className="text-sm font-medium text-green-600 mt-1">{matched}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Não encontrados</p>
          <p className="text-sm font-medium text-red-600 mt-1">{unmatched + ambiguous}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Produto (planilha)</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Produto (Shopify)</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Variante</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Qtd</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Custo Unit.</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {importRecord.items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-sm text-muted-foreground">{item.rowNumber}</td>
                <td className="px-4 py-3 text-sm text-foreground">{item.rawTitle}</td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {item.matchedProduct?.title ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {item.matchedVariant?.title ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-foreground text-right">{item.quantity}</td>
                <td className="px-4 py-3 text-sm text-foreground text-right">
                  R$ {Number(item.unitCost).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${matchStatusColors[item.matchStatus]}`}>
                    {item.matchStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
