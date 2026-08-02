---
editLink: false
next: false
---

# Registro de alterações

## 1.2.7 · 2026-07-29

### Novos recursos

- Melhoramos a compreensão e a eficiência de navegação em bases de código grandes.
- Adicionamos insights opcionais de qualidade da resposta, apresentando a avaliação da qualidade desta resposta, da compreensão dos requisitos e da confiança na verificação.
- Os detalhes das estatísticas de cache agora oferecem paginação, filtros vinculados e vários idiomas.

### Correções

#### Controle de código-fonte e runtime do Agent

- Corrigimos o campo de mensagem de commit que ficava vazio ou inválido após atualizar um repositório de controle de código-fonte, trocar de exibição ou reconstruir componentes.
- Corrigimos travamentos do raciocínio do Agent, detecção incorreta do estado do terminal, perda dos códigos de saída de comandos em segundo plano e encerramento prematuro de tarefas.
- Corrigimos problemas na edição de mensagens da fila, no feedback de chamadas de ferramentas, na restauração da lista de tarefas e no estado de turnos contínuos.

#### Chat e ambientes remotos

- Corrigimos o truncamento prematuro das conversas originais ao editar e reenviar mensagens. Agora as mensagens são substituídas atomicamente após a conclusão da validação.
- Corrigimos problemas de caminhos remotos no WSL e no Remote SSH e melhoramos a inicialização do host, as tentativas de senha e o cache do servidor.

#### Renderização, modelos e estado

- Corrigimos a análise de fórmulas em bloco do KaTeX, os temas de blocos de código, a renderização de fontes chinesas e o alinhamento de ícones de arquivos.
- Corrigimos casos em que alguns modelos exibiam respostas vazias, expunham pilhas de erros ou enviavam solicitações de rede anormais ao provedor.
- Corrigimos o reaparecimento de conteúdo excluído no Super Memory e a reversão inesperada do estado do painel do navegador.

### Melhorias

#### Busca e execução do Agent

- Otimizamos a busca, as chamadas de ferramentas, a execução de tarefas e a lógica de encerramento do Agent para reduzir conclusões repetidas, esperas desnecessárias e interrupções anormais.
- Otimizamos os limites de resultados, os tempos limite de execução e o estado de streaming das buscas de código em grande escala, reduzindo o consumo de recursos de conjuntos de resultados excessivos.

#### Experiência de chat

- Melhoramos o estado de conclusão do chat, a barra de ferramentas inferior, o posicionamento da rolagem e o carregamento de conversas longas.

#### Configurações e uso

- Redesenhamos os cartões de conta de modelo e login OAuth, unificando a hierarquia visual e os padrões de interação na página de Configurações.
- Melhoramos o uso do Codex, os metadados de modelos e os indicadores de status relacionados.

## 1.2.6 · 2026-07-27

### Adicionado

#### Git do chat em nível de sessão

- Agora é possível enviar juntos os changes de código gerados por IA na mesma sessão.
- Adicionamos detecção e processamento simultâneos para vários repositórios Git.
- O status das tarefas de chat e da revisão de código agora é sincronizado automaticamente após o envio.

#### Provedores, modelos e capacidades

- Adicionamos o provedor **Poolside Platform**, com acesso ao **Poolside Laguna** por meio de uma configuração compatível com OpenAI.
- Adicionamos configurações para os modelos **Qwen3.8**, **Opus 5** e **Pangu**.
- Aprimoramos o **LongCat** com reprodução de inferência, preservando o contexto de raciocínio após chamadas de ferramentas.

#### Segurança do workspace remoto

- Adicionamos um aviso de segurança ao acessar o diretório raiz do Linux `/` em um ambiente remoto.
- Caminhos de sistemas de arquivos virtuais do Linux, como `/proc`, `/sys` e `/dev`, agora são excluídos automaticamente.

### Melhorias

#### Revisão de código

- Redesenhamos a barra de ações **Aceitar/Rejeitar** para blocos de código individuais.
- Atualizamos **Manter tudo** para seguir a cor de destaque do tema atual.
- Reduzimos a altura das barras de ações em linha para deixar a área de código mais compacta.
- As barras de ações de revisão agora são recolhidas e redefinidas automaticamente após um commit Git bem-sucedido.

#### Seletor de modelos

- Depois que uma chave é inserida pela primeira vez, apenas cinco modelos recomendados são habilitados por padrão para reduzir a redundância da lista.
- As capacidades dos provedores compatíveis com OpenAI agora se adaptam ao formato de API selecionado.

#### Envio de código e atualização do SCM

- O status do Git na barra de atividades agora é atualizado automaticamente após o salvamento de arquivos.
- Os envios do Chat Git agora são tratados uniformemente como **Manter todas as alterações**, concluindo automaticamente as etapas correspondentes de revisão de código.

#### Interface

- Removemos o indicador de não lidas dos títulos de notificações.
- Melhoramos a troca dos menus ao passar o mouse sobre grupos de modelos compatíveis com OpenAI.
- Corrigimos o alinhamento vertical do texto de contagem de ferramentas.
- Habilitamos o estilo de ícone Kimi Mono no tema claro.

### Correções

#### WSL e Git remoto

