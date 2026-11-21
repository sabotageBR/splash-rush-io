// [Flume Frenzy] Elenco: personagens (bichinhos), boias, nomes dos rivais e a ordem da colecao. Os
// indices de personagem e boia sao as celulas dos atlas de arte (src/arte/). Puro.

/** Personagens na ordem das duas grades do Grok (grade A: 0-8, grade B: 9-17). */
export const PERSONAGENS = Object.freeze([
  'capivara', 'sapo', 'lontra', 'tucano', 'gato', 'pinguim', 'coala', 'panda-vermelho', 'patinho',
  'tartaruga', 'corgi', 'guaxinim', 'panda', 'raposa', 'coelho', 'preguica', 'leaozinho', 'urso-polar',
]);

/** Boias na ordem da grade do Grok. */
export const BOIAS = Object.freeze([
  'amarela', 'rosa', 'azul', 'laranja', 'listrada', 'roxa', 'rosquinha', 'turquesa', 'marinheira',
]);

/** Nomes dos rivais (curtos, iguais nos 3 idiomas). */
export const NOMES_BOTS = Object.freeze([
  'Coco', 'Kiwi', 'Mango', 'Bubbles', 'Tiki', 'Zippy', 'Pip', 'Bongo', 'Taco', 'Mochi', 'Puddle', 'Sunny',
  'Gecko', 'Ziggy', 'Paddle', 'Biscuit', 'Nacho', 'Pickles', 'Lulu', 'Peanut', 'Waffles', 'Noodle', 'Juju',
  'Momo', 'Pixel', 'Splashy', 'Dodo', 'Nemi', 'Yuzu', 'Tofu', 'Cookie', 'Bibi',
]);

/** Comeco da colecao: o jogador ja tem estes. */
export const INICIAIS = Object.freeze({ personagens: [0], boias: [0] });

/**
 * Ordem dos desbloqueios (curada: alterna personagem e boia, os mais bonitos primeiro).
 * @type {ReadonlyArray<{ tipo: 'personagem'|'boia', id: number }>}
 */
export const ORDEM_COLECAO = Object.freeze([
  { tipo: 'personagem', id: 2 }, { tipo: 'boia', id: 1 }, { tipo: 'personagem', id: 1 },
  { tipo: 'personagem', id: 5 }, { tipo: 'boia', id: 6 }, { tipo: 'personagem', id: 4 },
  { tipo: 'personagem', id: 3 }, { tipo: 'boia', id: 4 }, { tipo: 'personagem', id: 10 },
  { tipo: 'personagem', id: 13 }, { tipo: 'boia', id: 2 }, { tipo: 'personagem', id: 6 },
  { tipo: 'personagem', id: 12 }, { tipo: 'boia', id: 7 }, { tipo: 'personagem', id: 7 },
  { tipo: 'personagem', id: 9 }, { tipo: 'boia', id: 3 }, { tipo: 'personagem', id: 14 },
  { tipo: 'personagem', id: 11 }, { tipo: 'boia', id: 5 }, { tipo: 'personagem', id: 8 },
  { tipo: 'personagem', id: 15 }, { tipo: 'boia', id: 8 }, { tipo: 'personagem', id: 16 },
  { tipo: 'personagem', id: 17 },
]);
