export function normalizeStatus(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function hasStatus(value: string | null | undefined, ...candidates: string[]) {
  const normalized = normalizeStatus(value);
  return candidates.some((candidate) => normalizeStatus(candidate) === normalized);
}

export function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

export function startOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

export function startOfMonth(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function isWithinRange(value: string | Date | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  const time = date.getTime();
  return !Number.isNaN(time) && time >= start.getTime() && time <= end.getTime();
}
