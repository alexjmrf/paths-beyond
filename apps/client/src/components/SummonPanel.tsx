import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
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
  const t = useBattleStore((s) => s.t);
  const pvp = useBattleStore((s) => s.pvp);
  const rollSummon = useBattleStore((s) => s.rollSummon);
  const claimReward = useBattleStore((s) => s.claimReward);
  const purchaseEnergy = useBattleStore((s) => s.purchaseEnergy);

  const possuidos = summon.characters.filter((character) => character.owned).length;

  return (
    <section className="summon-panel">
      <h2>{t('summon.titulo')}</h2>

      <p className="summon-premium">
        {t('summon.premium', {
          premium: summon.premium,
          possuidos,
          total: summon.characters.length,
        })}
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
              {t('summon.pity', {
                atual: banner.rollsSinceNew,
                teto: banner.pityThreshold,
                estado: faltam === 0 ? t('summon.pityPronto') : t('summon.pityFaltam', { faltam }),
              })}
            </p>
            <p className="summon-pool">
              {t('summon.noBanner', {
                personagens: banner.pool.map((entry) => nomeDoPersonagem(entry.characterId)).join(', '),
              })}
            </p>
            <button type="button" onClick={() => void rollSummon(banner.id)} disabled={summon.busy || semSaldo}>
              {t('summon.invocar', { custo: banner.premiumCost })}
            </button>
          </div>
        );
      })}

      {summon.lastResult ? (
        <p className="summon-result">
          {summon.lastResult.outcome.kind === 'character'
            ? t('summon.recrutou', {
                personagem: nomeDoPersonagem(summon.lastResult.outcome.characterId),
              })
            : t('summon.repetido', {
                personagem: nomeDoPersonagem(summon.lastResult.outcome.characterId),
                material: nomeDoMaterial(summon.lastResult.outcome.fragmentMaterialId),
              })}
        </p>
      ) : null}

      <h3>{t('summon.elenco')}</h3>
      <ul className="summon-roster">
        {summon.characters.map((character) => (
          <li key={character.id} className={character.owned ? '' : 'locked'}>
            <span className="summon-character-name">{character.name}</span>
            <span className="pve-locked">
              {character.owned
                ? character.fromStory
                  ? t('summon.historia')
                  : t('summon.recrutado')
                : t('summon.naoRecrutado')}
            </span>
          </li>
        ))}
      </ul>

      <h3>{t('summon.premios')}</h3>
      <ul className="summon-rewards">
        {summon.rewards.map((reward) => (
          <li key={reward.id} className={reward.claimed ? 'locked' : ''}>
            <span className="summon-reward-name">
              {nomeDeConteudo(t, 'premio', reward.id, reward.name)}{' '}
              <span className="pve-locked">({reward.premium})</span>
            </span>
            {reward.claimed ? (
              <span className="pve-locked">{t('summon.reivindicado')}</span>
            ) : (
              <button type="button" onClick={() => void claimReward(reward.id)} disabled={summon.busy || !reward.claimable}>
                {/* Evento fora da janela e condição não cumprida são estados diferentes, e
                    é o servidor quem os separa — derivar aqui exigiria o relógio do
                    cliente, que não decide nada neste projeto. */}
                {reward.kind === 'event' && reward.windowOpen === false
                  ? t('summon.foraDaJanela')
                  : t('summon.reivindicar')}
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>{t('summon.energia')}</h3>
      <div className="pve-actions">
        <button type="button" onClick={() => void purchaseEnergy()} disabled={summon.busy}>
          {t('summon.comprarEnergia')}
        </button>
      </div>

      {summon.status ? <p className="pve-status">{summon.status}</p> : null}
      {summon.error ? <p className="error">{summon.error}</p> : null}
    </section>
  );
}
