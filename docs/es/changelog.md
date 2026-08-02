---
editLink: false
next: false
---

# Registro de cambios

## 1.2.7 · 2026-07-29

### Nuevas funciones

- Mejoramos la comprensión y la eficiencia de navegación en bases de código grandes.
- Añadimos indicadores opcionales de calidad de respuesta que muestran la evaluación de la calidad de esta respuesta, la comprensión de requisitos y la confianza de verificación.
- Los detalles de las estadísticas de caché ahora admiten paginación, filtros vinculados y varios idiomas.

### Correcciones

#### Control de código fuente y tiempo de ejecución del Agent

- Corregimos el campo de mensaje de commit que quedaba vacío o no era válido después de actualizar un repositorio de control de código fuente, cambiar de vista o reconstruir componentes.
- Corregimos los bloqueos del razonamiento del Agent, la detección incorrecta del estado del terminal, la pérdida de códigos de salida de comandos en segundo plano y la finalización prematura de tareas.
- Corregimos problemas al editar mensajes de la cola, los comentarios de llamadas de herramientas, la restauración de listas de tareas y el estado de turnos consecutivos.

#### Chat y entornos remotos

- Corregimos el truncamiento prematuro de la conversación original al editar y reenviar mensajes. Ahora los mensajes se reemplazan atómicamente después de completar la validación.
- Corregimos problemas de rutas remotas en WSL y Remote SSH, y mejoramos el inicio del host, los reintentos de contraseña y la caché del servidor.

#### Renderizado, modelos y estado

- Corregimos el análisis de fórmulas en bloque de KaTeX, los temas de bloques de código, el renderizado de fuentes chinas y la alineación de iconos de archivos.
- Corregimos casos en los que algunos modelos mostraban respuestas vacías, exponían pilas de errores o enviaban solicitudes de red anómalas al proveedor.
- Corregimos la reaparición de contenido eliminado en Super Memory y los cambios inesperados de estado del panel del navegador.

### Mejoras

#### Búsqueda y ejecución del Agent

- Optimizamos la búsqueda, las llamadas de herramientas, la ejecución de tareas y la lógica de finalización del Agent para reducir conclusiones repetidas, esperas innecesarias e interrupciones anómalas.
- Optimizamos los límites de resultados, los tiempos de espera de ejecución y el estado de streaming de las búsquedas de código grandes para reducir el consumo de recursos de conjuntos de resultados excesivos.

#### Experiencia de chat

- Mejoramos el estado de finalización del chat, la barra de herramientas inferior, la posición del desplazamiento y la carga de conversaciones largas.

#### Configuración y uso

- Rediseñamos las tarjetas de cuentas de modelos e inicio de sesión OAuth para unificar la jerarquía visual y los patrones de interacción en la página de configuración.
- Mejoramos el uso de Codex, los metadatos de modelos y los indicadores de estado relacionados.

## 1.2.6 · 2026-07-27

### Añadido

#### Git del chat a nivel de sesión

- Ahora se pueden enviar juntos los cambios de código generados por IA en una misma sesión.
- Añadimos la detección y el procesamiento simultáneos de varios repositorios Git.
- El estado de las tareas del chat y de la revisión de código ahora se sincroniza automáticamente después del envío.

#### Proveedores, modelos y capacidades

- Añadimos el proveedor **Poolside Platform**, con acceso a **Poolside Laguna** mediante una configuración compatible con OpenAI.
- Añadimos configuraciones para los modelos **Qwen3.8**, **Opus 5** y **Pangu**.
- Mejoramos **LongCat** con reproducción de inferencia para conservar el contexto de razonamiento después de las llamadas de herramientas.

#### Seguridad del espacio de trabajo remoto

- Añadimos una advertencia de seguridad al acceder al directorio raíz de Linux `/` en un entorno remoto.
- Las rutas del sistema de archivos virtual de Linux, como `/proc`, `/sys` y `/dev`, ahora se excluyen automáticamente.

### Mejoras

#### Revisión de código

- Rediseñamos la barra de acciones **Aceptar/Rechazar** de cada bloque de código.
- Actualizamos **Conservar todo** para que siga el color de énfasis del tema actual.
- Reducimos la altura de las barras de acciones en línea para ofrecer un área de código más compacta.
- Las barras de acciones de revisión ahora se contraen y restablecen automáticamente después de un commit de Git correcto.

#### Selector de modelos

- Después de introducir una clave por primera vez, solo se activan cinco modelos recomendados de forma predeterminada para reducir la redundancia de la lista.
- Las capacidades de los proveedores compatibles con OpenAI ahora se adaptan al formato de API seleccionado.

#### Envío de código y actualización de SCM

- El estado de Git en la barra de actividad ahora se actualiza automáticamente después de guardar archivos.
- Los envíos de Chat Git ahora se tratan de forma uniforme como **Conservar todos los cambios**, completando automáticamente los pasos de revisión de código correspondientes.

#### Interfaz

- Eliminamos el indicador de no leídos de los títulos de las notificaciones.
- Mejoramos el cambio de menús al pasar el cursor sobre grupos de modelos compatibles con OpenAI.
- Corregimos la alineación vertical del texto de cantidad de herramientas.
- Activamos el estilo de iconos Kimi Mono en el tema claro.

### Correcciones

#### WSL y Git remoto

