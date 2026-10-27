# Cena 3D com Three.js

Cena (mapa) com um personagem animado por membro do grupo. O modelo de cada
membro pode ser trocado no painel e cada um se move com as suas próprias
teclas. Cada personagem é redimensionado para a sua altura real, então todos
ficam proporcionais entre si e ao mapa. Cada um tem pelo menos 3 animações, controladas pelo
painel ou pelo teclado.

## Como rodar

Precisa do [Node.js](https://nodejs.org) instalado.

```bash
npm install
npm run dev
```

O navegador abre em `http://localhost:5173`.

> Abrir o `index.html` direto (duplo clique) **não funciona**: o navegador
> bloqueia o carregamento dos arquivos `.glb` fora de um servidor.

## Controles

| Ação | Como |
| --- | --- |
| Selecionar personagem | Clique nele ou no nome no painel |
| Trocar o modelo do membro | Menu **Modelo** no painel (vale para o selecionado) |
| Tocar animação | Botões do painel ou teclas `1`–`9` (selecionado) |
| Girar câmera / zoom | Arrastar o mouse / roda do mouse |
| Velocidade das animações | Controle deslizante no painel |

Cada membro anda com os seus próprios atalhos de teclado (aparecem também na
lista de membros do painel), então todos podem andar ao mesmo tempo:

| Membro | Mover | Correr | Atacar |
| --- | --- | --- | --- |
| Membro 1 | `W` `A` `S` `D` | `Shift` esquerdo | `E` |
| Membro 2 | `↑` `←` `↓` `→` | `Shift` direito | `Enter` |
| Membro 3 | `I` `J` `K` `L` | `U` | `O` |

As direções são relativas à câmera: "frente" é sempre para dentro da tela.

## Combate

- O ataque acerta quem estiver **na frente e dentro do alcance**. Ao atacar, o
  personagem vira sozinho para o inimigo mais próximo que esteja à frente.
- O alcance é proporcional ao tamanho: um personagem de 1,8 m alcança mais
  longe que uma raposa de 0,5 m.
- Quem é atingido perde vida (barra sobre a cabeça e número de dano), pisca em
  vermelho, é empurrado um pouco e fica atordoado por um instante.
- Com a vida em zero, o personagem cai, conta uma morte para ele e um abate
  para quem o derrotou, e renasce no ponto inicial depois de 4 s (pisca e fica
  invulnerável por 1,5 s).
- O placar fica na lista de membros; **Reiniciar luta** zera tudo.

Se o modelo tiver animações de ataque, dano ou morte, elas são usadas. Se não
tiver, o código faz um movimento simples no lugar: dar um bote para frente,
piscar em vermelho, tombar de lado.

## Trocando pelos modelos do Sketchfab

Os modelos que vêm no projeto são só de exemplo (Soldier e RobotExpressive dos
exemplos do three.js, Fox dos exemplos do glTF da Khronos). Para usar os do grupo:

1. Entre em <https://sketchfab.com/3d-models> e busque o modelo.
   - Use os filtros **Downloadable** e **Animated**.
   - Na página do modelo, confira em **Animations** se ele tem **3 ou mais** animações.
2. Clique em **Download 3D Model** (precisa estar logado) e escolha **glTF**
   ou **GLB**.
3. Personagem: coloque o arquivo em `public/models/personagens/`.
   - Se baixou glTF (um `.zip`), extraia a pasta inteira (`scene.gltf`,
     `scene.bin` e `textures/`) numa subpasta, por exemplo
     `public/models/personagens/cavaleiro/`.
4. Mapa: faça o mesmo em `public/models/mapa/`.
5. Edite [`src/config.js`](src/config.js). Os modelos ficam num catálogo
   (`MODELOS`), que é o que aparece no menu **Modelo**; cada membro aponta para
   um deles e tem as suas teclas:

```js
export const MAPA = {
  arquivo: '/models/mapa/scene.gltf',
  escala: 1,
  posicao: [0, 0, 0],
};

export const MODELOS = {
  cavaleiro: {
    nome: 'Cavaleiro',
    arquivo: '/models/personagens/cavaleiro/scene.gltf',
    alturaMetros: 1.8,      // altura real do objeto
    rotacaoY: 0,            // gire (0, 90, 180, -90) até ele olhar para frente ao andar
    // opcional; o que faltar é procurado pelo nome do clip
    animacoes: { parado: 'Idle', andar: 'Walk', correr: 'Run', atacar: 'Attack', dano: 'Hit', morrer: 'Death' },
    combate: { vida: 100, dano: 20, recarga: 0.8 }, // opcional; alcance em metros também
  },
  // ...um bloco por modelo
};

export const MEMBROS = [
  {
    nome: 'Maria',
    modelo: 'cavaleiro',    // chave em MODELOS
    posicao: [-3, 0, 0],
    teclas: { frente: 'KeyW', tras: 'KeyS', esquerda: 'KeyA', direita: 'KeyD', correr: 'ShiftLeft', atacar: 'KeyE' },
  },
  // ...um bloco por membro
];
```

Os nomes das animações de cada modelo aparecem no painel depois que ele carrega;
copie de lá para o campo `animacoes`. O que for omitido é procurado pelo nome
do clip (`Idle`, `Walk`, `Run`, `Attack`/`Punch`, `Hit`, `Death`…). Um modelo sem animação de andar
ainda se move, só que deslizando. Um membro sem `teclas` não se move.

Os nomes das teclas seguem o
[`KeyboardEvent.code`](https://developer.mozilla.org/pt-BR/docs/Web/API/KeyboardEvent/code)
(`KeyQ`, `Digit5`, `ArrowUp`, `Space`, …). Para um quarto membro, por exemplo:
`{ frente: 'KeyT', tras: 'KeyG', esquerda: 'KeyF', direita: 'KeyH', correr: 'KeyR', atacar: 'KeyY' }`.

### Ajustando o mapa

- Se os personagens aparecerem gigantes ou minúsculos em relação ao mapa, ajuste
  `MAPA.escala` (uma porta deve ter uns 2 m, ou seja, um pouco mais alta que um
  personagem de 1,8 m).
- Se ficarem enterrados ou flutuando, ajuste o `y` de `MAPA.posicao` até o chão
  do mapa ficar em `y = 0`.
- Sem mapa (`arquivo: null`), o projeto gera uma praça simples com chafariz,
  postes de 3 m e árvores.

### Créditos

Modelos do Sketchfab normalmente usam licença CC-BY: coloque o nome do autor e o
link de cada modelo usado na entrega.

## Estrutura

```
index.html            página e painel
src/config.js         mapa, catálogo de modelos e membros (edite aqui)
src/main.js           cena, carregamento, animações, controles e combate
src/style.css         estilo do painel
public/models/        arquivos .glb/.gltf
```
