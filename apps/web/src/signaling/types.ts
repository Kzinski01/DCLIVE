import type { CreatedSession, ServerMessage, SignalData } from '../protocol';
import type { WatchSession } from '../../../shared/freeConfiguration';

export type SignalingState = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type ProviderEvent = Exclude<ServerMessage, CreatedSession | { type: 'joined' }> | { type: 'peer-error'; peerId: string; error: string };
export type JoinedSession = { peerId: string; iceServers: RTCIceServer[] };

export interface SignalingProvider {
  readonly name: string;
  onMessage: (message: ProviderEvent) => void;
  onStatus: (state: SignalingState, error?: string) => void;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): void;
  createSession(maxViewers: number, signal: AbortSignal): Promise<CreatedSession>;
  joinSession(session: WatchSession, signal: AbortSignal): Promise<JoinedSession>;
  sendSignal(peerId: string, data: SignalData): void;
  endSession(controlToken: string): void;
}
