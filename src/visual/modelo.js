// =====================================================================
//  MODELO 3D (.glb / .gltf)
//  Usado quando o personagem tem `modelo` em shared/personagens.js.
//  Enquanto o arquivo carrega (ou se falhar) mostra o boneco placeholder.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { VisualBoneco } from './boneco.js';
import { criarArma, carregarArmaModelo } from './armas.js';

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

// Reutilizados a cada frame para não alocar.
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// Perfis de animação procedural por classe (arma). Cada um define a
// postura de combate (segurando a arma), a cadência do passo, o estilo
// de ataque e o balanço parado — com leves variações entre classes.
//   estanciaR/L = [x,y,z] euler do ombro; anteR/L = cotovelo.
//   passo: freq (velocidade), perna (amplitude da coxa), joelho, braco.
//   ataque: tipo ('corte' | 'varrer' | 'cima') e ampl (força do golpe).
//   idle: freq da respiração/balanço.
const PERFIS = {
  espada: {
    estanciaR: [0.3, 0.3, 1.2], anteR: [0.2, 0, 0],
    estanciaL: [0.3, -0.3, -1.2], anteL: [0.2, 0, 0],
    passo: { freq: 9, perna: 0.55, joelho: 0.75, braco: 0.25 },
    ataque: { tipo: 'corte', ampl: 1.0 },
    idle: { freq: 1.9 },
  },
  foice: {
    estanciaR: [0.25, 0.3, 1.25], anteR: [0.3, 0, 0],
    estanciaL: [0.25, -0.3, -1.25], anteL: [0.3, 0, 0],
    passo: { freq: 8.5, perna: 0.5, joelho: 0.65, braco: 0.22 },
    ataque: { tipo: 'varrer', ampl: 1.2 },
    idle: { freq: 1.7 },
  },
  machado: {
    estanciaR: [0.35, 0.25, 1.15], anteR: [0.25, 0, 0],
    estanciaL: [0.3, -0.3, -1.1], anteL: [0.25, 0, 0],
    passo: { freq: 7.5, perna: 0.6, joelho: 0.85, braco: 0.3 },
    ataque: { tipo: 'cima', ampl: 1.3 },
    idle: { freq: 1.5 },
  },
  martelo: {
    estanciaR: [0.4, 0.25, 1.1], anteR: [0.3, 0, 0],
    estanciaL: [0.35, -0.35, -1.05], anteL: [0.3, 0, 0],
    passo: { freq: 6.5, perna: 0.6, joelho: 0.9, braco: 0.3 },
    ataque: { tipo: 'cima', ampl: 1.5 },
    idle: { freq: 1.35 },
  },
};

// Empunhadura da arma na mão:
//   rot = rotação [x, y, z] da arma na mão (radianos):
//         x = perpendicular ao antebraço (eixo da mão)
//         y = gira em torno do próprio cabo (lado da lâmina/cabeça)
//         z = inclina / vira a ponta para frente ou trás
//   pos = translação [x, y, z] da arma na mão (depois das rotações):
//         y = sobe/desce pelo cabo (positivo escorrega da lâmina p/ o punho)
//         x = move para o lado,  z = move para frente/trás
const GRIP = {
  espada: { rot: [Math.PI / 2, Math.PI / 2, 0], pos: [-0.05, 0, -0.1] },
  machado: { rot: [Math.PI / 2, Math.PI / 2, 0], pos: [-0.05, 0, -0.1] },
  martelo: { rot: [Math.PI / 2, Math.PI / 2, 0], pos: [-0.05, 0, -0.04] },
  foice: { rot: [Math.PI / 2, Math.PI, Math.PI], pos: [-0.05, 0.4, -0.04] },
};

function adicionarMeshesAoModelo(gltf, modelo, bonesPorNome, materiais, corTingir) {
  const cenaClone = SkeletonUtils.clone(gltf.scene);
  const meshes = [];
  cenaClone.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });

  for (const mesh of meshes) {
    const copiar = (m) => {
      const c = m.clone();
      if (corTingir && !/MI_(Regular|Eyes|Superhero)/i.test(c.name)) c.color.multiply(corTingir);
      if (c.emissive) materiais.push({ material: c, emissiva: c.emissive.clone() });
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copiar) : copiar(mesh.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const bindMat = mesh.bindMatrix.clone();
    const novosBones = mesh.skeleton.bones.map((b) => bonesPorNome.get(b.name) || b);
    const novasInversas = mesh.skeleton.boneInverses.map((m) => m.clone());
    mesh.parent?.remove(mesh);
    modelo.add(mesh);
    mesh.bind(new THREE.Skeleton(novosBones, novasInversas), bindMat);
  }
}

