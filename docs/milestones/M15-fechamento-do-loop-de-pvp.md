# M15 — Fechamento do loop de PvP e pendências (briefing de implementação)

> Escrito pela auditoria de 2026-08-14. Complementa a entrada terse de
> `docs/spec/09-roadmap.md`. **Leia este arquivo inteiro antes de escrever qualquer código.**
> As decisões abaixo já estão tomadas — não as reabra sem um motivo técnico novo.

## 1. Por que este milestone existe

M7 entregou PvP assíncrono completo do lado do servidor: auth, `PUT /me/defense`,
matchmaking por ELO, replays, anti-replay por nonce, rate limiting e anti-cheat, com fuzz de
1000 partidas verde. M13 entregou a tela de PvP no cliente.

**Mas ninguém nunca escreveu a tela que monta o time de defesa.** Verificado nesta auditoria:

```
apps/server/src/battle/routes.ts:162   fastify.put('/me/defense', ...)   ← existe desde M7
grep -rn "defense" apps/client/src     → nenhum resultado
```

Um jogador não consegue definir quem defende o seu castelo. Sem isso, o PvP assíncrono — um
milestone inteiro de infraestrutura — **não é alcançável pelo jogador**, só por `curl`. É um
buraco funcional, não um polimento.

A auditoria priorizou este milestone acima do trabalho gráfico (M16) por essa razão:
apresentação em cima de um loop de jogo que não fecha é maquiagem. A tela nova também nasce
depois melhor, quando a linguagem visual de M16 existir — mas existir feia é melhor que não
existir.

## 2. O contrato já está definido pelo servidor — não o redesenhe

`PUT /me/defense` (`apps/server/src/battle/routes.ts:162`) já valida tudo. Leia o handler
antes de desenhar a tela; ele é a especificação:

- corpo: `{ mapId, units: [{ heroId, pos, height, aiArchetype }] }`
- `units.length` entre 1 e `MAX_TEAM_SIZE` → 400 fora disso
- `mapId` precisa existir em `catalog.maps` → 400
- todo `heroId` precisa pertencer ao jogador autenticado → 403

A tela do cliente deve **impedir** que qualquer um desses 4 erros chegue a ser enviado, e
ainda assim tratar a resposta de erro (o servidor é a autoridade, o cliente é conveniência —
mesma divisão de sempre neste projeto: `packages/core` decide, o cliente renderiza).

`aiArchetype` são os 5 de §9.1, já implementados em `packages/core/src/battle/mapAi.ts` desde
M7 sub-2: `aggressive`, `hold-position`, `guard-tile`, `flank`, `support-nearest`. A tela
precisa deixar o jogador escolher um por unidade — **essa escolha é o conteúdo tático da
tela**, não um detalhe de formulário. Mostre o que cada arquétipo faz em português, do mesmo
jeito que o editor de táticas (M6 sub-5) traduz `Condition`.

## 3. Pendências herdadas — diagnóstico verificado

`PROGRESS.md` listava 5 pendências. A auditoria checou uma por uma; **uma delas está
desatualizada** e o restante foi requalificado:

| Pendência | Estado real verificado | Ação |
|---|---|---|
| `lifesteal` inerte | Confirmado: aparece só em `types.ts`/`STAT_KEYS`, nenhum consumidor no motor | **Implementar** |
| `summonReinforcement` sem resolução | Confirmado: `battle/valor.ts:126-127` rejeita explicitamente com motivo | **Implementar** |
| "+2 Valor ao capturar objetivo" | Confirmado sem ponto de aplicação | **Implementar** |
| `Tile.object` "sem leitor no motor" | **Nota desatualizada.** Já existe leitor em `battle/commands.ts:120` (`fort`/`camp` dão +1 AP no `rest`). O problema real é outro: o tipo declara 5 valores (`wall\|fort\|gate\|chest\|camp`), só 2 têm leitor, e **nenhum mapa em `packages/data` usa o campo** | **Decidir e registrar** (ver D3) |
| Tela de defesa de arena | Confirmado: endpoint existe, cliente nunca chamou | **Implementar** (§2) |

