import { VOLUMES_PADRAO } from '../audio/sons.js';
import { idiomaValido } from '../i18n/idioma.js';
import { DEFAULT_UI_SCALE, isSupportedUiScale } from '../data/overlayTheme.js';

// Volume é um número entre 0 e 1. Fora disso é preferência corrompida (o save é disco do
// jogador), e o padrão é melhor resposta que o silêncio ou o estouro.
function volumeValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 1;
}

// §11/§09-roadmap (M13, sub-sessão 3/N) — "progresso sobrevive a recarregar a página".
//
// **M18, sub-sessão 7/N: o save encolheu, e isso é a migração da campanha para o servidor.**
// Até aqui ele guardava o capítulo alcançado, os scripts táticos preparados, o equipamento
// e a alocação de talentos — porque a campanha era jogada inteiramente no cliente e não
// havia mais ninguém para guardá-los. Com a campanha passando pelo servidor (§9.4, decidido
// na 4/N), cada uma dessas coisas ganhou um dono melhor:
//
// - capítulo limpo → `GET /campaign` (o servidor marca a primeira vitória e paga por ela);
// - script tático → `PUT /heroes/:id/tactics`;
// - talentos → `PUT /heroes/:id/talents`;
// - equipamento → `POST /heroes/:id/equip`, que existe desde M14.
//
// Guardar cópia local de qualquer um deles agora seria manter duas verdades sobre o mesmo
// estado, e a do disco do jogador é a que não pode ser autoridade (§9.4).
//
// O que sobra é o que o servidor NÃO tem: preferências de apresentação (§11 —
// acessibilidade) e o token, que é digitado à mão numa caixa de texto. Nada aqui é regra,
// e nada aqui muda uma decisão do core.
//
// Este arquivo não conhece o catálogo nem o store: ele lê e escreve um objeto pequeno, o
// que o deixa testável sem browser e sem batalha.

export const SAVE_STORAGE_KEY = 'paths-beyond/save';

// Versão do FORMATO do save, independente de `rulesVersion` (que é do motor).
//
// **v2 (M18, 7/N):** os cinco campos de progresso saíram. Um save v1 NÃO é descartado — ele
// é migrado, preservando as preferências e o token, que continuam significando exatamente a
// mesma coisa. Descartar seria apagar o tamanho de fonte e o modo daltônico de quem já
// jogava por causa de uma mudança de arquitetura que não é dele; é a mesma linha que
// `reconcileSave` seguia em M13 ("o que continua verdadeiro é mantido").
// **v3 (M23, 1/N):** entra `introducoesVistas` — quais dicas da introdução contextual o
// jogador já dispensou. É estado de APRESENTAÇÃO, como o resto do que sobrou aqui: o
// servidor não precisa saber quais caixas de texto alguém fechou, e no pior caso de perda o
// jogo mostra uma dica de novo.
// **v4 (M24):** entram os dois volumes (efeitos e música). Mesma natureza do resto do que
// sobrou aqui — preferência de apresentação, que é exatamente onde o roadmap mandou pô-los:
// "ao lado de `uiScale` e `colorblindMode`".
// **v5 (M25):** entra o idioma escolhido. Mesma natureza do resto — preferência de
// apresentação —, e com uma consequência que só ela tem: a escolha do jogador vence a língua
// do navegador em toda abertura depois da primeira. Quem escolheu inglês num navegador em
// português não pode ser sobrescrito a cada recarga.
export const SAVE_FORMAT_VERSION = 5;

// As versões anteriores, aceitas na leitura e reescritas como v3 na primeira gravação. Um
// save antigo nunca é descartado: as preferências dele continuam significando exatamente a
// mesma coisa, e apagar o tamanho de fonte de quem já jogava por causa de uma mudança de
// formato seria punir o jogador por uma decisão nossa.
const VERSOES_ACEITAS = new Set([1, 2, 3, 4, SAVE_FORMAT_VERSION]);

export interface SaveGame {
  readonly v: number;
  // A `rulesVersion` com que estas preferências foram gravadas (regra 11). Já não
  // invalida nada — não sobrou no save uma linha sequer presa à regra da batalha —, mas
  // continua gravada: é o que permite a uma versão futura saber de onde o save veio.
  readonly rulesVersion: string;
  readonly instantResultMode: boolean;
  // §11 (acessibilidade), M13 4/N.
  readonly colorblindMode: boolean;
  readonly uiScale: number;
  // M26 2/N — a cena de duelo ao engajar. Opcional no formato porque um save gravado antes
  // dela existe e continua válido: ausente cai no padrão (ligada), do mesmo jeito que
  // `uiScale` e `colorblindMode` já faziam quando entraram.
  readonly duelSceneEnabled?: boolean;
  // Só o token do PvP entra (decisão do usuário, M13 3/N): ele é digitado à mão e
  // redigitá-lo a cada recarga seria hostil. Ticket, oponente e batalha em curso não são
  // persistidos — retomar uma partida é estado que o servidor conhece e o cliente não.
  readonly pvpToken: string;
  // §1.1 (M23, 1/N) — os gatilhos da introdução que já foram mostrados. Guardado como lista
  // de strings, e não como conjunto de booleanos nomeados, porque uma versão futura vai
  // acrescentar dicas: strings desconhecidas sobrevivem à leitura.
  readonly introducoesVistas: readonly string[];
  // §11 (M24) — volume de efeitos e de música, separados. Faixa 0..1; fora dela é preferência
  // recuperável e cai no padrão, como `uiScale` já fazia.
  readonly volumeEfeitos: number;
  readonly volumeMusica: number;
  // §11/D24 (M25) — o idioma escolhido. `null` = o jogador nunca escolheu, e aí vale a língua
  // do navegador (e, se ela não for uma das declaradas, o inglês). Guardar `null` em vez de
  // já gravar o resolvido é o que permite ao jogo acompanhar o navegador de quem nunca mexeu.
  readonly idioma: string | null;
}

