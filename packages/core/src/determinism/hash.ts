// §01-fundacoes-tecnicas.md §3.3 — "rodar o mesmo replay 1000 vezes e comparar hash do
// estado final; e rodar em Node e em browser (headless) comparando o hash."
//
// Este módulo existe para dar UM hash canônico que qualquer runtime produz de forma
// idêntica. Duas armadilhas que ele evita de propósito:
//
// 1. `JSON.stringify` NÃO é canônico: a ordem das chaves segue a ordem de inserção do
//    objeto, então dois estados semanticamente iguais montados por caminhos diferentes
//    geram strings diferentes. Por isso serializamos com as chaves ordenadas.
// 2. Qualquer hash baseado em ponto flutuante (ou em `Number` acima de 2^53) reintroduz
//    exatamente o risco que a spec proíbe. FNV-1a roda inteiramente em inteiros de 32
//    bits via operadores bitwise, que o ECMAScript define como ToInt32 — comportamento
//    idêntico em qualquer engine.
//
// Não use este hash para criptografia. Ele serve para detectar divergência, não para
// resistir a adversário.

/** Serialização canônica: chaves ordenadas, sem espaços, `undefined` omitido. */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const t = typeof value;

  if (t === 'number') {
    // Um NaN ou Infinity aqui significa que um cálculo de regra vazou para float e
    // estourou. Falhar alto é melhor que gerar um hash "estável" de um estado inválido.
    if (!Number.isFinite(value as number)) {
      throw new Error(`canonicalize: número não-finito (${String(value)}) no estado — regra vazou para float`);
    }
    if (!Number.isSafeInteger(value as number)) {
      throw new Error(
        `canonicalize: ${String(value)} não é inteiro seguro. Todo número de regra deve ser inteiro em escala 1000 (§3.1).`,
      );
    }
    return String(value);
  }

  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'bigint') return `${(value as bigint).toString()}n`;

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(); // ← a ordenação é o que torna a serialização canônica
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
  }

  throw new Error(`canonicalize: tipo não serializável (${t})`);
}

/**
 * FNV-1a 32 bits. Só operadores bitwise e `Math.imul`, ambos especificados como
 * aritmética de inteiro de 32 bits — sem ponto flutuante em nenhum passo.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hash canônico de qualquer valor do estado, em hexadecimal de 8 dígitos. */
export function hashState(value: unknown): string {
  return fnv1a32(canonicalize(value)).toString(16).padStart(8, '0');
}
