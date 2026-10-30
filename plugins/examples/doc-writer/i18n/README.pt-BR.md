# Doc Writer

Escreve comentários de documentação e explica código com o seu modelo de chat do Breezell.

O exemplo oficial de um plugin do Breezell que chama o modelo (`vscode.breezell.models.request`). Código-fonte: [`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer).

## Uso

Selecione um trecho de código, clique com o botão direito e escolha:

- **Write Doc Comment**: insere um comentário de documentação acima da seleção, na sintaxe de comentários da linguagem do arquivo.
- **Explain Selection**: mostra uma explicação, conforme é gerada, num documento Markdown ao lado do código.

Os dois também estão na paleta de comandos, em "Doc Writer". A configuração `docWriter.language` define o idioma dos comentários e das explicações (inglês por padrão).

## Permissões e custo

O Doc Writer pede uma única permissão, `models.request`. O Breezell pergunta antes da primeira solicitação, e você pode revogá-la quando quiser em **Breezell Console › Plugins › Instalados**. As solicitações usam o seu modelo de chat atual e contam exatamente como as suas próprias solicitações no chat.

## O que o exemplo mostra

- Verificar `vscode.breezell` (undefined fora do Breezell).
- Solicitações em streaming com `onText`: num documento ao lado do código (`explain`) e na notificação de progresso, com o comentário verificado inteiro antes de ser inserido (`writeDoc`).
- Cancelar pelo token de cancelamento da notificação de progresso.
- Tratar cada `name` de erro: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellNoModel`, `BreezellRateLimited`, `BreezellCancelled`.
- Verificar se a resposta é um comentário antes de colocá-la no código (`src/comment.ts`): os modelos nem sempre seguem as instruções, e uma resposta que não é um comentário aparece ao lado do código.
- `"extensionKind": ["ui", "workspace"]`, então também funciona em janelas WSL e SSH.