- Corregimos un bloqueo al iniciar el host de extensiones de WSL.
- Corregimos la configuración incoherente del proxy del servidor WSL.
- Las comprobaciones de estado de Git y los mensajes de commit generados por IA en entornos WSL y SSH ahora se ejecutan mediante un canal consciente del entorno remoto.
- Impedimos que los comandos Git de espacios de trabajo remotos se ejecuten sobre rutas locales.
- Corregimos un problema por el que el Agent cerraba automáticamente los repositorios Git después de modificar archivos.
- Corregimos la visualización incorrecta de rutas relativas en URI remotas.

#### Remote SSH

- Corregimos el tratamiento de la caducidad de contraseñas en Remote SSH. Las contraseñas guardadas ahora se eliminan cuando el servidor las rechaza y se solicita volver a introducirlas durante el mismo intento de conexión.
- Impedimos que Remote SSH descargue paquetes de servidor REH con hashes de commit que no coincidan, evitando errores de versión y fallos al iniciar el host remoto.

#### Renderizado del chat

- Añadimos compatibilidad con Trusted Types para gráficos Mermaid.
- Mejoramos la sanitización de etiquetas Mermaid para evitar que etiquetas inseguras o mal formadas provoquen fallos de renderizado.

#### Reglas y memoria

- Corregimos el guardado de contenido vacío después de que el editor perdiera el foco.
- Corregimos que el administrador de recursos no se actualizara a tiempo después de cambios en la configuración `.breezell`.

#### Vista de árbol remota

- Dejamos de emitir repetidamente errores sin sentido en la vista de árbol cuando falta la configuración de SSH Hosts.

## 1.2.5 · 2026-07-22

### Añadido

- Añadimos integraciones de proveedores y modelos para **Tencent Hunyuan HY3** y **TokenHub**.
- Añadimos **Gemini 3.6 Flash** y **Gemini 3.5 Flash-Lite**, ambos disponibles oficialmente para todos los usuarios.
- Añadimos insignias de proyecto a los historiales de chat en espacios de trabajo de varias raíces.
- Ampliamos la compatibilidad de capacidades para canales de proveedores compatibles.
- Añadimos traducciones de interfaz para japonés, español, portugués y otros idiomas.
- Actualizamos la guía del protocolo OpenAI con dos recomendaciones más claras:
  - Los endpoints compatibles con OpenAI usan el protocolo OpenAI de forma predeterminada.
  - Recomendamos la Responses API para modelos GPT.

### Correcciones

- Corregimos un problema por el que los nuevos elementos de tareas pendientes permanecían en **Esperando confirmación**.
- Corregimos que los planes de varias etapas exigieran hacer clic manualmente en **Continuar** después de cada lote.
- Corregimos que las barras de duración, Revisión, Git y acciones de herramientas siguieran resaltadas y activas después de volver a un punto de control.
- Corregimos la sincronización incorrecta de las restricciones de acceso en el panel de dibujo y mejoramos los mensajes de restricción poco claros.
- Corregimos que los lienzos vacíos no recibieran un nodo predeterminado al abrirse por primera vez.
- Corregimos fugas o mezclas de sesiones del modo Chat entre varias ventanas.
- Corregimos que la selección de modelos volviera a un modelo no disponible después de eliminar el modelo seleccionado.
- Corregimos el funcionamiento incorrecto del almacenamiento provisional de un solo archivo en Chat Git.
- Corregimos problemas de commit y actualización en espacios de trabajo con varios repositorios.
- Corregimos la pérdida de historiales de chat después de añadir una carpeta al espacio de trabajo.
- Corregimos la ausencia de iconos de la barra de actividad en entornos WSL y SSH.
- Corregimos el parpadeo de la lista de proyectos en el Explorador.
- Corregimos que las comprobaciones simultáneas del estado de Git en la vista del repositorio sobrecargaran el host de extensiones.
- Corregimos que una salida `****` mal formada interrumpiera los streams de razonamiento de OpenAI.
- Corregimos el estilo del botón de cierre de las burbujas de edición.

### Mejoras

- Simplificamos las tarjetas de inicio de la página de bienvenida con mosaicos discontinuos y unificamos los iconos de Revisión de código.
- Actualizamos el texto secundario de Super Memory para usar cursiva.
- Consolidamos las tarjetas de proveedores en la página de configuración.
- Mejoramos la disposición del título de los diálogos de configuración de red.
- Mejoramos la localización del selector de modelos vacío y permitimos abrir directamente Configuración desde el selector.
- Garantizamos que la capacidad `supportsFast` del directorio en segundo plano se transmita correctamente por el flujo de solicitudes.
- Corregimos la información de precios de **Qwen 3.7**.

## 1.2.4 · 2026-07-20

### Nuevas funciones

#### Modelos y proveedores

