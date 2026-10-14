# DC Live

Aplicativo para Windows que transmite tela e áudio por um link, sem cadastro. Seu objetivo é facilitar o compartilhamento de jogos, apresentações e outras atividades com espectadores no navegador.

## Como transmitir

Requer Windows 10/11 x64 e WebView2 Runtime.

1. Baixe o [portable.zip da versão 0.2.0 (pré-release)](https://github.com/Kzinski01/DCLIVE/releases/tag/v0.2.0), extraia e abra **DC-Live.exe**.
2. Clique em **Selecionar tela** e escolha uma tela ou janela.
3. Ajuste resolução, FPS, bitrate e áudio.
4. Confira a senha em **Acesso à transmissão**.
5. Clique em **Iniciar transmissão**, copie o link e compartilhe a senha separadamente.
6. Use **Encerrar transmissão** para finalizar e invalidar o link.

**Aguardando espectadores** significa que o link está pronto. **LIVE** indica conexão de mídia com um espectador.

## Funções e como usar

| Função | Como usar |
| --- | --- |
| Fonte | Confira a prévia e use **Trocar fonte** para compartilhar outra tela ou janela. |
| Qualidade | Defina resolução e FPS antes de iniciar. O bitrate aceita valor personalizado e ajustes durante a live. |
| Áudio | Ative **Áudio do sistema**, se a fonte permitir. |
| Senha | **Exigir senha** vem ativado. Use **Gerar senha** ou defina uma de 8 a 128 caracteres. |
| Acesso por link | Desmarque **Exigir senha** antes de iniciar. A escolha fica salva; qualquer pessoa com o link poderá assistir. |
| Espectadores | Consulte a lista, use **Expulsar** e ajuste o **Limite de espectadores**. |
| Bloquear entradas | **Bloquear novas entradas** mantém os espectadores atuais. **Permitir novas entradas** reabre o acesso. |
| Trocar senha | Edite a senha e clique em **Alterar senha**. Todos precisarão entrar novamente. |
| Novo link | **Regenerar link** invalida o anterior e desconecta os espectadores. Compartilhe o novo. |
| Métricas | Abra **Diagnósticos em tempo real** para acompanhar FPS, bitrate e conexão. |

## Overlay sobre o jogo

Em **Configurações → Streamer overlay**, ative, ajuste posição, tamanho, transparência e atalho e clique em **Aplicar overlay**.

- Exibe status, FPS real, bitrate, espectadores, RTT, estabilidade e tempo de transmissão.
- **Ctrl+Shift+F9** mostra ou oculta por padrão.
- **Click-through** deixa os cliques chegarem ao jogo. **Ocultar overlay da captura** solicita sua exclusão; confira no player.

Use o jogo em janela ou sem bordas.

## Como assistir

Abra o **link completo enviado pelo streamer** e informe a senha, se solicitada. Use **Ativar áudio**, volume e tela cheia no player. Não é necessário instalar nada para assistir.

Este repositório hospeda o player web. [Documentação técnica](PLAYER-OPERACAO.md).
