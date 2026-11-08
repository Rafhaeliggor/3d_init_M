# Project Combat

Arena de combate corpo a corpo em 3D, multiplayer, que roda no navegador.
Um computador inicia o servidor e quem estiver no **mesmo Wi-Fi** entra pelo
navegador (PC, notebook, celular com teclado…), sem instalar nada.

- Escolha de personagem logo ao abrir o jogo (só depois aparece na arena)
- 4 personagens: **Espadachim** (espada), **Ceifador** (foice),
  **Bárbaro** (machado) e **Guardião** (martelo), cada um com vida,
  velocidade, ataque, duas habilidades e uma **ultimate** (`F`)
- Combate físico: golpes em arco, empurrão, investida, projétil, área com
  atordoamento, escudo, roubo de vida, esquiva com invulnerabilidade
- Regeneração de vida, **poção** a cada 3 abates (`R`)
- Placar de abates/mortes, renascimento, bots para treinar sozinho

---

## 1. Como iniciar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo (recomendado: versão LTS).

Na pasta do projeto, num terminal:

```bash
npm install      # só na primeira vez (ou quando o package.json mudar)
npm run dev
```

O terminal mostra algo assim:

```
  PROJECT COMBAT (desenvolvimento)

  Neste computador:   http://localhost:3000
  Na rede (Wi-Fi):    http://192.168.0.8:3000   (Wi-Fi)
```

Abra `http://localhost:3000` no seu navegador: a primeira tela é a escolha
de personagem. Digite um nome, escolha e clique em **Lutar!** (ou `Enter`). Para encerrar o servidor: `Ctrl+C`.

> Não abra o `index.html` direto (duplo clique): o jogo precisa do servidor.

## 2. Jogar com outras pessoas no mesmo Wi-Fi

1. Inicie o servidor com `npm run dev` (passo 1).
2. Mande para os amigos o endereço da linha **Na rede (Wi-Fi)**, por exemplo
   `http://192.168.0.8:3000`. Ele também aparece no menu inicial do jogo.
3. Eles abrem esse endereço no navegador, escolhem nome e personagem e
   entram na mesma arena.

Todo mundo luta contra todo mundo. O servidor (o seu computador) é quem
decide os acertos e o dano, então ninguém "ganha" por ter internet melhor.

### Se os outros não conseguirem entrar

| Problema | Solução |
| --- | --- |
| A página não abre no outro aparelho | Confira se ele está **no mesmo Wi-Fi** (não no 4G nem na rede de convidados). |
| Windows perguntou sobre o Firewall na primeira execução | Clique em **Permitir acesso**. Se negou sem querer: *Painel de Controle → Firewall do Windows → Permitir um aplicativo* → marque **Node.js JavaScript Runtime** em Privada e Pública. |
| Ainda bloqueado | Libere a porta manualmente (PowerShell **como administrador**): `New-NetFirewallRule -DisplayName "Project Combat" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow` |
| Endereço mudou | O IP do computador pode mudar ao reconectar no Wi-Fi. Use sempre o que o terminal mostrar. |
| Rede de faculdade/empresa/hotel | Muitas bloqueiam a comunicação entre aparelhos ("isolamento de clientes"). Use o roteador de casa ou o roteador do celular. |
| VPN ligada | Desligue a VPN no computador servidor. |
| "A porta 3000 já está em uso" | Feche o outro servidor ou use outra porta: no PowerShell `$env:PORT=3001; npm run dev` (no CMD: `set PORT=3001 && npm run dev`). |

Se cair a conexão no meio da partida, o jogo reconecta sozinho e volta para
a arena com o mesmo personagem. Se a página recarregar (F5, ou o servidor
reiniciou depois de uma edição), volta para a escolha de personagem, com o
último escolhido já selecionado: é só apertar `Enter`.

### Modo "partida" (mais leve)

`npm run dev` recompila os arquivos na hora, o que é ótimo para editar o
jogo. Para só jogar, a versão compilada carrega mais rápido nos outros
aparelhos:

```bash
npm run jogar     # compila (vite build) e inicia o servidor
```

Depois da primeira compilação dá para iniciar só com `npm start`.

## 3. Controles

