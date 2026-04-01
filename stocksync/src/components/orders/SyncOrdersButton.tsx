'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface SyncState {
  phase: string;
  message: string;
  progress?: number;
  total?: number;
}

export function SyncOrdersButton() {
  const [syncing, setSyncing] = useState(false);
  const [state, setState] = useState<SyncState | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setState({ phase: 'orders', message: 'Conectando à Shopify...' });

    try {
      const res = await fetch('/api/orders/sync', { method: 'POST' });

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
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, '').trim();
          if (!dataLine) continue;

          try {
            const data = JSON.parse(dataLine);

            if (data.phase === 'error') {
              throw new Error(data.message);
            }

            if (data.phase === 'complete') {
              toast.success(
                `${data.imported} pedido${data.imported !== 1 ? 's' : ''} sincronizado${data.imported !== 1 ? 's' : ''}. Velocity calculada!`
              );
              router.refresh();
            } else {
              setState({
                phase: data.phase,
                message: data.message,
                progress: data.progress,
                total: data.total,
              });
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Stream não disponível') throw e;
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar pedidos');
    } finally {
      setSyncing(false);
      setState(null);
    }
  }

  const progressPct =
    state?.progress != null && state?.total
      ? Math.round((state.progress / state.total) * 100)
      : null;

  return (
    <div className="flex items-center gap-3">
      {syncing && state && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{state.message}</span>
          {progressPct !== null && (
            <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Sincronizando…' : 'Sincronizar Pedidos'}
      </Button>
    </div>
  );
}
