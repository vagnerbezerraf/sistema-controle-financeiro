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
