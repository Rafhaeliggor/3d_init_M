// Arena: carrega o mapa do config.js ou gera uma arena de pedra
// circular (raio = REGRAS.raioArena) cercada de árvores.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REGRAS } from '../shared/regras.js';
import { MAPA } from './config.js';

export async function carregarMapa(scene) {
  if (MAPA.arquivo) {
    try {
      const gltf = await new GLTFLoader().loadAsync(MAPA.arquivo);
      gltf.scene.scale.setScalar(MAPA.escala);
      gltf.scene.position.fromArray(MAPA.posicao);
      gltf.scene.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      scene.add(gltf.scene);
      return;
    } catch (e) {
      console.error(`Não foi possível carregar o mapa ${MAPA.arquivo}:`, e);
    }
  }
  scene.add(criarArena());
}

// Gerador aleatório com semente: o mapa sai igual para todo mundo.
function aleatorio(semente) {
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function criarArena() {
  const R = REGRAS.raioArena;
  const mapa = new THREE.Group();
  const rand = aleatorio(7);

  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, ...extra });
  const grama = mat(0x5f8a3e);
  const pedra = mat(0xb8a98c, { roughness: 0.9 });
  const pedraEscura = mat(0x8a8276, { roughness: 0.9 });
  const linha = mat(0x9d8f74, { roughness: 0.9 });
  const tronco = mat(0x6b4a2f);
  const folhas = mat(0x3f7a35, { flatShading: true });
  const fogo = mat(0xffb347, { emissive: 0xff7a1a, emissiveIntensity: 1.2 });

  const chao = (geo, material, y) => {
    const m = new THREE.Mesh(geo, material);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    mapa.add(m);
    return m;
  };

  chao(new THREE.CircleGeometry(R + 40, 64), grama, 0);
  chao(new THREE.CircleGeometry(R + 0.6, 72), pedra, 0.01);
  // Anéis e linhas no piso ajudam a perceber distância e movimento.
  for (const r of [R * 0.33, R * 0.66]) chao(new THREE.RingGeometry(r - 0.08, r + 0.08, 72), linha, 0.02);
  chao(new THREE.CircleGeometry(1.2, 32), linha, 0.02);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const faixa = chao(new THREE.PlaneGeometry(0.12, R * 0.66), linha, 0.02);
    faixa.position.set(Math.sin(ang) * R * 0.5, 0.02, Math.cos(ang) * R * 0.5);
    faixa.rotation.z = ang;
  }

  // Mureta: blocos de pedra em volta do círculo.
  const blocos = 56;
  const blocoGeo = new THREE.BoxGeometry(1.5, 0.7, 0.7);
  for (let i = 0; i < blocos; i++) {
    const ang = (i / blocos) * Math.PI * 2;
    const b = new THREE.Mesh(blocoGeo, i % 2 ? pedra : pedraEscura);
    const r = R + 0.95;
    b.position.set(Math.sin(ang) * r, 0.35 + rand() * 0.05, Math.cos(ang) * r);
    b.rotation.y = ang;
    b.castShadow = b.receiveShadow = true;
    mapa.add(b);
  }

  // Pilares com tochas.
  const pilarGeo = new THREE.BoxGeometry(0.8, 2.6, 0.8);
  const baciaGeo = new THREE.CylinderGeometry(0.35, 0.2, 0.25, 12);
  const chamaGeo = new THREE.ConeGeometry(0.22, 0.5, 8);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = R + 1.1;
    const pilar = new THREE.Group();
    const corpo = new THREE.Mesh(pilarGeo, pedraEscura);
    corpo.position.y = 1.3;
    const bacia = new THREE.Mesh(baciaGeo, pedraEscura);
    bacia.position.y = 2.72;
    const chama = new THREE.Mesh(chamaGeo, fogo);
    chama.position.y = 3.05;
    pilar.add(corpo, bacia, chama);
    pilar.position.set(Math.sin(ang) * r, 0, Math.cos(ang) * r);
    pilar.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    mapa.add(pilar);
  }

  // Árvores e pedras do lado de fora.
  const troncoGeo = new THREE.CylinderGeometry(0.18, 0.26, 2, 8);
  const copaGeo = new THREE.IcosahedronGeometry(1.4, 0);
  const rochaGeo = new THREE.DodecahedronGeometry(0.5, 0);
  for (let i = 0; i < 90; i++) {
    const ang = rand() * Math.PI * 2;
    const r = R + 5 + rand() * 30;
    const x = Math.sin(ang) * r;
    const z = Math.cos(ang) * r;
    if (i % 4 === 0) {
      const rocha = new THREE.Mesh(rochaGeo, pedraEscura);
      rocha.position.set(x, 0.2, z);
      rocha.scale.setScalar(0.6 + rand() * 1.2);
      rocha.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      rocha.castShadow = true;
      mapa.add(rocha);
      continue;
    }
    const arvore = new THREE.Group();
    const t = new THREE.Mesh(troncoGeo, tronco);
    t.position.y = 1;
    const c = new THREE.Mesh(copaGeo, folhas);
    c.position.y = 2.7;
    arvore.add(t, c);
    arvore.position.set(x, 0, z);
    arvore.scale.setScalar(0.9 + rand() * 0.9);
    arvore.rotation.y = rand() * Math.PI * 2;
    arvore.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    mapa.add(arvore);
  }
  return mapa;
}
