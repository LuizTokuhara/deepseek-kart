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
  music.ts         tema musical da corrida
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
- `surface`: `dirt`, `asphalt`, `ice`, `sand` ou `stone`; é o piso base da
  estrada. Fora dela, o padrão é `grass`; use `offroadSurface` para trocar por
  `sand`, por exemplo.
- `surfaceZones`: faixas opcionais `{ from, to, surface }` que trocam o piso ao
  longo da volta. A física, o HUD, o áudio e as partículas leem a mesma zona.
- `style.groundFinish`: textura do terreno fora da pista (`grass`, `sand` ou
  `snow`). Sem esse campo, a textura deriva da superfície base.
- `checkpointTs`: posições dos checkpoints, na ordem da corrida.
- `checkpointRadius`: raio de passagem dos checkpoints e da chegada.
- `itemRows`: posição `t` de cada fileira e deslocamentos laterais das caixas.
- `wallGaps`: intervalos sem barreira, com `side` igual a -1 ou 1.
- `obstacles`: objetos sólidos definidos em relação ao percurso.
- `features`: rampas, buracos de gelo e curvas inclinadas (opcional).
- `bounds`: largura e profundidade do mapa, centralizado na origem.
- `style`: cores e dimensões da estrada, barreiras e limites do mapa.

Importe `DEFAULT_TRACK_STYLE` de `../../style` e sobrescreva as propriedades
que precisar. Ao mudar a largura, ajuste também `style.wallOffset` e
`style.startLine.width`. O pórtico e o quadriculado de `RaceDecor` usam a largura
da pista automaticamente.

Deixe um trecho reto na largada para acomodar o grid de cinco karts. Os
checkpoints devem aparecer depois da largada, em ordem, antes de cruzá-la
novamente. Evite cruzamentos entre trechos: a altura é consultada por uma
projeção na centerline, não por um mesh 3D completo.

### 2.1 Rampas, buracos e curvas inclinadas

`features` é resolvido a partir da própria centerline. As posições usam `t`
(0–1) e as medidas de comprimento/largura estão em metros:

```ts
features: {
  banks: [{ from: 0.19, to: 0.29, angle: -0.2 }],
  ramps: [{ t: 0.072, length: 7, width: 5.2, height: 1.35, lateral: 2.2 }],
  holes: [{ t: 0.12, lateral: -3.6, radiusX: 1.8, radiusZ: 2.2 }],
}
```

- `banks`: inclinação lateral suavizada nas bordas do intervalo. O lado
  externo sobe; o terreno nevado acompanha a inclinação e volta ao nível do
  chão depois das barreiras.
- `ramps`: cunha com perfil linear e apoio nas quatro rodas. Ao cruzar o
  kicker, `rampLaunchAt` converte a subida na direção do movimento em impulso
  vertical, mesmo com apenas duas rodas sobre a rampa. Sair pela lateral ou
  descer de ré não dá impulso. A gravidade controla o voo e o pouso.
  `style.rampStyle` define cor, textura, trilhos e chevrons; sem ele, a rampa
  usa o acabamento de gelo de Vanilla Lake.
- `holes`: elipse no gelo. A queda começa quando o centro do kart entra na
  abertura e o kart alcança a água; saltos podem atravessá-la. A borda branca
  é sólida. `radiusX` é transversal e `radiusZ` é longitudinal; a abertura
  coincide com o raio interno do anel (92% desses raios). Rodas sobre a água
  não puxam o chassi para baixo enquanto o centro permanece no gelo.
- `heightAt`, `bankAt`, `rampLaunchAt`, `holeAt` e `recoveryPoint` ficam em `TrackLike` e são
  consumidos por kart, IA, itens, câmera e decoração. `hazards` expõe os
  buracos para a IA desviar.

### 2.2 Quedas e Lakitu

Cair em um buraco ou sair dos limites não reinicia mais a corrida. O kart cai
por `PHYSICS.fallDuration`, e então `recoveryPoint` devolve o veículo à
centerline alguns metros antes do perigo, evitando buracos, rampas e curvas
muito inclinadas. O tempo de corrida continua; o item equipado é preservado.
O jogador vê o aviso `LAKITU RESCUE!`, respingo de água, som e shake de câmera.
A IA usa a mesma regra e também desvia dos buracos.

## 3. Definir o ambiente em `environment.ts`

