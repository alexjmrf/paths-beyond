# M17 — Personagens e a árvore de duas colunas (briefing de implementação)

> Escrito em 2026-08-28, no momento em que M17 virou o próximo milestone, seguindo o método das
> auditorias anteriores. Complementa a entrada de `docs/spec/09-roadmap.md` e a §8 reescrita de
> `docs/spec/06-classes-e-talentos.md`, que é normativa.
> **Leia este arquivo inteiro antes de escrever qualquer código.** As decisões abaixo foram
> tomadas com o usuário — não as reabra sem um motivo técnico novo.

## 1. Por que este milestone existe

O jogo tinha classes como unidade de progressão: duas árvores por classe (Classe + Especialização,
8 pontos cada), compartilhadas por todo herói daquela classe. O usuário reposicionou o design em
2026-08-28: **o jogo se baseia em personagens**, a classe passa a *guiar* status e parte do que o
personagem faz, e a árvore vira dele.

Junto veio uma simplificação que não estava na pergunta original e vale tanto quanto: **inimigo de
fase não é personagem**. Hoje todo inimigo de campanha e masmorra é um `Hero` completo — classe,
nível, equipamento, talentos — resolvido por `resolveHeroCombatProfile` para virar `BattleUnit`.
Isso obriga o autor de conteúdo a dizer "este inimigo é um arqueiro nível 8 com estes talentos"
quando o que ele quer dizer é "este inimigo tem esta força".

## 2. As decisões, já tomadas

**D1 — Personagem é o que o jogador usa.** O mesmo objeto serve PvE e PvP: campanha, masmorra,
arena assíncrona e um eventual PvP em tempo real. Tem classe, equipamento, nível e árvore própria.

**D2 — A classe guia status e parte do comportamento, e não é mais a unidade de progressão.**
Curva de stat, `moveType`, `moveRange`, armas permitidas, pools base de AP/PP e skills de partida
continuam vindo dela. A árvore, não.

**D3 — Uma árvore por personagem, com duas colunas e uma terceira ocasional.** Profundidade de 5 a
9 linhas; um nó por linha; a coluna amarra a linha seguinte; o nó do meio libera a linha seguinte
para qualquer coluna, e a coluna escolhida ali volta a amarrar. **O orçamento foi corrigido pelo
D9 abaixo:** é fixo em 9 para todo personagem, não sai da profundidade. A forma completa está em
§8.2 e é normativa.

**D4 — Inimigo de fase é autorado direto**, com status e skills escolhidos para a dificuldade.
Sem classe a resolver, sem nível a interpolar, sem árvore, sem alocação.

**D5 — Isto é mudança de regra.** `RULES_VERSION` sobe, e replays gravados antes deixam de validar
(§7, anti-cheat, devolve 409). Não há caminho de migração: o formato de alocação muda.

## 3. O que a mudança quebra, medido no código de hoje

Levantado antes de escrever este briefing, não estimado:

| O quê | Onde | Por quê |
| --- | --- | --- |
| A forma do nó | `packages/data/schemas/classes.schema.ts` (`talentTree` mora dentro da classe) | `tree: 'class'\|'spec'` e `requires`/`exclusiveWith` dão lugar a `column`/`row` |
| As 10 árvores autoradas | `packages/data/classes/*.json`, geradas por `scripts/authorContent.ts` | precisam ser reautoradas na forma nova |
| A validação | `packages/core/src/talents/allocate.ts` (`validateAllocation`, `resetTree`) | o gate deixa de ser "pontos gastos na árvore" e passa a ser a amarração por coluna |
| O gate de despertar | `TalentNode.minAwakening` (M14) | precisa reencontrar lugar na estrutura nova |
| Os build codes | `apps/client/src/logic/buildCode.ts` | codificam alocação; códigos existentes quebram |
| A UI da árvore | `apps/client/src/components/TalentTreePanel.tsx`, `logic/talentLayout.ts` | o layout é de duas árvores por classe |
| O caminho do inimigo | `packages/core/src/hero/combatProfile.ts`, `encounters.schema.ts`, `dungeon-encounters.schema.ts` | inimigo deixa de passar por `Hero` |
| Os geradores de conteúdo | `scripts/authorCampaign.ts`, `scripts/authorDungeons.ts` | hoje montam inimigos como `Hero` completo |
| As comps da arena | `scripts/authorContent.ts` | representam builds de jogador: continuam com árvore, agora por personagem |

**O que NÃO muda:** `TalentEffect` inteiro (a lista de 12 efeitos segue idêntica), `SkillDef`, o
duelo, o grid, a economia de AP/PP, e a promoção de classe.

