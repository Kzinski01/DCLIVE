import { serviceOrigin } from './service';

export const CLOUD_PEER_OPTIONS = { host: '0.peerjs.com', port: 443, path: '/', secure: true, key: 'peerjs', debug: 0 } as const;
export const FREE_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
export const FREE_SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000;
export const FREE_SESSION_ID_PATTERN = /^[a-f0-9]{36}$/;

export type WatchSession = { id: string; publicKey?: string; expiresAt?: number; accessVersion?: 1 };
export type VerifiedWatchSession = WatchSession & { publicKey: string; expiresAt: number };

export function playerBaseUrl(value: string, allowLocal = false): string {
  const url = new URL(value);
  serviceOrigin(url.origin, allowLocal);
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('A URL do player deve terminar em /, sem parâmetros.');
  if (!allowLocal && !/^[a-z\d](?:[a-z\d-]*[a-z\d])?\.github\.io$/i.test(url.hostname)) throw new Error('O modo gratuito exige a URL HTTPS real do GitHub Pages.');
  if (/\/\.\.?\//.test(value) || !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(url.pathname)) throw new Error('Caminho do player inválido.');
  return url.href;
}

export function freeWatchUrl(base: string, session: VerifiedWatchSession): string {
  const url = new URL(base);
  url.searchParams.set('watch', session.id);
  url.searchParams.set('expires', String(session.expiresAt));
  url.hash = new URLSearchParams({ key: session.publicKey, ...(session.accessVersion === 1 ? { access: '1' } : {}) }).toString();
  return url.href;
}

export function parseWatchSession(url: URL): WatchSession | null {
  const watch = url.searchParams.get('watch');
  if (!watch) return null;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const publicKey = fragment.get('key') ?? '';
  const expiresAt = Number(url.searchParams.get('expires'));
  const access = fragment.get('access');
  if (url.searchParams.getAll('watch').length !== 1 || url.searchParams.getAll('expires').length !== 1 || fragment.getAll('key').length !== 1
    || !FREE_SESSION_ID_PATTERN.test(watch) || !/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !Number.isSafeInteger(expiresAt) || expiresAt <= 0
    || expiresAt > Date.now() + FREE_SESSION_LIFETIME_MS + 60000 || fragment.getAll('access').length > 1 || access !== null && access !== '1') {
    throw new Error('O link da transmissão é inválido ou está incompleto.');
  }
  return { id: watch, publicKey, expiresAt, ...(access === '1' ? { accessVersion: 1 as const } : {}) };
}

export function freeDeployment(base: string | null) {
  return { version: 2, provider: 'peerjs-cloud', playerBaseUrl: base, media: 'webrtc-p2p', turn: false, passwordAccess: 1 };
}
