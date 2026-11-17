export function fmt(value: unknown): string {
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
