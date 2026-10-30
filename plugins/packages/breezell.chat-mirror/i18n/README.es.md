# Chat Mirror

Tus conversaciones de Breezell en una ventana propia: elige una, léela con sus llamadas a herramientas y los recuerdos recuperados, responde y aprueba llamadas a herramientas.

El ejemplo oficial de un plugin de Breezell que lee conversaciones y participa en ellas. Código fuente: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Uso

- Ábrelo desde **Plugins** en la barra lateral de Box o con **Abrir** en Breezell Console › Plugins.
- A la izquierda están las conversaciones de este espacio de trabajo, las más recientes primero. Un punto marca la que está trabajando (ámbar: esperando tu aprobación).
- Elige una para leerla: tus mensajes con los recuerdos recuperados para ellos, las respuestas con su razonamiento y cada llamada a herramienta con sus parámetros y su resultado. La respuesta que se está escribiendo aparece abajo a medida que llega.
- Escribe un mensaje y pulsa **Send** (Ctrl+Enter) para responder, o **New conversation** para empezar una. La IA responde como si lo hubieras escrito en Breezell.
- Cuando una llamada a herramienta espera aprobación, pulsa aquí **Approve** (aprobar) o **Reject** (rechazar).
- **Open in Breezell** muestra la conversación en el chat de Breezell.

La interfaz de la ventana está en inglés.

## Permisos

| Permiso | Para qué |
|---|---|
| `chat.read` | La lista, la conversación y sus cambios, Open in Breezell |
| `chat.send` | Send y New conversation |
| `chat.approve` | Approve y Reject |

Breezell pregunta por cada uno la primera vez que Chat Mirror lo usa. Si rechazas uno, Chat Mirror dice lo que no puede hacer y el resto sigue funcionando. Puedes activar o desactivar cada uno, o todos a la vez, en Breezell Console › Plugins › Instalados › Chat Mirror. Los mensajes que envía cuentan como los tuyos.

## Cómo está hecho

- `window/` es la página. Solo dibuja y muestra todo el texto con `textContent`, nunca como HTML: un mensaje puede contener cualquier cosa.
- `src/extension.ts` abre la ventana y pasa los datos entre ella y `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` y `show`.
- Mientras se escribe una respuesta llegan cambios, como mucho unos pocos por segundo; cuando termina un paso, el plugin vuelve a leer la conversación.
- Un permiso rechazado hace que su llamada falle con `BreezellPermissionDenied`, y la página lo convierte en una frase.