| Ação | Tecla |
| --- | --- |
| Andar | `W` `A` `S` `D` ou setas |
| Mirar | Mouse (o personagem ataca na direção do cursor) |
| Ataque básico | Clique esquerdo (segure para repetir) ou `J` |
| Habilidade 1 / 2 | `Q` / `E` |
| Esquiva (rolamento, fica invulnerável) | `Espaço` |
| Ultimate (quando o círculo encher) | `F` |
| Poção (quando o frasco encher) | `R` |
| Zoom | Roda do mouse |
| Menu (trocar personagem, bots) | `Esc` |

### Vida, poção e ultimate

- **Regeneração:** todos recuperam um pouco de vida por segundo, menos o
  Ceifador, que só se cura com o dano que causa (50% do dano de cada golpe) e com o Tufão e a Colheita.
- **Poção:** cada abate enche um terço do frasco. Com 3 abates ele fica
  cheio e `R` recupera 25% da vida. Só dá para carregar uma; os abates
  feitos com o frasco cheio não acumulam.
- **Ultimate:** enche devagar sozinha e bem mais rápido causando ou
  recebendo dano. Cheia, o círculo brilha e `F` a usa.

No menu `Esc` há **Adicionar bot** / **Remover bots** para treinar sozinho
(até 6 bots, que lutam contra todos).

## 4. Personagens

| | Espadachim | Ceifador | Bárbaro | Guardião |
| --- | --- | --- | --- | --- |
| Arma | Espada | Foice | Machado | Martelo |
| Vida | 100 | 90 | 125 | 150 |
| Velocidade | 4,6 m/s | 4,8 m/s | 4,2 m/s | 3,8 m/s |
| Ataque | Corte rápido (12) | Ceifada larga, 2,6 m (11) | Machadada pesada (19) | Marretada que arremessa (23) |
| `Q` | Investida: avança 6 m ferindo | Tufão: rodopia causando 22 (2× o ataque) em volta; cura 10% da vida se pegar alguém | Arremesso: machado em linha reta até 14 m | Terremoto: área de 3,5 m que atordoa |
| `E` | Postura Defensiva: −70% de dano recebido | Colheita: golpe em linha de 6 m à frente (16); cura 25% da vida se acertar | Fúria: +50% de dano, +20% de velocidade | Pele de Pedra: escudo de 40 (máximo 40) |
| `F` | **Sentença:** marca um inimigo (sorteio que favorece quem tem mais abates/vida) por 7 s; todos causam +75% de dano nele. Se ele morrer, o abate é seu, não importa quem matou, e você recupera toda a vida | **Execução:** `F` e clique num inimigo com ≤25% de vida (aparece ☠ no nome) a até 10 m: morte instantânea. Com o cursor já em cima, `F` executa direto | **Imparável:** 6 s com +40% de velocidade e imune a atordoamento, lentidão, empurrões e puxões; funciona até atordoado | **Juízo Final:** martelada numa faixa de 8 × 3 m à frente: 12 de dano e 2 s de atordoamento em todos |
| Regeneração | 1,5/s | 0 (roubo de vida 50%) | 1,5/s | 2/s |

São números iniciais, para ajustar depois.

## 5. Ajustando personagens e habilidades

Tudo está em [`shared/personagens.js`](shared/personagens.js). Esse arquivo
é lido pelo servidor (que calcula o dano) e pelo navegador (menu,
interface), então basta mudar ali. Com `npm run dev` o servidor reinicia
sozinho ao salvar e as páginas abertas recarregam, voltando direto para a
arena com o mesmo personagem.

Cada personagem tem `vida`, `velocidade`, `raio` (tamanho do corpo),
`altura`, `regeneracao`, `rouboVida`, `ataque`, `hab1`, `hab2` e `ult`.
Cada habilidade tem um `tipo`:

| Tipo | O que faz | Campos principais |
| --- | --- | --- |
| `golpe` | Acerta quem está no leque à frente (ou em volta, com `arco: 360`) | `dano`, `alcance`, `arco`, `preparo` |
| `investida` | Avança ferindo quem tocar | `dano`, `distancia`, `duracao` |
| `projetil` | Lança algo em linha reta | `dano`, `velocidade`, `alcance`, `raio` |
| `buff` | Efeito em si mesmo por um tempo | `efeito: { duracao, reducaoDano, rouboVida, multDano, multVelocidade, escudo, escudoMax, imune }` |
| `execucao` (só ult) | Mata quem estiver com pouca vida | `alcance`, `limiteVida` (0,25 = 25%) |
| `marca` (só ult) | Marca um inimigo sorteado | `marca: { duracao, multDanoRecebido }` |

