---
title: Resumen del cuadro de diálogo
description: Resumen del cuadro de diálogo de Breezell, incluidas menciones, uso del contexto, selección de modo, controles de modelos y acciones rápidas.
---

# Resumen del cuadro de diálogo

El cuadro de diálogo de Breezell es el lugar principal donde escribes instrucciones, eliges un modo de trabajo, seleccionas un modelo, adjuntas contexto y controlas cómo el Agent gestiona la solicitud actual.

Esta página explica los controles visibles que aparecen en las capturas del cuadro de diálogo.

## Estado de entrada predeterminado

El estado de entrada predeterminado es el punto de partida normal para un mensaje nuevo. Mantiene visibles el campo de instrucciones y los controles esenciales.

![Estado de entrada predeterminado](/dialog-box/input-default.png)

Escribe tu solicitud, elige el modo y el modelo si es necesario y envía el mensaje a Breezell.

## Menú del selector de modo

El puntero resalta el menú del selector de modo. Este menú muestra los modos de trabajo disponibles.

![Menú del selector de modo](/dialog-box/mode-selector.png)

Los modos disponibles incluyen:

- [**Chat**](/es/mode-selection#chat) para preguntas y respuestas rápidas
- [**Plan**](/es/mode-selection#plan) para planificar la implementación antes de editar
- [**Analyze**](/es/mode-selection#analyze) para investigaciones de solo lectura
- [**Entanglement**](/es/mode-selection#entanglement) para un razonamiento causal más profundo
- [**Agent**](/es/mode-selection#agent) para editar archivos y usar herramientas de forma autónoma
- [**Teams**](/es/mode-selection#teams) para compañeros de IA en paralelo en tareas complejas

Para obtener más información, consulta [Selección de modo](/es/mode-selection). Elige el modo que corresponda al nivel de autonomía y profundidad que necesitas.

## Selector de modelos

El puntero resalta el selector de modelos. El selector muestra el modelo actual y permite cambiar a otro modelo disponible antes de enviar el mensaje.

![Selector de modelos](/dialog-box/input-compact-controls.png)

Úsalo cuando quieras elegir un modelo con características diferentes de velocidad, razonamiento o capacidad.

## Carga de archivos

El puntero resalta el control de carga de archivos.

![Control de carga de archivos](/dialog-box/input-model-controls.png)

Haz clic en este control para adjuntar archivos locales al mensaje actual antes de enviarlo a Breezell. Los archivos cargados pasan a formar parte del contexto de la solicitud, por lo que Breezell puede inspeccionarlos o consultarlos al responder.

## ~~Exploración avanzada~~

> **Obsoleto después de la versión 1.2.5.** El control específico de Exploración avanzada ya no está disponible. Cuando una solicitud requiere una investigación más profunda, Breezell invoca automáticamente las capacidades relacionadas para el aprendizaje activo, una investigación más amplia y una exploración más exhaustiva.

![Control de Exploración avanzada](/dialog-box/input-tools-expanded.png)

## Navegador Breezell

El puntero resalta el control **Breezell Browser**.

![Control de Breezell Browser](/dialog-box/input-agent-basic.png)

Breezell Browser es la herramienta de navegador integrada de Breezell. Úsala para abrir páginas web, consultar contenido en línea, buscar información y ayudar a la IA a obtener y analizar contenido web sin salir del cuadro de diálogo.

## Desglose del uso del contexto

El puntero resalta el indicador de uso del contexto. Al abrirlo, se muestra un desglose detallado del uso de la ventana de contexto actual.

![Desglose del uso del contexto](/dialog-box/context-usage-breakdown.png)

El desglose separa el uso en categorías como prompt del sistema, herramientas, reglas, memorias, Skills, MCP, subagentes y contenido de la conversación. Úsalo para entender qué partes de la sesión consumen más tokens.

## Compresión manual del contexto

El puntero resalta el control **Manual compress** del panel de contexto. Esta acción resume el contenido anterior de la conversación para que la sesión conserve información útil y reduzca el uso del contexto.

![Panel de contexto con compresión manual](/dialog-box/context-manual-compress.png)

La compresión manual resulta útil durante conversaciones largas, especialmente cuando la ventana de contexto está creciendo pero aún quieres continuar en la misma sesión.

## Menú de menciones

El puntero resalta el área de contexto rápido que se utiliza para abrir el menú de menciones. Este menú permite añadir archivos, carpetas, herramientas MCP y Skills al mensaje actual.

![Menú de menciones en el cuadro de diálogo de Breezell](/dialog-box/mention-menu.png)

Úsalo cuando tu solicitud dependa de contenido específico del espacio de trabajo o de una capacidad externa. Añadir el contexto adecuado ayuda a Breezell a entender qué debe inspeccionar o utilizar antes de responder.

## Consejos de uso

- Añade contexto de archivos o carpetas cuando la solicitud dependa de contenido específico del proyecto.
- Agent es el modo predeterminado y el flujo de trabajo automático recomendado para la mayoría de las tareas.
- Cambia de modo solo cuando necesites un flujo de trabajo específico, como planificar primero o analizar sin editar.
- La compresión del contexto se ejecuta automáticamente. Usa la compresión manual solo si prefieres un control manual estricto o tienes un requisito especial.
- Revisa el modelo seleccionado cuando sean importantes la precisión, la velocidad o la profundidad del razonamiento.