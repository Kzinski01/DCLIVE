# Security Hardening & Codebase Refactoring

## Objetivo e escopo

Atualização PATCH 0.1.1 do player/provedores e pipeline, preservando Pages gratuito/PeerJS/WebRTC P2P. Desktop/backend/Rust permanecem privados no projeto principal; suas correções e portable são artefatos locais separados. README público preservado. Este PR não publica Release nem faz merge/deploy de forma automática.

## Correções

- SDP/ICE/identidade/URLs e contrato legado validados com limites de bytes/candidatos e estados.
- Cleanup e autenticação protegidos contra repetição/concor­rência; falhas do espectador isoladas no transmissor privado.
- CSP do player, menor privilégio no desktop privado e abertura restrita a links validados.
- Actions por SHA, credencial não persistida, checks/audit de PR, CodeQL e Dependabot.

## Verificação

- 31 testes no projeto principal, suíte isolada do player, TypeScript, lint/build e checks Rust.
- Três testes negativos falharam contra baseline e passaram corrigidos.
- npm/cargo audit sem vulnerabilidades no campo do relatório; dois avisos Rust fora do alvo Windows documentados.
- PeerJS/SDP/ICE reais e três espectadores com fixture audiovisual; CSP do candidato bloqueou fetch externo. Sem abuso contra serviços compartilhados.
- Captura física, duas redes, qualidade alta e benchmark CPU/GPU permanecem pendentes.

## Revisão e publicação

- [ ] Conferir diff e resultados dos checks do PR.
- [ ] Conferir CodeQL após execução do workflow.
- [ ] Revisar proteção de `main` e security updates na conta.
- [ ] Validar portable com tela/áudio reais e outra rede.
- [ ] Autorizar merge/publicação separadamente.
- [ ] Decidir licença do próprio projeto; conferir notices de terceiros.

Sem alterações de design, encoder, resolução/FPS, mídia centralizada, serviço pago ou fallback comercial. Não há certificação Cloudflare; skill não estava instalada e foi usada auditoria substituta documentada.