- Integramos **Grok 4.5**, con intensidad de inferencia ajustable y un canal Fast; **Claude Sonnet 5** está disponible con contextos de **200K** y **1M**.
- Añadimos **Kimi K3** mediante los canales Moonshot API y Kimi Code, con contextos de **256K** y **1M**, además de compatibilidad completa con **Kimi K2.7 Code**.
- Añadimos el proveedor **StreamLake**, con toda la familia de modelos KAT-Coder de Kuaishou, preajustes integrados de Coding Plan y preajustes de endpoints de pago por uso.
- Añadimos inicio de sesión OAuth para cuentas de Grok.
- Rediseñamos los canales Fast: pasaron de ser un interruptor global a una configuración independiente de **proveedor + modelo**, para que Copilot, Codex, Claude y otros proveedores usen la semántica de sus canales oficiales.
- Las configuraciones compatibles con OpenAI ahora se pueden fijar para mantener arriba los canales usados con frecuencia.
- Añadimos compatibilidad con pruebas y descuentos de modelos por tiempo limitado, con insignias promocionales en el selector de modelos.
- Actualizamos el directorio de modelos con modelos insignia actuales, como Claude Fable 5, Claude Sonnet 5, Nemotron 3 Ultra, DeepSeek V4, GLM-5.2 y MiniMax M3, y eliminamos entradas obsoletas.

#### Uso, apariencia e interfaz

- Actualizamos el Centro de uso con visualización multilingüe del uso y la hora de restablecimiento de Codex, Kimi y Copilot en chino simplificado, chino tradicional, coreano y ruso. Los datos de Configuración y de la barra lateral del chat ahora se sincronizan en tiempo real, y el uso de Copilot muestra por separado Chat, Completions y Premium Requests.
- Los títulos de la página de bienvenida ahora se pueden personalizar globalmente o por modo, incluido el tamaño y el peso de la fuente. Añadimos el estilo **Elegant** para los accesos rápidos.
- Añadimos japonés, español y portugués brasileño como idiomas de interfaz.
- Rediseñamos el centro de notificaciones para que siga el idioma del producto, actualizamos el diseño de las tarjetas de Super Memory y suavizamos el aspecto del campo de entrada y las burbujas de mensajes.

#### Navegador, chat y espacio de trabajo

- El navegador integrado ahora permite silenciar todas las pestañas o una pestaña individual, con sincronización en tiempo real entre la lista de pestañas del panel y el navegador.
- Los mensajes de chat ahora pueden incluir hasta **10 imágenes**; se redimensionan automáticamente y se incluyen en el cálculo de contexto. Añadimos la duración del turno, la reversión con un clic dentro de los mensajes y opciones para abrir enlaces en el navegador externo o integrado.
- El diálogo de commit del chat ahora admite espacios de trabajo con varios repositorios: genera información de commit por repositorio, permite enviarlos de forma independiente, inicializa repositorios directamente desde el diálogo y conserva el progreso de commit/push tras reiniciar.
- Añadimos agrupación de proyectos en el administrador de recursos y actualizaciones más oportunas del estado de colaboración entre varias ventanas.
- Añadimos memoria persistente, que destila automáticamente el historial de conversaciones en experiencias reutilizables con deduplicación multilingüe.

#### Diagnóstico y productividad

- Añadimos visualización de caché con notificaciones por turno e informes diarios del espacio de trabajo que comparan hoy y ayer, con filtros de sesión/espacio de trabajo, ahorro estimado y análisis de fallos de caché.
- Añadimos tarjetas de diseño interactivas capaces de generar borradores de diseño HTML directamente en el chat y aplicarlos después de confirmarlos.
- La configuración de red de proveedores ahora admite pruebas de velocidad paralelas con un clic entre conexión directa, proxy del sistema, proxy global y rutas personalizadas. Las rutas recomendadas se etiquetan automáticamente y las insignias de enrutamiento se actualizan en tiempo real en Configuración.
- Actualizamos el núcleo del visor PDF con una nueva barra de herramientas. Los adjuntos se contabilizan por página, se ocultan automáticamente cuando el contexto está limitado y están sujetos a los límites de volumen y páginas de cada modelo.

### Mejoras

- Rediseñamos la experiencia de comandos en segundo plano: las entradas de la barra de estado permanecen visibles hasta que los comandos terminan realmente, mientras que los comandos simultáneos se agrupan en un resumen desplegable.
- Ampliamos la autorización de funciones avanzadas y la compatibilidad con extensiones principales como Python y Pylance, además de mejorar la compatibilidad con el desarrollo remoto.
- Mejoramos la fiabilidad de instalación y actualización en redes nacionales.
- Hicimos más inteligente la compresión automática de contexto, activándola dinámicamente según el contexto disponible para reducir compresiones innecesarias.
- Las habilidades integradas ahora se activan bajo demanda y usan por defecto el modo ligero.
- Los Agents ahora completan planes de varias etapas sin detenerse para pedir confirmación, con respuestas más contenidas y centradas en los resultados.
- Optimizamos profundamente el flujo de solicitudes para reducir el coste de conversaciones largas.
- Rediseñamos los avisos de error con banners más discretos, paneles de detalles y una representación mixta chino-inglés más clara.
- Restauramos el selector de diseño de la barra de título, reorganizamos los accesos rápidos de las páginas de chat vacías y evitamos que los iconos de proveedores activen alertas del sistema.

### Correcciones

