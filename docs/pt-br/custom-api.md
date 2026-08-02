---
title: API personalizada
description: Saiba como configurar seu próprio provedor de API no Breezell em vez de usar a cota oficial.
---

# API personalizada

Se você não quiser usar a cota oficial do Breezell ou quiser usar sua própria chave de API, poderá configurar um provedor de API personalizado na página de configurações do Breezell.

Isso permite conectar o Breezell ao seu próprio provedor de modelos, gateway personalizado, chave de API e nome de modelo.

## Abrir a página de configurações do Breezell

Para começar, encontre o ícone de configurações na área superior direita do editor.

O ícone de configurações parece uma pequena engrenagem e fica próximo aos outros ícones da barra de ferramentas.

Clique no ícone de configurações para abrir o menu de configurações.

Na parte superior do menu, clique em **Breezell Settings**.

Depois de clicar em **Breezell Settings**, a página de configurações do Breezell será aberta.

![Menu de configurações do Breezell com Breezell Settings selecionado](/custom-api/settings-menu.png)

## Ir para a página Models

Depois de abrir as configurações do Breezell, você normalmente entrará na página **Models** por padrão.

Se não estiver nessa página, procure a barra lateral esquerda e clique em **Models**.

A página **Models** permite gerenciar modelos disponíveis, modelos oficiais, provedores de terceiros e provedores de API personalizados.

No topo da página, você verá vários modelos habilitados, como Claude, GPT, Gemini, Kimi e Grok.

Abaixo da lista de modelos, você verá a seção **Providers**.

![Página Models do Breezell com a seção Providers](/custom-api/models-page.png)

## Escolher um provedor

O Breezell oferece suporte a muitos provedores de modelos diferentes.

Por exemplo, você pode encontrar provedores como:

- OpenRouter
- Anthropic
- OpenAI
- OpenAI Codex
- Kimi Code
- GitHub Copilot
- DeepSeek
- Gemini
- Groq
- Mistral
- Qwen
- Google Vertex AI
- Microsoft Azure
- NVIDIA NIM
- Together AI
- Cohere
- Fireworks
- DeepInfra
- Cerebras
- Perplexity
- Moonshot AI
- ByteDance
- Hugging Face
- Baseten

Cada provedor pode ter métodos de configuração diferentes.

Por exemplo, se você estiver usando **OpenAI Codex**, poderá escolher **OpenAI Codex** na lista de provedores e entrar diretamente com sua conta do ChatGPT.

Depois do login, o Breezell pode encaminhar solicitações do Codex pelo backend oficial do Codex. Essa opção não exige uma chave de API separada.

![Página do provedor OpenAI Codex com login da conta ChatGPT e detalhes de uso do Codex](/custom-api/openai-codex-provider.png)

## Usar OpenAI-Compatible para uma API personalizada

Se quiser usar uma API de terceiros ou um gateway de API auto-hospedado, escolha **OpenAI-Compatible**.

Este é o provedor de API personalizada padrão.

Diferentemente dos provedores fixos, **OpenAI-Compatible** permite configurar manualmente seus próprios dados de conexão.

Você pode definir informações como:

- Apelido do provedor
- Base URL
- API key
- Protocol
- Endpoint preset
- Model name
- Custom headers

Isso é adequado para gateways personalizados, plataformas de API de terceiros, serviços de proxy ou provedores de modelos compatíveis com OpenAI.

![OpenAI-Compatible na seção Providers](/custom-api/providers-section.png)

## Abrir o painel de configuração da API personalizada

Na seção **OpenAI-Compatible**, encontre o slot padrão.

Ele pode aparecer como **OpenAI-Compatible 1**.

Você pode clicar na área do slot ou em **Manage slots**, no lado direito.

![Entrada de slot OpenAI-Compatible com o slot padrão e a ação Manage slots](/custom-api/open-slot-entry.png)

Isso abrirá o painel de configuração da API personalizada.

Dentro desse painel, você pode configurar a conexão, a autenticação, o protocolo, o endpoint e os modelos disponíveis do seu provedor de API personalizada.

![Painel de configuração do provedor OpenAI-Compatible com configurações de conexão e modelo](/custom-api/custom-api-panel-current.png)

## Gerenciar slots do provedor

