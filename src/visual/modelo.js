// =====================================================================
//  MODELO 3D (.glb / .gltf)
//  Usado quando o personagem tem `modelo` em shared/personagens.js.
//  Enquanto o arquivo carrega (ou se falhar) mostra o boneco placeholder.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { VisualBoneco } from './boneco.js';

const loader = new GLTFLoader();
const cache = new Map();

// Cada arquivo é baixado uma vez; cada personagem recebe uma cópia
// (SkeletonUtils.clone) que anima de forma independente.
export function carregarGltf(arquivo) {
  if (!cache.has(arquivo)) {
    const promessa = loader.loadAsync(arquivo);
    promessa.catch(() => cache.delete(arquivo));
    cache.set(arquivo, promessa);
  }
  return cache.get(arquivo);
}

export function criarVisual(def) {
  return def.modelo?.arquivo ? new VisualModelo(def) : new VisualBoneco(def);
}

// Procura um clip com nome parecido quando o config não diz qual usar.
const PADROES = {
  parado: /idle|parado|stand|breath/i,
  andar: /run|walk|andar|correr|jog/i,
  ataque: /attack|atac|slash|swing|punch|strike/i,
  hab1: /skill|special|dash|spin|throw/i,
  hab2: /buff|block|defend|roar|cast/i,
  esquiva: /roll|dodge|esquiv|evade/i,
  ult: /ult|super|power|special|combo/i,
  dano: /hit|hurt|damage|dano|impact|react/i,
  morrer: /death|die|dead|morr/i,
};

const VERMELHO = new THREE.Color(0xff2020);

export class VisualModelo {
  constructor(def) {
    this.def = def;
    this.raiz = new THREE.Group();
    this.reserva = new VisualBoneco(def);
    this.raiz.add(this.reserva.raiz);
    this.pronto = false;
    this.flash = 0;
    this.ocupadoAte = 0;
    this.t = 0;
    this.morto = false;
    carregarGltf(def.modelo.arquivo)
      .then((gltf) => this.montar(gltf))
      .catch((e) => console.error(`Não foi possível carregar ${def.modelo.arquivo}:`, e));
  }

  montar(gltf) {
    const cfg = this.def.modelo;
    const modelo = SkeletonUtils.clone(gltf.scene);
    modelo.rotation.y = THREE.MathUtils.degToRad(cfg.rotacaoY ?? 0);

    // Mede, redimensiona para a altura do personagem e põe os pés em y = 0.
    const medidor = new THREE.Group();
    medidor.add(modelo);
    medidor.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(modelo);
    const tamanho = caixa.getSize(new THREE.Vector3());
    const centro = caixa.getCenter(new THREE.Vector3());
    const escala = (this.def.altura ?? 1.8) / (tamanho.y || 1);
    modelo.scale.multiplyScalar(escala);
    modelo.position.set(-centro.x * escala, -caixa.min.y * escala, -centro.z * escala);

    // Materiais próprios para o brilho de dano não pintar os outros.
    this.materiais = [];
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const copiar = (m) => {
        const c = m.clone();
        if (c.emissive) this.materiais.push({ material: c, emissiva: c.emissive.clone() });
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(copiar) : copiar(o.material);
    });

    this.mixer = new THREE.AnimationMixer(modelo);
    this.acoes = new Map(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    const nomes = [...this.acoes.keys()];
    this.clips = {};
    for (const [slot, re] of Object.entries(PADROES)) {
      this.clips[slot] = cfg.animacoes?.[slot] ?? nomes.find((n) => re.test(n));
    }
    this.clips.parado ??= nomes[0];
    console.info(`[${this.def.nome}] animações do modelo:`, nomes.join(', '), '→ usando', this.clips);

    this.raiz.remove(this.reserva.raiz);
    this.reserva.descartar();
    this.raiz.add(modelo);
    this.modelo = modelo;
    this.atual = null;
    this.pronto = true;
  }

  tocar(nome, { umaVez = false, duracao = 0 } = {}) {
    const nova = nome && this.acoes.get(nome);
    if (!nova || (nova === this.atual && !umaVez)) return false;
    nova.reset();
    nova.setLoop(umaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    nova.clampWhenFinished = umaVez;
    // Ações: acelera ou desacelera o clip para caber no tempo da habilidade.
    const dur = nova.getClip().duration;
    nova.timeScale = umaVez && duracao ? THREE.MathUtils.clamp(dur / Math.max(duracao, 0.4), 0.5, 3) : 1;
    nova.setEffectiveWeight(1);
    nova.play();
    if (this.atual && this.atual !== nova) nova.crossFadeFrom(this.atual, umaVez ? 0.1 : 0.25, true);
    this.atual = nova;
    if (umaVez) this.ocupadoAte = this.t + dur / nova.timeScale;
    return true;
  }

  acao({ slot, animacao, duracao }) {
    if (!this.pronto) return this.reserva.acao({ slot, animacao, duracao });
    if (this.morto) return;
    this.tocar(this.clips[slot] ?? this.clips.ataque, { umaVez: true, duracao });
  }

  atingido() {
    if (!this.pronto) return this.reserva.atingido();
    this.flash = 1;
    if (this.t >= this.ocupadoAte && this.clips.dano) this.tocar(this.clips.dano, { umaVez: true, duracao: 0.4 });
  }

  atualizar(dt, estado = {}) {
    if (!this.pronto) return this.reserva.atualizar(dt, estado);
    this.t += dt;
    const { mov = 0, morto = false } = estado;

    if (morto && !this.morto) {
      this.morto = true;
      this.tocar(this.clips.morrer, { umaVez: true });
    } else if (!morto && this.morto) {
      this.morto = false;
      this.ocupadoAte = 0;
      this.atual = null;
    }

    if (!this.morto && this.t >= this.ocupadoAte) {
      this.tocar(mov > 0.05 && this.clips.andar ? this.clips.andar : this.clips.parado);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      for (const { material, emissiva } of this.materiais) material.emissive.copy(emissiva).lerp(VERMELHO, this.flash);
    }
    this.mixer.update(dt);
  }

  descartar() {
    if (!this.pronto) return this.reserva.descartar();
    this.mixer.stopAllAction();
    for (const { material } of this.materiais) material.dispose();
  }
}