## 4. Ordem sugerida das sub-sessões

1. **O schema e o motor da árvore nova.** `TalentTree`/`TalentNode` na forma de coluna,
   `validateAllocation` com a amarração e o orçamento, testes antes. Nada de conteúdo ainda —
   `packages/core` e `packages/data/schemas` só.
2. **Reautorar as árvores** dos personagens jogáveis na forma nova, e o `minAwakening` reencontrando
   lugar. Aqui entra a decisão de quantas árvores existem (ver §5).
3. **O inimigo direto.** Schema de inimigo autorado, `combatProfile` deixando de ser o caminho
   único, e os dois geradores de conteúdo reescritos. É a fatia que mais toca conteúdo existente.
4. **Cliente e build codes.** Layout de duas colunas, e o formato de código novo.
5. **Fechamento:** `pnpm balance` reexecutado (a mudança mexe em talento, e talento mexe em
   winrate — regra 10), `RULES_VERSION` subindo, e o registro.

## 5. Decisões resolvidas com o usuário em 2026-08-28

As três perguntas que este briefing deixou em aberto foram respondidas, e uma quarta apareceu no
caminho. Ficam aqui porque cada uma muda o trabalho:

**D6 — O elenco é FECHADO, e o torneio de balanceamento passa a medi-lo.** Personagem é o que o
jogador usa; o roster deixa de ser sintético. Duas consequências que o usuário aceitou junto:

- **o balanceamento fechado em 2026-08-28 REABRE.** Os 43,9–60,8% foram medidos sobre 9 comps
  sintéticas por classe (`authorContent.ts`), e essas comps deixam de existir. Os números não se
  transferem, e a fatia de balanceamento do M17 terá de refazer a medição sobre o roster real;
- **o servidor passa a precisar conhecer o elenco.** Hoje o PvP não valida alocação — nó
  desconhecido é ignorado em silêncio por `resolveTalentEffects`, e isso funciona porque a árvore
  da classe é compartilhada. Com árvore por personagem, resolver a alocação exige a árvore
  daquele personagem, o que só é possível com elenco autorado e fechado.

**D7 — O elenco cresce de 6 para 9.** Grifeiro, guerreiro e lanceiro não tinham personagem, e com
elenco fechado ninguém as jogaria — três classes com skills, itens e árvore autorados ficariam sem
consumidor, que é o antipadrão que M10, M11 e M15 passaram o projeto corrigindo. Entram três
personagens novos. `mestre-espadachim` é caso à parte: é a promoção do espadachim e chega por
`hero-jogador`, não por personagem próprio.

**D8 — `ally-mensageira` e `ally-couracado` são elenco**, não NPC de missão, mesmo aparecendo hoje
em um capítulo só. O jogador os mantém.

**D9 — A profundidade é por personagem; o ORÇAMENTO é fixo.** §8.2 foi corrigida junto: 9 pontos
para todos. A profundidade (5 a 9) vira troca de forma — uma árvore de 9 linhas gasta tudo
descendo, uma de 5 tem 4 pontos para aprofundar ranks no caminho. Mesmo poder total nos dois
extremos, e o balanceamento consegue separar desenho de tamanho.

### Ainda em aberto

- **O que fazer com saves** que carregam `talentAllocationByUnit` no formato antigo: devolver os
  pontos ou recusar o save. Só morde na fatia do cliente (4/N).
- **Quem são os três personagens novos** — nome, árvore e onde entram na campanha, que hoje só
  apresenta seis. É autoria, e é a primeira coisa da 2/N.

## 6. Critério de aceite (proposto — confirmar com o usuário ao abrir o milestone)

1. Um personagem aloca uma árvore de duas colunas ponta a ponta pelo cliente, a amarração impede
   as escolhas ilegais, e a convergência libera a troca — provado por teste e visto no browser.
2. Nenhum inimigo de campanha ou masmorra passa por `Hero`/classe: todos são autorados direto, e
   um teste garante que o caminho antigo não é mais alcançável a partir do conteúdo.
3. `pnpm balance` reexecutado, com os dois critérios do M8 de pé (faixa 40–60%, `spd` abaixo de
   60%) e o relatório colado.
4. `RULES_VERSION` sobe, e o servidor rejeita replay de versão anterior com 409 — provado por
   teste.

## 7. O que NÃO fazer

Não manter os dois modelos de árvore convivendo "por compatibilidade": o formato antigo sai. Não
tentar migrar alocação salva (D5). Não expandir conteúdo além do mínimo que as decisões exigem —
personagem novo, classe nova e skill nova são outro milestone. E não mexer em `TalentEffect`: a
lista de efeitos não é o que está sendo redesenhado.
