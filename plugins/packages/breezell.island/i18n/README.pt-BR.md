# Ilha de atividade

A barra de título do Breezell mostra o que a IA está fazendo numa cápsula que muda de forma. Saia do Breezell ou minimize-o enquanto algo está em andamento e a cápsula voa para o topo da tela, onde flutua acima de todos os apps. Clique nela e ela se abre num painel com suas conversas e as últimas palavras de cada resposta. Volte, ou deixe o trabalho terminar, e ela voa de volta para a barra de título.

## O que ela faz

- **Ocupa o meio da barra de título.** Em repouso mostra o nome do seu workspace, e um clique abre a pesquisa, como a barra de pesquisa fazia. O sino de notificações e o botão de atualização continuam ao lado.
- **Muda de forma enquanto o Breezell trabalha.** A cápsula se alarga até a etapa da IA, com a marca do modelo, uma onda e um relógio. Ela avisa quando um chat aguarda você, quando um turno termina e quanto levou, e quando algo dá errado, com um botão **Ver** que abre a conversa.
- **Mostra tarefas.** Uma tarefa de build ou de testes aparece na cápsula quando a IA está livre, e numa bolha ao lado quando está ocupada. **Ver** numa tarefa que falhou abre o terminal dela.
- **Flutua fora da janela enquanto algo está em andamento.** Quando você vai para outro app ou minimiza o Breezell enquanto a IA trabalha, aguarda você, acabou de terminar ou falhou, ou uma tarefa está rodando, a cápsula voa da barra de título para o topo da tela e vira uma pílula escura acima de tudo. Sem nada acontecendo, ela fica na barra de título, e quando tudo se acalma ela voa de volta para lá.
- **Abre-se num painel.** Clique na pílula e ela se abre como uma ilha expandida: quantos chats estão em andamento ou aguardam você, o que cada conversa está fazendo, o relógio e as últimas palavras da resposta, e as tarefas. Clique numa conversa para ir direto a ela, ou em **Voltar ao editor**. Um clique fora do painel, ou Esc, o fecha.
- **Todas as janelas do Breezell de uma vez.** Com várias janelas abertas, uma só ilha do lado de fora mostra todas, a mais urgente primeiro, e o painel as lista janela por janela com **Ir** para trocar.

O que ela lê: a etapa em que a IA está, qual modelo trabalha, como vai uma tarefa de build ou de testes e, se você permitir **Ler suas conversas**, os títulos das conversas e as últimas palavras de cada resposta, só para mostrá-los no painel. Nada sai do seu computador.

## Quais permissões ela pede

- **Alterar as telas do Breezell** (`ui.modify`): a página dela ocupa o meio da barra de título. O Breezell pergunta quando ela chega.
- **Mostrar a atividade do Breezell** (`activity.read`): a etapa da IA, o modelo e a tarefa, nunca o que as mensagens dizem. Ativada, a menos que você desative.
- **Fazer uma janela pequena flutuar acima de outros apps** (`ui.overlay`): a ilha fora da janela. O Breezell pergunta enquanto você está no Breezell. Se recusar, a ilha fica na barra de título.
- **Ler suas conversas** (`chat.read`, opcional): os títulos e as últimas palavras das respostas no painel. O Breezell pergunta enquanto você está no Breezell. Se recusar, o painel mostra o que a IA de cada janela está fazendo.
- **Adicionar às Opções de recursos** (`ui.contribute`): a configuração dela em Box > Opções de recursos.

## Configurações

| Configuração | O que faz |
|---|---|
| `activityIsland.floatOutside` | Faz a ilha flutuar no topo da tela quando você sai do Breezell enquanto algo está em andamento. Desativada: ela fica na barra de título |

Ela também está em Box > Opções de recursos. Com **Reduzir movimento** do Breezell ativado, ela se move na hora.

## Windows, macOS e Linux

Ela flutua no Windows, no macOS (também acima de apps em tela cheia) e no Linux com X11.

**Numa sessão Wayland ela fica na barra de título.** O Wayland não deixa um app posicionar as próprias janelas nem manter uma acima das outras, então a ilha não tem para onde ir. O plugin avisa uma vez. Com X11, ou com o Breezell iniciado com `--ozone-platform=x11`, ela flutua.

Precisa do Breezell 1.4.53 ou mais recente. Uma versão mais antiga não a instala.
