import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// M35 1/N — nenhum painel do hub tem botão de "atualizar" (D41).
//
// Até o M32 cada painel nascia vazio e esperava um clique em "Atualizar" para ler o servidor —
// harness puro, e o primeiro achado do M32 2/N com sessão de verdade. O sign-in passou a
// carregar o hub inteiro (`carregarHub`) e cada ação que muda estado relê o que mudou.
// Recarregar é problema do cliente, nunca gesto do jogador.
//
// Varredura de fonte, como `acaoPrincipal.test.ts`: um botão ligado a uma leitura pura
// (`refreshCampaign`, `refreshPve`, `refreshSummon`, `lerInvocacao`, `carregarHub`) é o que
// este teste proíbe. As leituras continuam existindo — a store as chama; a tela não.

const COMPONENTES = join(import.meta.dirname, '..', 'src', 'components');
const LEITURAS = ['refreshCampaign', 'refreshPve', 'refreshSummon', 'lerInvocacao', 'carregarHub', 'loadDefense'];

describe('nenhum componente liga botão a uma leitura do servidor', () => {
  for (const arquivo of readdirSync(COMPONENTES).filter((f) => f.endsWith('.tsx'))) {
    it(arquivo, () => {
      const fonte = readFileSync(join(COMPONENTES, arquivo), 'utf8');
      for (const leitura of LEITURAS) {
        expect(fonte, `${arquivo} usa ${leitura}`).not.toContain(`s.${leitura}`);
        expect(fonte, `${arquivo} chama ${leitura}`).not.toContain(`${leitura}(`);
      }
    });
  }
});
