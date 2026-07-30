export function toCents(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.round(num * 100);
}

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}