No canto superior esquerdo do painel **OpenAI-Compatible Providers**, você verá um seletor **Available**.

Esse seletor mostra os slots de API personalizada disponíveis.

O Breezell oferece suporte a até **50 slots de provedores OpenAI-Compatible**. Cada slot pode ser configurado como um canal de API personalizada independente.

Por exemplo, você pode usar slots diferentes para provedores, gateways, chaves de API ou grupos de modelos diferentes.

Clique no seletor **Available** para abrir a lista de slots.

![Seletor Available mostrando slots de API personalizada de 1 a 50](/custom-api/provider-slots-current.png)

Você verá slots numerados de **1** a **50**.

Se estiver configurando o **Slot 1**, poderá selecionar o **Slot 2** para configurar outro canal de API personalizada.

Depois de selecionar outro slot, o painel de configuração mudará para esse slot. Você poderá inserir outro nome de provedor, Base URL, API key, protocolo, endpoint e lista de modelos para o novo canal.

## Configurar a conexão

Volte ao painel de configuração principal.

Na seção **Connection**, você pode configurar as informações básicas de conexão desse provedor de API personalizada.

![Seção Connection de um provedor de API personalizada com apelido, Base URL, API key, protocolo e modelos](/custom-api/configure-connection-current.png)

Você pode definir:

- Nickname
- Base URL
- API Key
- Protocol
- Endpoint preset
- Custom headers
- Model names

O **Nickname** identifica este provedor personalizado. Você pode inserir o nome do provedor, o nome do gateway ou qualquer rótulo que ajude a reconhecer este canal.

A **Base URL** é o endereço do gateway da API.

A Base URL deve começar com uma destas opções:

```text
http://
```

ou:

```text
https://
```

Por exemplo:

```text
https://api.example.com/v1
```

ou:

```text
http://127.0.0.1
```

Se a Base URL não começar com `http://` ou `https://`, a solicitação poderá falhar.

## Verificar a URL de solicitação final

Depois de inserir a Base URL e selecionar a predefinição do endpoint, verifique a **Request URL** exibida abaixo da seção de protocolo.

Essa área mostra o endereço final que o Breezell usará.

Por exemplo, se sua Base URL for:

```text
http://127.0.0.1
```

e a predefinição do endpoint for **OpenAI Generic**, o Breezell poderá gerar:

```text
http://127.0.0.1/v1/chat/completions
```

Confirme cuidadosamente se a Request URL final está correta.

Isso é importante porque diferentes provedores podem definir seus gateways de maneiras diferentes.

Alguns provedores exigem que a Base URL inclua `/v1`, enquanto outros exigem apenas o domínio raiz.

Por exemplo, um provedor pode exigir:

```text
https://api.example.com/v1
```

enquanto outro pode exigir:

```text
https://api.example.com
```

Se o provedor usa um formato de gateway não padrão, o preenchimento automático do endpoint pode não funcionar corretamente.

Isso pode fazer com que o caminho final da solicitação, como `/v1/chat/completions`, seja duplicado, fique ausente ou seja combinado incorretamente.

Antes de salvar ou usar o provedor, sempre verifique a **Request URL** gerada e confirme que ela corresponde à documentação da API do provedor.

![Visualização da Request URL abaixo da seção de protocolo de um provedor OpenAI-Compatible](/custom-api/request-url-current.png)

## Selecionar o protocolo de solicitação

Na seção **Protocol**, escolha o protocolo de solicitação que corresponde ao seu provedor.

As opções comuns incluem:

- OpenAI
- Responses
- Anthropic

Para a maioria das APIs de terceiros compatíveis com OpenAI, selecione **OpenAI**.

Se o provedor usa a Responses API da OpenAI, selecione **Responses**.

Se o provedor ou gateway espera solicitações compatíveis com Anthropic, selecione **Anthropic**.

Escolha o protocolo de acordo com o formato de API exigido pelo provedor. Se o protocolo não corresponder ao provedor, as solicitações poderão falhar mesmo que a Base URL e a API key estejam corretas.

## Escolher a predefinição do endpoint

A seleção do protocolo é muito importante porque determina se o modelo poderá ser solicitado corretamente.

