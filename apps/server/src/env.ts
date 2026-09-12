// M28, sub-sessão 1/N — as variáveis de ambiente declaradas num lugar só.
//
// **Por que uma declaração, e não só os `process.env` espalhados.** O servidor falha alto
// quando falta variável, o que é o comportamento certo (M20) — mas "falha alto" só ajuda
// quem já subiu o processo. O que faltava era o outro lado: um jeito de o `compose.yaml`
// ser conferido contra o que o código EXIGE, sem subir nada, a cada commit.
//
// Esta lista é lida por `tests/ambiente.test.ts` nas duas direções: nenhum ponto de entrada
// lê uma variável que não esteja aqui, e nenhuma entrada daqui deixou de ser lida. A
// primeira metade impede o compose de ficar incompleto em silêncio; a segunda impede esta
// lista de virar documentação velha.

/**
 * O que o ambiente local (`compose.yaml`) precisa fornecer.
 *
 * `BATTLE_TICKET_SECRET` entra aqui porque §9.4 não abre exceção para desenvolvimento: sem
 * segredo, quem escolhe a seed da batalha é o cliente. No compose ele é fixo e explicitamente
 * de mentira — ver o comentário no `compose.yaml`.
 */
export const ENV_DO_COMPOSE = ['DATABASE_URL', 'BATTLE_TICKET_SECRET'] as const;

/**
 * O que só produção exige: a identidade da plataforma (M20).
 *
 * Não está no compose porque numa máquina limpa não existe chave da Steam — e é justamente
 * por isso que o compose monta OUTRO ponto de entrada, com o validador de desenvolvimento,
 * em vez de um `index.ts` que escolhe a identidade por variável. Ver `composeServer.ts`.
 */
export const ENV_SO_DE_PRODUCAO = ['STEAM_WEB_API_KEY', 'STEAM_APP_ID'] as const;

/** Produção exige tudo o que o compose exige, e mais a identidade. Nunca um conjunto diferente. */
export const ENV_DE_PRODUCAO = [...ENV_DO_COMPOSE, ...ENV_SO_DE_PRODUCAO] as const;

/** Tem padrão razoável; a ausência não impede o servidor de subir. */
export const ENV_OPCIONAL = ['PORT'] as const;
