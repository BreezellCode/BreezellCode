# Mascota de escritorio

Un pequeño espíritu del viento de estilo anime que se sienta sobre tu cuadro de chat y te acompaña mientras la IA trabaja.

Nunca lee tus mensajes. Breezell solo le dice qué está haciendo el chat (pensar, escribir, ejecutar una herramienta, esperarte) y si el turno salió bien, sin ningún texto.

## Qué hace

- **Sigue el chat.** Burbujas de pensamiento mientras la IA piensa, un cartel cuando te espera, confeti cuando termina un turno y unas palabras cuando falla. Sabes lo que pasa con solo mirar de reojo.
- **Crece contigo.** Cada turno terminado le da experiencia. Sus doce niveles siguen la escala de Beaufort, de ventolina a huracán.
- **Le gusta que le hagan caso.** Haz clic o acarícialo, dale de comer y juega con él desde su tarjeta. La tarjeta se abre con el botón derecho.
- **Se queda donde lo pones.** Arrástralo a lo largo del cuadro o incluso encima del chat, y bajará flotando. A veces pasea solo y se duerme cuando no pasa nada. Su pelo se mueve con el viento y parpadea.

## Qué necesita

- **Cambiar las pantallas de Breezell** (`ui.modify`): flota sobre el cuadro de chat. Breezell te lo pregunta cuando llega.
- **Saber cuándo empieza y termina un turno** (`chat.events`): solo el estado del chat, sin contenido.

Todo lo que dibuja se queda dentro de un marco pequeño. Cuando algo te está esperando, se hace pequeño y no molesta.

## Ajustes

| Ajuste | Qué hace |
|---|---|
| `deskPet.visible` | Mostrar la mascota. **Ocultar** en su tarjeta lo desactiva |
| `deskPet.size` | `small`, `medium` o `large` |
| `deskPet.speech` | Permitir que hable con bocadillos |

Estos ajustes también están en Box > Opciones de funciones. **Mascota de escritorio: Mostrar u ocultar** en la paleta de comandos la trae de vuelta.

Necesita un Breezell con acompañantes del cuadro de chat. En uno anterior se instala y no hace nada.
