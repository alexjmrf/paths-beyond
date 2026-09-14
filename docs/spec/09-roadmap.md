<!-- Milestones, critérios de aceite, decisões em aberto -->
## 13. Roadmap por milestones

### M0 — Fundação
Monorepo, TS strict, Vitest, Zod, CI.
**Aceite:** `pnpm test` e `pnpm validate:data` verdes; CI falha se achar `Math.random` em `core`.

### M1 — Núcleo determinístico
Ponto fixo, PRNG, agregação de stats (§4.1), schemas de herói/classe/skill/item.
**Aceite:** stat sheet de um herói fixo bate com snapshot; 1000 execuções do PRNG com a mesma seed dão sequência idêntica.

### M2 — Duelo headless (o mais importante)
Interpretador de tactics, trocas, AP/PP, reações, assistências, ordem de duelo, fórmula de dano, efeitos.
**Aceite:** `sim-cli duel A.json B.json --seed 42` imprime troca a troca com a linha do script que disparou; mesma seed → hash idêntico; teste cobrindo **cada** variante de `Condition` e cada regra de recurso (limite de 2 AP, contra-ataque sem PP, teto de 2 assistências).

### M3 — Camada de grid
Mapa, terreno, Dijkstra, ZoC, **lista de iniciativa fixa**, ações de turno, `rest`, modificadores posicionais, valor, vitória/derrota.
**Aceite:** batalha completa jogada via `BattleCommand[]` em teste sem UI; replay reproduz estado final idêntico; teste provando que buff de `spd` **não** reordena a iniciativa.

### M4 — Equipamento
Geração, enhance, substats, sets, reforge, CP.
**Aceite:** 100.000 itens gerados respeitam a distribuição de pesos declarada (±2%); enhance com seed fixa é reproduzível.

### M5 — Classes e talentos
Árvores, promoção, choice nodes, patch de skills, builds compartilháveis.
**Aceite:** alocar/resetar altera stat sheet e skills de forma reprodutível; validação rejeita alocação inválida (gate de linha, exclusividade).

### M6 — Cliente jogável
Pixi + React: mapa, movimento, **preview de duelo**, animação, painel de recursos, inventário, árvore, editor de táticas.
**Aceite:** campanha de 3 mapas jogável ponta a ponta; resultado exibido idêntico ao simulado no core.

### M7 — PvP assíncrono
Fastify, Postgres, times de defesa com IA declarativa, matchmaking por CP/ELO, replays.
**Aceite:** resultado do servidor idêntico ao do cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada.

### M8 — Conteúdo e balanceamento
`tools/balance`, matriz de winrate, relatório de distribuição de stats, temporadas, loja de arena.
**Aceite:** toda composição dentro da faixa de **40–60%** de winrate global em 10.000 partidas; **e** builds vencedoras não concentram `spd` acima da mediana em mais de 60% dos casos (§6.7).

> O critério original só tinha teto ("nenhuma composição acima de 65%"). O piso entrou na
> revisão de 2026-08-28: sem ele, uma composição em 31% passava no aceite e mesmo assim
> ninguém a levaria para a arena — o roster efetivo fica menor que o nominal, que é o mesmo
> problema que o teto existe para evitar, pelo outro lado. `tools/balance/src/report.ts` já
> media os dois desde a revisão do M8 (`WINRATE_ALERT_THRESHOLD_PCT`/`WINRATE_FLOOR_THRESHOLD_PCT`);
> esta linha é a spec alcançando a ferramenta.

---

> **M9 em diante foram definidos pela auditoria de 2026-08-07**, depois que M0–M8 (o roadmap
> original) foram concluídos. Motivação registrada em `DECISIONS.md`, seção "Auditoria
> 2026-08-07". Cada milestone tem um briefing de implementação detalhado em
> `docs/milestones/` escrito **no momento em que ele vira o próximo** — não antes, porque o
> escopo dos posteriores depende do resultado dos anteriores.

### M9 — Integração de conteúdo
Loader único `packages/data` → `ContentCatalog`, consumido por cliente, servidor, `sim-cli` e
`tools/balance`. Aposentadoria do conteúdo hardcoded de `apps/client/src/data/campaign/`
(regra 4 do `CLAUDE.md`). Servidor bootando com catálogo real em vez de `EMPTY_CATALOG`.
Nenhuma mecânica nova.
**Aceite:** existe exatamente um loader no repositório e `apps/client/src/data/campaign/` não
existe mais; `pnpm balance` produz matriz **idêntica** à de antes da migração; o mesmo `Hero`
produz o mesmo hash de `StatSheet` no cliente, no servidor e no `sim-cli`.

### M10 — Profundidade do duelo
Ligar o que M2 deixou desligado: `skill.effects` aplicados dentro do duelo (buff/debuff/DoT),
dano e cura de assistência aplicados a HP de verdade, gatilhos de reação além de `onAttacked`
(`onDamaged`, `onLethal`), efeitos `special` de set (§7.4), tick de DoT/regeneração (§6.9).
Exige campo normativo de dano/cura periódico em `EffectDef` e de duração em
`EffectApplication` — hoje nenhum dos dois existe. Exige também `tools/balance` suportando
comps **multi-unidade** com assistência real: sem isso as mudanças desta milestone não são
mensuráveis.
**Aceite:** um duelo com skill que aplica debuff produz stat sheet alterado na troca seguinte,
provado por teste; assistência muda o HP final do duelo; `pnpm balance` roda com comps de
múltiplas unidades e os dois critérios de M8 continuam batendo com o motor novo.

### M11 — Objetivos de mapa e Valor
Condições de vitória além de `rout` (`seize`, `surviveRounds`, `escort`, `defend` — já têm
schema desde M3, nenhuma tem resolução), `mapSkill` com alvo em área (§5.4: cura em área,
artilharia), catálogo real de `valor-skills` resolvido de verdade por `useValor` (hoje só
gasta saldo). Sem estes, todo mapa da campanha é obrigatoriamente "mate todo mundo".
**Aceite:** uma batalha por milestone-condição termina por cada uma das 4 condições novas em
teste; `useValor` produz efeito observável no estado; `mapSkill` em área atinge mais de uma
unidade; `pnpm balance` reexecutado sem regressão nos dois critérios de M8.

### M12 — Conteúdo e campanha real
Autoria de conteúdo em cima do motor completo: campanha em capítulos (6–10 mapas, §10) com
objetivos variados, mais classes e skills, e — o ponto principal — **skills que usam os
efeitos de M10 e os objetivos de M11**. Rebalanceamento completo.
**Aceite:** campanha de 6+ mapas jogável ponta a ponta com pelo menos 3 condições de vitória
distintas; nenhuma skill do catálogo é só um número de dano; os dois critérios de M8 batendo.

