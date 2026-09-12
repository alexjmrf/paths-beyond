import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { criarTradutor, IDIOMAS } from '../src/i18n/idioma.js';
import { nomeDeConteudo, TIPOS_DE_CONTEUDO, type TipoDeConteudo } from '../src/i18n/conteudo.js';
import { NOMES_AUTORADOS } from './nomesAutorados.js';

// §11/D24 (M25, sub-sessão 3/N) — o texto autorado, traduzível SEM DUPLICAR O DADO.
//
// É a metade do critério de aceite que fala do conteúdo. O que se afirma aqui é o mecanismo:
// o JSON de `packages/data` continua com um nome canônico só, o catálogo de idioma sobrepõe
// por id, e quem não tiver entrada aparece com o nome autorado — nunca com a chave crua.

describe('nomeDeConteudo()', () => {
  it('usa a tradução quando ela existe', () => {
    const t = criarTradutor('en', CATALOGOS);

    expect(nomeDeConteudo(t, 'masmorra', 'dungeon-forja-abandonada', 'Forja Abandonada')).toBe('Abandoned Forge');
  });

  it('cai no nome AUTORADO quando não há tradução — e nunca mostra a chave', () => {
    // É o estado normal de todo conteúdo que ainda não foi traduzido, e vai ser o estado das
    // trinta missões do M27 no dia em que elas forem autoradas.
    const t = criarTradutor('en', CATALOGOS);

    expect(nomeDeConteudo(t, 'skill', 'skill-que-ninguem-traduziu', 'Golpe Duplo')).toBe('Golpe Duplo');
  });

  it('o português também passa pelo mecanismo, e não pelo acaso de o dado ser português', () => {
    const t = criarTradutor('pt', CATALOGOS);

    expect(nomeDeConteudo(t, 'premio', 'achievement-primeiro-passo', 'qualquer coisa')).toBe('Primeiro Passo');
  });

  // M29 — a cobertura DERIVA do catálogo de conteúdo, e não de números escritos à mão.
  //
  // **O que estava aqui antes, e por que era pior do que nenhum teste.** As duas asserções
  // eram `toHaveLength(10)` e `toHaveLength(8)`: os dois tipos que o M25 3/N tinha acabado de
  // traduzir. Elas nunca falharam — e não podiam, porque não falavam dos outros quatro tipos
  // declarados em `TipoDeConteudo`. O arquivo existia para impedir que conteúdo ficasse sem
  // tradução e ficava **vacuamente verde** sobre 81 nomes em português numa build cujo idioma
  // de lançamento é o inglês.
  //
  // É o padrão "lacuna de eixo e não de profundidade" que este projeto já pegou cinco vezes,
  // desta vez dentro do teste escrito para impedi-lo. Consertar a cobertura sem consertar o
  // teste deixaria a próxima omissão passar exatamente igual.
  //
  // **O conserto tem duas metades, e a segunda é a que dura.** A primeira é a varredura do
  // catálogo real, abaixo. A segunda é `TIPOS_DE_CONTEUDO` existir em RUNTIME: o teste
  // percorre os tipos em vez de os listar, e confere que `NOMES_AUTORADOS` cobre todos. Um
  // tipo novo entra na cobertura sozinho e fica vermelho até ser traduzido.
  describe('todo nome autorado tem entrada nas duas línguas', () => {
    it('nenhum tipo declarado fica de fora da conferência', () => {
      // **A asserção que faz as de baixo valerem alguma coisa.** Sem ela, um tipo novo em
      // `TIPOS_DE_CONTEUDO` sem entrada em `NOMES_AUTORADOS` não geraria caso de teste — e
      // "não gerou caso" tem exatamente a mesma cor de "passou".
      //
      // Ela é de RUNTIME porque o `tsconfig` do cliente tem `include: ["src"]`: os testes não
      // são typechecked, então um `Record<TipoDeConteudo, ...>` incompleto não reprovaria
      // `pnpm typecheck`. Descoberto por mutação, depois de eu afirmar o contrário.
      expect(Object.keys(NOMES_AUTORADOS).sort()).toEqual([...TIPOS_DE_CONTEUDO].sort());
    });

    for (const [tipo, nomes] of Object.entries(NOMES_AUTORADOS) as [TipoDeConteudo, Readonly<Record<string, string>>][]) {
      for (const idioma of IDIOMAS) {
        it(`${tipo} × ${idioma}`, () => {
          const t = criarTradutor(idioma, CATALOGOS);
          const semEntrada = Object.keys(nomes).filter((id) => t(`conteudo.${tipo}.${id}`) === `conteudo.${tipo}.${id}`);

          expect(semEntrada, `sem \`conteudo.${tipo}.*\` em ${idioma}`).toEqual([]);
        });
      }
    }

    it('e nenhuma entrada sobra apontando para conteúdo que não existe', () => {
      // A direção contrária: uma entrada `conteudo.masmorra.foo` para uma masmorra que foi
      // removida é tradução que ninguém vê e que a próxima pessoa mantém achando que serve.
      for (const idioma of IDIOMAS) {
        const orfas = Object.keys(CATALOGOS[idioma])
          .filter((c) => c.startsWith('conteudo.'))
          .filter((c) => {
            const [, tipo, ...resto] = c.split('.');
            const nomes = NOMES_AUTORADOS[tipo as TipoDeConteudo];
            return nomes === undefined || nomes[resto.join('.')] === undefined;
          });

        expect(orfas, idioma).toEqual([]);
      }
    });
  });

  it('nome PRÓPRIO não tem entrada — Sylla é Sylla em toda língua', () => {
    // Decisão registrada: criar `conteudo.personagem.*` seria convidar alguém a traduzir o
    // nome de uma pessoa.
    for (const idioma of IDIOMAS) {
      const personagens = Object.keys(CATALOGOS[idioma]).filter((c) => c.startsWith('conteudo.personagem.'));
      expect(personagens, idioma).toEqual([]);
    }
  });
});
