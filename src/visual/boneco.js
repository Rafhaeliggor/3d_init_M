// =====================================================================
//  BONECO PLACEHOLDER
//  Personagem montado com formas simples e animado por código, usado
//  enquanto o personagem não tem um modelo 3D (`modelo: null` em
//  shared/personagens.js). Mesma interface do VisualModelo:
//    raiz, acao({ slot, animacao, duracao }), atingido(), atualizar(dt, estado)
// =====================================================================
import * as THREE from 'three';
import { criarArma } from './armas.js';

const DUAS_MAOS = new Set(['foice', 'martelo']);
const TAU = Math.PI * 2;

// Geometrias compartilhadas por todos os bonecos (as medidas são para
// 1,8 m; cada boneco é escalado para a altura do personagem).
const GEO = {
  perna: new THREE.CylinderGeometry(0.09, 0.075, 0.8, 10),
  pe: new THREE.BoxGeometry(0.14, 0.08, 0.26),
  tronco: new THREE.CapsuleGeometry(0.26, 0.36, 4, 14),
  cinto: new THREE.CylinderGeometry(0.265, 0.265, 0.08, 16),
  cabeca: new THREE.SphereGeometry(0.2, 18, 14),
  elmo: new THREE.SphereGeometry(0.215, 18, 8, 0, TAU, 0, Math.PI / 2),
  olho: new THREE.BoxGeometry(0.05, 0.07, 0.03),
  braco: new THREE.CylinderGeometry(0.075, 0.062, 0.6, 10),
  mao: new THREE.SphereGeometry(0.08, 10, 8),
};

const fase = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const suave = (x) => x * x * (3 - 2 * x);
const mix = (a, b, k) => a + (b - a) * k;

export class VisualBoneco {
  constructor(def) {
    this.def = def;
    this.escala = (def.altura ?? 1.8) / 1.8;
    this.duasMaos = DUAS_MAOS.has(def.arma);

    const cor = new THREE.Color(def.cor);
    const mat = (c, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, ...extra });
    const roupa = mat(cor);
    const calca = mat(cor.clone().multiplyScalar(0.4));
    const pele = mat(0xe9c39d);
    const elmo = mat(cor.clone().multiplyScalar(0.7), { metalness: 0.4, roughness: 0.4 });
    const preto = mat(0x1d1d1d);
    this.materiais = [roupa, calca, pele, elmo].map((m) => ({ material: m, emissiva: m.emissive.clone() }));

    const malha = (geo, m, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      return o;
    };

    this.raiz = new THREE.Group();
    // `corpo` gira em torno do centro do corpo (rolamento, queda).
    this.corpo = new THREE.Group();
    this.corpo.scale.setScalar(this.escala);
    this.raiz.add(this.corpo);

    const perna = (x) => {
      const pivo = new THREE.Group();
      pivo.position.set(x, -0.05, 0);
      pivo.add(malha(GEO.perna, calca, 0, -0.4, 0), malha(GEO.pe, preto, 0, -0.82, 0.05));
      this.corpo.add(pivo);
      return pivo;
    };
    this.pernaD = perna(-0.14);
    this.pernaE = perna(0.14);

    this.superior = new THREE.Group();
    this.superior.position.y = -0.05;
    this.corpo.add(this.superior);
    const tronco = malha(GEO.tronco, roupa, 0, 0.32, 0);
    tronco.scale.z = 0.75;
    const cinto = malha(GEO.cinto, preto, 0, 0.08, 0);
    cinto.scale.z = 0.75;
    this.superior.add(
      tronco,
      cinto,
      malha(GEO.cabeca, pele, 0, 0.78, 0),
      malha(GEO.elmo, elmo, 0, 0.8, 0),
      malha(GEO.olho, preto, -0.07, 0.79, 0.18),
      malha(GEO.olho, preto, 0.07, 0.79, 0.18),
    );

    const braco = (x) => {
      const pivo = new THREE.Group();
      pivo.position.set(x, 0.52, 0);
      pivo.add(malha(GEO.braco, roupa, 0, -0.3, 0), malha(GEO.mao, pele, 0, -0.62, 0));
      this.superior.add(pivo);
      return pivo;
    };
    // O personagem olha para +z, então o lado direito dele é -x.
    this.bracoD = braco(-0.36);
    this.bracoE = braco(0.36);

