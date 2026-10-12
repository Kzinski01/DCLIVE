import type { SignalData } from '../../shared/signaling';
export type { SignalData } from '../../shared/signaling';

export type CreatedSession = { type: 'created'; sessionId: string; controlToken: string; expiresAt: number; playerUrl: string; iceServers: RTCIceServer[] };

export type ServerMessage =
  | CreatedSession
  | { type: 'viewer-count'; count: number }
  | { type: 'viewer-joined' | 'viewer-left'; peerId: string }
  | { type: 'joined'; peerId: string; iceServers: RTCIceServer[] }
  | { type: 'signal'; peerId: string; data: SignalData }
  | { type: 'session-ended' }
  | { type: 'error'; code: string };

export function signalingUrl(): string {
  return signalingEndpoint(configuredServiceOrigin());
}

export function validateIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  if (!Array.isArray(servers) || servers.length > 10) throw new Error(SERVICE_UNAVAILABLE);
  for (const server of servers) {
    if (!server || typeof server !== 'object') throw new Error(SERVICE_UNAVAILABLE);
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    if (!urls.length || urls.length > 10 || urls.some(url => typeof url !== 'string' || url.length > 2048 || !/^stuns?:[^\s]+$|^turns?:[^\s]+$/.test(url))) throw new Error(SERVICE_UNAVAILABLE);
    if (server.username !== undefined && (typeof server.username !== 'string' || server.username.length > 256)
      || server.credential !== undefined && (typeof server.credential !== 'string' || server.credential.length > 256)) throw new Error(SERVICE_UNAVAILABLE);
  }
  return servers;
}

export function openSocket(url = signalingUrl(), signal?: AbortSignal): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', fail); socket.onopen = null; socket.onerror = null; socket.onclose = null; };
    const fail = () => { cleanup(); socket.close(); reject(new Error(SERVICE_UNAVAILABLE)); };
    const timer = window.setTimeout(fail, 8000);
    socket.onopen = () => { cleanup(); resolve(socket); };
    socket.onerror = fail;
    socket.onclose = fail;
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted) fail();
  });
}

export function createSession(socket: WebSocket, maxViewers: number, signal: AbortSignal): Promise<CreatedSession> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer); socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', fail); signal.removeEventListener('abort', fail);
    };
    const fail = () => { cleanup(); reject(new Error(SERVICE_UNAVAILABLE)); };
    const onMessage = (event: MessageEvent) => {
      const message = parseMessage(event);
      if (message?.type === 'error') { fail(); return; }
      if (message?.type === 'created') { cleanup(); resolve(message); }
    };
    const timer = window.setTimeout(fail, 8000);
    socket.addEventListener('message', onMessage); socket.addEventListener('close', fail);
    signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) { fail(); return; }
    send(socket, { type: 'create', maxViewers });
  });
}

export function send(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export function parseMessage(event: MessageEvent): ServerMessage | null {
  return parseServerMessage(event.data);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'session-full') return 'A transmissão atingiu o limite de espectadores.';
  if (error instanceof Error && error.message === 'negotiation-failed') return 'A conexão deste espectador foi encerrada pelo transmissor.';
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'A seleção da tela foi cancelada ou bloqueada.';
    if (error.name === 'NotReadableError') return 'A fonte selecionada não pôde ser capturada.';
    if (error.name === 'OverconstrainedError') return 'A resolução ou taxa de quadros não é suportada por esta fonte.';
  }
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
import { SERVICE_UNAVAILABLE } from '../../shared/service';
import { configuredServiceOrigin } from './serviceConnection';
import { signalingEndpoint } from '../../shared/service';
import { parseServerMessage } from './serverMessages';

