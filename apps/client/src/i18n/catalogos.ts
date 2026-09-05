import type { Catalogo, Idioma } from './idioma.js';

// §11/D24 (M25, sub-sessão 1/N) — os CATÁLOGOS.
//
// **Chave, e não frase inglesa como chave.** `t('Wait')` parece prático até o dia em que
// alguém corrige a redação em inglês e todas as outras línguas perdem a entrada de uma vez. A
// chave é um identificador estável (`acao.esperar`), e o inglês é uma tradução como as outras
// — só que é a que serve de rede quando falta chave (D24: inglês é a língua de lançamento).
//
// **Um arquivo TypeScript e não JSON.** O catálogo é código do cliente, não conteúdo autorado
// de `packages/data` — ele não é validado por Zod, não é dado de jogo e não é lido pelo
// servidor. Em TS ele ganha tipo, e o teste de completude compara os dois objetos sem precisar
// de loader nenhum.
//
// **A ordem das chaves é a da tela**, e não alfabética: quem traduz lê de cima para baixo o
// que o jogador vê, e chave alfabética espalharia o cabeçalho entre o inventário e a arena.

const en: Catalogo = {
  // Cabeçalho e preferências de apresentação (§11 — acessibilidade).
  'app.titulo': 'Project Vanguard — campaign',
  'app.modo.pvp': 'Arena — PvP',
  'app.modo.masmorra': 'Dungeon',
  'app.modo.escolhaCapitulo': 'Choose a chapter',
  'app.pref.resultadoInstantaneo': 'Instant result mode (skips animations)',
  'app.pref.daltonico': 'Colorblind mode',
  'app.pref.tamanho': 'Size',
  'app.pref.efeitos': 'Effects',
  'app.pref.musica': 'Music',
  'app.pref.idioma': 'Language',
  'app.pref.apagarProgresso': 'Erase progress',

  // Nomes dos idiomas — sempre na PRÓPRIA língua, e não traduzidos. Quem procura português
  // numa tela em japonês procura "Português", não a palavra japonesa para português.
  'idioma.en': 'English',
  'idioma.pt': 'Português',

  // A introdução contextual do M23. O texto continua curto: o teste de tamanho vale para
  // todas as línguas, porque o paredão que o roadmap proíbe não fica menor traduzido.
  'introducao.entendi': 'Got it',

  // As cinco dicas do M23, uma por conceito, no ponto em que ele aparece. O limite de 320
  // caracteres do teste vale para TODAS as línguas: o paredão que o roadmap proíbe não fica
  // menor traduzido.
  'introducao.preview-de-duelo.titulo': 'The duel resolves itself',
  'introducao.preview-de-duelo.texto':
    'You choose WHO attacks whom; the rest is automatic, in up to 3 exchanges. The result below is already the real one — confirm and exactly that happens. No hidden luck.',
  'introducao.recursos-ap-pp.titulo': 'AP and PP last the whole battle',
  'introducao.recursos-ap-pp.texto':
    'AP pays for skills; PP pays for reactions, like counter-attacking. They do NOT come back between duels: spend it all early and you arrive with nothing. Resting restores, but costs the turn.',
  'introducao.script-tatico.titulo': 'You program the unit before, not during',
  'introducao.script-tatico.texto':
    'In the duel it follows this script, line by line, in order: the first true condition decides the action. That is why combat is predictable — the unit does what you wrote, always.',
  'introducao.primeiro-summon.titulo': 'Summoning, and the counter that guarantees',
  'introducao.primeiro-summon.texto':
    'Summoning spends premium currency. The counter next to the banner is the guarantee: reach the number and the next summon brings a guaranteed rare. A repeated character becomes a bond fragment.',
  'introducao.primeira-arena.titulo': 'The arena is asynchronous',
  'introducao.primeira-arena.texto':
    'You do not face the person: you face the defense they set up and left saved. Yours does the same while you are away. Winning and losing move your ELO, which picks your next opponents.',

  // A tela de atualização obrigatória (M22).
  'versao.titulo': 'Update the game to continue',
  'versao.motivo.ausente': 'This version of the game predates the server rules check.',
  'versao.motivo.diferente': 'The server rules changed since the version you are running.',
  'versao.explicacao':
    'Until both match, no battle can be resolved — the server replays every match to confirm the result.',
  'versao.detalhe': 'server: {esperado} · this client: {recebido}',
  'versao.naoInformada': 'not reported',
  'versao.reiniciar': 'Restart and update',
  'versao.baixando': 'The update is downloading. Close and reopen the game when it finishes.',
  'versao.recarregue': 'Reload the page to get the new version.',

  // O aviso de atualização (M21 4/N).
  'atualizacao.encontrada': 'Update {versao} found — downloading…',
  'atualizacao.baixando': 'Downloading update {versao} — {porcento}%',
  'atualizacao.pronta': 'Update {versao} ready.',
  'atualizacao.reiniciarAgora': 'Restart now',

  // A campanha.
  'campanha.titulo': 'Campaign',
  'campanha.conecte': 'Sign in on the PvP panel to play the campaign.',
  'campanha.jogando': 'Playing {capitulo}',
  'campanha.abandonar': 'Leave chapter',
  'campanha.atualizar': 'Refresh',
  'campanha.primeiraVitoria': 'First win in each chapter pays {premium} premium currency.',
  'campanha.vagas': '{vagas} slot(s)',
  'campanha.limpo': ' · cleared',
  'campanha.quemVai': 'Who goes ({escolhidos}/{vagas})',
  'campanha.entrar': 'Enter chapter',
  'campanha.escolha': 'Choose a chapter.',

  // O preview de duelo — o recurso mais importante do jogo segundo §11.
  'duelo.titulo': 'Duel preview',
  'duelo.engaja': '{atacante} engages {defensor}',
  'duelo.troca': 'Exchange {numero} — {primeiro} acts first',
  'duelo.naoPodeAgir': '{ator}: could not act',
  'duelo.usa': '{ator} uses {skill}',
  'duelo.linha': ' [line {linha}]',
  'duelo.ataqueBasico': ' [basic attack]',
  'duelo.em': ' on {alvo}',
  'duelo.errou': ' — missed',
  'duelo.dano': '{critico} — {dano} damage',
  'duelo.critico': ' CRITICAL',
  'duelo.reacao': 'reaction from {alvo}: {skill}',
  'duelo.contraDano': ' ({dano} counter-damage)',
  'duelo.hpFinal': 'Final HP — {atacante}: {hpAtacante} · {defensor}: {hpDefensor}',
  'duelo.recursos': 'Resources spent — {atacante}: {apAtacante} AP / {ppAtacante} PP · {defensor}: {apDefensor} AP / {ppDefensor} PP',
  'duelo.assistencias': 'Assists — {atacante}: {assistAtacante} · {defensor}: {assistDefensor}',
  'duelo.nenhuma': 'none',
  'duelo.vencedor': 'Winner: {vencedor}',
  'duelo.semVencedor': '(none — 3 exchanges without a death)',
  'duelo.revelando': 'Revealing exchange {atual} of {total}…',
  'duelo.confirmar': 'Confirm',
  'duelo.cancelar': 'Cancel',

  // Iniciativa e objetivo — o tabuleiro.
  'iniciativa.titulo': 'Initiative — round {round}',
  'iniciativa.morto': 'dead',
  'iniciativa.agiu': 'acted',
  'iniciativa.valor': 'Valor: {valor}',
  'iniciativa.valorHint': '— map resource',
  'iniciativa.valorTitle': 'A resource for the whole map. You gain it by capturing objectives and spend it on Valor skills.',
  'iniciativa.resultado': 'Result: {resultado}',
  'objetivo.titulo': 'Objective',
  'objetivo.round': 'Round {round}',
  'valor.titulo': 'Valor:',
  'valor.semSkills': 'This map declares no Valor skills.',
  'valor.custo': '({custo} Valor)',
  'valor.semResolucao': 'no resolution in the engine — see DECISIONS.md (M11 3/N)',
  'valor.mireNoMapa': 'Click a map tile to cast, or the button again to cancel.',

  // O fim de um capítulo.
  'capituloFim.concluido': 'Chapter complete!',
  'capituloFim.derrota': 'Defeat',
  'capituloFim.vitoria': 'Victory!',
  'capituloFim.resolvido': 'The server resolved it in {rounds} round(s).',
  'capituloFim.primeiraVez': ' First time: +{premium} premium currency.',
  'capituloFim.reverBatalha': 'Watch the battle',
  'capituloFim.voltar': 'Back to chapters',
  'capituloFim.envieVitoria': 'Send the commands for the server to confirm the chapter.',
  'capituloFim.envieDerrota': 'Send the result or go back and try again.',
  'capituloFim.enviar': 'Send to the server',
  'capituloFim.tentarNovamente': 'Try again',

  // O painel de recursos — AP/PP do exército inteiro (§11).
  'recursos.titulo': 'Army resources',
  'recursos.unidade': 'Unit',
  'recursos.status': 'Status',
  'recursos.jaAgiu': 'already acted',
  'recursos.podeDescansar': 'can rest',
  'recursos.moveuDemais': 'moved too far to rest',
  'recursos.semPp': 'no PP — ambush',

  // A barra de ação da unidade.
  'unidade.selecione': 'Select a unit on the map or in the initiative list.',
  'unidade.stats': 'HP {hp} · AP {ap} · PP {pp}',
  'unidade.moveu': 'Moved {andou} / {alcance} this turn',
  'unidade.esperar': 'Wait',
  'unidade.descansar': 'Rest (+1 AP +1 PP)',
  'unidade.skillCusto': '{skill} ({custo} AP{area})',
  'unidade.area': ', area {raio}',
  'unidade.editarTaticas': 'Edit tactics',
  'unidade.inventario': 'Inventory',
  'unidade.talentos': 'Talents',
  'unidade.mireNoAlcance': 'Click a tile within range to cast.',

  // O replay (§11 — reprodução passo a passo).
  'replay.titulo': 'Replay',
  'replay.cabecalho': 'rulesVersion {versao} · seed {seed} · {comandos} commands',
  'replay.passo': 'Step {passo} of {total} · round {round} · {desfecho}',
  'replay.posicao': 'Position',
  'replay.inicio': '⏮ Start',
  'replay.anterior': '◀ Previous',
  'replay.pausar': '⏸ Pause',
  'replay.reproduzir': '▶ Play',
  'replay.proximo': 'Next ▶',
  'replay.fim': 'End ⏭',
  'replay.velocidade': 'Speed:',
  'replay.fechar': 'Close',

  // A arena (PvP assíncrono).
  'pvp.titulo': 'PvP — arena',
  'pvp.entrar': 'Sign in',
  'pvp.identidade': 'Platform identity — nothing to type.',
  'pvp.eu': '{nome} · ELO {elo} · {marcas} marks',
  'pvp.seuTime': 'Your team',
  'pvp.procurarOponente': 'Find opponent',
  'pvp.iniciarBatalha': 'Start battle',
  'pvp.oponente': 'Opponent: {nome} · ELO {elo}{mapa}',
  'pvp.emAndamento': 'Arena battle in progress · round {round} · {comandos} command(s) recorded',
  'pvp.resultadoLocal': 'Local result: {desfecho}. The server decides — send the commands.',
  'pvp.enviar': 'Send to the server',
  'pvp.reverReplay': 'Watch the server replay',
  'pvp.voltar': 'Back to the campaign',
  'pvp.servidorDisse': 'Server: {desfecho} in {rounds} round(s) · seed {seed}',
  'pvp.eloDepois': 'ELO: {atacante} (you) · {defensor} (defender)',
  'pvp.marcas': 'Arena marks: {marcas}',

  // A invocação (gacha).
  'summon.titulo': 'Summoning',
  'summon.conecte': 'Sign in on the PvP panel to summon.',
  'summon.atualizar': 'Refresh',
  'summon.premium': 'Premium currency {premium} · {possuidos}/{total} characters',
  'summon.pity': 'Guarantee {atual}/{teto} · {estado}',
  'summon.pityPronto': 'the next one is guaranteed',
  'summon.pityFaltam': 'guaranteed in {faltam} roll(s)',
  'summon.noBanner': 'In the banner: {personagens}',
  'summon.invocar': 'Summon ({custo})',
  'summon.recrutou': 'You recruited {personagem}.',
  'summon.repetido': 'Duplicate: {personagem} became 1 {material}.',
  'summon.elenco': 'Cast',
  'summon.historia': 'story',
  'summon.recrutado': 'recruited',
  'summon.naoRecrutado': 'not recruited',
  'summon.premios': 'Rewards',
  'summon.reivindicado': 'claimed',
  'summon.foraDaJanela': 'outside the window',
  'summon.reivindicar': 'Claim',
  'summon.energia': 'Energy',
  'summon.comprarEnergia': 'Buy energy',
};

