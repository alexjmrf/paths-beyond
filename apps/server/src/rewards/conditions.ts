import type { RewardCondition } from '@paths-beyond/content';

// §10 (M18, 4/N) — a avaliação das condições de conquista e evento.
//
// **Função PURA, e é por isso que ela não mora dentro da rota.** Mesmo precedente de
// `matchmaking/elo.ts` e `battle/ticket.ts`: regra de conta é testável sem subir servidor,
// e um `if` no meio de um handler não é.
//
// Ela também não mora em `packages/core`: §15 mantém a aquisição fora de lá, e esta é a
// avaliação de uma FONTE da moeda premium. Nem em `packages/gacha`, que é a mecânica da
// rolagem e nada mais.
//
// Decisão do usuário: as condições só olham estado que o servidor JÁ TEM. É o que dispensa
// tabela de contadores e ganchos espalhados — e o que torna toda conquista retroativa de
// graça, porque quem já cumpriu a condição antes de ela ser autorada pode reivindicar
// assim que ela existir.

export interface AccountSnapshot {
  readonly chaptersCleared: number;
  readonly dungeonsCleared: number;
  readonly charactersOwned: number;
  // O MAIOR entre os heróis do jogador, não o de um herói nomeado: amarrar a condição a um
  // personagem específico a tornaria impossível para quem não o puxou.
  readonly bestImprint: number;
  readonly bestAwakening: number;
  readonly elo: number;
}

export function meetsCondition(condition: RewardCondition, account: AccountSnapshot): boolean {
  switch (condition.kind) {
    case 'chaptersCleared':
      return account.chaptersCleared >= condition.atLeast;
    case 'dungeonsCleared':
      return account.dungeonsCleared >= condition.atLeast;
    case 'charactersOwned':
      return account.charactersOwned >= condition.atLeast;
    case 'heroImprint':
      return account.bestImprint >= condition.atLeast;
    case 'heroAwakening':
      return account.bestAwakening >= condition.atLeast;
    case 'elo':
      return account.elo >= condition.atLeast;
  }
}

// A janela de um evento, aberta nas duas pontas inclusive no início e exclusive no fim.
// Meia-aberta de propósito: com as duas inclusive, dois eventos consecutivos autorados como
// `[a, b]` e `[b, c]` se sobreporiam por um milissegundo — e o instante de virada é
// exatamente o que alguém autora quando quer emendar duas janelas.
export function isWithinWindow(event: { startsAt: number; endsAt: number }, nowMs: number): boolean {
  return nowMs >= event.startsAt && nowMs < event.endsAt;
}