export class VisualModelo {
  constructor(def) {
    this.def = def;
    this.raiz = new THREE.Group();
    this.raiz.visible = false;
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

    this.materiais = [];
    const corClasse = new THREE.Color(this.def.cor);
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const copiar = (m) => {
        const c = m.clone();
        if (/MI_(Peasant|Ranger)/i.test(c.name)) c.color.multiply(corClasse);
        if (c.emissive) this.materiais.push({ material: c, emissiva: c.emissive.clone() });
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(copiar) : copiar(o.material);
    });

    this.temAnimacoes = gltf.animations.length > 0;
    this.mixer = new THREE.AnimationMixer(modelo);
    this.acoes = new Map(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    const nomes = [...this.acoes.keys()];
    this.clips = {};
    for (const [slot, re] of Object.entries(PADROES)) {
      this.clips[slot] = cfg.animacoes?.[slot] ?? nomes.find((n) => re.test(n));
    }
    this.clips.parado ??= nomes[0];
    console.info(`[${this.def.nome}] animações do modelo:`, nomes.join(', ') || '(nenhuma — usando procedural)', '→ usando', this.clips);

    // Procedural animation state for models without clips.
    this.recuo = 0;
    this.acaoProc = null;
    this.morteProc = null;
    this.baseY = -caixa.min.y * escala;

    this.raiz.add(modelo);
    this.raiz.visible = true;
    this.modelo = modelo;
    this.atual = null;
    this.pronto = true;

    this.adicionarCabeca(modelo, escala);
    this.prepararAnim(modelo);
    this.anexarArma(modelo, escala);
  }

  adicionarCabeca(modelo, escalaModelo) {
    const cfg = this.def.modelo;
    const bonesPorNome = new Map();
    modelo.traverse((o) => { if (o.isBone) bonesPorNome.set(o.name, o); });

    const promessas = [];

    const corClasse = new THREE.Color(this.def.cor);

    if (cfg?.cabeca) {
      promessas.push(
        carregarGltf(cfg.cabeca).then((gltf) => {
          adicionarMeshesAoModelo(gltf, modelo, bonesPorNome, this.materiais, null);
        })
      );
    }

    if (cfg?.capuz) {
      promessas.push(
        carregarGltf(cfg.capuz).then((gltf) => {
          adicionarMeshesAoModelo(gltf, modelo, bonesPorNome, this.materiais, corClasse);
        })
      );
    }

    if (cfg?.cabelos) {
      const corCabelo = cfg.corCabelo ? new THREE.Color(cfg.corCabelo) : null;
      for (const cabelo of cfg.cabelos) {
        promessas.push(
          carregarGltf(cabelo).then((gltf) => {
            adicionarMeshesAoModelo(gltf, modelo, bonesPorNome, this.materiais, corCabelo);
          })
        );
      }
    }

    Promise.all(promessas).catch((e) => console.warn('Não carregou cabeça:', e));
  }

  prepararAnim(modelo) {
    const achar = (n) => {
      let b = null;
      modelo.traverse((o) => { if (o.isBone && o.name === n) b = o; });
      return b;
    };
    this.ossos = {};
    const nomes = [
      'upperarm_r', 'lowerarm_r', 'upperarm_l', 'lowerarm_l',
      'thigh_r', 'thigh_l', 'calf_r', 'calf_l',
      'spine_02', 'spine_01', 'Head',
    ];
    for (const n of nomes) {
      const b = achar(n);
      if (b) { b.userData.rest = b.quaternion.clone(); this.ossos[n] = b; }
    }
    this.perfil = PERFIS[this.def.arma] ?? PERFIS.espada;
    this.faseAndar = 0;
    this.animarEsqueleto(0, 0); // já entra na postura de combate (evita T-pose)
  }