### M13 — Superfície jogável completa (§11)
Fechar os requisitos duros de §11 que nenhum milestone cobriu: tela de **replay** (reprodução
passo a passo com controle de velocidade), tela de **PvP** ligando cliente ao servidor de M7
(hoje o cliente nunca chama o servidor), **persistência/save** entre mapas, e a acessibilidade
faltante (modo daltônico nos overlays, fonte escalável).
**Aceite:** um `Replay` gravado é reproduzido passo a passo na UI e bate com o resultado do
core; uma partida de PvP é iniciada, resolvida e revista pelo cliente contra o servidor real;
progresso sobrevive a recarregar a página.

### M14 — Economia PvE (§10)
Masmorras de farm com foco definido (equipamento/experiência/ouro/chefe), energia de conta,
progressão de awakening (0–6) e imprint, e as três moedas (`ouro`, `pedras`,
`marcas de arena`). A loja de PvP (M8) já existe e continua valendo a regra: vende gear de set
e cosmético, **nunca poder bruto**.
**Aceite:** um ciclo completo de farm → drop → enhance → equipar → subir de poder é jogável;
energia limita o farm diário; nenhuma moeda compra poder bruto.

---

> **M15 e M16 foram definidos pela auditoria de 2026-08-14**, após a conclusão do M14.
> Fundamentação em `DECISIONS.md`, seção "Auditoria 2026-08-14".

### M15 — Fechamento do loop de PvP e pendências
Tela de montar time de defesa de arena no cliente — `PUT /me/defense` existe desde M7
(`apps/server/src/battle/routes.ts:162`) e **nenhum código do cliente jamais o chamou**, o que
torna o PvP assíncrono inalcançável pelo jogador apesar de servidor, ELO, matchmaking,
replays e anti-cheat estarem prontos. Mais as pendências herdadas de M11/M14 que ainda têm
efeito observável: `lifesteal` inerte, `summonReinforcement` sem resolução, "+2 Valor ao
capturar objetivo" sem ponto de aplicação, e `Tile.object` declarado com 5 valores mas com
leitor só para 2 e sem nenhum uso no conteúdo.
**Aceite:** um jogador monta a defesa pelo cliente, ela persiste, e um segundo jogador a
enfrenta e vê o replay — o ciclo de PvP fecha ponta a ponta sem `curl`; `lifesteal` altera HP
em teste; nenhum `kind` de valor-skill rejeita por falta de implementação.

### M16 — Linguagem visual programática
Direção de arte **definitiva** do jogo, e a primeira milestone a tratar apresentação como
sistema. Zero assets raster: silhueta/glifo vetorial por classe (hoje toda unidade é um
retângulo com texto), legibilidade de estado (AP/PP, efeitos ativos, ameaça, objetivos) e
animação com peso. Constrói **sobre** `apps/client/src/data/overlayTheme.ts`, o sistema de
tema que M13 4/N já criou para o modo daltônico — generalizar aquilo em tokens, não começar
paleta do zero. O renderer ganha uma costura trocável de representação de unidade, para que
uma camada de sprite possa entrar por cima no futuro sem reescrever `MapCanvas.tsx`.
**Aceite:** nenhum arquivo de imagem entra no repositório; o grid, as unidades e o estado de
batalha são legíveis sem hover e sem legenda, validado pelo usuário no browser; **a garantia
de daltonismo de M13 4/N continua valendo** (marca própria por overlay, não só cor) e é
reverificada, não assumida; a costura de representação de unidade existe e tem uma segunda
implementação de teste provando que é trocável.

---

> **M17 foi definido pelo usuário em 2026-08-28**, ao reposicionar o design depois de fechar o M16.
> Briefing: `docs/milestones/M17-personagens-e-talentos.md`. Forma normativa da árvore em §8.2.

### M17 — Personagens e a árvore de duas colunas
O jogo passa a se basear em **personagens**, não em classes. A classe continua guiando status e
parte do que o personagem faz (curva de stat, `moveType`, armas, pools, skills de partida) mas
deixa de ser a unidade de progressão: a **árvore de talentos passa a ser do personagem**, com duas
colunas de 5 a 9 linhas, um nó por linha, a coluna amarrando a linha seguinte, e uma coluna do
meio ocasional cujo nó é a porta que libera trocar de lado. Orçamento de pontos = profundidade.
Junto entra a simplificação que a mudança revelou: **inimigo de fase deixa de ser um `Hero` com
classe, nível, equipamento e talentos** e passa a ser autorado direto, com status e skills
escolhidos para a dificuldade pretendida.
**Aceite:** um personagem aloca a árvore de duas colunas ponta a ponta pelo cliente, com a
amarração impedindo escolha ilegal e a convergência liberando a troca; nenhum inimigo de campanha
ou masmorra passa por `Hero`/classe; `pnpm balance` reexecutado com os dois critérios do M8 de pé;
`RULES_VERSION` sobe e o servidor rejeita replay de versão anterior com 409.

---

> **M18 foi definido pelo usuário em 2026-09-02**, sobre o rumo de aquisição que `DECISIONS.md`
> registrava desde 2026-08-28. Briefing: `docs/milestones/M18-aquisicao-de-personagens.md`.

### M18 — Aquisição de personagens
A economia de M14 já tinha a forma inteira de um gacha — `imprint` alimentado por fragmento,
`awakening`, três moedas, energia limitando o farm — e o que faltava era a **aquisição**. O elenco
fechado de M17 parte em **núcleo de história** (quatro garantidos a todo jogador: Aren, Miron,
Sylla e Vesper) e **adquiríveis** (Wren, Bardan, Kaia, Rurik e Nyra), e a campanha deixa de nomear
a party para declarar **vagas**, no padrão que as masmorras de M14 já usam — sem isso, posse não
significa nada, porque o capítulo entrega o personagem que o banner venderia. Entra uma **quarta
moeda, premium**, que não se ganha farmando e não paga evolução de personagem: as fontes são
história, primeira completude, achievements, eventos e dinheiro real, e os sumidouros são o summon
e a compra de energia extra. A rolagem vive em `packages/gacha`, pacote novo — §15 continua
literal, o gacha **não** toca em `packages/core`. Junto vem o buraco de segurança que a mudança
expõe: **nenhuma rota pergunta hoje se o jogador possui o personagem que mandou**.
**Aceite:** um jogador novo começa com o núcleo, puxa um personagem pelo cliente gastando a moeda
premium e o usa, com a duplicata virando fragmento e o pity garantindo na rolagem N+1; o servidor
recusa arena e masmorra com personagem não possuído; nenhum capítulo nomeia a party e a campanha é
zerável só com os quatro do núcleo; as quatro fontes da moeda premium concedem uma única vez cada
e os dois sumidouros gastam; `pnpm balance` reexecutado com os dois critérios do M8 de pé.

---