Mesmo quando um provedor afirma ser compatível com a API da OpenAI, o caminho real da solicitação ainda pode ser diferente da especificação oficial da API da OpenAI.

Alguns provedores modificam a estrutura padrão do endpoint. O Breezell adaptou muitas dessas variantes específicas de provedores.

Clique no menu suspenso de predefinição do endpoint para ver as predefinições disponíveis.

![Menu suspenso Endpoint preset mostrando opções de caminho específicas do provedor](/custom-api/endpoint-preset-current.png)

Você poderá ver opções como:

- OpenAI Generic
- Zhipu GLM
- Volcengine Ark
- Volcengine Coding
- DashScope Qwen
- DeepSeek
- Images

Cada predefinição representa um caminho de solicitação diferente.

Por exemplo, **OpenAI Generic** pode usar:

```text
/v1/chat/completions
```

Outros provedores podem usar caminhos de endpoint diferentes, como:

```text
/api/paas/v4/chat/completions
```

```text
/api/v3/chat/completions
```

```text
/compatible-mode/v1/chat/completions
```

```text
/chat/completions
```

Selecione a predefinição do endpoint que corresponde ao seu provedor.

Se não tiver certeza de qual predefinição usar, consulte a documentação da API do provedor e compare a **Request URL** final exibida no Breezell.

Se o provedor usar um formato que ainda não foi adaptado pelo Breezell, entre em contato conosco para que possamos adicionar suporte a ele.

## Configurar cabeçalhos personalizados

A seção **Custom Headers** é opcional.

Use esta seção somente quando o provedor, gateway ou serviço de proxy exigir cabeçalhos HTTP adicionais.

Os cabeçalhos personalizados são anexados a todas as solicitações enviadas pelo slot de API personalizada atual.

O valor precisa ser um JSON válido.

![Campo Custom Headers com um exemplo JSON e atalhos de predefinições](/custom-api/custom-headers-current.png)

Por exemplo:

```json
{
  "X-Custom-Header": "value"
}
```

Você pode usar cabeçalhos personalizados para requisitos específicos do provedor, como:

- Cabeçalhos especiais de roteamento
- Cabeçalhos de organização ou projeto
- Cabeçalhos de autenticação do proxy
- Cabeçalhos de recursos beta
- Cabeçalhos de recursos de contexto longo

Se o provedor não exigir cabeçalhos personalizados, você poderá deixar esta seção vazia ou mantê-la como um objeto JSON vazio.

```json
{}
```

Certifique-se de que o formato JSON seja válido.

Use aspas duplas tanto para chaves quanto para valores. Não use comentários, vírgulas finais ou aspas simples.

Exemplo correto:

```json
{
  "X-Provider-Mode": "compatible"
}
```

Exemplo incorreto:

```json
{
  'X-Provider-Mode': 'compatible',
}
```

Abaixo do campo de cabeçalhos personalizados, o Breezell pode oferecer atalhos de predefinições.

Por exemplo, a predefinição **Claude 1M** pode preencher automaticamente o cabeçalho necessário para habilitar o suporte ao contexto Claude 1M.

Se a documentação do provedor exigir um cabeçalho específico, copie-o para esta seção e confirme que ele é um JSON válido antes de enviar solicitações.

## Buscar e adicionar modelos disponíveis

Depois de terminar de configurar as informações de conexão, clique em **Fetch Available Models** no lado direito do painel.

O Breezell tentará solicitar informações do provedor e carregar a lista de modelos disponíveis.

Se a solicitação for bem-sucedida, os modelos disponíveis aparecerão na lista de seleção de modelos.

![Botão Fetch Available Models com modelos disponíveis carregados na lista de seleção](/custom-api/fetch-available-models-current.png)

Depois de confirmar que as configurações do provedor estão corretas, você poderá clicar neste botão para buscar e selecionar seus próprios modelos.

Em seguida, selecione os modelos que deseja usar e clique em **Add 1 Model**.

Por exemplo, você pode selecionar um modelo como:

```text
gpt-5.5
```

Depois clique em **Add 1 Model** para adicioná-lo ao provedor de API personalizada atual.

Se a área esquerda ainda estiver vazia nesta etapa, reinicie o Breezell e tente novamente.

