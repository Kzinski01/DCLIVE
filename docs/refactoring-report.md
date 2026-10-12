# Refatoração e preservação — 0.1.1

## Mudanças

- `shared/signaling.ts`: validadores SDP/ICE e limites reutilizados no Node e no cliente. Eliminados os dois validadores duplicados.
- `serverMessages.ts`: desserialização/validação do contrato legado extraída da função que anteriormente confiava em qualquer `type`.
- `broadcast.ts`: falha por espectador separada de falha do serviço; orçamento/estado de negociação e limpeza após awaits. A captura, encoder do navegador, tracks e controle de bitrate permanecem existentes.
- `viewing.ts`: checks de peer atual/cancelamento, limite de candidatos/resposta, cleanup em erro fatal e métricas que não sobrescrevem reconexão com estado antigo.
- `ControlChannel`: fechamento idempotente com notificação de cleanup mesmo antes de `open`; mensagens ignoradas após fechar. `FreeSignalingProvider`: latch de autenticação e valores inválidos de limite tratados com padrão seguro.
- Legado: remoção individual autorizada e negociada por feature opcional; stop, descoberta e contratos existentes preservados.
- Node: limites globais e handshake protegido, sem compressão WS; mapas limitados e timeout HTTP.
- Tauri/player: menor privilégio, URL validada antes de abertura, CSP de produção separada do desenvolvimento. Não houve mudança visual.
- CI: SHAs oficiais, `persist-credentials:false`, npm sem scripts de instalação, audit e verificação/CodeQL de PR; Dependabot sem auto-merge.
- Scripts: exportação do player inclui somente novos módulos/configurações necessários; notices de dependências, versão PATCH 0.1.1 e guias de revisão. Schemas gerados ignorados no Git, permanecem regeneráveis no disco.

## Impacto e verificação

31 testes TypeScript passaram; três negativos reproduziram falha no baseline privado antes de validar as correções. Typecheck/build/lint e checks Rust passaram, com zero testes de domínio Rust existentes. As fontes de teste usam transportes/capturas controlados exclusivamente para reprodução; produção continua SDK PeerJS/WebRTC reais.

Ensaio de navegador com três espectadores confirmou ~10 FPS, vídeo/áudio sintéticos, cloud real, troca de fonte/bitrate e encerramento. O player candidato com CSP foi servido por interceptação local das respostas HTTP na sessão de teste; não simula Cloud/mídia nem publica o candidato. Comparação de FPS limitada ao fixture anterior semelhante; não é benchmark de CPU/GPU ou qualidade alta.

Não houve atualização de bibliotecas sem advisory aplicável: npm reportou zero; avisos Rust fora do alvo Windows foram documentados. Não há nova dependência de streaming, processamento de frames, transcodificação ou serviço pago.

Código privado e player público têm branches/commits separados. O PR do player não publica desktop/backend/Rust/env, nem permite revisar os patches privados pela interface do GitHub; esses patches permanecem no Git local. O README público editado pelo usuário é preservado.

## Pendências de validação/conta

Captura física/áudio do sistema e mídia em duas redes/alta resolução continuam pendentes. Native Tauri: build/inicialização não substituem ensaio completo de captura/IPC no WebView2. Branch principal sem proteção e security updates automáticos desabilitados são configurações de conta a revisar, sem alteração silenciosa.

Merge e publicação foram executados após autorização explícita do proprietário e sucesso dos checks. Não há automação de merge pelo Dependabot.

## Entrega verificada

Release Windows x64 0.1.1 gerado e permaneceu aberto por cinco segundos; Authenticode `NotSigned`. `dumpbin` confirmou x64, High Entropy VA, Dynamic Base e NX compatible, com imports diretos de DLLs do Windows. O ZIP inclui os relatórios, manifestos, validação e notices; o arquivo `.zip.sha256` é a referência do hash final após empacotamento. A versão anterior 0.1.0 foi preservada em ZIP separado.

[PR #1](https://github.com/Kzinski01/DCLIVE/pull/1) integrado à main em `51f48d5d779517daee053fc9d0ae60ace055230e`, com somente as fontes do player. [Deploy Pages](https://github.com/Kzinski01/DCLIVE/actions/runs/38310298603) e [CodeQL na main](https://github.com/Kzinski01/DCLIVE/actions/runs/38310298608) concluíram com sucesso. Player público e registro PeerJS Cloud verificados novamente.

Checks e CodeQL do PR concluíram com sucesso; CodeQL reportou zero resultados em 87 regras para o player. Isso não representa certificação nem análise CodeQL dos componentes privados.

[Release v0.1.1](https://github.com/Kzinski01/DCLIVE/releases/tag/v0.1.1) publicado em 12/10/2026, 21:25 UTC, com `portable.zip` e `portable.zip.sha256`. O download público foi verificado: 3.338.419 bytes, SHA-256 `78f7237eb93282156aec7a165c5507ffe514a4db296d2ce642c515afadc2f7a5`. A tag corresponde ao merge acima. O Release anterior e seu ZIP 0.1.0 foram preservados. Os relatórios dentro do ZIP registram a auditoria antes da publicação; este documento registra o estado posterior.
