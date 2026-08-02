---
title: API personalizada
description: Aprende a configurar tu propio proveedor de API en Breezell en lugar de utilizar la cuota oficial.
---

# API personalizada

Si no quieres utilizar la cuota oficial de Breezell o quieres usar tu propia clave de API, puedes configurar un proveedor de API personalizado en la página de configuración de Breezell.

Esto te permite conectar Breezell con tu propio proveedor de modelos, puerta de enlace personalizada, clave de API y nombre de modelo.

## Abrir la página de configuración de Breezell

Para empezar, busca el icono de configuración en la zona superior derecha del editor.

El icono de configuración parece un pequeño engranaje y está situado cerca de los demás iconos de la barra de herramientas.

Haz clic en el icono de configuración para abrir el menú de configuración.

En la parte superior del menú, haz clic en **Breezell Settings**.

Después de hacer clic en **Breezell Settings**, se abrirá la página de configuración de Breezell.

![Menú de configuración de Breezell con Breezell Settings seleccionado](/custom-api/settings-menu.png)

## Ir a la página Models

Después de abrir la configuración de Breezell, normalmente entrarás en la página **Models** de forma predeterminada.

Si no estás en esta página, mira la barra lateral izquierda y haz clic en **Models**.

La página **Models** permite gestionar los modelos disponibles, los modelos oficiales, los proveedores externos y los proveedores de API personalizados.

En la parte superior de esta página verás varios modelos habilitados, como los modelos Claude, GPT, Gemini, Kimi y Grok.

Debajo de la lista de modelos verás la sección **Providers**.

![Página Models de Breezell con la sección Providers](/custom-api/models-page.png)

## Elegir un proveedor

Breezell admite muchos proveedores de modelos diferentes.

Por ejemplo, puedes encontrar proveedores como:

- OpenRouter
- Anthropic
- OpenAI
- OpenAI Codex
- Kimi Code
- GitHub Copilot
- DeepSeek
- Gemini
- Groq
- Mistral
- Qwen
- Google Vertex AI
- Microsoft Azure
- NVIDIA NIM
- Together AI
- Cohere
- Fireworks
- DeepInfra
- Cerebras
- Perplexity
- Moonshot AI
- ByteDance
- Hugging Face
- Baseten

Cada proveedor puede tener métodos de configuración diferentes.

Por ejemplo, si utilizas **OpenAI Codex**, puedes elegir **OpenAI Codex** en la lista de proveedores e iniciar sesión directamente con tu cuenta de ChatGPT.

Después de iniciar sesión, Breezell puede enrutar las solicitudes de Codex a través del backend oficial de Codex. Esta opción no requiere una clave de API independiente.

![Página del proveedor OpenAI Codex con inicio de sesión de la cuenta de ChatGPT y detalles de uso de Codex](/custom-api/openai-codex-provider.png)

## Usar OpenAI-Compatible para una API personalizada

Si quieres utilizar una API de terceros o una puerta de enlace de API autoalojada, elige **OpenAI-Compatible**.

Este es el proveedor de API personalizada predeterminado.

A diferencia de los proveedores fijos, **OpenAI-Compatible** te permite configurar manualmente tus propios datos de conexión.

Puedes establecer información como:

- Apodo del proveedor
- Base URL
- API key
- Protocol
- Endpoint preset
- Model name
- Custom headers

Esto resulta adecuado para puertas de enlace personalizadas, plataformas de API de terceros, servicios proxy o proveedores de modelos compatibles con OpenAI.

![OpenAI-Compatible en la sección Providers](/custom-api/providers-section.png)

## Abrir el panel de configuración de la API personalizada

En la sección **OpenAI-Compatible**, busca el slot predeterminado.

Puede aparecer como **OpenAI-Compatible 1**.

Puedes hacer clic en el área del slot o en **Manage slots**, en la parte derecha.

![Entrada de slot de OpenAI-Compatible con el slot predeterminado y la acción Manage slots](/custom-api/open-slot-entry.png)

Esto abrirá el panel de configuración de la API personalizada.

Dentro de este panel puedes configurar la conexión, la autenticación, el protocolo, el endpoint y los modelos disponibles de tu proveedor de API personalizada.

![Panel de configuración del proveedor OpenAI-Compatible con ajustes de conexión y modelos](/custom-api/custom-api-panel-current.png)

