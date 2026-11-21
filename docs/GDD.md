# Flume Frenzy.io: documento de design

Pasta e slug interno: `splash-rush-io` (porta 5500, prefixo de armazenamento `splashrush.`). Título público:
**Flume Frenzy.io**. O nome de trabalho "Splash Rush.io" colide com o app **Splash Rush** (OVIVO Games / Hyper
Games, App Store, jogo de pintar), então o título mudou em 2026-11-20. Na Poki e na CrazyGames não há jogo com
"Flume Frenzy", e a busca nas lojas também não achou nada (ver "Pesquisa de nome" no fim).

## Em uma frase

Corrida 3D descendo um tobogã gigante (meia-calha com água correndo) num parque aquático, contra 11 a 19 bichinhos
rivais em boias. Arraste para os lados; nas curvas, saia por fora para **voar** e pousar num trecho mais abaixo
(atalho) ou cair na água.

Gênero de referência: corrida de tobogã .io (só a mecânica de gênero). Nome, tema, personagens, parques, regras de
atalho, rampas, eventos e arte são nossos.

## Laço principal (60–90 s)

1. **Largada** na torre: todos parados no topo. O primeiro arrasto do jogador dá a largada (é o `gameplayStart`).
2. **Descida**: a velocidade cresce com a inclinação. O jogador escolhe a linha (dentro, meio, fora) arrastando.
3. **Curvas**: a força para fora empurra o corredor parede acima. Passar da borda = **voo**. Em curva com
   **atalho** (trecho mais abaixo na direção do voo) o pouso pula 80–150 m de tobogã. Errar = cair na lagoa.
4. **Contato**: encostar empurra para o lado. Numa curva, empurrar um rival por fora tira ele da corrida.
5. **Rampas** (a partir da rodada 2): saltam ao longo do tobogã; **turbo** (setas) acelera; **rampa de parede**
   (rodada 6) lança direto para um atalho.
6. **Chegada** (3.1): o tobogã termina numa **rampa grande** que lança todo mundo alto sobre uma piscina comprida. A
   colocação conta na borda da rampa; no voo o jogador faz **manobras** (giro 360, mortal, superman, parafuso) e o
   pouso decide o bônus. Depois vêm a festa curta, o cartão pequeno e a próxima corrida, que começa sozinha ou
   com o botão.

Rodada de quem cai: nas 3 primeiras rodadas (~3,5 min) cair **só atrasa** (volta ao tobogã em 1,2 s no ponto da
queda, com 2 s de proteção). Da 4ª em diante cair elimina da rodada: o jogo mostra a colocação de quem ainda
corria, dá moedas pela distância e segue.

## Rampa final e manobras 3.1 (2026-11-21)

Pedido do usuário na rodada 3 de avaliação, que aprovou a 3.0.0: "No final coloque uma rampa e a opção de fazer
alguma manobra, 360, superman, loop, etc.".

- **Rampa final** (`pista.js`, módulo `chegada`):
  - uma reta de embalo de 30 m a −0,14 e uma rampa de 12 m que sobe a +0,75;
  - o lábio fica a ~7,3 m da água, com setas amarelas subindo e o portal xadrez no lábio.
- **Física da rampa:** a subida freia com a gravidade de verdade (a mesma do voo) e com o atrito da lâmina de água
  (`arrastoRampa` 0,035 × v²). Isso aproxima as velocidades: quem chega no pé da rampa a 25–55 m/s sai a 13–34 m/s.
- **Lançamento:** no ângulo do lábio (~37°), com a velocidade inteira. Voo balístico com g = 9,8, sem ímã nem
  controle de rumo.
- **Medido:**
  - 2,2 a 4,3 s no ar e 24 a 118 m de distância;
  - o ápice típico fica 8 a 20 m acima do lábio.
- **Piscina:** um estádio de 147 × 60 m na direção do salto, com raias, borda branca e ilha de areia. Todo mundo cai
  dentro dela em 12 rodadas × 2 sementes (teste).
