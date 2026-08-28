# M16 — Linguagem visual programática (briefing de implementação)

> Escrito no momento em que M16 virou o próximo milestone, seguindo o método estabelecido na
> auditoria de 2026-08-07. Complementa a entrada terse de `docs/spec/09-roadmap.md` e a
> fundamentação de direção de arte registrada em `DECISIONS.md`, seção "Auditoria 2026-08-14".
> **Leia este arquivo inteiro antes de escrever qualquer código.** As decisões abaixo estão
> tomadas — não as reabra sem um motivo técnico novo.

## 1. Por que este milestone existe

A camada gráfica do jogo, medida na auditoria de 2026-08-14, são **9 retângulos, 2 círculos e 3
linhas** em `MapCanvas.tsx`. Zero sprites, zero texturas, zero arquivos de imagem. Toda unidade
do tabuleiro é a mesma forma com cores diferentes: um Clérigo e um Couraçado são indistinguíveis
sem clicar.

Isso não é só feiura. §1.1 lista **legibilidade tática** entre os pilares ("o jogador DEVE
conseguir prever o resultado antes de confirmar"), e §11 exige que a lista de iniciativa e os
pools de recurso estejam sempre visíveis. Um tabuleiro onde as peças não se distinguem entre si
falha o pilar antes de falhar o gosto.

M16 vem **depois** de M15 por decisão da auditoria: apresentação em cima de um loop de jogo que
não fecha é maquiagem. O loop fechou; agora a apresentação vira sistema.

## 2. A direção de arte, e por que ela não está em aberto

**Visual programático, definitivo, zero assets raster.** A fundamentação completa está em
`DECISIONS.md` (auditoria de 2026-08-14) e não se repete aqui. O resumo operacional:

- o agente produz **código que desenha** — determinístico, diffável, revisável, sem licença
  duvidosa e sem exigência de disclosure;
- arte raster generativa está **fora**, e o motivo decisivo é técnico antes de reputacional:
  jogo precisa de *sistema* (silhueta repetível, proporção estável, saída animável através de
  centenas de estados), e o estágio que faz esse pipeline funcionar — o paintover humano — não
  existe neste projeto;
- Subset Games sobre Into the Breach, citado na auditoria: "sacrifique ideias legais em nome da
  clareza, toda vez". **Este é um jogo cujo produto é a leitura, não o espetáculo.**

## 3. Regra de processo, inegociável

**O agente gera, tira screenshot e corrige o que é objetivamente ilegível. O usuário julga o que
é gosto. O agente NUNCA autocertifica estética.**

Isso vem de fonte primária citada na auditoria: o LLM não tem *representational grounding* — não
julga o próprio resultado visual. O que o agente pode afirmar sozinho é o que é mensurável
(contraste sob simulação de dicromacia, tamanho de fonte, o glifo caber no tile, o estado ter
marca própria). "Ficou bom" não é uma dessas coisas.

Consequência prática: **o critério de aceite 2 ("legível sem hover e sem legenda") só fecha com a
palavra do usuário**, e cada fatia visual termina com imagens para ele julgar.

## 4. Decisões já tomadas

**D1 — O glifo de classe mora no CLIENTE, nunca em `packages/data`.** Glifo é apresentação;
`packages/data` é o dataset de REGRA, validado por Zod e consumido por `packages/core`,
`apps/server` e `sim-cli` — nenhum dos três desenha. Um path vetorial ali poria arte dentro do
pacote crítico de determinismo e faria o servidor carregar bytes que ele nunca usa. O risco
óbvio dessa escolha (classe nova sem glifo) é coberto por **teste de completude no estilo de M9**:
toda classe do catálogo real tem glifo, mais um fallback declarado para o que escapar.

**D2 — A costura de representação de unidade produz uma DESCRIÇÃO, não desenha.** Um
`UnitRenderer` recebe estado + geometria + tokens e devolve uma lista de primitivas; quem traduz
primitiva em `Graphics` do Pixi é o `MapCanvas`. É o que torna a costura testável sem browser e
sem Pixi, e é o que permite uma camada de sprite entrar por cima no futuro sem reescrever o
renderer — o hedge arquitetural que a auditoria exigiu.

**D3 — A segunda implementação do critério 4 é um renderer ALTERNATIVO de verdade**, não um
espião de chamadas: um renderer que desenha só com retângulos e texto, sem círculo nenhum. Um
dublê que grava chamadas provaria que a função foi chamada; um renderer alternativo prova que a
costura **não está amarrada à linguagem de formas de hoje**, que é o que "trocável" significa.
Os dois passam pelo MESMO teste de contrato.

**D4 — Nenhuma regra muda em M16.** `RULES_VERSION` não sobe, `packages/core` e `packages/data`
não recebem uma linha. Se uma fatia parecer exigir mudança de regra, ela está fora de escopo.

**D5 — O escopo é o tabuleiro e o estado de batalha**, não a re-estilização dos 13 painéis de
HTML. Os painéis herdam os tokens compartilhados; reescrever `style.css` inteiro é outro
milestone. §11 lista requisitos por tela e M16 responde pelos do **Mapa** (overlay de movimento e
ameaça, iniciativa sempre visível, AP/PP legíveis no próprio tile sem hover).

## 5. Ordem sugerida das sub-sessões

1. **A costura e os tokens** — extrair a representação de unidade para trás da interface **sem
   mudar um pixel**, com o renderer alternativo e o teste de contrato (critério 4); travar o
   critério 1 com um teste que varre o repositório atrás de arquivo de imagem; generalizar
   `overlayTheme.ts` em tokens sem mexer nas cores (o teste de dicromacia de M13 4/N continua
   sendo a trava).
2. **A linguagem visual** — glifo por classe (as 10 do catálogo), terreno, e legibilidade de
   estado (AP/PP, efeitos ativos, quem já agiu, ameaça, objetivo). Termina com screenshots para
   o usuário julgar.
3. **Animação com peso** e o fechamento: reverificação da garantia de daltonismo (**reverificada,
   não assumida** — é texto do critério de aceite) e validação final no browser com o usuário.

## 6. Critério de aceite

1. **Nenhum arquivo de imagem entra no repositório.** Hoje são zero, medido; o teste é o que
   transforma "está zero" em "continua zero".
2. **O grid, as unidades e o estado de batalha são legíveis sem hover e sem legenda**, validado
   pelo usuário no browser.
3. **A garantia de daltonismo de M13 4/N continua valendo** (marca própria por overlay, não só
   cor) e é **reverificada, não assumida**.
4. **A costura de representação de unidade existe e tem uma segunda implementação de teste
   provando que é trocável.**

Como em todo milestone anterior: **cole a saída real dos testes** provando cada um — e, para o
critério 2, as imagens.

## 7. O que NÃO fazer

Nenhum arquivo de imagem, em nenhuma forma (inclusive base64 embutido em código, que é o mesmo
asset com outro nome). Nenhuma dependência nova de runtime para desenhar — Pixi já está lá.
Nenhuma mudança de regra (D4). Nenhuma re-estilização dos painéis de HTML (D5). E nenhuma
afirmação de que o resultado ficou bonito (§3).
