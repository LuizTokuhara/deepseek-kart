# Como adicionar uma pista

Cada circuito fica em uma pasta de `courses/`. O jogo recebe um
`CourseDefinition` e reutiliza os mesmos atores, itens, física, IA, HUD e
regras da corrida. A pasta da pista decide o percurso e a composição visual.

## 1. Criar a pasta

Use `courses/meadow-loop/` como exemplo simples ou `courses/deepseek-raceway/`
como exemplo com cenário animado. Crie estes arquivos:

```text
courses/minha-pista/
  layout.ts        percurso e dados usados pela simulação
  environment.ts   céu, neblina e iluminação
  decor.ts         montagem dos componentes do cenário
  index.ts         exportação do circuito completo
```

## 2. Definir o percurso em `layout.ts`

Exporte um `TrackDefinition`, usando um `id` único. Você pode usar
`createRoundedTrackCurve` de `../../curves` ou fornecer sua própria curva
`THREE.CatmullRomCurve3` fechada no plano XZ.

- `width`: largura da pista, em metros.
- `sampleStep`: distância aproximada entre amostras do caminho da IA.
- `spawnT`: posição da largada entre 0 e 1 ao longo da curva.
- `surface`: `dirt` ou `asphalt`; fora do asfalto/terra o terreno é `grass`.
- `checkpointTs`: posições dos checkpoints, na ordem da corrida.
- `checkpointRadius`: raio de passagem dos checkpoints e da chegada.
- `itemRows`: posição `t` de cada fileira e deslocamentos laterais das caixas.
- `wallGaps`: intervalos sem barreira, com `side` igual a -1 ou 1.
- `obstacles`: objetos sólidos definidos em relação ao percurso.
- `bounds`: largura e profundidade do mapa, centralizado na origem.
- `style`: cores e dimensões da estrada, barreiras e limites do mapa.

Importe `DEFAULT_TRACK_STYLE` de `../../style` e sobrescreva as propriedades
que precisar. Ao mudar a largura, ajuste também `style.wallOffset` e
`style.startLine.width`. O pórtico e o quadriculado de `RaceDecor` usam a largura
da pista automaticamente.

Deixe um trecho reto na largada para acomodar o grid de cinco karts. Os
checkpoints devem aparecer depois da largada, em ordem, antes de cruzá-la
novamente. Evite cruzamentos entre trechos: a física atual é plana.

## 3. Definir o ambiente em `environment.ts`

Exporte um `EnvironmentDefinition`, importado de
`../../../rendering/environment`. Configure `background`, os limites da
neblina em `fog`, a luz ambiente em `ambient` e a cor, intensidade e posição
relativa do sol em `sun`. A renderização acompanha o jogador com essa luz.

## 4. Montar a decoração em `decor.ts`

Importe os componentes compartilhados de `../../../decor`. A montagem
específica pertence à pasta da pista; a geometria reutilizável pertence a
`src/decor/`.

```ts
import { buildHills, RaceDecor, type Decoration } from "../../../decor";
import type { TrackLike } from "../../track";

export function createDecor(track: TrackLike): Decoration {
  const decor = new RaceDecor(track, {
    banner: "MINHA PISTA",
    lineColor: 0xffd66b,
    curbColors: [0x3e8dd4, 0xfff3d6],
  });
  // Neste exemplo de circuito oval, o morro fica no miolo, fora da estrada.
  buildHills([{ x: 0, z: 0, sx: 12, sy: 5, sz: 10 }], decor.group);
  return decor;
}
```

Componentes disponíveis:

| Pasta | Componentes |
|---|---|
| `decor/nature/` | Árvores, palmeiras, plantas, pedras, flores, morros, nuvens, lagoa e vulcão |
| `decor/props/` | Arquibancada, balão e placas |
| `decor/race/` | Pórtico, semáforo, quadriculado de largada, zebras e bandeirinhas |

`Decoration` contém `group` e `colliders`, além dos métodos opcionais
`update(dt)` e `setStartLights(label)`. O jogo chama esses métodos e junta os
colisores do cenário aos da pista. Composições com vários componentes devem
encaminhar os métodos aos filhos, como faz `RacewayDecor`.

`createLagoon(x, z)` e `createVolcano(x, z)` retornam componentes com sua própria
animação em `update(dt)`; suas posições padrão são a origem. Os builders de
árvores, nuvens e morros recebem listas de posições e um grupo pai. Árvores
são desenhadas em lotes: adicione os colisores dos troncos na composição,
como no exemplo `MeadowDecor`. Verifique espaço livre nas faixas de corrida,
nas caixas de itens e no grid.

Novos modelos de veículos ficam em `src/actors/`; comportamentos e modelos de
itens ficam em `src/items/`. Esses módulos recebem os dados da pista por
contratos e não devem importar uma pasta de circuito específico.

## 5. Exportar e registrar

Em `index.ts`, reúna as três partes:

```ts
import type { CourseDefinition } from "../../course";
import { layout } from "./layout";
import { environment } from "./environment";
import { createDecor } from "./decor";

export const minhaPista: CourseDefinition = { layout, environment, createDecor };
```

Importe `minhaPista` em `src/tracks/registry.ts` e inclua no array `courses`.
Abra `/?track=<id-do-layout>`. Um identificador ausente ou desconhecido usa
a pista padrão. Não é necessário alterar `Game`.

## 6. Validar

Execute `npm test` e `npm run build`. O teste `tests/courses.test.ts` percorre
todos os circuitos registrados: instancia cenário, karts e itens; verifica
grid, faixas livres e pickups; e simula três voltas com a IA e os colisores.
As texturas de texto das placas são substituídas nesse teste sem navegador.

Abra a nova pista no navegador para conferir enquadramento, materiais,
sombras, animação e HUD, além de dirigir e usar itens.
