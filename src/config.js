// =====================================================================
//  CONFIGURAÇÃO DA CENA
//  Edite este arquivo para trocar o mapa, os modelos disponíveis e os
//  membros. Os arquivos .glb/.gltf ficam em public/models/ (baixados do
//  Sketchfab em "Download 3D Model" > "glTF" ou "GLB").
// =====================================================================

// Mapa (cenário). Se `arquivo` for null, é gerado um mapa simples
// (gramado, caminho, árvores) direto no código.
export const MAPA = {
  arquivo: null, // ex.: '/models/mapa/scene.gltf'
  escala: 1, // ajuste até o mapa ficar em metros (uma porta ~2 m)
  posicao: [0, 0, 0],
};

// Catálogo de modelos. Cada membro escolhe um destes no painel.
//  - alturaMetros: altura real do objeto. O modelo é redimensionado
//    automaticamente para essa altura, então todos ficam proporcionais
//    entre si e ao mapa, mesmo que cada um tenha vindo numa escala diferente.
//  - rotacaoY: graus para girar o modelo até ele olhar para a frente ao
//    andar. Teste 0, 90, 180 ou -90.
//  - animacoes: opcional. Qual clip usar em cada situação: parado, andar,
//    correr, atacar, dano (ao ser atingido) e morrer. O que for omitido é
//    procurado pelo nome ("Idle", "Walk", "Run", "Attack", "Hit", "Death"…).
//    Sem clip de atacar/dano/morrer, o código faz um movimento simples
//    (avançar, piscar em vermelho, tombar).
//  - velocidade: opcional, em m/s ({ andar, correr }). Padrão 1.4 / 4.
//  - combate: opcional. { vida, dano, alcance (m), recarga (s) }.
//    Padrão: vida 100, dano 20, recarga 0,8 s e alcance proporcional
//    à altura do modelo.
export const MODELOS = {
  soldado: {
    nome: 'Soldado',
    arquivo: '/models/personagens/Soldier.glb',
    alturaMetros: 1.8,
    rotacaoY: 180, // este modelo foi exportado olhando para trás
    animacoes: { parado: 'Idle', andar: 'Walk', correr: 'Run' },
  },
  robo: {
    nome: 'Robô',
    arquivo: '/models/personagens/RobotExpressive.glb',
    alturaMetros: 1.5,
    rotacaoY: 0,
    animacoes: { parado: 'Idle', andar: 'Walking', correr: 'Running', atacar: 'Punch', morrer: 'Death' },
  },
  raposa: {
    nome: 'Raposa',
    arquivo: '/models/personagens/Fox.glb',
    alturaMetros: 0.5,
    rotacaoY: 0,
    animacoes: { parado: 'Survey', andar: 'Walk', correr: 'Run' },
    velocidade: { andar: 1, correr: 5 },
    combate: { vida: 60, dano: 15, recarga: 0.5 }, // pequena e rápida
  },
};

// Um personagem por membro do grupo.
//  - modelo: chave de MODELOS usada ao abrir a página.
//  - teclas: códigos de tecla (KeyboardEvent.code) que movem e atacam com
//    este membro. Cada membro tem as suas, então todos jogam ao mesmo tempo.
export const MEMBROS = [
  {
    nome: 'Membro 1',
    modelo: 'soldado',
    posicao: [-3, 0, 0],
    teclas: { frente: 'KeyW', tras: 'KeyS', esquerda: 'KeyA', direita: 'KeyD', correr: 'ShiftLeft', atacar: 'KeyE' },
  },
  {
    nome: 'Membro 2',
    modelo: 'robo',
    posicao: [0, 0, 1],
    teclas: { frente: 'ArrowUp', tras: 'ArrowDown', esquerda: 'ArrowLeft', direita: 'ArrowRight', correr: 'ShiftRight', atacar: 'Enter' },
  },
  {
    nome: 'Membro 3',
    modelo: 'raposa',
    posicao: [3, 0, 0],
    teclas: { frente: 'KeyI', tras: 'KeyK', esquerda: 'KeyJ', direita: 'KeyL', correr: 'KeyU', atacar: 'KeyO' },
  },
];
