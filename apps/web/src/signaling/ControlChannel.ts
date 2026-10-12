import type { DataConnection } from 'peerjs';
import { parseControlMessage, type ControlMessage } from './controlProtocol';

export class ControlChannel {
  joined = false;
  private lastSeen = Date.now();
  private messages = 0;
  private windowStarted = Date.now();
  private closed = false;
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(readonly connection: DataConnection, receive: (message: ControlMessage) => void, closed: () => void) {
    connection.on('data', raw => {
      const now = Date.now();
      if (now - this.windowStarted >= 10000) { this.windowStarted = now; this.messages = 0; }
      const message = parseControlMessage(raw);
      if (++this.messages > 100 || !message) { this.close(); return; }
      this.lastSeen = now;
      if (message.type === 'ping') this.send({ type: 'pong' });
      else if (message.type !== 'pong') receive(message);
    });
    connection.on('close', () => { if (!this.closed) { this.closed = true; clearInterval(this.heartbeat); closed(); } });
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

  close(): void { if (this.closed) return; clearInterval(this.heartbeat); this.connection.close(); }
}
