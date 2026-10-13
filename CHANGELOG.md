# Changelog

## 0.2.0 (13/10/2026) — candidato

### Novos recursos

- Transmissões privadas por padrão, senha aleatória/personalizada e formulário no player; opção explícita e persistida de acesso por link.
- Autenticação real antes da admissão e negociação de mídia, após confirmar a identidade/DTLS do host; PBKDF2-HMAC-SHA-256 nativo, limites de tentativas e concorrência.
- Lista de espectadores autenticados, expulsão, limite, bloqueio, alteração de senha e regeneração de link integrados aos provedores gratuito e Node legado.
- Overlay Windows transparente e sempre no topo, posição/tamanho/opacidade, click-through, exclusão de captura e atalho global configuráveis; métricas RTC existentes e temporizador real.

### Integração

- Handshake separado em `ViewerHandshake`; política de acesso comum em `StreamAdmission`; overlay isolado em janela/capability e módulo Rust.
- Links de hosts anteriores mantêm o handshake antigo. Backend legado novo anuncia `session-access`; servidores antigos só aceitam sessões explicitamente por link.
- Desktop verifica a capacidade de autenticação do player publicado. Script de portable candidato identifica a dependência de publicação e preserva o ZIP/Release estável anterior.
- Captura, bitrate personalizado, resoluções/FPS, encoder, P2P, STUN e infraestrutura gratuita mantidos. Sem serviços pagos ou injeção em jogos.

## 0.1.1 (12/10/2026)

### Segurança

- Falhas SDP/ICE de um espectador deixam de encerrar a live inteira.
- Limites para candidatos ICE, negociações repetidas, mensagens malformadas e mensagens grandes demais.
- Liberação da captura nova quando a troca de fonte resolve depois do encerramento.
- Controle de peers e limites do Node reforçados. O handshake usa uma capacidade opcional para manter a compatibilidade.
- Menor privilégio no Tauri e CSP/validação de URLs no player/desktop.

### Refatoração e integração contínua

- Validação SDP/ICE compartilhada, contrato legado verificado e limpeza que pode ser repetida com segurança.
- Actions por SHA, checks de PR, CodeQL e Dependabot preparados; sem deploy automático de PR.
- Notices de dependências e relatório de auditoria/refatoração.

### Compatibilidade

- PeerJS Cloud, Pages gratuito, WebRTC P2P, bitrate/fonte/áudio/qualidade preservados. Sem TURN pago ou cobrança automática.
- Sem atualização massiva de dependências; avisos Rust não aplicáveis ao alvo Windows registrados.
- Tela/áudio físicos, outras redes e desempenho alto ainda precisam de validação. Não há encoder nativo Rust AMF/NVENC/QSV nesta versão.

## 0.1.0

- A versão inicial já tinha links automáticos, player no GitHub Pages, PeerJS Cloud, desktop Tauri e backend Node para desenvolvimento.
