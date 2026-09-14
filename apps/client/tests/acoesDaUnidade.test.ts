import { describe, expect, it } from 'vitest';
import { acoesDaUnidade } from '../src/logic/acoesDaUnidade.js';

// M35 1/N — o inimigo selecionado mostra a FICHA, e nenhuma ação (D44).
//
// Visto na tela com sessão de verdade (M32 2/N): clicar em `unit-alvo-1` na lista de iniciativa
// abria Esperar, Descansar, Editar táticas, Inventário e Talentos — os cinco botões da unidade
// do jogador, para uma unidade que o jogador não comanda. O core já recusaria o comando
// (`lastCommandReason`), mas a tela oferecia, e é harness: um estranho clica e lê um erro.
//
// A decisão é uma função pura sobre o lado da unidade, e não um `if` no JSX, pelo motivo de
// sempre: o que este projeto testa é a lógica, e `UnitActionBar` só existe montado.

describe('acoesDaUnidade — o que a barra oferece por lado (M35 1/N)', () => {
  it('unidade do jogador: as cinco ações, nesta ordem', () => {
    expect(acoesDaUnidade('player')).toEqual(['esperar', 'descansar', 'editarTaticas', 'inventario', 'talentos']);
  });

  it('unidade inimiga: NENHUMA — só a ficha', () => {
    expect(acoesDaUnidade('enemy')).toEqual([]);
  });
});
