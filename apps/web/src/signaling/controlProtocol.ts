import type { SignalData } from '../protocol';
import type { HostProof } from './sessionIdentity';

export type ControlMessage =
  | { type: 'join'; sessionId: string; nonce: string }
  | { type: 'welcome'; proof: HostProof; signature: string }
  | { type: 'signal'; data: SignalData }
  | { type: 'rejected'; code: string }
  | { type: 'ended' | 'leave' | 'ping' | 'pong' };

export function validSignal(value: unknown): value is SignalData {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Record<string, unknown>;
  if (signal.description && typeof signal.description === 'object') {
    const sdp = signal.description as RTCSessionDescriptionInit;
    return ['offer', 'answer'].includes(sdp.type) && typeof sdp.sdp === 'string' && sdp.sdp.length <= 64000;
  }
  if (!signal.candidate || typeof signal.candidate !== 'object') return false;
  const ice = signal.candidate as RTCIceCandidateInit;
  return typeof ice.candidate === 'string' && ice.candidate.length <= 4096
    && (ice.sdpMid === null || typeof ice.sdpMid === 'string' && ice.sdpMid.length <= 64)
    && (ice.sdpMLineIndex === null || Number.isInteger(ice.sdpMLineIndex));
}

export function parseControlMessage(raw: unknown): ControlMessage | null {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 70 * 1024) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return null;
    if (['ended', 'leave', 'ping', 'pong'].includes(String(value.type))) return value as ControlMessage;
    if (value.type === 'signal' && validSignal(value.data)) return value as ControlMessage;
    if (value.type === 'join' && typeof value.sessionId === 'string' && /^[a-f0-9]{36}$/.test(value.sessionId) && typeof value.nonce === 'string' && /^[a-f0-9]{64}$/.test(value.nonce)) return value as ControlMessage;
    if (value.type === 'rejected' && typeof value.code === 'string' && value.code.length < 100) return value as ControlMessage;
    if (value.type === 'welcome' && typeof value.signature === 'string' && value.signature.length < 200 && value.proof && typeof value.proof === 'object') {
      const proof = value.proof as HostProof;
      if (typeof proof.sessionId === 'string' && typeof proof.viewerId === 'string' && typeof proof.nonce === 'string' && Number.isSafeInteger(proof.expiresAt) && typeof proof.fingerprint === 'string') return value as ControlMessage;
    }
    return null;
  } catch { return null; }
}