- **Chegada justa:** a colocação conta na borda da rampa, na ordem de passagem (evento `cruzou`). Voar mais longe
  ou fazer manobras não muda o lugar. A corrida de cada um acaba ao bater na água (`mergulho`, depois `chegou`).
- **Manobras** (`src/jogo/manobras.js`):
  - **Eixos:** cada eixo tem ângulo e velocidade angular. O giro (360) roda em volta do eixo vertical; o mortal
    (loop) é para trás.
  - **Entrada:** a entrada é um torque (36 e 28 rad/s²; máximo de 14 e 11 rad/s). Um toque de tecla ou um
    deslize rápido vira uma rajada de 0,32 s (giro) ou 0,4 s (mortal), o bastante para passar da metade da volta.
  - **Inércia:** soltou, a rotação continua. O corpo mira a posição em pé mais perto de onde a inércia levaria
    (passou da metade, completa; senão volta) e freia por uma curva de freio limitada (34 rad/s²).
  - **Superman:** baixo estica o corpo, que solta da boia e deita. O momento de inércia vai a 2,4×, e o L = I·ω
    se conserva: esticar freia o giro.
  - **Contagem:** cada volta conta 0,45 rad antes de fechar. Voltas seguidas sem parar viram 720 e mortal duplo;
    mortais separados são dois "mortal". Giro e mortal fechando com até 0,7 s de diferença dão o parafuso.
  - **Pontos:** giro 100 (+50 por volta a mais), mortal 150, superman 120 (longo +80), parafuso 150. Repetir a
    mesma manobra vale metade. O combo multiplica por 1 + 0,5 por manobra a mais, até ×3.
- **Pouso:**
  - limpo (em pé e encolhido): ×1,5;
  - torto: vale o que fez;
  - **barrigada** (de costas ou de lado demais, ou esticado na água): perde tudo, com um leque de água largo,
    tranco de câmera e som de tapa.
  - Moedas = pontos / 100: um combo de 3 manobras com pouso limpo dá ~10 a 18 moedas; o teto fica perto de 40.
- **Bots:** fazem manobras pelo mesmo motor. Planejam pelo tempo de voo que sobra: os bons deixam ~0,4 s de folga;
  os ruins apostam além da conta e hesitam entre manobras. Medido: 70% fecham limpo, ~10% torto e ~20% de
  barrigada. Quem está perto mostra o nome da manobra.
- **Sensação:**
  - **Câmera:** a câmera vai para o lado na altura do corpo, um pouco acima, olhando para baixo (a piscina aparece
    embaixo) e mirando adiante pela velocidade (sem atraso). Assim o mortal vira um giro na tela.
  - **Câmera lenta:** no ápice o tempo cai até 0,5×, e até 0,3× enquanto a mão-guia ensina.
  - **Retorno:** o nome da manobra pipoca com os pontos e o combo. Cada manobra toca um sino só, subindo a escala
    pentatônica com o combo (sem catraca). O pouso perfeito é um acorde e a barrigada é um tapa na água.
  - **Respingo:** proporcional ao impacto. O pouso limpo faz uma coroa alta com brilhos; a barrigada, um leque baixo
    e largo.
- **Mão-guia:**
  - chegando na rampa: "Rampa! Prepare as manobras!";
  - no voo: a mão desliza para o lado e para cima, com a dica de setas no computador e de deslizar no toque;
  - ensina até o jogador fazer uma manobra (no máximo 3 voos; `save.ensinoManobra`).

## Física 3.0 (segunda reformulação, 2026-11-20)

