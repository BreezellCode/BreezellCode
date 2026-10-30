# Focus Timer

Um timer Pomodoro numa janela própria, que também abre pelo menu Iniciar sem abrir o editor.

O exemplo oficial de um plugin de janela do Breezell. Código-fonte: [`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer).

## Uso

- Abra pelo item **Plugins** na barra lateral do Box, com **Abrir** em Breezell Console › Plugins ou pelo item **⌚ Timer** na barra de status. Enquanto o timer roda, a barra de status mostra o tempo restante.
- Sem o editor: em Breezell Console › Plugins › Instalados, **Adicionar ao menu Iniciar** (Windows) cria um atalho que abre só esta janela. Como todo plugin, ele precisa que você esteja conectado ao Breezell; caso contrário, o Breezell abre normalmente.

A duração do foco e da pausa, o som ao fim de cada fase e as sessões de hoje ficam no armazenamento próprio da janela. Quando o Breezell abriu a janela, os turnos da conversa com a IA também aparecem nela (permissão `chat.events`).

## Como é feito

- `package.json` › `contributes.breezell.windows` declara a janela: a página, o tamanho e `"requiresEditor": false` para que ela abra sozinha; `contributes.breezell.launcher` a abre pelas páginas de plugins e pela barra lateral.
- `window/` é a página. Ela carrega `/__breezell/api.js` para ter `window.breezell` (`postMessage`, `onMessage`, `connected`). A janela roda em sandbox: sem Node, sem rede, só os arquivos do próprio plugin.
- `src/extension.ts` abre a janela com `vscode.breezell.windows.open('timer')` e repassa os turnos.
- `"extensionKind": ["ui", "workspace"]`: as janelas precisam do plugin neste computador.