export interface SaveStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Parsing defensivo
//
// O save é dado do DISCO DO JOGADOR: pode estar truncado, ser de uma versão anterior ou ter
// sido editado à mão. Não é conteúdo de `packages/data`, então não ganha schema Zod (o
// cliente não depende de Zod e o formato é nosso, não autorado); em compensação, nada aqui
// confia no que leu — qualquer coisa fora do formato vira `null` e o jogo começa do zero,
// nunca uma exceção na inicialização.
//
// A regra que separa os dois tratamentos, herdada de M13 4/N: **erro de TIPO é formato
// malformado e rejeita; valor fora de faixa é preferência recuperável e cai no default.**
// ---------------------------------------------------------------------------

export function parseSave(raw: string | null): SaveGame | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (typeof parsed.v !== 'number' || !VERSOES_ACEITAS.has(parsed.v)) return null;
  if (typeof parsed.rulesVersion !== 'string') return null;
  if (typeof parsed.instantResultMode !== 'boolean') return null;
  if (typeof parsed.pvpToken !== 'string') return null;

  if (parsed.colorblindMode !== undefined && typeof parsed.colorblindMode !== 'boolean') return null;
  if (parsed.duelSceneEnabled !== undefined && typeof parsed.duelSceneEnabled !== 'boolean') return null;
  if (parsed.uiScale !== undefined && typeof parsed.uiScale !== 'number') return null;
  const uiScale = typeof parsed.uiScale === 'number' && isSupportedUiScale(parsed.uiScale) ? parsed.uiScale : DEFAULT_UI_SCALE;

  // Ausente (v1/v2) é lista vazia: quem já jogava vai ver as dicas uma vez, o que é melhor
  // que a alternativa — marcar tudo como visto esconderia a introdução justamente de quem
  // pode ter aprendido errado. Elemento que não é string é formato malformado e rejeita.
  if (parsed.introducoesVistas !== undefined && !Array.isArray(parsed.introducoesVistas)) return null;
  const introducoesVistas = Array.isArray(parsed.introducoesVistas) ? parsed.introducoesVistas : [];
  if (introducoesVistas.some((item) => typeof item !== 'string')) return null;

  // Volume ausente (save anterior ao v4) cai no padrão; presente com tipo errado é formato
  // malformado e rejeita — a mesma regra que separa os dois tratamentos desde M13 4/N.
  if (parsed.volumeEfeitos !== undefined && typeof parsed.volumeEfeitos !== 'number') return null;
  if (parsed.volumeMusica !== undefined && typeof parsed.volumeMusica !== 'number') return null;
  const volumeEfeitos = volumeValido(parsed.volumeEfeitos) ? parsed.volumeEfeitos : VOLUMES_PADRAO.efeitos;
  const volumeMusica = volumeValido(parsed.volumeMusica) ? parsed.volumeMusica : VOLUMES_PADRAO.musica;

  // Idioma ausente (save anterior ao v5) é `null`, que significa "nunca escolhi". Idioma com
  // tipo errado é formato malformado e rejeita; idioma desconhecido (um `zz` de uma versão
  // futura ou editado à mão) vira `null` em vez de derrubar o save inteiro.
  if (parsed.idioma !== undefined && parsed.idioma !== null && typeof parsed.idioma !== 'string') return null;
  const idioma = idiomaValido(parsed.idioma) ? parsed.idioma : null;

  // O save v1 chega aqui com capítulo, táticas, equipamento e talentos junto. Eles são
  // simplesmente ignorados: quem os guarda agora é o servidor, e o que o jogador tinha
  // localmente não pode virar autoridade sobre a conta dele (§9.4).
  return {
    v: SAVE_FORMAT_VERSION,
    rulesVersion: parsed.rulesVersion,
    instantResultMode: parsed.instantResultMode,
    ...(typeof parsed.duelSceneEnabled === 'boolean' ? { duelSceneEnabled: parsed.duelSceneEnabled } : {}),
    colorblindMode: parsed.colorblindMode ?? false,
    uiScale,
    pvpToken: parsed.pvpToken,
    introducoesVistas: introducoesVistas as string[],
    volumeEfeitos,
    volumeMusica,
    idioma,
  };
}

export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save);
}

// ---------------------------------------------------------------------------
// Acesso ao armazenamento
//
// `localStorage` pode simplesmente não existir (SSR, teste em Node) e pode LANÇAR mesmo
// existindo (navegação privada, cota estourada, cookies bloqueados). Nenhum desses casos
// pode derrubar o jogo: sem armazenamento, o jogo roda igual e não salva.
// ---------------------------------------------------------------------------

export function browserSaveStorage(): SaveStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
    };
  } catch {
    return null;
  }
}

export function loadSave(storage: SaveStorage | null): SaveGame | null {
  if (!storage) return null;
  try {
    return parseSave(storage.getItem(SAVE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSave(storage: SaveStorage | null, save: SaveGame): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_STORAGE_KEY, serializeSave(save));
  } catch {
    // Cota estourada ou armazenamento bloqueado: o jogo continua, sem salvar.
  }
}

export function clearSave(storage: SaveStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // idem
  }
}
