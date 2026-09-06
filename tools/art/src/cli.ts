import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { DIRETORIO_DE_ARTE } from '@paths-beyond/data/schemas/unit-art.schema.js';
import { especificacoesDe } from './especificacoes.js';
import { criarClientePixelLab } from './pixellab.js';
import { descricaoDe } from './prompt.js';
import { DIRECOES_DE_DUELO, gerarSprite } from './gerar.js';
import { gerarLote, seedDe } from './lote.js';

// M26 — o script repetível.
//
// "A geração é um script repetível com a chave fora do repositório" é critério de aceite, e a
// palavra que pesa é **repetível**: gerar cinquenta peças à mão numa interface é um trabalho
// que ninguém refaz quando o estilo mudar. Aqui, mudar o bloco de estilo em `prompt.ts` e
// rodar de novo regera o elenco inteiro.
//
//   pnpm art -- prompts                        # imprime os 50 prompts sem gastar geração
//   pnpm art -- gerar <unitId> [--tamanho 64] [--seed 7]
//   pnpm art -- gerar-todos [--paralelo 4] [--somente N] [--refazer]
//
// A seed é DERIVADA do `unitId` quando não vem na linha de comando: a mesma unidade regera a
// mesma peça sem ninguém precisar anotar número nenhum, e o manifesto guarda o que foi usado.

const raizDoRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// `.env` é lido à mão, sem dependência nova: são três linhas e a alternativa é um pacote a
// mais no monorepo por causa de uma variável. O arquivo é coberto pelo `.gitignore` desde o
// começo do projeto — a chave nunca entra num commit.
function carregarEnv(): void {
  const caminho = join(raizDoRepo, '.env');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}


// `pnpm art -- prompts` entrega o `--` literal no argv; o `sim-cli` (M2) já resolve isso do
// mesmo jeito, e imitar o precedente é mais barato que inventar outra convenção de linha de
// comando no mesmo monorepo.
const args = process.argv.slice(2).filter((a) => a !== '--');

