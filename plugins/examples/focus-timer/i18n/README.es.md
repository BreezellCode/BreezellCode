# Focus Timer

Un temporizador Pomodoro en su propia ventana, que también se abre desde un acceso directo sin abrir el editor.

El ejemplo oficial de un plugin de ventana de Breezell. Código fuente: [`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer).

## Uso

- Ábrelo desde **Plugins** en la barra lateral de Box, con **Abrir** en Breezell Console › Plugins o con el elemento **⌚ Timer** de la barra de estado. Mientras corre, la barra de estado muestra el tiempo restante.
- Sin el editor: en Breezell Console › Plugins › Instalados, **Añadir al menú Inicio** (Windows), **Añadir al menú de aplicaciones** (Linux) o **Añadir a Aplicaciones** (macOS) crea un acceso directo que abre solo esta ventana. Como todo plugin, necesita la sesión de Breezell iniciada; si no, Breezell se abre como siempre.

La duración del foco y del descanso, el sonido al final de cada fase y las sesiones de hoy se guardan en el almacenamiento propio de la ventana. Si Breezell abrió la ventana, también muestra los turnos de la conversación con la IA (permiso `chat.events`).

## Cómo está hecho

- `package.json` › `contributes.breezell.windows` declara la ventana: su página, su tamaño y `"requiresEditor": false` para que pueda abrirse sola; `contributes.breezell.launcher` la abre desde las páginas de plugins y la barra lateral.
- `window/` es la página. Carga `/__breezell/api.js` para tener `window.breezell` (`postMessage`, `onMessage`, `connected`). La ventana se ejecuta en un sandbox: sin Node, sin red, solo los archivos del plugin.
- `src/extension.ts` abre la ventana con `vscode.breezell.windows.open('timer')` y le pasa los turnos.
- `"extensionKind": ["ui", "workspace"]`: las ventanas necesitan el plugin en este equipo.
