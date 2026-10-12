# Auditoria de segurança — DC Live 0.1.1

Data: 12/10/2026. Baseline privado: `9b66617f24e13dd7c15b25e997762b9f48f5b60e`. Base do player público: `47b198490a0ae23dc7da00d5d331a7101504dece`. Trabalho em branches `security/hardening-refactor`, sem reescrever histórico. O snapshot inicial foi necessário porque o workspace principal não tinha Git.

## Resumo e escopo

Encontrada e corrigida uma falha de disponibilidade de severidade alta: a negociação inválida de um espectador encerrava toda a live. Corrigidos também dois problemas médios reproduzidos no baseline: candidatos ICE sem orçamento total e captura nova sem limpeza quando a troca de fonte resolvia após encerrar. Foram fortalecidos validação, limites do Node, capabilities/CSP e CI. Não foram encontrados casos de execução arbitrária, leitura de arquivos via IPC ou XSS nos caminhos inspecionados; isso não prova ausência de vulnerabilidades desconhecidas.

Auditados fontes/lockfiles/configurações de React, WebRTC, Node, PeerJS, Rust/Tauri, scripts, workflow e histórico Git local/player. Os testes de abuso foram locais e controlados. Nenhuma carga agressiva foi aplicada a PeerJS Cloud/Pages.

**Cloudflare Security Audit: skill não localizada** no catálogo e nos arquivos SKILL.md das skills/plugins instalados. A auditoria substituta usa referências OWASP, Tauri, GitHub e Cloudflare; não executou a skill, não acessou Security Center de uma conta e não fornece certificação. O deployment atual não usa zona/conta Cloudflare.

## Modelo de ameaças

| Ativo / cenário | Pré-condição | Impacto / probabilidade | Severidade | Controle e validação |
| --- | --- | --- | --- | --- |
| Live: erro SDP/ICE de um espectador | Conhecer o link e ingressar | Encerrar captura para todos / alta | Alta | Falha isolada, peer/canal liberados; teste falhou no baseline e passou corrigido |
| Memória: candidatos antes de SDP | Espectador admitido envia candidatos continuamente | Acúmulo de memória / média | Média | Até 128 candidatos por negociação, payload em bytes e taxa por canal; teste antes/depois |
| Captura após cancelamento | Parar durante `replaceTrack` pendente | Fonte autorizada continua capturada localmente sem limpeza / média | Média | Verificação após await e stop das novas tracks; baseline lançou erro e deixou track ativa |
| Identidade: ocupante posterior de Peer ID | Conhecer ID após desconexão/colisão | Impostura ou indisponibilidade / média | Alta para impostura | P-256, nonce, espectador, prazo e fingerprint DTLS vinculados; testes de assinatura/tamper. Disponibilidade do Cloud permanece externa |
| Controle de sessão por espectador | Link público ou peer admitido | Parada/controle indevido / média | Alta | Token separado e papel de host; whitelist; stop/remover espectador sem autorização rejeitados |
| Replay/concor­rência de negociação | Reenviar prova/SDP/candidatos | Timers/estado inconsistente / média | Média | Nonce por canal, autenticação em curso única, oferta/resposta únicas, referências de peer e limites |
| Node: origens/conexões/identidades excessivas | Backend legado exposto | Esgotamento de recursos / média | Média, condicional | Rejeição antes do upgrade, limite global/per IP, mapas de rate limit limitados e timeout HTTP |
| UI/IPC: conteúdo ou URL não confiável | Comprometimento de origem local/hosting/dependência | Abuso de permissões / baixa sem XSS identificado | Defesa em profundidade | React sem sinks HTML perigosos, links validados, capability local de escrita/abertura somente, CSP restrita |
| Supply chain: action/tag alterada | Comprometimento de upstream ou mantenedor | Alterar player/distribuição / baixa, impacto alto | Defesa em profundidade | SHAs oficiais completos, checkout sem credencial persistida, tokens mínimos, PR sem deploy, revisão necessária |
| Portable/DLL/runtime comprometido | Pasta/runtime/build controlado por atacante | Execução de código / dependente do sistema | Residual | Pacote sem DLL/sidecar próprios, SHA-256, origem confiável e runtime atualizado. Não é prova de integridade do runtime instalado |

## Findings e correções

| ID | Classificação | Evidência / arquivos | Correção |
| --- | --- | --- | --- |
| SEC-01 | Alta, corrigida | `broadcast.ts`: catch de erro de peer chamava encerramento global. Teste `invalid viewer offer` falhou contra baseline | Rejeição individual preserva captura/link e fecha o canal daquele espectador |
| SEC-02 | Média, corrigida | `broadcast.ts`/`viewing.ts`: fila ICE sem limite total. Teste `ICE accumulation` falhou no baseline | Orçamento 128 por negociação e limpeza dos mapas; estado de oferta/resposta protegido contra repetição |
| SEC-03 | Média, corrigida | `changeSource`: após await usava stream já removida por stop, sem parar fonte nova. Teste de `source replacement` falhou no baseline | Cleanup da captura nova quando a live terminou durante a operação |
| SEC-04 | Média, corrigida | Validação legado por simples `type`; validadores duplicados; índices/bytes/campos sem limites completos | `shared/signaling.ts`, `serverMessages.ts`: validação comum, tamanho UTF-8, campos permitidos, IDs/contagens/ICE/configurações verificados |
| SEC-05 | Média condicional, corrigida | Node não tinha teto global de conexões/mapas de IP e checava origem após upgrade | Handshake negado previamente, 4096 conexões WS por padrão (configurável até 10000), 10000 identidades por limiter e timeouts |
| SEC-06 | Baixa / prevenção, aplicada | CSP ampla e abertura geral de URLs; player sem CSP própria | Destinos efetivos em produção, desenvolvimento separado, sem `core:default`, abertura do player em app padrão e escrita de clipboard apenas; meta CSP no player |
| SEC-07 | Baixa / supply chain, aplicada nas fontes | Workflows com tags mutáveis e sem verificação de PR | Pin de SHAs consultados nos repositórios oficiais, npm sem lifecycle scripts, audit, verificação de PR, CodeQL e Dependabot configurados |

