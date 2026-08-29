<!-- Milestones, critérios de aceite, decisões em aberto -->
## 13. Roadmap por milestones

### M0 — Fundação
Monorepo, TS strict, Vitest, Zod, CI.
**Aceite:** `pnpm test` e `pnpm validate:data` verdes; CI falha se achar `Math.random` em `core`.

### M1 — Núcleo determinístico
Ponto fixo, PRNG, agregação de stats (§4.1), schemas de herói/classe/skill/item.
**Aceite:** stat sheet de um herói fixo bate com snapshot; 1000 execuções do PRNG com a mesma seed dão sequência idêntica.

### M2 — Duelo headless (o mais importante)
Interpretador de tactics, trocas, AP/PP, reações, assistências, ordem de duelo, fórmula de dano, efeitos.
**Aceite:** `sim-cli duel A.json B.json --seed 42` imprime troca a troca com a linha do script que disparou; mesma seed → hash idêntico; teste cobrindo **cada** variante de `Condition` e cada regra de recurso (limite de 2 AP, contra-ataque sem PP, teto de 2 assistências).

### M3 — Camada de grid
Mapa, terreno, Dijkstra, ZoC, **lista de iniciativa fixa**, ações de turno, `rest`, modificadores posicionais, valor, vitória/derrota.
**Aceite:** batalha completa jogada via `BattleCommand[]` em teste sem UI; replay reproduz estado final idêntico; teste provando que buff de `spd` **não** reordena a iniciativa.

### M4 — Equipamento
Geração, enhance, substats, sets, reforge, CP.
**Aceite:** 100.000 itens gerados respeitam a distribuição de pesos declarada (±2%); enhance com seed fixa é reproduzível.

### M5 — Classes e talentos
Árvores, promoção, choice nodes, patch de skills, builds compartilháveis.
**Aceite:** alocar/resetar altera stat sheet e skills de forma reprodutível; validação rejeita alocação inválida (gate de linha, exclusividade).

### M6 — Cliente jogável
Pixi + React: mapa, movimento, **preview de duelo**, animação, painel de recursos, inventário, árvore, editor de táticas.
**Aceite:** campanha de 3 mapas jogável ponta a ponta; resultado exibido idêntico ao simulado no core.

### M7 — PvP assíncrono
Fastify, Postgres, times de defesa com IA declarativa, matchmaking por CP/ELO, replays.
**Aceite:** resultado do servidor idêntico ao do cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada.

### M8 — Conteúdo e balanceamento
`tools/balance`, matriz de winrate, relatório de distribuição de stats, temporadas, loja de arena.
**Aceite:** toda composição dentro da faixa de **40–60%** de winrate global em 10.000 partidas; **e** builds vencedoras não concentram `spd` acima da mediana em mais de 60% dos casos (§6.7).

> O critério original só tinha teto ("nenhuma composição acima de 65%"). O piso entrou na
> revisão de 2026-08-28: sem ele, uma composição em 31% passava no aceite e mesmo assim
> ninguém a levaria para a arena — o roster efetivo fica menor que o nominal, que é o mesmo
> problema que o teto existe para evitar, pelo outro lado. `tools/balance/src/report.ts` já
> media os dois desde a revisão do M8 (`WINRATE_ALERT_THRESHOLD_PCT`/`WINRATE_FLOOR_THRESHOLD_PCT`);
> esta linha é a spec alcançando a ferramenta.

---

> **M9 em diante foram definidos pela auditoria de 2026-08-07**, depois que M0–M8 (o roadmap
> original) foram concluídos. Motivação registrada em `DECISIONS.md`, seção "Auditoria
> 2026-08-07". Cada milestone tem um briefing de implementação detalhado em
> `docs/milestones/` escrito **no momento em que ele vira o próximo** — não antes, porque o
> escopo dos posteriores depende do resultado dos anteriores.

