// Efeitos visuais passageiros: área dos golpes, ondas de choque,
// faíscas, números de dano e projéteis.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { criarArma } from './visual/armas.js';

let cena = null;
const ativos = [];
const projeteis = new Map();
const geoArcos = new Map();
const geoFaisca = new THREE.BoxGeometry(0.07, 0.07, 0.07);

export function iniciarEfeitos(scene) {
  cena = scene;
}

function adicionar(obj, duracao, atualizar, atraso = 0) {
  obj.visible = atraso <= 0;
  cena.add(obj);
  ativos.push({ obj, t: -atraso, duracao, atualizar });
}

function geoArco(alcance, arcoGraus) {
  const chave = `${alcance}|${arcoGraus}`;
  if (!geoArcos.has(chave)) {
    const arco = THREE.MathUtils.degToRad(Math.min(arcoGraus, 360));
    // Centralizado em -π/2, que depois de deitar no chão aponta para +z.
    geoArcos.set(chave, new THREE.RingGeometry(0.35, alcance, 40, 1, -Math.PI / 2 - arco / 2, arco));
  }
  return geoArcos.get(chave);
}

// Mostra no chão a área exata do golpe (mesmo alcance/arco que o servidor usa).
export function areaDeGolpe(x, z, rot, alcance, arcoGraus, cor, atraso = 0) {
  const grupo = new THREE.Group();
  grupo.position.set(x, 0.06, z);
  grupo.rotation.y = rot;
  const material = new THREE.MeshBasicMaterial({
    color: cor,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const malha = new THREE.Mesh(geoArco(alcance, arcoGraus), material);
  malha.rotation.x = -Math.PI / 2;
  grupo.add(malha);
  const circulo = arcoGraus >= 360;
  adicionar(
    grupo,
    circulo ? 0.45 : 0.25,
    (k) => {
      const s = circulo ? 0.3 + 0.7 * Math.sqrt(k) : 0.75 + 0.25 * k;
      grupo.scale.set(s, 1, s);
      material.opacity = 0.55 * (1 - k);
    },
    atraso,
  );
  grupo.userData.descartar = () => material.dispose();
}

// Área retangular à frente (ultimate do Guardião).
export function areaRetangular(x, z, rot, comprimento, largura, cor, atraso = 0) {
  const grupo = new THREE.Group();
  grupo.position.set(x, 0.06, z);
  grupo.rotation.y = rot;
  const geo = new THREE.PlaneGeometry(largura, comprimento);
  geo.rotateX(-Math.PI / 2); // deitado no chão, de -c/2 a +c/2 em z
  geo.translate(0, 0, comprimento / 2); // começa no personagem e vai para a frente
  const material = new THREE.MeshBasicMaterial({
    color: cor,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  grupo.add(new THREE.Mesh(geo, material));
  adicionar(
    grupo,
    0.5,
    (k) => {
      grupo.scale.set(1, 1, 0.2 + 0.8 * Math.sqrt(k));
      material.opacity = 0.6 * (1 - k * k);
    },
    atraso,
  );
  grupo.userData.descartar = () => {
    material.dispose();
    geo.dispose();
  };
}

// Execução do Ceifador: um corte vermelho vertical sobre o alvo.
export function execucao(x, z) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xff2030,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const grupo = new THREE.Group();
  grupo.position.set(x, 0, z);
  const lamina = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.2), material);
  lamina.position.y = 1.2;
  lamina.rotation.z = 0.6;
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.4, 40), material);
  anel.rotation.x = -Math.PI / 2;
  anel.position.y = 0.07;
  grupo.add(lamina, anel);
  adicionar(grupo, 0.6, (k) => {
    lamina.scale.set(1 + k * 2, Math.min(1, k * 4), 1);
    anel.scale.setScalar(0.4 + k * 1.2);
    material.opacity = 0.9 * (1 - k);
  });
  grupo.userData.descartar = () => {
    material.dispose();
    lamina.geometry.dispose();
    anel.geometry.dispose();
  };
  faiscas(x, 1.1, z, 0xff2030, 24);
}

export function faiscas(x, y, z, cor = 0xffe0a0, quantidade = 10) {
  const material = new THREE.MeshBasicMaterial({ color: cor, transparent: true });
  const grupo = new THREE.Group();
  grupo.position.set(x, y, z);
  const velocidades = [];
  for (let i = 0; i < quantidade; i++) {
    const m = new THREE.Mesh(geoFaisca, material);
    grupo.add(m);
    velocidades.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(5));
  }
  let ultimo = 0;
  adicionar(grupo, 0.4, (k) => {
    const dt = (k - ultimo) * 0.4;
    ultimo = k;
    grupo.children.forEach((m, i) => {
      velocidades[i].y -= 15 * dt;
      m.position.addScaledVector(velocidades[i], dt);
    });
    material.opacity = 1 - k;
  });
  grupo.userData.descartar = () => material.dispose();
}

// Texto que sobe e some (dano, cura, "esquivou"…). `alvo` é o objeto 3D
// a que o texto fica preso.
export function textoFlutuante(alvo, altura, texto, classe) {
  const el = document.createElement('div');
  const filho = document.createElement('div');
  filho.className = `texto-flutuante ${classe}`;
  filho.textContent = texto;
  filho.style.setProperty('--desvio', `${Math.round((Math.random() - 0.5) * 40)}px`);
  el.appendChild(filho);
  const obj = new CSS2DObject(el);
  obj.position.y = altura;
  alvo.add(obj);
  setTimeout(() => {
    alvo.remove(obj);
    el.remove();
  }, 900);
}

export function criarProjetil({ id, arma, x, z, vx, vz, alcance }) {
  const grupo = new THREE.Group();
  grupo.position.set(x, 1.1, z);
  grupo.rotation.y = Math.atan2(vx, vz);
  const giro = new THREE.Group();
  const modelo = criarArma(arma);
  modelo.position.y = -0.45;
  giro.add(modelo);
  grupo.add(giro);
  cena.add(grupo);
  const vel = Math.hypot(vx, vz) || 1;
  projeteis.set(id, { grupo, giro, vx, vz, resta: alcance / vel + 0.3 });
}

export function fimProjetil({ id, x, z, acertou }) {
  const p = projeteis.get(id);
  if (!p) return;
  cena.remove(p.grupo);
  projeteis.delete(id);
  faiscas(x, 1.1, z, acertou ? 0xff6040 : 0xcccccc, acertou ? 14 : 6);
}

export function atualizarEfeitos(dt) {
  for (let i = ativos.length - 1; i >= 0; i--) {
    const e = ativos[i];
    e.t += dt;
    if (e.t < 0) continue;
    e.obj.visible = true;
    const k = Math.min(1, e.t / e.duracao);
    e.atualizar(k, dt);
    if (k >= 1) {
      cena.remove(e.obj);
      e.obj.userData.descartar?.();
      ativos.splice(i, 1);
    }
  }
  for (const [id, p] of projeteis) {
    p.grupo.position.x += p.vx * dt;
    p.grupo.position.z += p.vz * dt;
    p.giro.rotation.x += dt * 18;
    p.resta -= dt;
    if (p.resta <= 0) {
      cena.remove(p.grupo);
      projeteis.delete(id);
    }
  }
}

export function limparEfeitos() {
  for (const e of ativos) {
    cena.remove(e.obj);
    e.obj.userData.descartar?.();
  }
  ativos.length = 0;
  for (const p of projeteis.values()) cena.remove(p.grupo);
  projeteis.clear();
}