## Gestionar los slots del proveedor

En la esquina superior izquierda del panel **OpenAI-Compatible Providers** verás un selector **Available**.

Este selector muestra los slots de API personalizada disponibles.

Breezell admite hasta **50 slots de proveedores OpenAI-Compatible**. Cada slot se puede configurar como un canal de API personalizada independiente.

Por ejemplo, puedes utilizar distintos slots para diferentes proveedores, puertas de enlace, claves de API o grupos de modelos.

Haz clic en el selector **Available** para abrir la lista de slots.

![Selector Available que muestra slots de API personalizada del 1 al 50](/custom-api/provider-slots-current.png)

Verás slots numerados del **1** al **50**.

Si estás configurando **Slot 1**, puedes seleccionar **Slot 2** para configurar otro canal de API personalizada.

Después de seleccionar otro slot, el panel de configuración cambiará a ese slot. Entonces podrás introducir otro nombre de proveedor, Base URL, API key, protocolo, endpoint y lista de modelos para el nuevo canal.

## Configurar la conexión

Vuelve al panel de configuración principal.

En la sección **Connection** puedes configurar la información básica de conexión de este proveedor de API personalizada.

![Sección Connection de un proveedor de API personalizada con apodo, Base URL, API key, protocolo y modelos](/custom-api/configure-connection-current.png)

Puedes establecer:

- Nickname
- Base URL
- API Key
- Protocol
- Endpoint preset
- Custom headers
- Model names

**Nickname** se utiliza para identificar este proveedor personalizado. Puedes introducir el nombre del proveedor, el nombre de la puerta de enlace o cualquier etiqueta que te ayude a reconocer este canal.

**Base URL** es la dirección de la puerta de enlace de la API.

La Base URL debe comenzar por una de estas opciones:

```text
http://
```

o:

```text
https://
```

Por ejemplo:

```text
https://api.example.com/v1
```

o:

```text
http://127.0.0.1
```

Si la Base URL no comienza por `http://` o `https://`, la solicitud puede fallar.

## Comprobar la URL de solicitud final

Después de introducir la Base URL y seleccionar el preajuste del endpoint, comprueba la **Request URL** que aparece debajo de la sección del protocolo.

Esta zona muestra la dirección final que utilizará Breezell para la solicitud.

Por ejemplo, si tu Base URL es:

```text
http://127.0.0.1
```

y el preajuste del endpoint es **OpenAI Generic**, Breezell puede generar:

```text
http://127.0.0.1/v1/chat/completions
```

Debes confirmar cuidadosamente que la Request URL final sea correcta.

Esto es importante porque distintos proveedores pueden definir sus URL de puerta de enlace de forma diferente.

Algunos proveedores requieren que la Base URL incluya `/v1`, mientras que otros solo requieren el dominio raíz.

Por ejemplo, un proveedor puede requerir:

```text
https://api.example.com/v1
```

mientras que otro puede requerir:

```text
https://api.example.com
```

Si el proveedor utiliza un formato de puerta de enlace no estándar, la finalización automática del endpoint puede no funcionar correctamente.

Esto puede provocar que la ruta de solicitud final, como `/v1/chat/completions`, se duplique, falte o se combine de forma incorrecta.

Antes de guardar o utilizar el proveedor, comprueba siempre la **Request URL** generada y asegúrate de que coincide con la documentación de API de tu proveedor.

![Vista previa de Request URL bajo la sección del protocolo para un proveedor OpenAI-Compatible](/custom-api/request-url-current.png)

## Seleccionar el protocolo de solicitud

En la sección **Protocol**, elige el protocolo de solicitud que coincida con tu proveedor.

Las opciones habituales incluyen:

- OpenAI
- Responses
- Anthropic

Para la mayoría de las API de terceros compatibles con OpenAI, selecciona **OpenAI**.

Si tu proveedor utiliza la Responses API de OpenAI, selecciona **Responses**.

Si tu proveedor o puerta de enlace espera solicitudes compatibles con Anthropic, selecciona **Anthropic**.

Elige el protocolo según el formato de API que requiera tu proveedor. Si el protocolo no coincide con el proveedor, las solicitudes pueden fallar aunque la Base URL y la API key sean correctas.

## Elegir el preajuste del endpoint

