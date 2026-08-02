---
title: Visão geral da caixa de diálogo
description: Visão geral da caixa de diálogo do Breezell, incluindo menções, uso de contexto, seleção de modo, controles de modelo e ações rápidas.
---

# Visão geral da caixa de diálogo

A caixa de diálogo do Breezell é o local principal onde você escreve prompts, escolhe um modo de trabalho, seleciona um modelo, anexa contexto e controla como o Agent lida com a solicitação atual.

Esta página explica os controles visíveis mostrados nas capturas de tela da caixa de diálogo.

## Estado de entrada padrão

O estado de entrada padrão é o ponto de partida normal para uma nova mensagem. Ele mantém o campo de prompt e os controles essenciais visíveis.

![Estado de entrada padrão](/dialog-box/input-default.png)

Digite sua solicitação, escolha o modo e o modelo se necessário e envie a mensagem para o Breezell.

## Menu do seletor de modo

O ponteiro destaca o menu do seletor de modo. Esse menu lista os modos de trabalho disponíveis.

![Menu do seletor de modo](/dialog-box/mode-selector.png)

Os modos disponíveis incluem:

- [**Chat**](/pt-br/mode-selection#chat) para perguntas e respostas rápidas
- [**Plan**](/pt-br/mode-selection#plan) para planejar a implementação antes de editar
- [**Analyze**](/pt-br/mode-selection#analyze) para investigação somente leitura
- [**Entanglement**](/pt-br/mode-selection#entanglement) para raciocínio causal mais profundo
- [**Agent**](/pt-br/mode-selection#agent) para edição autônoma de arquivos e uso de ferramentas
- [**Teams**](/pt-br/mode-selection#teams) para colegas de IA em paralelo em tarefas complexas

Para mais detalhes, consulte [Seleção de modo](/pt-br/mode-selection). Escolha o modo que corresponde ao nível de autonomia e profundidade necessário.

## Seletor de modelos

O ponteiro destaca o seletor de modelos. O seletor mostra o modelo atual e permite mudar para outro modelo disponível antes de enviar a mensagem.

![Seletor de modelos](/dialog-box/input-compact-controls.png)

Use-o quando quiser escolher um modelo com características diferentes de velocidade, raciocínio ou capacidade.

## Upload de arquivos

O ponteiro destaca o controle de upload de arquivos.

![Controle de upload de arquivos](/dialog-box/input-model-controls.png)

Clique neste controle para anexar arquivos locais à mensagem atual antes de enviá-la ao Breezell. Os arquivos enviados tornam-se parte do contexto da solicitação, permitindo que o Breezell os inspecione ou consulte ao responder.

## ~~Exploração avançada~~

> **Obsoleto após a versão 1.2.5.** O controle dedicado de Exploração avançada não está mais disponível. Quando uma solicitação exige pesquisa mais profunda, o Breezell invoca automaticamente os recursos relacionados para aprendizado ativo, investigação mais ampla e exploração mais completa.

![Controle de Exploração avançada](/dialog-box/input-tools-expanded.png)

## Navegador Breezell

O ponteiro destaca o controle **Breezell Browser**.

![Controle do Breezell Browser](/dialog-box/input-agent-basic.png)

O Breezell Browser é a ferramenta de navegador integrada do Breezell. Use-a para abrir páginas da web, visualizar conteúdo online, buscar informações e ajudar a IA a recuperar e analisar conteúdo da web sem sair da caixa de diálogo.

## Detalhamento do uso de contexto

O ponteiro destaca o indicador de uso de contexto. Ao abri-lo, um detalhamento mostra como a janela de contexto atual está sendo usada.

![Detalhamento do uso de contexto](/dialog-box/context-usage-breakdown.png)

O detalhamento separa o uso em categorias como prompt do sistema, ferramentas, regras, memórias, Skills, MCP, subagentes e conteúdo da conversa. Use-o para entender quais partes da sessão estão consumindo mais tokens.

## Compressão manual do contexto

O ponteiro destaca o controle **Manual compress** no painel de contexto. Essa ação resume o conteúdo anterior da conversa para que a sessão mantenha informações úteis enquanto reduz o uso de contexto.

![Painel de contexto com compressão manual](/dialog-box/context-manual-compress.png)

A compressão manual é útil durante conversas longas, especialmente quando a janela de contexto está ficando grande, mas você ainda quer continuar na mesma sessão.

## Menu de menções

O ponteiro destaca a área de contexto rápido usada para abrir o menu de menções. O menu permite adicionar arquivos, pastas, ferramentas MCP e Skills à mensagem atual.

![Menu de menções na caixa de diálogo do Breezell](/dialog-box/mention-menu.png)

Use-o quando sua solicitação depender de conteúdo específico do workspace ou de um recurso externo. Adicionar o contexto correto ajuda o Breezell a entender o que deve inspecionar ou usar antes de responder.

## Dicas de uso

- Adicione contexto de arquivo ou pasta quando a solicitação depender de conteúdo específico do projeto.
- Agent é o modo padrão e o fluxo de trabalho automático recomendado para a maioria das tarefas.
- Troque de modo somente quando precisar de um fluxo específico, como planejar primeiro ou analisar sem editar.
- A compressão de contexto é executada automaticamente. Use a compressão manual somente quando preferir controle manual rigoroso ou tiver um requisito especial.
- Revise o modelo selecionado quando precisão, velocidade ou profundidade de raciocínio forem importantes.