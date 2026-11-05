# Deepseek Kart — MVP

Um protótipo jogável de kart racer arcade em **HTML + TypeScript + Three.js**.
O objetivo desta fase é sentir e ajustar a física: uma pista, dois karts, câmera
chase, aceleração, freio, ré, direção, grama, colisão, drift com hop/mini-turbo,
itens e uma corrida de 3 voltas com cronômetro.

Não há menu, tela inicial, áudio ou arte final.

## Rodar

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite (por padrão `http://localhost:5173`).

Outros comandos:

```bash
npm run build     # typecheck + build de produção
npm test          # testes de física, colisão e pista
npm run preview   # preview do build
```

## Controles

| Tecla | Ação |
|---|---|
| `W` / `↑` | Acelerar |
| `S` / `↓` | Frear; depois de parar, ré |
| `A` / `←` | Virar à esquerda |
| `D` / `→` | Virar à direita |
| `Espaço` / `Shift` | Hop; segure + esterce para drift |
| `E` | Usar o item atual |
| `R` | Reiniciar corrida, kart e câmera |
| `H` | Mostrar/ocultar ajuda |
| `F3` | Mostrar/ocultar HUD de debug |

### Drift e mini-turbo

- Acima de **6 m/s**, segure `Espaço`/`Shift` e esterce para iniciar o drift.
- O hop acontece automaticamente no início.
- O grip cai para **45%** durante o drift: a traseira desliza de verdade, e a
  câmera inclina (yaw + roll) para dar leitura ao drift.
- Dá para **trocar o lado do drift sem soltar o botão**: mantenha o contra-esterço
  por ~0,12 s e o drift, a câmera e a traseira invertem de lado. A carga reinicia.
- A carga vai de 0 a 100% em **~1,6 s**; os níveis mudam em **33% / 66% / 95%**.
- Solte o drift para ativar o mini-turbo:
  - nível 1: 0,45 s e +2,5 m/s de teto;
  - nível 2: 0,65 s e +4,0 m/s;
  - nível 3: 0,90 s e +5,5 m/s.
- O HUD mostra `N1/N2/N3`, a porcentagem e o tempo restante de `BOOST`.

### Corrida

- **3 voltas** por corrida.
- O cronômetro começa no primeiro movimento do kart.
- Existem **3 checkpoints**; eles precisam ser passados na ordem antes de a
  linha de chegada contar a volta.
- O HUD superior mostra volta, tempo total, última volta, melhor volta e o
  progresso dos checkpoints (`CP 0/3`).
- Depois de 3 voltas, o cronômetro congela e o HUD mostra `FINAL`.
- `R` reinicia a corrida e volta ao grid.

### IA e ranking

- Um segundo kart vermelho corre contra o jogador.
- A IA só começa a se mover depois que o jogador sai do lugar.
- Ela segue a centerline com look-ahead de ~1 s, offset de linha de 2,5 m e
  velocidade-alvo de ~58 km/h.
- Karts colidem entre si; a IA também colide com paredes.
- O HUD mostra `POS 1/2`; o ranking usa voltas, checkpoints e distância ao
  próximo gate. Quem termina antes fica à frente.
- `R` devolve os dois karts ao grid e reinicia a corrida.

### Itens

- **Caixas de item** em 4 linhas pela pista (12 caixas no total); cada caixa
  respawna após 3 s.
- O sorteio depende do ranking: quem lidera recebe mais banana/casco; quem está
  atrás recebe mais cogumelo.
- **Banana:** é solta atrás do kart e faz o adversário perder velocidade e controle.
- **Casco:** é disparado para frente, colide com paredes e karts.
- **Cogumelo:** ativa um boost de ~1,1 s, com teto de velocidade extra.
- Um kart atingido perde velocidade e fica ~1 s sem controle.
- A IA também pega itens e usa depois de ~1 s.
- O HUD mostra o item atual em `ITEM`.

## O que está implementado

- Simulação fixa a **60 Hz** com acumulador e interpolação de render.
- Pista de **~374 m** construída só com caixas: retângulo arredondado, quatro
  curvas de raio 18 m, chicane em S e duas áreas de escape na grama.
