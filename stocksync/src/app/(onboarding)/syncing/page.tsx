'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

type SyncStatus = 'PENDING' | 'SYNCING' | 'COMPLETE' | 'ERROR';

type SyncBatchResponse = {
  status: 'syncing' | 'complete' | 'error';
  syncDone: number;
  syncTotal: number | null;
  hasMore: boolean;
  error?: string;
};

const MAX_POLL_TIME_MS = 30 * 60 * 1000; // 30 minutes (batched sync takes longer but is more reliable)

export default function SyncingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>('PENDING');
  const [syncDone, setSyncDone] = useState(0);
  const [syncTotal, setSyncTotal] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(0);
  const startTimeRef = useRef(Date.now());
  const lastProgressRef = useRef({ syncDone: 0, at: Date.now() });
  const isSyncingRef = useRef(false);

  const runBatchLoop = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    setHasError(false);
    setErrorMessage(null);
    setStatus('SYNCING');
    setSyncDone(0);
    setSyncTotal(null);
    setBatchCount(0);
    startTimeRef.current = Date.now();
    lastProgressRef.current = { syncDone: 0, at: Date.now() };

    try {
      let hasMore = true;

      let retries = 0;
      const MAX_RETRIES = 2;

      while (hasMore) {
        // Timeout check
        if (Date.now() - startTimeRef.current > MAX_POLL_TIME_MS) {
          setHasError(true);
          setStatus('ERROR');
          setErrorMessage('Sincronização excedeu o tempo limite. Tente novamente.');
          break;
        }

        let res: Response;
        try {
          res = await fetch('/api/shopify/sync', { method: 'POST' });
        } catch {
          // Network error or timeout — retry up to MAX_RETRIES
          retries++;
          if (retries > MAX_RETRIES) {
            setHasError(true);
            setStatus('ERROR');
            setErrorMessage(`Erro de rede após ${MAX_RETRIES} tentativas. O progresso foi salvo — clique para continuar.`);
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setHasError(true);
          setStatus('ERROR');
          setErrorMessage(`Erro do servidor (HTTP ${res.status}): ${text.slice(0, 200)}`);
          break;
        }

        const data: SyncBatchResponse = await res.json();
        retries = 0; // Reset retries on success

        setSyncDone(data.syncDone);
        if (data.syncTotal != null) setSyncTotal(data.syncTotal);
        setBatchCount((prev) => prev + 1);
        lastProgressRef.current = { syncDone: data.syncDone, at: Date.now() };

        if (data.status === 'error') {
          setHasError(true);
          setStatus('ERROR');
          setErrorMessage(data.error ?? 'Erro desconhecido durante sincronização.');
          break;
        }

        if (data.status === 'complete') {
          setStatus('COMPLETE');
          hasMore = false;
        } else {
          hasMore = data.hasMore;
          // Yield to React to render the updated count before next batch
          if (hasMore) await new Promise((r) => setTimeout(r, 100));
        }
      }
    } catch (err) {
      setHasError(true);
      setStatus('ERROR');
      setErrorMessage(`Erro inesperado: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    runBatchLoop();
  }, [runBatchLoop]);

  useEffect(() => {
    if (status === 'COMPLETE') {
      const timer = setTimeout(() => router.push('/dashboard'), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  const progressPercent = syncTotal && syncTotal > 0 ? Math.min(Math.round((syncDone / syncTotal) * 100), 100) : null;

  const progressText =
    syncDone > 0
      ? syncTotal
        ? `${syncDone} de ${syncTotal} produtos sincronizados`
        : `${syncDone} produto${syncDone !== 1 ? 's' : ''} sincronizado${syncDone !== 1 ? 's' : ''}`
      : 'Iniciando sincronização...';

  const isTokenError = errorMessage?.includes('Token inválido') || errorMessage?.includes('401') || errorMessage?.includes('403');

  if (status === 'COMPLETE') {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <span className="text-green-500 text-xl">✓</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Sincronização completa!</h1>
        <p className="text-muted-foreground">
          {syncDone} produto{syncDone !== 1 ? 's' : ''} importado{syncDone !== 1 ? 's' : ''}. Redirecionando...
        </p>
      </div>
    );
  }

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
          {isTokenError
            ? 'O token de acesso da Shopify é inválido ou expirou. Gere um novo token permanente na sua Custom App e reconecte.'
            : errorMessage ?? 'Não foi possível importar seus dados da Shopify. Verifique sua conexão e tente novamente.'}
        </p>
        {syncDone > 0 && (
          <p className="text-sm text-muted-foreground">
            {syncDone} produto{syncDone !== 1 ? 's' : ''} já sincronizado{syncDone !== 1 ? 's' : ''} antes do erro.
          </p>
        )}
        <div className="flex flex-col gap-2 items-center">
          {isTokenError ? (
            <a
              href="/connect-store"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Reconectar loja
            </a>
          ) : (
            <button
              onClick={runBatchLoop}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {syncDone > 0 ? 'Continuar sincronização' : 'Tentar novamente'}
            </button>
          )}
        </div>
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
        Estamos importando seus produtos, variantes e coleções da Shopify.
        {batchCount > 0 ? ' Cada lote é salvo automaticamente.' : ''}
      </p>
      <p className="text-sm text-muted-foreground">{progressText}</p>
      {progressPercent != null && (
        <div className="w-full max-w-xs mx-auto space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{progressPercent}%</p>
        </div>
      )}
    </div>
  );
}
