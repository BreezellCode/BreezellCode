# Breezell IME

Um método de entrada que conhece seu código e sua conversa: pinyin, zhuyin, pinyin duplo, Wubi 86, japonês e coreano, no editor e no chat do Breezell e, no Windows, em todos os programas.

## O que ele faz

- **Digita frases inteiras.** Digite uma oração de uma vez; um modelo de linguagem a lê no contexto e acerta os caracteres em primeiro lugar com muito mais frequência do que um dicionário sozinho.
- **Distingue código de comentários.** No código ele digita em inglês. Em comentários, strings ou depois de `///` na linha ele digita no seu idioma, sem você precisar trocar.
- **Usa o que está ao redor do cursor.** O código que você está editando e a conversa no chat ajudam a escolher as palavras, e nomes como `useState` viram candidatos do jeito que estão escritos lá.
- **Perdoa deslizes.** No pinyin, teclas pressionadas na ordem errada, uma tecla vizinha ou uma tecla a mais ou a menos ainda encontram a palavra (`jain` encontra 简).
- **Mistura inglês.** Digite `hello` no pinyin e ele aparece entre os candidatos.
- **Oferece as próximas palavras** depois que você confirma texto em chinês.
- **Aprende com você**, sem deixar que uma escolha isolada se espalhe para todo o resto.

## Primeiros passos

1. Instale em **Breezell Console › Plugins**.
2. Abra o **Breezell IME** em **Plugins** na barra lateral. A página dele abre sozinha na primeira vez.
3. Em **Idiomas**, baixe os que você quiser:

   | Idioma | Métodos de entrada | Download |
   |---|---|---|
   | Chinês | Pinyin, zhuyin, pinyin duplo (Flypy, Microsoft, Ziranma, Sogou, ABC, Ziguang, Pinyin Jiajia), Wubi 86 | 374 MB |
   | Japonês | Romaji para kana e kanji | 189 MB |
   | Coreano | Hangul de 2 conjuntos com sugestões de palavras | 128 MB |

4. Escolha seu método de entrada na página e pressione **Ctrl+Alt+Space** no editor para começar a digitar.

Os idiomas vêm da release do GitHub deste plugin, e um download continua de onde parou se a conexão cair. Cada arquivo é verificado pelo SHA-256 antes de ser usado. Cada idioma em que você digita mantém seu modelo na memória: cerca de 400 MB para o chinês.

## Teclas

| Tecla | O que faz |
|---|---|
| **Ctrl+Alt+Space** (macOS: **Ctrl+Option+Shift+Space**) | Ativar ou desativar |
| **Ctrl+Alt+K**, ou a barra de status | Escolher o método de entrada |
| **Space** ou um dígito (zhuyin: **Shift+dígito**) | Escolher um candidato |
| Setas, **Page Up**, **Page Down** | Navegar pelos candidatos |
| **Enter** | Confirmar o que você digitou, como digitou |
| **Esc** | Descartar |
| **Backspace** | Desfazer uma tecla |
| **Tab** | Pegar a primeira palavra oferecida em seguida |
| **Shift**, sozinha (com o método de entrada do Windows) | Alternar entre seu idioma e o inglês |

## Todos os programas no Windows

Na página do plugin, **Instalar no Windows…** o adiciona como método de entrada do Windows, com o mesmo motor e as mesmas palavras aprendidas do Breezell. O Windows pede permissão de administrador uma vez, para registrar o serviço de texto. Depois ele se torna seu método de entrada padrão; **Win+Space** troca para outro, e **Remover do Windows…** o retira.

Ele instala um serviço de texto em `Program Files\BreezellIME` e o host do motor em `%LOCALAPPDATA%\BreezellIME`, tudo a partir do pacote deste plugin; nenhum código é baixado. Nos programas já abertos quando você instala, pressione **Win+Space** para trocar para ele.

No Linux e no macOS ele funciona no editor do Breezell; um método de entrada do sistema ainda não está disponível.

