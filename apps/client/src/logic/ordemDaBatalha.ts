// M35 4/N (D44) — a ORDEM do que fica ao lado do tabuleiro, e a regra que a decide.
//
// §1.1: o jogador DEVE conseguir prever o resultado antes de confirmar. Daí a regra do
// briefing — o que ele precisa para DECIDIR (a unidade selecionada e as ações dela) e para
// PREVER (iniciativa, AP/PP do exército, objetivo) fica mais perto do tabuleiro do que o que ele
// precisa para ADMINISTRAR (abandonar, enviar a batalha, o status do modo). Até aqui a coluna
// começava pela administração e a decisão em curso ficava abaixo da dobra.
//
// Lista em runtime, iterada por `App.tsx`: a regra mora num lugar só e `ordemDaBatalha.test.ts`
// a lê daqui, em vez de ler o JSX.
export const PAINEIS_DA_BATALHA = [
  { painel: 'unidade', papel: 'decisao' },
  { painel: 'iniciativa', papel: 'previsao' },
  { painel: 'recursos', papel: 'previsao' },
  { painel: 'objetivo', papel: 'previsao' },
  { painel: 'modo', papel: 'administracao' },
] as const;

export type PainelDaBatalha = (typeof PAINEIS_DA_BATALHA)[number]['painel'];
export type PapelDoPainel = (typeof PAINEIS_DA_BATALHA)[number]['papel'];
