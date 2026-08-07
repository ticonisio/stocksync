'use client';

import { useState } from 'react';
import { Database, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type HistoryPeriod = '30d' | '90d' | '365d' | 'all';
type SyncMode = 'incremental' | 'history';

interface SyncState {
  phase: string;
  message: string;
  progress?: number;
  total?: number;
}

interface SyncOrdersButtonProps {
  lastOrderSyncAt?: string | null;
}

const lastSyncFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function SyncOrdersButton({ lastOrderSyncAt }: SyncOrdersButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode | null>(null);
  const [state, setState] = useState<SyncState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [period, setPeriod] = useState<HistoryPeriod>('90d');
  const router = useRouter();

  async function handleSync(mode: SyncMode, selectedPeriod: HistoryPeriod = '90d') {
    setSyncing(true);
    setSyncMode(mode);
    setState({
      phase: 'orders',
      message: mode === 'history' ? 'Preparando importação...' : 'Conectando à Shopify...',
    });

    try {
      const res = await fetch('/api/orders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, period: selectedPeriod }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream não disponível');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const dataLine = event.replace(/^data: /, '').trim();
          if (!dataLine) continue;

          const data = JSON.parse(dataLine) as {
            phase: string;
            message?: string;
            imported?: number;
            skipped?: number;
            progress?: number;
            total?: number;
          };

          if (data.phase === 'error') {
            throw new Error(data.message ?? 'Erro ao importar pedidos');
          }

          if (data.phase === 'complete') {
            const processed = data.imported ?? 0;
            const skipped = data.skipped ?? 0;
            const detail = skipped > 0 ? ` ${skipped} sem produtos correspondentes.` : '';
            toast.success(
              mode === 'history'
                ? `${processed} pedido${processed !== 1 ? 's' : ''} processado${processed !== 1 ? 's' : ''}. Insights atualizados.${detail}`
                : `${processed} pedido${processed !== 1 ? 's' : ''} atualizado${processed !== 1 ? 's' : ''}. Insights recalculados.${detail}`
            );
            setDialogOpen(false);
            router.refresh();
          } else {
            setState({
              phase: data.phase,
              message: data.message ?? 'Processando...',
              progress: data.progress,
              total: data.total,
            });
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar pedidos');
    } finally {
      setSyncing(false);
      setSyncMode(null);
      setState(null);
    }
  }

  const progressPct =
    state?.progress != null && state?.total
      ? Math.round((state.progress / state.total) * 100)
      : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {lastOrderSyncAt && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync('incremental')}
            disabled={syncing}
          >
            <RefreshCw
              className={`mr-1 h-4 w-4 ${syncing && syncMode === 'incremental' ? 'animate-spin' : ''}`}
            />
            Buscar novos
          </Button>
        )}

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!syncing) setDialogOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={syncing}>
              <Database
                className={`mr-1 h-4 w-4 ${syncing && syncMode === 'history' ? 'animate-pulse' : ''}`}
              />
              Importar histórico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar histórico de pedidos</DialogTitle>
              <DialogDescription>
                O StockSync buscará os pedidos antigos diretamente da Shopify e usará as vendas
                pagas para calcular giro, cobertura de estoque e sugestões de reposição.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="history-period">Período do histórico</Label>
                <Select
                  value={period}
                  onValueChange={(value) => setPeriod(value as HistoryPeriod)}
                  disabled={syncing}
                >
                  <SelectTrigger id="history-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias — recomendado</SelectItem>
                    <SelectItem value="365d">Últimos 12 meses</SelectItem>
                    <SelectItem value="all">Todo o histórico disponível</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Os insights de velocidade consideram janelas de 7, 30 e 90 dias.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p>Pedidos já importados são atualizados, sem criar duplicidades.</p>
                </div>
                <div className="flex gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p>O estoque atual não será alterado; apenas o histórico e os insights.</p>
                </div>
              </div>

              {syncing && syncMode === 'history' && state && (
                <div className="space-y-2" aria-live="polite">
                  <p className="text-sm text-muted-foreground">{state.message}</p>
                  {progressPct !== null && (
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={syncing}
              >
                Cancelar
              </Button>
              <Button onClick={() => handleSync('history', period)} disabled={syncing}>
                {syncing && syncMode === 'history' ? 'Importando...' : 'Importar e gerar insights'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {syncing && syncMode === 'incremental' && state && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {state.message}
        </p>
      )}

      {lastOrderSyncAt && !syncing && (
        <p className="text-xs text-muted-foreground">
          Última atualização: {lastSyncFormatter.format(new Date(lastOrderSyncAt))}
        </p>
      )}
    </div>
  );
}