### M9 — Integração de conteúdo
Loader único `packages/data` → `ContentCatalog`, consumido por cliente, servidor, `sim-cli` e
`tools/balance`. Aposentadoria do conteúdo hardcoded de `apps/client/src/data/campaign/`
(regra 4 do `CLAUDE.md`). Servidor bootando com catálogo real em vez de `EMPTY_CATALOG`.
Nenhuma mecânica nova.
**Aceite:** existe exatamente um loader no repositório e `apps/client/src/data/campaign/` não
existe mais; `pnpm balance` produz matriz **idêntica** à de antes da migração; o mesmo `Hero`
produz o mesmo hash de `StatSheet` no cliente, no servidor e no `sim-cli`.

### M10 — Profundidade do duelo
Ligar o que M2 deixou desligado: `skill.effects` aplicados dentro do duelo (buff/debuff/DoT),
dano e cura de assistência aplicados a HP de verdade, gatilhos de reação além de `onAttacked`
(`onDamaged`, `onLethal`), efeitos `special` de set (§7.4), tick de DoT/regeneração (§6.9).
Exige campo normativo de dano/cura periódico em `EffectDef` e de duração em
`EffectApplication` — hoje nenhum dos dois existe. Exige também `tools/balance` suportando
comps **multi-unidade** com assistência real: sem isso as mudanças desta milestone não são
mensuráveis.
**Aceite:** um duelo com skill que aplica debuff produz stat sheet alterado na troca seguinte,
provado por teste; assistência muda o HP final do duelo; `pnpm balance` roda com comps de
múltiplas unidades e os dois critérios de M8 continuam batendo com o motor novo.

### M11 — Objetivos de mapa e Valor
Condições de vitória além de `rout` (`seize`, `surviveRounds`, `escort`, `defend` — já têm
schema desde M3, nenhuma tem resolução), `mapSkill` com alvo em área (§5.4: cura em área,
artilharia), catálogo real de `valor-skills` resolvido de verdade por `useValor` (hoje só
gasta saldo). Sem estes, todo mapa da campanha é obrigatoriamente "mate todo mundo".
**Aceite:** uma batalha por milestone-condição termina por cada uma das 4 condições novas em
teste; `useValor` produz efeito observável no estado; `mapSkill` em área atinge mais de uma
unidade; `pnpm balance` reexecutado sem regressão nos dois critérios de M8.

### M12 — Conteúdo e campanha real
Autoria de conteúdo em cima do motor completo: campanha em capítulos (6–10 mapas, §10) com
objetivos variados, mais classes e skills, e — o ponto principal — **skills que usam os
efeitos de M10 e os objetivos de M11**. Rebalanceamento completo.
**Aceite:** campanha de 6+ mapas jogável ponta a ponta com pelo menos 3 condições de vitória
distintas; nenhuma skill do catálogo é só um número de dano; os dois critérios de M8 batendo.

### M13 — Superfície jogável completa (§11)
Fechar os requisitos duros de §11 que nenhum milestone cobriu: tela de **replay** (reprodução
passo a passo com controle de velocidade), tela de **PvP** ligando cliente ao servidor de M7
(hoje o cliente nunca chama o servidor), **persistência/save** entre mapas, e a acessibilidade
faltante (modo daltônico nos overlays, fonte escalável).
**Aceite:** um `Replay` gravado é reproduzido passo a passo na UI e bate com o resultado do
core; uma partida de PvP é iniciada, resolvida e revista pelo cliente contra o servidor real;
progresso sobrevive a recarregar a página.

### M14 — Economia PvE (§10)
Masmorras de farm com foco definido (equipamento/experiência/ouro/chefe), energia de conta,
progressão de awakening (0–6) e imprint, e as três moedas (`ouro`, `pedras`,
`marcas de arena`). A loja de PvP (M8) já existe e continua valendo a regra: vende gear de set
e cosmético, **nunca poder bruto**.
**Aceite:** um ciclo completo de farm → drop → enhance → equipar → subir de poder é jogável;
energia limita o farm diário; nenhuma moeda compra poder bruto.