Um `golpe` com `forma: 'retangulo'` usa `comprimento` e `largura` no lugar
de `alcance`/`arco`. A ult não tem `recarga`: usa a carga.

Todos têm `recarga` (segundos) e `duracao` (tempo em que o personagem fica
ocupado). Golpes, investidas e projéteis aceitam também `empurrao` (metros;
negativo puxa), `atordoar` (segundos) e `lentidao: { duracao, mult }`.

Regras gerais (tamanho da arena, tempo para renascer, esquiva,
regeneração padrão, poção e velocidade de carga da ultimate) ficam em
[`shared/regras.js`](shared/regras.js). Câmera e mapa ficam em
[`src/config.js`](src/config.js).

Para criar um quinto personagem, copie um bloco inteiro em
`PERSONAGENS` com outra chave; ele aparece sozinho no seletor.

## 6. Colocando os modelos 3D de cada personagem

Enquanto `modelo` é `null`, o personagem usa o boneco placeholder (formas
simples, animado por código). Para usar um modelo próprio:

1. Exporte/baixe o modelo em **GLB** (ou glTF) com as animações embutidas.
   No Sketchfab: *Download 3D Model → glTF/GLB*, de preferência com os
   filtros **Downloadable** e **Animated**.
2. Coloque o arquivo em `public/models/personagens/`
   (um glTF em `.zip` vira uma subpasta com `scene.gltf`, `scene.bin` e `textures/`).
3. No personagem, em `shared/personagens.js`:

```js
modelo: {
  arquivo: '/models/personagens/espadachim.glb',
  rotacaoY: 0, // gire (0, 90, 180, -90) até ele olhar para a frente ao andar
  animacoes: {
    parado: 'Idle',
    andar: 'Run',
    ataque: 'Slash',   // ataque básico
    hab1: 'Dash',      // habilidade Q
    hab2: 'Block',     // habilidade E
    esquiva: 'Roll',
    ult: 'Special',    // ultimate (F); sem ela usa a animação do ataque
    dano: 'Hit',       // ao ser atingido
    morrer: 'Death',
  },
},
```

O modelo é redimensionado sozinho para a `altura` do personagem e a arma
deve fazer parte do próprio modelo. Os nomes das animações aparecem no
console do navegador (`F12`) quando o modelo carrega; animação omitida é
procurada pelo nome (`Idle`, `Run`, `Attack`, `Death`…). A animação de cada
ação é acelerada ou desacelerada para caber na `duracao` da habilidade.

O alcance real de cada golpe é desenhado no chão quando ele sai, então dá
para conferir se a animação combina com a área de acerto e ajustar
`alcance`/`arco`.

## 7. Como funciona por dentro

```
server/index.js      servidor HTTP + WebSocket (/ws) numa porta só (3000)
server/jogo.js       a partida: recargas, golpes, dano, mortes, bots
shared/personagens.js  personagens e habilidades (servidor e navegador)
shared/regras.js     regras gerais
shared/util.js       geometria (acerto em leque, distância)
src/main.js          liga tudo no navegador
src/menu.js          menu inicial, seletor e vitrine 3D
src/controle.js      teclado/mouse e movimento do seu personagem
src/entidades.js     personagens na tela (interpolação dos outros jogadores)
src/hud.js           vida, habilidades, placar, avisos
src/efeitos.js       área dos golpes, faíscas, projéteis, números de dano
src/mapa.js          arena gerada (ou o mapa do config.js)
src/visual/          boneco placeholder, armas e carregamento de modelos .glb
public/models/       arquivos 3D
```

- Cada navegador move o próprio personagem (resposta imediata) e manda a
  posição 20× por segundo.
- As ações vão para o servidor, que confere a recarga, espera o tempo de
  preparo e calcula quem foi atingido. Dano, morte e empurrões voltam para
  todos.
- Os outros jogadores são desenhados com 100 ms de atraso, interpolando
  entre dois estados, para o movimento ficar liso mesmo com o Wi-Fi oscilando.

**Atalho para testes:** `http://localhost:3000/?personagem=martelo&nome=Ana`
entra direto na arena (chaves: `espada`, `foice`, `machado`, `martelo`).
