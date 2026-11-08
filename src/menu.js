// Menu inicial e seletor de personagem, com uma vitrine 3D ao fundo.
import * as THREE from 'three';
import { PERSONAGENS, SLOTS } from '../shared/personagens.js';
import { criarVisual } from './visual/modelo.js';
import { habilidadeDe } from './entidades.js';

const $ = (id) => document.getElementById(id);
const TECLA_SLOT = { ataque: 'Clique', hab1: 'Q', hab2: 'E', esquiva: 'Espaço', ult: 'F' };
const CHAVES = Object.keys(PERSONAGENS);

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Maiores valores entre os personagens, para as barras de atributos.
const MAXIMOS = {
  vida: Math.max(...CHAVES.map((k) => PERSONAGENS[k].vida)),
  dano: Math.max(...CHAVES.map((k) => PERSONAGENS[k].ataque.dano / PERSONAGENS[k].ataque.recarga)),
  velocidade: Math.max(...CHAVES.map((k) => PERSONAGENS[k].velocidade)),
  alcance: Math.max(...CHAVES.map((k) => PERSONAGENS[k].ataque.alcance)),
};

// ---------------------------------------------------------------------
// Vitrine: os personagens lado a lado; o escolhido demonstra os golpes.
// ---------------------------------------------------------------------
class Vitrine {
  constructor() {
    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color(0x141a22);
    this.cena.fog = new THREE.Fog(0x141a22, 10, 22);
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    this.cena.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2a33, 1.4));
    const luz = new THREE.DirectionalLight(0xffffff, 2.4);
    luz.position.set(3, 8, 6);
    luz.castShadow = true;
    luz.shadow.mapSize.set(1024, 1024);
    luz.shadow.camera.left = luz.shadow.camera.bottom = -6;
    luz.shadow.camera.right = luz.shadow.camera.top = 6;
    this.cena.add(luz);

    const chao = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: 0.95 }),
    );
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    this.cena.add(chao);

    this.itens = CHAVES.map((chave, i) => {
      const def = PERSONAGENS[chave];
      const x = (i - (CHAVES.length - 1) / 2) * 2.3;
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 0.2, 32),
        new THREE.MeshStandardMaterial({ color: 0x3a434f, emissive: new THREE.Color(def.cor), emissiveIntensity: 0 }),
      );
      pedestal.position.set(x, 0.1, 0);
      pedestal.receiveShadow = true;
      this.cena.add(pedestal);
      const visual = criarVisual(def);
      visual.raiz.position.set(x, 0.2, 0);
      this.cena.add(visual.raiz);
      return { chave, def, visual, pedestal, x };
    });

    this.foco = null;
    this.t = 0;
    this.proximaDemo = 0;
    this.demo = 0;
    this.camPos = new THREE.Vector3(0, 2.4, 9);
    this.camAlvo = new THREE.Vector3(0, 1.1, 0);
    this.camera.position.copy(this.camPos);
  }

  focar(chave) {
    this.foco = chave;
    this.proximaDemo = this.t + 0.5;
    this.demo = 0;
  }

  atualizar(dt) {
    this.t += dt;
    const item = this.itens.find((i) => i.chave === this.foco);
    for (const i of this.itens) {
      const ativo = i === item;
      i.visual.atualizar(dt, {});
      // Vira para a câmera; o escolhido gira devagar para mostrar o modelo.
      const alvoRot = ativo ? Math.sin(this.t * 0.6) * 0.6 : 0;
      i.visual.raiz.rotation.y += (alvoRot - i.visual.raiz.rotation.y) * Math.min(1, dt * 3);
      i.pedestal.material.emissiveIntensity += ((ativo ? 0.45 : 0) - i.pedestal.material.emissiveIntensity) * Math.min(1, dt * 5);
    }
    if (item && this.t >= this.proximaDemo) {
      const slot = SLOTS[this.demo++ % SLOTS.length];
      const hab = habilidadeDe(item.def, slot);
      item.visual.acao({ slot, animacao: hab.animacao, duracao: hab.duracao ?? 0.3 });
      this.proximaDemo = this.t + Math.max(1.3, (hab.duracao ?? 0.3) + 0.9);
    }

    // Câmera: visão geral no menu inicial, perto do escolhido na seleção.
    const largo = window.innerWidth / window.innerHeight < 1.2;
    if (item) {
      // Personagem no centro, entre o painel de detalhes e o de entrada.
      this.camPos.set(item.x, 1.9, largo ? 8 : 6);
      this.camAlvo.set(item.x, 1.05, 0);
    } else {
      this.camPos.set(0, 2.6, largo ? 15 : 9.5);
      this.camAlvo.set(0, 1.0, 0);
    }
    const k = Math.min(1, dt * 3);
    this.camera.position.lerp(this.camPos, k);
    this.alvoAtual = (this.alvoAtual ?? this.camAlvo.clone()).lerp(this.camAlvo, k);
    this.camera.lookAt(this.alvoAtual);
  }

  redimensionar() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------
