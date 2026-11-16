// Armas dos personagens. Cada tipo pode ter um modelo 3D (GLB) ou usa
// a malha placeholder feita com formas simples. A origem é a empunhadura
// e o cabo aponta para +Y.
import * as THREE from 'three';
import { carregarGltf } from './modelo.js';

const metal = new THREE.MeshStandardMaterial({ color: 0xc9d1d9, metalness: 0.8, roughness: 0.3 });
const madeira = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
const escuro = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.45 });
const ouro = new THREE.MeshStandardMaterial({ color: 0xd4a72c, metalness: 0.7, roughness: 0.35 });

function malha(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function lamina(pontos, espessura) {
  const forma = new THREE.Shape();
  forma.moveTo(...pontos[0]);
  for (const p of pontos.slice(1)) {
    if (p.length === 4) forma.quadraticCurveTo(...p);
    else forma.lineTo(...p);
  }
  forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: false });
  geo.translate(0, 0, -espessura / 2);
  return geo;
}

const MODELOS_ARMA = {
  foice: {
    arquivo: '/models/armas/scythe.glb',
    alturaAlvo: 1.8,
    rotacao: [Math.PI / 2, 0, 0],
    posicao: [0, 0, 0],
  },
  martelo: {
    arquivo: '/models/armas/hummer.glb',
    alturaAlvo: 1.2,
    rotacao: [Math.PI / 2, 0, 0],
    posicao: [0, 0, 0],
  },
};

export function criarArma(tipo) {
  const g = new THREE.Group();
  switch (tipo) {
    case 'espada': {
      g.add(malha(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), madeira));
      g.add(malha(new THREE.SphereGeometry(0.04, 8, 6), ouro, 0, -0.13, 0));
      g.add(malha(new THREE.BoxGeometry(0.3, 0.04, 0.07), ouro, 0, 0.13, 0));
      g.add(malha(new THREE.BoxGeometry(0.075, 0.85, 0.016), metal, 0, 0.58, 0));
      const pontaGeo = new THREE.ConeGeometry(0.053, 0.14, 4);
      pontaGeo.rotateY(Math.PI / 4);
      const ponta = malha(pontaGeo, metal, 0, 1.07, 0);
      ponta.scale.z = 0.2;
      g.add(ponta);
      break;
    }
    case 'foice': {
      g.add(malha(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), madeira, 0, 0.55, 0));
      g.add(malha(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), escuro, 0, 1.4, 0));
      g.add(
        malha(
          lamina(
            [
              [0, 0.07],
              [0.5, 0.24, 0.95, -0.3],
              [0.46, 0.03, 0, -0.07],
            ],
            0.02,
          ),
          metal,
          0,
          1.4,
          0,
        ),
      );
      break;
    }
    case 'machado': {
      g.add(malha(new THREE.CylinderGeometry(0.03, 0.036, 0.95, 8), madeira, 0, 0.35, 0));
      g.add(
        malha(
          lamina(
            [
              [0.02, 0.06],
              [0.2, 0.17],
              [0.4, 0, 0.2, -0.22],
              [0.02, -0.07],
            ],
            0.04,
          ),
          metal,
          0,
          0.72,
          0,
        ),
      );
      g.add(malha(new THREE.BoxGeometry(0.12, 0.12, 0.06), escuro, -0.04, 0.72, 0));
      break;
    }
    case 'martelo': {
      g.add(malha(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8), madeira, 0, 0.4, 0));
      g.add(malha(new THREE.BoxGeometry(0.52, 0.27, 0.27), escuro, 0, 0.98, 0));
      g.add(malha(new THREE.BoxGeometry(0.05, 0.3, 0.3), ouro, 0.17, 0.98, 0));
      g.add(malha(new THREE.BoxGeometry(0.05, 0.3, 0.3), ouro, -0.17, 0.98, 0));
      break;
    }
  }
  return g;
}

// Carrega o modelo 3D da arma (se existir). Retorna a cena dimensionada
// para o tamanho alvo, ou null se não há modelo para esse tipo.
export async function carregarArmaModelo(tipo) {
  const cfg = MODELOS_ARMA[tipo];
  if (!cfg) return null;

  try {
    const gltf = await carregarGltf(cfg.arquivo);
    const cena = gltf.scene.clone();

    cena.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const caixa = new THREE.Box3().setFromObject(cena);
    const tamanho = caixa.getSize(new THREE.Vector3());
    const maior = Math.max(tamanho.x, tamanho.y, tamanho.z);
    const escala = cfg.alturaAlvo / (maior || 1);
    cena.scale.setScalar(escala);

    const centro = caixa.getCenter(new THREE.Vector3());
    cena.position.set(-centro.x * escala, -centro.y * escala, -centro.z * escala);

    const container = new THREE.Group();
    container.add(cena);
    container.rotation.set(...cfg.rotacao);
    container.position.set(...cfg.posicao);
    return container;
  } catch (e) {
    console.warn(`Não carregou modelo da arma ${tipo}:`, e);
    return null;
  }
}
