# M35 — A HUD: o redesenho (briefing de implementação)

> Escrito em 2026-09-14, na tarde em que o M32 foi julgado na tela pelo usuário. Complementa a
> entrada de `docs/spec/09-roadmap.md`; §11 de `docs/spec/08-progressao-e-ui.md` (requisitos
> duros de UI) e §1.1 (legibilidade tática) continuam normativos.
> **Leia este arquivo inteiro antes de escrever qualquer código.** As decisões abaixo foram
> tomadas com o usuário em 2026-09-14 — não as reabra sem um motivo técnico novo.

## 1. Por que este milestone existe, e por que ANTES do playtest

O roadmap punha o M35 depois do playtest (M33) e da telemetria (M34): "desenhar sem saber onde
o jogador travou é desenhar por gosto". Em 2026-09-14 o usuário julgou o M32 na tela, com sessão
de verdade contra o Railway, e o veredito do critério 5 ("uma próxima ação, identificada sem que
ninguém aponte") foi **não**: *"está tudo muito misturado"*. O hub do M32 é o hub do M13 com
menos coisas — quatro painéis lado a lado, cada um com o próprio botão de atualizar, o mesmo
peso visual.

**O veredito do dono é o primeiro dado do playtest, e ele já diz onde trava.** Rodar o M33 com
esta HUD mediria a HUD e não o jogo — o mesmo argumento que criou o M32. Por isso a ordem de
execução passa a ser **M32 → M35 → M33 → M34**, sem renumerar nada (a numeração já foi trocada uma
vez em 2026-09-14 e as notas antigas citam os números da época).

**O que o M35 NÃO é:** não é uma passagem de "ficou bonito". É a forma de referência do gênero
(Epic Seven, Summoners War, Chaos Zero Nightmare) aplicada a este jogo: **um menu, uma tela por
vez**, e a missão escolhida em três passos. `packages/core` intocado; o cliente só renderiza
(regra 3).

## 2. As decisões, já tomadas

**D41 — Um menu, uma tela por vez.** O hub de painéis lado a lado morre. A tela com sessão tem
um **menu** (barra fixa) com as abas, e **só a aba escolhida** está na tela. **Cinco abas, e não
seis — decisão do usuário ao aprovar o plano da 1/N:** Personagens é uma aba própria que contém o
elenco E o equipamento, "só isso mesmo"; Equipamento não é aba.

| Aba | O que mostra | De onde vem hoje |
| --- | --- | --- |
| Campanha | capítulos e missões; é a aba inicial de quem entra | `CampaignPanel` |
| Masmorras | as masmorras, energia, varrer/entrar | `DungeonPanel` (parte) |
| Arena | encontrar oponente, atacar, defesa | `PvpPanel` + `ArenaDefensePanel` |
| Personagens | o elenco (nível, despertar, vínculo, poder) E o equipamento (inventário, aprimorar, equipar) | `DungeonPanel` ("Seu time" + inventário) — feito na 1/N como `PersonagensPanel` |
| Invocação | banners, pity, prêmios, energia | `SummonPanel` |

A aba é **estado da store** (`telaDoJogo` passa a devolver `hub` com uma sub-tela, ou vira um
tipo próprio — decisão de implementação, mas a regra continua sendo função pura sobre o estado,
como no D38). A batalha continua sendo a terceira tela, SEM menu: durante uma missão a única
saída é abandonar ou terminar.

Os botões "Atualizar" de cada painel **somem**: o hub carrega no sign-in (M32 2/N,
`carregarHub`) e cada ação que muda estado relê o que mudou. Recarregar é problema do cliente,
não gesto do jogador.

**D42 — Escolher uma missão é um fluxo em três passos, e o terceiro tem presets.**

1. **Escolher** — a lista de capítulos e missões, como hoje; a próxima missão por limpar é a
   `acao-principal` (D40).
2. **Prévia** — **o tabuleiro de verdade em miniatura** (escolha do agente, autorizada: "o último
   você escolhe"): o `MapCanvas` já desenha qualquer `BattleSetup`, e o cliente tem o catálogo
   inteiro (`encounters`, `maps`, `terrains`, `enemies`) em `data/catalog.ts`. A prévia mostra o
   mapa, as posições dos inimigos, o terreno, o objetivo (`descreverObjetivo`), as vagas e os
   nomes dos inimigos. É §1.1 antes de entrar: o jogador vê contra o que vai antes de escolher
   quem leva. A prévia é montada **localmente** a partir do catálogo — NÃO pede ticket ao
   servidor, porque pedir ticket é entrar (`enterChapter`), e a prévia é olhar.
3. **Quem vai** — as vagas da missão preenchidas a partir de um **preset de party**, com
   **8 slots** de preset (decisão do usuário: "8 são o suficiente a princípio"). O jogador
   escolhe um preset, e o resultado ainda pode ser trocado personagem a personagem antes de
   entrar. Um preset é estado de conta: vive no **servidor** (tabela nova, rota `GET/PUT
   /me/party-presets`, o mesmo padrão de `/me/defense` do M15), porque sobrevive a máquina e a
   reinstalação — e a defesa de arena já provou o desenho.

   Regras do preenchimento, para não reabrir o achado do M32 2/N ("Entrar na missão" cinza sem
   dizer por quê): **com nenhum preset salvo, as vagas vêm pré-marcadas** com o protagonista
   (`hero-jogador`) primeiro e o resto do núcleo de história (D14) na ordem em que o jogador os
   ganhou. A ordem do roster hoje é alfabética por id (`ORDER BY hero_id`) e põe Vesper
   (arcanista) antes de Aren — e o M27 2/N mediu a missão 1 em 0/20 com arcanista+arqueiro. O
   protagonista primeiro é a regra que a spec não tinha e o usuário deu implicitamente ao dizer
   "o prota começando sua jornada".

**D43 — O nome do inimigo comum é `<função> [de <facção>]`, e a nação é uma só.** Os três
capítulos da demo acontecem **dentro de uma mesma nação**: o protagonista começa a jornada do
herói, descobre problemas que afligem a nação e ajuda a lidar com eles, construindo o nome. Os
inimigos são internos — bandidos da estrada, saqueadores da serra, a guarda de um tirano local —
e por isso o nome deles NÃO carrega o nome da nação (seria o nome do próprio país do jogador);
carrega a **facção** ou o **lugar**: "Patrulheiro de Lança", "Guarda da Forja", "Saqueador do
Veio", "Guarda Pretoriano". **Isso já está autorado**: os 41 arquivos de `packages/data/enemies/`
têm `name` neste formato desde o M27. O que falta é **chegar à tela**: o ticket já transporta o
id do inimigo por unidade (`characterIdByUnitId` cobre os dois lados — é o mapa que o
`artIdDeUnidade` usa), e `nomeDeUnidade` (M32 2/N) cai no `unitId` por não olhar
`catalog.enemies`. Entra o tipo `inimigo` em `TIPOS_DE_CONTEUDO`, com as 41×2 entradas de
catálogo que a asserção de runtime do M29 vai exigir. O nome da nação em si é história (M30) e
é do usuário; personagens marcantes (o Tirano, o Comandante da Fortaleza) ganham nome próprio
quando ele os desenhar.

**D44 — O que a batalha mostra sem hover (§11, requisito duro):** iniciativa, AP/PP de cada
unidade, zona de ameaça e o preview do duelo antes de confirmar. O M13 já mostra tudo; o M35
decide **onde** — e a regra de ordem é a de §1.1: o que o jogador precisa para prever o
resultado fica mais perto do tabuleiro do que o que ele precisa para administrar. Selecionar um
INIMIGO **não** mostra Esperar/Descansar/Editar táticas/Inventário/Talentos (achado do M32 2/N):
mostra a ficha dele (HP, AP/PP, alcance) e nada que seja ação.

## 3. O que a mudança quebra, medido no código de hoje

- **`App.tsx` e `telaDoJogo`** — o hub é `<CampaignPanel/><DungeonPanel/><SummonPanel/><PvpPanel/>`
  em grid. Vira menu + uma aba. `telaDoJogo.test.ts` e `acaoPrincipal.test.ts` mudam junto: a
  lista fechada de quem usa `acao-principal` ganha o menu (a aba ativa não é ação; o botão de
  entrar na missão e o de invocar são).
- **`DungeonPanel` mistura três coisas** — "Seu time" (despertar/vínculo), as masmorras e a saída
  da batalha de masmorra. "Seu time" vai para Personagens; o painel fica com as masmorras.
- **`heroesPorUnidade` / `characterIdByUnitId`** — o mapa do ticket já tem o inimigo; falta o
  cliente ler `catalog.enemies[id]?.name`. `rotulosNaTela.test.ts` tem o caso
  "unidade sem herói conhecido: o id" — ele **muda de sentido** (passa a ser "inimigo: o nome
  autorado, traduzido"), não se apaga.
- **`conteudoTraduzido.test.ts` + `nomesAutorados.ts`** — `Record<TipoDeConteudo, …>` é exaustivo:
  acrescentar `inimigo` não compila sem dizer de onde vêm os nomes (`catalogo.enemies`). É o
  desenho do M29 funcionando a favor.
- **Presets** — não existe nada: tabela, migration, repository (memória + Postgres, com o teste
  de paridade do M19), rota, store, tela. É a única parte com servidor, e é por isso que ela é
  uma sub-sessão própria.
- **A prévia** — `MapCanvas` está acoplado à store de batalha (`battleState`, seleção, fx). A
  prévia precisa de um render **somente-leitura** de um `BattleSetup`: ou um componente irmão
  que reaproveita `paintPrimitives`/`activeUnitRenderer` sem os handlers, ou o próprio
  `MapCanvas` com um modo `somenteLeitura`. Medir antes de escolher; a segunda opção é menor se
  os handlers já estiverem isolados.
- **Dark Reader** — o julgamento na tela é feito **sem** ele (achado do M32 2/N: ele recolore o
  azul da `acao-principal`).

## 4. Ordem sugerida das sub-sessões

1. **1/N — O menu e as cinco abas, com o que já existe** (FEITA em 2026-09-14, ver `DECISIONS.md`). `telaDoJogo` com a aba; menu;
   `DungeonPanel` dividido; "Atualizar" some de todo painel; nome dos inimigos na tela (tipo
   `inimigo`, 82 entradas); inimigo selecionado sem botões de ação. Testes: `telaDoJogo`,
   `acaoPrincipal`, `rotulosNaTela`, `conteudoTraduzido`. **Visto no browser contra o Railway**
   ao fim, como o M32 2/N.
2. **2/N — A missão em três passos, sem preset.** Escolher → prévia (tabuleiro somente-leitura,
   montado do catálogo) → quem vai, com o preenchimento padrão de D42 (protagonista primeiro).
   Teste da regra de preenchimento na store; teste de que a prévia NÃO pede ticket.
3. **3/N — Presets de party, ponta a ponta.** Migration + repository (paridade) + rota + store +
   tela; 8 slots; escolher um preset preenche as vagas e ainda deixa trocar.
4. **4/N — A batalha (D44) e o fechamento.** A ordem do que fica na tela; ficha do inimigo;
   daltonismo reverificado (M13 4/N); `semTextoCru` sem exceções novas; julgamento na tela.

## 5. Critério de aceite (proposto — confirmar com o usuário ao abrir o milestone)

- Com sessão, a tela é **um menu e uma aba**; nenhuma aba mostra conteúdo de outra; nenhum
  painel tem botão de atualizar.
- Escolher uma missão passa por **prévia com o tabuleiro** e por **quem vai**; entrar com as
  vagas vazias é impossível porque elas nunca começam vazias; um preset escolhido preenche e
  ainda deixa trocar; **8 presets**, salvos no servidor, sobrevivem a recarregar e a outra
  máquina.
- Todo inimigo da demo aparece pelo **nome autorado, nas duas línguas** — `conteudoTraduzido`
  cobre o tipo `inimigo` como cobre os outros; `unit-alvo-1` não existe mais na tela.
- Na batalha: iniciativa, AP/PP, ameaça e preview visíveis sem hover; inimigo selecionado sem
  botões de ação; daltonismo reverificado.
- `packages/core` intocado; suíte do cliente verde; `semTextoCru` sem exceções novas.
- **Julgado pelo usuário na tela, sem Dark Reader**: "está misturado?" tem de virar "não".

## 6. O que NÃO fazer

- **Não** redesenhar o duelo (a cena de M26 2/N) — D44 é sobre o que fica em volta do
  tabuleiro, não sobre a cena.
- **Não** inventar o nome da nação, nem nomes próprios para inimigos marcantes: é história (M30)
  e é do usuário. Os 41 nomes existentes ficam como estão; o que muda é chegarem à tela.
- **Não** antecipar M36–M38 (tiers, armas assinatura, Soul) "já que a tela está aberta". A aba
  Personagens mostra o que existe hoje.
- **Não** pôr regra no cliente (regra 3): o preenchimento padrão das vagas é escolha de
  APRESENTAÇÃO (quem vem marcado); quem valida a party continua sendo o servidor.
- **Não** usar `localStorage` para presets: é estado de conta, e o M18 7/N já tirou o
  progresso de lá pelo mesmo motivo.

### Ainda em aberto

- O nome da nação (M30). Enquanto não existir, nada na tela precisa dele (D43).
- Se a aba Personagens absorve o editor de talentos e de táticas INTEIROS ou só abre os de hoje
  — decidir na 1/N medindo o tamanho deles; não é decisão de design, é de corte.
- Telemetria (M34) continua depois do playtest: nada aqui instala medição.