Corrija a linha de `PROGRESS.md` sobre `Tile.object` ao fim do milestone — ela está errada
hoje e vai enganar a próxima sessão.

## 4. Decisões já tomadas

**D1 — `lifesteal` cura o atacante como fração do dano efetivamente aplicado a HP**, não do
dano calculado antes de mitigação, e nunca acima do HP máximo. Cura de excesso é descartada,
não convertida em escudo. Motivo: é a leitura mais simples e a única que não exige inventar um
sistema de escudo que a spec não descreve. `lifesteal` já é fp-scale como todo stat percentual
— use os helpers de `math/fixed.ts`, como manda a regra 2.

**D2 — `summonReinforcement` invoca uma unidade declarada em dados, nunca gerada em código.**
O `payload` da valor-skill (`battle/valor.ts:32`) declara qual `heroId`/perfil entra e o tile
é o alvo do comando `useValor`. Regra 4 do `CLAUDE.md`: a unidade invocada é conteúdo, mora em
`packages/data`. Se o tile alvo estiver ocupado ou fora do mapa, rejeite alto — **mantenha o
comportamento atual de nunca gastar Valor quando a resolução falha** (`commands.ts:244`), que
é design correto e já está lá.

**D3 — `Tile.object`: implemente `wall` e `gate`, remova `chest` do tipo.** `wall` e `gate`
são bloqueio de movimento/linha e têm significado tático imediato num jogo de grid — `gate`
como bloqueio destrutível ou abrível, `wall` como intransponível. `chest` é economia de
exploração (loot em mapa) e não existe sistema nenhum que o sustente; um valor de enum que
nada lê e nada escreve é dívida, não recurso. Se você discordar porque encontrou um consumidor
real, registre em `DECISIONS.md` em vez de implementar em silêncio. **Autore pelo menos um
mapa de `packages/data` usando os valores implementados** — um campo que nenhum conteúdo usa
continua sendo código morto por outro nome.

**D4 — Nada de trabalho visual nesta milestone.** A tela de defesa usa o CSS existente
(`apps/client/src/style.css`, 1184 linhas, já com a identidade dos 13 painéis). Não invente
linguagem visual nova aqui: isso é M16, e fazer meia-boca agora garante retrabalho. Reuse os
padrões de painel/overlay que `InventoryPanel.tsx` e `TacticsEditor.tsx` já estabeleceram.

## 5. Ordem sugerida das sub-sessões

1. **Motor** (`packages/core`, testes antes — regra do projeto): `lifesteal` (D1),
   `summonReinforcement` (D2), +2 Valor na captura de objetivo, `Tile.object` (D3).
   Incrementar `RULES_VERSION` — são mudanças de regra (regra 11).
2. **Conteúdo** (`packages/data`): a unidade invocável de D2, o mapa usando `wall`/`gate` de
   D3, e a valor-skill que referencia a invocação. `pnpm validate:data` verde.
3. **Cliente**: a tela de defesa de arena (§2), ligada ao `PUT /me/defense` real.
4. **Balanceamento e aceite**: `pnpm balance` — `lifesteal` e invocação mudam winrate, então
   os dois critérios de M8 precisam ser reconfirmados, não assumidos.

## 6. Critério de aceite

1. Um jogador monta a defesa **pelo cliente**, ela persiste, e um segundo jogador a enfrenta e
   vê o replay — o ciclo de PvP fecha ponta a ponta **sem nenhum `curl`**.
2. `lifesteal` altera HP em teste determinístico.
3. Nenhum `kind` de valor-skill rejeita por falta de implementação.
4. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm validate:data` verdes; `pnpm balance` com
   os dois critérios de M8 batendo com o motor novo.

Como em todo milestone anterior: **cole a saída real dos testes** provando cada critério.

## 7. O que NÃO fazer

Nenhuma linguagem visual nova (D4 — é M16). Nenhum sistema de loot em mapa (é a razão de
`chest` sair, não de entrar). Nenhuma expansão de conteúdo além do mínimo que D2 e D3 exigem
para não serem código morto.