function argumento(nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  carregarEnv();
  const comando = args[0];
  const catalogo = loadCatalogFromDisk();
  const specs = especificacoesDe(catalogo);

  if (comando === 'prompts') {
    for (const espec of specs) console.log(`${espec.unitId}\n  ${descricaoDe(espec)}\n`);
    console.log(`${specs.length} unidades.`);
    return;
  }

  if (comando === 'gerar') {
    const unitId = args[1];
    const espec = specs.find((s) => s.unitId === unitId);
    if (!espec) throw new Error(`Unidade desconhecida: ${unitId ?? '(nenhuma)'}`);

    const frameSize = Number(argumento('tamanho') ?? 64);
    const seed = Number(argumento('seed') ?? seedDe(unitId!));
    const sufixo = argumento('sufixo');

    // `--saida` escreve fora do repositório. Existe para MEDIR: comparar duas resoluções ou
    // dois prompts exige gerar peças que não devem entrar no manifesto de produção, e sem esta
    // saída a comparação passaria por editar o repositório e desfazer depois.
    const saida = argumento('saida');
    const cliente = criarClientePixelLab({ apiKey: process.env.PIXELLAB_API_KEY ?? '' });
    console.log(`gerando ${unitId} a ${frameSize}px, seed ${seed}...`);
    const resultado = await gerarSprite({
      cliente,
      espec: sufixo ? { ...espec, unitId: `${espec.unitId}${sufixo}` } : espec,
      seed,
      frameSize,
      dirArte: saida ? join(saida, 'art') : join(raizDoRepo, DIRETORIO_DE_ARTE),
      dirManifesto: saida ? join(saida, 'unit-art') : join(raizDoRepo, 'packages', 'data', 'unit-art'),
      ...(argumento('detalhe') ? { detail: argumento('detalhe')! } : {}),
    });
    console.log(`ok: ${resultado.caminhoPng}`);
    return;
  }

  if (comando === 'gerar-todos') {
    // M26 3/N — o elenco inteiro. A lógica de lote (retomada, teto de trabalhos em voo,
    // isolamento de falha) mora em `lote.ts` e é testada sem rede; o que sobra aqui é ler o
    // manifesto, montar o cliente e imprimir.
    const frameSize = Number(argumento('tamanho') ?? 64);
    // 4 e não 8: 1/N mediu que 8 é o teto da conta, e encostar no teto faz a API recusar por
    // fila e o cliente pagar espera crescente. Metade do teto atravessa o lote sem 429.
    const paralelo = Number(argumento('paralelo') ?? 4);
    const dirManifesto = join(raizDoRepo, 'packages', 'data', 'unit-art');
    const cliente = criarClientePixelLab({ apiKey: process.env.PIXELLAB_API_KEY ?? '' });

    const relatorio = await gerarLote({
      specs,
      paralelo,
      ...(argumento('somente') ? { somente: Number(argumento('somente')!) } : {}),
      ...(args.includes('--refazer') ? { refazer: true } : {}),
      // A pergunta "já tem sprite?" é feita ao MANIFESTO e não ao diretório de PNGs: o
      // manifesto é a declaração (regra 4), e um PNG solto sem declaração é exatamente o
      // estado que `semAssetsRaster.test.ts` reprova.
      jaTemSprite: (unitId) => {
        const caminho = join(dirManifesto, `${unitId}.json`);
        if (!existsSync(caminho)) return false;
        return (JSON.parse(readFileSync(caminho, 'utf8')) as { kind?: string }).kind === 'sprite';
      },
      gerarUma: (espec, seed) =>
        gerarSprite({
          cliente,
          espec,
          seed,
          frameSize,
          dirArte: join(raizDoRepo, DIRETORIO_DE_ARTE),
          dirManifesto,
        }),
      // Meia hora sem uma linha na tela é indistinguível de travado, e a saída deste comando é
      // a única prova de que a metade que falhou falhou — 1/N registrou que o silêncio é o
      // defeito caro aqui, não o erro.
      aoTerminar: (e) =>
        console.log(
          `[${e.feitas}/${e.total}] ${e.estado === 'ok' ? 'ok' : 'FALHA'} ${e.unitId}${e.erro ? ` — ${e.erro}` : ''}`,
        ),
    });

    console.log(
      `\n${relatorio.geradas.length} geradas, ${relatorio.puladas.length} já tinham sprite, ${relatorio.falhas.length} falharam.`,
    );
    for (const falha of relatorio.falhas) console.log(`  falhou: ${falha.unitId} — ${falha.erro}`);
    // Sai com código de erro quando alguma peça falhou: sem isso, um lote meio feito é
    // indistinguível de um lote inteiro para qualquer coisa que encadeie comandos.
    if (relatorio.falhas.length > 0) process.exitCode = 1;
    return;
  }

  if (comando === 'completar') {
    // M26 2/N — baixar rotações que faltam de um personagem que JÁ EXISTE na PixelLab.
    //
    // Existe porque as poses de duelo entraram depois de peças já terem sido geradas, e
    // regerá-las custaria gerações por uma imagem que já está pronta do outro lado — as 8
    // rotações nascem juntas e ficam presas ao `characterId` que o manifesto guarda. Esse
    // `characterId` no manifesto deixa de ser procedência e passa a ser ferramenta.
    const unitId = args[1];
    const caminho = join(raizDoRepo, 'packages', 'data', 'unit-art', `${unitId}.json`);
    const arte = JSON.parse(readFileSync(caminho, 'utf8')) as {
      kind: string;
      arquivo?: string;
      duelo?: Record<string, string>;
      procedencia?: { characterId: string };
    };
    if (arte.kind !== 'sprite' || !arte.procedencia) {
      throw new Error(`${unitId} não tem sprite declarado.`);
    }

    const cliente = criarClientePixelLab({ apiKey: process.env.PIXELLAB_API_KEY ?? '' });
    const pronto = await cliente.esperarPersonagem(arte.procedencia.characterId);
    const dirArte = join(raizDoRepo, DIRETORIO_DE_ARTE);
    mkdirSync(dirArte, { recursive: true });

    const duelo: Record<string, string> = {};
    for (const [nome, direcao] of Object.entries(DIRECOES_DE_DUELO)) {
      const url = pronto.rotations[direcao];
      if (!url) throw new Error(`${unitId} não tem a rotação ${direcao} na PixelLab.`);
      writeFileSync(join(dirArte, `${unitId}-${nome}.png`), await cliente.baixar(url));
      duelo[nome] = `${DIRETORIO_DE_ARTE}/${unitId}-${nome}.png`;
    }

    writeFileSync(caminho, `${JSON.stringify({ ...arte, duelo }, null, 2)}\n`);
    console.log(`ok: ${unitId} completado com ${Object.keys(duelo).join(', ')}`);
    return;
  }

  if (comando === 'animar') {
    // M26 — o GOLPE, que é a segunda pergunta que D25 deixou em aberto ("o movimento saiu
    // tímido: pedido um golpe amplo, veio um levantar de espada sem impacto nem recuperação").
    //
    // O padrão aqui é `mode: 'template'` com um template de esqueleto, que é o primeiro dos
    // três caminhos de D25 e o mais controlado dos baratos: o modelo POSICIONA os ossos de um
    // personagem que já existe em vez de sortear cada quadro a partir de um texto. `--modo v3`
    // continua acessível para comparar.
    const unitId = args[1];
    // `--personagem` pula o manifesto. Existe para a BATERIA de comparação: as peças de teste
    // (a mesma unidade gerada em duas resoluções) são dois personagens diferentes do lado da
    // PixelLab e nenhum dos dois está no manifesto de produção.
    const personagemDireto = argumento('personagem');
    const characterId =
      personagemDireto ??
      (() => {
        const arte = JSON.parse(
          readFileSync(join(raizDoRepo, 'packages', 'data', 'unit-art', `${unitId}.json`), 'utf8'),
        ) as { kind: string; procedencia?: { characterId: string } };
        if (arte.kind !== 'sprite' || !arte.procedencia) {
          throw new Error(`${unitId} não tem sprite declarado — anime só quem já tem personagem na PixelLab.`);
        }
        return arte.procedencia.characterId;
      })();

    const cliente = criarClientePixelLab({ apiKey: process.env.PIXELLAB_API_KEY ?? '' });
    const modo = (argumento('modo') ?? 'template') as 'template' | 'v3';
    const template = argumento('template') ?? 'attack';
    const acao = argumento('acao');
    const nome = argumento('nome') ?? template;

    console.log(`animando ${unitId} (${characterId}) — modo ${modo}, ${modo === 'template' ? template : acao}`);
    await cliente.criarAnimacao({
      characterId,
      animationName: nome,
      mode: modo,
      ...(modo === 'template' ? { templateAnimationId: template } : {}),
      ...(acao ? { actionDescription: acao } : {}),
      ...(argumento('quadros') ? { frameCount: Number(argumento('quadros')) } : {}),
      directions: ['south'],
    });

    const pronta = await cliente.esperarAnimacao(characterId, modo === 'template' ? template : nome, 'south');
    const destino = argumento('saida') ?? join(raizDoRepo, 'apps', 'client', 'src', 'art', 'units');
    mkdirSync(destino, { recursive: true });
    let i = 0;
    for (const url of pronta.frames) {
      writeFileSync(join(destino, `${unitId}-${nome}-${String(i).padStart(2, '0')}.png`), await cliente.baixar(url));
      i++;
    }
    console.log(`ok: ${i} quadros em ${destino}`);
    return;
  }

  throw new Error(
    'Uso: pnpm art -- prompts | gerar <unitId> [--tamanho 64] [--seed N] | gerar-todos [--paralelo 4] [--somente N] [--refazer] | completar <unitId> | animar <unitId>',
  );
}

await main();
