# Overlay e controle de acesso — 0.2.0

## Arquitetura

A captura, resolução/FPS, encoder WebRTC, bitrate personalizado, STUN e transporte P2P foram mantidos. Pages entrega o player; PeerJS Cloud negocia apenas o canal de controle. O transmissor é a autoridade de acesso no modo gratuito. O backend Node legado também valida o acesso, com a capacidade `session-access` anunciada no manifesto. Não há novo serviço pago, servidor de vídeo ou TURN automático.

## Privado por padrão

O desktop gera uma senha aleatória de 128 bits em memória para a nova sessão. É possível definir de 8 a 128 caracteres, até 256 bytes UTF-8. Somente a preferência entre privado e link é salva; senhas não são colocadas no link, em logs, no overlay ou no armazenamento de preferências. Compartilhe a senha separadamente do link. Durante uma live, editar/gerar outra senha exige clicar em **Alterar senha** para aplicá-la.

No provedor gratuito, o player verifica a identidade P-256 existente, vinculada ao nonce e fingerprint DTLS do canal, antes de enviar a senha pelo DataChannel criptografado. O transmissor confere um verificador com salt aleatório, PBKDF2-HMAC-SHA-256 de 600.000 iterações e operações HMAC nativas do Web Crypto. O verificador nunca é enviado ao espectador. Não é um PAKE: o transmissor legítimo recebe a senha pelo canal protegido. Não há algoritmo criptográfico próprio.

Somente após a autenticação o provedor emite `viewer-joined`; o Broadcast adiciona tracks e negocia o peer de mídia existente. Sinais de mídia antes dessa etapa são rejeitados. Há até duas verificações simultâneas e vinte tentativas de senha por minuto por sessão no transmissor; o backend legado tem também limite global de operações caras. Os limites podem temporariamente bloquear usuários legítimos sob abuso. Cloud compartilhado não oferece proteção global contra DoS.

**Acesso por link** exige uma escolha explícita, salva para futuras sessões. Links novos anunciam o handshake de acesso no fragmento `access=1`; o player mantém o handshake anterior para links de hosts antigos. Um desktop novo recusa iniciar com manifesto público sem `passwordAccess: 1`, evitando entregar um link privado a um player desatualizado.

## Gerenciar espectadores

- A lista contém IDs efêmeros de espectadores autenticados e o estado real do peer de mídia, sem inventar nomes/identidades.
- **Expulsar** encerra imediatamente o peer de mídia no desktop e revoga o canal. No modo gratuito, o Peer ID atual é recusado pelo restante da sessão. Uma pessoa anônima pode criar outro ID: para revogar o acesso de quem conhece a senha/link, altere a senha e/ou regenere o link.
- **Limite** aplica-se a novas admissões, de 1 a 100; reduzir o limite não expulsa espectadores existentes. No legado, o teto configurado pelo operador prevalece.
- **Bloquear novas entradas** preserva os espectadores atuais e recusa novas admissões.
- **Alterar senha** substitui o verificador e desconecta todos para nova autenticação.
- **Regenerar link** substitui a identidade pública P-256 no gratuito ou o ID de sessão no Node, invalida entradas pelo link anterior e desconecta espectadores. A captura e os ajustes de qualidade continuam ativos. Operações em andamento são invalidadas pela revisão/identidade da sessão.
- Só o host com o token administrativo separado do link pode administrar o backend. O canal do espectador não aceita comandos administrativos.

## Overlay Windows

Abra **Configurações → Streamer overlay**. Ative e aplique posição X/Y, largura/altura, opacidade, click-through, exclusão de captura e atalho (Ctrl+Shift+F8, F9 ou F10). As opções são persistidas em `overlay.json` no perfil do aplicativo. Colisões de atalho e erros nativos são exibidos. O overlay inicia desativado.

É uma janela Tauri/WebView2 local, transparente, sem bordas, sem ativação de foco, sempre no topo, sem injeção no jogo ou alterações em anticheat. Sua capability permite apenas ouvir eventos de métricas; comandos de configuração exigem a janela principal. O WebView adicional tem custo de memória: não se promete custo zero ou compatibilidade certificada com anticheats.

FPS, bitrate total enviado, RTT, espectadores com mídia conectada e estabilidade usam os contadores existentes de `RTCPeerConnection.getStats()`. A estabilidade é uma classificação por RTT/perda de pacotes e estado de sinalização, não uma garantia de rede. Sem amostra ou espectadores, os contadores mostram “—”. Métricas são enviadas a cada dois segundos; o relógio de duração atualiza a cada segundo. O overlay marca dados desatualizados após sete segundos. Sem efeitos animados, nova coleta RTC ou processamento de frames.

O Windows aplica click-through com a API nativa e `SetWindowDisplayAffinity` para a exclusão de captura. `WDA_EXCLUDEFROMCAPTURE` requer Windows 10 2004 ou posterior e suporte da fonte/caminho de captura. Janela e sem bordas são os alvos; fullscreen exclusivo pode cobrir o overlay. Confirme visualmente no player a fonte escolhida.

## Publicação e validação

As fontes do player são preparadas em branch pública isolada por uma lista explícita; desktop/backend/Rust continuam no Git local. Publique o player dessa branch antes da distribuição estável 0.2.0. Até lá, o portable candidato sinaliza a dependência e falha ao iniciar com player antigo; não substitui o Release 0.1.1.

### Resultados em 13/10/2026

- 42 testes TypeScript do projeto e 22 do player isolado cobrem senha, autorização administrativa, revogação, limites, canal DTLS incorreto, expiração de canais não autenticados e compatibilidade com hosts anteriores. Typecheck/build e lint sem erros.
- Fluxo de navegador com PeerJS Cloud/WebRTC reais e fonte sintética confirmou ausência de mídia antes da autenticação, senha incorreta rejeitada, vídeo/áudio recebidos após a senha correta, bloqueio, expulsão e link antigo rejeitado numa nova aba.
- Overlay nativo abriu e recebeu métricas reais de estado offline, com valores não medidos como “—”. A tentativa de administrar o desktop pela janela do overlay foi recusada.
- Inspeção Win32 da janela real confirmou `topmost`, `WS_EX_TRANSPARENT`, `WS_EX_NOACTIVATE`, posição/tamanho e `GetWindowDisplayAffinity = 17` (`WDA_EXCLUDEFROMCAPTURE`). Isso confirma o flag aplicado, não a exclusão em todas as APIs/fontes de captura.
- O proprietário confirmou no Trove que o overlay aparece sobre o jogo, Ctrl+Shift+F9 oculta/mostra e os cliques continuam chegando ao jogo. Não é benchmark nem certificação de anticheat.
- Corrigido travamento por criação de WebView em comando síncrono; a configuração é assíncrona. Argumentos de browser do perfil são compartilhados entre janelas para evitar erro de WebView2 em testes com configuração de desenvolvimento.

Captura física e áudio do sistema no WebView2, exclusão visual no player pela fonte escolhida, duas redes, benchmark de CPU/GPU e 1080p/1440p em FPS alto permanecem pendentes. A automação Computer Use nativa não conectou ao helper; os testes do WebView foram feitos por CDP em instância de depuração isolada, com perfil próprio. Porta de depuração e identificador de teste não entram no build portable.

## Referências técnicas

- [Tauri: janelas e comandos assíncronos no Windows](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html).
- [Tauri: atalho global](https://v2.tauri.app/plugin/global-shortcut/).
- [Microsoft: SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).
- [OWASP: password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
