# Chat Mirror

Suas conversas do Breezell numa janela própria: escolha uma, leia com as chamadas de ferramentas e as memórias recuperadas, responda, aprove chamadas de ferramentas e troque o modelo do chat.

O exemplo oficial de um plugin do Breezell que lê conversas e participa delas. Código-fonte: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Uso

- Abra pelo item **Plugins** na barra lateral do Box ou com **Abrir** em Breezell Console › Plugins.
- À esquerda ficam as conversas deste workspace, as mais recentes primeiro. Um ponto marca a que está trabalhando (âmbar: aguardando sua aprovação).
- Escolha uma para ler: suas mensagens com as memórias usadas para elas (contadas como no chat do Breezell: residentes e relevantes), as respostas com o raciocínio e cada chamada de ferramenta com seus parâmetros e resultado.
- Enquanto o Breezell prepara uma resposta, o último balão mostra o que ele está fazendo e há quanto tempo (pensando, executando uma ferramenta, esperando sua aprovação), o raciocínio e o texto conforme chega.
- Escreva uma mensagem e clique em **Send** (Ctrl+Enter) para responder, ou em **New conversation** para começar uma. A IA responde como se você tivesse digitado no Breezell.
- Quando uma chamada de ferramenta aguarda aprovação, clique aqui em **Approve** (aprovar) ou **Reject** (recusar).
- **Open in Breezell** mostra a conversa no chat do Breezell.
- **Model**, ao lado de **Send**, troca o modelo do chat do Breezell. É a mesma configuração do seletor de modelo do chat do Breezell, então uma mudança de um lado aparece no outro (aqui, quando a janela recebe o foco).
- **Pinned notes** (notas fixadas), abaixo das conversas: as notas que o Agent do Breezell fixou com a ferramenta `pin_note` do Chat Mirror, as mais recentes primeiro. **Unpin** remove uma.
- A chamada a uma ferramenta de um plugin mostra o nome do plugin e **Plugin tool** (também o próprio `pin_note` do Chat Mirror); uma ferramenta MCP mostra o servidor.

A interface da janela é em inglês.

## Ferramentas do Agent

O Chat Mirror dá ao Agent do Breezell duas ferramentas próprias (`agent.tools`, "Registro de ferramentas do Agent"). Cada uma indica os modos em que é oferecida; nos outros modos o Agent não a vê nem pode chamá-la.

| Ferramenta | Modos | O que faz |
|---|---|---|
| `pin_note` | Chat, Agent, Emaranhamento | Fixa uma nota (um título e o texto) nesta janela |
| `list_notes` | Chat, Agent, Emaranhamento, Analisar, Teams | Lê as notas fixadas, das mais recentes para as mais antigas |

Experimente no Chat: "Fixe uma nota no Chat Mirror: lançar a 1.4.42 na segunda". As notas ficam no seu computador com os dados do plugin, mesmo com a janela fechada. As chamadas seguem **Aprovar ferramentas MCP automaticamente**, como qualquer ferramenta MCP.

## Permissões

| Permissão | Para quê |
|---|---|
| `chat.read` | A lista, a conversa e suas mudanças, Open in Breezell |
| `chat.send` | Send e New conversation |
| `chat.approve` | Approve e Reject |
| `models.select` | Model (a lista e a troca de modelo) |
| `agent.tools` | As ferramentas `pin_note` e `list_notes` para o Agent |

O Breezell pergunta por cada permissão `chat.*` na primeira vez que o Chat Mirror a usa; `models.select` não traz risco e fica ativada enquanto você não a desativar. Se você recusar uma, o Chat Mirror diz o que não pode fazer e o resto continua funcionando. Você pode ativar ou desativar cada uma, ou todas de uma vez, em Breezell Console › Plugins › Instalados › Chat Mirror. As mensagens que ele envia contam como as suas.

`agent.tools` é perguntado uma só vez: na primeira vez que o Chat Mirror inicia. Se você recusar, as duas ferramentas ficam desligadas até você ativar a permissão, e a janela funciona como antes.

## Como é feito

- `window/` é a página. Ela só desenha e mostra todo texto com `textContent`, nunca como HTML: uma mensagem pode conter qualquer coisa.
- `src/extension.ts` abre a janela e repassa os dados entre ela e `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` e `show`.
- Model usa `vscode.breezell.models`: `list` ao abrir a janela ou quando ela recebe o foco, e `select` ao trocar.
- Enquanto uma resposta é escrita chegam mudanças, no máximo algumas por segundo; cada vez que o Breezell passa a fazer outra coisa (pensar, escrever, chamar uma ferramenta, terminar), o plugin lê a conversa de novo. As memórias vêm de `recalledMemories` e `memoryUse` de cada mensagem.
- Uma permissão recusada faz a chamada falhar com `BreezellPermissionDenied`, e a página transforma isso numa frase.
- As ferramentas são declaradas no `package.json` (`contributes.breezell.tools`: nome, descrição, `inputSchema`, `modes`) e executadas em `src/extension.ts` com `vscode.breezell.tools.register`. Elas são registradas na inicialização (`onStartupFinished`), então o Agent as tem antes de a janela abrir.
- Numa conversa lida com `chat.read`, a chamada a uma ferramenta de um plugin traz `plugin` (`{ id, name }`): a página mostra esse nome em vez do servidor `plugin:<id>`.