> **M19–M24 foram PROPOSTAS pelo agente em 2026-09-03**, a pedido do usuário, depois de uma auditoria
> do repositório (não da documentação). **Elas precisam ser ratificadas pelo usuário antes de
> qualquer uma ser aberta** — M17 e M18 nasceram os dois de "definido pelo usuário", e esta seção não
> muda essa regra. As decisões que as sustentam estão em `DECISIONS.md`, seção "Em aberto (levantadas
> pelo usuário em 2026-09-03, ao definir plataforma alvo e sempre-online)", itens A–G.
>
> **O diagnóstico que ordena estas seis, em uma frase:** o jogo está **completo o bastante em
> mecânica para ser testado e incompleto o bastante em infraestrutura para ser impossível de
> publicar** — 1.831 testes, 8 pacotes, motor determinístico validado em três engines, e ao mesmo
> tempo nenhuma conta de verdade jamais existiu, nenhum dado sobrevive a um reinício do servidor e
> nenhuma build jamais foi instalada em máquina nenhuma. As milestones anteriores construíram o
> JOGO; estas seis constroem o PRODUTO, e a ordem não é gosto: cada uma torna a seguinte testável
> de verdade, e as duas primeiras são pré-requisito de qualquer teste com um jogador real.

### M19 — Persistência e operação do servidor
**A milestone que existe porque hoje o servidor de produção perde dados do jogador a cada
reinício.** `apps/server/src/index.ts` monta `createMemoryEconomyRepository()` — materiais,
inventário e limpezas de masmorra vivem em RAM desde M14 3/N, enquanto todos os outros sete
repositórios já são de Postgres. Não é achado novo (a 3/N o registrou e pôs comentário no arquivo);
o que mudou é que sempre-online promove isso de anomalia a **bloqueio duro**, porque o servidor
deixou de ser um validador de PvP e passou a ser a única fonte de verdade que existe. **A boa
notícia é que a parte cara já está feita:** a migration `0007_pve_economy.sql` já criou
`player_materials`, `player_items`, `dungeon_clears`, `dungeon_entries` e `dungeon_runs` — o schema
existe, falta a implementação do repositório. Junto entra o que faltava para o serviço ser
operável: o servidor inteiro tem **uma única linha de log**, o que significa que uma falha em
produção hoje é invisível. Entram logging estruturado por requisição, erro com contexto, e o
procedimento de backup/restore exercitado de verdade e não presumido.
**Aceite:** `apps/server/src/index.ts` não instancia **nenhum** repositório de memória; um teste de
integração prova que material, item de inventário e limpeza de masmorra sobrevivem a reiniciar o
processo; toda rota emite log estruturado com id de jogador e desfecho; um restore a partir de
backup é executado e documentado, com a suíte passando contra o banco restaurado; `pnpm test` segue
verde e o repositório de memória continua existindo **para os testes e o `devServer`**, que é o uso
para o qual ele foi escrito.

---

### M20 — Identidade de plataforma
**Hoje o jogador digita o próprio identificador numa caixa de texto.** `x-player-token` é um token
opaco declarado como stub em M7, e era a decisão certa enquanto o servidor só arbitrava arena. Com
sempre-online, economia real e uma moeda que se compra com dinheiro, ele é ao mesmo tempo o
mecanismo de autenticação e o mecanismo de personificação: quem souber o token de alguém É essa
pessoa. Entra identidade de plataforma — ticket de sessão da Steam validado no servidor contra a
Steam Web API, o equivalente da Epic via EOS — que tem a propriedade de não guardar credencial
nenhuma do nosso lado. **E entra o ciclo de vida de conta, que não existe:** o projeto nunca teve
rota de criação; a 6/N resolveu isso derivando o núcleo preguiçosamente em `GET /me/heroes`, o que
foi a decisão certa para aquela fatia e não é uma resposta para "o que acontece quando alguém
compra o jogo". Entram também exclusão e exportação de conta, que deixam de ser opcionais quando
existe conta de verdade.
**Aceite:** um jogador novo chega do zero pela identidade da plataforma, sem digitar nada, e recebe
o núcleo de quatro; nenhuma rota aceita mais o token digitado; existe criação de conta explícita e
o comportamento preguiçoso da 6/N ou é substituído ou é declarado como o caminho oficial, com o
motivo escrito; exclusão de conta remove o jogador de todas as tabelas e é testada; a suíte de
servidor roda sem depender da Steam (o validador é injetado, no mesmo padrão de `now` e `newNonce`).

---

### M21 — O shell desktop e o pipeline de release
**A primeira vez que o jogo vira uma coisa que se instala.** O §2 de
`01-fundacoes-tecnicas.md` diz "não usar engine pesada" e nunca nomeou empacotamento, porque quando
foi escrito o alvo era implicitamente o browser; com desktop declarado, a escolha de shell passa a
ser normativa. **A recomendação registrada é Electron, e o argumento é do próprio projeto:** o
servidor roda Node (V8) e re-simula todo replay; Electron embute Chromium (V8) numa versão que nós
congelamos, então cliente e servidor comparam hash na mesma engine. Tauri usaria a webview do
sistema — JavaScriptCore no macOS e no Linux/Steam Deck — e reintroduziria em produção exatamente a
divergência de runtime que o ponto fixo e o job `determinismo-navegadores` existem para eliminar.
Junto entram Steamworks e o pipeline: os **10 achievements já autorados** em
`packages/data/achievements/` ganham espelho na plataforma, e o CI passa a produzir um instalável.
**Nota de escopo:** `HANDOFF.md` já teve um item "shell desktop (Electron + steamworks.js)",
removido em 2026-08-28 por não ser o escopo do M9 real — o motivo da remoção venceu.
**Aceite:** existe build instalável para as plataformas alvo, produzida pelo CI e não à mão; o teste
de determinismo roda **dentro do runtime empacotado** e o hash bate com o do servidor, o que é a
única prova que importa (o job atual prova navegadores, não o shell); auto-update funciona de uma
versão para a seguinte; os 10 achievements do catálogo concedem na plataforma e continuam
retroativos como a 4/N os desenhou; a decisão Electron vs Tauri está escrita em §2 com o argumento,
não só com o resultado.

---

