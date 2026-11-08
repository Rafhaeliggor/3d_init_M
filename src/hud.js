// Interface durante a partida, minimalista:
//   topo esquerdo – personagem, vida/escudo e efeitos ativos
//   topo direito  – placar
//   base          – habilidades, ultimate (F) e poção (R), só ícones
import { PERSONAGENS, SLOTS } from '../shared/personagens.js';
import { REGRAS } from '../shared/regras.js';
import { habilidadeDe } from './entidades.js';

const TECLA_SLOT = { ataque: 'Clique', hab1: 'Q', hab2: 'E', esquiva: 'Espaço', ult: 'F', pocao: 'R' };
const $ = (id) => document.getElementById(id);

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Ícones simples (traço branco, 24×24) escolhidos pelo tipo da habilidade.
const ICONES = {
  corte: '<path d="M4 20C7 11 13 6 21 4"/><path d="M3 14c2-4 5-7 9-9"/>',
  area: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19M5 19l2.5-2.5M16.5 7.5 19 5"/>',
  gancho: '<path d="M7 3v10a5 5 0 0 0 10 0v-3"/><path d="M14 13l3-3 3 3"/>',
  investida: '<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>',
  projetil: '<path d="M3 21 13 11"/><path d="M11 5a7 7 0 0 1 8 8l-4-1-3-3z"/>',
  escudo: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  gota: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  chama: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-3 0-6 0-9z"/>',
  esquiva: '<path d="M3 8h9M3 12h13M3 16h7"/><path d="M16 6l4 6-4 6"/>',
  martelo: '<path d="M4 6h11v6H4z"/><path d="M10 12v9"/><path d="M18 5l2-2M18 13l2 2M19 9h3"/>',
  mira: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  caveira: '<path d="M5 11a7 7 0 0 1 14 0c0 3-2 4-2 5v2H7v-2c0-1-2-2-2-5z"/><circle cx="9.5" cy="11" r="1.5"/><circle cx="14.5" cy="11" r="1.5"/><path d="M10 18v3M14 18v3"/>',
  pocao: '<path d="M9 3h6M10 3v6L5 18.5A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.5L14 9V3"/><path d="M7.5 15h9"/>',
};

function iconeDe(slot, hab) {
  if (slot === 'esquiva') return ICONES.esquiva;
  switch (hab.tipo) {
    case 'golpe':
      if (hab.forma === 'retangulo') return hab.curaSeAcertar ? ICONES.gota : ICONES.martelo;
      if (hab.arco >= 360) return ICONES.area;
      if ((hab.empurrao ?? 0) < 0) return ICONES.gancho;
      return ICONES.corte;
    case 'investida':
      return ICONES.investida;
    case 'projetil':
      return ICONES.projetil;
    case 'marca':
      return ICONES.mira;
    case 'execucao':
      return ICONES.caveira;
    case 'buff': {
      const ef = hab.efeito ?? {};
      if (ef.multDano || ef.imune) return ICONES.chama;
      if (ef.rouboVida) return ICONES.gota;
      return ICONES.escudo;
    }
    default:
      return ICONES.corte;
  }
}

const svg = (corpo) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;

export class Hud {
  constructor() {
    this.el = $('hud');
    this.elVida = $('hud-vida');
    this.elEscudo = $('hud-escudo');
    this.elVidaTexto = $('hud-vida-texto');
    this.elNome = $('hud-personagem');
    this.elSlots = $('hud-slots');
    this.elEfeitos = $('hud-efeitos');
    this.elMiraUlt = $('mira-ult');
    this.elPlacar = $('placar-lista');
    this.elAvisos = $('avisos');
    this.elDerrota = $('derrota');
    this.elDerrotaTexto = $('derrota-texto');
    this.elPing = $('ping');
    this.slots = {};
    this.ultimoPlacar = 0;
  }

  mostrar(visivel) {
    this.el.classList.toggle('oculto', !visivel);
  }

  montar(def) {
    this.def = def;
    this.elNome.textContent = def.nome;
    this.elNome.style.color = def.cor;
    this.el.style.setProperty('--cor', def.cor);
    this.elSlots.innerHTML = '';
    this.slots = {};
    const pocao = {
      nome: 'Poção',
      descricao: `Recupera ${REGRAS.pocao.cura * 100}% da vida. Ganhe uma a cada ${REGRAS.pocao.abatesNecessarios} abates (só cabe uma).`,
    };
    for (const slot of [...SLOTS, 'pocao']) {
      const hab = slot === 'pocao' ? pocao : habilidadeDe(def, slot);
      if (!hab) continue;
      const el = document.createElement('div');
      el.className = `slot slot-${slot}`;
      el.title = `${hab.nome} — ${hab.descricao ?? ''}`;
      el.innerHTML = `
        <div class="slot-icone">
          <div class="slot-carga"></div>
          ${svg(slot === 'pocao' ? ICONES.pocao : iconeDe(slot, hab))}
          <div class="slot-recarga"></div>
          <span class="slot-tempo"></span>
        </div>
        <kbd>${TECLA_SLOT[slot]}</kbd>`;
      this.elSlots.appendChild(el);
      this.slots[slot] = {
        el,
        carga: el.querySelector('.slot-carga'),
        recarga: el.querySelector('.slot-recarga'),
        tempo: el.querySelector('.slot-tempo'),
        total: hab.recarga,
      };
    }
  }

