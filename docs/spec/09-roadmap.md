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

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** fora do escopo. Se houver gacha, ele NÃO toca em `packages/core`.
