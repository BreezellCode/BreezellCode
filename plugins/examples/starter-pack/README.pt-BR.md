# Starter Pack

Skills de revisão de código e de testes, regras curtas do time, um servidor MCP para raciocínio e um tema escuro tranquilo: sem código.

O exemplo oficial de um pacote de plugins do Breezell: tudo é declarado em `package.json` › `contributes.breezell` (e `contributes.themes`); o pacote em si não compila nem executa código. Código-fonte: [`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack).

## O que ele adiciona

| | Onde | O que aparece no Breezell |
|---|---|---|
| Skills `code-review`, `write-tests` | `skills/<nome>/SKILL.md` | Na lista de skills, com o nome do pacote; o agente as carrega quando combinam com a tarefa |
| Regras do time | `rules/house-rules.md` | Somadas às instruções da IA enquanto o pacote está ativo |
| Servidor MCP `sequential-thinking` | `contributes.breezell.mcpServers` | Na lista de MCP, com o nome do pacote; executa `npx -y @modelcontextprotocol/server-sequential-thinking` (requer Node.js) |
| Tema "Breezell Calm Dark" | `themes/calm-dark.json` | No seletor de temas de cor |

Desative ou remova o pacote em **Breezell Console › Plugins › Instalados** e tudo isso some. Uma skill ou servidor MCP seu com o mesmo nome tem prioridade sobre o do pacote.

## Faça o seu

Comece pelo modelo **Pack** (Breezell Console › Plugins › Desenvolver, ou `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`) e depois execute `npm run package:open`.
