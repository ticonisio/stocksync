import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { requireActiveSubscription } from '@/lib/require-subscription';

export default async function ImportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-store');
  await requireActiveSubscription(store.id);

  const imports = await prisma.import.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas importações de planilhas de produtos
          </p>
        </div>
        <Link
          href="/imports/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Importação
        </Link>
      </div>

      {imports.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Nenhuma importação realizada
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Importe sua primeira planilha para atualizar o estoque.
          </p>
          <Link
            href="/imports/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova Importação
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Data</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Arquivo</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total Itens</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Matched</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {new Date(imp.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{imp.fileName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[imp.status]}`}>
                      {statusLabels[imp.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground text-right">{imp.totalRows}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right">{imp.matchedRows}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/imports/${imp.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