- Corrigimos uma falha na inicialização do host de extensões do WSL.
- Corrigimos a configuração inconsistente do proxy do servidor WSL.
- As verificações de status do Git e as mensagens de commit geradas por IA em ambientes WSL e SSH agora são executadas por um canal com suporte a ambientes remotos.
- Impedimos que comandos Git de workspaces remotos sejam executados em caminhos locais.
- Corrigimos um problema que fazia o Agent fechar repositórios Git automaticamente após modificar arquivos.
- Corrigimos a exibição incorreta de caminhos relativos em URIs remotas.

#### Remote SSH

- Corrigimos o tratamento de expiração de senha no Remote SSH. Senhas salvas agora são apagadas quando rejeitadas pelo servidor, e o usuário é solicitado a inseri-las novamente durante a mesma tentativa de conexão.
- Impedimos que o Remote SSH baixe pacotes de servidor REH com hashes de commit incompatíveis, evitando erros de versão e falhas na inicialização do host remoto.

#### Renderização do chat

- Adicionamos suporte a Trusted Types para gráficos Mermaid.
- Melhoramos a sanitização de tags Mermaid para impedir que tags inseguras ou malformadas causem falhas de renderização.

#### Regras e memória

- Corrigimos o salvamento de conteúdo vazio depois que o editor perdia o foco.
- Corrigimos a atualização atrasada do gerenciador de recursos após alterações na configuração `.breezell`.

#### Exibição de árvore remota

- Erros sem significado não são mais emitidos repetidamente na exibição de árvore quando a configuração de SSH Hosts está ausente.

## 1.2.5 · 2026-07-22

### Adicionado

- Adicionamos integrações de provedores e modelos para **Tencent Hunyuan HY3** e **TokenHub**.
- Adicionamos **Gemini 3.6 Flash** e **Gemini 3.5 Flash-Lite**, ambos oficialmente disponíveis para uso geral.
- Adicionamos badges de projeto aos históricos de chat em workspaces com várias raízes.
- Ampliamos o suporte a capacidades de canais de provedores compatíveis.
- Adicionamos traduções da interface para japonês, espanhol, português e outros idiomas.
- Atualizamos o guia do protocolo OpenAI com duas recomendações mais claras:
  - Endpoints compatíveis com OpenAI usam o protocolo OpenAI por padrão.
  - A Responses API é recomendada para modelos GPT.

### Correções

- Corrigimos um problema em que novos itens de tarefas permaneciam presos em **Aguardando confirmação**.
- Corrigimos planos de várias etapas que exigiam clicar manualmente em **Continuar** após cada lote.
- Corrigimos barras de duração, Revisão, Git e ações de ferramentas que continuavam destacadas e clicáveis depois da reversão para um checkpoint.
- Corrigimos a sincronização incorreta das restrições de acesso no painel de desenho e melhoramos mensagens de restrição pouco claras.
- Corrigimos telas em branco que não recebiam um nó padrão ao serem abertas pela primeira vez.
- Corrigimos sessões do modo Chat que vazavam ou se misturavam entre várias janelas.
- Corrigimos a seleção que voltava para um modelo indisponível depois que o modelo selecionado era excluído.
- Corrigimos o funcionamento incorreto do staging de um único arquivo no Chat Git.
- Corrigimos problemas de commit e atualização em workspaces com vários repositórios.
- Corrigimos a perda de históricos de chat após adicionar uma pasta ao workspace.
- Corrigimos ícones ausentes na barra de atividades em ambientes WSL e SSH.
- Corrigimos a oscilação da lista de projetos no Explorer.
- Corrigimos verificações simultâneas de status do Git na exibição do repositório que sobrecarregavam o host de extensões.
- Corrigimos a saída malformada `****` que interrompia streams de raciocínio da OpenAI.
- Corrigimos o estilo do botão de fechar nas bolhas de edição.

### Melhorias

- Simplificamos os cartões de inicialização da página de boas-vindas com blocos tracejados e unificamos os ícones de revisão de código.
- Atualizamos o texto secundário do Super Memory para usar itálico.
- Consolidamos os cartões de provedores na página de Configurações.
- Melhoramos o layout do título dos diálogos de configuração de rede.
- Melhoramos a localização do seletor de modelos vazio e permitimos abrir as Configurações diretamente a partir do seletor.
- Garantimos que a capacidade `supportsFast` do diretório em segundo plano seja transmitida corretamente pelo pipeline de solicitações.
- Corrigimos as informações de preço do **Qwen 3.7**.

## 1.2.4 · 2026-07-20

### Novos recursos

#### Modelos e provedores

