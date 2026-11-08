// =====================================================================
//  ENTIDADES
//  Um personagem na arena por jogador/bot, criado a partir dos estados
//  que o servidor manda. Os outros jogadores são desenhados ~100 ms no
//  passado, interpolando entre dois estados, para o movimento ficar liso
//  mesmo com o Wi-Fi oscilando. O seu personagem usa a posição local.
// =====================================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PERSONAGENS } from '../shared/personagens.js';
import { REGRAS } from '../shared/regras.js';
import { normalizarAngulo } from '../shared/util.js';
import { criarVisual } from './visual/modelo.js';
import { areaDeGolpe, areaRetangular, faiscas, textoFlutuante } from './efeitos.js';

const ATRASO_INTERPOLACAO = 100; // ms

const geoAura = new THREE.RingGeometry(0.55, 0.72, 40);
const geoEscudo = new THREE.SphereGeometry(1, 24, 16);
const geoEstrela = new THREE.OctahedronGeometry(0.07);
const matEstrela = new THREE.MeshBasicMaterial({ color: 0xffe14d });
const geoMarca = new THREE.ConeGeometry(0.22, 0.45, 4).rotateX(Math.PI); // ponta para baixo
const matMarca = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
const geoAlvo = new THREE.RingGeometry(0.85, 1.0, 40);
const matAlvo = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, depthWrite: false });

export function habilidadeDe(def, slot) {
  return slot === 'esquiva' ? REGRAS.esquiva : def[slot];
}

export class Entidade {
  constructor(cena, dados, local) {
    this.cena = cena;
    this.id = dados.id;
    this.local = local;
    this.raiz = new THREE.Group();
    cena.add(this.raiz);
    this.buffer = [];
    this.rotAcao = null;
    this.rotAcaoAte = 0;
    this.criarRotulo();
    this.vestir(dados.p);
    this.dados = dados;
    this.raiz.position.set(dados.x, 0, dados.z);
    this.raiz.rotation.y = dados.r;
  }

