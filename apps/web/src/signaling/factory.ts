import { playerBaseUrl } from '../../../shared/freeConfiguration';
import { configuredServiceOrigin } from '../serviceConnection';
import { FreeSignalingProvider } from './FreeSignalingProvider';
import { LegacyNodeSignalingProvider } from './LegacyNodeSignalingProvider';
import type { SignalingProvider } from './types';

export function configuredProvider(): 'free' | 'legacy' {
  const env = import.meta.env;
  const selected = env.VITE_SIGNALING_PROVIDER || (env.MODE === 'development' ? 'legacy' : 'free');
  if (selected !== 'free' && selected !== 'legacy') throw new Error('Provedor de sinalização não suportado.');
  if (selected === 'legacy' && env.PROD && env.MODE !== 'development') throw new Error('O build de distribuição gratuito não usa infraestrutura Node/TURN própria.');
  return selected;
}

export function assertSignalingConfigured(): void {
  if (configuredProvider() === 'legacy') { configuredServiceOrigin(); return; }
  const development = import.meta.env.MODE === 'free-development';
  const configured = import.meta.env.VITE_PUBLIC_PLAYER_URL as string | undefined;
  if (!configured && !development) throw new Error('O player gratuito ainda não foi configurado pelo desenvolvedor.');
  playerBaseUrl(configured || `${location.origin}/`, development);
}

export function createSignalingProvider(): SignalingProvider {
  assertSignalingConfigured();
  if (configuredProvider() === 'legacy') return new LegacyNodeSignalingProvider();
  const allowLocalPlayer = import.meta.env.MODE === 'free-development';
  return new FreeSignalingProvider({ playerUrl: import.meta.env.VITE_PUBLIC_PLAYER_URL || `${location.origin}/`, allowLocalPlayer });
}