### M22 — Sempre-online: versão, reconexão e cobertura
**A milestone que faz sempre-online não parecer quebrado.** Três buracos, todos conhecidos e todos
registrados. **(1) Versão:** `battle/routes.ts:312` devolve um **409 seco** em mismatch de
`rulesVersion`; na web isso nunca aparecia porque todo mundo recarregava, no desktop jogadores rodam
versões diferentes por dias, e com sempre-online o mismatch não mata só a arena — mata o jogo
inteiro, porque toda batalha faz round-trip. Precisa de tela de atualização acionável e de uma
decisão sobre aceitar `N-1` na janela de rollout. Junto fecha o vizinho já registrado no M17 5/N:
`POST /dungeons/:id/run` reexecuta `commands` do cliente e **não tem campo `rulesVersion`**, então
não há o que validar. **(2) Reconexão:** a primitiva certa já existe e é genérica — o nonce de
`economy_actions`, `dungeon_runs` e `replays` —, mas o cliente não guarda o nonce em voo, então uma
queda de conexão no meio de uma run pode comer energia já debitada. **(3) Cobertura de rate limit:**
`tryConsume` é chamado por seis rotas e **todas são de batalha**; `POST /summon`,
`POST /shop/purchase`, `POST /energy/purchase`, `POST /rewards/:id/claim` e as quatro de progressão
não consomem do limitador. O nonce protege contra reenviar a **mesma** requisição, não contra mil
**diferentes** — ou seja, as rotas que tocam a moeda comprável com dinheiro real são justamente as
abertas. O limitador é em memória, portanto por processo: o `RateLimiter` já é interface, e trocar
por uma implementação compartilhada (o §2 já prevê Redis e ele nunca entrou) não mexe em rota
nenhuma.
**Aceite:** mismatch de versão produz tela acionável no cliente e nunca um erro cru, com a política
`N-1` decidida e escrita; `POST /dungeons/:id/run` valida `rulesVersion` como `/battles` já faz;
derrubar a conexão no meio de uma run e reconectar não cobra duas vezes nem perde a run, provado por
teste; **toda** rota que debita recurso consome do limitador, com um teste que falha se uma rota
nova esquecer; existe implementação compartilhada do `RateLimiter` e a troca não exigiu tocar em
nenhuma rota.

---

### M23 — A primeira sessão de um jogador de verdade
**Ninguém nunca jogou este jogo sem saber como ele funciona.** Todo teste de ponta a ponta até aqui
partiu de conta semeada, fixture ou `devServer`; com M20, contas novas passam a existir de verdade,
e esta é a milestone que descobre o que um estranho não entende. O jogo tem duelo automático com
scripts táticos programados antes do combate, economia de AP/PP que dura a batalha inteira,
assistência por adjacência, árvore por personagem e gacha — **é muita regra para descobrir sozinho**,
e o pilar "legibilidade tática" de §1.1 exige que o jogador consiga prever o resultado antes de
confirmar. Esta milestone é o teste desse pilar com alguém que não escreveu a spec. Segue o
precedente do critério 2 do M16: **estética e compreensão são julgadas pelo usuário, não
autocertificadas pelo agente.**
**Aceite:** uma conta criada do zero joga o capítulo 1, faz o primeiro summon, equipa, aloca talento
e entra na arena **sem ninguém tocar no banco** e sem instrução fora do jogo; a introdução explica
duelo, AP/PP e script tático no ponto em que cada um aparece pela primeira vez, e não num paredão de
texto inicial; **validado pelo usuário observando alguém que nunca viu o jogo**, com o veredito
sendo dele; nenhuma tela exige conhecimento que o jogo não deu.

---

### M24 — Áudio
**O projeto tem zero som — nenhum arquivo, nenhuma biblioteca, nenhuma chamada.** Não é omissão de
autoria, é ausência de camada: `grep` por `Audio`, `howler` ou `WebAudio` em `apps/client/src`
devolve nada. Para um jogo tático em que o duelo é automático e o jogador assiste ao resultado da
decisão que tomou antes, o som não é enfeite — é metade da leitura de impacto que M16 construiu no
visual com peso e timing (`motion.ts`). Entram camada de áudio, mixagem por categoria e os
controles, que caem exatamente no lugar certo: depois da 7/N, o save local é **só preferências de
apresentação**, que é precisamente o que volume é.
**Aceite:** golpe, contra-ataque, morte, cura e as transições de turno têm som, sincronizados com as
batidas que `motion.ts` já define; existem controles separados de música e efeitos, persistidos no
`SaveGame` v2 ao lado de `uiScale` e `colorblindMode`; o áudio respeita as pausas entre cenas
(`SCENE_GAP_MS`) em vez de virar borrão quando várias unidades agem em sequência; nenhum asset de
áudio quebra o teste `semAssetsRaster.test.ts`, que é sobre imagem — se ele precisar de ajuste, o
ajuste é declarado e não silencioso.

---

### M25 — A camada de idioma, com inglês como língua de lançamento
**A UI é português cru dentro do JSX**, e não há camada de i18n: `Esperar`, `Descansar (+1 AP +1
PP)` e as cinco caixas da introdução do M23 estão escritas no lugar onde são desenhadas. D24
decidiu que a língua de lançamento é o inglês, com português, espanhol, chinês e japonês depois.
**Esta milestone vem antes do conteúdo por aritmética, não por gosto:** a demo do M27 traz trinta
missões com nome e texto, e autorá-las antes da camada de idioma é escrever tudo duas vezes. O
custo de extrair strings cresce com cada tela nova e com cada linha de conteúdo autorada.
**Aceite:** nenhuma string visível ao jogador mora dentro do JSX ou do JSON de conteúdo — todas
passam por uma chave; existe teste que reprova chave faltando em qualquer idioma declarado e chave
órfã que ninguém usa; inglês e português estão completos, com o inglês como padrão e a escolha
persistida no save ao lado das outras preferências; o texto autorado em `packages/data` (nome de
personagem, de missão, de skill) é traduzível **sem duplicar o dado**, e a estrutura aceita
espanhol, chinês e japonês sem mudar de forma; a introdução contextual do M23 e a varredura de
jargão continuam valendo na língua ativa.

---