  vestir(chave) {
    if (this.visual) {
      this.raiz.remove(this.visual.raiz);
      this.visual.descartar();
      this.raiz.remove(this.aura, this.escudo, this.estrelas, this.marca);
    }
    this.personagem = chave;
    this.def = PERSONAGENS[chave];
    this.visual = criarVisual(this.def);
    this.raiz.add(this.visual.raiz);
    const altura = this.def.altura ?? 1.8;
    this.rotulo.position.y = altura + 0.35;

    // Anel no chão: cor do personagem; muda para a cor do efeito ativo.
    this.aura = new THREE.Mesh(
      geoAura,
      new THREE.MeshBasicMaterial({ color: this.def.cor, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.04;
    this.aura.scale.setScalar(this.def.raio / 0.5);

    this.escudo = new THREE.Mesh(
      geoEscudo,
      new THREE.MeshBasicMaterial({ color: 0xe8d27a, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.escudo.scale.set(this.def.raio + 0.35, altura * 0.62, this.def.raio + 0.35);
    this.escudo.position.y = altura * 0.5;

    this.estrelas = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Mesh(geoEstrela, matEstrela);
      const a = (i / 3) * Math.PI * 2;
      e.position.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
      this.estrelas.add(e);
    }
    this.estrelas.position.y = altura + 0.15;

    // Marcado pela Sentença (ultimate do Espadachim): seta e alvo vermelhos.
    this.marca = new THREE.Group();
    const seta = new THREE.Mesh(geoMarca, matMarca);
    seta.position.y = altura + 0.95;
    const alvo = new THREE.Mesh(geoAlvo, matAlvo);
    alvo.rotation.x = -Math.PI / 2;
    alvo.position.y = 0.05;
    alvo.scale.setScalar(this.def.raio / 0.5);
    this.marca.add(seta, alvo);
    this.marcaSeta = seta;
    this.raiz.add(this.aura, this.escudo, this.estrelas, this.marca);
  }

  criarRotulo() {
    const el = document.createElement('div');
    el.className = 'rotulo';
    el.innerHTML =
      '<span class="rotulo-nome"></span><div class="barra-vida"><div class="vida"></div><div class="escudo"></div></div>';
    this.elNome = el.querySelector('.rotulo-nome');
    this.elVida = el.querySelector('.vida');
    this.elEscudo = el.querySelector('.escudo');
    this.elRotulo = el;
    if (this.local) el.classList.add('voce');
    this.rotulo = new CSS2DObject(el);
    this.raiz.add(this.rotulo);
  }

  receber(dados, tempo) {
    if (dados.p !== this.personagem) {
      this.vestir(dados.p);
      this.buffer = [];
    }
    this.dados = dados;
    this.buffer.push({ t: tempo, x: dados.x, z: dados.z, r: dados.r, m: dados.m });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  teleportar(x, z, r) {
    this.buffer = [];
    this.raiz.position.set(x, 0, z);
    this.raiz.rotation.y = r;
  }

  // Posição dos outros: interpola entre os dois estados em volta de `tempoRender`.
  interpolar(tempoRender) {
    const b = this.buffer;
    if (!b.length) return 0;
    let mov = b[b.length - 1].m;
    if (tempoRender >= b[b.length - 1].t || b.length === 1) {
      const u = b[b.length - 1];
      this.raiz.position.set(u.x, 0, u.z);
      this.raiz.rotation.y = u.r;
    } else if (tempoRender <= b[0].t) {
      this.raiz.position.set(b[0].x, 0, b[0].z);
      this.raiz.rotation.y = b[0].r;
    } else {
      let i = 0;
      while (i < b.length - 2 && b[i + 1].t < tempoRender) i++;
      const a = b[i];
      const c = b[i + 1];
      const k = (tempoRender - a.t) / Math.max(c.t - a.t, 1);
      this.raiz.position.set(a.x + (c.x - a.x) * k, 0, a.z + (c.z - a.z) * k);
      this.raiz.rotation.y = a.r + normalizarAngulo(c.r - a.r) * k;
      mov = k < 0.5 ? a.m : c.m;
    }
    return mov;
  }

  atualizar(dt, agora, tempoRender, local, limiteExecucao) {
    let mov;
    if (this.local && local) {
      this.raiz.position.set(local.x, 0, local.z);
      this.raiz.rotation.y = local.rot;
      mov = local.mov;
    } else {
      mov = this.interpolar(tempoRender);
      // Durante um golpe vira na direção do ataque sem esperar o próximo estado.
      if (this.rotAcao !== null && agora < this.rotAcaoAte) this.raiz.rotation.y = this.rotAcao;
    }

    const d = this.dados;
    const morto = Boolean(d.mo);
    this.visual.atualizar(dt, { mov, morto });

    // Pisca enquanto invulnerável (após renascer).
    this.visual.raiz.visible = !d.iv || Math.floor(agora * 10) % 2 === 0;

    const efeito = d.ef?.find((e) => e.c);
    this.aura.material.color.set(efeito?.c ?? this.def.cor);
    this.aura.material.opacity = efeito ? 0.55 + Math.sin(agora * 8) * 0.25 : 0.45;
    this.aura.visible = !morto;
    this.escudo.visible = d.e > 0 && !morto;
    this.estrelas.visible = Boolean(d.ef?.some((e) => e.s));
    if (this.estrelas.visible) this.estrelas.rotation.y += dt * 5;
    this.marca.visible = Boolean(d.ef?.some((e) => e.mk)) && !morto;
    if (this.marca.visible) {
      this.marca.rotation.y += dt * 3;
      this.marcaSeta.position.y = (this.def.altura ?? 1.8) + 0.95 + Math.sin(agora * 6) * 0.1;
    }

    this.elNome.textContent = d.n;
    const vidaMax = this.def.vida;
    const fracao = d.v / vidaMax;
    this.elVida.style.width = `${fracao * 100}%`;
    this.elVida.style.background = fracao > 0.5 ? '#5ad15a' : fracao > 0.25 ? '#e8c43a' : '#e5484d';
    this.elEscudo.style.width = `${Math.min(1, d.e / vidaMax) * 100}%`;
    this.elRotulo.classList.toggle('morto', morto);
    // Ceifador com a ultimate pronta: mostra ☠ em quem pode ser executado.
    const executavel = !this.local && !morto && limiteExecucao > 0 && fracao <= limiteExecucao;
    this.elRotulo.classList.toggle('executavel', executavel);
    this.elRotulo.classList.toggle('marcado', this.marca.visible);
  }

  acao(slot, rot) {
    const hab = habilidadeDe(this.def, slot);
    if (!hab) return;
    this.rotAcao = rot;
    this.rotAcaoAte = performance.now() / 1000 + (hab.duracao ?? 0.3);
    if (!this.local) this.raiz.rotation.y = rot;
    this.visual.acao({ slot, animacao: hab.animacao, duracao: hab.duracao ?? 0.3 });
    if (hab.tipo === 'golpe') {
      const p = this.raiz.position;
      if (hab.forma === 'retangulo') {
        areaRetangular(p.x, p.z, rot, hab.comprimento, hab.largura, this.def.cor, hab.preparo ?? 0);
      } else {
        areaDeGolpe(p.x, p.z, rot, hab.alcance, hab.arco, this.def.cor, hab.preparo ?? 0);
      }
    }
  }

  atingido(valor, absorvido) {
    this.visual.atingido();
    const altura = this.def.altura ?? 1.8;
    if (valor > 0) textoFlutuante(this.raiz, altura + 0.6, `-${valor}`, 'dano');
    if (absorvido > 0) textoFlutuante(this.raiz, altura + 0.9, `(${absorvido})`, 'absorvido');
    const p = this.raiz.position;
    faiscas(p.x, altura * 0.6, p.z, 0xff5040, 8);
  }

  curado(valor) {
    textoFlutuante(this.raiz, (this.def.altura ?? 1.8) + 0.6, `+${valor}`, 'cura');
  }

  remover() {
    this.visual.descartar();
    this.raiz.remove(this.rotulo);
    this.elRotulo.remove();
    this.cena.remove(this.raiz);
  }
}

export class Entidades {
  constructor(cena) {
    this.cena = cena;
    this.mapa = new Map();
    this.meuId = null;
    this.offset = null; // diferença entre o relógio local e o do servidor
    this.limiteExecucao = 0; // > 0: destaca quem está com vida abaixo disso
  }

  get(id) {
    return this.mapa.get(id);
  }

  aplicarSnapshot(snap) {
    const agora = performance.now();
    const d = agora - snap.tempo;
    // Média móvel: suaviza a oscilação da chegada dos pacotes.
    this.offset = this.offset === null ? d : this.offset + (d - this.offset) * 0.05;
    if (Math.abs(d - this.offset) > 1000) this.offset = d; // servidor reiniciou

    const vistos = new Set();
    for (const dados of snap.j) {
      vistos.add(dados.id);
      let e = this.mapa.get(dados.id);
      if (!e) {
        e = new Entidade(this.cena, dados, dados.id === this.meuId);
        this.mapa.set(dados.id, e);
      }
      e.receber(dados, snap.tempo);
    }
    for (const [id, e] of this.mapa) {
      if (!vistos.has(id)) {
        e.remover();
        this.mapa.delete(id);
      }
    }
  }

  atualizar(dt, local) {
    const agora = performance.now();
    const tempoRender = agora - (this.offset ?? 0) - ATRASO_INTERPOLACAO;
    for (const e of this.mapa.values()) e.atualizar(dt, agora / 1000, tempoRender, local, this.limiteExecucao);
  }

  limpar() {
    for (const e of this.mapa.values()) e.remover();
    this.mapa.clear();
  }
}
