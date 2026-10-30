# Chat Mirror

Suas conversas do Breezell numa janela própria: escolha uma, leia com as chamadas de ferramentas e as memórias recuperadas, responda e aprove chamadas de ferramentas.

O exemplo oficial de um plugin do Breezell que lê conversas e participa delas. Código-fonte: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Uso

- Abra pelo item **Plugins** na barra lateral do Box ou com **Abrir** em Breezell Console › Plugins.
- À esquerda ficam as conversas deste workspace, as mais recentes primeiro. Um ponto marca a que está trabalhando (âmbar: aguardando sua aprovação).
- Escolha uma para ler: suas mensagens com as memórias recuperadas para elas, as respostas com o raciocínio e cada chamada de ferramenta com seus parâmetros e resultado. A resposta que está sendo escrita aparece embaixo conforme chega.
- Escreva uma mensagem e clique em **Send** (Ctrl+Enter) para responder, ou em **New conversation** para começar uma. A IA responde como se você tivesse digitado no Breezell.
- Quando uma chamada de ferramenta aguarda aprovação, clique aqui em **Approve** (aprovar) ou **Reject** (recusar).
- **Open in Breezell** mostra a conversa no chat do Breezell.

A interface da janela é em inglês.

## Permissões

| Permissão | Para quê |
|---|---|
| `chat.read` | A lista, a conversa e suas mudanças, Open in Breezell |
| `chat.send` | Send e New conversation |
| `chat.approve` | Approve e Reject |

O Breezell pergunta por cada uma na primeira vez que o Chat Mirror a usa. Se você recusar uma, o Chat Mirror diz o que não pode fazer e o resto continua funcionando. Você pode ativar ou desativar cada uma, ou todas de uma vez, em Breezell Console › Plugins › Instalados › Chat Mirror. As mensagens que ele envia contam como as suas.

## Como é feito

- `window/` é a página. Ela só desenha e mostra todo texto com `textContent`, nunca como HTML: uma mensagem pode conter qualquer coisa.
- `src/extension.ts` abre a janela e repassa os dados entre ela e `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` e `show`.
- Enquanto uma resposta é escrita chegam mudanças, no máximo algumas por segundo; quando um passo termina, o plugin lê a conversa de novo.
- Uma permissão recusada faz a chamada falhar com `BreezellPermissionDenied`, e a página transforma isso numa frase.