![Área esquerda ainda vazia depois de buscar os modelos disponíveis](/custom-api/fetch-results-empty.png)

Você também pode usar **Check All** para verificar se a conexão do gateway está saudável depois de configurar o provedor e tentar carregar os modelos.

![Botão Check All para testar a saúde do provedor e do gateway](/custom-api/check-gateway-health-button.png)

Se a verificação for bem-sucedida, o cartão de conexão poderá mostrar um status como **Healthy**. Você também pode usar **Recheck** para testar o gateway novamente depois de alterar a configuração.

![Cartão de conexão mostrando o status saudável do gateway após uma verificação bem-sucedida](/custom-api/check-gateway-health-result.png)

## Adicionar um modelo manualmente

Você também pode adicionar um modelo manualmente.

No campo de entrada do modelo, insira o nome do modelo fornecido pelo provedor de API.

Depois clique em **Add**.

Isso é útil quando o provedor não expõe um endpoint de lista de modelos ou quando o modelo que você deseja usar não é retornado por **Fetch Available Models**.

Certifique-se de que o nome do modelo seja exatamente igual ao ID de modelo exigido pelo provedor.

![Campo de entrada manual de modelo com o botão Add](/custom-api/manual-model-add-current.png)

## Habilitar, desabilitar ou excluir um modelo

Depois de adicionar modelos, eles aparecerão na lista **Models**.

Cada item de modelo pode ser gerenciado individualmente.

Você pode usar o interruptor no lado direito do item para habilitar ou desabilitar o modelo.

Quando um modelo está habilitado, o Breezell pode usá-lo para solicitações.

Quando um modelo está desabilitado, o Breezell mantém a configuração, mas não usa o modelo.

Mova o mouse sobre um item de modelo para mostrar mais ações.

Você pode excluir um modelo clicando no botão de exclusão.

Use isso quando não quiser mais que o modelo apareça no provedor atual.

![Lista de modelos com controles para habilitar, desabilitar, configurar e excluir](/custom-api/model-management-current.png)

## Abrir as configurações avançadas do modelo

Se quiser configurar um comportamento mais detalhado para um modelo, clique no botão de configurações do item do modelo.

Isso abrirá o painel **Advanced Settings**.

As configurações avançadas são opcionais. A maioria dos usuários não precisa alterá-las, a menos que entenda os limites do modelo e o formato de solicitação exigido pelo provedor.

## Advanced Settings

No painel de configurações avançadas, você pode personalizar o comportamento no nível do modelo.

![Painel Advanced Settings de um modelo de API personalizada](/custom-api/advanced-settings-original.png)

### Habilitar configurações personalizadas

O interruptor **Enable custom settings** controla se este modelo usa sua própria configuração avançada.

Se o interruptor estiver desabilitado, o Breezell usará as configurações padrão reconhecidas para o modelo.

Se o interruptor estiver habilitado, os valores no painel de configurações avançadas substituirão o comportamento padrão deste modelo.

### Context Window

**Context Window** define o comprimento máximo de contexto aceito pelo modelo.

Normalmente, isso significa o número máximo de tokens que o modelo pode processar em uma solicitação, incluindo histórico da conversa, mensagens do sistema, mensagens do usuário, resultados de ferramentas e outro contexto.

Por exemplo, um valor como:

```text
400000
```

significa que o modelo está configurado com uma janela de contexto de 400k.

O campo oferece conversão automática do sufixo `k`.

Por exemplo:

```text
128k
```

será convertido em:

```text
128000
```

Use o valor fornecido pelo provedor do modelo. Definir um valor alto demais pode causar falhas se o modelo não oferecer suporte real a ele.

### Output Token Space

**Output Token Space** define o espaço máximo de tokens de saída reservado para as respostas do modelo.

Por exemplo, um valor como:

```text
128000
```

significa que o modelo pode reservar até 128k tokens para a saída.

Isso também oferece conversão automática do sufixo `k`.

Por exemplo:

```text
8k
```

será convertido em:

```text
8000
```

Use um valor que corresponda ao limite real de saída do provedor.

### System Message

**System Message** controla como o Breezell envia instruções de nível do sistema ao modelo.

Alguns modelos esperam que a mensagem do sistema use a função padrão `system`.

