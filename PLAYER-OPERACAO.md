# DC Live · Player web

Player estático do projeto pessoal DC Live. Este repositório contém somente o player, os provedores de sinalização necessários, testes e o workflow de Pages. O transmissor Windows e o backend Node.js são mantidos no projeto principal.

Destino: https://kzinski01.github.io/DCLIVE/. Verifique a publicação pelo workflow e pelo comando free:check antes de compilar o desktop.

Abra o link completo gerado pelo transmissor (?watch=..., prazo e chave pública). Não é necessário login para assistir. Vídeo e áudio seguem diretamente por WebRTC P2P; GitHub Pages entrega apenas arquivos estáticos e PeerJS Cloud negocia o canal de controle.

TURN está desativado explicitamente. Algumas redes não permitem P2P e a conexão pode falhar. PeerServer Cloud é compartilhado; não há garantia de disponibilidade/cota ilimitada. O ID não autentica o transmissor: o handshake assinado verifica a chave pública do link e o fingerprint DTLS do canal. O token de controle nunca vai no link. TTL/limites são controles do transmissor, sem banco de sessões no Cloud.

Para desenvolver: npm ci, npm test, npm run lint, npm run build:player. Habilite Settings → Pages → GitHub Actions para publicar. O workflow só executa em repositório público, usa runner padrão e não habilita cobrança, cache pago ou serviços de mídia comerciais. Respeite limites do GitHub Pages e do PeerJS Cloud; o projeto não oferece disponibilidade gratuita permanente.

Os testes de contrato usam transporte controlado exclusivamente nos testes; o código de produção carrega o SDK PeerJS real. O projeto principal validou mídia sintética com dois espectadores no player público. Captura real em Windows, alta qualidade e redes diferentes exigem testes próprios. Criação de link não comprova funcionamento da mídia. O pipeline atual usa captura/WebRTC no navegador: não há encoder nativo Rust AMF/NVENC/QSV, e uso de GPU não foi comprovado.
