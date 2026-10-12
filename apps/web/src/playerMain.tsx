import React from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './Viewer';
import { PlayerNotice } from './PlayerNotice';
import { parseWatchSession, type WatchSession } from '../../shared/freeConfiguration';
import './style.css';

let session: WatchSession | null = null;
let message = 'Abra o link completo enviado pelo transmissor para assistir. Não é necessário cadastro.';
try { session = parseWatchSession(new URL(location.href)); }
catch (error) { message = error instanceof Error ? error.message : 'Link inválido.'; }
const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<React.StrictMode>{session ? <Viewer session={session} /> : <PlayerNotice message={message} />}</React.StrictMode>);
