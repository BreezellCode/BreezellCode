---
title: Visão geral das opções de recursos
description: Visão geral das opções de recursos, permissões, comportamento do editor, configurações de inteligência e controles de acesso ao sistema do Breezell.
---

# Visão geral das opções de recursos

Esta página resume as principais opções de recursos disponíveis nas configurações do Breezell. Essas opções controlam conclusão automática, notificações, permissões de ferramentas, comportamento do editor, recursos inteligentes e acesso ao sistema.

## Ajuda

### Conclusão automática e notificações

| Recurso | Descrição |
| --- | --- |
| Conclusão automática | O BreezellTab oferece conclusão de código com IA. Pressione `Tab` para aceitar as sugestões. |
| Notificações do sistema | Configure o comportamento das notificações do sistema. O Breezell pode mostrar notificações quando o editor é minimizado ou perde o foco. |

## Execução

### Permissões de ferramentas

Estas opções controlam se operações específicas de ferramentas podem ser executadas automaticamente sem confirmação manual.

| Recurso | Descrição |
| --- | --- |
| Aprovar edições automaticamente | Permite que operações de edição sejam executadas automaticamente sem confirmação. |
| Aprovar terminal automaticamente | Permite que operações do terminal sejam executadas automaticamente sem confirmação. |
| Aprovar operações de banco de dados automaticamente | Permite que operações de banco de dados sejam executadas automaticamente sem confirmação. |
| Aprovar geração de mídia automaticamente | Permite que operações de geração de mídia sejam executadas automaticamente sem confirmação. |
| Aprovar ferramentas MCP automaticamente | Permite que operações de ferramentas MCP sejam executadas automaticamente sem confirmação. |
| Aprovar Teams automaticamente | Aprova automaticamente a criação de equipes sem confirmação manual. |

## Editor

### Comportamento do código

| Recurso | Descrição |
| --- | --- |
| Corrigir erros de Lint automaticamente | Corrige automaticamente erros de Lint quando houver suporte. |
| Aceitar alterações de código automaticamente | Aceita automaticamente alterações de código geradas ou modificadas. |
| Abrir arquivos automaticamente durante a edição | Abre arquivos automaticamente durante a edição. |
| Mostrar sugestões em linha ao selecionar | Mostra sugestões em linha quando texto ou código é selecionado. |

### Mensagem de commit do Git

Use esta opção para permitir que o Breezell gere uma mensagem de commit do Git a partir das alterações de código atuais. Isso é útil quando você quer um resumo claro do commit sem escrevê-lo manualmente.

![Gerar mensagens de commit com o modelo de chat](/feature-options/git-commit-message.png)

| Recurso | Descrição |
| --- | --- |
| Gerar mensagens de commit com o modelo de chat | Gera automaticamente mensagens de commit do Git com base nas alterações de código atuais. |

Quando esta opção está habilitada, o Breezell pode revisar o conjunto de alterações atual e criar uma mensagem de commit com o modelo de chat selecionado. Revise a mensagem gerada antes de fazer o commit se o projeto exigir um formato específico.

## Inteligência

### Gerenciamento de contexto

| Recurso | Descrição |
| --- | --- |
| Executar cartões de plano automaticamente | Quando habilitado, novos cartões de plano são executados automaticamente sem cliques manuais. |

### Skills do Superpowers

| Recurso | Descrição |
| --- | --- |
| Habilitar Skills do Superpowers | Permite que a IA use fluxos de desenvolvimento estruturados, como brainstorming, planejamento, TDD e revisão de código. O conteúdo completo é carregado sob demanda. |

### ~~Exploração avançada do Agent~~

> **Obsoleto após a versão 1.2.5.** Esta opção foi removida. Quando uma solicitação exige uma pesquisa profunda em várias fontes, o Breezell invoca automaticamente os recursos relacionados e resume os resultados em um relatório de pesquisa com citações.

| Recurso | Descrição |
| --- | --- |
| ~~Habilitar exploração avançada~~ | Obsoleto após a versão 1.2.5; os recursos de pesquisa relacionados são invocados automaticamente quando necessário. |

### Painel do modo Entanglement

| Recurso | Descrição |
| --- | --- |
| Mostrar painel no modo Entanglement | Exibe um painel estruturado em tempo real para o modo Entanglement, incluindo a etapa atual, o histórico de confiança, hipóteses ativas e resolvidas, registros de evidências avaliadas e grafos causais. |

## Sistema

### Configurações de rede

| Recurso | Descrição |
| --- | --- |
| Usar proxy do sistema | Usa o proxy do sistema para enviar solicitações de API. Se nenhum proxy for necessário ou o proxy estiver instável, recomenda-se desabilitar esta opção para melhorar a velocidade de resposta. |

### Acesso a arquivos externos

| Recurso | Descrição |
| --- | --- |
| Permitir acesso somente leitura a arquivos externos | Permite que as ferramentas leiam arquivos fora do workspace. |
| Permitir acesso de gravação a arquivos externos | Permite que as ferramentas modifiquem arquivos fora do workspace. As duas opções de acesso a arquivos externos são habilitadas por padrão. |

## Observações

As opções de aprovação automática e acesso externo podem melhorar a velocidade do fluxo de trabalho, mas também reduzem a revisão manual. Habilite-as somente quando estiverem de acordo com a política e o nível de confiança do seu workspace.