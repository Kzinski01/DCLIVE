# DC Live 0.2.0 — Windows portable x64 (pré-release)

Baixe `portable.zip`, extraia a pasta e execute `DC-Live.exe`. Requer Windows 10/11 x64 e WebView2 Runtime. O [player público](https://kzinski01.github.io/DCLIVE/) já está atualizado para esta versão. Não há configuração de domínio ou WebSocket na interface.

## Novidades

- **Privado por padrão:** senha aleatória ou personalizada, exigida no player antes da negociação de vídeo/áudio. Acesso por link é uma escolha explícita, salva para futuras sessões.
- **Espectadores:** lista, expulsão, limite, bloqueio de entradas, alteração de senha e regeneração de link integrados ao transmissor e ao backend legado.
- **Overlay Windows:** posição/tamanho/opacidade, click-through, exclusão de captura e atalho global configuráveis, com métricas RTC reais e duração da transmissão.
- Captura, bitrate personalizado, resolução/FPS, encoder do navegador e WebRTC P2P preservados. Pages/PeerJS Cloud continuam gratuitos; TURN está desativado.

## Validação

42 testes locais e 22 do player passaram, além de TypeScript, build, lint, Clippy e um teste Rust. Checks e CodeQL foram aprovados. No player HTTPS publicado, senha incorreta não recebeu mídia; vídeo e áudio sintéticos foram recebidos após autenticação. Bloqueio, expulsão e invalidação do link anterior passaram. O proprietário confirmou visibilidade, atalho e click-through do overlay no Trove.

Esta é uma **pré-release para testes**. Captura física/áudio do sistema no WebView2, exclusão visual no player, duas redes, alta resolução/FPS e benchmark de CPU/GPU ainda precisam de validação. O executável não possui assinatura Authenticode; o SHA-256 de `portable.zip` está em `portable.zip.sha256`.

[Guia técnico e limites](https://github.com/Kzinski01/DCLIVE/blob/main/docs/overlay-and-access.md). A versão 0.1.1 foi preservada. O repositório público contém o player; fontes do desktop/backend permanecem no projeto local.
