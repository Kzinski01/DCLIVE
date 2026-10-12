import { freeDeployment } from '../../../shared/freeConfiguration';
import { SERVICE_UNAVAILABLE } from '../../../shared/service';

export async function verifyPublishedPlayer(base: string, signal: AbortSignal): Promise<void> {
  try {
    const response = await fetch(new URL('deployment.json', base), { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) throw new Error(SERVICE_UNAVAILABLE);
    const manifest = await response.json() as Record<string, unknown>;
    const expected = freeDeployment(base);
    if (Object.entries(expected).some(([key, value]) => manifest[key] !== value)) throw new Error(SERVICE_UNAVAILABLE);
  } catch { throw new Error('O player do GitHub Pages ainda não está disponível ou usa configuração incompatível.'); }
}
