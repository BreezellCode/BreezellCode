# Isla de actividad

La barra de título de Breezell muestra lo que hace la IA en una cápsula que cambia de forma. Sal de Breezell o minimízalo mientras hay algo en marcha y la cápsula vuela a la parte superior de la pantalla, donde flota sobre todas las apps. Haz clic y se abre en un panel con tus conversaciones y las últimas palabras de cada respuesta. Vuelve, o deja que el trabajo termine, y regresa volando a la barra de título.

## Qué hace

- **Ocupa el centro de la barra de título.** En reposo muestra el nombre de tu área de trabajo, y un clic abre la búsqueda, como la barra de búsqueda. La campana de notificaciones y el botón de actualización siguen a su lado.
- **Cambia de forma mientras Breezell trabaja.** La cápsula se ensancha hasta el paso de la IA, con la marca del modelo, una onda y un reloj. Te avisa cuando un chat te espera, cuando termina un turno y cuánto tardó, y cuando algo sale mal, con un botón **Ver** que abre la conversación.
- **Muestra tareas.** Una tarea de compilación o de pruebas aparece en la cápsula cuando la IA está libre, y en una burbuja a su lado cuando está ocupada. **Ver** en una tarea fallida abre su terminal.
- **Flota fuera de la ventana mientras hay algo en marcha.** Cuando pasas a otra app o minimizas Breezell mientras la IA trabaja, te espera, acaba de terminar o ha fallado, o se ejecuta una tarea, la cápsula vuela desde la barra de título a la parte superior de la pantalla y se vuelve una píldora oscura sobre todo lo demás. Sin nada en marcha se queda en la barra de título, y cuando todo se calma vuelve volando a ella.
- **Se abre en un panel.** Haz clic en la píldora y se abre como una isla expandida: cuántos chats están en curso o te esperan, qué hace cada conversación, su reloj y las últimas palabras de su respuesta, y las tareas. Haz clic en una conversación para ir directo a ella, o en **Volver al editor**. Un clic fuera del panel, o Esc, lo cierra.
- **Todas las ventanas de Breezell a la vez.** Con varias ventanas abiertas, una sola isla fuera las muestra todas, la más urgente primero, y el panel las lista ventana por ventana con **Ir** para cambiar.

Lo que lee: el paso en que está la IA, qué modelo trabaja, cómo va una tarea de compilación o de pruebas y, si permites **Leer tus conversaciones**, los títulos de tus conversaciones y las últimas palabras de cada respuesta, solo para mostrarlos en el panel. Nada sale de tu ordenador.

## Qué permisos pide

- **Cambiar las pantallas de Breezell** (`ui.modify`): su página ocupa el centro de la barra de título. Breezell te pregunta cuando llega.
- **Mostrar la actividad de Breezell** (`activity.read`): el paso de la IA, el modelo y la tarea, nunca lo que dicen los mensajes. Activado salvo que lo desactives.
- **Hacer flotar una ventana pequeña sobre otras apps** (`ui.overlay`): la isla fuera de la ventana. Breezell te pregunta mientras estás en Breezell. Si lo rechazas, la isla se queda en la barra de título.
- **Leer tus conversaciones** (`chat.read`, opcional): los títulos y las últimas palabras de las respuestas en el panel. Breezell te pregunta mientras estás en Breezell. Si lo rechazas, el panel muestra en su lugar lo que hace la IA de cada ventana.
- **Añadir a Opciones de funciones** (`ui.contribute`): su ajuste en Box > Opciones de funciones.

## Ajustes

| Ajuste | Qué hace |
|---|---|
| `activityIsland.floatOutside` | Hace flotar la isla en la parte superior de la pantalla al salir de Breezell mientras hay algo en marcha. Desactivado: se queda en la barra de título |

También está en Box > Opciones de funciones. Con **Reducir movimiento** de Breezell activado, se mueve al instante.

## Windows, macOS y Linux

Flota en Windows, en macOS (también sobre apps a pantalla completa) y en Linux con X11.

**En una sesión de Wayland se queda en la barra de título.** Wayland no deja que una app coloque sus ventanas ni mantenga una sobre las demás, así que la isla no tiene adónde ir. El plugin te lo dice una vez. Con X11, o con Breezell iniciado con `--ozone-platform=x11`, flota.

Necesita Breezell 1.4.53 o posterior. Una versión anterior no lo instala.
