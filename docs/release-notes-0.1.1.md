# DC Live 0.1.1 — Windows portable x64

Atualização de segurança e estabilidade. Baixe `portable.zip`, extraia a pasta e execute `DC-Live.exe`. O aplicativo usa o [player público](https://kzinski01.github.io/DCLIVE/) e PeerJS Cloud para sinalização; o transporte audiovisual continua WebRTC P2P.

## Alterações

- Validação e limites para mensagens SDP/ICE, identidade e URLs.
- Falhas de um espectador isoladas da transmissão e correções de encerramento/troca da captura.
- CSP e permissões do desktop restritas; Actions fixadas por SHA, checks, CodeQL e Dependabot no player.
- Configuração do player público integrada ao portable, sem campos de domínio ou WebSocket na interface principal.

## Verificação

31 testes locais e 14 testes do player passaram. Checks e CodeQL do [PR #1](https://github.com/Kzinski01/DCLIVE/pull/1) passaram; a análise do player reportou zero resultados em 87 regras. Build e inicialização básica do Windows x64 passaram. Mídia sintética foi recebida por três espectadores com sinalização/WebRTC reais; captura física, áudio do sistema e transmissão entre redes distintas ainda precisam de validação.

O executável não tem assinatura Authenticode. TURN está desativado nesta distribuição: redes que bloqueiam conexão direta podem impedir a transmissão. Não há garantia de disponibilidade ilimitada do serviço compartilhado nem comprovação de encoder nativo/GPU.

O SHA-256 de `portable.zip` está no arquivo `portable.zip.sha256`. O Release anterior foi preservado. O repositório público contém somente o player; as fontes do desktop/backend permanecem no projeto local.