Exporte um `EnvironmentDefinition`, importado de
`../../../rendering/environment`. Configure `background`, os limites da
neblina em `fog`, a luz ambiente em `ambient` e a cor, intensidade e posição
relativa do sol em `sun`. O campo opcional `sky` define `zenith` (cor do alto
do céu), `ground` (cor do preenchimento vindo do chão), `blend` (altura em que
o zênite domina; valores menores deixam o azul aparecer mais perto do
horizonte) e `cloudCover` (limiar das nuvens pintadas no céu; padrão 0,6,
valores maiores deixam o céu mais limpo). O disco do sol, o halo e o tom das
nuvens derivam de `sun`. A renderização acompanha o jogador com essa luz.

Lotes estáticos criados com `createBatch(..., shadows = true)` recebem, além da
sombra real perto do jogador, sombras elípticas suaves à distância. Por isso
objetos que se movem ou somem (pinguins, gelo quebrável) não devem usar esse
caminho; malhas instanciadas estáticas montadas à mão podem aderir com
`mesh.userData[BLOB_SHADOW_FLAG] = true`.

A estrada e a grama usam texturas procedurais compartilhadas de
`rendering/terrain-material.ts`, aplicadas em coordenadas do mundo para evitar
emendas entre segmentos. O material aceita `grass`, `dirt`, `asphalt`, `snow`,
`ice`, `sand` e `stone`; pistas de gelo usam `snow` no terreno e `ice` na
estrada, enquanto o deserto usa `sand` no terreno e `stone` no túnel.
`createBackdrop` adiciona duas camadas de morros fora dos limites do mapa;
cada pista pode escolher sua cor.

Fontes de luz (lava, tochas, lâmpadas) usam `glowColor()` de
`rendering/glow.ts` na cor do material. A função eleva a luminância acima do
limiar do bloom sem mudar o matiz: a superfície continua exibindo a cor
original e só o halo revela o brilho. Materiais comuns devem ficar abaixo de
luminância linear ~1,4, ou começam a brilhar; o teste `bloom threshold` cobre a
iluminação de cada pista, então sol/hemisfério/ambiente muito fortes falham ali.

## 3.1 Compor o tema em `music.ts`

Exporte um `SongDefinition`, importado de `../../../audio/music`. A trilha é
sintetizada em tempo real; não há arquivos de áudio. Defina:

- `bpm`, `finalLapTempo` (multiplicador na volta final, ~1,1) e, para jazz,
  `swing` (atraso da colcheia do contratempo em semicolcheias; 0,6 ≈ tercina).
- `key`: tônica e modo (`major`, `minor` ou `phrygian-dominant`). A harmonia
  em terças e a nota vizinha do baixo seguem essa escala.
- `voices`: timbre do solo (`square`, `brass`, `steel`, `bell`, `reed`), do
  acompanhamento (`brass`, `pluck`, `keys`, `steel`) e do baixo (`slap`,
  `synth`, `upright`). Os timbres já saem nivelados entre si.
- `patterns`: grooves de um compasso ou mais, um caractere por semicolcheia.
  No baixo, `r` fundamental, `o` oitava, `5` quinta, `3` terça, `7` sétima,
  `n` vizinha na escala e `a` aproximação cromática do próximo compasso; no
  acompanhamento e na bateria, `x` ataque, `X` acento, `g` nota fantasma,
  `-` sustenta e `.` pausa. `fill` substitui a bateria no último compasso de
  cada seção; `lightDrums` serve às seções com `drums: "light"`.
- `intro` (toca uma vez no GO) e `loop` (repete; a volta final recomeça dele).

Cada seção traz cifras por compasso (`"F | Dm | Gm7 C7 | F"`, com até quatro
acordes por compasso) e a melodia em notas com duração em semicolcheias:
`"c6:3 a5:3 f5:2 g5:2 a5:2 c6:4 | ..."`, com `.` para pausa. Cada compasso
precisa somar 16. `leadVoice` troca o timbre do solo na seção e
`harmony: true` dobra a melodia uma terça abaixo. O prato entra sozinho em
cada seção.

`tests/music.test.ts` compila o tema de toda pista registrada e confere
compassos completos, um loop de pelo menos 40 s, registro de cada camada e que
a melodia cai em nota do acorde em todo tempo forte e troca de acorde. Use
temas originais: não transcreva músicas de outros jogos.

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

