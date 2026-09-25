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
// **A restrição que ordenava o M31 foi RESOLVIDA por D50, e é por isso que este arquivo mudou
// de forma no M37.** Ela dizia: o pity não pode crescer antes do pool, porque com pool `N` e
// pity `P` completar o pool custava `N × P` rolagens no pior caso e o excedente virava rolagem
// morta. Os DOIS ANDARES são a saída — o `Adventurer` em 10 é o que preenche o intervalo entre
// dois `Hero` em 90, exatamente como `DECISIONS.md` §6 previu.
//
// **E a conta `N × P` não existe mais**, porque a garantia mudou de promessa: desde D50 ela
// entrega QUALQUER UM daquele rank, não um personagem novo. Não há mais um número de rolagens
// que complete o pool com certeza — o que há é quantas garantias de cada andar a demo alcança,
// que é o que se mede aqui.

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

  it('o pool e os DOIS limiares são os que a medição assume (D50)', () => {
    // Se qualquer um dos três mudar, as contas abaixo deixam de valer — que é exatamente o
    // momento em que alguém precisa ser avisado.
    expect(poolInvocavel()).toEqual([
      'ally-acolito',
      'ally-batedora',
      'ally-couracado',
      'ally-escudeira',
      'ally-grifeiro',
      'ally-guerreiro',
      'ally-lanceiro',
      'ally-machadeira',
      'ally-mensageira',
      'ally-piqueiro',
      'ally-sentinela',
    ]);
    expect(catalogo.premiumRules.summon.pityThresholds).toEqual({ adventurer: 10, hero: 90 });
  });

  it('o pool por RANK — o `Adventurer` é a MAIORIA, que é o desenho de §6', () => {
    // O `Adventurer` é o que preenche o intervalo entre dois `Hero` (DECISIONS.md §6), então
    // um pool com mais `Hero` que `Adventurer` seria o contrário do desenho. Até a 3/N ele
    // estava 3 `Hero` para 2 `Adventurer`; com os seis que D49 autorou, ele inverteu.
    const porRank = new Map<string, number>();
    for (const id of poolInvocavel()) {
      const rank = catalogo.characters[id]!.rank;
      porRank.set(rank, (porRank.get(rank) ?? 0) + 1);
    }

    expect(porRank.get('adventurer')).toBe(8);
    expect(porRank.get('hero')).toBe(3);
    expect(porRank.get('adventurer')!).toBeGreaterThan(porRank.get('hero')!);
  });

  it('quantas rolagens a demo paga, e quantas garantias de cada andar ela alcança', () => {
    const total = premiumDaDemo().total;
    const custo = catalogo.premiumRules.summon.premiumCost;
    const { adventurer, hero } = catalogo.premiumRules.summon.pityThresholds;

    const rolagens = Math.floor(total / custo);

    // M31, com `premiumCost` em 180 (decisão do usuário): a demo paga 49 rolagens.
    expect(rolagens).toBe(49);

    // D50 — **o jogador que zera a demo inteira sem pagar nada alcança 4 garantias de
    // `Adventurer` e NENHUMA de `Hero`**, e isso é o desenho e não um defeito: o `Adventurer`
    // é o que preenche o caminho, e o `Hero` garantido é horizonte pós-demo (§6/§7).
    expect(Math.floor(rolagens / adventurer)).toBe(4);
    expect(Math.floor(rolagens / hero)).toBe(0);
    expect(rolagens).toBeLessThan(hero);
  });

  it('o custo que faria a demo alcançar a PRIMEIRA garantia de `Hero`', () => {
    // O número que a decisão do usuário precisa considerar, derivado e não chutado. Ele NÃO é
    // aplicado aqui: `premiumCost` é número de balanceamento, e a regra 10 exige `pnpm
    // balance` e o relatório, e D18 exige que o número venha do usuário.
    //
    // Substitui a conta antiga (179), que pressupunha a garantia entregando personagem NOVO —
    // premissa que D50 reverteu.
    const total = premiumDaDemo().total;

    expect(Math.floor(total / catalogo.premiumRules.summon.pityThresholds.hero)).toBe(99);
  });
});
