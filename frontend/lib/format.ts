export function toXlm(stroops: string | number | bigint): string {
  const val = Number(stroops) / 10_000_000;
  // Use a small epsilon to handle floating point precision issues for .005
  return (Math.round((val + 0.00000001) * 100) / 100).toFixed(2);
}
