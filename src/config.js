// =====================================================================
//  CONFIGURAÇÃO DO CLIENTE
//  Personagens, habilidades e regras ficam em shared/ (são usados também
//  pelo servidor). Aqui fica só o que é visual.
// =====================================================================

// Mapa (cenário). Se `arquivo` for null, é gerada uma arena de pedra.
// A área jogável é sempre o círculo de raio REGRAS.raioArena no centro.
export const MAPA = {
  arquivo: null, // ex.: '/models/mapa/scene.gltf'
  escala: 1, // ajuste até o mapa ficar em metros (uma porta ~2 m)
  posicao: [0, 0, 0],
};

// Câmera de jogo: distância (m) atrás e acima do seu personagem.
export const CAMERA = {
  altura: 11,
  distancia: 8.5,
  zoomMin: 0.55,
  zoomMax: 1.6,
};
