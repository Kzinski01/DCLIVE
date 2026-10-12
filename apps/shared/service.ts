export const SERVICE_UNAVAILABLE = 'Não foi possível conectar ao serviço de transmissão.';
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export type ServiceManifest = {
  protocolVersion: 1;
  mode: 'public' | 'development';
  playerOrigin: string;
  signalingUrl: string;
};

export function serviceOrigin(value: string, allowLocal = false): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Informe somente a origem do serviço.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (allowLocal && local && ['http:', 'https:'].includes(url.protocol)) return url.origin;
  const hostname = url.hostname.toLowerCase();
  const reserved = /(^|\.)(example\.(com|net|org)|example|invalid|test|localhost|local|internal|lan)$/;
  if (url.protocol !== 'https:' || local || reserved.test(hostname) || !hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    throw new Error('A origem pública precisa ser um domínio HTTPS real.');
  }
  return url.origin;
}

export function signalingEndpoint(origin: string): string {
  const url = new URL('/ws', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

export function parseServiceManifest(value: unknown, expectedOrigin: string, allowLocal = false): ServiceManifest {
  if (!value || typeof value !== 'object') throw new Error(SERVICE_UNAVAILABLE);
  const manifest = value as Partial<ServiceManifest>;
  const origin = serviceOrigin(expectedOrigin, allowLocal);
  const local = new URL(origin).protocol === 'http:' || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  if (manifest.protocolVersion !== 1 || manifest.playerOrigin !== origin || manifest.signalingUrl !== signalingEndpoint(origin)
    || manifest.mode !== (local ? 'development' : 'public')) throw new Error(SERVICE_UNAVAILABLE);
  return manifest as ServiceManifest;
}

export function validateSessionUrl(playerUrl: string, sessionId: string, origin: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId) || playerUrl !== `${origin}/s/${sessionId}`) throw new Error(SERVICE_UNAVAILABLE);
  return playerUrl;
}
