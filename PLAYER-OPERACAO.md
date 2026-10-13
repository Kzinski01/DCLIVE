# DC Live · Player web

Este repositório publica o player web do DC Live no GitHub Pages. Ele contém o player, os provedores de sinalização necessários, testes e o workflow de publicação. O transmissor Windows e o backend Node.js ficam no projeto principal.

Endereço do player: https://kzinski01.github.io/DCLIVE/. Antes de compilar o desktop, confira o resultado do workflow e execute free:check.

Para assistir, abra o link completo gerado pelo transmissor, incluindo ?watch=..., o prazo e a chave pública. Você não precisa de login. Vídeo e áudio seguem diretamente por WebRTC P2P. O GitHub Pages entrega os arquivos do site, e o PeerJS Cloud negocia o canal de controle.

TURN está desativado. A conexão pode falhar em redes que bloqueiam P2P. O PeerJS Cloud é compartilhado e não oferece cota ou disponibilidade ilimitada. O ID por si só não autentica o transmissor: o handshake assinado verifica a chave pública do link e o fingerprint DTLS do canal. O link não contém o token de controle. O transmissor aplica o prazo e os limites da sessão, pois o Cloud não mantém um banco de sessões do DC Live.

Para desenvolver, execute npm ci, npm test, npm run lint e npm run build:player. Para publicar, selecione Settings → Pages → GitHub Actions. O workflow executa apenas em repositório público e usa um runner padrão. Ele não ativa cobrança, cache pago ou serviços comerciais de mídia. Consulte os limites do GitHub Pages e do PeerJS Cloud antes de depender desses serviços.

Os testes de contrato usam um transporte controlado; a versão de produção carrega o SDK PeerJS real. O projeto principal testou mídia sintética com dois espectadores no player público. Ainda faltam testes de captura real no Windows, alta qualidade e transmissão entre redes diferentes. Criar um link não confirma que a mídia funciona. A captura e o WebRTC usam o navegador; não há encoder nativo Rust AMF/NVENC/QSV nem comprovação de uso da GPU.
