/** 指数バックオフ（フルジッター）。attempt は0始まり */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 30_000, random: () => number = Math.random): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(cap / 2 + random() * (cap / 2));
}

/** 並列数を制限して map する（Gmail API のクォータ消費を平準化） */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