- Integramos o **Grok 4.5**, com intensidade de inferência ajustável e um canal Fast; o **Claude Sonnet 5** está disponível com contextos de **200K** e **1M**.
- Adicionamos o **Kimi K3** pelos canais Moonshot API e Kimi Code, com contextos de **256K** e **1M**, além de suporte completo ao **Kimi K2.7 Code**.
- Adicionamos o provedor **StreamLake**, com toda a família de modelos KAT-Coder da Kuaishou, predefinições integradas de Coding Plan e predefinições de endpoints pré-pagos.
- Adicionamos login OAuth para contas Grok.
- Redesenhamos os canais Fast, que deixaram de ser uma alternância global e passaram a ser uma configuração independente de **provedor + modelo**, para que Copilot, Codex, Claude e outros provedores usem a semântica de seus canais oficiais.
- Configurações compatíveis com OpenAI agora podem ser fixadas para manter canais usados com frequência no topo.
- Adicionamos suporte a testes e descontos de modelos por tempo limitado, com badges promocionais no seletor de modelos.
- Atualizamos o diretório de modelos com modelos principais atuais, incluindo Claude Fable 5, Claude Sonnet 5, Nemotron 3 Ultra, DeepSeek V4, GLM-5.2 e MiniMax M3, removendo entradas obsoletas.

#### Uso, aparência e interface

- Atualizamos o Centro de uso com exibição multilíngue de uso e horário de redefinição para Codex, Kimi e Copilot em chinês simplificado, chinês tradicional, coreano e russo. Os dados de Configurações e da barra lateral do chat agora são sincronizados em tempo real, e o uso do Copilot mostra Chat, Completions e Premium Requests separadamente.
- Os títulos da página de boas-vindas agora podem ser personalizados globalmente ou por modo, incluindo tamanho e peso da fonte. Adicionamos o estilo **Elegant** para atalhos de acesso rápido.
- Adicionamos japonês, espanhol e português brasileiro como idiomas de interface.
- Redesenhamos o centro de notificações para seguir o idioma do produto, atualizamos o layout do cartão Super Memory e suavizamos o visual do campo de entrada e das bolhas de mensagem.

#### Navegador, chat e workspace

- O navegador integrado agora permite silenciar todas as abas ou abas individuais, com sincronização em tempo real entre a lista de abas do painel e o navegador.
- As mensagens de chat agora podem incluir até **10 imagens**; elas são redimensionadas automaticamente e incluídas no cálculo de contexto. Adicionamos exibição da duração do turno, reversão com um clique dentro das mensagens e opções para abrir links no navegador externo ou integrado.
- O diálogo de commit do chat agora aceita workspaces com vários repositórios: gera informações de commit por repositório, permite envios independentes, inicializa repositórios diretamente pelo diálogo e preserva o progresso de commit/push após reinicializações.
- Adicionamos agrupamento de projetos no gerenciador de recursos e atualizações mais rápidas do status de colaboração entre várias janelas.
- Adicionamos memória persistente, que destila automaticamente o histórico de conversas em experiências reutilizáveis com deduplicação multilíngue.

#### Diagnóstico e produtividade

- Adicionamos visualização de cache com notificações por turno e relatórios diários do workspace comparando hoje e ontem, incluindo filtros de sessão/workspace, economia estimada e análise de cache miss.
- Adicionamos cartões de design interativos que podem gerar rascunhos de design HTML diretamente no chat e aplicá-los após a confirmação.
- As configurações de rede do provedor agora aceitam testes de velocidade paralelos com um clique entre conexão direta, proxy do sistema, proxy global e rotas personalizadas. Rotas recomendadas são identificadas automaticamente e badges de roteamento são atualizados em tempo real na página de Configurações.
- Atualizamos o núcleo do visualizador de PDF com uma nova barra de ferramentas. Anexos são contabilizados por página, ocultados automaticamente quando o contexto é limitado e restringidos pelos limites de volume e páginas de cada modelo.

### Melhorias

- Redesenhamos a experiência de comandos em segundo plano: itens da barra de status permanecem visíveis até os comandos realmente terminarem, enquanto comandos simultâneos são recolhidos em um resumo expansível.
- Ampliamos a autorização de recursos avançados e a compatibilidade com extensões populares, como Python e Pylance, além de melhorar a compatibilidade com desenvolvimento remoto.
- Melhoramos a confiabilidade de instalação e atualização em redes domésticas.
- Tornamos a compressão automática de contexto mais inteligente, acionando-a dinamicamente de acordo com o contexto disponível e reduzindo compressões desnecessárias.
- Skills integradas agora são habilitadas sob demanda e usam o modo leve por padrão.
- Agents agora concluem planos de várias etapas sem pausar no meio para pedir confirmação, com respostas mais contidas e focadas nos resultados.
- Otimizamos profundamente o pipeline de solicitações para reduzir o custo de conversas longas.
- Redesenhamos os avisos de erro com banners mais discretos, gavetas de detalhes e uma renderização mista de chinês e inglês mais clara.
- Restauramos a alternância de layout da barra de título, reorganizamos os acessos rápidos em páginas de chat vazias e impedimos que ícones de provedores acionem alertas do sistema.

### Correções

