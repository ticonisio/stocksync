'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface LeadTimeGroup {
  id: string;
  name: string;
  leadTimeDays: number;
  bufferDays: number | null;
  productCount: number;
}

interface Product {
  id: string;
  title: string;
  leadTimeOverride: number | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function computeBuffer(leadTimeDays: number, bufferDays: number | null): number {
  return bufferDays ?? Math.max(7, Math.round(leadTimeDays * 0.15));
}

// ── Group Form Dialog ──────────────────────────────────────────────────────────

interface GroupFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: LeadTimeGroup | null;
}

function GroupFormDialog({ open, onClose, onSaved, initial }: GroupFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(String(initial?.leadTimeDays ?? ''));
  const [bufferDays, setBufferDays] = useState(
    initial?.bufferDays != null ? String(initial.bufferDays) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initial;

  async function handleSave() {
    setError('');
    const days = parseInt(leadTimeDays, 10);
    if (!name.trim() || isNaN(days) || days < 1) {
      setError('Nome e prazo em dias são obrigatórios.');
      return;
    }

    const buffer = bufferDays.trim() === '' ? null : parseInt(bufferDays, 10);
    if (buffer !== null && (isNaN(buffer) || buffer < 0)) {
      setError('Buffer deve ser um número positivo ou vazio (automático).');
      return;
    }

    setSaving(true);
    try {
      const url = isEdit ? `/api/lead-time-groups/${initial!.id}` : '/api/lead-time-groups';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), leadTimeDays: days, bufferDays: buffer }),
      });
      if (!res.ok) throw new Error('Falha ao salvar grupo');
      onSaved();
      onClose();
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Grupo' : 'Novo Grupo de Lead Time'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fornecedor China"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lead-time-days">Prazo de entrega (dias)</Label>
            <Input
              id="lead-time-days"
              type="number"
              min={1}
              max={365}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              placeholder="Ex: 30"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="buffer-days">
              Buffer de alerta (dias){' '}
              <span className="text-xs text-muted-foreground">— vazio = automático</span>
            </Label>
            <Input
              id="buffer-days"
              type="number"
              min={0}
              max={90}
              value={bufferDays}
              onChange={(e) => setBufferDays(e.target.value)}
              placeholder={
                leadTimeDays
                  ? `Auto: ${computeBuffer(parseInt(leadTimeDays, 10) || 0, null)} dias`
                  : 'Auto'
              }
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Products Dialog ────────────────────────────────────────────────────────────

interface ProductsDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  group: LeadTimeGroup;
}

interface ProductAssignment {
  productId: string;
  leadTimeOverride: number | null;
}

