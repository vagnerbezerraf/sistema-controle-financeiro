export function formatCurrency(value: string | number, currency = 'BRL', locale = 'pt-BR') {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '-';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(iso: string, locale = 'pt-BR') {
  if (!iso) return '-';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(locale);
}

export function formatDateTime(iso: string, locale = 'pt-BR') {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString(locale);
}

export function formatPercent(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(digits).replace('.', ',')}%`;
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function cls(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ');
}