// Tela de seleção (a primeira tela do jogo)
// ---------------------------------------------------------------------
export class Menu {
  constructor({ aoEscolher }) {
    this.vitrine = new Vitrine();
    this.aoEscolher = aoEscolher;
    this.escolhido = null;
    this.elSelecao = $('tela-selecao');
    this.elNome = $('nome');
    this.elStatus = $('status-conexao');
    this.elEnderecos = $('enderecos');
    this.elOnline = $('online');
    this.elCartas = $('cartas');
    this.elDetalhes = $('detalhes');

    try {
      this.elNome.value = localStorage.getItem('combat:nome') ?? '';
      const salvo = localStorage.getItem('combat:personagem');
      if (PERSONAGENS[salvo]) this.escolhido = salvo;
    } catch {}

    $('btn-lutar').addEventListener('click', () => this.confirmar());

    for (const chave of CHAVES) {
      const def = PERSONAGENS[chave];
      const carta = document.createElement('button');
      carta.className = 'carta';
      carta.type = 'button';
      carta.dataset.chave = chave;
      carta.style.setProperty('--cor', def.cor);
      carta.innerHTML = `
        <span class="carta-arma">${escapar(def.arma)}</span>
        <strong>${escapar(def.nome)}</strong>
        ${this.barra('Vida', def.vida / MAXIMOS.vida)}
        ${this.barra('Dano', def.ataque.dano / def.ataque.recarga / MAXIMOS.dano)}
        ${this.barra('Velocidade', def.velocidade / MAXIMOS.velocidade)}
        ${this.barra('Alcance', def.ataque.alcance / MAXIMOS.alcance)}`;
      carta.addEventListener('click', () => this.selecionar(chave));
      carta.addEventListener('dblclick', () => this.confirmar());
      this.elCartas.appendChild(carta);
    }

    window.addEventListener('keydown', (e) => {
      if (this.tela !== 'selecao') return;
      const digitando = e.target === this.elNome;
      const i = CHAVES.indexOf(this.escolhido);
      if (e.key === 'ArrowRight' && !digitando) this.selecionar(CHAVES[(i + 1) % CHAVES.length]);
      else if (e.key === 'ArrowLeft' && !digitando) this.selecionar(CHAVES[(i - 1 + CHAVES.length) % CHAVES.length]);
      else if (e.key === 'Enter') this.confirmar();
    });
  }

  barra(nome, fracao) {
    return `<span class="atributo">${nome}<i><b style="width:${Math.round(fracao * 100)}%"></b></i></span>`;
  }

  get nome() {
    return this.elNome.value.trim().slice(0, 16);
  }

  abrir() {
    this.tela = 'selecao';
    this.elSelecao.classList.remove('oculto');
    this.selecionar(this.escolhido ?? CHAVES[0]);
    if (!this.nome) this.elNome.focus();
  }

  fechar() {
    this.tela = null;
    this.elSelecao.classList.add('oculto');
  }

  selecionar(chave) {
    this.escolhido = chave;
    this.vitrine.focar(chave);
    for (const c of this.elCartas.children) c.classList.toggle('ativa', c.dataset.chave === chave);
    const def = PERSONAGENS[chave];
    const habs = SLOTS.map((slot) => {
      const h = habilidadeDe(def, slot);
      const extra = slot === 'ult' ? 'ultimate' : `recarga ${h.recarga} s`;
      return `<li${slot === 'ult' ? ' class="ult"' : ''}><kbd>${TECLA_SLOT[slot]}</kbd><div><strong>${escapar(h.nome)}</strong>
        <small>${extra}</small><p>${escapar(h.descricao ?? '')}</p></div></li>`;
    }).join('');
    this.elDetalhes.style.setProperty('--cor', def.cor);
    this.elDetalhes.innerHTML = `
      <h2>${escapar(def.nome)}</h2>
      <p class="detalhe-desc">${escapar(def.descricao ?? '')}</p>
      <div class="numeros">
        <span><b>${def.vida}</b>vida</span>
        <span><b>${def.velocidade}</b>m/s</span>
        <span><b>${def.ataque.dano}</b>dano</span>
        <span><b>${def.ataque.alcance}</b>m alcance</span>
      </div>
      <ul class="habilidades">${habs}</ul>`;
  }

  confirmar() {
    if (this.tela !== 'selecao' || !this.escolhido) return;
    try {
      localStorage.setItem('combat:nome', this.nome);
      localStorage.setItem('combat:personagem', this.escolhido);
    } catch {}
    this.aoEscolher({ nome: this.nome, personagem: this.escolhido });
  }

  conexao(conectado) {
    this.elStatus.textContent = conectado ? 'Conectado ao servidor' : 'Conectando ao servidor…';
    this.elStatus.classList.toggle('ok', conectado);
  }

  enderecos(lista) {
    const ehLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!lista?.length) {
      this.elEnderecos.innerHTML = '';
      return;
    }
    this.elEnderecos.innerHTML = ehLocal
      ? `Para jogar com amigos no mesmo Wi-Fi, mande:<br>${lista.map((u) => `<code>${escapar(u)}</code>`).join('<br>')}`
      : `Servidor: <code>${escapar(location.origin)}</code>`;
  }

  online(jogadores) {
    const pessoas = jogadores.filter((j) => !j.b);
    const bots = jogadores.length - pessoas.length;
    if (!jogadores.length) this.elOnline.textContent = 'Arena vazia';
    else {
      const nomes = pessoas.map((j) => j.n).join(', ');
      this.elOnline.textContent = `Na arena: ${nomes || '—'}${bots ? ` + ${bots} bot${bots > 1 ? 's' : ''}` : ''}`;
    }
  }
}

