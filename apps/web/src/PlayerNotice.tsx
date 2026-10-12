import { Radio } from 'lucide-react';

export function PlayerNotice({ message }: { message: string }) {
  return <div className="viewer-shell"><header className="viewer-header"><div className="brand"><div className="brand-mark"><Radio size={21} /></div><strong>DC Live</strong></div></header><main className="viewer-main"><div className="player"><div className="player-message"><Radio size={36} /><h1>Player DC Live</h1><p>{message}</p></div></div></main></div>;
}