## Com versões antigas do Breezell

O painel de candidatos no editor e a digitação na caixa de chat precisam de um Breezell recente. Em versões antigas, os candidatos aparecem como texto depois do cursor no editor, e a caixa de chat usa o método de entrada do seu sistema.

## Seus dados

- **Nada do que você digita sai do seu computador.** A composição, o contexto ao redor do cursor e o que ele aprende ficam todos nele. O plugin só se conecta para baixar os idiomas que você escolher.
- **Permissões:** ele não pede nenhuma das permissões de plugin do Breezell. Como método de entrada, ele recebe as teclas que você digita na caixa de chat do Breezell e a conversa recente, para escolher as palavras; o Breezell as entrega só a este plugin.
- O que ele aprendeu fica em `%APPDATA%\BreezellIME` (Windows), `~/Library/Application Support/BreezellIME` (macOS) ou `~/.config/breezell-ime` (Linux). **Limpar palavras aprendidas** na página faz com que ele esqueça.
- Como todo plugin do Breezell, ele precisa que você esteja conectado à sua conta. O método de entrada do Windows, depois de instalado, continua funcionando quando você sai da conta, então você nunca fica sem poder digitar.

## Precisão

A proporção de orações em que o primeiro candidato está exatamente certo, com 1,000 orações por conjunto que ficaram fora do treinamento e com o aprendizado desativado. Os parâmetros foram ajustados com outras frases; estes conjuntos foram executados no final.

| Método de entrada | Texto | Breezell IME | Outros |
|---|---|---|---|
| Pinyin | Wikipédia | 66.4 | Rime 33.1, CyIME 38.2 |
| Pinyin | Legendas | 85.1 | Rime 62.6, CyIME 65.1 |
| Pinyin | Documentos técnicos | 78.3 | Rime 49.7, CyIME 61.3 |
| Zhuyin | Legendas de Taiwan | 82.4 | Rime 62.0, CyIME 54.6 |
| Zhuyin | Documentos do Python | 81.2 | Rime 61.4, CyIME 37.8 |
| Wubi 86, ordem inteligente: sem escolher candidatos | Wikipédia | 81.4 | Rime 70.2 |
| Wubi 86, ordem inteligente: sem escolher candidatos | Legendas | 87.6 | Rime 85.0 |
| Wubi 86, ordem inteligente: sem escolher candidatos | Documentos técnicos | 91.9 | Rime 88.8 |
| Japonês | Corpus ITA | 66.5 | Mozc 58.9, CyIME 24.8 |
| Japonês | Wikipédia | 79.0 | Mozc 59.5, CyIME 33.1 |
| Japonês | Legendas | 83.8 | Mozc 74.3, CyIME 35.1 |

Os documentos do Vue e do Python por trás dos conjuntos técnicos nunca foram usados no treinamento. Rime é o rime-ice para pinyin e seu esquema oficial bopomofo para zhuyin. Os números do CyIME são do librime 1.16.1 padrão com seus esquemas e pesos, mais o modelo de gramática Wanxiang; o librime modificado dele e seu reordenador não foram executados, e podem ter resultado melhor. As leituras da Wikipédia e das legendas em japonês foram geradas com o dicionário do Mozc, então o ITA, com leituras feitas por pessoas, é o mais justo dos três.

## Compilar a partir do código-fonte

O código-fonte está em [`plugins/examples/ime`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/ime): `src` (o plugin), `engine` (o motor do método de entrada), `system` (o serviço de texto do Windows e o host) e `tools` (o que constrói os modelos).

```bash
npm install
npm test                 # testes de lógica
npm run package:open     # o .vsix, com seu código-fonte e source maps
```

As DLLs do serviço de texto são compiladas no Windows com `system/windows/build.bat`.

## Licença

GPL-3.0-or-later. Os dicionários e modelos vêm dos projetos listados em [THIRD_PARTY_NOTICES.md](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/examples/ime/THIRD_PARTY_NOTICES.md).
