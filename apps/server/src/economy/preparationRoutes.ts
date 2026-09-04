import {
  resolveTalentEffects,
  validateColumnAllocation,
  validateTacticsScript,
  type TacticsScript,
  type TalentAllocation,
} from '@paths-beyond/core';
import type { FastifyPluginAsync } from 'fastify';
import type { EconomyRoutesOptions } from './routes.js';

// §6.3/§8.2 (M18, sub-sessão 7/N) — as rotas de PREPARAÇÃO: script tático e alocação de
// talentos.
//
// Elas existem porque a campanha do cliente passou a ser jogada pelo servidor. Até aqui o
// editor de táticas (M6/M13) e a árvore de talentos (M17 4/N) editavam a party LOCAL e
// remontavam o mapa no próprio cliente; nada disso chegava ao banco. Com a campanha
// passando pelo ticket, quem monta a batalha é o servidor, a partir do que ELE tem — e uma
// edição que não chega nele não se perde só na tela: faz o `POST /campaign/:id/run`
// reexecutar uma batalha diferente da que foi jogada, que é a divergência que §9.1 chama de
// bug crítico.
//
// Nenhuma decisão de jogo mora aqui (regra 3). Quem valida é `packages/core` —
// `validateColumnAllocation` (M17 1/N) e `validateTacticsScript` (7/N). Este arquivo faz
// autorização, resolve o CONTEXTO que cada validador precisa e traduz o "não" do core num
// 400 com motivo.
//
// **Sem `nonce`, e a ausência é deliberada.** As outras rotas de progressão o exigem porque
// COBRAM recurso, e um reenvio de rede cobraria duas vezes. Estas duas não cobram nada: são
// idempotentes por natureza (um PUT que grava o mesmo script duas vezes deixa o mesmo
// script), e exigir chave de idempotência de uma escrita idempotente só criaria 409 onde
// não há nada a proteger.

export const preparationRoutes: FastifyPluginAsync<EconomyRoutesOptions> = async (fastify, opts) => {
  // Herói do jogador, ou o motivo de não ser. **Herói inexistente e herói alheio devolvem o
  // MESMO 403**, de propósito: distinguir os dois transformaria a rota num oráculo de quais
  // ids existem no banco.
  async function heroiDoJogador(heroId: string, playerId: string) {
    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== playerId) return null;
    return stored;
  }

  fastify.put('/heroes/:heroId/talents', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { talents?: TalentAllocation };

    const stored = await heroiDoJogador(heroId, player.id);
    if (!stored) return reply.code(403).send({ error: 'esse herói não é seu' });

    const allocation = body.talents;
    if (!allocation || typeof allocation !== 'object') {
      return reply.code(400).send({ error: 'talents é obrigatório' });
    }

    // §8.1 (M17) — a árvore é do PERSONAGEM. Um herói sem `characterId` (inimigo de fase,
    // ficha de cenário) não tem árvore a alocar, e alocar nele seria escrever num campo que
    // nada resolve.
    const characterId = stored.hero.characterId;
    const tree = characterId ? opts.catalog.characterTalentTrees[characterId] : undefined;
    if (!tree) return reply.code(400).send({ error: 'este herói não tem árvore de talentos' });

    // O `awakening` é o DO HERÓI: §10 tranca nós avançados em awakening 5, e usar um padrão
    // aqui liberaria a todo mundo o nó que o milestone inteiro existe para trancar.
    const resultado = validateColumnAllocation({ tree, allocation, awakening: stored.hero.awakening });
    if (!resultado.valid) {
      return reply.code(400).send({
        error: `alocação inválida: ${resultado.issues.map((issue) => `${issue.nodeId}: ${issue.reason}`).join('; ')}`,
      });
    }

    const updated = { ...stored, hero: { ...stored.hero, talents: { ...allocation } } };
    await opts.heroRepository.updateHero(updated);

    return { hero: updated.hero };
  });

  fastify.put('/heroes/:heroId/tactics', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { tacticsScript?: TacticsScript };

    const stored = await heroiDoJogador(heroId, player.id);
    if (!stored) return reply.code(403).send({ error: 'esse herói não é seu' });

    const script = body.tacticsScript;
    if (!Array.isArray(script)) return reply.code(400).send({ error: 'tacticsScript é obrigatório' });

    // O teto de linhas e de condições é MÓVEL: ele depende dos talentos que ESTE herói tem
    // alocados (§6.3 — "até 3 com talentos"). Resolver os efeitos é o que dá a
    // `extraTacticsSlot`/`extraTacticsCondition` o primeiro consumidor do projeto; eles são
    // resolvidos desde M17 e não faziam nada.
    const characterId = stored.hero.characterId;
    const tree = characterId ? opts.catalog.characterTalentTrees[characterId] : undefined;
    const talentos = resolveTalentEffects(tree?.nodes ?? [], stored.hero.talents);

    // As skills conhecidas saem do próprio herói, na mesma composição que
    // `resolveHeroCombatProfile` usa para montar `knownSkills`. Um catálogo global aqui
    // deixaria uma linha nomear a especial de outra classe.
    const knownSkillIds = [...stored.hero.duelSkills, ...stored.hero.mapSkills, ...talentos.grantedSkillIds];

    const resultado = validateTacticsScript({
      script,
      extraSlots: talentos.extraTacticsSlots,
      extraConditions: talentos.extraTacticsConditions,
      knownSkillIds,
    });
    if (!resultado.valid) {
      return reply.code(400).send({ error: resultado.issues.map((issue) => issue.reason).join('; ') });
    }

    const updated = { ...stored, hero: { ...stored.hero, tacticsScript: [...script] } };
    await opts.heroRepository.updateHero(updated);

    return { hero: updated.hero };
  });
};