- Resolvimos el retraso y el uso anómalo de memoria en conversaciones largas, acelerando considerablemente la apertura de sesiones históricas y mejorando la fluidez de respuestas extensas.
- Los servidores MCP desactivados o sin conexión ya no exponen herramientas a los modelos, evitando llamadas accidentales; las conexiones MCP también se mantienen estables después de alternarlas y los errores de lectura de configuración ya no borran los ajustes guardados.
- Corregimos iconos de navegación de Configuración que aparecían en negrita incorrectamente, bloqueos en determinados entornos Linux y otros problemas de interfaz.
- Corregimos problemas al cargar sesiones anteriores que podían provocar bloqueos de la interfaz o un crecimiento ilimitado del almacenamiento.
- Corregimos estados falsos de «contexto comprimido»: la compresión real ahora se muestra explícitamente y se resolvieron la deriva de comprensión en conversaciones largas y las interferencias de memoria entre sesiones.
- Al eliminar un modelo o una configuración de canal activos, ahora se selecciona automáticamente una opción disponible en lugar de dejar vacíos los selectores.
- Al cambiar entre las pestañas Plan y Analysis se conserva el estado sin volver a cargar el contenido.
- Corregimos pantallas blancas ocasionales en el panel de dibujo, entradas obsoletas después de terminar comandos en segundo plano, problemas de la barra de desplazamiento de Configuración y otros detalles menores.
- Mejoramos la compatibilidad de parámetros entre modelos, incluida la edición de instrucciones, la detección de interrupciones de streaming, los límites del presupuesto de razonamiento y la alineación de documentos.

## 1.2.1 · 2026-07-08

Nos complace anunciar el lanzamiento de Breezell v1.2.1. Esta actualización incorpora mejoras en el control de código fuente, los comandos en segundo plano, los flujos de terminal, las habilidades, la compatibilidad con modelos, el tratamiento de tareas de imagen, el acabado de la interfaz y las interacciones de IA de larga duración. También incluye numerosas correcciones de estabilidad para la salida en streaming, la sincronización del estado del editor, la persistencia de sesiones, el comportamiento de varias ventanas y la autenticación.

### Nuevas funciones

- La vista de control de código fuente ahora admite detalles de commits expandibles y la navegación por archivos relacionados, haciendo el seguimiento de cambios más claro e intuitivo.
- Mejoramos la colaboración entre comandos en segundo plano y terminal, con estados de varias tareas y comentarios más claros cuando el usuario interrumpe una tarea manualmente.
- El panel de habilidades ahora funciona junto con el interruptor maestro de Superpowers, creando una ruta de configuración más unificada.
- La página de inicio de conversaciones ahora incluye accesos rápidos a funciones frecuentes, reduciendo el tiempo necesario para llegar a ellas.
- Actualizamos los elementos visuales de marca y los identificadores de interfaz en las pantallas de inicio y Team Mode.
- Ampliamos la compatibilidad y la adaptación de parámetros para la última generación de modelos de IA principales.
- Actualizamos la configuración de imágenes, incluido el seguimiento de estado para tareas asíncronas de estilo vídeo.
- Añadimos la primera fase de ejecución de scripts por lotes, diseñada para escenarios de automatización de varios pasos.

### Correcciones

- Corregimos problemas por los que el streaming de conversaciones de IA podía quedarse bloqueado, producir formatos anómalos o no recuperarse correctamente después de interrumpir tareas largas.
- Corregimos la aplicación repetida de herramientas de edición de código, comportamientos de navegación anómalos y la desincronización del estado del editor después de rechazar cambios.
- Corregimos retrasos de actualización en estadísticas de uso de contexto, anillos de progreso y mensajes de ayuda.
- Corregimos notificaciones de actualización de versión atascadas y varias cadenas sin traducir.
- Corregimos problemas de uso y visualización en Super Memory, la revisión de código y flujos de herramientas relacionados.
- Corregimos problemas de persistencia de sesiones y redujimos el retraso de la lista de historial al manejar hilos grandes o contenido pegado voluminoso.
- Corregimos que paneles superpuestos como MCP y Skills quedaran bloqueados durante las conversaciones.
- Corregimos interrupciones ocasionales del streaming durante salidas largas de tipo investigación.
- Corregimos que los recordatorios de finalización de tareas no se activaran cuando la ventana no tenía el foco.
- Corregimos la sobrescritura de ajustes entre varias ventanas y la desaparición inesperada de barras de operaciones por lotes.
- Corregimos sesiones de autenticación que exigían volver a iniciar sesión o mostraban estados incoherentes en determinados casos.

### Mejoras

- Actualizamos el tiempo de ejecución principal y las dependencias de IA para mejorar la estabilidad y compatibilidad generales.
- Optimizamos las estrategias de caché de prompts y llamadas de herramientas para reducir costes repetidos y mejorar la coherencia de las respuestas.
- Mejoramos el renderizado en streaming y la lógica de actualización de la interfaz para suavizar las conversaciones largas y las salidas de alta carga.
- Optimizamos el mecanismo de tiempo de espera de solicitudes LLM para que las tareas de generación largas tengan menos probabilidades de interrumpirse incorrectamente mientras siguen avanzando.

## 1.2.0 · 2026-07-06

Breezell v1.2.0 incorpora nuevas herramientas de IA, flujos de Agent más inteligentes, mejoras de interfaz, correcciones de estabilidad y optimizaciones de rendimiento en conversaciones largas, ejecución de herramientas, salida del terminal, aislamiento de memoria y desarrollo remoto.

### Herramientas de IA y capacidades inteligentes

- Añadimos la nueva herramienta **Agent Research**, con seguimiento del progreso y visualización de resultados en tiempo real.
- Añadimos ejecución de scripts por lotes en Code Mode como primera fase de la automatización de varios pasos.
- Añadimos un punto de entrada unificado para herramientas del navegador, consolidando acciones que antes estaban separadas en un flujo más sencillo.

