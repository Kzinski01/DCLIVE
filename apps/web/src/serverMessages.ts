import { isRecord, MAX_SIGNAL_BYTES, validSignal } from '../../shared/signaling';
import { SESSION_ID_PATTERN } from '../../shared/service';
import type { ServerMessage } from './protocol';

const peerId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{16}$/.test(value);

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_SIGNAL_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) return null;
  try {
    const message: unknown = JSON.parse(raw);
    if (!isRecord(message)) return null;
    switch (message.type) {
      case 'created':
        if (typeof message.sessionId !== 'string' || !SESSION_ID_PATTERN.test(message.sessionId)
          || typeof message.controlToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(message.controlToken)
          || !Number.isSafeInteger(message.expiresAt) || Number(message.expiresAt) <= 0
          || typeof message.playerUrl !== 'string' || message.playerUrl.length > 4096 || !Array.isArray(message.iceServers) || message.iceServers.length > 10) return null;
        break;
      case 'joined': if (!peerId(message.peerId) || !Array.isArray(message.iceServers) || message.iceServers.length > 10) return null; break;
      case 'viewer-joined': case 'viewer-left': if (!peerId(message.peerId)) return null; break;
      case 'signal': if (!peerId(message.peerId) || !validSignal(message.data)) return null; break;
      case 'viewer-count': if (!Number.isInteger(message.count) || Number(message.count) < 0 || Number(message.count) > 100) return null; break;
      case 'session-ended': break;
      case 'error': if (typeof message.code !== 'string' || !/^[a-z-]{1,64}$/.test(message.code)) return null; break;
      default: return null;
    }
    return message as ServerMessage;
  } catch { return null; }
}
