# Objetivo

Da un objetivo a una conversación y la IA sigue trabajando hasta cumplirlo.

Normalmente la IA se detiene cuando cree que ya respondió. Con un objetivo, cada vez que se detiene se comprueba el trabajo frente a lo que pediste. Si aún no se cumple, envía por sí mismo el siguiente mensaje, diciendo lo que falta. Termina cuando se cumple, cuando no puede seguir sin ti o cuando llega a un límite que fijaste.

```
/goal pasan todas las pruebas del paquete parser y lint está limpio
```

## Cómo usarlo

Escribe `/goal` seguido de lo que debe cumplirse al terminar, elígelo en el menú que se abre con `/`, o pulsa **Objetivo** junto al cuadro de chat. Una franja sobre el cuadro muestra cómo va y no ocupa espacio si no hay objetivo.

| Comando | Qué hace |
| --- | --- |
| `/goal <lo que debe cumplirse>` | Define el objetivo de esta conversación y empieza. Uno nuevo reemplaza al anterior. |
| `/goal status` | Dice cómo va. |
| `/goal pause` | Se detiene tras el turno actual. No se envía nada más. |
| `/goal resume` | Sigue. |
| `/goal clear` | Lo quita. |

Cada conversación tiene su propio objetivo, y pueden funcionar varios a la vez.

## Límites

Un objetivo siempre tiene un límite de mensajes propios: 20 salvo que lo cambies. También puedes limitar tokens y tiempo. Los valores por defecto están en **Opciones de funciones › Objetivo**, o por objetivo, al principio o al final del mensaje:

```
/goal --rounds 10 --tokens 200k --minutes 30 el sitio se compila sin advertencias
```

En un límite se detiene y te avisa. `/goal resume` permite otro tanto de ese límite, o lo que indiques: `/goal resume --rounds 40`.

Los tokens son **tokens nuevos** desde que empezó el objetivo, según informa tu proveedor: entrada no leída de caché, salida y lo usado en comprobar el trabajo. Sirven para vigilar la marcha, no son una factura. Los subagentes y Cross-Check no están incluidos, y un proveedor que no informa no se cuenta (la franja lo indica).

## Qué lo detiene

- **El objetivo se cumple.** Tras cada turno, tu modelo de chat comprueba el trabajo por los comandos ejecutados, sus resultados y lo que cambió, no por lo que la IA dice.
- **No puede seguir.** Solo tú puedes hacerlo avanzar (una decisión, credenciales), o no se puede hacer.
- **Nada avanza.** Tres turnos seguidos sin usar herramientas.
- **Un límite.**
- **Tú.** Pulsa Detener en la respuesta y se pausa. No envía nada hasta que lo reanudes o definas otro objetivo.

Mientras un comando que inició siga en segundo plano, espera a que termine. Un servidor o un observador no cuentan como algo que esperar.

El sonido y el aviso de finalización llegan una vez, cuando el objetivo termina de verdad. Los errores avisan al momento.

## Lo que no hace

- Nunca aprueba una llamada a herramienta. Si un comando necesita tu aprobación, el objetivo te espera.
- No empieza por sí solo. Tras un reinicio o cerrar sesión, un objetivo en curso queda en pausa hasta que lo reanudes.
- Sus mensajes no se hacen pasar por tuyos. Aparecen en el chat con su nombre, la IA sabe que no los escribiste y no acaban en tus recuerdos.

## Permisos

Breezell los pide la primera vez que hacen falta, y puedes desactivar cada uno en Plugins › Instalados.

| Permiso | Para qué |
| --- | --- |
| `chat.events` | Saber cuándo termina un turno. |
| `chat.read` | Leer la conversación con objetivo para comprobar el trabajo. |
| `chat.send` | Enviar el siguiente mensaje y retener el sonido hasta el final. |
| `models.request` | Comprobar el trabajo con tu modelo de chat. Se factura como cualquier solicitud tuya. |
| `ui.contribute` | El botón, la franja y los ajustes. |
| `chat.intercept` (opcional) | Reconocer `/goal` en el cuadro de chat. Solo responde a mensajes que empiezan por `/goal`; los demás pasan intactos y no se guardan. Sin él, usa el botón. |
| `agent.tools` (opcional) | Que la IA informe de que terminó o está bloqueada. Sin él, decide la comprobación tras cada turno. |

Solo lee las conversaciones a las que diste un objetivo, y lo que lee solo va a tu propio modelo de chat.

## Requisitos

Un Breezell posterior a 1.4.41. En uno anterior se instala y no hace nada, y lo explica al pulsar su comando.

## Licencia

MIT