  // Aplica rest * euler(x,y,z) ao osso (rotação local sobre a bind pose).
  poseOsso(nome, x, y, z) {
    const b = this.ossos[nome];
    if (!b) return;
    _e.set(x, y, z);
    _q.setFromEuler(_e);
    b.quaternion.copy(b.userData.rest).multiply(_q);
  }

  anexarArma(modelo, escalaModelo) {
    let maoR = null;
    modelo.traverse((o) => {
      if (o.isBone && o.name === 'hand_r') maoR = o;
    });
    if (!maoR) return;
    this.maoR = maoR;

    const cfg = GRIP[this.def.arma] ?? GRIP.espada;

    // Grupo da empunhadura: rotaciona e translada a arma na mão.
    const cabo = new THREE.Group();
    cabo.rotation.set(...(cfg.rot ?? [0, 0, 0]));
    cabo.position.set(...(cfg.pos ?? [0, 0, 0]));
    maoR.add(cabo);

    const escalaInv = 1 / escalaModelo;
    const placeholder = criarArma(this.def.arma);
    placeholder.scale.setScalar(escalaInv);
    cabo.add(placeholder);
    this.armaGrupo = placeholder;

    carregarArmaModelo(this.def.arma).then((arma3d) => {
      if (!arma3d) return;
      arma3d.scale.multiplyScalar(escalaInv);
      cabo.remove(placeholder);
      cabo.add(arma3d);
      this.armaGrupo = arma3d;
    });
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
    if (!this.pronto) return;
    if (this.morto) return;
    if (this.temAnimacoes) {
      this.tocar(this.clips[slot] ?? this.clips.ataque, { umaVez: true, duracao });
    } else {
      this.acaoProc = { t: 0, dur: Math.max(duracao ?? 0.3, 0.25) };
    }
  }

  atingido() {
    if (!this.pronto) return;
    this.flash = 1;
    if (this.temAnimacoes) {
      if (this.t >= this.ocupadoAte && this.clips.dano) this.tocar(this.clips.dano, { umaVez: true, duracao: 0.4 });
    } else {
      this.recuo = 1;
    }
  }

  atualizar(dt, estado = {}) {
    if (!this.pronto) return;
    this.t += dt;
    const { mov = 0, morto = false } = estado;

    if (morto && !this.morto) {
      this.morto = true;
      if (this.temAnimacoes) {
        this.tocar(this.clips.morrer, { umaVez: true });
      } else {
        this.morteProc = 0;
      }
    } else if (!morto && this.morto) {
      this.morto = false;
      this.ocupadoAte = 0;
      this.atual = null;
      this.morteProc = null;
    }

    if (this.temAnimacoes) {
      if (!this.morto && this.t >= this.ocupadoAte) {
        this.tocar(mov > 0.05 && this.clips.andar ? this.clips.andar : this.clips.parado);
      }
      this.mixer.update(dt);
    } else {
      this.atualizarProcedural(dt, mov);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      for (const { material, emissiva } of this.materiais) material.emissive.copy(emissiva).lerp(VERMELHO, this.flash);
    }
  }

  atualizarProcedural(dt, mov) {
    const m = this.modelo;
    let rx = 0;
    let py = this.baseY;

    if (this.morteProc !== null) {
      this.morteProc = Math.min(1, this.morteProc + dt * 2);
      const q = this.morteProc * this.morteProc * (3 - 2 * this.morteProc);
      rx = (-Math.PI / 2) * q;
      py = this.baseY - (this.def.altura ?? 1.8) * 0.35 * q;
      this.animarEsqueleto(dt, 0);
    } else {
      if (mov > 0.05) py += Math.abs(Math.sin(this.faseAndar)) * 0.035;
      else py += Math.sin(this.t * this.perfil.idle.freq) * 0.008;
      this.animarEsqueleto(dt, mov);
    }

    m.position.y = py;
    m.rotation.x = rx;
  }

