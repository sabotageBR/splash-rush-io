// [kit multiportal] Ponto unico de contato com o portal. So src/main.js importa este modulo
// (test/estilo.test.js). No codigo-fonte ele reexporta o adaptador do californiagames.io (o alvo de
// desenvolvimento: tools/servir.mjs serve a PlataformaSDK em modo autonomo). O tools/empacotar.mjs troca
// a linha abaixo pelo adaptador do alvo (poki, crazygames, crazygames-basic, californiagames) e apaga os
// outros arquivos de src/core/portais/: cada build leva so o portal dela.
export { portal, PLATAFORMA } from './portais/californiagames.js';