  atualizar(controle, dados, ping, nomes) {
    const t = performance.now() / 1000;
    if (dados && this.def) {
      const max = this.def.vida;
      const fracao = Math.max(0, dados.v / max);
      this.elVida.style.width = `${fracao * 100}%`;
      this.elVida.classList.toggle('baixa', fracao <= 0.25);
      this.elEscudo.style.width = `${Math.min(1, dados.e / max) * 100}%`;
      this.elVidaTexto.innerHTML = `<b>${dados.v}</b> / ${max}${dados.e > 0 ? ` <span class="escudo">+${dados.e}</span>` : ''}`;

      const html = (dados.ef ?? [])
        .map((e) => `<span style="--cor:${e.c ?? '#fff'}">${escapar(e.n)} <i>${Math.max(0, e.r).toFixed(1)}</i></span>`)
        .join('');
      if (html !== this.efeitosHtml) this.elEfeitos.innerHTML = this.efeitosHtml = html;
    }

    const morto = controle.morto;
    for (const [slot, s] of Object.entries(this.slots)) {
      if (slot === 'ult') {
        const carga = Math.min(100, controle.ult);
        const cheia = carga >= 100;
        s.carga.style.height = `${carga}%`;
        s.tempo.textContent = cheia ? '' : `${Math.floor(carga)}%`;
        s.el.classList.toggle('pronto', cheia && !morto);
        s.el.classList.toggle('carregando', !cheia);
        s.el.classList.toggle('mirando', controle.mirandoUlt);
        continue;
      }
      if (slot === 'pocao') {
        const n = REGRAS.pocao.abatesNecessarios;
        const etapas = Math.min(n, controle.pocao);
        s.carga.style.height = `${(etapas / n) * 100}%`;
        s.tempo.textContent = etapas < n ? `${etapas}/${n}` : '';
        s.el.classList.toggle('pronto', etapas >= n && !morto);
        s.el.classList.toggle('carregando', etapas < n);
        continue;
      }
      const resta = Math.max(0, controle.recargas[slot] - t);
      const travado = t < controle.ocupadoAte;
      const fracao = s.total ? resta / s.total : 0;
      s.recarga.style.background = resta > 0 ? `conic-gradient(rgba(0,0,0,.55) ${fracao * 360}deg, transparent 0)` : '';
      s.tempo.textContent = resta > 0 ? (resta >= 1 ? Math.ceil(resta) : resta.toFixed(1)) : '';
      s.el.classList.toggle('pronto', resta <= 0 && !travado && !morto);
      s.el.classList.toggle('carregando', resta > 0);
    }
    this.elMiraUlt.classList.toggle('oculto', !controle.mirandoUlt);

    this.elDerrota.classList.toggle('oculto', !morto);
    if (morto) {
      const resta = Math.max(0, REGRAS.tempoRenascer - (t - controle.mortoEm));
      const quem = controle.mortoPor != null ? nomes.get(controle.mortoPor) : null;
      this.elDerrotaTexto.textContent = `${quem ? `Derrotado por ${quem}` : 'Derrotado'} — voltando em ${Math.ceil(resta)} s`;
    }

    this.elPing.textContent = ping == null ? 'sem conexão' : `${ping} ms`;
  }

  placar(jogadores, meuId) {
    const t = performance.now();
    if (t - this.ultimoPlacar < 250) return;
    this.ultimoPlacar = t;
    const ordenados = [...jogadores].sort((a, b) => b.k - a.k || a.d - b.d);
    const html = ordenados
      .map((j) => {
        const def = PERSONAGENS[j.p];
        const classe = j.id === meuId ? ' class="voce"' : '';
        return `<li${classe}><i style="background:${def?.cor ?? '#888'}"></i><span>${escapar(j.n)}</span><b>${j.k}</b><em>${j.d}</em></li>`;
      })
      .join('');
    if (html !== this.placarHtml) this.elPlacar.innerHTML = this.placarHtml = html;
  }

  aviso(texto, classe = '') {
    const el = document.createElement('div');
    el.className = classe;
    el.textContent = texto;
    this.elAvisos.appendChild(el);
    while (this.elAvisos.children.length > 5) this.elAvisos.firstChild.remove();
    setTimeout(() => el.remove(), 4000);
  }
}
