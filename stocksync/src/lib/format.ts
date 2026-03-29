const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—';
  return brlFormatter.format(value);
}