### Conversación e interfaz

- Añadimos una **barra de mensajes** al área de chat para facilitar la navegación y el salto entre mensajes.
- Añadimos tarjetas de acceso rápido para **Super Memory** y **Revisión de código** en la página de inicio del chat.
- Añadimos un panel de alternancia rápida para **servidores MCP** en el área de entrada, que permite activarlos o desactivarlos sin abrir Configuración.
- Introdujimos una nueva identidad de marca, con actualizaciones visuales unificadas en la página de lanzamiento, la página de bienvenida y Teams Mode.
- Rediseñamos la interfaz de gestión de proveedores en Configuración, con navegación por lista y vistas detalladas.
- Añadimos colores de énfasis de tema personalizados, disponibles en los modos claro y oscuro.
- Actualizamos la configuración de imágenes a v2, con compatibilidad para sondear y seguir tareas de vídeo asíncronas.
- Añadimos informes de comprobación de estado para proveedores compatibles con OpenAI, facilitando el diagnóstico de problemas de conexión y configuración.

### Estabilidad

- Corregimos el retraso al cargar historiales de conversaciones largas y las respuestas lentas al pegar grandes bloques de contenido.
- Corregimos congelaciones ocasionales de la interfaz durante el streaming de IA, especialmente cuando el terminal producía mucha salida.
- Corregimos casos en los que la barra de acciones **Conservar todo / Deshacer todo** podía desaparecer inesperadamente.
- Corregimos la sobrescritura de ajustes al abrir varias ventanas simultáneamente.
- Corregimos problemas que impedían usar correctamente **Super Memory** en determinados modos.
- Corregimos interrupciones por tiempo de espera incorrectas durante la generación de IA para que las generaciones lentas pero sanas no se detengan demasiado pronto.
- Corregimos fallos de tokens de actualización que podían obligar a iniciar sesión repetidamente.
- Corregimos la pérdida de correspondencia correcta de resultados de herramientas cuando el usuario interrumpía con un mensaje nuevo.
- Corregimos la compresión silenciosa de resultados de herramientas que hacía que la IA repitiera la misma tarea.
- Corregimos la visualización imprecisa del código de salida del terminal y los casos en los que no se podía restaurar toda la salida.
- Corregimos la pérdida de mayúsculas del nombre de host y de la información de puerto en conexiones Remote SSH.

### Mejoras de rendimiento y experiencia

- Mejoramos la velocidad general de respuesta simplificando la superficie de herramientas de IA y reduciendo la sobrecarga del sistema en cada turno.
- Optimizamos las estrategias de búsqueda y lectura con un enfoque de «localizar primero y leer después por ventanas», reduciendo lecturas completas innecesarias.
- Añadimos aislamiento de memoria a nivel de espacio de trabajo para evitar que los recuerdos de distintos proyectos interfieran entre sí.

## 1.1.9 · 2026-06-26

### Nuevos modelos

- Añadimos compatibilidad con varios modelos nuevos de lenguaje, así como modelos de generación de imágenes y vídeo, ofreciendo más opciones.

### Nuevas funciones

- Los Agents ahora admiten investigación profunda, lo que facilita explorar cuestiones complejas con mayor profundidad.
- La barra lateral del chat ahora permite saltar con un clic al mensaje más reciente y copiar mensajes con un clic.
- La gestión de proveedores de servicios ahora admite un diseño de lista y la interfaz del mercado MCP se ha renovado.

### Mejoras de experiencia

- Refinamos los temas claro/oscuro, la interfaz del terminal y varios detalles de la interfaz para ofrecer una experiencia visual más limpia.

### Rendimiento y estabilidad

- Actualizamos el motor de tiempo de ejecución subyacente para mejorar el inicio y el funcionamiento.
- Los Agents ahora son más inteligentes y estables, reduciendo acciones repetitivas e ineficaces.
- Corregimos problemas relacionados con el inicio de sesión, el terminal, las conexiones remotas y varias áreas de la interfaz.

## 1.1.8 · Corrección de errores · 2026-06-09

- Añadimos una nueva validación para el ajuste de intensidad.
- Optimizamos los diálogos repetidos y el contexto inteligente automático.
- Corregimos problemas de desplazamiento en la página de conversación.
- Corregimos la compresión inestable.

## 1.1.7 · 2026-06-07

- Corregimos que el modelo de optimización fuera demasiado verboso.
- Corregimos un problema anómalo con el etiquetado de archivos en la revisión de optimización.
- Corregimos varios errores.

## 1.1.6 · 2026-06-06

### Añadido

- **Panel de revisión de código**: vista de revisión independiente, diferencias con números de línea, diferencias Myers para archivos grandes, reversión, selección de referencias/copia y envío al chat.
- **Configuración de apariencia**: ancho/posición de la barra de actividad, posición de la barra lateral y estilo de pestañas del editor.
- **Navegador Breezell**: interfaz del panel rediseñada, barra de dirección/búsqueda, modo incógnito y cierre automático cuando se cierra la última pestaña.
- **Panel de base de datos**: detección de SQLite del espacio de trabajo, CRUD completo para MongoDB/Oracle y renombrado de conexiones.
- **Mejoras del chat**: referencia a las 3 rondas recientes del historial, adjuntos, cita/copia de texto enriquecido, compresión manual de contexto y progreso de condensación.
- **Nuevos proveedores**: GitHub Copilot y Kimi Code (OAuth de dispositivo); optimización del uso/icono de Codex.
- **Super Memory**: interfaz sensible al tiempo (FreshBadge y tarjetas de recuperación).
- **Modelos/proveedores**: MiniMax M3, Opus 4.8 y glm-5.1; rediseño de la página de configuración compatible con OpenAI.
- **Centro de notificaciones**: pestañas en la barra lateral izquierda y diseño dividido más amplio.
- **Visualización de errores**: tarjetas de error estructuradas, detalles de error sin procesar expandibles y omisión de reintentos para errores permanentes.
- **Otros**: traducción al ruso y anillo/bandeja de uso de contexto.

