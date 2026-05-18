import { format } from 'date-fns';

export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatCurrencyPrecise(value?: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatPercent(value?: number | null) {
  return `${(value ?? 0).toFixed(1)}%`;
}

export function formatFinanceDate(value?: string | Date | null, pattern = 'MMM d, yyyy') {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return format(date, pattern);
}

export function titleize(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}