Em `index.ts`, reúna as quatro partes:

```ts
import type { CourseDefinition } from "../../course";
import { layout } from "./layout";
import { environment } from "./environment";
import { music } from "./music";
import { createDecor } from "./decor";

export const minhaPista: CourseDefinition = { layout, environment, music, createDecor };
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

## Vanilla Lake

`courses/vanilla-lake/` é a referência de pista com gelo e desnível. O layout
usa `surface: "ice"`, uma curva desenhada à mão de aproximadamente 572 m e
largura de 17 m. A largada fica a oeste; o percurso passa pela travessia norte,
curva dos pinguins, sequência de saltos a leste e slalom de gelo ao sul.
Há cinco trechos inclinados (incluindo uma curva para a esquerda), três
rampas, seis buracos, oito blocos de gelo quebráveis e três travessias de pinguins.
Os blocos formam quatro filas alternadas no slalom sul; os pinguins alternam travessias com pausas que
liberam a linha central.

`lake-scenery.ts` constrói o lago central recortado, o canal norte, as placas
de gelo flutuantes e os gêiseres animados. A água decorativa fica fora da
pista; as aberturas dirigíveis continuam definidas em `features.holes`.
A referência foi adaptada às mecânicas atuais: salto e resgate, sem voo
planado ou condução submersa. As margens usam um anel vazado para não haver
sobreposição entre duas superfícies coplanares de água e gelo.

A decoração combina `buildSnowPines`, `buildSnowmen`, `buildIceBlocks`,
`buildIceCrystals`, `buildSnowDrifts`, `createFrozenPond` e `createPenguin`,
além do pórtico `RaceDecor` com `theme: "ice"` e placas dos setores.
Os filtros de cenário consideram o corredor inteiro e o polígono do lago.

`penguin-crossing.ts` controla os três pontos de travessia do setor nordeste.
Cada sentido tem 4 s de espera, 1,5 s de aviso âmbar e 6,5 s de caminhada;
o ciclo de ida e volta dura 24 s, com defasagens de 0 / 1,2 / 2,4 s entre os
pinguins. Eles param dentro das bordas da pista, sem atravessar as barreiras.
`Decoration.fixedUpdate` avança os obstáculos antes dos karts; `update` continua
reservado aos efeitos visuais. A contagem inicial não avança as travessias e
`reset` restaura o padrão ao reiniciar a corrida. Os mesmos objetos de colisão
são atualizados em lugar, mantendo modelo, projéteis e câmera sincronizados.
`movingObstacles` informa posição e velocidade à IA, que prevê a travessia e
reduz a velocidade quando necessário. Colisores móveis com `heightAware`
permitem saltar por cima quando o kart está acima do pinguim.

O ambiente define `snowfall: { count: 520, radius: 30 }`. O volume acompanha a
câmera, recicla os flocos no shader e usa um único draw call; movimento reduzido
oculta a neve. `ice-detail.ts` fornece uma textura procedural compartilhada para
fraturas, geada e bolhas. Na malha da pista, o atributo `roadEdge` concentra a
geada nas bordas; as rampas mantêm a mesma camada de gelo sem essa máscara lateral.
As marcas claras de derrapagem acompanham a altura e a inclinação do terreno,
e não são emitidas no ar ou sobre aberturas de água.

O impulso de pouso é detectado no tick da física e enviado à suspensão visual,
às partículas e à câmera. O amortecedor usa subpassos; não modifica a trajetória
física. A câmera respeita movimento reduzido e a recuperação de buracos não
é tratada como pouso. Rodas estendem no voo e ajustam o contato individualmente.

O gelo das curvas usa uma malha contínua, gerada pela mesma função de altura
usada pela física. A projeção contínua na curva evita degraus entre amostras.
O chão é um heightfield que segue `bankAt` dentro do corredor da pista e se
mistura ao nível base fora das barreiras. A neve tem resolução suficiente
para não atravessar o lado baixo nas entradas e saídas das curvas. As bordas do gelo recebem uma faixa azul contínua
para manter a pista legível contra a neve. O teste `tests/vanilla-lake.test.ts`
cobre grip menor no gelo, inclinação externa, correspondência entre malha e
física, contato nas transições, decolagem e pouso com duas ou quatro rodas em
30/60/120 Hz, bordas dos buracos, saltos sobre a água e resgate do Lakitu.

As texturas de gelo/neve e os props novos são procedurais; nenhum asset
externo é carregado. Ao reposicionar neve, pinheiros, cristais ou blocos,
mantenha os colisores fora das faixas de corrida e das caixas de item, como
fazem as outras pistas.

`breakable-ice.ts` mantém visual e colisão dos oito blocos no mesmo estado.
O primeiro contato da cápsula quebra o bloco, conserva 60% da velocidade e
libera a passagem para todos os corredores até `reset()`. Não há ricochete nem
respawn durante a volta. `ColliderBox.enabled` remove o volume também das
consultas de projéteis e câmera; `heightAware` permite saltos acima do bloco.
Os estilhaços são reutilizados e animados em `fixedUpdate`, desaparecendo em
0,9 segundo. As pilhas de gelo fora da pista continuam sendo cenário estático.

## Sunstone Ruins

`courses/sunstone-ruins/` é a referência de pista com piso misto e cenário
egípcio. O layout tem aproximadamente 597 m, 16 m de largura e uma curva
desenhada à mão com quatro trechos inclinados, duas rampas de arenito e um túnel
de pedra de 84 m (`t=0.5723–0.7131`). A largada fica na reta da esfinge, a leste
há uma sequência de dunas e o laço interno contorna uma pequena pirâmide.

A pista base reporta `dirt` (areia compactada), mas `offroadSurface: "sand"`
faz a área externa desacelerar como piso solto e emitir poeira clara. O trecho
enterrado usa `surfaceZones`, não uma segunda malha de pista: a mesma
`surfaceAt` devolve `stone` para rodas, IA, HUD, áudio e partículas. O piso de
pedra é desenhado por `Track.addSurfaceOverlays()`, que amostra a centerline,
`heightAt` e a inclinação das curvas. Ele fica 12 mm acima da laje base e usa a
textura procedural `stone` com juntas e blocos irregulares.

`tunnel.ts` fecha o corredor com blocos instanciados em três tons, teto de
lajes escuras, vigas, faixas de hieróglifos, cinco tochas com luzes pontuais
animadas e dois portais com disco solar alado. As paredes acompanham a
centerline e ficam em `±9,25 m`; os colisores substituem as barreiras genéricas
removidas por `wallGaps` entre `t=0.567` e `0.718`. O grupo inteiro recebe
`GROUND_Y`, e os colisores somam a mesma altura para continuar alinhados à
estrada. O símbolo solar no piso é apenas visual.

`monuments.ts` constrói pirâmides de faces inclinadas com alvenaria e ápice
dourado, esfinge com nemes listrado, obeliscos e colunas quebradas. `dunes.ts`
gera uma malha contínua de 560 m com cristas sinuosas, rampas suaves de barlavento
e faces mais íngremes a sotavento. As clareiras preservam as bases dos monumentos;
triângulos próximos da pista são removidos para não cobrir curvas inclinadas.
O teto do túnel também usa uma crista contínua, sem semicúpulas sobrepostas.

`details.ts` compõe o pátio de templo, colunas de papiro, estelas, cerâmicas,
estandartes de linho e a escadaria do oásis. As malhas estáticas são agrupadas
por material e os novos colisores ficam fora da faixa de corrida. `scenery.ts`
agrupa rochas, vegetação seca e o oásis (lago recortado, juncos, vitórias-régias,
palmeiras e ondulações). O túnel recebe painéis pintados de ankhs e discos solares.
As pirâmides principais, esfinge e obeliscos mantêm seus colisores próprios.

O ambiente representa o entardecer próximo das 18h: céu cobre e alaranjado,
bruma cor de damasco, luz âmbar baixa e sombras alongadas. O teto do túnel
bloqueia o sol direto; as tochas aquecem o interior e mantêm a
saída legível. `signMaterial(..., "desert")` e `RaceDecor(theme: "desert")`
compartilham a paleta de arenito, turquesa e dourado.

`tests/sunstone-ruins.test.ts` cobre a troca de superfície nas bordas do túnel,
areia fora da pista, grip da pedra entre asfalto e gelo, desaceleração na areia
e colisores das paredes fora da faixa dirigível. Também verifica por raycast que
as dunas não cobrem as curvas inclinadas, valida o espaço livre dos novos
colisores e limita os lotes de geometria da decoração. `tests/courses.test.ts` também
simula três voltas com a IA e valida a grade, os itens e o cenário completo.