const pt: Catalogo = {
  'app.titulo': 'Project Vanguard — campanha',
  'app.modo.pvp': 'Arena — PvP',
  'app.modo.masmorra': 'Masmorra',
  'app.modo.escolhaCapitulo': 'Escolha um capítulo',
  'app.pref.resultadoInstantaneo': 'Modo resultado instantâneo (pula animações)',
  'app.pref.daltonico': 'Modo daltônico',
  'app.pref.tamanho': 'Tamanho',
  'app.pref.efeitos': 'Efeitos',
  'app.pref.musica': 'Música',
  'app.pref.idioma': 'Idioma',
  'app.pref.apagarProgresso': 'Apagar progresso',

  'idioma.en': 'English',
  'idioma.pt': 'Português',

  'introducao.entendi': 'Entendi',

  'introducao.preview-de-duelo.titulo': 'O duelo se resolve sozinho',
  'introducao.preview-de-duelo.texto':
    'Você escolhe QUEM ataca quem; o resto é automático, em até 3 trocas. O resultado abaixo já é o verdadeiro — se confirmar, é exatamente isso que acontece. Nada de sorte escondida.',
  'introducao.recursos-ap-pp.titulo': 'AP e PP duram a batalha inteira',
  'introducao.recursos-ap-pp.texto':
    'AP paga habilidades; PP paga reações, como contra-atacar. Eles NÃO voltam sozinhos entre duelos: quem gastou tudo no começo chega sem nada no fim. Descansar recupera, mas custa o turno.',
  'introducao.script-tatico.titulo': 'Você programa a unidade antes, não durante',
  'introducao.script-tatico.texto':
    'No duelo ela segue este script, linha por linha, na ordem: a primeira condição verdadeira decide a ação. É por isso que dá para prever o combate — a unidade faz o que você escreveu, sempre.',
  'introducao.primeiro-summon.titulo': 'Invocação, e o contador que garante',
  'introducao.primeiro-summon.texto':
    'Invocar gasta a moeda premium. O contador ao lado do banner é a garantia: ao chegar no número, a próxima invocação vem no raro garantido. Personagem repetido vira fragmento de vínculo.',
  'introducao.primeira-arena.titulo': 'A arena é assíncrona',
  'introducao.primeira-arena.texto':
    'Você não enfrenta a pessoa: enfrenta a defesa que ela montou e deixou salva. A sua defesa faz o mesmo enquanto você está fora. Ganhar e perder mexem no seu ELO, que escolhe seus oponentes.',

  'versao.titulo': 'Atualize o jogo para continuar',
  'versao.motivo.ausente': 'Esta versão do jogo é anterior à checagem de regras do servidor.',
  'versao.motivo.diferente': 'As regras do servidor mudaram desde a versão que você está rodando.',
  'versao.explicacao':
    'Enquanto as duas não forem a mesma, nenhuma batalha pode ser resolvida — o servidor reexecuta cada partida para confirmar o resultado.',
  'versao.detalhe': 'servidor: {esperado} · este cliente: {recebido}',
  'versao.naoInformada': 'não informada',
  'versao.reiniciar': 'Reiniciar e atualizar',
  'versao.baixando': 'A atualização está sendo baixada. Feche e reabra o jogo quando ela terminar.',
  'versao.recarregue': 'Recarregue a página para receber a versão nova.',

  'atualizacao.encontrada': 'Atualização {versao} encontrada — baixando…',
  'atualizacao.baixando': 'Baixando atualização {versao} — {porcento}%',
  'atualizacao.pronta': 'Atualização {versao} pronta.',
  'atualizacao.reiniciarAgora': 'Reiniciar agora',

  'campanha.titulo': 'Campanha',
  'campanha.conecte': 'Conecte-se no painel de PvP para jogar a campanha.',
  'campanha.jogando': 'Jogando {capitulo}',
  'campanha.abandonar': 'Abandonar capítulo',
  'campanha.atualizar': 'Atualizar',
  'campanha.primeiraVitoria': 'Primeira vitória em cada capítulo paga {premium} de moeda premium.',
  'campanha.vagas': '{vagas} vaga(s)',
  'campanha.limpo': ' · limpo',
  'campanha.quemVai': 'Quem vai ({escolhidos}/{vagas})',
  'campanha.entrar': 'Entrar no capítulo',
  'campanha.escolha': 'Escolha um capítulo.',

  'duelo.titulo': 'Preview de duelo',
  'duelo.engaja': '{atacante} engaja {defensor}',
  'duelo.troca': 'Troca {numero} — {primeiro} age primeiro',
  'duelo.naoPodeAgir': '{ator}: não pôde agir',
  'duelo.usa': '{ator} usa {skill}',
  'duelo.linha': ' [linha {linha}]',
  'duelo.ataqueBasico': ' [ataque básico]',
  'duelo.em': ' em {alvo}',
  'duelo.errou': ' — errou',
  'duelo.dano': '{critico} — {dano} de dano',
  'duelo.critico': ' CRÍTICO',
  'duelo.reacao': 'reação de {alvo}: {skill}',
  'duelo.contraDano': ' ({dano} de contra-dano)',
  'duelo.hpFinal': 'HP final — {atacante}: {hpAtacante} · {defensor}: {hpDefensor}',
  'duelo.recursos': 'Recursos gastos — {atacante}: {apAtacante} AP / {ppAtacante} PP · {defensor}: {apDefensor} AP / {ppDefensor} PP',
  'duelo.assistencias': 'Assistências — {atacante}: {assistAtacante} · {defensor}: {assistDefensor}',
  'duelo.nenhuma': 'nenhuma',
  'duelo.vencedor': 'Vencedor: {vencedor}',
  'duelo.semVencedor': '(nenhum — 3 trocas sem morte)',
  'duelo.revelando': 'Revelando troca {atual} de {total}…',
  'duelo.confirmar': 'Confirmar',
  'duelo.cancelar': 'Cancelar',

  'iniciativa.titulo': 'Iniciativa — round {round}',
  'iniciativa.morto': 'morto',
  'iniciativa.agiu': 'agiu',
  'iniciativa.valor': 'Valor: {valor}',
  'iniciativa.valorHint': '— recurso do mapa',
  'iniciativa.valorTitle': 'Recurso do mapa inteiro. Você ganha capturando objetivos e gasta em habilidades de Valor.',
  'iniciativa.resultado': 'Resultado: {resultado}',
  'objetivo.titulo': 'Objetivo',
  'objetivo.round': 'Round {round}',
  'valor.titulo': 'Valor:',
  'valor.semSkills': 'Este mapa não declara skills de Valor.',
  'valor.custo': '({custo} Valor)',
  'valor.semResolucao': 'sem resolução no motor — ver DECISIONS.md (M11 3/N)',
  'valor.mireNoMapa': 'Clique num tile do mapa para lançar, ou no botão de novo para cancelar.',

  'capituloFim.concluido': 'Capítulo concluído!',
  'capituloFim.derrota': 'Derrota',
  'capituloFim.vitoria': 'Vitória!',
  'capituloFim.resolvido': 'O servidor resolveu em {rounds} round(s).',
  'capituloFim.primeiraVez': ' Primeira vez: +{premium} de moeda premium.',
  'capituloFim.reverBatalha': 'Rever batalha',
  'capituloFim.voltar': 'Voltar aos capítulos',
  'capituloFim.envieVitoria': 'Envie os comandos para o servidor confirmar o capítulo.',
  'capituloFim.envieDerrota': 'Envie o resultado ou volte para tentar de novo.',
  'capituloFim.enviar': 'Enviar ao servidor',
  'capituloFim.tentarNovamente': 'Tentar novamente',

  'recursos.titulo': 'Recursos do exército',
  'recursos.unidade': 'Unidade',
  'recursos.status': 'Status',
  'recursos.jaAgiu': 'já agiu',
  'recursos.podeDescansar': 'pode descansar',
  'recursos.moveuDemais': 'moveu demais p/ descansar',
  'recursos.semPp': 'sem PP — emboscada',

  'unidade.selecione': 'Selecione uma unidade no mapa ou na lista de iniciativa.',
  'unidade.stats': 'HP {hp} · AP {ap} · PP {pp}',
  'unidade.moveu': 'Moveu {andou} / {alcance} este turno',
  'unidade.esperar': 'Esperar',
  'unidade.descansar': 'Descansar (+1 AP +1 PP)',
  'unidade.skillCusto': '{skill} ({custo} AP{area})',
  'unidade.area': ', área {raio}',
  'unidade.editarTaticas': 'Editar táticas',
  'unidade.inventario': 'Inventário',
  'unidade.talentos': 'Talentos',
  'unidade.mireNoAlcance': 'Clique num tile dentro do alcance para lançar.',

  'replay.titulo': 'Replay',
  'replay.cabecalho': 'rulesVersion {versao} · seed {seed} · {comandos} comandos',
  'replay.passo': 'Passo {passo} de {total} · round {round} · {desfecho}',
  'replay.posicao': 'Posição',
  'replay.inicio': '⏮ Início',
  'replay.anterior': '◀ Anterior',
  'replay.pausar': '⏸ Pausar',
  'replay.reproduzir': '▶ Reproduzir',
  'replay.proximo': 'Próximo ▶',
  'replay.fim': 'Fim ⏭',
  'replay.velocidade': 'Velocidade:',
  'replay.fechar': 'Fechar',

  'pvp.titulo': 'PvP — arena',
  'pvp.entrar': 'Entrar',
  'pvp.identidade': 'Identidade da plataforma — nada a digitar.',
  'pvp.eu': '{nome} · ELO {elo} · {marcas} marcas',
  'pvp.seuTime': 'Seu time',
  'pvp.procurarOponente': 'Procurar oponente',
  'pvp.iniciarBatalha': 'Iniciar batalha',
  'pvp.oponente': 'Oponente: {nome} · ELO {elo}{mapa}',
  'pvp.emAndamento': 'Batalha de arena em andamento · round {round} · {comandos} comando(s) gravado(s)',
  'pvp.resultadoLocal': 'Resultado local: {desfecho}. O servidor é quem decide — envie os comandos.',
  'pvp.enviar': 'Enviar ao servidor',
  'pvp.reverReplay': 'Rever replay do servidor',
  'pvp.voltar': 'Voltar à campanha',
  'pvp.servidorDisse': 'Servidor: {desfecho} em {rounds} round(s) · seed {seed}',
  'pvp.eloDepois': 'ELO: {atacante} (você) · {defensor} (defensor)',
  'pvp.marcas': 'Marcas de arena: {marcas}',

  'summon.titulo': 'Invocação',
  'summon.conecte': 'Conecte-se no painel de PvP para invocar.',
  'summon.atualizar': 'Atualizar',
  'summon.premium': 'Moeda premium {premium} · {possuidos}/{total} personagens',
  'summon.pity': 'Garantia {atual}/{teto} · {estado}',
  'summon.pityPronto': 'a próxima é garantida',
  'summon.pityFaltam': 'garantido em {faltam} rolagem(ns)',
  'summon.noBanner': 'No banner: {personagens}',
  'summon.invocar': 'Invocar ({custo})',
  'summon.recrutou': 'Você recrutou {personagem}.',
  'summon.repetido': 'Repetido: {personagem} virou 1 {material}.',
  'summon.elenco': 'Elenco',
  'summon.historia': 'história',
  'summon.recrutado': 'recrutado',
  'summon.naoRecrutado': 'não recrutado',
  'summon.premios': 'Prêmios',
  'summon.reivindicado': 'reivindicado',
  'summon.foraDaJanela': 'fora da janela',
  'summon.reivindicar': 'Reivindicar',
  'summon.energia': 'Energia',
  'summon.comprarEnergia': 'Comprar energia',
};

export const CATALOGOS: Readonly<Record<Idioma, Catalogo>> = { en, pt };
