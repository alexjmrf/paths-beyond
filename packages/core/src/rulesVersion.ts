// §01-fundacoes-tecnicas.md §3.3 / regra 11 do CLAUDE.md — "toda mudança de regra
// incrementa rulesVersion." Vive em `packages/core` (não em package.json, que não é
// legível em runtime no browser) porque core É a definição das regras; cliente, sim-cli
// e servidor todos dependem de core, então todos leem a mesma constante — nunca cada um
// mantendo sua própria cópia. Bump manual sempre que uma regra mudar.
//
// D4 (M9, docs/milestones/M9-integracao-de-conteudo.md): primeiro bump real desde M0 —
// nunca foi exercido em 8 milestones apesar da regra 11, apesar de o servidor já
// validar replay/anti-cheat contra este campo desde M7 (nunca invalidava nada de
// verdade). M9 é o momento certo pra começar a exercer a regra: é quando cliente,
// servidor e sim-cli passam a compartilhar a mesma fonte de conteúdo real pela primeira
// vez, então uma mudança de valor aqui agora tem efeito observável de verdade (anti-cheat
// rejeitando replay de versão desatualizada). Não representa uma mudança de mecânica de
// M9 em si (M9 é só integração — "nenhuma mecânica nova") — é a auditoria fechando uma
// lacuna de disciplina de processo. Rebaseia a contagem em vez de tentar reconstruir
// retroativamente 8 incrementos que nunca aconteceram.
//
// M10, sub-sessão 1/N: skill.effects passou a ser aplicado dentro de resolveDuel (era
// mecanicamente inerte desde M2 — ver DECISIONS.md). Mudança de regra real, não de
// integração: GOLDEN_HASH em crossRuntime.test.ts mudou no mesmo commit (protocolo
// documentado no próprio teste).
//
// M10, sub-sessão 2/N: assistência (§6.5.3) passa a causar dano de verdade a HP (era
// decisão-only desde M2 — resolveAssists decidia QUEM assistia, nunca aplicava o
// dano). Mudança de regra real mesmo GOLDEN_HASH não tendo mudado desta vez — o
// replay canônico não exercita nenhum assistente com trigger onAllyEngagedNearby de
// verdade (achado desta sub-sessão, gap pré-existente da fixture, não corrigido aqui
// por estar fora de escopo). `pnpm balance` também não muda: os 9 comps reais de M8
// são de 1 unidade só, sem aliado pra assistir.
//
// M10, sub-sessão 3/N: DoT/regeneração (§6.9) passam a tickar de verdade em
// `battle/round.ts` (`periodicDamagePct`/`periodicHealPct` existiam no schema desde a
// sub-sessão 1, mas nunca eram lidos — mecanicamente inertes). Mudança de regra real
// mesmo GOLDEN_HASH não tendo mudado desta vez — o replay canônico não tem nenhum
// efeito com campo periódico, e nenhum conteúdo real de `packages/data` declara esses
// campos ainda (só `test-fixtures/`). `pnpm balance` também byte-a-byte idêntico pelo
// mesmo motivo.
// M10, sub-sessão 4/N: quais reações uma unidade tem deixou de ser derivado do `kind` da
// skill e passou a ser explícito no dado (`SkillDef.baseline`). §6.4 fecha a lista de
// reações universais em duas (Contra-atacar, Defender) e diz que o resto vem de classe ou
// talento; a derivação de M9 ("toda skill kind:'reaction' é baseline") só estava certa
// enquanto essas duas eram as únicas reações do catálogo. Com `skill-assistir` no
// catálogo, a regra antiga daria assistência de graça a toda unidade. Mudança de regra
// real e observável: o `reactionScript` resolvido por `combatProfile.ts` muda.
// M10, sub-sessão 5/N: `onDamaged` e `onDebuffed` (§6.4) passam a ser resolvidos dentro do
// duelo — antes só `onAttacked` (M2) e `onAllyEngagedNearby` (assistências) eram. Mudança
// de regra real; não observável em `pnpm balance` nem no `GOLDEN_HASH` porque nenhuma skill
// do catálogo real (nem a fixture do replay canônico) declara esses triggers ainda.
// `onLethal` continua sem resolução, por decisão de design registrada em DECISIONS.md.
// M10, sub-sessão 6/N: os 4 efeitos `special` de set (§7.4) deixam de ser inertes —
// Duelista (contra-atacar de graça na troca 1), Imunidade (sem debuff na troca 1), Reserva
// (+1 AP inicial, `rest` recupera 2 AP) e Sentinela (uma assistência de graça por round de
// mapa). Mudança de regra real em quatro pontos do motor (resolveDuel, applyRest,
// buildAssistCandidates, combatProfile). Não observável em `pnpm balance` nem no
// GOLDEN_HASH: os 4 sets existem em packages/data mas nenhum item pertence a eles, então
// nenhuma unidade de conteúdo real ou do replay canônico tem os efeitos ativos.
// M10, sub-sessão 7/N: cura passa a existir no motor. A spec não tinha fórmula nenhuma
// (§2 só lista `heal` como "cura dada/recebida, %"; §6.5.3 diz "cura/buff em efeito
// integral" sem dizer integral de quê), então a fórmula é decisão de design registrada em
// DECISIONS.md: multiplier × stat de `scalesWith` + flat, modificada pelo `heal` de quem
// cura, sem mitigação/triângulo/posicional e sem crítico nem variância. Três caminhos
// ligados: assistência de cura (cura o aliado duelista, SEM o corte de 50% do dano), skill
// de duelo com a tag `heal` (auto-cura) e reação com a tag `heal` ("Cura de emergência",
// §6.4). Mudança de regra real; não observável em `pnpm balance` nem no GOLDEN_HASH porque
// nenhuma skill do catálogo real declara a tag.
// M10, sub-sessão 8/N: `onLethal` (§6.4) deixa de ser a única variante de ReactionTrigger
// sem resolução — o enum fecha. NÃO entrou como reação: é gatilho automático de morte, sem
// script, sem conditions e sem PP (decisão de design do usuário registrada em DECISIONS.md
// — reagir à própria morte implicaria prevê-la). Duas variantes discriminadas pela tag
// `survive`: prevenir a morte (fica com 1 HP) ou acertar quem deu o golpe fatal com dano +
// `skill.effects`. Frequência declarada no dado (`SkillDef.lethalUses`). Mudança de regra
// real em todos os caminhos de dano do duelo e no tick de DoT de `battle/round.ts`; não
// observável em `pnpm balance` nem no GOLDEN_HASH porque nenhuma skill do catálogo real
// (nem a fixture do replay canônico) declara `trigger:'onLethal'`.
// M11, sub-sessão 1/N: as 4 condições de vitória além de `rout` (§5.7) passam a ter
// resolução — `seize`, `surviveRounds`, `escort` e `defend` tinham schema desde M3 e
// nenhuma checagem, o que obrigava todo mapa a ser "mate todo mundo". Mudança de regra
// real e com uma quebra deliberada: eliminar o time inimigo **não vence mais** um mapa
// cuja condição declarada é outra ("data-driven por mapa" lido ao pé da letra). `defend`
// ganhou `target` no schema — sem ele seria sinônimo de `surviveRounds`. Não observável em
// `pnpm balance` nem no GOLDEN_HASH: todo conteúdo real (4 mapas) e o replay canônico usam
// `rout`, cujo comportamento é idêntico ao de antes.
// M11, sub-sessão 2/N: `mapSkill` passa a ter alvo em área (§5.4). `applyMapSkill`
// ignorava `cmd.target` desde M3 e só aplicava efeito em `target:'self'`; agora lê o alvo,
// checa alcance de lançamento (`skill.duelRange`, senão o da unidade), seleciona quem está
// no raio Manhattan (`SkillDef.areaRadius`) e aplica dano/cura/efeitos. Quem a área atinge
// é derivado do que a skill faz — tag `heal` → aliados, dano → inimigos, efeito → pelo
// `EffectDef.kind`. Mudança de regra real; o caminho `target:'self'` de M3 ficou intacto,
// stream de RNG incluído. Não observável em `pnpm balance` nem no GOLDEN_HASH: nenhuma
// skill do catálogo real declara `areaRadius`, e o torneio não usa `mapSkill`.
// M11, sub-sessão 3/N: `useValor` (§5.6) resolve de verdade contra um catálogo. Até aqui
// o comando IGNORAVA o `skillId` e debitava um custo fixo de 1 sem aplicar efeito nenhum.
// Três dos quatro `kind` têm resolução — `restoreApPp` (devolve AP/PP à unidade no tile),
// `artillery` (dano fixo mitigado por `def`, em área) e `globalBuff` (efeito de 1 round em
// todo aliado vivo); `summonReinforcement` rejeita alto em vez de gastar Valor em silêncio
// (fatia própria, ver DECISIONS.md). `BattleSetup`/`BattleState` ganharam `valorSkills`
// (opcional) e o `payload` do schema virou união discriminada por `kind`. Mudança de regra
// real; não observável em `pnpm balance` (o torneio nunca emite `useValor`) nem no
// GOLDEN_HASH (o replay canônico também não).
// M14, sub-sessão 1/N: a economia PvE de §10 entra no motor — energia de conta
// (regeneração contínua até um teto, derivada de `{stored, asOfMs}` + o instante que o
// chamador passa, porque core não lê relógio), rolagem de recompensa de masmorra
// (determinística por seed + id da run, com stream próprio por tipo de drop), aquisição de
// awakening (materiais + ouro, teto 6) e de imprint (fragmento do próprio herói, teto 5).
// Mudança de regra real também em `validateAllocation`, que passa a respeitar
// `TalentNode.minAwakening` (§10 — "libera nós avançados de talento a partir de 5"), o
// único ponto desta fatia que altera comportamento de código pré-existente: o campo é
// opcional e nenhum nó do catálogo real o declara ainda, então nenhuma alocação existente
// muda de resultado. Não observável em `pnpm balance` nem no GOLDEN_HASH — o torneio e o
// replay canônico não farmam, não despertam e não alocam talento com gate.
// M14, sub-sessão 2/N: a masmorra vira BATALHA (decisão do usuário). Três regras novas:
// calendário civil próprio (conversão instante↔data sem `Date`, porque regra 1 proíbe e
// porque `Date` é sensível ao fuso do processo — cliente, servidor e `sim-cli` precisam
// concordar byte a byte), trava de entrada por tempo derivada dele (a entrada da
// dificuldade alta reseta em dias declarados da semana ou do mês) e `resolveAutoBattle`, a
// varredura: a IA de mapa de §9.1 jogando os DOIS lados até o desfecho, que é o que faz
// "o time automático ainda tem de ser forte o bastante" sair da própria simulação em vez
// de um número de dificuldade. Nada de comportamento pré-existente mudou; não observável
// em `pnpm balance` nem no GOLDEN_HASH.
// M15, sub-sessão 1/N: as quatro pendências de motor que o briefing de M15
// (`docs/milestones/M15-fechamento-do-loop-de-pvp.md`) qualificou como regra declarada sem
// consumidor. (1) `lifesteal` (§4.1) passa a curar quem bate, como fração do dano
// EFETIVAMENTE aplicado a HP, no ponto único por onde dano vira HP no duelo — o stat existia
// desde M1 e nada o lia. (2) `summonReinforcement` (§5.6) resolve: o payload nomeia um
// blueprint de `BattleSetup.summonBlueprints` (a unidade invocada é conteúdo, regra 4) e a
// invocada é INSERIDA na lista de iniciativa, que é o que §5.3 autoriza explicitamente para
// reforços — a regra 9 continua valendo, nenhuma entrada existente é re-rolada nem
// reordenada. (3) "+2 Valor ao capturar objetivo" (§5.6) ganha ponto de aplicação: encerrar
// o turno sobre `fort`/`camp`, uma vez por tile por batalha, só para o jogador. (4)
// `Tile.object` (§5.1): `wall` e `gate` passam a bloquear movimento, `chest` sai do tipo, e o
// portão abre por um lado e quebra pelo outro (`wait` adjacente; requisito do usuário).
// Não observável em `pnpm balance` nem no GOLDEN_HASH: o torneio e o replay canônico têm
// `lifesteal: 0` em todo stat sheet, nenhum mapa com `object` e nenhum `useValor`.
// M15, sub-sessão 2/N: o conteúdo de D2/D3 entrou, e trouxe UMA regra nova junto — o portão
// TRANCADO (`GateOpensFor: 'none'`), em que ninguém tem a chave e os dois lados só passam
// arrombando. Não foi preferência: com o portão abrindo para um lado, a IA de mapa daquele
// lado caminha até ele e o `wait` do mesmo turno o destranca, então a fortaleza do capítulo 6
// amanhecia aberta no round 1 e a durabilidade era decoração (medido, ver DECISIONS.md).
// O resto da fatia é aditivo e não muda cálculo nenhum: `BuildBattleSetupFromHeroesInput`
// ganhou `summonBlueprints` (o repasse que faltava para `summonReinforcement` ser alcançável
// por cliente/servidor, mesmo padrão de `valorSkills` em M12 4/N). Não observável em
// `pnpm balance` nem no GOLDEN_HASH: o torneio não usa Valor e o replay canônico não tem
// portão.
// M17 (sub-sessões 1/N a 5/N) — **a árvore de talentos mudou de dono e de forma**, e este é
// o bump que o §4 do briefing reservou para o fechamento do milestone. Ao contrário dos
// anteriores, ele não descreve uma regra nova somada às antigas: uma regra ANTIGA foi
// removida e substituída, e é isso que o torna incompatível de verdade.
//
// O que saiu: duas árvores por CLASSE (`tree: 'class'|'spec'`), o gate por pontos gastos na
// árvore, `requires`/`exclusiveWith` como topologia, e o teto de 8 pontos por árvore.
// O que entrou (§8.2): uma árvore por PERSONAGEM, duas colunas principais presentes em
// todas as linhas mais uma coluna do meio ocasional, UM nó por linha, profundidade de 5 a 9
// declarada por personagem, a coluna amarrando a linha seguinte, o nó do meio como a porta
// que libera a troca de lado, e o orçamento FIXO em 9 para todo mundo (D9 — a profundidade
// é troca de forma, não de poder).
//
// **Não há caminho de migração, e isso é decisão e não omissão (D5).** O formato de alocação
// mudou: uma alocação gravada na forma antiga nomeia nós que não existem em árvore nenhuma,
// e `resolveTalentEffects` ignora nó desconhecido em silêncio (§8.2) — mantê-la seria
// entregar ao jogador uma build que resolve zero talento sem avisar. O cliente devolve os
// pontos (`reconcileSave`, decisão do usuário na 4/N) e o servidor recusa o replay com 409,
// que é exatamente o que este bump liga.
//
// A segunda mudança do milestone é de MODELO e não de cálculo: **inimigo de fase deixou de
// ser um `Hero`** com classe, nível, equipamento e talentos e passou a ser autorado direto
// (§8.1, 3/N). Não altera nenhuma fórmula — `resolveEnemyCombatProfile` devolve o mesmo
// `HeroCombatProfile`, e a força dos 43 inimigos foi CONGELADA na migração, conferida contra
// uma tabela de hashes — mas muda o que um `Encounter` é, e portanto o que um `BattleSetup`
// reconstruído a partir de conteúdo significa.
//
// **Observável em `pnpm balance`, e pela primeira vez em vários milestones.** O torneio
// deixou de medir 9 comps sintéticas por classe e passou a medir o ELENCO real (D6), com
// árvores por personagem; os números de 2026-08-28 não se transferem, e a matriz foi
// remedida do zero nesta fatia. **GOLDEN_HASH não muda:** o replay canônico monta
// `BattleUnit` direto, sem herói, sem classe e sem talento — nenhuma das duas mudanças o
// alcança.
//
// M18, sub-sessão 2/N: **o fragmento de imprint deixa de pertencer a uma INSTÂNCIA de
// herói e passa a pertencer ao PERSONAGEM.** `MaterialDef.forHeroId` virou
// `forCharacterId`, e `applyImprint` compara com `hero.characterId`. A regra antiga
// funcionava por coincidência de autoria — todo herói da campanha tinha `id` e
// `characterId` iguais —, e já estava quebrada fora dela: um herói sem `characterId` nunca
// casava com fragmento nenhum, em silêncio. A aquisição de M18 a torna insustentável, e
// não por gosto: dois jogadores com o mesmo personagem têm instâncias de herói diferentes,
// então um fragmento por instância não teria como ser autorado como conteúdo.
//
// Isto NÃO é o gacha entrando no core — §15 continua valendo e a rolagem vive em
// `packages/gacha`. É uma regra de M14, que já morava aqui, sendo corrigida.
//
// Sem caminho de migração: `forHeroId` deixou de existir, e um material autorado na forma
// antiga é recusado pelo schema em vez de validar sem efeito. Não observável em
// `pnpm balance` (o torneio não faz imprint) nem no GOLDEN_HASH (o replay canônico monta
// `BattleUnit` direto).
export const RULES_VERSION = '0.18.0';