### Correcciones

- **Agent/herramientas**: lectura siempre actualizada de archivos y sincronización de las herramientas de archivos con el disco.
- **Revisión/renderizado**: tablas GFM, espaciado de Explore y falta de memoria de Markdown/Mermaid en streaming durante sesiones largas.
- **Remoto/terminal**: cadena de herramientas SSH completa, redistribución del terminal de Windows, confusión de ID del terminal y bloqueo al cerrar pestañas.
- **Ajustes de interfaz**: el ajuste del ancho de la barra de actividad reduce el movimiento del panel; también se corrigieron la altura del panel de notificaciones, la redacción de días de conservación de Super Memory y otros detalles.

### Optimizaciones

- **Rendimiento**: mejora significativa de la tasa de aciertos de caché, del LCP de inicio/pantalla de carga y de la gestión de memoria de conversaciones largas.
- **Dependencias/base**: Electron 39.8 → 42.3.3.

## 1.1.5 · 2026-05-24

### Nuevas funciones

- **Cita y copia en el chat**: después de seleccionar texto en un chat, se puede convertir rápidamente en una cita Markdown o copiarlo directamente, conservando listas, bloques de código y etiquetas de nombres de archivo.
- **Notificación automática de comandos en segundo plano**: se envían notificaciones automáticamente cuando terminan tareas de terminal de larga duración, sin tener que comprobar el progreso repetidamente.
- **Renderizado de fórmulas matemáticas**: el chat ahora admite correctamente fórmulas matemáticas LaTeX, incluidas $x^2$ y $...$.
- **Rediseño de la visualización de errores**: los mensajes de error se muestran en tarjetas expandibles con copia del contenido completo en un clic.
- **Compatibilidad completa con desarrollo remoto SSH**: todas las llamadas de herramientas en hosts SSH remotos son compatibles.
- **Diagnóstico de bloqueos del streaming**: cuando una respuesta en streaming se detiene, los diagnósticos detallados indican si se debe a latencia ascendente, almacenamiento en búfer de red u otros motivos.
- **Barra de uso del contexto del modelo**: el selector de modelos muestra claramente por categoría el uso de tokens de la sesión actual.
- **Etiqueta «Modelo predeterminado»**: el selector de modelos identifica claramente el modelo predeterminado.
- **Actualización del panel de memoria a largo plazo**: nuevas etiquetas temporales como «Ahora mismo», «Hoy» y «Esta semana», estilo de cristal esmerilado y tarjetas de recuperación de memoria.
- **Mostrar el título del plan durante el streaming**: cuando el modelo genera un plan, su título aparece durante la salida en streaming.
- **Omisión automática de reintentos para errores permanentes**: los errores permanentes, como los fallos de autenticación, ya no provocan reintentos automáticos inútiles.
- **Compatibilidad con nuevos modelos**: añadimos modelos como Gemini 3.5 y Qwen 3.7.
- **Compatibilidad con la interfaz rusa**.
- **Tarjetas de herramientas del chat expandibles**: las salidas de herramientas como resultados de búsqueda y lecturas de archivos se pueden contraer y expandir.

### Correcciones

- Aumentamos el tiempo de espera de respuestas en streaming de 120 s a 180 s, con un aviso intermedio para modelos de inferencia más lenta.
- Corregimos el problema de capas de los menús desplegables de la página de configuración; los menús de proveedores de terceros ya no quedan ocultos.
- Corregimos la visualización de errores `[object Object]`.
- Corregimos el botón de copia del panel de errores que no funcionaba.
- Corregimos la congelación del cuadro de indicación de rutas de archivos, que ya no permanece tras desplazarse fuera de él.
- Optimizamos la combinación de colores de selección de texto del chat y corregimos variables de estilo que habían dejado de funcionar.
- Corregimos el desplazamiento pasante del selector de modelos: al desplazar el menú ya no se desplaza el área de chat inferior.
- Corregimos la compatibilidad del esquema para el modo de razonamiento y mejoramos la compatibilidad de parámetros de inferencia con el protocolo Claude.
- Optimizamos la vista previa en streaming de varios archivos; los indicadores de «N cambios» en tiempo real ya no se retrasan.
- Corregimos numerosos detalles de interfaz, incluidos desplazamiento, espaciado, alineación, animaciones y sugerencias.

### Optimizaciones

- **Actualización de la pila tecnológica subyacente**: Electron se actualizó a 42.2.0, con Chromium 148, Node.js 24 y V8 14.8.
- **Optimización de la gestión de memoria**: los historiales grandes del chat se escriben automáticamente en disco y los registros de inferencia se organizan según sea necesario para mantener ligeras las conversaciones largas.
- **Renderizado mejorado de gráficos Mermaid**: mejoramos la gestión de caché con limpieza activa de SVG al descargar, evitando la acumulación de memoria durante chats largos.

