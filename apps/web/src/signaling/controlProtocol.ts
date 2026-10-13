import type { SignalData } from '../protocol';
import type { HostProof } from './sessionIdentity';
import { hasOnlyKeys, isRecord, MAX_SIGNAL_BYTES, validSignal } from '../../../shared/signaling';

export type ControlMessage =
  | { type: 'join'; sessionId: string; nonce: string; publicKey?: string }
  | { type: 'challenge'; proof: HostProof; signature: string; passwordRequired: boolean }
  | { type: 'authenticate'; password?: string }
  | { type: 'welcome'; proof: HostProof; signature: string }
  | { type: 'signal'; data: SignalData }
  | { type: 'rejected'; code: string }
  | { type: 'ended' | 'leave' | 'ping' | 'pong' };

function validProof(value: unknown): value is HostProof {
  if (!isRecord(value) || !hasOnlyKeys(value, ['sessionId', 'viewerId', 'nonce', 'expiresAt', 'fingerprint'])) return false;
  return typeof value.sessionId === 'string' && /^[a-f0-9]{36}$/.test(value.sessionId)
    && typeof value.viewerId === 'string' && /^dc-[a-f0-9]{36}$/.test(value.viewerId)
    && typeof value.nonce === 'string' && /^[a-f0-9]{64}$/.test(value.nonce)
    && Number.isSafeInteger(value.expiresAt) && Number(value.expiresAt) > 0
    && typeof value.fingerprint === 'string' && /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value.fingerprint);
}

export function parseControlMessage(raw: unknown): ControlMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_SIGNAL_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!isRecord(value)) return null;
    if (typeof value.type === 'string' && ['ended', 'leave', 'ping', 'pong'].includes(value.type) && hasOnlyKeys(value, ['type'])) return value as ControlMessage;
    if (value.type === 'signal' && hasOnlyKeys(value, ['type', 'data']) && validSignal(value.data)) return value as ControlMessage;
    if (value.type === 'join' && hasOnlyKeys(value, ['type', 'sessionId', 'nonce', 'publicKey']) && typeof value.sessionId === 'string' && /^[a-f0-9]{36}$/.test(value.sessionId) && typeof value.nonce === 'string' && /^[a-f0-9]{64}$/.test(value.nonce) && (value.publicKey === undefined || typeof value.publicKey === 'string' && /^[A-Za-z0-9_-]{87}$/.test(value.publicKey))) return value as ControlMessage;
    if (value.type === 'authenticate' && hasOnlyKeys(value, ['type', 'password']) && (value.password === undefined || typeof value.password === 'string' && value.password.length <= 128 && new TextEncoder().encode(value.password).length <= 256)) return value as ControlMessage;
    if (value.type === 'challenge' && hasOnlyKeys(value, ['type', 'proof', 'signature', 'passwordRequired']) && typeof value.passwordRequired === 'boolean' && typeof value.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value.signature) && validProof(value.proof)) return value as ControlMessage;
    if (value.type === 'rejected' && hasOnlyKeys(value, ['type', 'code']) && ['session-full', 'password-required', 'password-invalid', 'auth-rate-limit', 'entries-blocked', 'link-invalid', 'viewer-kicked'].includes(String(value.code))) return value as ControlMessage;
    if (value.type === 'welcome' && hasOnlyKeys(value, ['type', 'proof', 'signature']) && typeof value.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value.signature) && validProof(value.proof)) return value as ControlMessage;
    return null;
  } catch { return null; }
}
