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
export const RULES_VERSION = '0.1.0';