    this.pulso = new THREE.Group();
    this.pulso.position.y = -0.62;
    this.bracoD.add(this.pulso);
    this.arma = criarArma(def.arma);
    this.pulso.add(this.arma);

    this.t = Math.random() * 10;
    this.passo = 0;
    this.acaoAtual = null;
    this.flash = 0;
    this.recuo = 0;
    this.morteT = null;
    this.armaOcultaDe = Infinity;
    this.armaOcultaAte = 0;
  }

  acao({ animacao, duracao }) {
    if (this.morteT !== null) return;
    this.acaoAtual = { anim: animacao, t: 0, dur: Math.max(duracao, 0.25) };
    if (animacao === 'arremesso') {
      // A arma "sai da mão" no arremesso e volta depois do voo.
      this.armaOcultaDe = this.t + duracao * 0.45;
      this.armaOcultaAte = this.t + duracao + 0.9;
    }
  }

  atingido() {
    this.flash = 1;
    this.recuo = 1;
  }

  atualizar(dt, { mov = 0, morto = false } = {}) {
    this.t += dt;
    if (morto && this.morteT === null) {
      this.morteT = 0;
      this.acaoAtual = null;
    }
    if (!morto) this.morteT = null;

    // Pose base (parado)
    const P = {
      pernaD: 0,
      pernaE: 0,
      bracoDx: this.duasMaos ? -0.6 : -0.25,
      bracoDz: this.duasMaos ? 0.3 : -0.08,
      bracoEx: this.duasMaos ? -0.75 : 0.1,
      bracoEz: this.duasMaos ? -0.5 : 0.08,
      pulso: 1.0,
      supX: Math.sin(this.t * 2) * 0.015,
      supY: 0,
      corpoRx: 0,
      corpoRy: 0,
      corpoY: 0,
      armaVisivel: !(this.t >= this.armaOcultaDe && this.t < this.armaOcultaAte),
    };

    // Andar
    if (mov > 0.05 && this.morteT === null) {
      this.passo += dt * 9;
      const balanco = Math.sin(this.passo) * 0.6;
      P.pernaD = balanco;
      P.pernaE = -balanco;
      P.bracoEx += this.duasMaos ? 0 : -balanco * 0.7;
      P.bracoDx += balanco * (this.duasMaos ? 0.15 : 0.35);
      P.corpoY = Math.abs(Math.cos(this.passo)) * 0.05;
      P.supX += 0.08;
    }

    // Ação em andamento
    if (this.acaoAtual) {
      const a = this.acaoAtual;
      a.t += dt;
      if (a.t >= a.dur) this.acaoAtual = null;
      else this.poseAcao(a.anim, a.t / a.dur, P);
    }

    // Reação ao golpe
    this.recuo = Math.max(0, this.recuo - dt * 5);
    P.supX -= 0.35 * this.recuo;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      for (const { material, emissiva } of this.materiais) {
        material.emissive.copy(emissiva).lerp(VERMELHO, this.flash);
      }
    }

    // Queda
    if (this.morteT !== null) {
      this.morteT += dt;
      const q = suave(Math.min(1, this.morteT / 0.5));
      P.corpoRx = (-Math.PI / 2) * q;
      P.corpoY = -0.62 * q;
      P.pernaD = P.pernaE = 0;
      P.bracoDx = mix(P.bracoDx, -2.8, q);
      P.bracoEx = mix(P.bracoEx, -2.8, q);
    }

    this.aplicar(P);
  }

  poseAcao(anim, p, P) {
    const baseD = P.bracoDx;
    switch (anim) {
      case 'pancada': {
        // De cima para baixo, com a arma alinhada ao braço.
        const prep = suave(fase(p, 0, 0.4));
        const golpe = fase(p, 0.4, 0.55);
        const volta = suave(fase(p, 0.7, 1));
        P.bracoDx = mix(mix(mix(baseD, -3.1, prep), -0.85, golpe), baseD, volta);
        P.pulso = mix(1, 2.9, prep * (1 - volta));
        P.supX = -0.2 * prep * (1 - golpe) + 0.4 * golpe * (1 - volta);
        P.corpoY = -0.12 * golpe * (1 - volta);
        P.bracoDz = 0.2;
        this.segundaMao(P, 0.2);
        break;
      }
      case 'giro': {
        const k = fase(p, 0, 0.12) * (1 - fase(p, 0.85, 1));
        P.corpoRy = -TAU * suave(fase(p, 0.1, 0.85));
        P.bracoDx = mix(baseD, -0.3, k);
        P.bracoDz = mix(P.bracoDz, -1.4, k);
        P.pulso = mix(1, 2.9, k);
        break;
      }
      case 'estocada': {
        const prep = suave(fase(p, 0, 0.35));
        const estoque = suave(fase(p, 0.35, 0.55));
        const volta = suave(fase(p, 0.75, 1));
        const k = prep * (1 - volta);
        P.bracoDx = mix(baseD, -1.5, k);
        P.bracoDz = mix(P.bracoDz, 0.15, k);
        P.pulso = mix(1, 2.9, k);
        P.supY = 0.6 * prep * (1 - estoque) - 0.35 * estoque * (1 - volta);
        P.supX = 0.3 * estoque * (1 - volta);
        this.segundaMao(P, 0.25);
        break;
      }
      case 'investida': {
        const k = suave(fase(p, 0, 0.2)) * (1 - suave(fase(p, 0.8, 1)));
        P.supX = 0.5 * k;
        P.bracoDx = mix(baseD, -1.5, k);
        P.pulso = mix(1, 2.9, k);
        P.pernaD = 0.7 * k;
        P.pernaE = -0.5 * k;
        this.segundaMao(P, 0.25);
        break;
      }
      case 'arremesso': {
        const prep = suave(fase(p, 0, 0.4));
        const lanca = suave(fase(p, 0.4, 0.6));
        const volta = suave(fase(p, 0.75, 1));
        P.bracoDx = mix(mix(mix(baseD, -3.3, prep), -1.2, lanca), baseD, volta);
        P.pulso = mix(1, 2.9, prep * (1 - volta));
        P.supY = 0.6 * prep * (1 - lanca) - 0.4 * lanca * (1 - volta);
        break;
      }
      case 'buff': {
        const k = suave(fase(p, 0, 0.35)) * (1 - suave(fase(p, 0.65, 1)));
        P.bracoDx = mix(baseD, -2.7, k);
        P.bracoEx = mix(P.bracoEx, -2.7, k);
        P.bracoDz = mix(P.bracoDz, -0.35, k);
        P.bracoEz = mix(P.bracoEz, 0.35, k);
        P.supX = -0.2 * k;
        break;
      }
      case 'esquiva': {
        const r = Math.sin(p * Math.PI);
        P.corpoRx = TAU * suave(p);
        P.corpoY = -0.45 * r;
        P.pernaD = P.pernaE = -1.3 * r;
        P.bracoDx = mix(baseD, -1.2, r);
        P.bracoEx = mix(P.bracoEx, -1.2, r);
        break;
      }
      case 'corte':
      default: {
        // Corte horizontal: o tronco gira levando o braço esticado.
        const prep = suave(fase(p, 0, 0.3));
        const golpe = suave(fase(p, 0.3, 0.6));
        const volta = suave(fase(p, 0.7, 1));
        const k = prep * (1 - volta);
        P.supY = mix(mix(1.1 * prep, -1.3, golpe), 0, volta);
        P.bracoDx = mix(baseD, -1.45, k);
        P.bracoDz = mix(P.bracoDz, 0.1, k);
        P.pulso = mix(1, 2.8, k);
        this.segundaMao(P, 0.3);
        break;
      }
    }
  }

  // Em armas de duas mãos o braço esquerdo acompanha o direito.
  segundaMao(P, dentro) {
    if (!this.duasMaos) return;
    P.bracoEx = P.bracoDx;
    P.bracoEz = -dentro - 0.2;
    P.bracoDz = Math.max(P.bracoDz, dentro);
  }

  aplicar(P) {
    this.pernaD.rotation.x = P.pernaD;
    this.pernaE.rotation.x = P.pernaE;
    this.bracoD.rotation.set(P.bracoDx, 0, P.bracoDz);
    this.bracoE.rotation.set(P.bracoEx, 0, P.bracoEz);
    this.pulso.rotation.x = P.pulso;
    this.superior.rotation.set(P.supX, P.supY, 0);
    this.corpo.rotation.set(P.corpoRx, P.corpoRy, 0);
    this.corpo.position.y = (0.9 + P.corpoY) * this.escala;
    this.arma.visible = P.armaVisivel;
  }

  descartar() {
    for (const { material } of this.materiais) material.dispose();
  }
}

const VERMELHO = new THREE.Color(0xff2020);
