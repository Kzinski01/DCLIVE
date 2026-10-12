import type { DataConnection } from 'peerjs';
import { parseControlMessage, type ControlMessage } from './controlProtocol';

export class ControlChannel {
  joined = false;
  private lastSeen = Date.now();
  private messages = 0;
  private windowStarted = Date.now();
  private closed = false;
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(readonly connection: DataConnection, receive: (message: ControlMessage) => void, private readonly onClosed: () => void) {
    connection.on('data', raw => {
      if (this.closed) return;
      const now = Date.now();
      if (now - this.windowStarted >= 10000) { this.windowStarted = now; this.messages = 0; }
      const message = parseControlMessage(raw);
      if (++this.messages > 100 || !message) { this.close(); return; }
      this.lastSeen = now;
      if (message.type === 'ping') this.send({ type: 'pong' });
      else if (message.type !== 'pong') receive(message);
    });
    connection.on('close', () => this.finishClose());
    connection.on('error', () => this.close());
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastSeen > 15000) this.close();
      else if (connection.open) this.send({ type: 'ping' });
    }, 5000);
  }

  send(message: ControlMessage): void {
    if (!this.connection.open || this.closed) return;
    if (this.connection.dataChannel.bufferedAmount >= 256 * 1024) { this.close(); return; }
    try { void Promise.resolve(this.connection.send(JSON.stringify(message))).catch(() => this.close()); }
    catch { this.close(); }
  }

  private finishClose(): void {
    if (this.closed) return;
    this.closed = true; clearInterval(this.heartbeat); this.onClosed();
  }

  close(): void {
    if (this.closed) return;
    this.finishClose(); this.connection.close();
  }
}
