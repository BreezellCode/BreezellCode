# Focus Player

Sons ambientes para foco e a sua própria música, no ritmo do Breezell: um aviso sonoro quando a IA termina um turno.

O exemplo oficial de um plugin de painel do Breezell. Código-fonte: [`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player).

## Recursos

- **Som ambiente**: chuva, foco profundo (ruído marrom e um zumbido grave) e um pad de acordes suave, tudo sintetizado na hora com Web Audio. O plugin não traz arquivos de áudio.
- **Minhas músicas**: escolha uma pasta (mp3, ogg, wav, flac, m4a, opus, webm) e toque em ordem.
- **Com o Breezell** (permissão `chat.events`: só modo, resultado e duração, nunca o conteúdo):
  - um aviso quando um turno da conversa termina, e outro diferente quando falha ou é interrompido;
  - opcional: tocar enquanto o agente trabalha e pausar quando ele termina;
  - a atividade recente no painel.

## Uso

- Abra pelo item **Plugins** na barra lateral do Box, ou com **Abrir** em Breezell Console › Plugins.
- O item **▶ Focus** na barra de status toca e pausa.
- O painel é uma aba do editor: arraste-a para fora ou execute "Move Editor into New Window" para ter uma janela própria.
- Configurações: `focusPlayer.chimeWhenTurnFinishes`, `focusPlayer.playWhileAgentWorks`, `focusPlayer.musicFolder`.

Como todo plugin do Breezell, ele funciona enquanto você está conectado ao Breezell.

## Desenvolvimento

```bash
npm install
npm run typecheck
npm run package:open      # pacote de código aberto
npm run package:closed    # pacote de código fechado
```

Abra esta pasta no Breezell e pressione F5 para rodar numa janela de desenvolvimento.