- Resolvemos lentidão e uso anormal de memória em conversas longas, acelerando significativamente a abertura de sessões antigas e melhorando a fluidez de respostas extensas.
- Servidores MCP desabilitados ou offline não expõem mais ferramentas aos modelos, evitando chamadas acidentais; conexões MCP também permanecem estáveis após alternâncias, e erros de leitura de configuração não limpam mais as configurações salvas.
- Corrigimos ícones de navegação das Configurações exibidos incorretamente em negrito, falhas em determinados ambientes Linux e vários outros problemas de interface.
- Corrigimos problemas no carregamento de sessões anteriores que podiam causar falhas na interface ou crescimento ilimitado do armazenamento.
- Corrigimos estados falsos de “contexto comprimido”: a compressão real agora é mostrada explicitamente, e foram resolvidos desvios de compreensão em conversas longas e interferências de memória entre sessões.
- Excluir um modelo ou configuração de canal ativo agora seleciona automaticamente uma opção disponível em vez de deixar caixas de seleção vazias.
- Alternar entre as abas Plan e Analysis agora preserva o estado sem recarregar o conteúdo.
- Corrigimos telas brancas ocasionais no painel de desenho, entradas obsoletas após o término de comandos em segundo plano, problemas na barra de rolagem das Configurações e outros detalhes menores.
- Melhoramos a compatibilidade de parâmetros entre modelos, incluindo edição de instruções, detecção de interrupção de streaming, limites de orçamento de raciocínio e alinhamento de documentos.

## 1.2.1 · 2026-07-08

Temos o prazer de anunciar o lançamento do Breezell v1.2.1. Esta atualização traz melhorias abrangentes para controle de código-fonte, comandos em segundo plano, fluxos de trabalho do terminal, Skills, suporte a modelos, processamento de tarefas de imagem, acabamento da interface e interações de IA de longa duração. Ela também inclui muitas correções de estabilidade para saída em streaming, sincronização do estado do editor, persistência de sessões, comportamento em várias janelas e autenticação.

### Novos recursos

- A exibição de Controle de código-fonte agora aceita detalhes de commits expansíveis e navegação por arquivos relacionados, tornando o acompanhamento de alterações mais claro e intuitivo.
- Melhoramos a colaboração entre comandos em segundo plano e o terminal, com exibição do status de várias tarefas e feedback mais claro quando os usuários interrompem uma tarefa manualmente.
- O painel Skills agora funciona junto com o interruptor mestre Superpowers, criando um caminho de configuração mais unificado.
- A página inicial da conversa agora inclui atalhos para recursos usados com frequência, reduzindo o tempo necessário para acessá-los.
- Atualizamos os elementos visuais da marca e os identificadores da interface nas telas de inicialização e no Team Mode.
- Ampliamos o suporte e a adaptação de parâmetros para a última geração de modelos de IA populares.
- Atualizamos as configurações de imagem, incluindo acompanhamento de status para tarefas assíncronas no estilo vídeo.
- Adicionamos a primeira fase da execução de scripts em lote, projetada para cenários de automação em várias etapas.

### Correções

- Corrigimos problemas em que o streaming da conversa de IA podia travar, produzir formatação anormal ou não se recuperar corretamente após a interrupção de tarefas longas.
- Corrigimos a aplicação repetida de ferramentas de edição de código, comportamentos anormais de navegação e dessincronização do estado do editor após rejeitar alterações.
- Corrigimos atrasos na atualização das estatísticas de uso de contexto, anéis de progresso e mensagens de dica.
- Corrigimos notificações de atualização de versão travadas e várias strings sem tradução.
- Corrigimos problemas de usabilidade e exibição no Super Memory, na revisão de código e em fluxos relacionados de ferramentas.
- Corrigimos problemas de persistência de sessões e reduzimos a lentidão da lista de histórico ao lidar com threads grandes ou grande quantidade de conteúdo colado.
- Corrigimos painéis sobrepostos, como MCP e Skills, que ficavam bloqueados durante as conversas.
- Corrigimos interrupções ocasionais de streaming durante saídas longas no estilo pesquisa.
- Corrigimos lembretes de conclusão de tarefas que não eram acionados quando a janela estava sem foco.
- Corrigimos configurações sobrescritas entre várias janelas e barras de operações em lote que desapareciam inesperadamente.
- Corrigimos sessões de autenticação que exigiam novo login ou exibiam estados inconsistentes em determinados cenários.

### Melhorias

- Atualizamos o runtime principal e as dependências de IA para melhorar a estabilidade e a compatibilidade gerais.
- Otimizamos estratégias de cache de prompts e chamadas de ferramentas para reduzir custos repetidos e melhorar a consistência das respostas.
- Melhoramos a renderização de streaming e a lógica de atualização da interface, deixando conversas longas e saídas de alta carga mais fluidas.
- Otimizamos o mecanismo de tempo limite de solicitações LLM para reduzir a probabilidade de tarefas longas de geração serem interrompidas incorretamente enquanto ainda há progresso.

## 1.2.0 · 2026-07-06

O Breezell v1.2.0 apresenta novas ferramentas de IA, fluxos de trabalho de Agent mais inteligentes, atualizações da interface, correções de estabilidade e melhorias de desempenho em conversas longas, execução de ferramentas, saída do terminal, isolamento de memória e desenvolvimento remoto.

### Ferramentas de IA e capacidades inteligentes

- Adicionamos a nova ferramenta **Agent Research**, com acompanhamento de progresso e exibição de resultados em tempo real.
- Adicionamos execução de scripts em lote no Code Mode como primeira fase do suporte à automação em várias etapas.
- Adicionamos um ponto de entrada unificado para ferramentas do navegador, consolidando ações antes separadas em um fluxo mais simples.

