import { useEffect, useRef, useState } from 'react';
import { Maximize, Volume2, VolumeX, Radio } from 'lucide-react';
import { Viewing, type ViewerState } from './viewing';
import type { WatchSession } from '../../shared/freeConfiguration';

export function Viewer({ session }: { session: WatchSession }) {
  const { id, publicKey, expiresAt } = session;
  const [state, setState] = useState<ViewerState>({ phase: 'connecting', error: '', receivedMbps: 0, receivedFps: 0, height: 0 });
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const video = useRef<HTMLVideoElement>(null);
  const viewing = useRef<Viewing | null>(null);

  useEffect(() => {
    const instance = new Viewing({ id, publicKey, expiresAt }, (next, stream) => {
      setState({ ...next });
      if (video.current && stream && video.current.srcObject !== stream) {
        video.current.srcObject = stream;
        void video.current.play().catch(() => setMuted(true));
      }
    });
    viewing.current = instance;
    void instance.start();
    return () => { instance.dispose(); viewing.current = null; };
  }, [id, publicKey, expiresAt]);

  useEffect(() => { if (video.current) { video.current.muted = muted; video.current.volume = volume; } }, [muted, volume]);

  async function enableAudio() {
    setMuted(false);
    if (video.current) {
      video.current.muted = false;
      try { await video.current.play(); } catch { setMuted(true); }
    }
  }

  return <div className="viewer-shell">
    <header className="viewer-header"><div className="brand"><div className="brand-mark"><Radio size={21} /></div><div><strong>DC Live</strong><span>Transmissão ao vivo</span></div></div><div className={`status status-${state.phase}`}><span className="status-dot" />{state.phase === 'playing' ? 'Conectado' : state.phase === 'ended' ? 'Encerrada' : state.phase === 'error' ? 'Erro' : 'Conectando'}</div></header>
    <main className="viewer-main">
      <div className="player">
        <video ref={video} autoPlay muted={muted} playsInline />
        {state.phase !== 'playing' && <div className="player-message"><Radio size={36} /><h1>{state.phase === 'ended' ? 'Transmissão encerrada' : state.phase === 'error' ? 'Não foi possível conectar' : 'Conectando à transmissão'}</h1><p>{state.error || (state.phase === 'ended' ? 'Este link não está mais ativo.' : 'Aguarde enquanto a conexão direta é estabelecida.')}</p></div>}
      </div>
      <div className="player-controls"><div className="player-quality"><span className="pulse" />{state.phase === 'playing' ? `${state.height || '—'}p · ${state.receivedFps.toFixed(0)} FPS · ${state.receivedMbps.toFixed(1)} Mbps` : 'Aguardando vídeo'}</div><div className="control-buttons">{muted && state.phase === 'playing' && <button type="button" className="enable-audio" onClick={() => void enableAudio()}>Ativar áudio</button>}<button type="button" aria-label={muted ? 'Ativar som' : 'Silenciar'} onClick={() => muted ? void enableAudio() : setMuted(true)}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /><button type="button" aria-label="Tela cheia" onClick={() => void video.current?.requestFullscreen()}><Maximize size={19} /></button></div></div>
    </main>
  </div>;
}
