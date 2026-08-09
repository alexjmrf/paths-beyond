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
export const RULES_VERSION = '0.5.0';
