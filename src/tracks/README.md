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
relativa do sol em `sun`. O campo opcional `sky` define `zenith` (cor do alto
do céu) e `ground` (cor do preenchimento vindo do chão). A renderização
acompanha o jogador com essa luz.

A estrada e a grama usam texturas procedurais compartilhadas de
`rendering/terrain-material.ts`, aplicadas em coordenadas do mundo para evitar
emendas entre segmentos. `createBackdrop` adiciona duas camadas de morros
fora dos limites do mapa; cada pista pode escolher sua cor.

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

Abra a nova pista no navegador para conferir a tela inicial, o enquadramento
da largada, materiais, sombras, animação e HUD, além de dirigir e usar itens.
A tela inicial mostra nome, piso e traçado do circuito selecionado. O mapa
é derivado de `layout.curve`, e a troca de pistas usa o registro de circuitos;
novas pistas registradas entram no menu sem alterações na UI.

## Trecho de referência visual

Os primeiros 60 metros da Deepseek Raceway usam a composição
`courses/deepseek-raceway/start-village.ts`: pórtico tropical, canteiros,
bandeiras animadas, passeio de pedra e acabamento das barreiras. A paleta
combina verde-petróleo, creme, dourado e coral. A arquibancada junto à largada
recebe a mesma paleta.

Os modelos de canteiro e bandeira ficam em `decor/props/festival-props.ts`.
Eles retornam `Decoration`, incluindo colisores locais. A composição posiciona
os modelos e transforma seus colisores para o mundo, mantendo os objetos
atrás das barreiras. `mergeStaticDecoration` agrupa a geometria estática por
material; a malha animada das bandeiras permanece separada. Esse helper consome
as geometrias estáticas originais, portanto use-o apenas em grupos que as possuem.

A primeira curva continua essa direção visual em `lagoon-bend.ts`: zebras
contínuas em coral/creme, placas de direção, duas ilhas de vegetação e um
marco "LAGOON BEND". A faixa externa entre `t=0.30` e `0.365` mantém a saída
para a grama. A vegetação aleatória é excluída dessa área de composição para
preservar as placas e a vista da lagoa. O modelo de placa fica em
`decor/props/curve-marker.ts` e aceita direção esquerda ou direita.

## Vulcão e lagoa

`decor/nature/volcano.ts` constrói o perfil irregular, a cratera rebaixada e
os fluxos ramificados de lava. A lava é projetada na malha rochosa durante a
criação; a animação atualiza apenas a cor quente e as instâncias de fumaça.
`decor/nature/lagoon.ts` mantém os colisores da margem e usa pedras mais baixas
no lado voltado à pista. `rendering/painted-water.ts` desenha as faixas de
profundidade, espuma e brilhos suaves por shader, sem imagens externas ou
passes de reflexão. Ambos continuam recebendo sua posição e `update(dt)`.

## Vegetação reutilizável

`decor/nature/trees.ts` oferece copas `round`, `spreading` e `column`, com
volumes assimétricos, tons por vértice e cores por instância. `TreeSpot.variant`
é opcional. `decor/nature/palms.ts` aceita `PalmPlacement.variant` como
`arching`, `compact` ou `tall`, com alturas e inclinações próprias e duas
camadas de folhas. Sem variante explícita, a posição escolhe uma forma
estável, independentemente da ordem dos objetos no array.

Geometrias e materiais são compartilhados; cada variante usa instâncias.
Copas e troncos recebem contorno fino em pixels por `createInstancedOutline`;
as folhas abertas das palmeiras continuam sem extrusão para evitar faces
pretas. As pistas controlam os grupos, espaçamento e colisores: a Raceway
preserva a vista da margem próxima da lagoa, e a Meadow Loop usa pequenos
bosques alternados com espaços abertos. As árvores verificam a distância de
todos os segmentos da pista antes de serem posicionadas.

## Iluminação em corrida

Cada ambiente pode configurar `hemisphere` (cores do céu/solo e intensidade)
e `sun.shadow` (intensidade e raio do filtro PCF). A Raceway combina sol
quente com preenchimento mais frio e sombras com intensidade 0.82; a Meadow
usa um preenchimento um pouco menor. O gradiente compartilhado mantém três
faixas discretas, com o tom escuro mais aberto para preservar detalhes.

`Environment.follow` alinha o centro da projeção aos texels do mapa de
sombras no espaço da luz, mantendo a direção do sol fixa. Isso reduz a
cintilação nas bordas estáticas durante o movimento sem adicionar luzes ou
passes de renderização. `tests/environment.test.ts` verifica a estabilidade
da projeção em deslocamentos pequenos, coordenadas negativas e teleporte,
incluindo um sol vertical. O mapa continua em 2048 × 2048.

## Jardim de retorno

`courses/deepseek-raceway/garden-return.ts` compõe a chicane, a curva oeste e
a reta de retorno (`t=0.50–0.94`). O pavilhão “GROVE TURN” marca a aproximação
da curva; canteiros e bandeiras acompanham a arquibancada coral/creme, e os
bosques deixam livres o ápice e a saída. `inGardenReturn` reserva a área para
essa composição e impede sobreposição com a vegetação procedural.

O modelo `decor/props/garden-pavilion.ts` aceita o texto da placa, retorna
colisores locais e pode ser posicionado em outras pistas. O helper
`decor/race/course-edging.ts` recebe percurso, definição e intervalo: constrói
zebras contínuas, capas, bases e refletores sobre as barreiras, respeitando
`wallGaps`. Os intervalos personalizados precisam entrar em `curbExclusions`
do `RaceDecor` para não sobrepor as zebras genéricas.

Os objetos estáticos são agrupados por material; árvores e plantas usam
instâncias, e apenas as quatro bandeiras atualizam sua geometria. O teste
`Garden Return runoff` preserva a faixa interna de escape entre `t=0.675` e
`0.74`. O obstáculo original dessa faixa mantém posição e colisor, com forma
visual de pedra no lugar de caixa.