## 1.1.4 · 2026-04-26

### Nuevas funciones

- **Modelos de la serie DeepSeek V4**: añadimos elementos DeepSeek V4 a la lista/configuración de modelos para seleccionarlos directamente.
- **Interfaz de tarjetas «Slot» compatible con OpenAI**: rediseñamos la interfaz de tarjetas de las áreas de configuración compatibles con OpenAI.

### Correcciones

- Las barras laterales y la configuración ya no se «cuelgan»: después de cambiar de modelo y operar con reglas/memoria, se actualizan rápidamente sin reiniciar.
- Corregimos enlaces de archivos del chat que no se podían abrir o se analizaban incorrectamente.
- Hicimos más fiables las herramientas de terminal: ahora los comandos se ejecutan mediante el servicio de terminal del sistema.
- Corregimos los saltos y la altura errática del área de chat cuando aparecían o cambiaban de estado las tarjetas «Pensamiento/Contenido en streaming/Herramientas de terminal», así como un bloqueo causado por una referencia de variable.
- Actualizamos la vista previa de PDF y los comportamientos de uso/visualización de herramientas relacionadas.
- Corregimos la persistencia y el manejo de grandes volúmenes de resultados de herramientas para reducir anomalías o pérdidas de estado.
- Actualizamos los informes de errores LLM y los recursos de interfaz del área de chat.

### Optimizaciones

- Selección de paneles de modelos en el cuadro de entrada.
- Mayor estabilidad de las herramientas de terminal.

## 1.1.3-v2 · 2026-04-23

### Nuevas funciones

- Compatibilidad con el modelo GPT-5.5, añadido a todas las listas de proveedores.
- Añadimos el modelo Kimi K2.6, disponible en los principales proveedores (OpenRouter, Together AI, Fireworks, DeepInfra, etc.).
- Ahora se pueden mostrar fórmulas matemáticas en el chat (renderizado KaTeX).
- Ahora se pueden mostrar diagramas de flujo en el chat (renderizado de gráficos).
- Añadimos una herramienta de búsqueda web con control sobre la profundidad y los parámetros de tema.
- Actualizamos la herramienta de terminal al modo PTY para una experiencia más realista.
- Añadimos un índice de símbolos de código con compatibilidad para saltar a la definición.
- Añadimos una herramienta de análisis de dependencias (detección de ciclos, seguimiento de dependencias: archivos afectados por un cambio, cadena entre los archivos A y B y existencia de dependencias circulares).
- Skills ahora admite arrastrar y comprimir archivos y carpetas.
- Añadimos un indicador de estado de actualización de IDE a la barra de título.
- Renovamos por completo el panel multi-Slot: búsqueda, ordenación, comprobaciones de estado y limpieza por lotes de API no válidas.

### Correcciones

- Los chats largos ya no se congelan: corregimos el bloqueo de la interfaz al haber demasiados mensajes.
- El desplazamiento ya no vuelve al final al consultar el historial del chat.
- Corregimos fugas de subprocesos del terminal, evitando picos de memoria o bloqueos por procesos residuales.
- Corregimos la visualización de rutas de archivos: los enlaces ya no se convierten en rutas falsas por culpa de los puntos suspensivos.
- Corregimos el panel vacío de Super Memory; las etiquetas de razonamiento de IA ya no se filtran y dejan vacía la memoria.
- Corregimos el plegado de comandos del terminal: los comandos fallidos ya no quedan ocultos por comandos posteriores correctos.
- Corregimos el estilo del recordatorio flotante de tareas del plan, incluido el fondo de doble capa.
- Corregimos los saltos del chat al expandir la lista de archivos.
- La IA ya no pregunta repetidamente «¿continuar?» y ejecuta de forma autónoma (requiere autopruebas).
- Alineamos la barra de desplazamiento del cuadro de contenido de Skills.
- Corregimos casos en los que la ejecución reconocía el código de salida 0 aunque la compilación real había fallado.

### Optimización del rendimiento

- Optimizamos considerablemente el renderizado del chat.
- Añadimos memo al renderizado Markdown para evitar volver a analizar el mismo contenido.
- Optimización de memoria: ajustamos el umbral de persistencia de resultados de herramientas para evitar picos en conversaciones largas.
- Actualizamos el contador de tokens.
- Añadimos un límite superior LRU a la caché de mensajes.
- Nuevo diseño de la pantalla de inicio y del flujo de incorporación.

## 1.1.1 · 2026-04-11

### Nuevas funciones

- El panel de historial del chat ahora tiene un botón «Nueva conversación» para facilitar la operación.
- La funcionalidad de base de datos se amplió considerablemente: compatibilidad con Redis y MariaDB, confirmación al editar celdas, insignias con el número de tablas y apertura directa del panel de base de datos desde el chat.
- Las conversaciones de IA permiten cambiar entre los modos Plan/Agent para un flujo de trabajo más fluido.

### Correcciones y optimizaciones

