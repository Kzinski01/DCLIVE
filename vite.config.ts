import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { playerBaseUrl, freeDeployment } from './apps/shared/freeConfiguration';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = playerBaseUrl(process.env.VITE_PUBLIC_PLAYER_URL || env.VITE_PUBLIC_PLAYER_URL || "https://kzinski01.github.io/DCLIVE/");
  return {
    root: 'apps/player', envDir: process.cwd(), publicDir: '../../assets', base: new URL(base).pathname,
    define: { 'import.meta.env.VITE_PUBLIC_PLAYER_URL': JSON.stringify(base), 'import.meta.env.VITE_SIGNALING_PROVIDER': JSON.stringify('free') },
    plugins: [react(), { name: 'public-player-manifest', generateBundle() { this.emitFile({ type: 'asset', fileName: 'deployment.json', source: JSON.stringify(freeDeployment(base)) }); } }],
    build: { outDir: '../../dist/player', emptyOutDir: true },
  };
});
