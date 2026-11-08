// =====================================================================
//  CONTROLE DO SEU PERSONAGEM
//  Teclado + mouse. O movimento é calculado aqui mesmo (resposta
//  imediata) e enviado ao servidor ~20x por segundo. As ações (ataque,
//  habilidades, esquiva) começam na hora na tela e o servidor confirma
//  e decide o dano.
// =====================================================================
import * as THREE from 'three';
import { REGRAS, DECAIMENTO_EMPURRAO } from '../shared/regras.js';
import { frenteDe, limitarAoCirculo, normalizarAngulo } from '../shared/util.js';
import { habilidadeDe } from './entidades.js';

const agora = () => performance.now() / 1000;

const TECLAS_MOVER = {
  frente: ['KeyW', 'ArrowUp'],
  tras: ['KeyS', 'ArrowDown'],
  esquerda: ['KeyA', 'ArrowLeft'],
  direita: ['KeyD', 'ArrowRight'],
};
const TECLAS_ACAO = { KeyQ: 'hab1', KeyE: 'hab2', Space: 'esquiva', KeyJ: 'ataque', KeyF: 'ult', KeyR: 'pocao' };
const BLOQUEAR = new Set([...Object.values(TECLAS_MOVER).flat(), ...Object.keys(TECLAS_ACAO)]);

export class Controle {
  constructor(rede, camera, canvas) {
    this.rede = rede;
    this.camera = camera;
    this.ativo = false;
    this.def = null;
    this.estado = null; // { x, z, rot, mov } — null até o servidor posicionar
    this.teclas = new Set();
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pontoMira = new THREE.Vector3();
    this.segurando = false;
    this.aoAgir = null;
    // Definido pelo main: acha o inimigo executável sob o cursor (ult do Ceifador).
    this.buscarAlvo = null;
    this.reiniciar();

    window.addEventListener('keydown', (e) => {
      if (!this.ativo || e.target.tagName === 'INPUT') return;
      if (BLOQUEAR.has(e.code)) e.preventDefault();
      this.teclas.add(e.code);
      if (!e.repeat && TECLAS_ACAO[e.code]) this.tentar(TECLAS_ACAO[e.code]);
    });
    window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
    window.addEventListener('blur', () => {
      this.teclas.clear();
      this.segurando = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.ativo) return;
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      // Mirando a Execução: clique esquerdo escolhe o alvo, direito cancela.
      if (this.mirandoUlt) {
        if (e.button === 0) this.tentar('ult', true);
        else if (e.button === 2) this.mirandoUlt = false;
        return;
      }
      if (e.button !== 0) return;
      this.segurando = true;
      this.tentar('ataque');
    });
    window.addEventListener('pointerup', () => {
      this.segurando = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reiniciar() {
    this.recargas = { ataque: 0, hab1: 0, hab2: 0, esquiva: 0 };
    this.ocupadoAte = 0;
    this.rotAcao = 0;
    this.dash = null;
    this.kb = { x: 0, z: 0 };
    this.morto = false;
    this.mortoPor = null;
    this.mortoEm = 0;
    this.efeitos = [];
    this.ultimoEnvio = 0;
    this.ult = 0; // carga 0–100 (vem do servidor)
    this.pocao = 0; // abates rumo à poção
    this.vida = 0;
    this.mirandoUlt = false;
  }

  iniciar(def) {
    this.def = def;
    this.estado = null;
    this.reiniciar();
  }

  parar() {
    this.def = null;
    this.estado = null;
    this.ativo = false;
    this.teclas.clear();
    this.segurando = false;
    this.mirandoUlt = false;
  }

  definirAtivo(ativo) {
    this.ativo = ativo;
    if (!ativo) {
      this.teclas.clear();
      this.segurando = false;
      this.mirandoUlt = false;
    }
  }

  // O servidor decide onde você (re)nasce.
  posicionar(x, z, rot) {
    this.estado = { x, z, rot, mov: 0 };
    this.dash = null;
    this.kb = { x: 0, z: 0 };
    this.morto = false;
    this.ocupadoAte = 0;
  }

  impulso(vx, vz) {
    this.kb.x += vx;
    this.kb.z += vz;
    this.dash = null;
  }

  morrer(porQuem) {
    this.morto = true;
    this.mortoPor = porQuem;
    this.mortoEm = agora();
    this.dash = null;
    this.segurando = false;
    this.mirandoUlt = false;
  }

  // Estado que só o servidor sabe (efeitos, morte, carga), vindo do snapshot.
  sincronizar(dados) {
    this.efeitos = dados.ef ?? [];
    this.ult = dados.u ?? 0;
    this.pocao = dados.pc ?? 0;
    this.vida = dados.v;
    if (dados.mo && !this.morto) this.morrer(null);
  }

  get temPocao() {
    return this.pocao >= REGRAS.pocao.abatesNecessarios;
  }

  atordoado() {
    return this.efeitos.some((e) => e.s);
  }

  multVelocidade() {
    return this.efeitos.reduce((m, e) => m * (e.v ?? 1), 1);
  }

  direcaoEntrada() {
    const ativo = (d) => TECLAS_MOVER[d].some((c) => this.teclas.has(c));
    // Câmera fixa olhando para -z: "para cima" na tela é -z.
    let x = 0;
    let z = 0;
    if (ativo('frente')) z -= 1;
    if (ativo('tras')) z += 1;
    if (ativo('esquerda')) x -= 1;
    if (ativo('direita')) x += 1;
    const n = Math.hypot(x, z);
    return n ? { x: x / n, z: z / n } : null;
  }

  // Ângulo do personagem até o ponto do chão sob o mouse.
  anguloMira() {
    if (!this.estado) return 0;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plano, this.pontoMira)) return this.estado.rot;
    const dx = this.pontoMira.x - this.estado.x;
    const dz = this.pontoMira.z - this.estado.z;
    return Math.hypot(dx, dz) < 0.05 ? this.estado.rot : Math.atan2(dx, dz);
  }

