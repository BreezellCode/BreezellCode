---
title: Seleção de modo
description: Visão geral dos modos de trabalho do Breezell e de quando usar cada um.
---

# Seleção de modo

O Breezell oferece vários modos de trabalho para diferentes níveis de autonomia, profundidade e controle do fluxo de trabalho. Agent é o modo padrão e o fluxo automático recomendado para a maioria das tarefas.

Use outro modo quando quiser um estilo de interação mais específico, como conversa rápida, análise somente leitura, planejamento antes de editar, raciocínio causal mais profundo ou colegas de IA em paralelo.

## Chat

Chat é destinado a perguntas e respostas rápidas.

Use Chat quando quiser perguntar sobre código, explicar uma ideia, comparar opções ou obter uma resposta rápida sem pedir que o Breezell edite arquivos ou execute ferramentas de forma autônoma.

No modo Chat, o modelo não pode editar arquivos.

## Agent

Agent permite que o Breezell inspecione o projeto, edite arquivos, use ferramentas, execute comandos e conclua tarefas de programação.

Use Agent para a maior parte do trabalho de desenvolvimento. Ele é o modo padrão porque pode escolher automaticamente um fluxo de trabalho adequado, reunir o contexto necessário, fazer alterações e verificar o resultado antes da entrega.

## Analyze

Analyze é destinado à investigação somente leitura.

Use Analyze quando quiser que o Breezell inspecione código, diagnostique problemas, revise a arquitetura ou audite o comportamento sem alterar arquivos. É útil quando você precisa de uma conclusão técnica antes de decidir o que modificar.

## Plan

Plan cria um caminho de implementação estruturado antes da edição.

Use Plan para recursos complexos, refatorações maiores, requisitos pouco claros ou trabalhos que exigem uma decisão de design antes do início das alterações no código.

Dica: no modo Agent, o Breezell pode decidir mudar para Plan quando a tarefa exigir um caminho de implementação estruturado. Você pode permitir ou rejeitar a mudança. Se o modo totalmente automático estiver habilitado, o Breezell poderá confirmar a mudança automaticamente quando for apropriado.

## Entanglement

Entanglement usa raciocínio causal e consciência de contexto para decisões mais profundas sobre produto e código.

Entanglement é pesquisado e desenvolvido de forma independente pelo Breezell. É um modo exclusivo do Breezell e único na web.

Para uma visão técnica do rastreamento de estado causal e do ciclo de validação, consulte [Visão geral do modo Entanglement](/pt-br/entanglement-mode-overview).

Use Entanglement quando uma solicitação depender de intenção, trade-offs, causas ocultas, nuances emocionais ou raciocínio em várias etapas que exija mais do que uma resposta direta.

Dica: esse modo pode melhorar muito a capacidade do modelo, mas consome mais recursos que os fluxos de trabalho padrão. Seus efeitos colaterais são desconhecidos.

Dica: como o contexto do Entanglement já foi injetado, mudar de Entanglement para Agent na mesma conversa não desabilitará completamente o comportamento do Entanglement. A conversa continuará mantendo os recursos do Entanglement e consumindo recursos. Inicie uma nova conversa se quiser voltar a um fluxo normal de Agent.

## Teams

Teams coordena vários colegas de IA para recursos grandes e fluxos de trabalho paralelos.

Use Teams quando uma tarefa puder ser dividida em fluxos de trabalho independentes, como pesquisar várias áreas, comparar implementações ou avançar simultaneamente em várias partes de um projeto maior.

Dica: esse modo pode melhorar muito a capacidade do modelo, mas consome mais recursos que os fluxos de trabalho padrão.

Limitação: o Teams ainda pode ser limitado por conflitos de leitura e gravação entre colegas paralelos. O Breezell trabalha para reduzir esses conflitos, mas tarefas paralelas grandes ainda podem ser mais difíceis de coordenar e causar confusão se vários colegas alterarem áreas sobrepostas.

## Escolher um modo

Para a maioria das tarefas, mantenha o modo Agent padrão. Troque de modo apenas quando a tarefa claramente exigir um fluxo de trabalho diferente.

| Modo | Melhor para |
| --- | --- |
| Chat | Conversas rápidas e explicações breves |
| Agent | Fluxo de programação padrão, edição de arquivos, ferramentas e verificação |
| Analyze | Diagnóstico, revisões e investigação de arquitetura somente leitura |
| Plan | Planejamento estruturado da implementação antes das alterações |
| Entanglement | Raciocínio causal profundo e decisões conscientes do contexto |
| Teams | Colegas de IA em paralelo para fluxos grandes ou independentes |