### Conversa e interface

- Adicionamos uma **barra de mensagens** à área de chat, facilitando a navegação e o salto entre mensagens.
- Adicionamos cartões de acesso rápido para **Super Memory** e **Revisão de código** na página inicial do chat.
- Adicionamos um painel de alternância rápida para **servidores MCP** na área de entrada, permitindo habilitar ou desabilitar o MCP sem abrir as Configurações.
- Introduzimos uma nova identidade de marca, com atualizações visuais unificadas na página de lançamento, na página de boas-vindas e no Teams Mode.
- Redesenhamos a interface de gerenciamento de provedores nas Configurações, que agora oferece navegação em lista e visualizações detalhadas.
- Adicionamos cores de destaque personalizadas para o tema, disponíveis nos modos claro e escuro.
- Atualizamos as configurações de imagem para a v2, com suporte a polling e acompanhamento de tarefas assíncronas de vídeo.
- Adicionamos relatórios de verificação de integridade para provedores compatíveis com OpenAI, facilitando o diagnóstico de problemas de conexão e configuração.

### Estabilidade

- Corrigimos a lentidão ao carregar históricos longos de conversas e respostas demoradas ao colar grandes blocos de conteúdo.
- Corrigimos congelamentos ocasionais da interface durante a saída de streaming de IA, especialmente quando o terminal produzia grandes volumes de saída.
- Corrigimos casos em que a barra de ações **Manter tudo / Desfazer tudo** desaparecia inesperadamente.
- Corrigimos configurações sobrescritas quando várias janelas estavam abertas ao mesmo tempo.
- Corrigimos problemas que impediam o uso correto do **Super Memory** em determinados modos.
- Corrigimos interrupções incorretas por tempo limite durante a geração de IA, para que gerações lentas, mas saudáveis, não sejam interrompidas cedo demais.
- Corrigimos falhas de refresh token que podiam fazer os usuários entrarem novamente várias vezes.
- Corrigimos resultados de execução de ferramentas que perdiam o pareamento correto quando o usuário interrompia com uma nova mensagem.
- Corrigimos a compressão silenciosa de resultados de ferramentas que fazia a IA executar a mesma tarefa repetidamente.
- Corrigimos a exibição imprecisa do código de saída do terminal e casos em que a saída do terminal não podia ser totalmente restaurada.
- Corrigimos conexões Remote SSH que perdiam a capitalização do nome do host e as informações de porta.

### Melhorias de desempenho e experiência

- Melhoramos a velocidade geral de resposta simplificando a superfície de ferramentas de IA e reduzindo a sobrecarga do sistema em cada turno.
- Otimizamos as estratégias de busca e leitura com uma abordagem de “localizar primeiro e ler em janelas depois”, reduzindo leituras completas desnecessárias.
- Adicionamos isolamento de memória no nível do workspace, impedindo que memórias de projetos diferentes interfiram umas nas outras.

## 1.1.9 · 2026-06-26

### Novos modelos

- Adicionamos suporte a vários novos modelos de linguagem, além de modelos de geração de imagens e vídeos, oferecendo mais opções.

### Novos recursos

- Agents agora oferecem Deep Research, facilitando a exploração mais profunda de perguntas complexas.
- A barra lateral do chat agora permite ir com um clique à mensagem mais recente e copiar mensagens com um clique.
- O gerenciamento de provedores de serviço agora oferece layout em lista, e a interface do MCP Market foi atualizada.

### Melhorias de experiência

- Refinamos os temas claro/escuro, a interface do terminal e vários detalhes da interface para uma experiência visual mais limpa.

### Desempenho e estabilidade

- Atualizamos o mecanismo de runtime subjacente para um início e uma operação mais suaves.
- Agents agora são mais inteligentes e estáveis, reduzindo ações repetitivas e ineficazes.
- Corrigimos problemas relacionados a login, terminal, conexões remotas e várias áreas da interface.

## 1.1.8 · Correção de bugs · 2026-06-09

- Adicionamos uma nova validação para ajuste de intensidade.
- Otimizamos diálogos repetidos e o contexto inteligente automático.
- Corrigimos problemas de rolagem na página de conversa.
- Corrigimos a compressão instável.

## 1.1.7 · 2026-06-07

- Corrigimos o modelo de otimização que era excessivamente prolixo.
- Corrigimos um problema anormal com a marcação de arquivos na revisão de otimização.
- Corrigimos vários bugs.

## 1.1.6 · 2026-06-06

### Adicionado