La selección del protocolo es muy importante porque determina si el modelo se puede solicitar correctamente.

Aunque un proveedor indique que es compatible con la API de OpenAI, la ruta de solicitud real puede ser diferente de la especificación oficial de la API de OpenAI.

Algunos proveedores modifican la estructura estándar del endpoint. Breezell ha adaptado muchas de estas variantes específicas de cada proveedor.

Haz clic en el menú desplegable del preajuste del endpoint para ver los preajustes disponibles.

![Menú desplegable Endpoint preset con opciones de rutas de solicitud específicas del proveedor](/custom-api/endpoint-preset-current.png)

Es posible que veas opciones como:

- OpenAI Generic
- Zhipu GLM
- Volcengine Ark
- Volcengine Coding
- DashScope Qwen
- DeepSeek
- Images

Cada preajuste representa una ruta de solicitud diferente.

Por ejemplo, **OpenAI Generic** puede utilizar:

```text
/v1/chat/completions
```

Otros proveedores pueden utilizar rutas de endpoint diferentes, como:

```text
/api/paas/v4/chat/completions
```

```text
/api/v3/chat/completions
```

```text
/compatible-mode/v1/chat/completions
```

```text
/chat/completions
```

Selecciona el preajuste de endpoint que coincida con tu proveedor.

Si no sabes qué preajuste utilizar, consulta la documentación de API de tu proveedor y compara la **Request URL** final que se muestra en Breezell.

Si tu proveedor utiliza un formato que Breezell todavía no ha adaptado, ponte en contacto con nosotros para que podamos añadir compatibilidad con él.

## Configurar encabezados personalizados

La sección **Custom Headers** es opcional.

Utiliza esta sección solo cuando tu proveedor, puerta de enlace o servicio proxy requiera encabezados HTTP adicionales.

Los encabezados personalizados se añaden a todas las solicitudes enviadas a través del slot de API personalizada actual.

El valor debe ser JSON válido.

![Campo Custom Headers con un ejemplo JSON y accesos directos de preajustes](/custom-api/custom-headers-current.png)

Por ejemplo:

```json
{
  "X-Custom-Header": "value"
}
```

Puedes utilizar encabezados personalizados para requisitos específicos del proveedor, como:

- Encabezados de enrutamiento especiales
- Encabezados de organización o proyecto
- Encabezados de autenticación del proxy
- Encabezados de funciones beta
- Encabezados de funciones de contexto largo

Si tu proveedor no requiere encabezados personalizados, puedes dejar esta sección vacía o mantenerla como un objeto JSON vacío.

```json
{}
```

Asegúrate de que el formato JSON sea válido.

Utiliza comillas dobles tanto para las claves como para los valores. No utilices comentarios, comas finales ni comillas simples.

Ejemplo correcto:

```json
{
  "X-Provider-Mode": "compatible"
}
```

Ejemplo incorrecto:

```json
{
  'X-Provider-Mode': 'compatible',
}
```

Debajo del campo de encabezados personalizados, Breezell puede ofrecer accesos directos de preajustes.

Por ejemplo, el preajuste **Claude 1M** puede rellenar automáticamente el encabezado necesario para activar la compatibilidad con el contexto de Claude 1M.

Si la documentación de tu proveedor requiere un encabezado específico, cópialo en esta sección y confirma que sea JSON válido antes de enviar solicitudes.

## Obtener y añadir modelos disponibles

Cuando termines de configurar la información de conexión, haz clic en **Fetch Available Models**, en la parte derecha del panel.

Breezell intentará solicitar información al proveedor y cargar la lista de modelos disponibles.

Si la solicitud tiene éxito, los modelos disponibles aparecerán en la lista de selección de modelos.

![Botón Fetch Available Models con modelos disponibles cargados en la lista de selección](/custom-api/fetch-available-models-current.png)

Después de confirmar que la configuración del proveedor es correcta, puedes hacer clic en este botón para obtener y seleccionar tus propios modelos.

A continuación, selecciona los modelos que quieras utilizar y haz clic en **Add 1 Model**.

Por ejemplo, puedes seleccionar un modelo como:

```text
gpt-5.5
```

Después haz clic en **Add 1 Model** para añadirlo al proveedor de API personalizada actual.

Si el área izquierda sigue vacía en este paso, reinicia Breezell y vuelve a intentarlo.

