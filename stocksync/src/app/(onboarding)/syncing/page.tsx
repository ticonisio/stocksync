'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

type SyncStatus = 'PENDING' | 'SYNCING' | 'COMPLETE' | 'ERROR';

const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MS = 30 * 1000; // 30s without progress = stale

export default function SyncingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>('PENDING');
  const [syncDone, setSyncDone] = useState(0);
  const [syncTotal, setSyncTotal] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const startTimeRef = useRef(Date.now());
  const lastProgressRef = useRef({ syncDone: 0, at: Date.now() });

  const startSync = useCallback(async () => {
    setHasError(false);
    setStatus('SYNCING');
    setSyncDone(0);
    startTimeRef.current = Date.now();
    lastProgressRef.current = { syncDone: 0, at: Date.now() };
    try {
      await fetch('/api/shopify/sync', { method: 'POST' });
    } catch {
      setHasError(true);
      setStatus('ERROR');
    }
  }, []);

  useEffect(() => {
    startSync();
  }, [startSync]);

  useEffect(() => {
    if (status === 'COMPLETE') {
      router.push('/dashboard');
      return;
    }
    if (status === 'ERROR') {
      setHasError(true);
      return;
    }

    const interval = setInterval(async () => {
      // Timeout: stop polling after MAX_POLL_TIME_MS
      if (Date.now() - startTimeRef.current > MAX_POLL_TIME_MS) {
        clearInterval(interval);
        setHasError(true);
        setStatus('ERROR');
        return;
      }

      try {
        const res = await fetch('/api/shopify/sync/status');
        if (!res.ok) return;
        const data = (await res.json()) as {
          syncStatus: SyncStatus;
          syncDone: number | null;
          syncTotal: number | null;
        };

        setStatus(data.syncStatus);
        setSyncDone(data.syncDone ?? 0);
        setSyncTotal(data.syncTotal ?? null);

        // Detect stale sync: status is SYNCING but no progress for 30s
        const currentDone = data.syncDone ?? 0;
        if (currentDone !== lastProgressRef.current.syncDone) {
          lastProgressRef.current = { syncDone: currentDone, at: Date.now() };
        } else if (
          data.syncStatus === 'SYNCING' &&
          Date.now() - lastProgressRef.current.at > STALE_THRESHOLD_MS
        ) {
          clearInterval(interval);
          setHasError(true);
          setStatus('ERROR');
        }
      } catch {
        // network blip — keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status, router]);

  const progressText =
    syncTotal !== null
      ? `${syncDone} de ${syncTotal} produtos sincronizados`
      : `${syncDone} produto${syncDone !== 1 ? 's' : ''} sincronizado${syncDone !== 1 ? 's' : ''}`;

  if (hasError) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-xl">✕</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Erro na sincronização</h1>
        <p className="text-muted-foreground max-w-sm">
          Não foi possível importar seus dados da Shopify. Verifique sua conexão e tente novamente.
        </p>
        <button
          onClick={startSync}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="flex justify-center">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Sincronizando sua loja...</h1>
      <p className="text-muted-foreground max-w-sm">
        Estamos importando seus produtos, variantes e coleções da Shopify. Isso pode levar alguns
        minutos.
      </p>
      {syncDone > 0 && (
        <p className="text-sm text-muted-foreground">{progressText}</p>
      )}
      {syncTotal !== null && syncTotal > 0 && (
        <div className="w-64 mx-auto bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((syncDone / syncTotal) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