  // Anima o esqueleto a cada frame: postura de combate + passo + ataque
  // + respiração + recuo, tudo somado em offsets de euler sobre a rest.
  animarEsqueleto(dt, mov) {
    const P = this.perfil;
    if (!P || !this.ossos) return;

    let rbX = P.estanciaR[0], rbY = P.estanciaR[1], rbZ = P.estanciaR[2];
    const raX = P.anteR[0], raY = P.anteR[1], raZ = P.anteR[2];
    let lbX = P.estanciaL[0], lbY = P.estanciaL[1], lbZ = P.estanciaL[2];
    const laX = P.anteL[0], laY = P.anteL[1], laZ = P.anteL[2];
    let coxaR = 0, coxaL = 0, joelhoR = 0.05, joelhoL = 0.05;
    let espX = 0, espY = 0, espZ = 0, cabY = 0;

    const morrendo = this.morteProc !== null;

    if (!morrendo) {
      // respiração / balanço parado
      const idle = Math.sin(this.t * P.idle.freq);
      espX += idle * 0.03;
      espZ += Math.sin(this.t * P.idle.freq * 0.5) * 0.025;
      cabY += Math.sin(this.t * P.idle.freq * 0.5 + 0.5) * 0.05;
      rbX += idle * 0.03;

      // caminhada
      if (mov > 0.05) {
        this.faseAndar += dt * P.passo.freq;
        const s = Math.sin(this.faseAndar);
        const c = Math.cos(this.faseAndar);
        coxaR = s * P.passo.perna;
        coxaL = -s * P.passo.perna;
        joelhoR += Math.max(0, -s) * P.passo.joelho;
        joelhoL += Math.max(0, s) * P.passo.joelho;
        lbX += -s * P.passo.braco;          // braço livre balança bastante
        rbX += s * P.passo.braco * 0.4;      // braço da arma balança pouco
        espY += c * 0.05;                    // leve torção do tronco
        espX += 0.07;                        // inclina à frente ao andar
      }

      // ataque
      if (this.acaoProc) {
        this.acaoProc.t += dt;
        if (this.acaoProc.t >= this.acaoProc.dur) {
          this.acaoProc = null;
        } else {
          const p = this.acaoProc.t / this.acaoProc.dur;
          const w = Math.exp(-(((p - 0.25) / 0.16) ** 2)); // preparação
          const s = Math.exp(-(((p - 0.58) / 0.14) ** 2)); // golpe
          const A = P.ataque.ampl;
          if (P.ataque.tipo === 'cima') {
            rbZ += (-2.3 * w + 0.6 * s) * A;   // ergue acima e baixa (machado/martelo)
            rbX += (0.2 * w + 0.4 * s) * A;
            espX += (-0.25 * w + 0.4 * s) * A;
          } else if (P.ataque.tipo === 'varrer') {
            rbY += (0.9 * w - 1.8 * s) * A;    // varredura larga horizontal (foice)
            rbZ += (-0.5 * w + 0.3 * s) * A;
            espY += (0.5 * w - 1.0 * s) * A;
          } else {
            rbZ += (-1.0 * w + 0.4 * s) * A;   // corte diagonal (espada)
            rbY += (0.7 * w - 1.4 * s) * A;
            espY += (0.3 * w - 0.6 * s) * A;
          }
        }
      }

      // recuo ao ser atingido
      this.recuo = Math.max(0, this.recuo - dt * 5);
      espX -= 0.3 * this.recuo;
      rbX -= 0.2 * this.recuo;
    }

    this.poseOsso('upperarm_r', rbX, rbY, rbZ);
    this.poseOsso('lowerarm_r', raX, raY, raZ);
    this.poseOsso('upperarm_l', lbX, lbY, lbZ);
    this.poseOsso('lowerarm_l', laX, laY, laZ);
    this.poseOsso('thigh_r', coxaR, 0, 0);
    this.poseOsso('thigh_l', coxaL, 0, 0);
    this.poseOsso('calf_r', joelhoR, 0, 0);
    this.poseOsso('calf_l', joelhoL, 0, 0);

    const esp = this.ossos.spine_02 || this.ossos.spine_01;
    if (esp) {
      _e.set(espX, espY, espZ);
      _q.setFromEuler(_e);
      esp.quaternion.copy(esp.userData.rest).multiply(_q);
    }
    this.poseOsso('Head', 0, cabY, 0);
  }

  descartar() {
    if (!this.pronto) return;
    this.mixer.stopAllAction();
    for (const { material } of this.materiais) material.dispose();
  }
}
