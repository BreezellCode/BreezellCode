---
title: Selección de modo
description: Resumen de los modos de trabajo de Breezell y cuándo utilizar cada uno.
---

# Selección de modo

Breezell ofrece varios modos de trabajo para distintos niveles de autonomía, profundidad y control del flujo de trabajo. Agent es el modo predeterminado y el flujo de trabajo automático recomendado para la mayoría de las tareas.

Utiliza otro modo cuando quieras un estilo de interacción más específico, como conversación rápida, análisis de solo lectura, planificación antes de editar, razonamiento causal más profundo o compañeros de IA en paralelo.

## Chat

Chat está pensado para preguntas y respuestas rápidas.

Usa Chat cuando quieras preguntar sobre código, explicar una idea, comparar opciones u obtener una respuesta rápida sin pedir a Breezell que edite archivos o ejecute herramientas de forma autónoma.

En el modo Chat, el modelo no puede editar archivos.

## Agent

Agent permite que Breezell inspeccione el proyecto, edite archivos, use herramientas, ejecute comandos y complete tareas de programación.

Usa Agent para la mayoría de los trabajos de desarrollo. Es el modo predeterminado porque puede elegir automáticamente un flujo de trabajo razonable, recopilar el contexto necesario, realizar cambios y verificar el resultado antes de entregarlo.

## Analyze

Analyze está pensado para investigaciones de solo lectura.

Usa Analyze cuando quieras que Breezell inspeccione código, diagnostique problemas, revise la arquitectura o audite el comportamiento sin modificar archivos. Es útil cuando necesitas un hallazgo técnico antes de decidir qué modificar.

## Plan

Plan crea una ruta de implementación estructurada antes de editar.

Usa Plan para funciones complejas, refactorizaciones grandes, requisitos poco claros o trabajos que necesitan una decisión de diseño antes de comenzar los cambios de código.

Consejo: en el modo Agent, Breezell puede decidir cambiar a Plan cuando la tarea requiera una ruta de implementación estructurada. Puedes permitir o rechazar el cambio. Si el modo totalmente automático está activado, Breezell puede confirmar el cambio automáticamente cuando sea adecuado.

## Entanglement

Entanglement utiliza razonamiento causal y comprensión del contexto para tomar decisiones más profundas sobre el producto y el código.

Entanglement ha sido investigado y desarrollado de forma independiente por Breezell. Es un modo exclusivo de Breezell y único en la web.

Para consultar una descripción técnica de su seguimiento del estado causal y su ciclo de validación, visita [Resumen del modo Entanglement](/es/entanglement-mode-overview).

Usa Entanglement cuando una solicitud dependa de la intención, las compensaciones, las causas ocultas, los matices emocionales o un razonamiento de varios pasos que requiera algo más que una respuesta directa.

Consejo: este modo puede mejorar considerablemente la capacidad del modelo, pero consume más recursos que los flujos de trabajo estándar. Se desconocen sus efectos secundarios.

Consejo: como el contexto de Entanglement ya se ha inyectado, cambiar de Entanglement a Agent dentro de la misma conversación no desactivará por completo el comportamiento de Entanglement. La conversación conservará las capacidades de Entanglement y seguirá consumiendo recursos. Inicia una conversación nueva si quieres volver a un flujo de trabajo Agent normal.

## Teams

Teams coordina varios compañeros de IA para funciones grandes y flujos de trabajo paralelos.

Usa Teams cuando una tarea pueda dividirse en flujos de trabajo independientes, como investigar varias áreas, comparar implementaciones o avanzar simultáneamente en varias partes de un proyecto grande.

Consejo: este modo puede mejorar considerablemente la capacidad del modelo, pero consume más recursos que los flujos de trabajo estándar.

Limitación: Teams todavía puede verse limitado por conflictos de lectura y escritura entre compañeros paralelos. Breezell intenta reducir estos conflictos, pero las tareas paralelas grandes pueden seguir siendo más difíciles de coordinar y generar confusión si varios compañeros modifican áreas superpuestas.

## Elegir un modo

Para la mayoría de las tareas, mantén el modo Agent predeterminado. Cambia de modo solo cuando la tarea necesite claramente un flujo de trabajo diferente.

| Modo | Mejor para |
| --- | --- |
| Chat | Conversaciones rápidas y explicaciones breves |
| Agent | Flujo de trabajo de programación predeterminado, edición de archivos, herramientas y verificación |
| Analyze | Diagnóstico, revisiones e investigación de arquitectura de solo lectura |
| Plan | Planificación estructurada de la implementación antes de los cambios |
| Entanglement | Razonamiento causal profundo y decisiones conscientes del contexto |
| Teams | Compañeros de IA en paralelo para flujos de trabajo grandes o independientes |
