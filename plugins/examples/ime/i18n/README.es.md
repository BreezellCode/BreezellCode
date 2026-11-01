# Breezell IME

Un método de entrada que conoce tu código y tu conversación: pinyin, zhuyin, pinyin doble, Wubi 86, japonés y coreano, en el editor y el chat de Breezell y, en Windows, en todos los programas.

## Qué hace

- **Escribe frases enteras.** Escribe una oración de una vez; un modelo de lenguaje la lee en contexto y acierta los caracteres en primer lugar mucho más a menudo de lo que puede un diccionario solo.
- **Distingue el código de los comentarios.** En el código escribe en inglés. En comentarios, cadenas o después de `///` en la línea escribe en tu idioma, sin que tengas que cambiar.
- **Usa lo que hay alrededor del cursor.** El código que editas y la conversación del chat ayudan a elegir las palabras, y nombres como `useState` se vuelven candidatos tal como están escritos allí.
- **Perdona los deslices.** En pinyin, las teclas pulsadas en otro orden, una tecla vecina o una tecla de más o de menos siguen encontrando la palabra (`jain` encuentra 简).
- **Mezcla inglés.** Escribe `hello` en pinyin y aparecerá entre los candidatos.
- **Ofrece las palabras siguientes** después de que confirmes texto en chino. Desaparecen a los pocos segundos o al hacer clic en otro lugar; **Predicción de palabras** en su página las desactiva.
- **Aprende de ti**, sin dejar que una elección puntual se extienda a todo lo demás.

## Primeros pasos

En **Breezell Console › Plugins**, pulsa **Instalar**. Eso es todo. Se configura solo:

- Windows pide permiso de administrador una vez, para añadir el método de entrada.
- Se descarga el idioma que corresponde al idioma de la interfaz de Breezell (japonés o coreano en esos casos, chino en los demás).
- Se activa solo. Su página muestra cómo va.

Si le dices que no a Windows, sigue funcionando en el editor de Breezell, y **Instalar en Windows…** en su página lo ofrece de nuevo. Para añadir otros idiomas o cambiar el método de entrada, abre **Breezell IME** en **Plugins** en la barra lateral:

| Idioma | Métodos de entrada | Descarga |
|---|---|---|
| Chino | Pinyin, zhuyin, pinyin doble (Flypy, Microsoft, Ziranma, Sogou, ABC, Ziguang, Pinyin Jiajia), Wubi 86 | 374 MB |
| Japonés | Romaji a kana y kanji | 189 MB |
| Coreano | Hangul de 2 conjuntos con sugerencias de palabras | 128 MB |

Los idiomas vienen de la release de GitHub de este plugin, y una descarga continúa desde donde se detuvo si se corta la conexión. Cada archivo se comprueba con su SHA-256 antes de usarlo. Cada idioma en el que escribes mantiene su modelo en memoria: unos 400 MB para el chino.

## Teclas

| Tecla | Qué hace |
|---|---|
| **Ctrl+Alt+Space** (macOS: **Ctrl+Option+Shift+Space**) | Activar o desactivar |
| **Ctrl+Alt+K**, o la barra de estado | Elegir el método de entrada |
| **Space** o un dígito (zhuyin: **Shift+dígito**) | Elegir un candidato |
| Flechas, **Page Up**, **Page Down** | Moverse por los candidatos |
| **Enter** | Confirmar lo que escribiste, tal cual |
| **Esc** | Descartarlo |
| **Backspace** | Deshacer una tecla |
| **Tab** | Tomar la primera palabra ofrecida a continuación |
| **Shift**, sola (con el método de entrada de Windows) | Cambiar entre tu idioma y el inglés |

## Todos los programas en Windows

En su primer inicio se añade como método de entrada de Windows, con el mismo motor y las mismas palabras aprendidas que en Breezell. Pasa a ser tu método de entrada predeterminado; **Win+Space** cambia a otro. También se activa al momento en los programas ya abiertos; no hace falta reiniciarlos.

Instala un servicio de texto en `Program Files\BreezellIME` y el host del motor en `%LOCALAPPDATA%\BreezellIME`, todo desde el paquete de este plugin; no se descarga código.