  // Ponto do chão sob o mouse (ou null).
  pontoNoChao() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.ray.intersectPlane(this.plano, this.pontoMira);
  }

  beberPocao() {
    if (!this.temPocao || this.vida >= this.def.vida) return false;
    this.pocao = 0;
    this.rede.enviar({ t: 'pocao' });
    return true;
  }

  // `clique`: veio do clique de mira da Execução.
  tentar(slot, clique = false) {
    if (!this.ativo || !this.def || !this.estado || this.morto) return false;
    if (slot === 'pocao') return this.beberPocao();
    const hab = habilidadeDe(this.def, slot);
    if (!hab) return false;
    const ult = slot === 'ult';
    if (this.atordoado() && !(ult && hab.usavelAtordoado)) return false;
    const t = agora();
    if (t < this.ocupadoAte) return false;
    if (ult ? this.ult < 100 : t < this.recargas[slot]) return false;

    let rot;
    let alvo;
    if (slot === 'esquiva') {
      const dir = this.direcaoEntrada();
      rot = dir ? Math.atan2(dir.x, dir.z) : this.estado.rot;
    } else if (hab.tipo === 'execucao') {
      const a = this.buscarAlvo?.(hab);
      if (!a) {
        // Sem alvo sob o cursor: F liga/desliga o modo de mira.
        if (!clique) this.mirandoUlt = !this.mirandoUlt;
        return false;
      }
      this.mirandoUlt = false;
      alvo = a.id;
      rot = Math.atan2(a.x - this.estado.x, a.z - this.estado.z);
    } else {
      rot = this.anguloMira();
    }

    if (ult) this.ult = 0;
    else this.recargas[slot] = t + hab.recarga;
    // Imparável: já pode andar mesmo que estivesse atordoado.
    if (ult && hab.efeito?.imune) this.efeitos = this.efeitos.filter((e) => !e.s);
    this.ocupadoAte = t + (hab.duracao ?? 0);
    this.rotAcao = rot;
    this.estado.rot = rot;
    if (hab.tipo === 'investida' || hab.tipo === 'esquiva') {
      const f = frenteDe(rot);
      const v = hab.distancia / hab.duracao;
      this.dash = { vx: f.x * v, vz: f.z * v, ate: t + hab.duracao };
    }
    this.rede.enviar({ t: 'acao', acao: slot, r: Math.round(rot * 1000) / 1000, alvo });
    this.aoAgir?.(slot, rot);
    return true;
  }

  // `outros`: [{ x, z, raio }] dos personagens vivos, para não atravessar.
  atualizar(dt, outros) {
    const e = this.estado;
    if (!this.def || !e) return;
    const t = agora();
    e.mov = 0;
    if (this.mirandoUlt && (this.ult < 100 || this.morto)) this.mirandoUlt = false;
    if (this.morto) return;

    if (this.dash && t < this.dash.ate) {
      e.x += this.dash.vx * dt;
      e.z += this.dash.vz * dt;
    } else {
      this.dash = null;
      const dir = this.ativo ? this.direcaoEntrada() : null;
      if (dir && !this.atordoado()) {
        const lento = t < this.ocupadoAte ? 0.35 : 1;
        const vel = this.def.velocidade * this.multVelocidade() * lento;
        e.x += dir.x * vel * dt;
        e.z += dir.z * vel * dt;
        e.mov = 1;
        if (t >= this.ocupadoAte) {
          e.rot += normalizarAngulo(Math.atan2(dir.x, dir.z) - e.rot) * Math.min(1, dt * 14);
        }
      }
    }
    if (t < this.ocupadoAte) e.rot = this.rotAcao;

    if (this.kb.x || this.kb.z) {
      e.x += this.kb.x * dt;
      e.z += this.kb.z * dt;
      const f = Math.exp(-DECAIMENTO_EMPURRAO * dt);
      this.kb.x *= f;
      this.kb.z *= f;
      if (Math.hypot(this.kb.x, this.kb.z) < 0.05) this.kb.x = this.kb.z = 0;
    }

    // Empurra para fora de quem estiver encostado (menos durante a esquiva/investida).
    if (!this.dash) {
      for (const o of outros) {
        const dx = e.x - o.x;
        const dz = e.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = this.def.raio + o.raio;
        if (d > 0.001 && d < min) {
          e.x += (dx / d) * (min - d);
          e.z += (dz / d) * (min - d);
        }
      }
    }
    limitarAoCirculo(e, REGRAS.raioArena - this.def.raio);

    if (t - this.ultimoEnvio >= 1 / REGRAS.taxaServidor) {
      this.ultimoEnvio = t;
      this.rede.enviar({
        t: 'pos',
        x: Math.round(e.x * 100) / 100,
        z: Math.round(e.z * 100) / 100,
        r: Math.round(e.rot * 1000) / 1000,
        m: e.mov,
      });
    }

    if (this.segurando) this.tentar('ataque');
  }
}