- **Painel de revisão de código**: exibição de revisão independente, diff com números de linha, diff Myers para arquivos grandes, rollback/reversão, seleção de referência/cópia e envio para o chat.
- **Configurações de aparência**: largura/localização da barra de atividades, posição da barra lateral e estilo das abas do editor.
- **Navegador Breezell**: interface do painel redesenhada, barra de endereço/pesquisa, modo anônimo e fechamento automático quando a última aba é fechada.
- **Painel de banco de dados**: descoberta de SQLite no workspace, CRUD completo para MongoDB/Oracle e renomeação de conexões.
- **Melhorias no chat**: referência às 3 rodadas recentes do histórico, anexos de chat, citação/cópia em rich text, compressão manual de contexto e progresso de condensação.
- **Novos provedores**: GitHub Copilot, Kimi Code (OAuth de dispositivo); otimização de uso/ícone do Codex.
- **Super Memory**: interface com percepção de tempo (FreshBadge e cartões de recuperação).
- **Modelos/Provedores**: MiniMax M3, Opus 4.8, glm-5.1; redesign da página de configuração compatível com OpenAI.
- **Central de notificações**: abas na barra lateral esquerda e layout dividido maior.
- **Exibição de erros**: cartões de erro estruturados, detalhes brutos expansíveis e erros permanentes sem novas tentativas.
- **Outros**: tradução para russo e anel/bandeja de uso de contexto.

### Correções

- **Agent/Ferramentas**: leitura sempre atualizada de arquivos e sincronização das ferramentas de arquivo com o disco.
- **Revisão/Renderização**: tabelas GFM, espaçamento do Explore e OOM de Markdown/Mermaid em streaming em sessões longas.
- **Remoto/Terminal**: cadeia completa de ferramentas SSH, reflow do terminal do Windows, confusão de ID do terminal e deadlock ao fechar abas.
- **Ajustes de interface**: o ajuste da largura da barra de atividades reduz a oscilação do painel; também corrigimos a altura do painel de notificações, o texto dos dias de retenção do Super Memory e outros detalhes.

### Otimizações

- **Desempenho**: melhoria significativa da taxa de acerto do cache, do LCP da inicialização/tela de abertura e do gerenciamento de memória de conversas longas.
- **Dependências/Base**: Electron 39.8 → 42.3.3.

## 1.1.5 · 2026-05-24

### Novos recursos

- **Citação e cópia no chat**: depois de selecionar texto em um chat, converta-o rapidamente em uma citação Markdown ou copie-o diretamente, preservando listas, blocos de código e tags de nome de arquivo.
- **Notificação automática para comandos em segundo plano**: notificações são enviadas automaticamente quando tarefas de terminal de longa duração terminam, eliminando a necessidade de verificar o progresso repetidamente.
- **Renderização de fórmulas matemáticas**: o chat agora oferece suporte correto à renderização matemática em LaTeX, incluindo $x^2$ e $...$.
- **Redesign da exibição de erros**: mensagens de erro aparecem em cartões expansíveis, com cópia do conteúdo completo em um clique.
- **Suporte completo a desenvolvimento remoto por SSH**: todas as chamadas de ferramentas em hosts SSH remotos agora são totalmente compatíveis.
- **Diagnóstico de travamentos do streaming**: quando uma resposta em streaming trava, diagnósticos detalhados indicam se a causa é latência upstream, buffer de rede etc.
- **Barra de uso do contexto do modelo**: o seletor de modelos mostra claramente, por categoria, o uso de tokens da sessão atual.
- **Rótulo “Modelo padrão”**: o seletor de modelos identifica claramente o modelo padrão.
- **Atualização do painel de memória de longo prazo**: novas tags de tempo como “Agora”, “Hoje” e “Esta semana”, estilo de vidro fosco e cartões de recuperação de memória.
- **Exibição do título do plano durante o streaming**: quando o modelo gera um plano, o título aparece durante a saída em streaming.
- **Erros permanentes ignoram tentativas automaticamente**: erros permanentes, como falhas de autenticação, não geram mais tentativas automáticas sem sentido.
- **Suporte a novos modelos**: adicionamos suporte a modelos como Gemini 3.5 e Qwen 3.7.
- **Suporte à interface em russo**.
- **Cartões de ferramentas do chat expansíveis**: saídas como resultados de busca e leituras de arquivos podem ser recolhidas/expandidas.

### Correções

- Aumentamos o tempo limite de respostas em streaming de 120 s para 180 s, com uma mensagem intermediária na interface para modelos de inferência mais lenta.
- Corrigimos o problema de camadas dos menus suspensos na página de Configurações; menus de provedores de terceiros não ficam mais ocultos.
- Corrigimos a exibição de erros `[object Object]`.
- Corrigimos o botão de cópia da gaveta de erros que não funcionava.
- Corrigimos o congelamento da caixa de prompt de caminho de arquivo, que não permanece mais após rolar para longe.
- Otimizamos o esquema de cores da seleção de texto no chat, corrigindo variáveis de estilo quebradas.
- Corrigimos o scroll-through do seletor de modelos; rolar o menu de modelos não rola mais a área de chat abaixo.
- Corrigimos a compatibilidade de schema do modo de raciocínio, melhorando a compatibilidade de parâmetros de inferência sob o protocolo Claude.
- Otimizamos a visualização em streaming de vários arquivos; os indicadores em tempo real de “N alterações” não atrasam mais.
- Corrigimos vários detalhes da interface, incluindo rolagem, espaçamento, alinhamento, animações e tooltips.

### Otimizações

- **Atualização da stack tecnológica**: Electron atualizado para 42.2.0, incluindo Chromium 148, Node.js 24 e V8 14.8.
- **Otimização do gerenciamento de memória**: grandes históricos de chat são gravados automaticamente no disco e os registros de inferência são organizados conforme necessário, mantendo conversas longas leves.
- **Renderização aprimorada de gráficos Mermaid**: melhoramos o gerenciamento de cache com limpeza proativa de SVG ao descarregar, evitando acúmulo de memória durante chats longos.

