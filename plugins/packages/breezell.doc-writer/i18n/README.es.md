# Doc Writer

Escribe comentarios de documentación y explica código con tu modelo de chat de Breezell.

El ejemplo oficial de un plugin de Breezell que llama al modelo (`vscode.breezell.models.request`). Código fuente: [`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer).

## Uso

Selecciona código, haz clic derecho y elige:

- **Write Doc Comment**: inserta un comentario de documentación encima de la selección, con la sintaxis de comentarios del lenguaje del archivo.
- **Explain Selection**: muestra una explicación, a medida que se genera, en un documento Markdown junto al código.

Ambos están también en la paleta de comandos, bajo «Doc Writer». El ajuste `docWriter.language` fija el idioma de los comentarios y explicaciones (inglés por defecto).

## Permisos y coste

Doc Writer pide un solo permiso, `models.request`. Breezell te pregunta antes de la primera petición, y puedes revocarlo cuando quieras en **Breezell Console › Plugins › Instalados**. Las peticiones usan tu modelo de chat actual y cuentan exactamente igual que tus propias peticiones de chat.

## Qué muestra el ejemplo

- Comprobar `vscode.breezell` (undefined fuera de Breezell).
- Peticiones en streaming con `onText`: en un documento junto al código (`explain`) y en la notificación de progreso, con el comentario comprobado entero antes de insertarlo (`writeDoc`).
- Cancelar con el token de cancelación de la notificación de progreso.
- Tratar cada `name` de error: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellNoModel`, `BreezellRateLimited`, `BreezellCancelled`.
- Comprobar que la respuesta es un comentario antes de ponerla en el código (`src/comment.ts`): los modelos no siempre siguen las instrucciones, y una respuesta que no es un comentario se muestra junto al código.
- `"extensionKind": ["ui", "workspace"]`, así que también funciona en ventanas de WSL y SSH.
