---
title: Resumen de opciones de funciones
description: Resumen de las opciones de funciones, permisos, comportamiento del editor, ajustes de inteligencia y controles de acceso al sistema de Breezell.
---

# Resumen de opciones de funciones

Esta página resume las principales opciones de funciones disponibles en la configuración de Breezell. Estas opciones controlan la finalización automática, las notificaciones, los permisos de herramientas, el comportamiento del editor, las funciones inteligentes y el acceso al sistema.

## Ayuda

### Finalización automática y notificaciones

| Función | Descripción |
| --- | --- |
| Finalización automática | BreezellTab proporciona finalización de código con IA. Pulsa `Tab` para aceptar las sugerencias. |
| Notificaciones del sistema | Configura el comportamiento de las notificaciones del sistema. Breezell puede mostrar notificaciones del sistema cuando el editor está minimizado o pierde el foco. |

## Ejecución

### Permisos de herramientas

Estas opciones controlan si determinadas operaciones de herramientas pueden ejecutarse automáticamente sin confirmación manual.

| Función | Descripción |
| --- | --- |
| Aprobar ediciones automáticamente | Permite que las operaciones de edición se ejecuten automáticamente sin confirmación. |
| Aprobar terminal automáticamente | Permite que las operaciones del terminal se ejecuten automáticamente sin confirmación. |
| Aprobar operaciones de base de datos automáticamente | Permite que las operaciones de base de datos se ejecuten automáticamente sin confirmación. |
| Aprobar generación de medios automáticamente | Permite que las operaciones de generación de medios se ejecuten automáticamente sin confirmación. |
| Aprobar herramientas MCP automáticamente | Permite que las operaciones de herramientas MCP se ejecuten automáticamente sin confirmación. |
| Aprobar Teams automáticamente | Aprueba automáticamente la creación de equipos sin confirmación manual. |

## Editor

### Comportamiento del código

| Función | Descripción |
| --- | --- |
| Corregir errores de Lint automáticamente | Corrige automáticamente los errores de Lint cuando es compatible. |
| Aceptar cambios de código automáticamente | Acepta automáticamente los cambios de código generados o modificados. |
| Abrir archivos automáticamente al editar | Abre archivos automáticamente durante la edición. |
| Mostrar sugerencias en línea al seleccionar | Muestra sugerencias en línea cuando se selecciona texto o código. |

### Mensaje de commit de Git

Usa esta opción para que Breezell genere un mensaje de commit de Git a partir de los cambios de código actuales. Es útil cuando quieres un resumen claro del commit sin escribirlo manualmente.

![Generar mensajes de commit con el modelo de chat](/feature-options/git-commit-message.png)

| Función | Descripción |
| --- | --- |
| Generar mensajes de commit con el modelo de chat | Genera automáticamente mensajes de commit de Git basados en los cambios de código actuales. |

Cuando esta opción está activada, Breezell puede revisar el conjunto de cambios actual y crear un mensaje de commit con el modelo de chat seleccionado. Revisa el mensaje generado antes de hacer commit si tu proyecto requiere un formato específico.

## Inteligencia

### Gestión del contexto

| Función | Descripción |
| --- | --- |
| Ejecutar tarjetas de plan automáticamente | Cuando está activada, las nuevas tarjetas de plan se ejecutan automáticamente sin hacer clic manualmente. |

### Skills de Superpowers

| Función | Descripción |
| --- | --- |
| Activar Skills de Superpowers | Permite que la IA utilice flujos de trabajo de desarrollo estructurados, como lluvia de ideas, planificación, TDD y revisión de código. El contenido completo se carga bajo demanda. |

### ~~Exploración avanzada del Agent~~

> **Obsoleto después de la versión 1.2.5.** Esta opción se ha eliminado. Cuando una solicitud requiere una investigación profunda con varias fuentes, Breezell invoca automáticamente las capacidades relacionadas y resume los resultados en un informe de investigación con citas.

| Función | Descripción |
| --- | --- |
| ~~Activar exploración avanzada~~ | Obsoleto después de la versión 1.2.5; las capacidades de investigación relacionadas se invocan automáticamente cuando es necesario. |

### Panel del modo Entanglement

| Función | Descripción |
| --- | --- |
| Mostrar el panel en el modo Entanglement | Muestra un panel estructurado en tiempo real para el modo Entanglement, con la fase actual, el historial de confianza, las hipótesis activas y resueltas, los registros de evidencias evaluadas y los grafos causales. |

## Sistema

### Configuración de red

| Función | Descripción |
| --- | --- |
| Usar proxy del sistema | Usa el proxy del sistema para enviar solicitudes de API. Si no se necesita un proxy o el proxy es inestable, se recomienda desactivar esta opción para mejorar la velocidad de respuesta. |

### Acceso a archivos externos

| Función | Descripción |
| --- | --- |
| Permitir acceso de solo lectura a archivos externos | Permite que las herramientas lean archivos fuera del espacio de trabajo. |
| Permitir acceso de escritura a archivos externos | Permite que las herramientas modifiquen archivos fuera del espacio de trabajo. Las dos opciones de acceso a archivos externos están activadas de forma predeterminada. |

## Notas

Las opciones de aprobación automática y acceso externo pueden mejorar la velocidad del flujo de trabajo, pero también reducen la revisión manual. Actívalas solo cuando coincidan con la política y el nivel de confianza de tu espacio de trabajo.