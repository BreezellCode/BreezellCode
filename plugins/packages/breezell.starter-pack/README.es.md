# Starter Pack

Skills para revisar código y escribir pruebas, unas reglas breves del equipo, un servidor MCP para pensar y un tema oscuro tranquilo: sin código.

El ejemplo oficial de un paquete de plugins de Breezell: todo se declara en `package.json` › `contributes.breezell` (y `contributes.themes`); el paquete en sí no compila ni ejecuta código. Código fuente: [`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack).

## Qué añade

| | Dónde | Qué ves en Breezell |
|---|---|---|
| Skills `code-review`, `write-tests` | `skills/<nombre>/SKILL.md` | En la lista de skills, con el nombre del paquete; el agente las carga cuando encajan con la tarea |
| Reglas del equipo | `rules/house-rules.md` | Se añaden a las instrucciones de la IA mientras el paquete está activo |
| Servidor MCP `sequential-thinking` | `contributes.breezell.mcpServers` | En la lista de MCP, con el nombre del paquete; ejecuta `npx -y @modelcontextprotocol/server-sequential-thinking` (requiere Node.js) |
| Tema «Breezell Calm Dark» | `themes/calm-dark.json` | En el selector de temas de color |

Desactiva o quita el paquete en **Breezell Console › Plugins › Instalados** y todo esto desaparece. Una skill o un servidor MCP tuyo con el mismo nombre tiene prioridad sobre el del paquete.

## Crea el tuyo

Empieza con la plantilla **Pack** (Breezell Console › Plugins › Desarrollar, o `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`) y luego ejecuta `npm run package:open`.