Outros modelos podem esperar um formato de função diferente, como a função `developer`.

Se o provedor exigir um formato específico de mensagem do sistema, selecione aqui a opção correspondente.

Se não tiver certeza, mantenha a configuração padrão.

### Tool Format

**Tool Format** controla como as ferramentas são descritas e enviadas ao modelo.

Para modelos compatíveis com OpenAI, use **OpenAI Style**.

Se o provedor exigir um formato de chamada de ferramentas diferente, selecione o formato que corresponde à documentação do provedor.

Configurações incorretas de formato de ferramenta podem fazer as chamadas de ferramentas falharem.

### Supports Thinking

**Supports Thinking** indica se o modelo oferece suporte ao modo de raciocínio ou pensamento.

Habilite-o somente quando o provedor do modelo oferecer suporte a esse recurso.

### Can Disable Thinking

**Can Disable Thinking** indica se o Breezell pode desabilitar o modo de pensamento para este modelo.

Isso é útil para modelos que oferecem modos com e sem raciocínio.

### Can Stream Reasoning

**Can Stream Reasoning** indica se o modelo pode transmitir conteúdo de raciocínio durante a geração.

Habilite esta opção somente se o provedor oferecer suporte à saída de raciocínio em streaming.

Se o provedor não oferecer suporte, habilitar esta opção pode causar erros de solicitação ou respostas incompletas.

## Salvar as configurações avançadas

Depois de alterar as configurações avançadas, clique em **Save**.

Se não quiser aplicar as alterações, clique em **Cancel** ou feche o painel.

Altere as configurações avançadas somente quando souber os valores corretos para o modelo. Tamanho de contexto, limite de tokens de saída, formato de mensagem, formato de ferramenta ou configurações de pensamento incorretos podem fazer o modelo se comportar incorretamente ou não responder.

## Selecionar seu modelo personalizado

Depois de adicionar e habilitar seu modelo personalizado, volte à interface de chat.

Clique no seletor de modelos próximo à caixa de entrada.

Na lista de modelos, você verá os modelos integrados do Breezell, os modelos Codex e seus modelos OpenAI-Compatible personalizados.

Seu provedor personalizado aparecerá em seu próprio grupo de provedores. Por exemplo, se o apelido do provedor for **TEST**, os modelos adicionados nesse provedor aparecerão no grupo **TEST**.

Selecione o modelo que deseja usar.

Se você adicionou vários modelos, escolha o que corresponde à tarefa atual.

![Seletor de modelos mostrando modelos integrados e o grupo de provedor personalizado TEST](/custom-api/select-custom-model-original.png)

## Ajustar as opções de contexto e raciocínio

Depois de selecionar um modelo, você poderá abrir o painel de opções do modelo.

Nesse painel, você poderá ver opções como:

- Context size
- Reasoning mode
- Reasoning strength
- Fast mode

A opção **Context** controla quanto do histórico da conversa ou do contexto de entrada o modelo pode usar.

A opção **Reasoning** controla se o modo de raciocínio está habilitado.

Se o raciocínio estiver habilitado, você poderá escolher sua intensidade, como:

- Low
- Medium
- High
- Extra High

Uma intensidade de raciocínio maior pode ser útil para tarefas complexas de programação, planejamento, depuração ou análise.

Uma intensidade menor pode ser melhor para perguntas simples ou respostas mais rápidas.

Se o modelo oferecer suporte ao modo **Fast**, você poderá habilitá-lo para priorizar uma resposta mais rápida.

As opções disponíveis podem variar de acordo com o modelo e o provedor selecionados.

![Painel de opções do modelo com configurações de contexto e raciocínio](/custom-api/model-options-original.png)

## Iniciar uma conversa

Depois de selecionar o modelo e ajustar as opções, digite sua mensagem na caixa de entrada.

Depois envie a mensagem para iniciar uma conversa.

Por exemplo, você pode inserir:

```text
Hello
```

Se a API personalizada estiver configurada corretamente, o Breezell enviará a solicitação pelo seu provedor personalizado e retornará a resposta do modelo no chat.

Agora você concluiu a configuração da API personalizada.

![Visão do chat após enviar uma mensagem pelo modelo personalizado](/custom-api/start-conversation-original.png)
