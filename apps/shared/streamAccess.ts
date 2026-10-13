export type StreamAccess = { mode: 'private'; password: string } | { mode: 'link' };
export type SessionSettings = { maxViewers: number; blocked: boolean; access?: StreamAccess };
export const PASSWORD_ITERATIONS = 600_000;
const encoder = new TextEncoder();
const checkMessage = encoder.encode('DC Live password verification');

export function randomPassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && encoder.encode(value).length <= 256;
}

export function validAccess(value: unknown): value is StreamAccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const access = value as Record<string, unknown>;
  return access.mode === 'link' && Object.keys(access).length === 1
    || access.mode === 'private' && validPassword(access.password) && Object.keys(access).length === 2;
}

export function validSettings(value: unknown): value is SessionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return Number.isInteger(settings.maxViewers) && Number(settings.maxViewers) >= 1 && Number(settings.maxViewers) <= 100
    && typeof settings.blocked === 'boolean' && (settings.access === undefined || validAccess(settings.access))
    && Object.keys(settings).every(key => ['maxViewers', 'blocked', 'access'].includes(key));
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, material,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}

// Only a salted verifier remains in memory. Passwords/verifiers are never sent in links or saved to disk.
export class StreamAdmission {
  private attempts = 0;
  private windowStarted = Date.now();
  private pending = 0;
  private constructor(readonly mode: StreamAccess['mode'], private readonly salt?: Uint8Array<ArrayBuffer>, private readonly tag?: ArrayBuffer) {}

  static async create(access: StreamAccess): Promise<StreamAdmission> {
    if (!validAccess(access)) throw new Error('Senha inválida. Use de 8 a 128 caracteres (até 256 bytes).');
    if (access.mode === 'link') return new StreamAdmission('link');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(access.password, salt);
    return new StreamAdmission('private', salt, await crypto.subtle.sign('HMAC', key, checkMessage));
  }

  async authenticate(password?: string): Promise<string | null> {
    if (this.mode === 'link') return null;
    if (password === undefined || password === '') return 'password-required';
    if (!validPassword(password)) return 'password-invalid';
    if (Date.now() - this.windowStarted >= 60000) { this.windowStarted = Date.now(); this.attempts = 0; }
    if (this.attempts >= 20 || this.pending >= 2) return 'auth-rate-limit';
    this.attempts++; this.pending++;
    try {
      const key = await deriveKey(password, this.salt!);
      return await crypto.subtle.verify('HMAC', key, this.tag!, checkMessage) ? null : 'password-invalid';
    } finally { this.pending--; }
  }
}
