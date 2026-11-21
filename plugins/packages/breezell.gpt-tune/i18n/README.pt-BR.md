# Ajuste do GPT

Os modelos GPT escrevem de um jeito fácil de reconhecer: frases feitas («vale ressaltar», «em suma»), contrastes que ninguém levantou («Não se trata de X. Trata-se de Y»), listas e tabelas para coisas que não são nem uma coisa nem outra, rótulos em negrito antes de cada parágrafo e respostas muito mais longas ou mais curtas do que a pergunta pede. Quando você pede para revisar seu texto, ele volta com a voz do modelo, não com a sua.

O Ajuste do GPT acrescenta um conjunto curto de regras de escrita a cada pedido que o Breezell envia, para que as respostas pareçam escritas por um colega cuidadoso.

## Como ativar

Abra o Box e, na barra lateral, em «Plugins», clique em «Ajuste do GPT». Na página dele, «Menos tom de IA» tem três opções:

- «Modelos GPT» (padrão): só para modelos cujo nome contém «gpt», de qualquer provedor.
- «Todos os modelos»: para qualquer modelo.
- «Desligado»: nada é acrescentado.

A mudança vale a partir da próxima mensagem que você enviar.

## O que muda

- Palavras simples no lugar de frases feitas e intensificadores vazios, em inglês e em chinês.
- Parágrafos por padrão. Listas só para passos ou opções, tabelas só para valores comparados nas mesmas colunas, títulos só em documentos longos.
- Sem resumo final do que acabou de ser dito e sem a oferta genérica de «Se quiser, posso…».
- Respostas do tamanho da pergunta.
- Quando a IA revisa, encurta ou traduz o seu texto, ela mantém suas palavras, seu registro e o tamanho das suas frases, e corrige só o que está errado ou confuso.

## O que não muda

- Código, comandos, caminhos de arquivos e chamadas de ferramentas não são tocados.
- O formato que você pede vale mais: peça uma tabela, uma lista numerada ou uma resposta longa e você terá.
- Os relatórios do Breezell depois de um trabalho de várias etapas mantêm a forma de sempre.

## Observações

- As regras têm cerca de 2.500 caracteres e entram em cada pedido que atende à condição. Ficam junto das outras regras e não mudam entre pedidos, então o cache de prompts do provedor continua funcionando.
- Versões antigas do Breezell não leem a regra deste plugin e não mudam nada; atualize o Breezell para usá-lo.
- Não pede nenhuma permissão. O código dele só desenha a página de configurações; quem acrescenta as regras aos pedidos é o próprio Breezell.
