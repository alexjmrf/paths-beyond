// §01-fundacoes-tecnicas.md §3.3 / regra 11 do CLAUDE.md — "toda mudança de regra
// incrementa rulesVersion." Vive em `packages/core` (não em package.json, que não é
// legível em runtime no browser) porque core É a definição das regras; cliente, sim-cli
// e servidor todos dependem de core, então todos leem a mesma constante — nunca cada um
// mantendo sua própria cópia. Bump manual sempre que uma regra mudar.
//
// D4 (M9, docs/milestones/M9-integracao-de-conteudo.md): primeiro bump real desde M0 —
// nunca foi exercido em 8 milestones apesar da regra 11, apesar de o servidor já
// validar replay/anti-cheat contra este campo desde M7 (nunca invalidava nada de
// verdade). M9 é o momento certo pra começar a exercer a regra: é quando cliente,
// servidor e sim-cli passam a compartilhar a mesma fonte de conteúdo real pela primeira
// vez, então uma mudança de valor aqui agora tem efeito observável de verdade (anti-cheat
// rejeitando replay de versão desatualizada). Não representa uma mudança de mecânica de
// M9 em si (M9 é só integração — "nenhuma mecânica nova") — é a auditoria fechando uma
// lacuna de disciplina de processo. Rebaseia a contagem em vez de tentar reconstruir
// retroativamente 8 incrementos que nunca aconteceram.
//
// M10, sub-sessão 1/N: skill.effects passou a ser aplicado dentro de resolveDuel (era
// mecanicamente inerte desde M2 — ver DECISIONS.md). Mudança de regra real, não de
// integração: GOLDEN_HASH em crossRuntime.test.ts mudou no mesmo commit (protocolo
// documentado no próprio teste).
//
// M10, sub-sessão 2/N: assistência (§6.5.3) passa a causar dano de verdade a HP (era
// decisão-only desde M2 — resolveAssists decidia QUEM assistia, nunca aplicava o
// dano). Mudança de regra real mesmo GOLDEN_HASH não tendo mudado desta vez — o
// replay canônico não exercita nenhum assistente com trigger onAllyEngagedNearby de
// verdade (achado desta sub-sessão, gap pré-existente da fixture, não corrigido aqui
// por estar fora de escopo). `pnpm balance` também não muda: os 9 comps reais de M8
// são de 1 unidade só, sem aliado pra assistir.
//
// M10, sub-sessão 3/N: DoT/regeneração (§6.9) passam a tickar de verdade em
// `battle/round.ts` (`periodicDamagePct`/`periodicHealPct` existiam no schema desde a
// sub-sessão 1, mas nunca eram lidos — mecanicamente inertes). Mudança de regra real
// mesmo GOLDEN_HASH não tendo mudado desta vez — o replay canônico não tem nenhum
// efeito com campo periódico, e nenhum conteúdo real de `packages/data` declara esses
// campos ainda (só `test-fixtures/`). `pnpm balance` também byte-a-byte idêntico pelo
// mesmo motivo.
// M10, sub-sessão 4/N: quais reações uma unidade tem deixou de ser derivado do `kind` da
// skill e passou a ser explícito no dado (`SkillDef.baseline`). §6.4 fecha a lista de
// reações universais em duas (Contra-atacar, Defender) e diz que o resto vem de classe ou
// talento; a derivação de M9 ("toda skill kind:'reaction' é baseline") só estava certa
// enquanto essas duas eram as únicas reações do catálogo. Com `skill-assistir` no
// catálogo, a regra antiga daria assistência de graça a toda unidade. Mudança de regra
// real e observável: o `reactionScript` resolvido por `combatProfile.ts` muda.
// M10, sub-sessão 5/N: `onDamaged` e `onDebuffed` (§6.4) passam a ser resolvidos dentro do
// duelo — antes só `onAttacked` (M2) e `onAllyEngagedNearby` (assistências) eram. Mudança
// de regra real; não observável em `pnpm balance` nem no `GOLDEN_HASH` porque nenhuma skill
// do catálogo real (nem a fixture do replay canônico) declara esses triggers ainda.
// `onLethal` continua sem resolução, por decisão de design registrada em DECISIONS.md.
// M10, sub-sessão 6/N: os 4 efeitos `special` de set (§7.4) deixam de ser inertes —
// Duelista (contra-atacar de graça na troca 1), Imunidade (sem debuff na troca 1), Reserva
// (+1 AP inicial, `rest` recupera 2 AP) e Sentinela (uma assistência de graça por round de
// mapa). Mudança de regra real em quatro pontos do motor (resolveDuel, applyRest,
// buildAssistCandidates, combatProfile). Não observável em `pnpm balance` nem no
// GOLDEN_HASH: os 4 sets existem em packages/data mas nenhum item pertence a eles, então
// nenhuma unidade de conteúdo real ou do replay canônico tem os efeitos ativos.
// M10, sub-sessão 7/N: cura passa a existir no motor. A spec não tinha fórmula nenhuma
// (§2 só lista `heal` como "cura dada/recebida, %"; §6.5.3 diz "cura/buff em efeito
// integral" sem dizer integral de quê), então a fórmula é decisão de design registrada em
// DECISIONS.md: multiplier × stat de `scalesWith` + flat, modificada pelo `heal` de quem
// cura, sem mitigação/triângulo/posicional e sem crítico nem variância. Três caminhos
// ligados: assistência de cura (cura o aliado duelista, SEM o corte de 50% do dano), skill
// de duelo com a tag `heal` (auto-cura) e reação com a tag `heal` ("Cura de emergência",
// §6.4). Mudança de regra real; não observável em `pnpm balance` nem no GOLDEN_HASH porque
// nenhuma skill do catálogo real declara a tag.
export const RULES_VERSION = '0.8.0';
