import { describe, expect, it } from 'vitest';
import { INITIAL_TOKEN, advanceToken, resolvePendingToken, tokenOutcome, type TokenState } from '../src/index.js';
import { rotativoDePersonagem } from './fixtures.js';

// M38 3/N — O TOKEN DE 1,5·P (critério de aceite do M38; D55).
//
// - É contador DURO por (jogador, banner): conta rolagens NAQUELE rotativo, não por tipo.
// - Não é condicionado a como o personagem saiu: quem tirou na 2ª e quem tirou no teto chegam
//   ambos a 135 e recebem o mesmo prêmio.
// - É concedido UMA ÚNICA VEZ por banner.
// - Bateu o limiar SEM possuir o destaque: o token fica PENDENTE, e é pago quando o destaque sair.
// - Entrega o artefato assinatura do destaque; se o jogador já o tem, vira fragmento.

const LIMIAR = rotativoDePersonagem.token.threshold;

function rolar(estado: TokenState, vezes: number, possuiDestaque: boolean): { estado: TokenState; concessoes: number } {
  let concessoes = 0;
  for (let i = 0; i < vezes; i++) {
    const r = advanceToken(estado, LIMIAR, possuiDestaque);
    estado = r.state;
    if (r.grant) concessoes += 1;
  }
  return { estado, concessoes };
}

describe('o token de 1,5·P', () => {
  it('começa zerado e contando', () => {
    expect(INITIAL_TOKEN).toEqual({ rolls: 0, status: 'counting' });
  });

  it('não concede antes do limiar', () => {
    const { estado, concessoes } = rolar(INITIAL_TOKEN, LIMIAR - 1, true);
    expect(concessoes).toBe(0);
    expect(estado).toEqual({ rolls: LIMIAR - 1, status: 'counting' });
  });

  it('com o destaque na conta, concede NA rolagem do limiar', () => {
    const antes = rolar(INITIAL_TOKEN, LIMIAR - 1, true).estado;
    const r = advanceToken(antes, LIMIAR, true);
    expect(r.grant).toBe(true);
    expect(r.state.status).toBe('granted');
  });

  it('é concedido UMA ÚNICA VEZ por banner, por mais que se role depois', () => {
    const { estado, concessoes } = rolar(INITIAL_TOKEN, LIMIAR * 3, true);
    expect(concessoes).toBe(1);
    expect(estado.status).toBe('granted');
  });

  it('SEM o destaque, bater o limiar deixa o token PENDENTE — não o perde', () => {
    const { estado, concessoes } = rolar(INITIAL_TOKEN, LIMIAR, false);
    expect(concessoes).toBe(0);
    expect(estado.status).toBe('pending');

    // E continua pendente, sem se perder, enquanto o destaque não sair.
    const depois = rolar(estado, 50, false);
    expect(depois.concessoes).toBe(0);
    expect(depois.estado.status).toBe('pending');
  });

  it('pendente, é pago quando o destaque sai — pela rolagem ou por qualquer outro caminho', () => {
    const pendente = rolar(INITIAL_TOKEN, LIMIAR, false).estado;

    // Pela rolagem seguinte, que trouxe o destaque.
    const pelaRolagem = advanceToken(pendente, LIMIAR, true);
    expect(pelaRolagem.grant).toBe(true);
    expect(pelaRolagem.state.status).toBe('granted');

    // Ou fora do banner (a escolha do genérico, outro rotativo): quem chama resolve o pendente.
    const foraDoBanner = resolvePendingToken(pendente, true);
    expect(foraDoBanner.grant).toBe(true);
    expect(foraDoBanner.state.status).toBe('granted');
  });

  it('o recíproco: resolver sem o destaque não paga, e resolver quem não está pendente não paga', () => {
    const pendente = rolar(INITIAL_TOKEN, LIMIAR, false).estado;
    expect(resolvePendingToken(pendente, false)).toEqual({ state: pendente, grant: false });

    const contando = rolar(INITIAL_TOKEN, 10, true).estado;
    expect(resolvePendingToken(contando, true)).toEqual({ state: contando, grant: false });

    const concedido = rolar(INITIAL_TOKEN, LIMIAR, true).estado;
    expect(resolvePendingToken(concedido, true)).toEqual({ state: concedido, grant: false });
  });

  it('pendente pago não volta a pagar', () => {
    const pendente = rolar(INITIAL_TOKEN, LIMIAR, false).estado;
    const pago = resolvePendingToken(pendente, true).state;
    expect(rolar(pago, 200, true).concessoes).toBe(0);
  });

  it('não muta a entrada', () => {
    const estado: TokenState = { rolls: 3, status: 'counting' };
    advanceToken(estado, LIMIAR, true);
    expect(estado).toEqual({ rolls: 3, status: 'counting' });
  });
});

describe('o que o token entrega', () => {
  it('o artefato do destaque, quando o jogador não o tem', () => {
    expect(tokenOutcome(rotativoDePersonagem.token, [])).toEqual({ kind: 'artifact', artifactId: 'art-h', rank: 'hero' });
  });

  it('o fragmento do artefato, quando o jogador já o tem', () => {
    expect(tokenOutcome(rotativoDePersonagem.token, ['art-h'])).toEqual({
      kind: 'artifactDuplicate',
      artifactId: 'art-h',
      rank: 'hero',
      fragmentMaterialId: 'frag-art-h',
    });
  });
});
