# DC Live

O DC Live permite transmitir uma tela ou janela de um computador Windows para espectadores no navegador. Quem transmite gera um link temporário no aplicativo; quem assiste abre esse link, sem instalar o player nem criar uma conta.

Este repositório contém **somente o player web** e os módulos necessários para publicá-lo no GitHub Pages. O aplicativo Windows e o backend Node usado em desenvolvimento ficam no projeto principal.

## Assistir a uma transmissão

Na versão candidata 0.2.0, transmissões novas exigem senha por padrão. Peça a senha separadamente ao streamer e informe-a no player; vídeo e áudio só são negociados após a autenticação. O streamer pode escolher explicitamente acesso por link e gerenciar espectadores no desktop. Veja o [guia de acesso e overlay](docs/overlay-and-access.md). O player desta branch precisa ser publicado antes de distribuir o portable 0.2.0; o Release 0.1.1 continua estável.

Abra o link completo enviado pelo transmissor. Ele contém o ID da sessão, um prazo de validade e a chave pública usada para confirmar a identidade de quem transmite. A [página do player](https://kzinski01.github.io/DCLIVE/) sozinha não abre uma transmissão. Se o navegador bloquear o som automático, clique em **Ativar áudio**.

## Como funciona

O GitHub Pages entrega os arquivos do player. O PeerJS Cloud ajuda a estabelecer a conexão de controle, e vídeo e áudio seguem diretamente entre transmissor e espectador por WebRTC P2P. TURN está desativado na distribuição gratuita. Algumas redes podem bloquear a conexão direta; o serviço compartilhado também pode ficar indisponível.

O aplicativo oferece ajustes de resolução, FPS e bitrate. Esses valores são metas ou limites, e o resultado depende da fonte, do navegador, do computador e da rede. Foram testados o player público, a sinalização real e mídia sintética com espectadores. Ainda faltam testes de captura física e áudio do sistema no portátil, transmissão entre redes independentes e configurações de alta resolução. O projeto não inclui encoder nativo AMF, NVENC ou QSV, e o uso de GPU não foi comprovado.

## Aplicativo Windows

A [Release 0.1.1](https://github.com/Kzinski01/DCLIVE/releases/tag/v0.1.1) contém `portable.zip` e o arquivo `portable.zip.sha256`. O aplicativo requer Windows 10/11 x64 e WebView2 Runtime. Extraia o ZIP, execute `DC-Live.exe`, selecione a fonte e clique em **Iniciar transmissão**. Compartilhe o link quando aparecer **Aguardando espectadores**; o status **LIVE** indica uma conexão de mídia estabelecida.

## Desenvolvimento do player

Use Node.js 24. Depois de `npm ci`, execute `npm test`, `npm run lint` e `npm run build:player`. O guia [PLAYER-OPERACAO.md](PLAYER-OPERACAO.md) descreve a publicação e os limites da infraestrutura. O player é publicado pelo workflow do GitHub Pages deste repositório.
