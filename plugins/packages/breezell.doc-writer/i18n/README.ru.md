# Doc Writer

Пишет документирующие комментарии и объясняет код с помощью вашей модели чата Breezell.

Официальный пример плагина Breezell, который обращается к модели (`vscode.breezell.models.request`). Исходники: [`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer).

## Как пользоваться

Выделите код, нажмите правую кнопку мыши и выберите:

- **Write Doc Comment** — вставляет над выделением документирующий комментарий в синтаксисе языка файла.
- **Explain Selection** — выводит объяснение по мере генерации в документ Markdown рядом с кодом.

Обе команды есть и в палитре команд в разделе «Doc Writer». Настройка `docWriter.language` задаёт язык комментариев и объяснений (по умолчанию английский).

## Разрешения и стоимость

Doc Writer запрашивает одно разрешение — `models.request`. Перед первым запросом Breezell спросит вас, и разрешение можно отозвать в любой момент в **Breezell Console › Плагины › Установленные**. Запросы идут через вашу текущую модель чата и учитываются так же, как ваши собственные запросы в чате.

## Что показывает пример

- Проверку `vscode.breezell` (вне Breezell он undefined).
- Обычный запрос (`writeDoc`) и потоковый с `onText` (`explain`).
- Отмену через токен отмены уведомления о ходе работы.
- Обработку каждого `name` ошибки: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellNoModel`, `BreezellRateLimited`, `BreezellCancelled`.
- `"extensionKind": ["ui", "workspace"]`, поэтому он работает и в окнах WSL и SSH.
