export function toXlm(stroops: string | number | bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(2);
}
