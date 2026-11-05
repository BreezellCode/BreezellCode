# Objetivo

Dê um objetivo a uma conversa e a IA continua trabalhando até cumprir.

Normalmente a IA para quando acha que respondeu. Com um objetivo, cada vez que ela para, o trabalho é verificado em relação ao que você pediu. Se ainda não foi cumprido, ele mesmo envia a próxima mensagem, dizendo o que falta. Termina quando é cumprido, quando não pode continuar sem você ou quando chega a um limite que você definiu.

```
/goal todos os testes do pacote parser passam e o lint está limpo
```

## Como usar

Digite `/goal` seguido do que deve valer ao terminar, escolha no menu que abre com `/`, ou aperte **Objetivo** ao lado da caixa de chat. Uma faixa acima da caixa mostra o andamento e não ocupa espaço quando não há objetivo.

| Comando | O que faz |
| --- | --- |
| `/goal <o que deve valer>` | Define o objetivo desta conversa e começa. Um novo substitui o anterior. |
| `/goal status` | Diz o andamento. |
| `/goal pause` | Para depois do turno atual. Nada mais é enviado. |
| `/goal resume` | Continua. |
| `/goal clear` | Remove. |

Cada conversa tem seu próprio objetivo, e vários podem rodar ao mesmo tempo.

## Limites

Um objetivo sempre tem um limite de mensagens próprias: 20, a menos que você mude. Você também pode limitar tokens e tempo. Os padrões ficam em **Opções de Recursos › Objetivo**, ou por objetivo, no início ou no fim da mensagem:

```
/goal --rounds 10 --tokens 200k --minutes 30 o site compila sem avisos
```

Num limite ele para e avisa. `/goal resume` permite o mesmo tanto outra vez, ou o que você disser: `/goal resume --rounds 40`.

Tokens são **tokens novos** desde o início do objetivo, conforme seu provedor informa: entrada não lida do cache, saída e o que foi usado para verificar o trabalho. Servem para acompanhar, não são uma fatura. Subagentes e Cross-Check não entram, e um provedor que não informa não é contado (a faixa avisa).

## O que o faz parar

- **O objetivo foi cumprido.** Depois de cada turno, seu modelo de chat verifica o trabalho pelos comandos executados, seus resultados e o que mudou, não pelo que a IA diz.
- **Não pode continuar.** Só você pode fazer avançar (uma decisão, credenciais), ou não dá para fazer.
- **Nada avança.** Três turnos seguidos sem usar ferramentas.
- **Um limite.**
- **Você.** Aperte Parar na resposta e ele pausa. Nada é enviado até você retomar ou definir outro objetivo.

Enquanto um comando iniciado ainda roda em segundo plano, ele espera terminar. Um servidor ou um observador não contam como algo a esperar.

O som e o aviso de conclusão vêm uma vez, quando o objetivo termina de verdade. Erros avisam na hora.

## O que ele não faz

- Nunca aprova uma chamada de ferramenta. Se um comando precisa da sua aprovação, o objetivo espera você.
- Não começa sozinho. Depois de reiniciar ou sair da conta, um objetivo em andamento fica pausado até você retomar.
- Suas mensagens não se passam pelas suas. Aparecem no chat com o nome dele, a IA sabe que você não as digitou, e não vão para suas memórias.

## Permissões

O Breezell pergunta na primeira vez que forem necessárias, e você pode desativar cada uma em Plugins › Instalados.

| Permissão | Para quê |
| --- | --- |
| `chat.events` | Saber quando um turno termina. |
| `chat.read` | Ler a conversa com objetivo para verificar o trabalho. |
| `chat.send` | Enviar a próxima mensagem e segurar o som até o fim. |
| `models.request` | Verificar o trabalho com seu modelo de chat. É cobrado como qualquer pedido seu. |
| `ui.contribute` | O botão, a faixa e as configurações. |
| `chat.intercept` (opcional) | Reconhecer `/goal` na caixa de chat. Só responde a mensagens que começam com `/goal`; as outras passam intactas e não são guardadas. Sem ela, use o botão. |
| `agent.tools` (opcional) | Para a IA informar que terminou ou está bloqueada. Sem ela, decide a verificação depois de cada turno. |

Só lê as conversas às quais você deu um objetivo, e o que lê vai apenas para o seu modelo de chat.

## Requisitos

Um Breezell mais novo que 1.4.41. Em um mais antigo ele instala e não faz nada, e explica ao apertar o comando.

## Licença

MIT