---

> **M15 e M16 foram definidos pela auditoria de 2026-08-14**, após a conclusão do M14.
> Fundamentação em `DECISIONS.md`, seção "Auditoria 2026-08-14".

### M15 — Fechamento do loop de PvP e pendências
Tela de montar time de defesa de arena no cliente — `PUT /me/defense` existe desde M7
(`apps/server/src/battle/routes.ts:162`) e **nenhum código do cliente jamais o chamou**, o que
torna o PvP assíncrono inalcançável pelo jogador apesar de servidor, ELO, matchmaking,
replays e anti-cheat estarem prontos. Mais as pendências herdadas de M11/M14 que ainda têm
efeito observável: `lifesteal` inerte, `summonReinforcement` sem resolução, "+2 Valor ao
capturar objetivo" sem ponto de aplicação, e `Tile.object` declarado com 5 valores mas com
leitor só para 2 e sem nenhum uso no conteúdo.
**Aceite:** um jogador monta a defesa pelo cliente, ela persiste, e um segundo jogador a
enfrenta e vê o replay — o ciclo de PvP fecha ponta a ponta sem `curl`; `lifesteal` altera HP
em teste; nenhum `kind` de valor-skill rejeita por falta de implementação.

### M16 — Linguagem visual programática
Direção de arte **definitiva** do jogo, e a primeira milestone a tratar apresentação como
sistema. Zero assets raster: silhueta/glifo vetorial por classe (hoje toda unidade é um
retângulo com texto), legibilidade de estado (AP/PP, efeitos ativos, ameaça, objetivos) e
animação com peso. Constrói **sobre** `apps/client/src/data/overlayTheme.ts`, o sistema de
tema que M13 4/N já criou para o modo daltônico — generalizar aquilo em tokens, não começar
paleta do zero. O renderer ganha uma costura trocável de representação de unidade, para que
uma camada de sprite possa entrar por cima no futuro sem reescrever `MapCanvas.tsx`.
**Aceite:** nenhum arquivo de imagem entra no repositório; o grid, as unidades e o estado de
batalha são legíveis sem hover e sem legenda, validado pelo usuário no browser; **a garantia
de daltonismo de M13 4/N continua valendo** (marca própria por overlay, não só cor) e é
reverificada, não assumida; a costura de representação de unidade existe e tem uma segunda
implementação de teste provando que é trocável.

---

> **M17 foi definido pelo usuário em 2026-08-28**, ao reposicionar o design depois de fechar o M16.
> Briefing: `docs/milestones/M17-personagens-e-talentos.md`. Forma normativa da árvore em §8.2.

### M17 — Personagens e a árvore de duas colunas
O jogo passa a se basear em **personagens**, não em classes. A classe continua guiando status e
parte do que o personagem faz (curva de stat, `moveType`, armas, pools, skills de partida) mas
deixa de ser a unidade de progressão: a **árvore de talentos passa a ser do personagem**, com duas
colunas de 5 a 9 linhas, um nó por linha, a coluna amarrando a linha seguinte, e uma coluna do
meio ocasional cujo nó é a porta que libera trocar de lado. Orçamento de pontos = profundidade.
Junto entra a simplificação que a mudança revelou: **inimigo de fase deixa de ser um `Hero` com
classe, nível, equipamento e talentos** e passa a ser autorado direto, com status e skills
escolhidos para a dificuldade pretendida.
**Aceite:** um personagem aloca a árvore de duas colunas ponta a ponta pelo cliente, com a
amarração impedindo escolha ilegal e a convergência liberando a troca; nenhum inimigo de campanha
ou masmorra passa por `Hero`/classe; `pnpm balance` reexecutado com os dois critérios do M8 de pé;
`RULES_VERSION` sobe e o servidor rejeita replay de versão anterior com 409.

---

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** fora do escopo. Se houver gacha, ele NÃO toca em `packages/core`.
