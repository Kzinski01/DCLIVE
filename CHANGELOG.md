# Changelog

## 0.1.1 — 2026-10-12

### Security

- Falhas SDP/ICE de um espectador deixam de encerrar a live inteira.
- Orçamento de candidatos e proteção contra negociação duplicada, mensagens malformadas e payloads excessivos.
- Liberação da captura nova quando a troca de fonte resolve depois do encerramento.
- Controle de peers e limites/handshake do Node fortalecidos; compatibilidade negociada por feature opcional.
- Menor privilégio no Tauri e CSP/validação de URLs no player/desktop.

### Refactoring and CI

- Validação SDP/ICE compartilhada, contrato legado validado e cleanup idempotente.
- Actions por SHA, checks de PR, CodeQL e Dependabot preparados; sem deploy automático de PR.
- Notices de dependências e relatório de auditoria/refatoração.

### Compatibility

- PeerJS Cloud, Pages gratuito, WebRTC P2P, bitrate/fonte/áudio/qualidade preservados. Sem TURN pago ou cobrança automática.
- Sem atualização massiva de dependências; avisos Rust não aplicáveis ao alvo Windows registrados.
- Tela/áudio físicos, outras redes e desempenho alto ainda precisam de validação. Não há encoder nativo Rust AMF/NVENC/QSV nesta versão.

## 0.1.0

- Baseline existente: links automáticos, player GitHub Pages, PeerJS Cloud, desktop Tauri e backend Node de desenvolvimento preservado.