### M26 — Arte: a peça deixa de ser desenhada por código
**D22 decidiu a FORMA e D25 decidiu a FONTE.** A forma: uma fonte de verdade por unidade,
animada pelo `motion.ts`, que já anima por transformação e não por troca de quadro; o
`UnitRenderer` de M16 1/N foi construído como hedge para exatamente esta troca (D2), com teste
de contrato provando que a costura aguenta. A fonte: **PixelLab**, escolhida depois de um teste
de fumaça com quatro peças geradas e postas no tabuleiro real — o caso fácil e o caso difícil
(cavaleira montada em grifo) saíram legíveis, e o pipeline é dirigível por script pela API v2.
**O que o teste já resolveu, e não se re-discute:** o sprite CABE no tile (transbordando, as
unidades de linhas adjacentes se sobrepõem, e "1 herói = 1 tile" é a primeira regra do jogo); a
camada programática vira o HUD e é desenhada POR CIMA do sprite, o que preserva o modo
daltônico de M13 4/N intacto; e a animação mantém a identidade entre quadros, que é o defeito
que derrubou jogos alheios.
**O que o teste deixou em aberto para esta milestone medir:** a resolução do quadro (48 ou 64,
sabendo que 64 só se paga se o tile subir de 36 e isso muda o enquadramento dos mapas) e o
movimento, que saiu tímido — um levantar de espada em vez de um golpe com impacto e
recuperação. Os três caminhos a testar estão em D25.
**O critério 1 do M16 está formalmente reaberto por esta milestone**, e o ajuste é declarado:
`semAssetsRaster.test.ts` deixa de exigir zero imagens e passa a exigir que imagem só exista
onde é declarada, com manifesto e procedência. **O terreno continua programático** — distinguir
terreno, alvenaria e portão é contraste no TILE, é o critério 2 que o usuário reprovou em
2026-08-28, e nenhuma camada de personagem toca nisso.
**Aceite:** o tabuleiro desenha sprite para as unidades com o pipeline de animação de M16
intocado (nenhum número de `motion.ts` muda) e com o HUD por cima; todo personagem e todo
inimigo de `packages/data` tem asset declarado **ou** cai explicitamente no glifo programático,
com teste que reprova conteúdo novo sem uma das duas coisas; existe manifesto com procedência,
prompt, seed e licença de cada imagem, e o teste de assets reprova imagem fora dele; o modo
daltônico e a marca por overlay continuam legíveis sobre o sprite; a geração é um script
repetível com a chave fora do repositório, e roda com uma implementação de mentira em teste —
mesmo padrão do validador de identidade e do atualizador; e **o golpe tem peso**, julgado pelo
usuário como o critério 2 do M16 foi julgado.

---

### M27 — A demo: três capítulos, trinta missões
**D23 recortou o lançamento:** três capítulos iniciais de uma linha de história, dez missões cada.
Hoje `encounters` tem **seis capítulos de um encontro cada** — capítulo *é* missão —, então isto é
mudança de FORMA antes de ser de volume: duas camadas (capítulo → missões), no schema, em
`GET /campaign`, na tela e no que "primeira completude" significa para a moeda premium.
Junto vem a consequência de D21 que só pode ser medida quando o conteúdo existir: **o jogador que
nunca paga precisa progredir** pelas quatro fontes autoradas no M18 4/N, e nenhuma tela pode exigir
pagamento para continuar.
**Aceite:** o schema de campanha tem capítulo e missão como camadas distintas, e a campanha antiga
migra sem perder o que o jogador já limpou; as trinta missões existem, são jogáveis ponta a ponta e
passam pelo `pnpm balance` com os dois critérios do M8; uma conta que nunca gasta dinheiro real
completa os três capítulos, provado por teste que parte de servidor vazio (o mesmo idioma de
`primeiraSessao.test.ts`); a energia e o summon aceleram e nunca destravam — nenhuma missão exige
moeda premium; e a primeira completude paga por MISSÃO ou por CAPÍTULO com a escolha registrada,
porque trinta missões pagando o valor de capítulo mudaria a economia inteira.

---

### Horizonte — RESOLVIDO em 2026-09-04, e o que sobrou

As quatro frentes desta seção existiam porque cada uma dependia de uma decisão do usuário que
estava aberta. **As quatro foram fechadas** (D21–D24 em `DECISIONS.md`) e viraram M25, M26 e M27:

- **Monetização (D21):** F2P, sempre-online, gacha e moeda premium. Não virou milestone própria —
  ela confirma o que M14 e M18 já construíram, e a consequência que exige trabalho ("quem nunca
  paga precisa progredir") é critério de aceite do **M27**, porque só pode ser medida quando o
  conteúdo da demo existir.
- **Arte (D22):** sprite 2.5D com uma imagem por unidade, animada por transformação → **M26**.
- **Volume (D23):** a demo é três capítulos de dez missões → **M27**.
- **Localização (D24):** inglês como língua de lançamento → **M25**, e ela vem PRIMEIRO porque
  autorar trinta missões antes da camada de idioma é escrever tudo duas vezes.

**O que continua fora de milestone, e por quê:**

- **Integração de pagamento.** §15 a mantém fora de escopo, e D21 acrescenta um motivo: numa loja
  de desktop, quem cobra é a plataforma.
- **A história.** O usuário declarou tê-la pensada e que ela "não é tão relevante no momento". O
  M27 constrói a ESTRUTURA que ela vai ocupar; o texto entra depois, e já traduzível por M25.
- **Espanhol, chinês e japonês.** M25 deixa a estrutura pronta para os três; autorar cada idioma é
  trabalho de tradução, não de engenharia, e depende do texto final da demo.

**A pendência de processo desta seção foi resolvida em 2026-09-04:** os 47 arquivos não commitados
viraram 140 e foram commitados em sete commits, de M18 6/N a M24. A árvore está limpa.

---

> **M28–M35 foram PROPOSTAS pelo agente em 2026-09-10**, depois de uma auditoria do repositório
> executando as suítes, e com a direção escolhida pelo usuário na mesma sessão: **fechar a demo
> para ser jogada**. Ratificar antes de abrir, como M19–M27.
>
> **O diagnóstico que ordena estas seis.** A demo existe: três capítulos, trinta missões, 2.493
> testes verdes, shell empacotável, determinismo provado dentro do Electron. **E ninguém fora desta
> máquina consegue jogá-la** — não há Dockerfile, não há compose, não há alvo de deploy, e o jogo é
> sempre-online por decisão (D21). O binário sabe para onde apontar desde o M21 2/N; não existe
> para onde apontar. **Tudo aqui serve a uma frase: um estranho instala e joga os três capítulos.**
> A ordem é de bloqueio, não de gosto — a primeira desbloqueia as cinco seguintes e desbloqueia
> também o usuário, que hoje não consegue julgar nada na tela porque o cliente real exige Postgres.

### M28 — O ambiente jogável
**A milestone que existe porque o jogo, hoje, não é alcançável por ninguém.** O M19 pôs o servidor
em Postgres e o M21 fez o cliente empacotado receber a URL do shell pelo `preload` — as duas metades
certas de uma ponte que **não tem margem do outro lado**. Junto vem um bloqueio prático que já
apareceu duas vezes no `PROGRESS.md`: o julgamento na tela (o capítulo recolhível do M27, o critério
3 do M23) fica pendente porque *"o Docker não está de pé nesta máquina"* — ou seja, a mesma
ausência trava o playtest e trava o autor. O `compose` local não é conveniência: é o que faz o
usuário conseguir olhar o próprio jogo. Entram também as migrations no caminho do deploy (existe
`migrate.ts` e nada o chama fora do CI), os segredos (`BATTLE_TICKET_SECRET` já falha alto, o que é
o comportamento certo, e precisa de onde vir) e backup automático — o M19 provou o restore à mão.
**Aceite:** `docker compose up` sobe servidor + Postgres migrado numa máquina limpa, e o cliente de
desenvolvimento fala com ele sem passo manual; existe um ambiente hospedado alcançável pela
internet, com as migrations rodando no deploy e não à mão; **uma pessoa em OUTRA máquina instala o
build empacotado e joga a missão 1 do capítulo 1 ponta a ponta**, que é a única prova que importa;
o backup roda sozinho e um restore é exercitado contra o ambiente hospedado; o julgamento na tela
que M23 e M27 deixaram pendente deixa de estar bloqueado por ambiente.

---

### M29 — A camada de idioma da campanha
**Declarada fora do M27 por decisão do usuário, e é maior do que o registro dizia.** A auditoria de
2026-09-10 mediu: `TipoDeConteudo` declara **seis** tipos e os catálogos têm entrada para **dois**
(`masmorra`, 8; `premio`, 10). Ficam em português na build inglesa **~81 nomes autorados** — 30
missões (o tipo `missao` **não existe** na camada), 3 capítulos (`capitulo` declarado, zero
entradas), 10 classes, 28 skills e 10 materiais — mais as cinco frases que dizem "capítulo" onde a
1/N pôs missão. Com D24 fazendo do inglês a língua de lançamento, isto não é polimento: é a demo
falando a língua errada. **E há uma lição de teste que vale mais que os nomes:**
`conteudoTraduzido.test.ts` afirma cobertura **só dos dois tipos já prontos** — é o padrão "lacuna
de eixo e não de profundidade" que este projeto já pegou cinco vezes, desta vez dentro do teste que
existe para impedi-lo. Consertar a cobertura sem consertar o teste deixa a próxima omissão passar
igual.
**Aceite:** todo nome autorado de todo tipo declarado em `TipoDeConteudo` tem entrada nas duas
línguas, com `missao` existindo como tipo; as cinco frases de "capítulo"/"missão" dizem a coisa
certa; **o teste de cobertura passa a derivar do catálogo de conteúdo em vez de listar números** —
acrescentar uma missão sem traduzi-la fica vermelho, e um tipo novo em `TipoDeConteudo` sem
entradas também; nenhum nome próprio de personagem ganha entrada (a decisão do M25 continua).

---

### M30 — O texto: a história nos três capítulos
**O M27 construiu a estrutura que a história vai ocupar e o M25 a deixou traduzível; o texto nunca
entrou.** O usuário declarou tê-la pensada e que ela "não é tão relevante no momento" — verdade
enquanto a demo não seria jogada por ninguém, e deixa de ser no instante em que ela é. Trinta
missões com nome e sem uma linha de contexto são um tutorial de sistemas, não uma demo: o jogador
não descobre por que escolta a Wren no capítulo 5 nem por que Bardan vira aliado no 6, e essas duas
decisões de conteúdo já estão no dado desde o M18 5/N. Entra o texto pelos pontos que já existem —
abertura de capítulo, briefing de missão, o que acontece ao limpar — sem inventar tela nova e sem
tocar em regra.
**Aceite:** os três capítulos e as trinta missões têm texto autorado, em inglês e português, pela
camada do M25 e não cru no dado; o aliado de cenário do capítulo 5 e o do 6 têm motivo dito no
jogo; nenhuma tela nova foi criada e `packages/core` fica intocado; a varredura de jargão
(`semJargao.test.ts`) continua valendo para o texto novo.

---

### M31 — O volume do gacha na demo
**A tela de summon está quase inerte, e o playtest ia medir isso sem querer.** Medido nesta sessão
contra o conteúdo autorado: 30 missões × 60 + 3 capítulos × 300 + 8 masmorras × 200 + 4.650 de
achievements e eventos = **≈ 8.950 premium**, e com `summon.premiumCost = 500` isso é
**17 rolagens na demo inteira**. O usuário nomeou o gacha como a peça que prende o jogador; entregar
17 puxadas ao primeiro estranho que jogar (M33) é testar um jogo que não é este.

**A restrição que ordena a fatia, e ela contraria a intuição: o pity não pode crescer antes do pool
crescer.** Com pity `P` e pool `N`, o pior caso para completar o pool é `N × P` rolagens — hoje
5 × 10 = 50. Um pity de 30 exigiria 150 rolagens, que a renda da demo não paga nem de longe, e
`pool esgotado CONGELA o contador de pity` (M18 1/N) transformaria o excedente em rolagem morta.
**Logo esta fatia NÃO é onde o pity cresce** — ela é onde o volume passa a caber no pool que existe.
O pity maior que o usuário quer chega com o elenco do M36, e é lá que ele deve ser afinado.

**O ajuste de menor toque é o custo, não a renda:** `summon.premiumCost` é **um número em
`packages/data`**, contra os 45 arquivos de recompensa que mexer na renda exigiria. O alvo é o
volume da demo ficar próximo de `N × P`, para que o gacha continue vivo do começo ao fim e complete
perto do final em vez de morrer no meio.
**Aceite:** o número de rolagens que a demo paga está **medido por teste que deriva do catálogo** —
acrescentar uma missão ou um achievement muda o número medido e não o deixa passar em silêncio, que
é a diferença entre uma asserção e um comentário; o volume cai na faixa em que o pool de 5 completa
perto do fim da demo e não no meio; `pnpm balance` reexecutado com os dois critérios do M8 de pé;
os números finais (`premiumCost`, `pityThreshold`) vieram do usuário e estão registrados em
`DECISIONS.md` com a medição que os justificou, por D18 e pela regra 10.

---

> **M32 e M35 foram inseridos em 2026-09-14**, a partir do que o usuário viu ao instalar o
> jogo em outra máquina pela primeira vez (critério 3 do M28): *"a HUD precisa de remodelagem
> urgente"*. A decisão de arte de 2026-08-28 já dizia *"sprite 2.5D mais uma passagem de HUD"*;
> o M26 fez o sprite e **a passagem de HUD nunca virou milestone** — não foi adiada, caiu.
> Escolha do usuário: **uma passagem cirúrgica ANTES do playtest** (M32) e **o redesenho DEPOIS**
> (M35), com os dados do playtest. O que estava numerado M32–M36 subiu para M33–M38.

### M32 — A HUD de um jogo, não de um harness
**A tela que o jogador vê é a superfície do M13 — construída para EXERCITAR todos os sistemas,
nunca desenhada.** Visível no primeiro print do instalador: a barra do topo é um painel de
desenvolvimento (*Battle scene on engage*, *Instant result mode*, *Erase progress* a um clique no
cabeçalho, sem confirmação visível); a porta de entrada está escondida dentro de um painel chamado
*"PvP — arena"*, e Campaign, Dungeons e Summoning dizem *"Sign in on the PvP panel"* — entrar não
tem nada a ver com PvP, é a primeira ação do jogo; há um tabuleiro vazio com "0 inimigo(s) de pé" e
"Round 1" antes de existir sessão; o objetivo e as skills de Valor aparecem em português na build
inglesa (o M29 não os cobriu); e todos os painéis têm o mesmo peso visual — nada diz qual é a
*próxima ação*. **Esta milestone é cirúrgica de propósito:** sem ela, o playtest (M33) mede a HUD e
não a compreensão do jogo — o estranho trava no "Sign in on the PvP panel" antes de chegar a
qualquer regra. Mas redesenhar a HUD inteira antes de ver alguém travar é redesenhar no escuro;
isso é o M35. **Nenhuma regra muda, `packages/core` fica intocado.**
**Aceite:** sem sessão, a única coisa na tela é entrar — nenhum tabuleiro, nenhum painel de
sistema; os controles de desenvolvimento e de acessibilidade saem do cabeçalho para um menu de
opções, e "apagar progresso" pede confirmação; objetivo de mapa, condição de vitória e skills de
Valor passam pela camada de idioma do M25, com `conteudoTraduzido.test.ts` derivando a cobertura
deles como já deriva a das missões; em cada tela existe UMA próxima ação com peso visual maior que
o resto, e o usuário a identifica sem que ninguém aponte — **julgado por ele na tela**, como o
critério 2 do M16; nada do M13 deixa de funcionar (a suíte do cliente segue verde).

---

### M33 — O critério 3 do M23, e o veredito da primeira sessão
> **ORDEM DE EXECUÇÃO (2026-09-14): M32 → M35 → M33 → M34.** O usuário julgou o M32 na tela e o
> veredito do critério 5 foi "está tudo muito misturado" — o primeiro dado do playtest, e ele já diz
> onde trava. Rodar o M33 com esta HUD mediria a HUD e não o jogo (o mesmo argumento que criou o
> M32). O M35 sobe para antes deste; a numeração NÃO muda (já foi trocada uma vez neste dia).
> Briefing normativo em `docs/milestones/M35-hud-redesenho.md`.

**Este é o único critério de aceite aberto em todo o projeto**, e `PROGRESS.md` o carrega desde
2026-09-04: *"observar alguém que nunca viu o jogo"*. Não é código — é do usuário, e segue o
precedente do critério 2 do M16. As três milestones acima existem para que ele seja possível de
fazer: sem ambiente (M28) não há o que instalar, sem idioma (M29) o observado lê metade em
português, sem texto (M30) ele joga sem saber por quê. **E há um achado esperando decisão, já
registrado:** *a primeira batalha do jogo é vencida em 65% das vezes* — para uma primeira batalha,
isso provavelmente é baixo demais, e a correção pode ser conteúdo (a missão), economia (a ficha
inicial) ou nada, se a intenção for que o jogador perca e aprenda. É decisão de design e não de
código.
**Aceite:** o usuário observa pelo menos uma pessoa que nunca viu o jogo jogar do zero até o fim do
capítulo 1, sem ajudar; o que travou essa pessoa está escrito, item a item, em `DECISIONS.md`; a
decisão sobre os 65% da primeira batalha está tomada e registrada, seja ela "corrigir" ou
"deliberado"; **o M23 é marcado como fechado ou o que falta vira milestone própria** — ele não
continua aberto por inércia.

---

### M34 — Telemetria e o playtest ampliado
**Depois de uma pessoa observada, as próximas não estarão na sala.** O servidor tem log estruturado
desde o M19, e nada mede JOGO: onde o jogador para, quanto tempo leva a missão, quantas vezes
repete, em que ponto fecha o jogo e não volta. Sem isso, um playtest com dez pessoas remotas
devolve dez opiniões e nenhum número. Entra o mínimo que responde a essas perguntas — e entra com
a decisão de privacidade explícita, porque coletar comportamento de jogador é coleta de dado
pessoal e a conta já é identidade de plataforma desde o M20.
**Aceite:** dá para responder, por número e não por impressão, onde os jogadores param na demo e
quanto tempo cada missão leva; o que é coletado está declarado e o jogador pode recusar; nada
coletado identifica alguém além do id de conta que o servidor já tem; um playtest com mais de uma
pessoa remota roda ponta a ponta e o relatório sai do dado coletado.

---

### M35 — A HUD: o redesenho
> **Antecipado para antes do M33 em 2026-09-14** — ver a nota no M33. O parágrafo abaixo diz "vem
> depois do playtest"; a razão dele (não desenhar no escuro) foi atendida pelo julgamento do dono na
> tela, e as decisões estão em **`docs/milestones/M35-hud-redesenho.md` (D41–D44)**: um menu e uma
> aba por vez; a missão em três passos (escolher → prévia com o tabuleiro → quem vai) com 8 presets
> de party no servidor; inimigo pelo nome autorado (`<função> [de <facção>]`, uma nação só); a
> batalha sem botões de ação num inimigo selecionado.

**A passagem de HUD que a decisão de arte de 2026-08-28 prometeu, feita com dados.** O M32
tirou o que estava obviamente errado; este é o desenho de verdade — layout, identidade visual
coerente com o sprite 2.5D do M26, o que fica na tela durante a batalha e o que some, o que o
duelo mostra e em que ordem. Vem **depois** do playtest (M33) e da telemetria (M34) por uma razão
só: as duas dizem **onde o jogador travou e o que ele olhou**, e desenhar sem isso é desenhar por
gosto. O pilar de §1.1 que governa a fatia é *legibilidade tática* — o jogador DEVE conseguir
prever o resultado antes de confirmar — e é contra ele que cada tela é julgada, não contra
"ficou bonito". `packages/core` intocado; o cliente só renderiza (regra 3).
**Aceite:** cada achado de HUD registrado no M33 e medido no M34 tem uma resposta na tela nova ou
uma justificativa escrita de por que não; durante a batalha, iniciativa, pools de AP/PP, zona de
ameaça e preview do duelo estão visíveis sem hover (§1.1, requisito duro de §11); a garantia de
daltonismo do M13 4/N continua valendo e é reverificada, não assumida; **julgado pelo usuário na
tela**, com a mesma pessoa (ou outra) que jogou no M33 jogando de novo e o que travou antes não
travando mais; a suíte do cliente segue verde e `semTextoCru.test.ts` continua vazio de exceções.

---

> **M36–M38 foram PROPOSTAS pelo agente em 2026-09-10**, sobre o desenho de gacha final que o
> usuário fechou na mesma sessão. Decisões, colisões e números abertos em `DECISIONS.md`, seção
> **"Em aberto (levantadas pelo usuário em 2026-09-10, ao desenhar o gacha final)"**. As três vêm
> **depois do playtest (M33)** de propósito: elas somam sistema a um jogo cujo M33 existe para
> descobrir se ele já tem regra demais, e o veredito do playtest deve poder mudá-las.

### M36 — Os três tiers: Adventurer, Hero e Legend
**O elenco deixa de ser plano.** `Adventurer` é o tier de baixo, `Hero` o do meio e `Legend` o topo,
e **o topo não é invocável**: chega-se nele por evolução. Os caminhos são assimétricos de propósito
— quem nasce `Hero` sobe direto a `Legend`; quem nasce `Adventurer` sobe a `Hero` e só então a
`Legend`. **O tier de baixo NÃO é mais fraco no fim**, e essa é a trava do milestone e não um
detalhe: o que muda é a complexidade do kit e o custo de evolução, nunca o teto de poder. **A
metade "kit mais simples" já está construída** — a profundidade da árvore varia por personagem (5 a
9) e D9 já declarou que profundidade é troca de forma e não de poder, então `Adventurer` ≈
profundidade 5–6 e `Hero` ≈ 8–9, com o mesmo orçamento de 9 pontos. **`Legend` monta no `awakening`**
(decisão do usuário), reusando a curva, o material e a idempotência que existem desde o M14 em vez
de criar um quinto eixo de progressão. **Isto reverte "pesos iguais, sem raridade" (M18 2/N)**, e a
reversão é legítima porque o desenho novo respeita a premissa original: raridade sem poder. **É
também o milestone que faz o pity poder crescer**, porque o `Adventurer` é o que preenche o
intervalo entre dois `Hero` — sem ele, pity alto é rolagem morta (ver M31). **O item mais caro é
elenco:** nove personagens não se partem em dois tiers de forma convincente, então autorar
personagens novos (ficha, árvore, arte pela PixelLab do M26, balanceamento) dimensiona a fatia.
**Aceite:** o tier de BASE é catálogo e o tier CORRENTE é estado de conta, e nenhum dos dois mora
no lugar do outro (o erro que o M18 2/N pagou com o fragmento de imprint); um `Adventurer` promovido
a `Hero` e um `Hero` de base são indistinguíveis em regra depois de promovidos; `Adventurer` não
aparece em banner próprio e sai do banner de `Hero`; **`pnpm balance` roda com todas as comps no
MESMO tier corrente e os dois critérios do M8 batem, com um teste que falha se a matriz misturar
tiers** — medir investimento diferente e ler como design é a lacuna de eixo que o M17 5/N pegou;
`RULES_VERSION` sobe e o servidor recusa replay anterior com 409; os números (limiares de awakening,
divisão do elenco, pity novo) vieram do usuário.

---

### M37 — Armas assinatura e o banner de armas
**O equipamento vira alvo de gacha.** Uma arma/artefato assinatura por personagem, **travada por
CLASSE** — equipável por qualquer personagem da classe de quem ela pertence —, com banner próprio; e
quando um personagem entra em rotação, a arma dele entra junto. **A máquina de item já existe
inteira** (mainstat por slot, até 4 substats com `rolls`, enhance +0→+15, reforge, sets), então esta
fatia é banner, trava e direito de escolha — não um sistema de equipamento novo. **Os dois números
derivam do pity de personagem `P`** (decisão do usuário): pity do banner de armas entre `0,60·P` e
`0,75·P`, e o **token de escolha no banner de personagem em `1,5·P` rolagens NAQUELE banner**,
deliberadamente **não** condicionado a como o personagem saiu — a regra original ("tirou no
garantido, faça mais 50%") punia quem tivesse sorte, e boa sorte pior que má sorte é o erro clássico
do gênero. **A pergunta que trava a fatia e precisa estar respondida antes de uma linha de código:**
a arma é *sidegrade* (muda o eixo de build sem somar poder) ou *upgrade*? Se for upgrade, ela é
poder saindo do gacha e reprova no critério do M8 — e então o critério muda de forma deliberada, ou
a arma muda.
**Aceite:** a trava por classe é forma e não varredura (o schema recusa arma sem classe declarada);
o token de `1,5·P` é contador duro por `(jogador, banner)`, concedido uma única vez por banner, e o
caso de bater o limiar sem possuir o personagem deixa o token pendente em vez de perdê-lo — com
teste para os dois caminhos, incluindo o recíproco; `pnpm balance` com os dois critérios do M8 de
pé, medido **com e sem** a arma assinatura equipada, porque é essa diferença que responde à pergunta
de sidegrade; a decisão sidegrade-vs-upgrade está registrada em `DECISIONS.md` com a medição.

---

### M38 — A Soul
**Um item exclusivo do personagem, e o primeiro slot novo desde o M1.** Dois substats roláveis mais
um **mainstat ligado às habilidades daquele personagem** (2 a 3 possibilidades), num slot que só
abre depois de o personagem ser upado até certo nível. **O farm dropa material GENÉRICO e a escolha
de para quem craftar acontece no craft** (decisão do usuário, e é a certa): um farm por classe
recriaria o "hoje tenho de farmar o domínio errado" de Genshin e do Epic Seven. **Duas consequências
de forma que dimensionam a fatia:** a Soul é um **7º slot**, e `GEAR_SLOTS` é lista única usada por
UI e validação de save enquanto §7.1 diz "6 slots" normativamente e §4.1 fixa a ordem de agregação —
é mudança de regra; e como o mainstat é sorteado entre 2–3 opções, o jogador **vai recraftar**, então
o sumidouro tem de ser afinado como repetível e não como gasto único. **Distinção a preservar:**
arma é travada por CLASSE e Soul por PERSONAGEM — dois modelos de exclusividade de propósito, com
nomes distintos no dado para ninguém fundi-los depois. (`ItemInstance.lockedBy?: HeroId` existe no
tipo e no schema **sem consumidor** desde o M4 e é o "trancar no herói" do E7 — não serve para
nenhuma das duas travas.)
**Aceite:** a Soul entra como slot próprio com a ordem de agregação de §4.1 declarada e testada, e
§7.1 deixa de dizer "6 slots"; o slot recusa abrir abaixo do nível declarado, e o nível é conteúdo e
não constante em código; o mainstat sorteia entre as opções declaradas DAQUELE personagem e o schema
recusa uma Soul cujo mainstat não pertença a ele; craftar escolhe o personagem no ato, a partir de
material genérico, com idempotência por nonce como toda ação de economia desde o M14 4/N;
`RULES_VERSION` sobe; `pnpm balance` com os dois critérios do M8 de pé.

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** ~~fora do escopo~~ — **resolvida em duas etapas.** *O quê* (M18, 2026-09-02): o jogo é um gacha com núcleo de história (D15/D19). *Com ou sem preço de entrada* (2026-09-04): **F2P** (D21). A parte que continua valendo ao pé da letra: o gacha **NÃO** toca em `packages/core` — a rolagem vive em `packages/gacha`. Integração de pagamento segue fora do escopo, e agora com um motivo a mais: numa loja de desktop, quem cobra é a plataforma.
