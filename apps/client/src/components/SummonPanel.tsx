import { useState } from 'react';
import type { BannerPoolEntryView, BannerView, SummonOutcome } from '../data/api.js';
import { catalog } from '../data/catalog.js';
import type { Tradutor } from '../i18n/idioma.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { useBattleStore } from '../store/battleStore.js';

// §10/D14/D17/D18 (M18, sub-sessão 6/N) — a tela de AQUISIÇÃO: banner com pity visível,
// roster de personagens, prêmios (conquistas e eventos) e a compra de energia.
//
// M38 4/N (D54/D55/D56) — os TRÊS banners em abas: o destaque e a data de saída do
// rotativo, a taxa BASE de Herói (o soft pity fica escondido no servidor, D56), os dois
// andares de pity, o token de artefato e a escolha do genérico.
//
// Nada aqui decide (regra 3). Quem sorteia é `packages/gacha` no servidor, quem conta o
// pity, o token e a escolha é a conta, e quem diz se um prêmio pode ser reivindicado é
// `rewards/conditions.ts`. O painel desenha o que recebeu e recusa antes de mandar só o que
// já dá para saber que seria recusado.
//
// O nome vem do CATÁLOGO local e não da resposta: os dois lados carregam o mesmo
// `packages/data` desde M9, e é o que permite mostrar a duplicata com nome.
function nomeDoPersonagem(characterId: string): string {
  return catalog.characters[characterId]?.name ?? characterId;
}

function nomeDoArtefato(t: Tradutor, artifactId: string): string {
  return nomeDeConteudo(t, 'artefato', artifactId, catalog.artifacts[artifactId]?.name ?? artifactId);
}

function nomeDoMaterial(t: Tradutor, materialId: string): string {
  return nomeDeConteudo(t, 'material', materialId, catalog.materials[materialId]?.name ?? materialId);
}

function nomeDaEntrada(t: Tradutor, entry: BannerPoolEntryView): string {
  return entry.artifactId !== undefined ? nomeDoArtefato(t, entry.artifactId) : nomeDoPersonagem(entry.characterId);
}

// O destaque de um rotativo é personagem ou artefato conforme o tipo do banner.
function nomeDoDestaque(t: Tradutor, banner: BannerView): string | null {
  if (!banner.featuredId) return null;
  return banner.kind === 'rotatingArtifact' ? nomeDoArtefato(t, banner.featuredId) : nomeDoPersonagem(banner.featuredId);
}

function descreverDesfecho(t: Tradutor, outcome: SummonOutcome): string {
  switch (outcome.kind) {
    case 'character':
      return t('summon.recrutou', { personagem: nomeDoPersonagem(outcome.characterId) });
    case 'duplicate':
      return t('summon.repetido', {
        personagem: nomeDoPersonagem(outcome.characterId),
        material: nomeDoMaterial(t, outcome.fragmentMaterialId),
      });
    case 'artifact':
      return t('summon.ganhouArtefato', { artefato: nomeDoArtefato(t, outcome.artifactId) });
    case 'artifactDuplicate':
      return t('summon.artefatoRepetido', {
        artefato: nomeDoArtefato(t, outcome.artifactId),
        material: nomeDoMaterial(t, outcome.fragmentMaterialId),
      });
  }
}

// D49/D50 — a ordem em que as duas garantias aparecem, e o rótulo de cada uma pela camada
// de idioma (M25: nenhum nome de rank escrito à mão na tela).
const RANKS_NA_TELA = ['hero', 'adventurer'] as const;

const ROTULO_DE_RANK: Readonly<Record<(typeof RANKS_NA_TELA)[number], string>> = {
  hero: 'summon.rankHero',
  adventurer: 'summon.rankAdventurer',
};