## 1.1.4 · 2026-04-26

### Novos recursos

- **Modelos da série DeepSeek V4**: adicionamos itens DeepSeek V4 à lista/configuração de modelos para seleção direta.
- **Interface de cartão “Slot” compatível com OpenAI**: redesenhamos a interface em cartões das áreas de configuração compatíveis com OpenAI.

### Correções

- Barras laterais e configurações não “travavam” mais: após trocar de modelo e operar regras/memória, elas são atualizadas rapidamente sem reinicialização.
- Corrigimos links de arquivos no chat que não podiam ser abertos ou eram analisados incorretamente.
- Tornamos as ferramentas de terminal mais confiáveis: comandos agora passam pelo serviço de terminal do sistema.
- Corrigimos saltos e alturas irregulares na área de chat quando cartões de “Pensamento/Conteúdo em streaming/Ferramentas de terminal” apareciam ou trocavam de estado, além de corrigir uma falha causada por referência a variável.
- Atualizamos a visualização de PDF e os comportamentos de uso/exibição das ferramentas relacionadas.
- Corrigimos a persistência e o tratamento de grandes volumes de resultados de ferramentas para reduzir anomalias ou perda de estado.
- Atualizamos os relatórios de erro do LLM e os recursos de interface da área de chat.

### Otimizações

- Seleção de painéis de modelos na caixa de entrada.
- Maior estabilidade das ferramentas de terminal.

## 1.1.3-v2 · 2026-04-23

### Novos recursos

- Suporte ao modelo GPT-5.5, adicionado a todas as listas de provedores.
- Adicionamos o modelo Kimi K2.6, disponível nos principais provedores (OpenRouter, Together AI, Fireworks, DeepInfra etc.).
- Fórmulas matemáticas agora podem ser exibidas no chat (renderização KaTeX).
- Fluxogramas agora podem ser exibidos no chat (renderização de gráficos).
- Adicionamos uma ferramenta de busca na web com controle sobre profundidade e parâmetros de tópico.
- A ferramenta de terminal foi atualizada para o modo PTY, oferecendo uma experiência mais realista.
- Adicionamos um índice de símbolos de código com suporte a ir para a definição.
- Adicionamos uma ferramenta de análise de dependências (detecção de ciclos, rastreamento de dependências: quais arquivos são afetados por uma alteração, a cadeia de dependências entre os arquivos A e B e se existem dependências circulares).
- Skills agora permitem arrastar e compactar arquivos/pastas.
- Adicionamos um indicador de status de atualização do IDE à barra de título.
- Reformulamos o painel multi-Slot: busca, ordenação, verificações de integridade e limpeza em lote de APIs inválidas.

### Correções

- Chats longos não congelam mais: corrigimos o congelamento da interface com mensagens em excesso.
- A rolagem não volta mais ao final ao visualizar o histórico do chat.
- Corrigimos vazamento de subprocessos do terminal, eliminando picos de memória ou falhas causados por processos residuais.
- Corrigimos a exibição de caminhos de arquivos; links não são mais corrompidos em caminhos falsos por reticências.
- Corrigimos o Super Memory vazio; tags de raciocínio da IA não vazam mais e não deixam a memória vazia.
- Corrigimos o recolhimento de comandos do terminal; comandos com falha não são mais engolidos por comandos bem-sucedidos posteriores.
- Corrigimos o estilo do lembrete flutuante de tarefas do plano, incluindo o problema de fundo em duas camadas.
- Corrigimos saltos do chat ao expandir a lista de arquivos.
- A IA não pergunta mais repetidamente “continuar?” e passa a executar de forma autônoma (é necessário fazer autotestes).
- Alinhamos a barra de rolagem na caixa de conteúdo do Skills.
- Corrigimos casos em que a execução reconhecia o código de saída 0, mas o build real falhava.

### Otimização de desempenho

- Otimizamos significativamente a renderização do chat.
- Adicionamos memo à renderização Markdown para evitar reanalisar o mesmo conteúdo.
- Otimização de memória: reduzimos o limite de persistência dos resultados de ferramentas para evitar picos em conversas longas.
- Atualizamos o contador de tokens.
- Adicionamos um limite superior LRU ao cache de mensagens.
- Novo design da tela de abertura e do fluxo de integração.

## 1.1.1 · 2026-04-11

### Novos recursos

- O painel de histórico do chat agora possui um botão “Nova conversa” para facilitar a operação.
- A funcionalidade de banco de dados foi muito ampliada: suporte a Redis e MariaDB, nova confirmação de edição de células, badges de contagem de tabelas e possibilidade de abrir o painel de banco de dados diretamente pelo chat.
- A conversa de IA permite alternar entre os modos Plan/Agent para um fluxo mais suave.

### Correções e otimizações

