// [kit multiportal] Telemetria padrao do estudio (Nettools Games/Conhecimento/Retencao.md, secao
// Telemetria), pelo measure do portal. Os nomes ficam fixos depois de publicados. Nunca '/' nem '^' nos
// campos (o fila-sdk troca por '-').
//   level  <N>  start | complete | fail
//   game   toque | mouse          primeiro gesto de cada tipo na sessao
//   tempo  min-1 .. min-15        minutos de gameplay (1, 2, 3, 5, 7, 10, 15), uma vez cada
//   ajuda  <fase>  mostrou        a ajuda automatica apareceu
//   evento <nome>  <acao>         marcos proprios do jogo (chefe, colecao, loja...)

const MARCOS_MIN = [1, 2, 3, 5, 7, 10, 15];

/**
 * @param {{ measure: (c: string, o: string, a: string) => void }} portal
 */
export function criarTelemetria(portal) {
  let segundos = 0;
  let proximo = 0;
  const gestos = new Set();
  const m = (c, o, a) => {
    try { portal.measure(c, o, a); } catch { /* ignora */ }
  };
  return {
    /** @param {number} n @param {'start'|'complete'|'fail'} acao */
    fase(n, acao) { m('level', String(n), acao); },
    /** @param {'toque'|'mouse'} tipo */
    gesto(tipo) {
      if (gestos.has(tipo)) return;
      gestos.add(tipo);
      m('game', tipo, 'primeiro');
    },
    /** Chamar a cada passo de gameplay ativo (nao em menu, pausa ou anuncio). @param {number} dt s */
    jogando(dt) {
      segundos += dt;
      while (proximo < MARCOS_MIN.length && segundos >= MARCOS_MIN[proximo] * 60) {
        m('tempo', `min-${MARCOS_MIN[proximo]}`, 'jogando');
        proximo++;
      }
    },
    /** @param {number|string} fase */
    ajuda(fase) { m('ajuda', String(fase), 'mostrou'); },
    /** @param {string} nome @param {string} acao */
    evento(nome, acao) { m('evento', nome, acao); },
    get segundos() { return segundos; },
  };
}
