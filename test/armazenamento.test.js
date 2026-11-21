// [kit multiportal] Armazenamento: prefixo, localStorage quebrado e a fonte do portal (CrazyGames data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarArmazem } from '../src/core/armazenamento.js';

const memoria = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('prefixo obrigatorio e aplicado', () => {
  assert.throws(() => criarArmazem({ prefixo: '' }));
  const ls = memoria();
  const a = criarArmazem({ prefixo: 'jogo.', obterLs: () => ls });
  a.gravar('x', { n: 1 });
  assert.equal(ls.m.get('jogo.x'), '{"n":1}');
  assert.deepEqual(a.ler('x'), { n: 1 });
});

test('localStorage que lanca no getter: o jogo segue na memoria', () => {
  const a = criarArmazem({ prefixo: 'jogo.', obterLs: () => { throw new Error('bloqueado'); } });
  assert.equal(a.gravar('x', 2), false);
  assert.equal(a.ler('x'), 2);
  assert.equal(a.ler('y', 'padrao'), 'padrao');
});

test('fonte do portal: sobe o progresso local e passa a mandar', () => {
  const ls = memoria();
  ls.setItem('jogo.progresso', '{"fase":7}');
  const nuvem = memoria();
  const a = criarArmazem({ prefixo: 'jogo.', obterLs: () => ls });
  a.usarFonte(nuvem, ['progresso']);
  assert.equal(nuvem.m.get('jogo.progresso'), '{"fase":7}');
  nuvem.setItem('jogo.progresso', '{"fase":9}');
  assert.deepEqual(a.ler('progresso'), { fase: 9 });
  a.gravar('progresso', { fase: 10 });
  assert.equal(ls.m.get('jogo.progresso'), '{"fase":10}');
  assert.equal(nuvem.m.get('jogo.progresso'), '{"fase":10}');
});
