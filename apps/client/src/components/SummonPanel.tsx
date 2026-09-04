import { catalog } from '../data/catalog.js';
import { useBattleStore } from '../store/battleStore.js';

// §10/D14/D17/D18 (M18, sub-sessão 6/N) — a tela de AQUISIÇÃO: banner com pity visível,
// roster de personagens, prêmios (conquistas e eventos) e a compra de energia.
//
// Nada aqui decide (regra 3). Quem sorteia é `packages/gacha` no servidor, quem conta o
// pity é a conta e quem diz se um prêmio pode ser reivindicado é `rewards/conditions.ts`.
// O painel desenha o que recebeu e recusa antes de mandar só o que já dá para saber que
// seria recusado — saldo insuficiente e prêmio indisponível.
//
// O nome do personagem vem do CATÁLOGO local e não da resposta quando dá: os dois lados
// carregam o mesmo `packages/data` desde M9, e é o que permite mostrar a duplicata com
// nome mesmo antes de o roster ser relido.
function nomeDoPersonagem(characterId: string): string {
  return catalog.characters[characterId]?.name ?? characterId;
}

function nomeDoMaterial(materialId: string): string {
  return catalog.materials[materialId]?.name ?? materialId;
}

export function SummonPanel() {
  const summon = useBattleStore((s) => s.summon);
  const pvp = useBattleStore((s) => s.pvp);
  const refreshSummon = useBattleStore((s) => s.refreshSummon);
  const rollSummon = useBattleStore((s) => s.rollSummon);
  const claimReward = useBattleStore((s) => s.claimReward);
  const purchaseEnergy = useBattleStore((s) => s.purchaseEnergy);

  if (!pvp.me) {
    return (
      <section className="summon-panel">
        <h2>Invocação</h2>
        <p className="hint">Conecte-se no painel de PvP com o seu token para invocar.</p>
      </section>
    );
  }

  const possuidos = summon.characters.filter((character) => character.owned).length;

  return (
    <section className="summon-panel">
      <h2>Invocação</h2>

      <div className="pve-actions">
        <button type="button" onClick={() => void refreshSummon()} disabled={summon.busy}>
          Atualizar
        </button>
      </div>

      <p className="summon-premium">
        Moeda premium <strong>{summon.premium}</strong> · {possuidos}/{summon.characters.length} personagens
      </p>

      {summon.banners.map((banner) => {
        const faltam = Math.max(0, banner.pityThreshold - banner.rollsSinceNew);
        const semSaldo = summon.premium < banner.premiumCost;

        return (
          <div key={banner.id} className="summon-banner">
            <h3>{banner.name}</h3>
            {/* D18 — o pity é DURO: depois de N rolagens sem personagem novo, a N+1 é
                garantida. Mostrar o contador é o que torna a garantia jogável em vez de
                uma promessa invisível. */}
            <p className="summon-pity">
              Pity <strong>{banner.rollsSinceNew}</strong>/{banner.pityThreshold} ·{' '}
              {faltam === 0 ? 'a próxima é garantida' : `garantido em ${faltam} rolagem(ns)`}
            </p>
            <p className="summon-pool">
              No banner: {banner.pool.map((entry) => nomeDoPersonagem(entry.characterId)).join(', ')}
            </p>
            <button type="button" onClick={() => void rollSummon(banner.id)} disabled={summon.busy || semSaldo}>
              Invocar ({banner.premiumCost})
            </button>
          </div>
        );
      })}

      {summon.lastResult ? (
        <p className="summon-result">
          {summon.lastResult.outcome.kind === 'character' ? (
            <>
              Você recrutou <strong>{nomeDoPersonagem(summon.lastResult.outcome.characterId)}</strong>.
            </>
          ) : (
            <>
              Repetido: <strong>{nomeDoPersonagem(summon.lastResult.outcome.characterId)}</strong> virou 1{' '}
              {nomeDoMaterial(summon.lastResult.outcome.fragmentMaterialId)}.
            </>
          )}
        </p>
      ) : null}

      <h3>Elenco</h3>
      <ul className="summon-roster">
        {summon.characters.map((character) => (
          <li key={character.id} className={character.owned ? '' : 'locked'}>
            <span className="summon-character-name">{character.name}</span>
            <span className="pve-locked">
              {character.owned ? (character.fromStory ? 'história' : 'recrutado') : 'não recrutado'}
            </span>
          </li>
        ))}
      </ul>

      <h3>Prêmios</h3>
      <ul className="summon-rewards">
        {summon.rewards.map((reward) => (
          <li key={reward.id} className={reward.claimed ? 'locked' : ''}>
            <span className="summon-reward-name">
              {reward.name} <span className="pve-locked">({reward.premium})</span>
            </span>
            {reward.claimed ? (
              <span className="pve-locked">reivindicado</span>
            ) : (
              <button type="button" onClick={() => void claimReward(reward.id)} disabled={summon.busy || !reward.claimable}>
                {/* Evento fora da janela e condição não cumprida são estados diferentes, e
                    é o servidor quem os separa — derivar aqui exigiria o relógio do
                    cliente, que não decide nada neste projeto. */}
                {reward.kind === 'event' && reward.windowOpen === false ? 'fora da janela' : 'Reivindicar'}
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Energia</h3>
      <div className="pve-actions">
        <button type="button" onClick={() => void purchaseEnergy()} disabled={summon.busy}>
          Comprar energia
        </button>
      </div>

      {summon.status ? <p className="pve-status">{summon.status}</p> : null}
      {summon.error ? <p className="error">{summon.error}</p> : null}
    </section>
  );
}