![Área izquierda aún vacía después de obtener los modelos disponibles](/custom-api/fetch-results-empty.png)

También puedes utilizar **Check All** para comprobar si la conexión con la puerta de enlace está funcionando correctamente después de configurar el proveedor e intentar cargar los modelos.

![Botón Check All para comprobar la salud del proveedor y de la puerta de enlace](/custom-api/check-gateway-health-button.png)

Si la comprobación tiene éxito, la tarjeta de conexión puede mostrar un estado como **Healthy**. También puedes utilizar **Recheck** para volver a comprobar la puerta de enlace después de cambiar la configuración.

![Tarjeta de conexión que muestra un estado saludable de la puerta de enlace tras una comprobación correcta](/custom-api/check-gateway-health-result.png)

## Añadir un modelo manualmente

También puedes añadir un modelo manualmente.

En el campo de entrada del modelo, introduce el nombre del modelo proporcionado por tu proveedor de API.

Después, haz clic en **Add**.

Esto resulta útil cuando el proveedor no expone un endpoint de lista de modelos o cuando el modelo que quieres utilizar no aparece en **Fetch Available Models**.

Asegúrate de que el nombre del modelo sea exactamente igual al ID de modelo que requiere tu proveedor.

![Campo de entrada manual de modelo con el botón Add](/custom-api/manual-model-add-current.png)

## Activar, desactivar o eliminar un modelo

Después de añadir modelos, aparecerán en la lista **Models**.

Cada elemento de modelo se puede gestionar individualmente.

Puedes utilizar el interruptor situado a la derecha del modelo para activarlo o desactivarlo.

Cuando un modelo está activado, Breezell puede utilizarlo para las solicitudes.

Cuando un modelo está desactivado, Breezell conserva la configuración, pero no utiliza ese modelo.

Pasa el ratón sobre un elemento de modelo para mostrar más acciones.

Puedes eliminar un modelo haciendo clic en el botón de eliminar.

Utiliza esta opción cuando ya no quieras que el modelo aparezca en el proveedor actual.

![Lista de modelos con controles para activar, desactivar, configurar y eliminar](/custom-api/model-management-current.png)

## Abrir la configuración avanzada del modelo

Si quieres configurar un comportamiento más detallado para un modelo, haz clic en el botón de configuración del elemento de modelo.

Esto abre el panel **Advanced Settings**.

La configuración avanzada es opcional. La mayoría de los usuarios no necesitan cambiarla a menos que conozcan los límites del modelo y el formato de solicitud requerido por su proveedor.

## Advanced Settings

En el panel de configuración avanzada puedes personalizar el comportamiento a nivel de modelo.

![Panel Advanced Settings de un modelo de API personalizada](/custom-api/advanced-settings-original.png)

### Activar la configuración personalizada

El interruptor **Enable custom settings** controla si este modelo utiliza su propia configuración avanzada.

Si el interruptor está desactivado, Breezell utilizará la configuración predeterminada reconocida para el modelo.

Si el interruptor está activado, los valores del panel de configuración avanzada anularán el comportamiento predeterminado de este modelo.

### Context Window

**Context Window** define la longitud máxima de contexto que admite el modelo.

Normalmente significa el número máximo de tokens que el modelo puede procesar en una solicitud, incluido el historial de conversación, los mensajes del sistema, los mensajes del usuario, los resultados de herramientas y otro contexto.

Por ejemplo, un valor como:

```text
400000
```

significa que el modelo está configurado con una ventana de contexto de 400k.

El campo admite la conversión automática del sufijo `k`.

Por ejemplo:

```text
128k
```

se convertirá en:

```text
128000
```

Utiliza el valor proporcionado por tu proveedor de modelos. Establecer un valor demasiado alto puede provocar fallos si el modelo no lo admite realmente.

### Output Token Space

**Output Token Space** define el espacio máximo de tokens de salida reservado para las respuestas del modelo.

Por ejemplo, un valor como:

```text
128000
```

significa que el modelo puede reservar hasta 128k tokens para la salida.

También admite la conversión automática del sufijo `k`.

Por ejemplo:

```text
8k
```

se convertirá en:

```text
8000
```

Utiliza un valor que coincida con el límite de salida real de tu proveedor.

### System Message

**System Message** controla cómo Breezell envía instrucciones de nivel de sistema al modelo.

