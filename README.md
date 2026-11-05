# Deepseek Kart — MVP

Um protótipo jogável de kart racer arcade em **HTML + TypeScript + Three.js**.
O objetivo desta fase é sentir e ajustar a física: uma pista, um kart, câmera
chase, aceleração, freio, ré, direção, grama, colisão e o ciclo de drift com
hop e mini-turbo.

Não há menu, tela inicial, itens, IA, voltas, áudio ou arte final.

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
| `R` | Resetar kart e câmera |
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
- Reset por `R` e reset automático se o kart sair do mapa.
- Testes unitários de física, colisão, pista e drift.

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
  collision.ts         círculo vs OBB, cápsula, raycast
  chase-camera.ts      câmera de perseguição
  hud.ts               overlay de debug
tests/
  kart.test.ts
  collision.test.ts
  track.test.ts
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
- Sem voltas, checkpoints, cronômetro ou posição de corrida.
- Sem segundo kart, IA, itens ou multiplayer.
- Sem áudio, texturas, modelos importados ou menu.
- A colisão é 2D no plano XZ; a altura do hop é ignorada pela colisão.

## Próximos passos

1. Ajustar o feel do drift e do mini-turbo com base no teste.
2. Adicionar voltas/checkpoints e cronômetro.
3. Adicionar um segundo kart com IA simples.
4. Evoluir para itens, mais pistas e apresentação.