O usuário reprovou a 2.0 na rodada 2 da avaliação ("velocidade ruim, sem física real: sem direção o boneco não cai,
trombando os outros não vão para o lado, a animação passa lentidão, a água não acompanha a velocidade"). Na dúvida
entre "suave e seguro" e "rápido e caótico", a 3.0 escolhe rápido e caótico, mantendo o que a 2.0 resolveu (sem
tremor com 20 corredores, 60 fps, desenho interpolado).

- **Velocidade da descida**: a = gDescida·declive − arrasto·v² − atrito·v²·|k| (curva) − atrito da parede +
  correnteza no meio. O `vmax` da rodada é a velocidade terminal no declive de 9%; nas quedas (módulo `queda`, 30–40%
  de declive) despenca, nas subidas curtas logo depois e nas curvas fechadas perde um pouco; teto em 1,55×vmax. A
  comporta da largada abre com um empurrão e a plataforma termina numa queda de 40%. Média do piloto automático:
  34 m/s (123 km/h) contra 27 m/s na 2.0, corrida de ~47 s (2.0: ~48 s; as pistas ficaram mais longas).
- **Força centrífuga de verdade**: na calha o corredor é um pêndulo (gravidade da calha 16 m/s² para o fundo,
  centrífuga v²·k para fora, amortecimento da água 2,6/s). **A direção é uma inclinação**: força limitada (15 m/s²)
  que só existe enquanto o dedo, o mouse ou a tecla pedem. Sem pedir, na curva fechada o corredor sobe a parede e voa
  pela borda; corrigindo, segura alto na parede; corrigir demais (segurar a correção quando o S vira, ou soltar na hora
  errada) também joga para fora. Numa reta, nem segurando a direção toda se passa da borda.
- **Curvas e atalhos**: curvas fechadas de 28–40 m de raio (mais abertas depois de uma queda), ondas de 52–76 m,
  todas com entrada suave (~20 m). O atalho decola de uma curva seca de 16 m com a borda de fora rebaixada e um
  trampolim (+5 m/s para cima): quem chega pelo lado de fora voa cedo e pousa na pista de pouso (76 m, para os mais
  rápidos pousarem mais adiante); quem chega por dentro decola tarde e torto. As outras três curvas do desvio (24 m)
  entram em clotoide e o desvio é um canal raso (arrasto ×3): quem não voa vai mais devagar e segura.
- **Voo com gravidade real** (9,8 m/s²), controle no ar e ímã de pouso; a queda do desvio é calculada com o declive
  real da decolagem para o voo de projeto (84% do vmax) caber.
- **Trombada**: impulso normal (quem bate por trás freia, quem é batido ganha só 35%) mais um **tranco lateral
  proporcional à velocidade de aproximação** (×3,4 quando o jogador bate, ×2,2 quando é batido, ×1,4 entre bots);
  quem leva desliza solto por até 0,5 s (amortecimento ×0,3, direção quase nula) e vai contra a parede; na curva,
  voa. Toque lento (aproximação abaixo de 0,8 m/s) só separa: nada de vai-e-vem. Jogador um pouco mais pesado (1,35).
  Retorno: **hit-stop** de 35 a 60 ms, tranco curto de câmera, respingo e um baque limpo (um tom grave só).
- **Quedas por modo**: rodadas 1–3 voltam logo adiante (sem derrota nos ~3 primeiros minutos); 4–6, a primeira queda
  volta 30 m atrás e devagar (perde posições); depois, cair tira da corrida.
- **Sensação de velocidade**: câmera baixa e perto (3,4 m + 0,022·v atrás, 2 m acima da parede) que sobe a parede
  atrás do corredor e inclina com ela; FOV que abre até +22° com a velocidade; tremor leve e lento acima de 36 m/s;
  linhas de vento desde 55% do vmax; borrifo lateral mais forte subindo a parede.
- **Texturas que acompanham**: a água da calha corre tobogã abaixo a v do jogador + 7 m/s (UV ligado à velocidade
  dele), com uma camada de espuma esticada a +11 m/s; a calha tem placas a cada 4 m, junta escura com parafusos a cada
  8 m e a borda em faixas vermelhas; anéis de suporte a cada 6 m, postes com luz na borda a cada 12 m e pórticos
  listrados a cada ~60 m passam colados na câmera.
- Medido: 56 testes (inclui: sem entrada sai na primeira curva fechada, trombada lateral leva o outro ≥ meia largura,
  a descida acelera, tremor com 20 corredores); 60 fps com 20 corredores em 1280×720 e 390×844@3; na tela, maior
  sequência de trocas de sinal de um corredor = 2. Gráfico: `docs/velocidade-3.0.png`.

## Física 2.0 (reformulação de 2026-11-20)

O usuário reprovou a 1.0 ("não é fluido, treme com vários jogadores, física péssima"). A 2.0 refaz o movimento com a
sensação do gênero:

- **Pêndulo na calha**: posição = (distância no tobogã, ângulo na calha). A gravidade da calha puxa para o fundo, a
  força de fora da curva (v²·k) empurra para a borda de fora, e a direção é uma força **limitada e amortecida** para
  o alvo do dedo; o arrasto da água fica fora do limite e vale sempre (sem balanço solto).
- **Voar só onde faz sentido**: dá para mirar além da borda **só do lado de fora de uma curva**; numa reta o máximo é
  ~0,7 da parede. A curva do atalho tem a **borda de fora rebaixada** (marcada pelas setas amarelas): quem mira para
  fora voa ali; quem fica no meio passa.
- **Velocidade que cresce** com a descida (fator 1,00 → 1,12 ao longo da pista), correnteza no meio da calha, perda
  alta na parede.
- **Contato sem tremer**: boias são discos; cada par é resolvido uma vez por passo com separação macia e impulso só
  na aproximação (sem quique em toque lento). Com o jogador na batida, o empurrão de lado ganha reforço e derruba quem
  está na borda (contador de derrubados no HUD).
- **Desenho interpolado** entre passos fixos (o laço expõe a fração `alfa`), câmera com seguimento exponencial e
  leve inclinação para dentro das curvas, troca de ângulo do sprite com histerese, giro suavizado, quem passa pela
  câmera some pontilhado. Nenhuma alocação por quadro (pools de partículas, vetores reaproveitados).
- **Sensação de velocidade**: linhas de velocidade em WebGL, FOV que abre, borrifo lateral, rastro de espuma.
- **Placar ao vivo** (top 3 + você), pulo do número na ultrapassagem, **trajetória de pouso** (pontinhos e alvo verde
  ou vermelho) nas rodadas 1–2 e nos 3 primeiros voos da sessão.
- **Som sem catraca**: nada de rajadas repetidas, arpejos rápidos ou tique-tique de moedas; festas e atalho são
  acordes, a moeda é um toque só e espaçado.
- Rodadas mais curtas (~45–60 s), cartão de chegada segue em 4,5 s, contagem de 1,6 s.

## Controles

| Aparelho | Controle |
|---|---|
| Toque e mouse | Apertar e arrastar na horizontal em qualquer lugar da tela: alavanca flutuante (3.0), o deslocamento desde o ponto de apoio (~12% da largura = tudo) é a força da inclinação; passou do raio, o apoio vem junto; soltar zera |
| Teclado | Segurar A/D ou ←/→ inclina (rampa curta); espaço, ESC ou P pausam |
| No ar | O mesmo arrasto corrige o rumo (controle aéreo menor) |
| Voo da rampa final (3.1) | Arrastar ou deslizar para o lado = giro 360; para cima = mortal; para baixo = superman (solta da boia); na diagonal = parafuso. Teclado: ←/→ ou A/D, ↑ ou W, ↓ ou S. Um toque já joga o corpo (rajada) e segurar continua girando. Pare antes da água para cair em pé |

Sem botão de pular nem de acelerar: um gesto só. O cursor do desktop vira a mão de arrastar no tobogã.

## Os 3 primeiros minutos, passo a passo

| Tempo | O que acontece |
|---|---|
| 0:00 | A carga termina já no topo da torre, câmera atrás do jogador (capivara na boia amarela). A mão-guia arrasta para os lados. Sem menu, sem splash. Texto curto: "Arraste para descer!" |
| ~0:02 | Primeiro arrasto: largada. Os 11 rivais da rodada 1 são lentos (70–78% da velocidade) |
| 0:05–0:10 | Primeira curva suave: ensina a ficar dentro. Se o jogador não arrasta em 4 s, a mão volta |
| **~0:12** | **"Uau"**: curva marcada com setas amarelas "↗ VOE". A mão arrasta para fora. O voo é assistido (ímã de pouso forte na rodada 1): o jogador pousa num trecho abaixo e passa metade dos rivais. Câmera abre, confete, "ATALHO!" |
| 0:15–0:55 | Mais duas curvas de atalho (sem ímã total), um trecho reto em pista dupla, e a reta da piscina |
| ~0:55 | Chegada: o jogador quase sempre em 1º. Coroa, "+60", barra da próxima skin enche |
| ~1:05 | Rodada 2 começa sozinha. **Novidade antes do minuto 2: rampa de salto** (setas azuis, mão aponta) |
| ~2:30 | Rodada 3: túnel transparente e turbo. Bots um pouco mais rápidos, alguns empurram |
| ~3:40 | Rodada 4: **parque novo (Vale dos Doces)** e a primeira skin nova (por moedas) quase sempre já saiu |

Ajuda automática por falta de progresso (não só por ócio): sem arrasto por 4 s, ou duas quedas na mesma rodada, ou
mais de 6 s sem passar ninguém nas rodadas 1–2 → mão-guia com o gesto certo (para dentro na curva, para fora no
atalho). Telemetria `ajuda/<rodada>`.

## Novidade a cada ~2 min

| Rodada (≈ minuto) | Novidade |
|---|---|
| 1 (0:00) | Tobogã, curva de atalho com voo assistido |
| 2 (~1:10) | Rampa de salto |
| 3 (~2:30) | Túnel transparente e faixas turbo |
| 4 (~3:40) | Parque **Vale dos Doces** (calha listrada, lagoa de refrigerante, pirulitos) |
| 5 (~5:00) | Evento **Chuva de moedas** (moedas no tobogã, ×2) |
| 6 (~6:20) | Rampa de parede (lança para o atalho) |
| 7 (~7:40) | Parque **Pico Gelado** (gelo: menos atrito, mais rápido) |
| 8 (~9:00) | Evento **Boias gigantes** (todos em boias grandes: empurrão mais forte) |
| 9+ | Parques em rodízio, um evento a cada 2 rodadas (moedas, gigantes, pôr do sol, turbo), pista mais longa e bots melhores |

## Meta longa

- **Coleção**: 18 personagens (bichinhos) e 9 boias. A próxima peça aparece no cartão de chegada com barra de
  moedas ("Próxima: Lontra 60/120"); ao encher, ela sai sozinha com festa e já fica vestida. Na tela Coleção o
  jogador escolhe personagem e boia livremente entre os que já tem.
- **Parques**: 3 (Ilha Tropical, Vale dos Doces, Pico Gelado), abertos pela rodada; ficam no cartão como "próximo
  parque em N corridas".
- **Recorde de coroas** (vitórias) no cartão.
- Moedas: 1º 60, 2º 40, 3º 30, 4º–10º 20, resto 10; eliminado 5 + até 10 pela distância. Uma moeda só, sem
  energia, sem timer. Desde a 3.1 somam-se as moedas das manobras da rampa final (barrigada: zero).

## Gancho diário (leve, sem FOMO)

**Presente do dia**: a primeira corrida de cada dia dá moedas ×2 (selo no topo "🎁 ×2 hoje"). Sem sequência, sem
perda por faltar.

## Anúncios

- **Intervalo comercial** só na pausa natural entre rodadas (depois do cartão de chegada, antes da próxima largada),
  e só depois de 4 rodadas completas **e** 4 min de jogo. Nunca em botão de navegação (Coleção, pausa, som). O
  portal limita a frequência.
- **Premiado** só por escolha, fora da corrida: no cartão de chegada, a partir da rodada 3 e em rodada sim, rodada
  não, "🎬 Moedas ×2" ao lado de "Próxima corrida" (mesmo tamanho, mesma fonte). Prêmio só com `true`. Quem viu o
  premiado não recebe intervalo nessa transição. Some quando o portal não tem vídeo (Basic Launch da CrazyGames).
- **Y8**: o intersticial só sai logo depois do clique em "Próxima corrida" (o avanço automático do cartão nunca pede
  anúncio) e com pelo menos 180 s de jogo desde o anterior; perder o foco da janela abre a pausa.
- Nenhum banner.

## Técnica

- three.js r187 vendorizado (`vendor/three`), importmap, carregado depois do `portal.init()`.
- Tobogã procedural por semente: polilinha de 2 m com rumo, inclinação, largura e tipo (normal, túnel, rampa,
  turbo, atalho). Malha de meia-calha (13 vértices por anel), água em faixa própria com UV animado.
- Lógica pura em `src/jogo/` (sem DOM, sem relógio, sem `Math.random`): `pista.js` (gerador), `corrida.js`
  (física na calha, voo e pouso, contato, chegada, colocação), `bots.js` (IA), `rodadas.js` (roteiro de rodadas),
  `meta.js` (moedas, coleção, presente do dia).
- Personagens e boias: sprites em billboard (InstancedMesh, um atlas), 3 ângulos (de costas, costas-esquerda,
  costas-direita) escolhidos pelo rumo relativo à câmera; a câmera fica sempre atrás.
- Cenário: lagoa com textura, ilhas, palmeiras e props em billboard instanciado, piscina final, céu em cilindro.
- Celular leve: 2 luzes (hemisfério e sol), sem sombra projetada (sombra de bolha), texturas WebP de até 512 px,
  DPR adaptativo pelo fps. Paisagem e retrato (o FOV vertical abre no retrato).
- Build Poki até 8 MB (meta: abaixo de 5 MB).

## Bíblia de arte

- **Tema**: parque aquático de brinquedo, ensolarado, alegre, nada realista. Personagens são **bichinhos
  gordinhos** (capivara, sapo, lontra, tucano, porquinho, gato, pinguim, coala, preguiça, panda-vermelho...) em
  boias redondas. Silhueta lida pequena: orelhas, rabo e cor forte.
- **Paleta** (Ilha Tropical): água turquesa `#2EC4E6`, espuma branca `#FFFFFF`, calha laranja-coral `#FF7A3D`,
  amarelo sol `#FFD23F`, verde folha `#45C86A`, areia `#F6D8A0`, céu `#7FD3FF`; contorno azul-petróleo escuro
  `#12405A`. Doces: rosa `#FF8FC8`, menta `#7FE8C8`, creme. Gelo: azul gelo `#BDEBFF`, branco, lilás claro.
- **Traço**: render 3D estilizado de brinquedo, formas redondas, cel shading em dois tons por cor, contorno fino
  azul-petróleo nos personagens.
- **Luz**: sol do meio-dia vindo de cima à esquerda, sombras frias ciano, brilho especular pequeno na água.
- **Proibido**: texto, letras, números, logos, marca d'água, interface desenhada, rostos humanos.
- **Sprites**: fundo magenta chapado `#FF00FF` (verde `#00FF00` para objeto rosa ou roxo), grade 3×3, sem sombra
  nem chão.

### Bloco de estilo (fim de TODO prompt, sem mudar uma palavra)

```
Art style: polished stylized 3D cartoon mobile game render, soft toy-like rounded shapes, clean cel shading with two tones per color, thin dark teal outline on characters, saturated tropical palette of turquoise water, sunny yellow, coral orange, leaf green and white foam, bright noon sunlight from the upper left with soft cool cyan shadows, readable at small size, no text, no letters, no numbers, no logos, no watermark, no UI.
```

## Pesquisa de nome (2026-11-20)

- "Splash Rush": app **Splash Rush** na App Store (id1482611745, OVIVO Games, vendedor Hyper Games) → colisão.
- "Flume Frenzy": nada na Poki, CrazyGames, App Store ou Google Play. Parecidos sem colisão: "Flume" (quebra-cabeça
  de canos no Steam), "Flume (V2)" (corredor em meia-calha no navegador), "Rafting Frenzy" (Steam), "Frenzy Falls"
  (jogo de cartas).
- Gênero lotado de "Aquapark", "Slide", "Waterpark", "Uphill Rush": evitamos essas palavras.