- Corregimos la finalización de código repetida (finalización con Tab).
- Corregimos los saltos de página al enfocar la ventana del explorador de archivos.
- Corregimos informes falsos de desconexión al minimizar la ventana.
- Corregimos varios errores, como el índice de imágenes, las fugas de memoria IPC y los tiempos de espera LLM en el chat.
- Corregimos la pantalla blanca causada por el empaquetado de React y optimizamos el tamaño del paquete.
- Corregimos varios problemas, como paneles vacíos y deshacer en el comprobador CSS.
- Actualizamos a TypeScript 6.0 y Electron 41.2.0 para mejorar la estabilidad general.
- Pulimos ampliamente la interfaz: unificamos fondos y bordes de tarjetas de herramientas, alineamos iconos de pestañas del editor y corregimos el desplazamiento de bloques de diferencias, entre otros.

## 1.1.0 · 2026-04-09

### Nuevas funciones

- **Finalización de código gratuita**: todos los usuarios pueden usar ahora la finalización de código con IA sin configuración adicional.
- **Navegador integrado actualizado considerablemente**: admite simulación de dispositivos (vista previa móvil/tableta), títulos e iconos dinámicos de pestañas, control de zoom, inspector CSS optimizado y grabación en tiempo real de eventos de animación/transición.
- **Memoria de conversación más inteligente**: nuevo mecanismo automático de deduplicación y combinación para que la IA recuerde mejor el contenido anterior y evite almacenarlo dos veces.
- **Botón de alternancia de la barra lateral**: añadimos un botón rápido a la barra de título.
- **Optimización de la lista de tareas**: admite combinar tareas, ordenar por prioridad y nuevas animaciones de transición.
- **Panel de equipo rediseñado**: nuevo diseño de tema oscuro y carga de página más rápida.
- **Carga diferida de mensajes de conversación**: los historiales largos ya no se cargan todos a la vez, lo que acelera la apertura.
- **Mecanismo de caché de API**: añadimos caché de Responses API para reducir solicitudes duplicadas y ahorrar tokens.

### Mejoras

- Actualización del backend del editor: Electron a 41.2.0 y TypeScript a 6.0 para un funcionamiento más estable y fluido.
- Rediseñamos la interfaz de llamadas de herramientas de IA y unificamos los estilos de tarjetas para operaciones de archivos, herramientas MCP, etc.
- Optimizamos las diferencias de código: corregimos el desplazamiento en estado contraído, las barras horizontales y la visualización del color de fondo.
- Optimizamos las notificaciones del sistema para evitar avisos duplicados y no informar de desconexiones al minimizar.
- Optimizamos la detección de comandos de terminal para identificar con más precisión si se han ejecutado.
- Mejoramos el rendimiento de inicio optimizando el flujo de arranque y el renderizado de la lista de conversaciones.
- Evitamos el desbordamiento de memoria en segundo plano limpiando automáticamente la memoria acumulada durante el funcionamiento prolongado.

### Correcciones

- Corregimos que los mensajes en cola pudieran enviarse al hilo equivocado al cambiar de hilo de conversación.
- Corregimos que eliminar un adjunto de imagen pudiera borrar otros adjuntos de archivo.
- Corregimos que el proceso en segundo plano siguiera ejecutándose después de agotarse el tiempo de espera de una respuesta de IA.
- Corregimos el problema de compatibilidad con TrustedHTML que provocaba páginas en blanco.
- Corregimos que los enlaces del navegador integrado no abrieran correctamente páginas nuevas.
- Corregimos que los botones de opciones no aparecieran ocasionalmente al hacer preguntas a la IA.
- Corregimos los iconos de pestañas del editor desalineados.

## 1.0.9 · 2026-04-03

### Nuevas funciones

- **Automatización del navegador integrado**: integramos herramientas de navegador CDP (captura de pantalla, clic, entrada, navegación, instantánea DOM y registro de consola); el Agent de IA puede operar directamente páginas del navegador.
- **Simulación de vista del dispositivo**: el navegador integrado puede simular distintas resoluciones (móvil/tableta/escritorio) y ofrece una lista de dispositivos desplazable.
- **Gestión de pestañas del navegador**: títulos/iconos dinámicos, control de zoom, cambio entre varias pestañas y apertura rápida del panel del navegador desde el cuadro de entrada.
- **Llamadas paralelas de varias herramientas**: la IA puede devolver varias llamadas de herramientas para ejecutarlas en paralelo.
- **Botón de alternancia de la barra lateral en la barra de título**.
- **Cambio de panel Entanglement**: permite cambiar de panel de forma independiente y alinearlo automáticamente al ajustar la barra lateral.

### Correcciones

- Detección de finalización de comandos del terminal: activamos el protocolo OSC 633;D, corregimos la limpieza ANSI y aceleramos el juicio heurístico.
- Supresión de notificaciones del sistema de compañeros: los subhilos ya no envían notificaciones irrelevantes al sistema operativo.
- Anulación del modo Entanglement: el modo elegido por el usuario ya no queda anulado silenciosamente por el modo de programación.
- Fuga de intención: las etiquetas de intención del modo causal de Entanglement ya no aparecen en el texto mostrado.

### Optimizaciones

- Rendimiento de inicio: optimización O(n) del chat y persistencia de estadísticas de diferencias.
- Interfaz de herramientas de terminal: optimizamos los márgenes internos de la barra de título/barra inferior y corregimos el radio de esquina del botón «Abrir en el navegador».
- Posicionamiento del panel del navegador: usamos floating-ui para eliminar saltos y desplazamientos al abrirlo.
