/** The slice of `fetch` the feed uses; narrow so tests can stub it. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
