# Deepseek Kart — MVP

Um protótipo jogável de kart racer arcade em **HTML + TypeScript + Three.js**.
O objetivo desta fase é sentir e ajustar a física: uma pista, um kart, câmera
chase, aceleração, freio, ré, direção, grama e colisão.

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
npm test          # testes de física e colisão
npm run preview   # preview do build
```

## Controles

| Tecla | Ação |
|---|---|
| `W` / `↑` | Acelerar |
| `S` / `↓` | Frear; depois de parar, ré |
| `A` / `←` | Virar à esquerda |
| `D` / `→` | Virar à direita |
| `R` | Resetar kart e câmera |
| `H` | Mostrar/ocultar ajuda |
| `F3` | Mostrar/ocultar HUD de debug |

## O que está implementado

- Simulação fixa a **60 Hz** com acumulador e interpolação de render.
- Pista de **~374 m** construída só com caixas: retângulo arredondado, quatro
  curvas de raio 18 m, chicane em S e duas áreas de escape na grama.
- Asfalto e grama com transição suave de aceleração, arrasto e grip.
- Kart de caixas com cápsula de dois círculos para colisão.
- Colisão contra OBBs de paredes, obstáculos e limite do mapa, com subpassos.
- Câmera chase com suavização exponencial, FOV por velocidade e pull-in por raycast.
- HUD com velocidade, superfície, `vF`/`vR`, yaw, posição, FPS e ticks.
- Reset por `R` e reset automático se o kart sair do mapa.
- Testes unitários de física e colisão.

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

- Pista completamente plana; não há gravidade, rampas ou saltos.
- Sem drift com botão, hop ou mini-turbo.
- Sem voltas, checkpoints, cronômetro ou posição de corrida.
- Sem segundo kart, IA, itens ou multiplayer.
- Sem áudio, texturas, modelos importados ou menu.
- A colisão é 2D no plano XZ; a altura é ignorada.

## Próximos passos

1. Ajustar a física com base no HUD e no plano.
2. Adicionar drift/hop/mini-turbo.
3. Adicionar voltas/checkpoints e cronômetro.
4. Adicionar um segundo kart com IA simples.
5. Evoluir para itens, mais pistas e apresentação.