- Asfalto e grama com transição suave de aceleração, arrasto e grip.
- Kart de caixas com cápsula de dois círculos para colisão.
- Colisão contra OBBs de paredes, obstáculos e limite do mapa, com subpassos.
- Câmera chase com suavização exponencial, FOV por velocidade, lean/roll de drift,
  recuo e FOV extra no boost, e pull-in por raycast.
- Hop, drift com três níveis de carga, traseira visivelmente solta, mini-turbo com
  teto de velocidade extra e chama de boost.
- HUD com velocidade, superfície, `vF`/`vR`, drift/boost, yaw, posição, FPS e ticks.
- Corrida de 3 voltas com checkpoints em sequência, cronômetro total, última e melhor volta.
- Segundo kart com IA por path following, colisão entre karts e ranking `P1/P2`.
- Itens: caixas, banana, casco, cogumelo, hit/spin e uso simples pela IA.
- Reset por `R` (corrida completa) e reset automático se um kart sair do mapa.
- Testes unitários de física, colisão, pista, drift, corrida, IA, ranking e itens.

## Números atuais

| Métrica | Valor aproximado |
|---|---|
| Velocidade máxima no asfalto | 79 km/h (22 m/s) |
| 0 → 95% da máxima | ~4–5 s |
| Frenagem 79 → 0 | ~1,2 s |
| Ré | 6 m/s (22 km/h) |
| Equilíbrio na grama | ~47–50 km/h |
| Raio de curva a 79 km/h | ~17,5 m |
| Raio de curva a 40 km/h | ~7,3 m |
| Mini-turbo nível 3 (teto) | ~99 km/h (27,5 m/s) |
| Carga completa de drift | ~1,6 s |
| FOV extra no boost | +14° |
| Recuo de câmera no boost | +1,4 m |
| Voltas | 3 |
| Checkpoints | 3 |
| Karts | 2 |
| Velocidade-alvo da IA | ~58 km/h (16 m/s) |
| Look-ahead da IA | ~1,0 s |
| Caixas de item | 12 |
| Respawn da caixa | 3 s |
| Boost do cogumelo | ~1,1 s |
| Tempo sem controle ao ser atingido | 1 s |

Todos os números de tuning ficam em [`src/config.ts`](src/config.ts).

## Estrutura

```text
src/
  main.ts              bootstrap
  game.ts              cena, loop, kart visual, wiring
  config.ts            constantes de física, câmera e pista
  input.ts             teclado
  math.ts              clamp, damp, ângulos, rotações 2D
  types.ts             tipos compartilhados
  track.ts             geração da pista, superfícies e colliders
  kart.ts              estado e passo de física
  collision.ts         círculo vs OBB, cápsula, raycast, colisão entre karts
  race.ts              voltas, checkpoints e cronômetro
  ai.ts                path following e controle da IA
  ranking.ts           pontuação de progresso e ranking
  items.ts             caixas, banana, casco, cogumelo e hit/spin
  chase-camera.ts      câmera de perseguição
  hud.ts               overlay de debug e HUD de corrida
tests/
  kart.test.ts
  collision.test.ts
  track.test.ts
  race.test.ts
  ai.test.ts
  ranking.test.ts
  items.test.ts
```

A física não depende de WebGL: `kart.ts` e `collision.ts` podem rodar em testes
headless. Three.js é usado para renderização e para a matemática da pista.

## Debug e tuning

Em modo de desenvolvimento, o jogo é exposto em `window.__deepseekKart`:

```js
window.__deepseekKart.getDebugState()
window.__deepseekKart.teleport(0, 0, 0)
```

Use o HUD para acompanhar `vF`, `vR`, superfície e velocidade. A ordem de tuning
recomendada está em [`plan/MVP.md`](plan/MVP.md), seção 7.5.

## Limitações conhecidas

- Pista completamente plana; não há rampas ou saltos (o hop é vertical, mas não
  permite atravessar paredes).
- Sem multiplayer.
- Sem áudio, texturas, modelos importados ou menu.
- A colisão é 2D no plano XZ; a altura do hop é ignorada pela colisão.
- A IA é um path follower simples, sem drift ou estratégia avançada de itens.

## Próximos passos

1. Ajustar o ritmo da IA, itens e o feel do drift/mini-turbo com base no teste.
2. Adicionar mais itens e tipos de casco.
3. Evoluir para mais pistas e apresentação.
