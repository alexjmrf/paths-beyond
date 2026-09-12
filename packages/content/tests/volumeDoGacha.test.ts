import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// M31 — quanto a demo paga, MEDIDO do catálogo.
//
// **Por que isto é um teste e não um comentário.** O número que motivou a milestone (≈8.950
// premium, 17 rolagens) foi calculado à mão numa auditoria. Número calculado à mão envelhece
// no primeiro commit de conteúdo: acrescentar uma missão, uma masmorra ou uma conquista muda o
// total e **nada reclama** — e o próximo a ler a auditoria acredita nela.
//
// A diferença entre uma asserção e um comentário é essa: aqui, o dia em que o conteúdo mudar,
// este arquivo fica vermelho dizendo o número novo. Quem mexeu decide se o volume ainda serve;
// o que não acontece é passar em silêncio.
//
// **A restrição que ordena a milestone, e que contraria a intuição:** o pity NÃO pode crescer
// antes do pool crescer. Com pool `N` e pity `P`, completar o pool custa `N × P` rolagens no
// pior caso, e `pool esgotado congela o contador de pity` (M18 1/N) — então excedente vira
// rolagem morta. É por isso que o pity maior fica para o M34, junto do elenco novo, e o que
// esta fatia mexe é o CUSTO.

const catalogo = loadCatalogFromDisk();

interface ComPremium {
  readonly premium?: number;
}

/** Todo premium que a demo paga a quem joga tudo uma vez, sem gastar dinheiro real. */
function premiumDaDemo() {
  const recompensas = catalogo.premiumRules.premiumRewards;

  const missoes = catalogo.encounters.length * recompensas.missionFirstClear;
  const capitulos = catalogo.chapters.length * recompensas.chapterFirstClear;
  const masmorras = Object.keys(catalogo.dungeons).length * recompensas.dungeonFirstClear;
  const conquistas = Object.values(catalogo.achievements as Readonly<Record<string, ComPremium>>)
    .reduce((soma, a) => soma + (a.premium ?? 0), 0);
  const eventos = Object.values(catalogo.events as Readonly<Record<string, ComPremium>>)
    .reduce((soma, e) => soma + (e.premium ?? 0), 0);

  return { missoes, capitulos, masmorras, conquistas, eventos, total: missoes + capitulos + masmorras + conquistas + eventos };
}

/** O pool invocável: quem NÃO vem pela história (D14). */
function poolInvocavel(): readonly string[] {
  return Object.values(catalogo.characters)
    .filter((personagem) => personagem.acquisition !== 'story')
    .map((personagem) => personagem.id)
    .sort();
}

describe('o volume do gacha na demo', () => {
  it('a demo paga exatamente o que esta medição diz', () => {
    // As cinco parcelas separadas de propósito: quando o total mudar, a linha que mudou diz
    // qual conteúdo entrou, em vez de deixar a diferença para alguém procurar.
    const p = premiumDaDemo();

    expect(p.missoes, '30 missões × 60 (D31)').toBe(1_800);
    expect(p.capitulos, '3 capítulos × 300 (D31)').toBe(900);
    expect(p.masmorras, '8 masmorras × 200').toBe(1_600);
    expect(p.conquistas, 'as 10 conquistas').toBe(3_750);
    expect(p.eventos, 'os 2 eventos').toBe(900);
    expect(p.total).toBe(8_950);
  });

  it('o pool e o pity são os que a restrição assume', () => {
    // `N` e `P`. Se qualquer um dos dois mudar, o pior caso muda junto e a conta da fatia
    // deixa de valer — que é exatamente o momento em que alguém precisa ser avisado.
    expect(poolInvocavel()).toEqual([
      'ally-couracado',
      'ally-grifeiro',
      'ally-guerreiro',
      'ally-lanceiro',
      'ally-mensageira',
    ]);
    expect(catalogo.premiumRules.summon.pityThreshold).toBe(10);
  });

  it('quantas rolagens a demo paga, e quantas o pool exige', () => {
    const total = premiumDaDemo().total;
    const custo = catalogo.premiumRules.summon.premiumCost;

    const rolagens = Math.floor(total / custo);
    const exigidas = poolInvocavel().length * catalogo.premiumRules.summon.pityThreshold;

    // M31, com `premiumCost` em 180 (decisão do usuário): a demo paga 49 rolagens contra as
    // 50 do PIOR caso de completar o pool. 50 é o teto do azar — o pity só entra quando a
    // sorte não veio —, então na prática o pool completa perto do fim e o gacha continua
    // sendo uma decisão até lá. Antes eram 17, e o jogador que zerasse a demo inteira sem
    // pagar nada podia terminar com dois dos cinco.
    expect(rolagens).toBe(49);
    expect(exigidas).toBe(50);
    expect(rolagens).toBeLessThanOrEqual(exigidas);
  });

  it('o custo que faria a demo pagar o pool inteiro', () => {
    // O número que a decisão do usuário precisa considerar, derivado e não chutado. Ele NÃO é
    // aplicado aqui: `premiumCost` é número de balanceamento, e a regra 10 exige `pnpm
    // balance` e o relatório, e D18 exige que o número venha do usuário.
    const total = premiumDaDemo().total;
    const exigidas = poolInvocavel().length * catalogo.premiumRules.summon.pityThreshold;

    expect(Math.floor(total / exigidas)).toBe(179);
  });
});
