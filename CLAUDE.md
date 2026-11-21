# CLAUDE.md

Orientação para o Claude Code neste repositório.

## O que é

**Flume Frenzy.io** (pasta e slug interno `splash-rush-io`; "Splash Rush" colidia com um app da App Store): corrida 3D
descendo um tobogã gigante num parque aquático contra 11 a 19 bichinhos rivais (bots locais, sem servidor). Arraste para
os lados; nas curvas, sair por fora faz voar e pousar num trecho mais abaixo (atalho) ou cair na lagoa. Jogo original do
estúdio (nome, tema, personagens e arte próprios) para Poki, CrazyGames, californiagames.io e Y8, a partir do kit
multiportal (`../distribuicao/kit`, ver o README de lá). Catálogo no cofre: `../Nettools Games/Jogos/splash-rush-io.md`.
Design em `docs/GDD.md` (inclui a bíblia de arte e o bloco de estilo do Grok).

## Rodar e testar

- `npm run servir` → http://127.0.0.1:5500/ (a PlataformaSDK em modo autônomo, anúncios simulados).
  Parâmetros só em localhost: `?novo`, `?fase=N` (rodada N), `?semente=N`, `?auto` (piloto automático), `?filme=30`,
  `?semanuncio`, `?lang=pt|en|es`, `?limpo`, `?debug`, `?parque=tropical|doces|gelo`, `?evento=moedas|gigantes|por-do-sol|turbo`.
- `npm test`: gerador do tobogã, física (descida que acelera, sem entrada sai na curva fechada, corrigindo segura,
  corrigir demais sai, voo, pouso, queda, trombada lateral ≥ meia largura), colocação, rodadas simuladas só com bots,
  o teste de tremor com 20 corredores, meta, portais e as fronteiras do código (`test/estilo.test.js`).
  `test/rampa.test.js` (3.1) cobre a rampa final: voo alto que cai na piscina em 12 rodadas e chegada contada na
  borda. Cobre também as manobras: torque e inércia, fechar em pé, rajada, L = I·ω no superman, contagem, combo e
  pouso (limpo, torto, barrigada), e as manobras dos bots.
- Rampa final e manobras em `docs/GDD.md` ("Rampa final e manobras 3.1"). O gancho `__jogo.rampa()` põe o jogador
  no embalo da rampa (prints e gravação).
- Física e números da 3.0 em `docs/GDD.md` ("Física 3.0"); gráfico de velocidade 2.0 × 3.0 em `docs/velocidade-3.0.png`.
- `src/core/laco.js` expõe `alfa` (fração do próximo passo) para o desenho interpolar: correção que deve voltar ao kit.
- `node tools/olhar.mjs --params="auto&semente=3" --em=2,8,20` → mosaico de quadros do jogo (Chrome headless, `?filme`).
- `npm run empacotar` (5 alvos: poki, crazygames, crazygames-basic, californiagames, y8; a Y8 sai `-sem-id` até os ids
  do painel irem para `package.json` → `kit.ids.y8`) e `npm run verificar`; prova do California: de `../distribuicao`,
  `node ferramentas/provar.mjs splash-rush-io`.

## Arquitetura

- `src/main.js`: único módulo que toca portal, DOM, áudio e salvamento. Ciclo do portal como no kit; o three.js e a
  arte entram por `import('./render/mundo.js')` só depois do `portal.init()`.
- `src/jogo/` (puro, determinístico): `pista.js` (gerador procedural por semente: largada, retas, ondas, curvas,
  túneis, rampas, turbo, quedas, atalhos em desvio de 4 curvas que volta na mesma linha mais abaixo, e a chegada
  numa rampa final sobre a piscina), `manobras.js` (3.1: giro, mortal, superman e parafuso com torque e inércia,
  fechar em pé, pontos, combo, pouso e o plano de manobras dos bots), `corrida.js`
  (3.0: velocidade vinda do declive, pêndulo na calha em (s, u) com centrífuga de verdade e a direção como força que
  só age enquanto pedida (`k.dir`), voo 3D com gravidade real e ímã de pouso, água com volta por modo, trombada com
  tranco lateral e boia solta, estado anterior para o desenho interpolar, colocação), `bots.js` (perfis e IA: escolhe
  a linha e pilota com a mesma força do jogador, `pilotar`),
  `rodadas.js` (roteiro: parque, módulos, dificuldade, novidade a cada ~2 rodadas), `meta.js` (moedas, coleção que
  abre sozinha, presente do dia), `montar.js` (monta a rodada e o piloto automático), `elenco.js`, `constantes.js`.
- `src/render/`: `motor.js` (renderer, luzes, qualidade automática), `tobogan.js` (meia-calha com placas, juntas e borda em
  faixas, água em shader correndo a v do jogador + fluxo próprio, anéis de suporte, postes com luz, pórticos, túneis,
  pilares, setas, rampas, torre, piscina), `cenario.js` (lagoa, ilhas, props em billboard, céu e panorama),
  `corredores.js` (boia de trás + bicho + borda da frente da boia em billboard, 3 ângulos), `efeitos.js`, `camera.js` (baixa, sobe a parede e inclina
  com ela, FOV pela velocidade, tremor leve e tranco), `linhas.js` (linhas de vento).
- `src/som/sons.js`: sons sintetizados. `src/i18n/textos.js`: pt, en, es. `src/ui/jogo.css`: HUD, cartão e coleção.
- `src/core/`: kit (não mexer sem motivo; correções voltam para `../distribuicao/kit`).
- `src/arte/`: arte processada (WebP) por `node tools/processar-arte.mjs`. `arte/bruto/`: originais do Grok (fora do
  build). `arte/pedidos/`: os lotes enviados ao Grok. `docs/autoria.md`: prompts e a escolha da arte-chave.

## Regras

- Código, comentários e docs em português; comentários ASCII em `src/jogo/`.
- Nenhum anúncio antes de 4 corridas e 4 min de jogo; intervalo só entre corridas; premiado só por escolha, fora da
  corrida (cartão de chegada a partir da corrida 3 em rodada sim, rodada não, e menu de pausa). Na Y8
  (`portal.intervaloSoNoClique`) o intervalo só sai no clique em "Próxima corrida" e com 180 s desde o anterior;
  `portal.pausaNoBlur` abre a pausa ao perder o foco.
- Armazenamento só com o prefixo `splashrush.` (chaves `save` e `mudo`); nunca `clear()`.
- Toda arte nova pelo `tools/grok.mjs` com o bloco de estilo do `docs/GDD.md`; conferir a olho antes de usar.
- Não fazer commit sem o usuário pedir.
- Registrar atividade no cofre: linha em `Atividades/AAAA-MM-DD.md` e histórico em `Jogos/splash-rush-io.md`.