// A data de saída do rotativo, na língua da tela. O servidor manda ISO em UTC; mostrar no
// fuso do jogador é apresentação, não regra.
function formatarData(iso: string, idioma: string): string {
  // Com a hora: a janela fecha à meia-noite UTC, que no fuso do jogador pode ser a noite do
  // dia anterior — só a data dizia "8 de outubro" para uma janela que o dado declara até o dia 9.
  return new Date(iso).toLocaleString(idioma === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BannerAberto({ banner }: { readonly banner: BannerView }) {
  const summon = useBattleStore((s) => s.summon);
  const t = useBattleStore((s) => s.t);
  const idioma = useBattleStore((s) => s.idioma);
  const rollSummon = useBattleStore((s) => s.rollSummon);
  const resgatarEscolha = useBattleStore((s) => s.resgatarEscolha);

  const escolhiveis = banner.pool.filter((entry) => entry.rank === 'hero');
  const [alvo, setAlvo] = useState<string>('');
  const semSaldo = summon.premium < banner.premiumCost;
  const destaque = nomeDoDestaque(t, banner);
  // D56 — a taxa BASE, em milésimos: 6 é 0,6%. É a única parte da curva que a tela conhece.
  const taxa = (banner.baseRate / 10).toLocaleString(idioma === 'pt' ? 'pt-BR' : 'en-US');

  return (
    <div className="summon-banner">
      <h3>{nomeDeConteudo(t, 'banner', banner.id, banner.name)}</h3>
      {banner.activeUntil ? <p className="hint">{t('summon.saiEm', { data: formatarData(banner.activeUntil, idioma) })}</p> : null}
      <p className="summon-taxa">{t('summon.taxaBase', { taxa })}</p>

      {/* D18/D50 — o pity é DURO e tem DOIS ANDARES, com contadores independentes. */}
      {RANKS_NA_TELA.map((rank) => {
        const teto = banner.pityThresholds[rank];
        const atual = banner.rollsSince[rank];
        // D55 — o limiar N garante a N-ésima rolagem: faltam `teto − atual`, e com uma só a
        // próxima é a garantida. Subtração de exibição, não regra.
        const faltam = Math.max(1, teto - atual);
        return (
          <p key={rank} className="summon-pity">
            {t('summon.pity', {
              rank: t(ROTULO_DE_RANK[rank]),
              atual,
              teto,
              estado: faltam === 1 ? t('summon.pityPronto') : t('summon.pityFaltam', { faltam }),
            })}
          </p>
        );
      })}

      {/* M38 — o token de 1,5·P, por banner. Pendente é o caso de ter batido o limiar sem o
          destaque: a tela diz o que falta para recebê-lo, em vez de deixá-lo parecer perdido. */}
      {banner.token ? (
        <p className="summon-token">
          {banner.token.status === 'counting'
            ? t('summon.token', {
                atual: banner.token.rolls,
                teto: banner.token.threshold,
                artefato: nomeDoArtefato(t, banner.token.artifactId),
              })
            : banner.token.status === 'pending'
              ? t('summon.tokenPendente', { destaque: destaque ?? '', artefato: nomeDoArtefato(t, banner.token.artifactId) })
              : t('summon.tokenRecebido', { artefato: nomeDoArtefato(t, banner.token.artifactId) })}
        </p>
      ) : null}

      {/* D54/D55 — a escolha do genérico a cada 180 rolagens, de qualquer Herói ou artefato
          `hero` do pool dele. */}
      {banner.choice ? (
        <div className="summon-escolha">
          <p>
            {t('summon.escolha', { atual: banner.choice.rolls, teto: banner.choice.every, pendentes: banner.choice.pending })}
          </p>
          {banner.choice.pending > 0 ? (
            <span className="pve-actions">
              <select value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label={t('summon.escolherAlvo')}>
                <option value="">{t('summon.escolherAlvo')}</option>
                {escolhiveis.map((entry) => {
                  const id = entry.artifactId ?? entry.characterId;
                  return (
                    <option key={id} value={id}>
                      {nomeDaEntrada(t, entry)}
                    </option>
                  );
                })}
              </select>
              <button type="button" disabled={summon.busy || alvo === ''} onClick={() => void resgatarEscolha(banner.id, alvo)}>
                {t('summon.resgatar')}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="summon-pool">
        {t('summon.noBanner', { personagens: banner.pool.map((entry) => nomeDaEntrada(t, entry)).join(', ') })}
      </p>
      <button type="button" onClick={() => void rollSummon(banner.id)} disabled={summon.busy || semSaldo}>
        {t('summon.invocar', { custo: banner.premiumCost })}
      </button>
    </div>
  );
}

export function SummonPanel() {
  const summon = useBattleStore((s) => s.summon);
  const t = useBattleStore((s) => s.t);
  const claimReward = useBattleStore((s) => s.claimReward);
  const purchaseEnergy = useBattleStore((s) => s.purchaseEnergy);

  // A aba aberta é seleção de tela, não estado de conta.
  const [abaEscolhida, setAbaEscolhida] = useState<string | null>(null);
  const aberto = summon.banners.find((b) => b.id === abaEscolhida) ?? summon.banners[0] ?? null;

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

      <div className="summon-abas" role="tablist">
        {summon.banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            role="tab"
            aria-selected={aberto?.id === banner.id}
            className={aberto?.id === banner.id ? 'ativa' : ''}
            onClick={() => setAbaEscolhida(banner.id)}
          >
            {nomeDeConteudo(t, 'banner', banner.id, banner.name)}
          </button>
        ))}
      </div>
      {aberto ? <BannerAberto key={aberto.id} banner={aberto} /> : null}

      {summon.lastResult && summon.lastResultBannerId === aberto?.id ? (
        <div className="summon-result">
          <p>
            {descreverDesfecho(t, summon.lastResult.outcome)}
            {/* D50 — a garantia pode terminar em DUPLICATA, porque ela promete o rank e não a
                novidade. Dizer qual disparou impede ler a duplicata como falha da garantia. */}
            {summon.lastResult.guaranteed ? (
              <span className="summon-garantia">
                {' '}
                {t('summon.pelaGarantia', { rank: t(ROTULO_DE_RANK[summon.lastResult.guaranteed]) })}
              </span>
            ) : null}
          </p>
          {(summon.lastResult.tokenGrants ?? []).map((entregue, index) => (
            <p key={index} className="summon-token-entregue">
              {t('summon.tokenEntregou', { desfecho: descreverDesfecho(t, entregue) })}
            </p>
          ))}
        </div>
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
