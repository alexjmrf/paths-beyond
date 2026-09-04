// §9.4 (M20) — a IDENTIDADE que o servidor aceita.
//
// `x-player-token` era um token opaco que o jogador digitava numa caixa de texto (stub
// declarado em M7). Enquanto o servidor só arbitrava arena, o pior que acontecia era alguém
// jogar a partida de outro. Com economia real e uma moeda que se compra com dinheiro, o
// mesmo token é ao mesmo tempo o mecanismo de autenticação e o de personificação: quem sabe
// o token de alguém É essa pessoa.
//
// O que entra é o ticket de sessão da plataforma. A propriedade que faz a troca valer a pena
// não é criptográfica: é que **credencial nenhuma fica do nosso lado**. Não há senha para
// vazar, não há token para adivinhar, e o que o cliente manda vale por segundos.

export type IdentityProvider = 'steam' | 'epic' | 'dev';

export interface PlatformIdentity {
  readonly provider: IdentityProvider;
  // O id da plataforma (SteamID64, por exemplo). É a chave da conta, e o único dado de
  // identidade que o projeto guarda.
  readonly platformId: string;
  // Opcional porque nem toda plataforma devolve nome no mesmo passo da validação. Quando
  // vem, é o nome inicial da conta; quando não, o jogador é criado com um nome derivado.
  readonly displayName?: string;
}

// Injetado em `buildApp`, no mesmo padrão de `now` e `newNonce` (M14/M15). Sem essa costura
// a suíte dependeria da Steam para rodar, o que é o mesmo que não rodar.
export interface IdentityValidator {
  // `null` é RECUSA, e não erro: ticket expirado, ticket de outro jogo e plataforma fora do
  // ar são todos "não sei quem é você", e nenhum deles deve virar 500.
  validate(ticket: string): Promise<PlatformIdentity | null>;
}
