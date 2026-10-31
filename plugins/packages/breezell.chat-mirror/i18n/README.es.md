# Chat Mirror

Tus conversaciones de Breezell en una ventana propia: elige una, léela con sus llamadas a herramientas y los recuerdos recuperados, responde, aprueba llamadas a herramientas y cambia el modelo del chat.

El ejemplo oficial de un plugin de Breezell que lee conversaciones y participa en ellas. Código fuente: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## Uso

- Ábrelo desde **Plugins** en la barra lateral de Box o con **Abrir** en Breezell Console › Plugins.
- A la izquierda están las conversaciones de este espacio de trabajo, las más recientes primero. Un punto marca la que está trabajando (ámbar: esperando tu aprobación).
- Elige una para leerla: tus mensajes con los recuerdos usados para ellos (contados como en el chat de Breezell: residentes y relevantes), las respuestas con su razonamiento y cada llamada a herramienta con sus parámetros y su resultado.
- Mientras Breezell prepara una respuesta, la última burbuja muestra qué está haciendo y desde hace cuánto (pensando, ejecutando una herramienta, esperando tu aprobación), su razonamiento y el texto a medida que llega.
- Escribe un mensaje y pulsa **Send** (Ctrl+Enter) para responder, o **New conversation** para empezar una. La IA responde como si lo hubieras escrito en Breezell.
- Cuando una llamada a herramienta espera aprobación, pulsa aquí **Approve** (aprobar) o **Reject** (rechazar).
- **Open in Breezell** muestra la conversación en el chat de Breezell.
- **Model**, junto a **Send**, cambia el modelo del chat de Breezell. Es el mismo ajuste que el selector de modelo del chat de Breezell, así que un cambio en un lado se ve en el otro (aquí, cuando la ventana recibe el foco).
- **Pinned notes** (notas fijadas), bajo las conversaciones: las notas que el Agent de Breezell fijó con la herramienta `pin_note` de Chat Mirror, las más recientes primero. **Unpin** quita una.
- La llamada a una herramienta de un plugin muestra el nombre del plugin y **Plugin tool** (también el propio `pin_note` de Chat Mirror); una herramienta MCP muestra su servidor.

La interfaz de la ventana está en inglés.

## Herramientas para Agent

Chat Mirror da al Agent de Breezell dos herramientas propias (`agent.tools`, «Registro de herramientas de Agent»). Cada una indica los modos en que se ofrece; en los demás modos el Agent ni la ve ni puede llamarla.

| Herramienta | Modos | Qué hace |
|---|---|---|
| `pin_note` | Chat, Agent, Entanglement | Fija una nota (un título y su texto) en esta ventana |
| `list_notes` | Chat, Agent, Entanglement, Analizar, Teams | Lee las notas fijadas, de la más reciente a la más antigua |

Pruébalo en Chat: «Fija una nota en Chat Mirror: publicar 1.4.42 el lunes». Las notas se guardan en tu equipo con los datos del plugin, también con la ventana cerrada. Sus llamadas siguen **Aprobar herramientas MCP automáticamente**, como cualquier herramienta MCP.

## Permisos

| Permiso | Para qué |
|---|---|
| `chat.read` | La lista, la conversación y sus cambios, Open in Breezell |
| `chat.send` | Send y New conversation |
| `chat.approve` | Approve y Reject |
| `models.select` | Model (la lista y el cambio de modelo) |
| `agent.tools` | Las herramientas `pin_note` y `list_notes` para el Agent |

Breezell pregunta por cada permiso `chat.*` la primera vez que Chat Mirror lo usa; `models.select` no implica riesgo y está activado mientras no lo desactives. Si rechazas uno, Chat Mirror dice lo que no puede hacer y el resto sigue funcionando. Puedes activar o desactivar cada uno, o todos a la vez, en Breezell Console › Plugins › Instalados › Chat Mirror. Los mensajes que envía cuentan como los tuyos.

`agent.tools` se pregunta una sola vez: la primera vez que Chat Mirror se inicia. Si lo rechazas, las dos herramientas quedan desactivadas hasta que actives el permiso, y la ventana funciona como siempre.

## Cómo está hecho

- `window/` es la página. Solo dibuja y muestra todo el texto con `textContent`, nunca como HTML: un mensaje puede contener cualquier cosa.
- `src/extension.ts` abre la ventana y pasa los datos entre ella y `vscode.breezell.chat`: `listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject` y `show`.
- Model usa `vscode.breezell.models`: `list` al abrir la ventana o cuando recibe el foco, y `select` al cambiar.
- Mientras se escribe una respuesta llegan cambios, como mucho unos pocos por segundo; cada vez que Breezell pasa a hacer otra cosa (pensar, escribir, llamar a una herramienta, terminar), el plugin vuelve a leer la conversación. Los recuerdos salen de `recalledMemories` y `memoryUse` de cada mensaje.
- Un permiso rechazado hace que su llamada falle con `BreezellPermissionDenied`, y la página lo convierte en una frase.
- Las herramientas se declaran en `package.json` (`contributes.breezell.tools`: nombre, descripción, `inputSchema`, `modes`) y se ejecutan en `src/extension.ts` con `vscode.breezell.tools.register`. Se registran al arrancar (`onStartupFinished`), así que el Agent las tiene antes de que se abra la ventana.
- En una conversación leída con `chat.read`, la llamada a una herramienta de un plugin lleva `plugin` (`{ id, name }`): la página muestra ese nombre en lugar del servidor `plugin:<id>`.