**Al quitar el plugin** se elimina de tu lista de métodos de entrada, se detiene el motor, se restablece el método de entrada predeterminado y se borran los idiomas de la carpeta predeterminada; lo aprendido se conserva. Los archivos del servicio de texto quedan en Program Files, sin usar: usa antes **Quitar de Windows…** en su página para quitarlos también.

En Linux y macOS funciona en el editor de Breezell; todavía no hay un método de entrada del sistema.

## Con versiones antiguas de Breezell

El panel de candidatos del editor y la escritura en el cuadro de chat necesitan un Breezell reciente. En versiones antiguas, los candidatos se muestran como texto después del cursor en el editor, y el cuadro de chat usa el método de entrada de tu sistema.

## Tus datos

- **Nada de lo que escribes sale de tu equipo.** La composición, el contexto alrededor del cursor y lo que aprende se quedan en él. El plugin solo se conecta para descargar los idiomas que elijas.
- **Permisos:** no pide ninguno de los permisos de plugins de Breezell. Como método de entrada recibe las teclas que pulsas en el cuadro de chat de Breezell y la conversación reciente, para elegir las palabras; Breezell se las da solo a este plugin.
- Lo que aprendió está en `%APPDATA%\BreezellIME` (Windows), `~/Library/Application Support/BreezellIME` (macOS) o `~/.config/breezell-ime` (Linux). **Borrar palabras aprendidas** en la página hace que lo olvide.
- Como todo plugin de Breezell, necesita que hayas iniciado sesión. El método de entrada de Windows, una vez instalado, sigue funcionando después de cerrar sesión, así que nunca te quedas sin poder escribir.

## Precisión

La proporción de oraciones en las que el primer candidato es exactamente correcto, con 1,000 oraciones por conjunto que no se usaron en el entrenamiento y con el aprendizaje desactivado. Los parámetros se ajustaron con otras frases; estos conjuntos se ejecutaron al final.

| Método de entrada | Texto | Breezell IME | Otros |
|---|---|---|---|
| Pinyin | Wikipedia | 66.4 | Rime 33.1, CyIME 38.2 |
| Pinyin | Subtítulos | 85.1 | Rime 62.6, CyIME 65.1 |
| Pinyin | Documentos técnicos | 78.3 | Rime 49.7, CyIME 61.3 |
| Zhuyin | Subtítulos de Taiwán | 82.4 | Rime 62.0, CyIME 54.6 |
| Zhuyin | Documentos de Python | 81.2 | Rime 61.4, CyIME 37.8 |
| Wubi 86, orden inteligente: sin elegir candidatos | Wikipedia | 81.4 | Rime 70.2 |
| Wubi 86, orden inteligente: sin elegir candidatos | Subtítulos | 87.6 | Rime 85.0 |
| Wubi 86, orden inteligente: sin elegir candidatos | Documentos técnicos | 91.9 | Rime 88.8 |
| Japonés | Corpus ITA | 66.5 | Mozc 58.9, CyIME 24.8 |
| Japonés | Wikipedia | 79.0 | Mozc 59.5, CyIME 33.1 |
| Japonés | Subtítulos | 83.8 | Mozc 74.3, CyIME 35.1 |

Los documentos de Vue y Python en los que se basan los conjuntos técnicos nunca se usaron para el entrenamiento. Rime es rime-ice para pinyin y su esquema oficial bopomofo para zhuyin. Las cifras de CyIME son de librime 1.16.1 de serie con sus esquemas y pesos, más el modelo de gramática Wanxiang; su propio librime modificado y su reordenador no se ejecutaron, y podrían dar mejor resultado. Las lecturas de Wikipedia y subtítulos en japonés se generaron con el diccionario de Mozc, así que ITA, con lecturas hechas por personas, es el más justo de los tres.

## Compilar desde el código fuente

El código fuente está en [`plugins/examples/ime`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/ime): `src` (el plugin), `engine` (el motor del método de entrada), `system` (el servicio de texto de Windows y el host) y `tools` (lo que construye los modelos).

```bash
npm install
npm test                 # pruebas de lógica
npm run package:open     # el .vsix, con su código fuente y source maps
```

Las DLL del servicio de texto se compilan en Windows con `system/windows/build.bat`.

## Licencia

GPL-3.0-or-later. Los diccionarios y modelos vienen de los proyectos indicados en [THIRD_PARTY_NOTICES.md](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/examples/ime/THIRD_PARTY_NOTICES.md).
