export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export const MAX_ICE_CANDIDATES = 128;
export const MAX_SIGNAL_BYTES = 70 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && new TextEncoder().encode(value).byteLength <= maximum;
}

export function validSignal(value: unknown): value is SignalData {
  if (!isRecord(value)) return false;
  if (hasOnlyKeys(value, ['description']) && isRecord(value.description)) {
    const description = value.description;
    return hasOnlyKeys(description, ['type', 'sdp']) && (description.type === 'offer' || description.type === 'answer')
      && boundedText(description.sdp, 64000);
  }
  if (!hasOnlyKeys(value, ['candidate']) || !isRecord(value.candidate)) return false;
  const candidate = value.candidate;
  return hasOnlyKeys(candidate, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment']) && boundedText(candidate.candidate, 4096)
    && (candidate.sdpMid == null || boundedText(candidate.sdpMid, 64))
    && (candidate.sdpMLineIndex == null || Number.isInteger(candidate.sdpMLineIndex) && Number(candidate.sdpMLineIndex) >= 0 && Number(candidate.sdpMLineIndex) <= 65535)
    && (candidate.usernameFragment == null || boundedText(candidate.usernameFragment, 256));
}