- Corrigimos a conclusão de código repetida (conclusão com Tab).
- Corrigimos o salto de página ao focar a janela do navegador de arquivos.
- Corrigimos falsos relatos de desconexão ao minimizar a janela.
- Corrigimos vários bugs, como indexação de imagens, vazamento de memória IPC e tempos limite de LLM no chat.
- Corrigimos a tela branca causada pelo empacotamento do React e otimizamos o tamanho do pacote.
- Corrigimos vários problemas, como painéis vazios e desfazer no verificador CSS.
- Atualizamos para TypeScript 6.0 e Electron 41.2.0 para maior estabilidade geral.
- Fizemos uma revisão abrangente da interface: unificamos fundos e bordas dos cartões de ferramentas, alinhamos ícones das abas do editor e corrigimos a rolagem de blocos de código de diff, entre outros.

## 1.1.0 · 2026-04-09

### Novos recursos

- **Conclusão de código gratuita**: todos os usuários agora podem usar a conclusão de código por IA gratuitamente, sem configuração adicional.
- **Navegador integrado muito aprimorado**: oferece simulação de dispositivos (visualização em celular/tablet), títulos e ícones dinâmicos de abas, controle de zoom, inspetor CSS otimizado e gravação em tempo real de eventos de animação/transição.
- **Memória de conversa mais inteligente**: novo mecanismo automático de deduplicação e mesclagem para que a IA recupere conteúdo anterior com mais precisão e evite armazenamento duplicado.
- **Botão de alternância da barra lateral**: adicionamos um botão rápido de alternância na barra de título.
- **Otimização da lista de tarefas**: oferece mesclagem de tarefas, ordenação por prioridade e novas animações de transição.
- **Painel de equipe redesenhado**: novo design de tema escuro e carregamento de página mais rápido.
- **Carregamento sob demanda de mensagens de conversa**: históricos longos não são mais carregados de uma vez, acelerando a abertura.
- **Mecanismo de cache de API**: adicionamos cache da Responses API para reduzir solicitações duplicadas e economizar tokens.

### Melhorias

- Atualização do backend do editor: Electron atualizado para 41.2.0 e TypeScript para 6.0, proporcionando operação mais estável e fluida.
- Redesenhamos a interface de chamadas de ferramentas de IA, unificando estilos de cartões para operações de arquivo, ferramentas MCP etc.
- Otimizamos o diff de código: corrigimos rolagem no estado recolhido, barras horizontais e exibição da cor de fundo.
- Otimizamos notificações do sistema: evitamos envios duplicados e não reportamos desconexões ao minimizar.
- Otimizamos a detecção de comandos do terminal para identificar com mais precisão se os comandos foram executados.
- Melhoramos o desempenho de inicialização otimizando o fluxo de início e a renderização da lista de conversas.
- Evitamos estouro de memória em segundo plano limpando automaticamente a memória acumulada durante operações prolongadas.

### Correções

- Corrigimos mensagens enfileiradas que podiam ser enviadas para a thread errada ao alternar entre threads de conversa.
- Corrigimos a exclusão de um anexo de imagem que podia excluir outros anexos de arquivo.
- Corrigimos processos em segundo plano que continuavam executando após um tempo limite de resposta da IA.
- Corrigimos o problema de compatibilidade do TrustedHTML que causava páginas em branco.
- Corrigimos cliques em links do navegador integrado que não abriam novas páginas corretamente.
- Corrigimos botões de opção que ocasionalmente não apareciam ao fazer perguntas à IA.
- Corrigimos ícones desalinhados das abas do editor.

## 1.0.9 · 2026-04-03

### Novos recursos

- **Automação do navegador integrado**: integramos ferramentas de navegador CDP (captura de tela, clique, entrada, navegação, snapshot do DOM e registro do console); o Agent de IA pode operar páginas do navegador diretamente.
- **Simulação de viewport do dispositivo**: o navegador integrado pode simular diferentes resoluções (celular/tablet/desktop) e oferece uma lista de dispositivos rolável.
- **Gerenciamento de abas do navegador**: título/ícone dinâmicos, controle de zoom, troca entre várias abas e abertura rápida do painel do navegador pela caixa de entrada.
- **Chamadas paralelas de várias ferramentas**: permite que a IA retorne várias chamadas de ferramentas para execução paralela.
- **Botão de alternância da barra lateral na barra de título**.
- **Troca de painel Entanglement**: permite alternar painéis de forma independente e alinhar automaticamente ao ajustar a barra lateral.

### Correções

- Detecção de conclusão de comandos do terminal: habilitamos o protocolo OSC 633;D, corrigimos a limpeza ANSI e aceleramos o julgamento heurístico.
- Supressão de notificações do sistema de colegas: subthreads não enviam mais notificações irrelevantes ao sistema operacional.
- Substituição do modo Entanglement: o modo selecionado pelo usuário não é mais substituído silenciosamente pelo modo de agendamento.
- Vazamento de intenção: rótulos de intenção no modo causal do Entanglement não vazam mais para o texto exibido.

### Otimizações

- Desempenho de inicialização: otimização O(n) do chat e persistência de estatísticas de diff.
- Interface da ferramenta de terminal: otimizamos margens internas da barra de título/barra inferior e corrigimos o raio dos cantos do botão “Abrir no navegador”.
- Posicionamento do painel do navegador: usamos floating-ui para eliminar oscilação/deslocamento ao abrir.