Algunos modelos esperan que el mensaje del sistema utilice el rol estándar `system`.

Otros modelos pueden esperar un formato de rol diferente, como el rol `developer`.

Si tu proveedor requiere un formato específico para el mensaje del sistema, selecciona aquí la opción correspondiente.

Si no estás seguro, mantén la configuración predeterminada.

### Tool Format

**Tool Format** controla cómo se describen y se envían las herramientas al modelo.

Para los modelos compatibles con OpenAI, utiliza **OpenAI Style**.

Si el proveedor requiere un formato de llamada de herramientas diferente, selecciona el formato que coincida con su documentación.

Una configuración incorrecta del formato de herramientas puede provocar que fallen las llamadas de herramientas.

### Supports Thinking

**Supports Thinking** indica si el modelo admite el modo de razonamiento o pensamiento.

Actívalo solo cuando el proveedor del modelo admita esta función.

### Can Disable Thinking

**Can Disable Thinking** indica si Breezell puede desactivar el modo de pensamiento para este modelo.

Resulta útil para modelos que admiten modos con y sin razonamiento.

### Can Stream Reasoning

**Can Stream Reasoning** indica si el modelo puede transmitir contenido de razonamiento durante la generación.

Actívalo solo si el proveedor admite la salida de razonamiento en streaming.

Si el proveedor no lo admite, activar esta opción puede provocar errores de solicitud o respuestas incompletas.

## Guardar la configuración avanzada

Después de cambiar la configuración avanzada, haz clic en **Save**.

Si no quieres aplicar los cambios, haz clic en **Cancel** o cierra el panel.

Cambia la configuración avanzada solo si conoces los valores correctos para tu modelo. Un tamaño de contexto, límite de tokens de salida, formato de mensajes, formato de herramientas o configuración de pensamiento incorrectos pueden hacer que el modelo se comporte de forma incorrecta o no responda.

## Seleccionar tu modelo personalizado

Después de añadir y activar tu modelo personalizado, vuelve a la interfaz de chat.

Haz clic en el selector de modelos situado cerca del cuadro de entrada.

En la lista de modelos verás los modelos integrados de Breezell, los modelos de Codex y tus modelos OpenAI-Compatible personalizados.

Tu proveedor personalizado aparecerá en su propio grupo de proveedores. Por ejemplo, si el apodo de tu proveedor es **TEST**, los modelos que hayas añadido aparecerán en el grupo **TEST**.

Selecciona el modelo que quieras utilizar.

Si has añadido varios modelos, elige el que corresponda a tu tarea actual.

![Selector de modelos que muestra modelos integrados y el grupo de proveedor personalizado TEST](/custom-api/select-custom-model-original.png)

## Ajustar las opciones de contexto y razonamiento

Después de seleccionar un modelo, puedes abrir el panel de opciones del modelo.

En este panel pueden aparecer opciones como:

- Context size
- Reasoning mode
- Reasoning strength
- Fast mode

La opción **Context** controla cuánta información del historial de conversación o del contexto de entrada puede utilizar el modelo.

La opción **Reasoning** controla si está activado el modo de razonamiento.

Si el razonamiento está activado, puedes elegir su intensidad, por ejemplo:

- Low
- Medium
- High
- Extra High

Una intensidad de razonamiento mayor puede ser útil para tareas complejas de programación, planificación, depuración o análisis.

Una intensidad menor puede ser mejor para preguntas sencillas o respuestas más rápidas.

Si el modelo admite el modo **Fast**, puedes activarlo para priorizar la velocidad de respuesta.

Las opciones disponibles pueden variar según el modelo y el proveedor seleccionados.

![Panel de opciones del modelo con ajustes de contexto y razonamiento](/custom-api/model-options-original.png)

## Iniciar una conversación

Después de seleccionar el modelo y ajustar las opciones, escribe tu mensaje en el cuadro de entrada.

Después, envía el mensaje para iniciar una conversación.

Por ejemplo, puedes introducir:

```text
Hello
```

Si la API personalizada está configurada correctamente, Breezell enviará la solicitud a través de tu proveedor personalizado y devolverá la respuesta del modelo en el chat.

Ya has completado la configuración de la API personalizada.

![Vista del chat después de enviar un mensaje mediante el modelo personalizado](/custom-api/start-conversation-original.png)