Extensão do legado `disconnect-viewer` exige conexão de host e token correto. É anunciada em `features: ['viewer-disconnect']`; clientes não a enviam a servidores antigos sem esse suporte. Protocolo 1 e mensagens existentes são preservados; protocolo gratuito continua versão 2.

## Ferramentas e resultados

- Baseline: 22 testes passaram. Os três testes de falha principais foram executados contra checkout isolado do baseline e falharam conforme esperado; passaram no código corrigido.
- Suíte atual: 31 testes passaram. TypeScript e builds desktop web/player passaram. Lint sem erros, 17 avisos CSS pré-existentes.
- `npm audit`: zero vulnerabilidades reportadas. Não houve atualização massiva de dependências nem `audit fix --force`.
- `cargo-audit` oficial 0.22.2 instalado localmente: zero vulnerabilidades no campo do relatório; avisos `RUSTSEC-2024-0370` (`proc-macro-error` 1.0.4, sem manutenção) e `RUSTSEC-2024-0429` (`glib` 0.18.5, unsound). Ambos ausentes da árvore `x86_64-pc-windows-msvc`; mantidos como risco para outros alvos/upstream, sem troca incompatível da família GTK.
- `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` e `cargo test --locked` passaram. O crate possui zero testes Rust de domínio, pois só inicializa Tauri/plugins; esse resultado não valida mídia. `cargo-deny` não instalado/não executado.
- Licenças: inventário de 268 pacotes da árvore Windows, mais produção npm; notices de 283 dependências gerados a partir de metadados/textos disponíveis. A licença do próprio DC Live não foi escolhida pelo proprietário. Metadados e notices não constituem análise jurídica completa.
- Busca de formatos usuais de tokens/chaves nas fontes/histórico sem correspondências; segredos de fixture são testes. Não houve uso de gitleaks/escaneamento de todo o perfil de credenciais. Credenciais Git ficaram em memória, sem logs.
- GitHub consultado em modo leitura: `main` sem proteção; secret scanning/push protection habilitados; atualizações automáticas de segurança Dependabot desabilitadas. Configuração de dependências no código não altera automaticamente esses controles da conta.
- Navegador real: transmissor corrigido e três espectadores com PeerJS Cloud real, vídeo sintético 640×360/~10 FPS, VP8 direto, áudio recebido RMS 0,7045, sessão criada em 852 ms, bitrate e troca de fonte mantidos, encerramento recebido. O novo player compilado foi entregue por rota de teste no navegador; o site principal não foi atualizado neste ensaio. CSP bloqueou fetch externo conforme o console. O player público anterior também recebeu a mídia, preservando compatibilidade.

## Garantias e limites

Chave privada P-256 não exportável e token de controle não entram no link. Somente ID, prazo e chave pública são compartilhados. DTLS-SRTP/P2P, bitrate/FPS/tracks/qualidade e hospedagem gratuita foram preservados. O caminho de mídia não processa frames adicionais por causa dos validadores.

CSP via meta no Pages não equivale a cabeçalho: não aplica `frame-ancestors` nem modo report-only por meta. `style-src 'unsafe-inline'` permanece para estilos existentes. A CSP não elimina comprometimento do hosting/dependências nem anonimiza IPs dos peers. Capabilities não permitem filesystem, shell, leitura de clipboard, comandos próprios ou conteúdo remoto privilegiado.

SHA-256 é integridade de comparação, não assinatura do editor. O executável não possui Authenticode comercial. Não há carregador de DLL/sidecar implementado pelo projeto; inspeção de fontes/configuração e inventário do ZIP não substituem monitoramento de todo carregamento de DLL/WebView2 do Windows.

Cloud é compartilhado, sem tombstones/TTL administrativo ou proteção global do DC Live. Links são acesso para espectadores e podem ser repassados. Não há TURN, fallback pago ou garantia em NAT restrito. Não foram testados tela/áudio físicos no WebView2, redes distintas, 1080p/60, 1440p/60–120, perda física de rede ou baseline comparável de CPU/GPU/latência visual. O ensaio sintético manteve ~10 FPS como antes, sem prometer ausência de regressão em todos os equipamentos.

## Referências

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) e [WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).
- [Tauri CSP](https://v2.tauri.app/security/csp/), [capabilities](https://v2.tauri.app/security/capabilities/) e [Opener](https://v2.tauri.app/plugin/opener/).
- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use) e [RustSec](https://rustsec.org/).
- [Cloudflare Security Insights](https://developers.cloudflare.com/security/security-insights/): referência de escopo; conta/zone não auditada.

Estado do Release/ZIP/PR e verificações finais são registrados no relatório de refatoração e no texto de revisão. Não classificar esta auditoria como certificação ou como prova de segurança absoluta.
