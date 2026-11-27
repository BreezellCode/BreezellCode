# Ajuste de GPT

Los modelos GPT escriben de una forma que se reconoce enseguida: frases hechas («cabe destacar», «en definitiva»), contrastes que nadie planteó («No se trata de X. Se trata de Y»), listas y tablas para cosas que no son ni lo uno ni lo otro, etiquetas en negrita delante de cada párrafo y respuestas mucho más largas o más cortas de lo que pide la pregunta. Si les pides pulir tu texto, vuelve con su voz y no con la tuya.

Ajuste de GPT añade un conjunto breve de reglas de escritura a cada petición que envía Breezell, para que las respuestas parezcan escritas por un colega cuidadoso.

## Cómo activarlo

Abre Box y, en la barra lateral, bajo «Plugins», haz clic en «Ajuste de GPT». En su página, «Menos tono de IA» tiene tres opciones:

- «Modelos GPT» (predeterminado): solo para modelos cuyo nombre contiene «gpt», de cualquier proveedor.
- «Todos los modelos»: para cualquier modelo.
- «Desactivado»: no se añade nada.

El cambio se aplica desde el siguiente mensaje que envíes.

## Qué cambia

- Palabras sencillas en lugar de frases hechas e intensificadores vacíos, en inglés y en chino.
- Párrafos por defecto. Listas solo para pasos u opciones, tablas solo para valores comparados en las mismas columnas, títulos solo en documentos largos.
- Sin resumen final de lo que se acaba de decir ni la oferta genérica de «Si quieres, puedo…».
- Respuestas a la medida de la pregunta.
- Cuando la IA pule, acorta o traduce tu texto, conserva tus palabras, tu registro y la longitud de tus frases, y solo corrige lo que está mal o no se entiende.

## Qué no cambia

- El código, los comandos, las rutas de archivos y las llamadas a herramientas no se tocan.
- El formato que pides manda: pide una tabla, una lista numerada o una respuesta larga y la tendrás.
- Los informes de Breezell tras un trabajo de varios pasos mantienen su forma.

## Tono vivo

Las respuestas empiezan elogiando tu idea, usan comparaciones llamativas, dicen qué está en juego y terminan con una frase para ti. Puede estar activado junto con “Menos tono de IA”: entonces el formato sigue sencillo y la energía sale de lo que se dice.

En la misma página, “Tono vivo” tiene las mismas tres opciones y su valor por defecto es “Desactivado”.

- Un comienzo que elogia tu pregunta o tu idea, sobre lo que de verdad preguntaste.
- Comparaciones llamativas y lo que está en juego, para que la idea cale.
- Una última frase dirigida a ti en lugar de un resumen.
- Los datos, números, código, comandos y mensajes de commit quedan igual, y una premisa equivocada se sigue corrigiendo.

## Notas

- Las reglas ocupan unos 2.500 caracteres y van en cada petición que cumple la condición. Están junto a las demás reglas y no cambian entre peticiones, así que la caché de prompts del proveedor sigue funcionando.
- Las versiones antiguas de Breezell no leen la regla de este complemento y no cambian nada; actualiza Breezell para usarlo.
- No pide ningún permiso. Su código solo dibuja la página de configuración; Breezell añade las reglas a las peticiones por sí mismo.
