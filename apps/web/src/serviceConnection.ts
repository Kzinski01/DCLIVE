import { SERVICE_UNAVAILABLE, parseServiceManifest, serviceOrigin, type ServiceManifest } from '../../shared/service';

export function configuredServiceOrigin(): string {
  const development = import.meta.env.DEV || import.meta.env.MODE === 'development';
  const configured = import.meta.env.VITE_SERVICE_ORIGIN as string | undefined;
  if (configured) return serviceOrigin(configured, development);
  if (development && ['localhost', '127.0.0.1'].includes(location.hostname)) return 'http://127.0.0.1:8787';
  if (location.protocol === 'https:' && location.hostname !== 'tauri.localhost') return serviceOrigin(location.origin);
  throw new Error(SERVICE_UNAVAILABLE);
}

export async function discoverService(signal?: AbortSignal): Promise<ServiceManifest> {
  try {
    const origin = configuredServiceOrigin();
    const response = await fetch(`${origin}/api/service`, {
      cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(SERVICE_UNAVAILABLE);
    return parseServiceManifest(await response.json(), origin, import.meta.env.DEV || import.meta.env.MODE === 'development');
  } catch { throw new Error(SERVICE_UNAVAILABLE); }
}
