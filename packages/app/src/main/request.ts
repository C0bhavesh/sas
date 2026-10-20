import type { RequestArgs, RequestResult } from '../shared/bridge';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** Only /api/ paths on the configured server may be requested by the renderer. */
export function buildUrl(serverUrl: string, path: string): string {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('\\') || path.includes('//')) {
    throw new Error(`Blocked request path: ${path}`);
  }
  return serverUrl.replace(/\/+$/, '') + path;
}

export async function performRequest(fetchFn: FetchLike, serverUrl: string, args: RequestArgs): Promise<RequestResult> {
  const url = buildUrl(serverUrl, args.path);
  const headers: Record<string, string> = {};
  if (args.body !== undefined) headers['content-type'] = 'application/json';
  if (args.token) headers.authorization = `Bearer ${args.token}`;
  try {
    const res = await fetchFn(url, {
      method: args.method,
      headers,
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { code: 'BAD_RESPONSE', message: text.slice(0, 200) };
      }
    }
    return { status: res.status, json };
  } catch {
    return {
      status: 0,
      json: { code: 'NETWORK', message: 'Cannot reach the server. Check that it is running and the address is right.' },
    };
  }
}
