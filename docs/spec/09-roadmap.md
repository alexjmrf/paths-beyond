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
**Aceite:** nenhuma composição acima de 65% de winrate global em 10.000 partidas; **e** builds vencedoras não concentram `spd` acima da mediana em mais de 60% dos casos (§6.7).

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

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** fora do escopo. Se houver gacha, ele NÃO toca em `packages/core`.
