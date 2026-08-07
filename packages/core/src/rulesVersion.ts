// §01-fundacoes-tecnicas.md §3.3 / regra 11 do CLAUDE.md — "toda mudança de regra
// incrementa rulesVersion." Vive em `packages/core` (não em package.json, que não é
// legível em runtime no browser) porque core É a definição das regras; cliente, sim-cli
// e servidor todos dependem de core, então todos leem a mesma constante — nunca cada um
// mantendo sua própria cópia. Bump manual sempre que uma regra mudar.
export const RULES_VERSION = '0.0.0';
