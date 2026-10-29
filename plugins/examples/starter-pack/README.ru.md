# Starter Pack

Навыки для ревью кода и тестов, короткие правила команды, MCP-сервер для размышлений и спокойная тёмная тема — без кода.

Официальный пример пакета плагинов Breezell: всё объявлено в `package.json` › `contributes.breezell` (и `contributes.themes`), сам пакет ничего не компилирует и не запускает. Исходники: [`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack).

## Что он добавляет

| | Где | Что видно в Breezell |
|---|---|---|
| Навыки `code-review`, `write-tests` | `skills/<имя>/SKILL.md` | В списке навыков с пометкой пакета; агент загружает их, когда они подходят к задаче |
| Правила команды | `rules/house-rules.md` | Добавляются к инструкциям ИИ, пока пакет включён |
| MCP-сервер `sequential-thinking` | `contributes.breezell.mcpServers` | В списке MCP с пометкой пакета; запускает `npx -y @modelcontextprotocol/server-sequential-thinking` (нужен Node.js) |
| Тема «Breezell Calm Dark» | `themes/calm-dark.json` | В выборе цветовой темы |

Выключите или удалите пакет в **Breezell Console › Плагины › Установленные** — и всё это исчезнет. Ваш навык или MCP-сервер с тем же именем важнее пакетного.

## Сделайте свой

Начните с шаблона **Pack** (Breezell Console › Плагины › Разработка или `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`), затем выполните `npm run package:open`.
