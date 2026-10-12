export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

export type HostProof = { sessionId: string; viewerId: string; nonce: string; expiresAt: number; fingerprint: string };
export type SessionIdentity = { publicKey: string; sign: (proof: HostProof) => Promise<string> };

export async function createIdentity(): Promise<SessionIdentity> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey = encode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  // The private key stays inside this closure and is never exported into the URL or signaling.
  return { publicKey, sign: async proof => encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, proofBytes(proof)))) };
}

function proofBytes(proof: HostProof): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(['dc-live-v2', proof.sessionId, proof.viewerId, proof.nonce, proof.expiresAt, proof.fingerprint]));
}

export async function verifyIdentity(publicKey: string, proof: HostProof, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', decode(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decode(signature), proofBytes(proof));
  } catch { return false; }
}

export function dtlsFingerprint(description: RTCSessionDescription | null): string {
  const matches = description?.sdp.matchAll(/^a=fingerprint:sha-256 ([\dA-F:]+)\r?$/gmi);
  const fingerprints = matches ? [...matches].map(match => match[1].toUpperCase()) : [];
  const unique = [...new Set(fingerprints)];
  if (unique.length !== 1 || !/^(?:[\dA-F]{2}:){31}[\dA-F]{2}$/.test(unique[0])) throw new Error('O canal de controle não forneceu fingerprint DTLS válido.');
  return unique[0];
}
