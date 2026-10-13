import type { CreatedSession, ServerMessage, SignalData } from '../protocol';
import type { WatchSession } from '../../../shared/freeConfiguration';
import type { SessionSettings, StreamAccess } from '../../../shared/streamAccess';

export type SignalingState = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type ProviderEvent = Exclude<ServerMessage, CreatedSession | { type: 'joined' }> | { type: 'peer-error'; peerId: string; error: string };
export type JoinedSession = { peerId: string; iceServers: RTCIceServer[] };

export interface SignalingProvider {
  readonly name: string;
  onMessage: (message: ProviderEvent) => void;
  onStatus: (state: SignalingState, error?: string) => void;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): void;
  createSession(maxViewers: number, signal: AbortSignal, access?: StreamAccess): Promise<CreatedSession>;
  joinSession(session: WatchSession, signal: AbortSignal, password?: string): Promise<JoinedSession>;
  sendSignal(peerId: string, data: SignalData): void;
  disconnectViewer?(peerId: string): void;
  configureSession?(controlToken: string, settings: SessionSettings): Promise<void>;
  regenerateLink?(controlToken: string): Promise<string>;
  endSession(controlToken: string): void;
}
