'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Check,
  ChevronRight,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'review' | 'confirming';

interface ParsedData {
  headers: string[];
  rows: string[][];
  fileName: string;
}

interface ColumnMapping {
  title: number | null;
  sku: number | null;
  quantity: number | null;
  unitCost: number | null;
}

interface MatchCandidate {
  id: string;
  title: string;
  variants: { id: string; title: string; sku: string | null; availableStock: number }[];
}

interface MatchResult {
  rawTitle: string;
  rawSku?: string;
  matchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
  candidates: MatchCandidate[];
  matchedProductId: string | null;
  matchedVariantId: string | null;
}

interface ReviewItem {
  rowIndex: number;
  rawTitle: string;
  rawSku?: string;
  quantity: number;
  unitCost: number;
  matchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
  candidates: MatchCandidate[];
  selectedProductId: string | null;
  selectedVariantId: string | null;
  ignored: boolean;
}

// ─── Component ───────────────────────────────────────────────

export default function NewImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    title: null,
    sku: null,
    quantity: null,
    unitCost: null,
  });
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ─── Step 1: Upload & Parse ──────────────────────────────

  const parseFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        complete: (result) => {
          const data = result.data as string[][];
          if (data.length < 2) {
            toast.error('Arquivo vazio ou sem dados suficientes');
            return;
          }
          setParsedData({
            headers: data[0],
            rows: data.slice(1).filter((row) => row.some((cell) => cell?.trim())),
            fileName: file.name,
          });
          setStep('mapping');
        },
        error: () => {
          toast.error('Erro ao ler arquivo CSV');
        },
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
          if (data.length < 2) {
            toast.error('Arquivo vazio ou sem dados suficientes');
            return;
          }
          setParsedData({
            headers: (data[0] as string[]).map(String),
            rows: data.slice(1).filter((row) => row.some((cell) => cell != null && String(cell).trim())),
            fileName: file.name,
          });
          setStep('mapping');
        } catch {
          toast.error('Erro ao ler arquivo Excel');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast.error('Formato não suportado. Use CSV, XLSX ou XLS.');
    }
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  // ─── Step 2: Column Mapping ──────────────────────────────

  const isMappingValid =
    mapping.title !== null &&
    mapping.quantity !== null &&
    mapping.unitCost !== null;

  const getMappedPreview = () => {
    if (!parsedData || !isMappingValid) return [];
    return parsedData.rows.slice(0, 5).map((row) => ({
      title: mapping.title !== null ? row[mapping.title] ?? '' : '',
      sku: mapping.sku !== null ? row[mapping.sku] ?? '' : '',
      quantity: mapping.quantity !== null ? row[mapping.quantity] ?? '' : '',
      unitCost: mapping.unitCost !== null ? row[mapping.unitCost] ?? '' : '',
    }));
  };

  // ─── Step 3: Matching ────────────────────────────────────

  const runMatching = async () => {
    if (!parsedData || !isMappingValid) return;

    setIsMatching(true);
    try {
      const items = parsedData.rows.map((row) => ({
        rawTitle: mapping.title !== null ? String(row[mapping.title] ?? '').trim() : '',
        rawSku: mapping.sku !== null ? String(row[mapping.sku] ?? '').trim() || undefined : undefined,
      })).filter((i) => i.rawTitle.length > 0);

      const res = await fetch('/api/imports/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        toast.error('Erro ao buscar correspondências');
        setIsMatching(false);
        return;
      }

      const { results } = (await res.json()) as { results: MatchResult[] };

      const review: ReviewItem[] = results.map((r, idx) => ({
        rowIndex: idx,
        rawTitle: r.rawTitle,
        rawSku: r.rawSku,
        quantity: parseFloat(String(parsedData.rows[idx]?.[mapping.quantity!] ?? '0')) || 0,
        unitCost: parseFloat(
          String(parsedData.rows[idx]?.[mapping.unitCost!] ?? '0').replace(',', '.')
        ) || 0,
        matchStatus: r.matchStatus,
        candidates: r.candidates,
        selectedProductId: r.matchedProductId,
        selectedVariantId: r.matchedVariantId,
        ignored: r.matchStatus === 'UNMATCHED',
      }));

      setReviewItems(review);
      setStep('review');
    } catch {
      toast.error('Erro ao processar matching');
    } finally {
      setIsMatching(false);
    }
  };

  // ─── Step 4: Confirm Import ──────────────────────────────

  const canConfirm = reviewItems.every(
    (item) =>
      item.ignored ||
      item.matchStatus === 'UNMATCHED' ||
      (item.selectedProductId && item.selectedVariantId)
  );

  const confirmImport = async () => {
    setIsConfirming(true);
    try {
      const itemsToSend = reviewItems.map((item) => ({
        rawTitle: item.rawTitle,
        rawSku: item.rawSku,
        quantity: item.quantity,
        unitCost: item.unitCost,
        matchedProductId: item.ignored ? null : item.selectedProductId,
        matchedVariantId: item.ignored ? null : item.selectedVariantId,
        matchStatus: item.ignored ? 'UNMATCHED' : item.matchStatus,
      }));

      const res = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: parsedData!.fileName,
          items: itemsToSend,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erro ao confirmar importação');
        setIsConfirming(false);
        return;
      }

      const { importId } = await res.json();
      toast.success('Importação concluída com sucesso!');
      router.push(`/imports/${importId}`);
    } catch {
      toast.error('Erro ao confirmar importação');
      setIsConfirming(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────

  const handleResolveAmbiguous = (rowIndex: number, productId: string, variantId: string) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.rowIndex === rowIndex
          ? { ...item, selectedProductId: productId, selectedVariantId: variantId, matchStatus: 'MATCHED' }
          : item
      )
    );
  };

  const handleSelectVariant = (rowIndex: number, variantId: string) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.rowIndex === rowIndex
          ? { ...item, selectedVariantId: variantId }
          : item
      )
    );
  };

  const handleToggleIgnore = (rowIndex: number) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.rowIndex === rowIndex ? { ...item, ignored: !item.ignored } : item
      )
    );
  };

  const matchedCount = reviewItems.filter((i) => i.matchStatus === 'MATCHED' && !i.ignored).length;
  const ambiguousCount = reviewItems.filter((i) => i.matchStatus === 'AMBIGUOUS' && !i.ignored).length;
  const unmatchedCount = reviewItems.filter((i) => i.matchStatus === 'UNMATCHED' || i.ignored).length;

  // ─── Steps indicator ────────────────────────────────────

  const steps = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Mapeamento' },
    { key: 'review', label: 'Revisão' },
    { key: 'confirming', label: 'Confirmação' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link
          href="/imports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Nova Importação</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium ${
                i < currentStepIndex
                  ? 'bg-green-500 text-white'
                  : i === currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < currentStepIndex ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-sm ${
                i === currentStepIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ─── Step 1: Upload ──────────────────────────────── */}
      {step === 'upload' && (
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
        >
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Arraste sua planilha aqui
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Formatos aceitos: CSV, XLSX, XLS
          </p>
          <label className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
            <FileSpreadsheet className="h-4 w-4" />
            Selecionar arquivo
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}

      {/* ─── Step 2: Column Mapping ──────────────────────── */}
      {step === 'mapping' && parsedData && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <h3 className="text-lg font-medium text-foreground">Mapeamento de Colunas</h3>
            <p className="text-sm text-muted-foreground">
              Selecione qual coluna da planilha corresponde a cada campo.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'title' as const, label: 'Título do Produto', required: true },
                { key: 'sku' as const, label: 'SKU', required: false },
                { key: 'quantity' as const, label: 'Quantidade', required: true },
                { key: 'unitCost' as const, label: 'Custo Unitário', required: true },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value === '' ? null : parseInt(e.target.value),
                      }))
                    }
                  >
                    <option value="">Selecionar coluna...</option>
                    {parsedData.headers.map((header, i) => (
                      <option key={i} value={i}>
                        {header || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {isMappingValid && (
            <div className="rounded-lg border border-border p-6 space-y-4">
              <h3 className="text-sm font-medium text-foreground">Preview (primeiras 5 linhas)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-muted-foreground">Título</th>
                      <th className="px-3 py-2 text-left text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Qtd</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getMappedPreview().map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-foreground">{row.title}</td>
                        <td className="px-3 py-2 text-foreground">{row.sku || '—'}</td>
                        <td className="px-3 py-2 text-foreground text-right">{row.quantity}</td>
                        <td className="px-3 py-2 text-foreground text-right">{row.unitCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              disabled={!isMappingValid || isMatching}
              onClick={runMatching}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMatching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando correspondências...
                </>
              ) : (
                <>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Review ──────────────────────────────── */}
      {step === 'review' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{matchedCount}</p>
              <p className="text-sm text-green-600">Matched</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{ambiguousCount}</p>
              <p className="text-sm text-yellow-600">Ambíguos</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{unmatchedCount}</p>
              <p className="text-sm text-red-600">Não encontrados</p>
            </div>
          </div>

          {/* Items list */}
          <div className="rounded-lg border border-border divide-y divide-border">
            {reviewItems.map((item) => (
              <div
                key={item.rowIndex}
                className={`p-4 space-y-2 ${item.ignored ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.matchStatus === 'MATCHED'
                            ? 'bg-green-100 text-green-800'
                            : item.matchStatus === 'AMBIGUOUS'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {item.matchStatus}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.rawTitle}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Qtd: {item.quantity} | Custo: R$ {item.unitCost.toFixed(2)}
                      {item.rawSku && ` | SKU: ${item.rawSku}`}
                    </p>
                  </div>

                  {/* Ignore toggle for UNMATCHED */}
                  {(item.matchStatus === 'UNMATCHED' || item.matchStatus === 'AMBIGUOUS') && (
                    <button
                      onClick={() => handleToggleIgnore(item.rowIndex)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {item.ignored ? (
                        <>
                          <X className="h-3 w-3" />
                          Ignorado
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3 w-3" />
                          Ignorar
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* MATCHED: show product info */}
                {item.matchStatus === 'MATCHED' && item.candidates[0] && (
                  <div className="ml-4 text-sm text-muted-foreground">
                    <span className="text-foreground">{item.candidates[0].title}</span>
                    {item.candidates[0].variants.length > 1 && (
                      <select
                        className="ml-2 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                        value={item.selectedVariantId ?? ''}
                        onChange={(e) => handleSelectVariant(item.rowIndex, e.target.value)}
                      >
                        {item.candidates[0].variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title} (estoque: {v.availableStock})
                          </option>
                        ))}
                      </select>
                    )}
                    {item.candidates[0].variants.length === 1 && (
                      <span className="text-xs ml-2">
                        (estoque: {item.candidates[0].variants[0].availableStock})
                      </span>
                    )}
                  </div>
                )}

                {/* AMBIGUOUS: dropdown to select product */}
                {item.matchStatus === 'AMBIGUOUS' && !item.ignored && (
                  <div className="ml-4">
                    <select
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                      value={
                        item.selectedProductId
                          ? `${item.selectedProductId}|${item.selectedVariantId}`
                          : ''
                      }
                      onChange={(e) => {
                        const [productId, variantId] = e.target.value.split('|');
                        if (productId && variantId) {
                          handleResolveAmbiguous(item.rowIndex, productId, variantId);
                        }
                      }}
                    >
                      <option value="">Selecionar produto correto...</option>
                      {item.candidates.map((c) =>
                        c.variants.map((v) => (
                          <option key={`${c.id}|${v.id}`} value={`${c.id}|${v.id}`}>
                            {c.title} — {v.title}
                            {v.sku ? ` (${v.sku})` : ''} — estoque: {v.availableStock}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('mapping')}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <button
              disabled={!canConfirm || isConfirming}
              onClick={confirmImport}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Confirmar Importação
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
