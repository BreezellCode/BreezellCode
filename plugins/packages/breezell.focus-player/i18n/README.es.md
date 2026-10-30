# Focus Player

Sonidos ambientales para concentrarte y tu propia música, al ritmo de Breezell: un aviso cuando la IA termina un turno.

El ejemplo oficial de un plugin de panel de Breezell. Código fuente: [`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player).

## Funciones

- **Sonido ambiental**: lluvia, concentración profunda (ruido marrón y un zumbido grave) y un pad de acordes suave, todo sintetizado en vivo con Web Audio. El plugin no incluye archivos de audio.
- **Mi música**: elige una carpeta (mp3, ogg, wav, flac, m4a, opus, webm) y reprodúcela en orden.
- **Con Breezell** (permiso `chat.events`: solo modo, resultado y duración, nunca el contenido):
  - un aviso cuando termina un turno de la conversación, y otro distinto si falla o se detiene;
  - opcional: reproducir mientras trabaja el agente y pausar cuando termina;
  - la actividad reciente en el panel.

## Uso

- Ábrelo desde **Plugins** en la barra lateral de Box, o con **Abrir** en Breezell Console › Plugins.
- El elemento **▶ Focus** de la barra de estado reproduce y pausa.
- El panel es una pestaña del editor: arrástrala fuera o ejecuta «Move Editor into New Window» para darle su propia ventana.
- Ajustes: `focusPlayer.chimeWhenTurnFinishes`, `focusPlayer.playWhileAgentWorks`, `focusPlayer.musicFolder`.

Como todo plugin de Breezell, funciona mientras tienes la sesión de Breezell iniciada.

## Desarrollo

```bash
npm install
npm run typecheck
npm run package:open      # paquete de código abierto
npm run package:closed    # paquete de código cerrado
```

Abre esta carpeta en Breezell y pulsa F5 para ejecutarlo en una ventana de desarrollo.
