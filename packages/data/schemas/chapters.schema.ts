import { z } from 'zod';
import { idSchema } from './shared.js';

// M27 — o CAPÍTULO, camada nova acima da missão.
//
// **D23 recortou o lançamento em três capítulos de dez missões, e isso é mudança de FORMA
// antes de ser de volume.** Até aqui `encounters` tinha seis capítulos de um encontro cada:
// capítulo *era* missão, e `chapter` era um número solto que só servia para ordenar a lista.
// Não existia onde pendurar "a missão 4 do capítulo 2" — não por falta de espaço, mas porque
// a segunda camada não existia.
//
// **O capítulo NÃO lista as missões dele, e isso é decisão.** É a missão que aponta para
// cima (`chapterId` + `order`). O contrário obrigaria a editar dois arquivos para acrescentar
// uma missão, e um arquivo de índice mantido à mão é a forma clássica de o repositório passar
// a mentir: o diretório tem dez missões, o índice lista nove, e nada reclama. Quem responde
// "quantas missões tem este capítulo?" é a varredura do diretório, que não tem como estar
// dessincronizada de si mesma.
//
// O que o capítulo carrega é só o que a TELA precisa e a missão não sabe: identidade, ordem
// na campanha e nome. Progresso não mora aqui — é do jogador, e vive no servidor.

const chapterSchema = z
  .object({
    id: idSchema,
    // A posição na campanha. Existe pelo mesmo motivo que `chapter` existia na missão:
    // `findJsonFiles` não garante ordem de leitura entre plataformas, então depender da
    // ordem do disco daria uma campanha que muda de ordem conforme o sistema de arquivos.
    order: z.number().int().positive(),
    // O nome é o que o jogador lê. Traduzível por `i18n/conteudo.ts` (M25 3/N) sem tocar
    // neste schema, no mesmo caminho das masmorras e das conquistas.
    name: z.string().min(1),
  })
  .strict();

export type Chapter = z.infer<typeof chapterSchema>;

export default chapterSchema;
