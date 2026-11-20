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

export function cls(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ');
}

export function formatPercent(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(digits).replace('.', ',')}%`;
}