function ProductsDialog({ open, onClose, onSaved, group }: ProductsDialogProps) {
  const { data: inventoryData } = useSWR<{ products: Product[] }>(
    open ? '/api/inventory?limit=9999' : null,
    fetcher
  );
  const { data: groupData } = useSWR<{ group: { products: { productId: string }[] } }>(
    open ? `/api/lead-time-groups/${group.id}` : null,
    fetcher
  );

  const allProducts: Product[] = inventoryData?.products ?? [];
  const assignedIds = new Set((groupData?.group?.products ?? []).map((p) => p.productId));

  const [selected, setSelected] = useState<Map<string, ProductAssignment>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Initialize selections from loaded data
  const initializedRef = { current: false };
  if (!initializedRef.current && groupData && allProducts.length > 0 && selected.size === 0 && assignedIds.size > 0) {
    const init = new Map<string, ProductAssignment>();
    for (const p of allProducts) {
      if (assignedIds.has(p.id)) {
        init.set(p.id, { productId: p.id, leadTimeOverride: p.leadTimeOverride });
      }
    }
    setSelected(init);
    initializedRef.current = true;
  }

  // Filter products by search
  const filteredProducts = search.trim()
    ? allProducts.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : allProducts;

  function toggleProduct(product: Product) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, {
          productId: product.id,
          leadTimeOverride: product.leadTimeOverride,
        });
      }
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of filteredProducts) {
        if (!next.has(p.id)) {
          next.set(p.id, { productId: p.id, leadTimeOverride: p.leadTimeOverride });
        }
      }
      return next;
    });
  }

  function deselectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of filteredProducts) {
        next.delete(p.id);
      }
      return next;
    });
  }

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selected.has(p.id));

  function setOverride(productId: string, value: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const entry = next.get(productId);
      if (entry) {
        const days = value.trim() === '' ? null : parseInt(value, 10);
        next.set(productId, {
          ...entry,
          leadTimeOverride: days !== null && !isNaN(days) ? days : null,
        });
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lead-time-groups/${group.id}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: Array.from(selected.values()) }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      onSaved();
      onClose();
    } catch {
      // error handled silently — button re-enables
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar Produtos — {group.name}</DialogTitle>
        </DialogHeader>
        {/* Search + Select All */}
        <div className="space-y-2">
          <Input
            placeholder="Buscar produto por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-foreground"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selected.size} de {allProducts.length} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={allFilteredSelected ? deselectAll : selectAll}
            >
              {allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              {search.trim() ? ' (filtrados)' : ''}
            </Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2 py-2">
          {allProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Carregando produtos...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado para &quot;{search}&quot;.</p>
          ) : (
            filteredProducts.map((product) => {
              const isChecked = selected.has(product.id);
              const assignment = selected.get(product.id);
              return (
                <div key={product.id} className="flex items-center gap-3 py-1">
                  <Checkbox
                    id={`prod-${product.id}`}
                    checked={isChecked}
                    onCheckedChange={() => toggleProduct(product)}
                  />
                  <label
                    htmlFor={`prod-${product.id}`}
                    className="flex-1 text-sm cursor-pointer truncate text-foreground"
                  >
                    {product.title}
                  </label>
                  {isChecked && (
                    <Input
                      type="number"
                      min={1}
                      className="w-24 h-7 text-xs"
                      placeholder={`${group.leadTimeDays}d`}
                      value={assignment?.leadTimeOverride ?? ''}
                      onChange={(e) => setOverride(product.id, e.target.value)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function LeadTimeGroupsManager() {
  const { data, mutate } = useSWR<{ groups: LeadTimeGroup[] }>('/api/lead-time-groups', fetcher);
  const groups = data?.groups ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<LeadTimeGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<LeadTimeGroup | null>(null);
  const [productsGroup, setProductsGroup] = useState<LeadTimeGroup | null>(null);

  async function handleDelete(group: LeadTimeGroup) {
    await fetch(`/api/lead-time-groups/${group.id}`, { method: 'DELETE' });
    mutate();
    setDeleteGroup(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Grupos de Lead Time</CardTitle>
            <CardDescription>
              Configure prazos de entrega por fornecedor e associe produtos para cálculo de urgência de recompra.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditGroup(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Novo grupo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum grupo configurado. Crie um grupo para ativar a aba &quot;Tempo de Entrega&quot;.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="space-y-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{group.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {group.leadTimeDays} dias
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Buffer: {computeBuffer(group.leadTimeDays, group.bufferDays)} dias
                      {group.bufferDays === null ? ' (auto)' : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.productCount} produto{group.productCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setProductsGroup(group)}
                    title="Gerenciar produtos"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => { setEditGroup(group); setFormOpen(true); }}
                    title="Editar grupo"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteGroup(group)}
                    title="Deletar grupo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <GroupFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditGroup(null); }}
        onSaved={() => mutate()}
        initial={editGroup}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteGroup} onOpenChange={(v) => !v && setDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo &quot;{deleteGroup?.name}&quot; será removido e todos os produtos serão desassociados.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroup && handleDelete(deleteGroup)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Products Management Dialog */}
      {productsGroup && (
        <ProductsDialog
          open={!!productsGroup}
          onClose={() => setProductsGroup(null)}
          onSaved={() => mutate()}
          group={productsGroup}
        />
      )}
    </Card>
  );
}
