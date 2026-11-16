// =====================================================================
//  SERVIDOR DE PARTIDAS
//  `Servidor` é o lobby: aceita conexões, mantém a lista de salas e
//  encaminha as mensagens. Cada `Sala` roda uma partida independente
//  (combate, bots, objetivo, tempo e recomeço), falando só com os seus
//  jogadores. Um único laço no `Servidor` avança todas as salas.
// =====================================================================
import { PERSONAGENS } from '../shared/personagens.js';
import {
  REGRAS,
  SALA,
  EFEITO_ATORDOADO,
  EFEITO_LENTO,
  EFEITO_MARCADO,
  DECAIMENTO_EMPURRAO,
} from '../shared/regras.js';
import { dentroDoGolpe, dentroDoRetangulo, distanciaAoSegmento, frenteDe, limitarAoCirculo } from '../shared/util.js';

const TOLERANCIA = 0.12; // folga (s) ao conferir recargas (relógios diferentes)
const MAX_BOTS = 6;
const NOMES_BOTS = ['Bot Alfa', 'Bot Bravo', 'Bot Charlie', 'Bot Delta', 'Bot Eco', 'Bot Foxtrot'];

const agora = () => performance.now() / 1000;
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

function enviarMsg(j, obj) {
  if (j.ws && j.ws.readyState === 1) j.ws.send(JSON.stringify(obj));
}

// Campos de um jogador/bot. `id` e `ws` vêm de fora.
function jogadorBase(extra) {
  return {
    id: 0,
    ws: null,
    bot: false,
    nome: '',
    personagem: null,
    def: null,
    sala: null,
    equipe: 0, // 0 = sem time (ffa); 1 ou 2 nos times
    emJogo: false,
    x: 0,
    z: 0,
    rot: 0,
    mov: false,
    vida: 0,
    escudo: 0,
    morto: false,
    renasceEm: 0,
    invulneravelAte: 0,
    ocupadoAte: 0,
    recargas: { ataque: 0, hab1: 0, hab2: 0, esquiva: 0 },
    efeitos: [],
    investida: null,
    abates: 0,
    mortes: 0,
    ult: 0,
    pocao: 0,
    kbx: 0,
    kbz: 0,
    dash: null,
    proximaDecisao: 0,
    ...extra,
  };
}

// =====================================================================
//  SALA — uma partida
// =====================================================================
export class Sala {
  constructor(servidor, id, config, dono) {
    this.servidor = servidor;
    this.id = id;
    this.config = config;
    this.senha = config.senha ?? '';
    this.donoId = dono; // quem criou (informativo)
    this.jogadores = new Map();
    this.pendentes = [];
    this.projeteis = [];
    this.ultimoTick = agora();
    this.estado = 'jogando'; // 'jogando' | 'resultado'
    this.partidaEm = agora();
    this.fimEm = 0;
    this.vencedor = null;
  }

  temModoTimes() {
    return this.config.modo === 'times';
  }

  participantes() {
    return this.jogadores.size;
  }

  humanos() {
    return [...this.jogadores.values()].filter((j) => !j.bot);
  }

  // Entrada/saída -------------------------------------------------
  // Reserva uma vaga na sala. O jogador ainda está escolhendo personagem:
  // conta para a lotação, mas não aparece na arena até nascer.
  reservar(j) {
    j.sala = this;
    j.emJogo = false;
    j.equipe = 0;
    j.personagem = null;
    j.def = null;
    this.jogadores.set(j.id, j);
  }

  // Escolheu o personagem → nasce de fato na arena.
  spawnar(j, nome, personagem) {
    if (!Object.hasOwn(PERSONAGENS, personagem)) return;
    j.sala = this;
    if (!this.jogadores.has(j.id)) this.jogadores.set(j.id, j);
    j.nome = String(nome ?? '').trim().slice(0, 16) || `Jogador ${j.id}`;
    j.personagem = personagem;
    j.def = PERSONAGENS[personagem];
    j.emJogo = true;
    j.recargas = { ataque: 0, hab1: 0, hab2: 0, esquiva: 0 };
    j.ult = 0;
    j.abates = 0;
    j.mortes = 0;
    if (!j.equipe) this.atribuirEquipe(j);
    this.renascer(j);
    this.aviso(`${j.nome} entrou como ${j.def.nome}`);
    this.enviar(j, { t: 'nascido', suaEquipe: j.equipe, x: arred(j.x), z: arred(j.z), r: arred(j.rot, 3) });
    this.servidor.transmitirLobby();
  }

  trocarPersonagem(j, nome, personagem) {
    if (!Object.hasOwn(PERSONAGENS, personagem)) return;
    j.nome = String(nome ?? '').trim().slice(0, 16) || j.nome;
    j.personagem = personagem;
    j.def = PERSONAGENS[personagem];
    this.renascer(j);
    this.aviso(`${j.nome} agora é ${j.def.nome}`);
  }

  removerJogador(j) {
    if (!this.jogadores.has(j.id)) return;
    const estava = j.emJogo; // só anuncia quem chegou a nascer
    this.jogadores.delete(j.id);
    this.pendentes = this.pendentes.filter((p) => p.atacante !== j);
    this.projeteis = this.projeteis.filter((p) => p.dono !== j);
    j.sala = null;
    j.emJogo = false;
    if (estava) this.aviso(`${j.nome} saiu`);
    if (!this.humanos().length) this.removerBots();
  }

  atribuirEquipe(j) {
    if (!this.temModoTimes()) {
      j.equipe = 0;
      return;
    }
    const cont = { 1: 0, 2: 0 };
    for (const o of this.jogadores.values()) if (o !== j && o.equipe) cont[o.equipe]++;
    j.equipe = cont[1] <= cont[2] ? 1 : 2;
  }

  mesmaEquipe(a, b) {
    return this.temModoTimes() && a.equipe !== 0 && a.equipe === b.equipe;
  }

  // Envio ---------------------------------------------------------
  enviar(j, obj) {
    enviarMsg(j, obj);
  }

  transmitir(obj) {
    const texto = JSON.stringify(obj);
    for (const j of this.jogadores.values()) {
      if (j.ws && j.ws.readyState === 1) j.ws.send(texto);
    }
  }

  aviso(texto) {
    this.transmitir({ t: 'aviso', texto });
  }

  // Mensagens dentro da partida -----------------------------------
  mensagem(j, m) {
    switch (m.t) {
      case 'entrar':
        return this.spawnar(j, m.nome, m.personagem);
      case 'pos':
        return this.receberPosicao(j, m);
      case 'acao':
        return void this.acao(j, String(m.acao), Number(m.r), m.alvo);
      case 'pocao':
        return this.usarPocao(j);
      case 'trocar':
        return this.trocarPersonagem(j, m.nome, m.personagem);
      case 'bot':
        if (m.cmd === 'adicionar') return this.adicionarBot();
        if (m.cmd === 'remover') return this.removerBots();
        return;
    }
  }

  receberPosicao(j, m) {
    if (!j.emJogo || j.morto || this.estado !== 'jogando') return;
    const x = Number(m.x);
    const z = Number(m.z);
    const r = Number(m.r);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(r)) return;
    j.x = x;
    j.z = z;
    limitarAoCirculo(j, REGRAS.raioArena);
    j.rot = r;
    j.mov = Boolean(m.m);
  }

  // Ações e combate -----------------------------------------------
  habilidade(j, slot) {
    if (slot === 'esquiva') return REGRAS.esquiva;
    if (slot === 'ataque' || slot === 'hab1' || slot === 'hab2' || slot === 'ult') return j.def[slot] ?? null;
    return null;
  }

  atingivel(j) {
    return j.emJogo && !j.morto;
  }

  temEfeito(j, campo) {
    return j.efeitos.some((e) => e[campo]);
  }

  produto(j, campo) {
    return j.efeitos.reduce((m, e) => m * (e[campo] ?? 1), 1);
  }

  maximo(j, campo) {
    return j.efeitos.reduce((m, e) => Math.max(m, e[campo] ?? 0), 0);
  }

  acao(j, slot, rot, alvoId) {
    if (this.estado !== 'jogando') return false;
    if (!j.emJogo || j.morto || !Number.isFinite(rot)) return false;
    const hab = this.habilidade(j, slot);
    if (!hab) return false;
    const t = agora();
    const ult = slot === 'ult';
    if (this.temEfeito(j, 'atordoado') && !(ult && hab.usavelAtordoado)) return false;
    if (t < j.ocupadoAte - TOLERANCIA) return false;
    if (ult ? j.ult < 100 : t < j.recargas[slot] - TOLERANCIA) return false;

    let alvo = null;
    if (hab.tipo === 'execucao') {
      alvo = this.jogadores.get(Number(alvoId));
      if (!this.podeExecutar(j, alvo, hab)) {
        this.enviar(j, { t: 'aviso', texto: 'Execução falhou: alvo longe demais ou com vida alta' });
        return false;
      }
      rot = Math.atan2(alvo.x - j.x, alvo.z - j.z);
    } else if (hab.tipo === 'marca') {
      alvo = this.sortearMarca(j);
      if (!alvo) {
        this.enviar(j, { t: 'aviso', texto: 'Nenhum inimigo para marcar' });
        return false;
      }
    }

    if (ult) j.ult = 0;
    else j.recargas[slot] = t + hab.recarga;
    j.ocupadoAte = t + (hab.duracao ?? 0);
    j.rot = rot;
    this.transmitir({ t: 'acao', id: j.id, acao: slot, r: arred(rot, 3) });
    if (ult && hab.tipo !== 'marca' && hab.tipo !== 'execucao') this.aviso(`${j.nome} usou ${hab.nome}!`);

    const frente = frenteDe(rot);
    switch (hab.tipo) {
      case 'golpe':
      case 'projetil':
        this.pendentes.push({ em: t + (hab.preparo ?? 0), atacante: j, hab, rot });
        break;
      case 'investida':
        j.investida = { ate: t + hab.duracao + 0.15, hab, rot, ux: j.x, uz: j.z, atingidos: new Set() };
        if (j.bot) this.iniciarAvanco(j, frente, hab, t);
        break;
      case 'esquiva':
        j.invulneravelAte = Math.max(j.invulneravelAte, t + hab.invulneravel);
        if (j.bot) this.iniciarAvanco(j, frente, hab, t);
        break;
      case 'buff':
        if (hab.efeito.imune) j.efeitos = j.efeitos.filter((e) => !e.atordoado && e.nome !== EFEITO_LENTO.nome);
        this.aplicarEfeito(j, { nome: hab.nome, ...hab.efeito });
        break;
      case 'execucao':
        this.transmitir({ t: 'execucao', de: j.id, alvo: alvo.id });
        this.transmitir({ t: 'dano', alvo: alvo.id, de: j.id, valor: Math.ceil(alvo.vida), absorvido: 0 });
        this.morrer(alvo, j);
        break;
      case 'marca':
        this.aplicarEfeito(alvo, { ...EFEITO_MARCADO, ...hab.marca, marcadoPor: j.id });
        this.aviso(`${j.nome} marcou ${alvo.nome}! Dano extra nele por ${hab.marca.duracao} s`);
        break;
    }
    return true;
  }

  podeExecutar(j, alvo, hab) {
    if (!alvo || alvo === j || !this.atingivel(alvo) || this.mesmaEquipe(j, alvo)) return false;
    if (alvo.vida / alvo.def.vida > hab.limiteVida + 0.03) return false;
    return Math.hypot(alvo.x - j.x, alvo.z - j.z) <= hab.alcance + 1.5;
  }

  sortearMarca(j) {
    const candidatos = [...this.jogadores.values()].filter((o) => o !== j && this.atingivel(o) && !this.mesmaEquipe(j, o));
    if (!candidatos.length) return null;
    const pesos = candidatos.map((o) => 1 + 2 * o.abates + o.vida / o.def.vida);
    let r = Math.random() * pesos.reduce((s, p) => s + p, 0);
    for (let i = 0; i < candidatos.length; i++) {
      r -= pesos[i];
      if (r <= 0) return candidatos[i];
    }
    return candidatos[candidatos.length - 1];
  }

  usarPocao(j) {
    const pocao = REGRAS.pocao;
    if (!j.emJogo || j.morto || j.pocao < pocao.abatesNecessarios || j.vida >= j.def.vida) return;
    const cura = Math.min(j.def.vida - j.vida, Math.round(j.def.vida * pocao.cura));
    j.vida += cura;
    j.pocao = 0;
    this.transmitir({ t: 'cura', alvo: j.id, valor: Math.round(cura), pocao: 1 });
  }

  ganharAbate(j) {
    j.abates++;
    const n = REGRAS.pocao.abatesNecessarios;
    if (j.pocao >= n) return;
    j.pocao++;
    if (j.pocao === n) this.enviar(j, { t: 'aviso', texto: 'Poção pronta! Aperte R para usar' });
  }

  iniciarAvanco(j, frente, hab, t) {
    const vel = hab.distancia / hab.duracao;
    j.dash = { vx: frente.x * vel, vz: frente.z * vel, ate: t + hab.duracao };
  }

  aplicarEfeito(j, efeito) {
    const controle = efeito.atordoado || efeito.nome === EFEITO_LENTO.nome;
    if (controle && this.temEfeito(j, 'imune')) return;
    j.efeitos = j.efeitos.filter((e) => e.nome !== efeito.nome);
    j.efeitos.push({ ...efeito, ate: agora() + efeito.duracao });
    if (efeito.escudo) j.escudo = Math.min(efeito.escudoMax ?? Infinity, j.escudo + efeito.escudo);
  }

  resolverPendente({ atacante: a, hab, rot }) {
    if (!this.atingivel(a)) return;
    if (hab.tipo === 'projetil') return this.lancarProjetil(a, hab, rot);

    const t = agora();
    let acertou = false;
    for (const alvo of this.jogadores.values()) {
      if (alvo === a || !this.atingivel(alvo) || this.mesmaEquipe(a, alvo)) continue;
      const dentro =
        hab.forma === 'retangulo'
          ? dentroDoRetangulo(a.x, a.z, rot, hab.comprimento, hab.largura, alvo.x, alvo.z, alvo.def.raio)
          : dentroDoGolpe(a.x, a.z, rot, hab.alcance, hab.arco, alvo.x, alvo.z, alvo.def.raio);
      if (!dentro) continue;
      if (t < alvo.invulneravelAte) continue;
      acertou = true;
      let dx = alvo.x - a.x;
      let dz = alvo.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.01) ({ x: dx, z: dz } = frenteDe(rot));
      else {
        dx /= dist;
        dz /= dist;
      }
      this.ferir(alvo, a, hab, dx, dz, dist);
    }

    if (acertou && hab.curaSeAcertar && this.atingivel(a) && a.vida < a.def.vida) {
      const cura = Math.min(a.def.vida - a.vida, Math.round(a.def.vida * hab.curaSeAcertar));
      a.vida += cura;
      this.transmitir({ t: 'cura', alvo: a.id, valor: Math.round(cura) });
    }
  }

  lancarProjetil(a, hab, rot) {
    const f = frenteDe(rot);
    const p = {
      id: this.servidor.novoId(),
      dono: a,
      hab,
      x: a.x + f.x * 0.6,
      z: a.z + f.z * 0.6,
      fx: f.x,
      fz: f.z,
      restante: hab.alcance,
    };
    this.projeteis.push(p);
    this.transmitir({
      t: 'projetil',
      id: p.id,
      dono: a.id,
      arma: a.def.arma,
      x: arred(p.x),
      z: arred(p.z),
      vx: arred(f.x * hab.velocidade),
      vz: arred(f.z * hab.velocidade),
      alcance: hab.alcance,
    });
  }

  ferir(alvo, a, hab, dx, dz, dist) {
    const t = agora();
    if (t < alvo.invulneravelAte) return;
    if (this.mesmaEquipe(a, alvo)) return; // fogo amigo desligado nos times

    let valor = hab.dano * this.produto(a, 'multDano') * this.produto(alvo, 'multDanoRecebido');
    valor *= 1 - Math.min(1, this.maximo(alvo, 'reducaoDano'));
    valor = Math.max(1, Math.round(valor));
    let absorvido = 0;
    if (alvo.escudo > 0) {
      absorvido = Math.min(alvo.escudo, valor);
      alvo.escudo -= absorvido;
      valor -= absorvido;
    }
    alvo.vida = Math.max(0, alvo.vida - valor);

    const total = valor + absorvido;
    if (a !== alvo) a.ult = Math.min(100, a.ult + total * REGRAS.ult.porDanoCausado);
    alvo.ult = Math.min(100, alvo.ult + total * REGRAS.ult.porDanoRecebido);

    const roubo = Math.max(a.def.rouboVida ?? 0, this.maximo(a, 'rouboVida'));
    if (roubo > 0 && valor > 0 && !a.morto) {
      const cura = Math.round(valor * roubo);
      a.vida = Math.min(a.def.vida, a.vida + cura);
      if (cura > 0) this.transmitir({ t: 'cura', alvo: a.id, valor: cura });
    }

    this.transmitir({ t: 'dano', alvo: alvo.id, de: a.id, valor, absorvido });

    let empurrao = hab.empurrao ?? 0;
    if (empurrao < 0) empurrao = -Math.min(-empurrao, Math.max(0, dist - a.def.raio - alvo.def.raio - 0.2));
    if (empurrao && !this.temEfeito(alvo, 'imune')) this.empurrar(alvo, dx * empurrao, dz * empurrao);

    if (alvo.vida <= 0) return this.morrer(alvo, a);
    if (hab.atordoar) this.aplicarEfeito(alvo, { ...EFEITO_ATORDOADO, duracao: hab.atordoar });
    if (hab.lentidao) {
      this.aplicarEfeito(alvo, { ...EFEITO_LENTO, multVelocidade: hab.lentidao.mult, duracao: hab.lentidao.duracao });
    }
  }

  empurrar(alvo, mx, mz) {
    const vx = mx * DECAIMENTO_EMPURRAO;
    const vz = mz * DECAIMENTO_EMPURRAO;
    if (alvo.bot) {
      alvo.kbx += vx;
      alvo.kbz += vz;
    } else {
      this.enviar(alvo, { t: 'impulso', x: arred(vx), z: arred(vz) });
    }
  }

  morrer(alvo, a) {
    const marca = alvo.efeitos.find((e) => e.marcadoPor);
    const marcador = marca && this.jogadores.get(marca.marcadoPor);
    if (marcador && marcador !== alvo && marcador.emJogo) {
      a = marcador;
      if (!marcador.morto && marcador.vida < marcador.def.vida) {
        const cura = Math.round(marcador.def.vida - marcador.vida);
        marcador.vida = marcador.def.vida;
        this.transmitir({ t: 'cura', alvo: marcador.id, valor: cura });
      }
    }
    alvo.morto = true;
    alvo.vida = 0;
    alvo.escudo = 0;
    alvo.efeitos = [];
    alvo.investida = null;
    alvo.dash = null;
    alvo.renasceEm = agora() + REGRAS.tempoRenascer;
    alvo.mortes++;
    if (a !== alvo) this.ganharAbate(a);
    this.pendentes = this.pendentes.filter((p) => p.atacante !== alvo);
    this.transmitir({ t: 'morte', alvo: alvo.id, de: a.id });
    this.verificarVitoria();
  }

  pontoDeNascimento(equipe = 0) {
    const vivos = [...this.jogadores.values()].filter((j) => this.atingivel(j));
    let melhor = null;
    let melhorDist = -1;
    for (let i = 0; i < 12; i++) {
      let ang = Math.random() * Math.PI * 2;
      // Nos times, cada lado nasce na sua metade da arena.
      if (equipe === 1) ang = Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
      else if (equipe === 2) ang = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.8;
      const r = REGRAS.raioArena * 0.65;
      const p = { x: Math.sin(ang) * r, z: Math.cos(ang) * r };
      // Longe dos inimigos, perto o bastante de não cair em cima de aliados.
      const d = vivos.reduce((m, o) => {
        const dd = Math.hypot(o.x - p.x, o.z - p.z);
        return this.temModoTimes() && o.equipe === equipe && equipe !== 0 ? m : Math.min(m, dd);
      }, 999);
      if (d > melhorDist) {
        melhor = p;
        melhorDist = d;
      }
    }
    return melhor;
  }

  renascer(j) {
    const p = this.pontoDeNascimento(j.equipe);
    j.x = p.x;
    j.z = p.z;
    j.rot = Math.atan2(-p.x, -p.z);
    j.vida = j.def.vida;
    j.escudo = 0;
    j.efeitos = [];
    j.morto = false;
    j.mov = false;
    j.ocupadoAte = 0;
    j.investida = null;
    j.dash = null;
    j.kbx = 0;
    j.kbz = 0;
    j.invulneravelAte = agora() + REGRAS.invulneravelAoRenascer;
    this.transmitir({ t: 'renascer', id: j.id, x: arred(j.x), z: arred(j.z), r: arred(j.rot, 3) });
  }

  // Bots ----------------------------------------------------------
  adicionarBot() {
    if (!this.config.permitirBots) return;
    const bots = [...this.jogadores.values()].filter((j) => j.bot);
    if (bots.length >= MAX_BOTS || this.participantes() >= this.config.maxJogadores) return;
    const chaves = Object.keys(PERSONAGENS);
    const chave = chaves[Math.floor(Math.random() * chaves.length)];
    const nome = NOMES_BOTS.find((n) => !bots.some((b) => b.nome === n)) ?? 'Bot';
    const b = jogadorBase({ id: this.servidor.novoId(), bot: true, nome, personagem: chave, def: PERSONAGENS[chave], emJogo: true, sala: this });
    this.atribuirEquipe(b);
    this.jogadores.set(b.id, b);
    this.renascer(b);
    this.aviso(`${nome} (${b.def.nome}) entrou`);
    this.servidor.transmitirLobby();
  }

  removerBots() {
    let removidos = 0;
    for (const j of [...this.jogadores.values()]) {
      if (!j.bot) continue;
      this.jogadores.delete(j.id);
      this.pendentes = this.pendentes.filter((p) => p.atacante !== j);
      this.projeteis = this.projeteis.filter((p) => p.dono !== j);
      removidos++;
    }
    if (removidos) {
      this.aviso('Bots removidos');
      this.servidor.transmitirLobby();
    }
  }

  alcancaCom(hab, dist) {
    switch (hab.tipo) {
      case 'golpe':
        return dist <= (hab.forma === 'retangulo' ? hab.comprimento : hab.alcance) + 0.3;
      case 'investida':
        return dist <= hab.distancia;
      case 'projetil':
        return dist > 3 && dist <= hab.alcance;
      case 'buff':
        return dist < 4;
      default:
        return false;
    }
  }

  botUlt(b, alvo, dist, rot) {
    const hab = b.def.ult;
    switch (hab.tipo) {
      case 'golpe':
        return (
          dentroDoRetangulo(b.x, b.z, rot, hab.comprimento * 0.8, hab.largura, alvo.x, alvo.z, alvo.def.raio) &&
          this.acao(b, 'ult', rot)
        );
      case 'execucao':
        for (const o of this.jogadores.values()) {
          if (this.podeExecutar(b, o, hab)) return this.acao(b, 'ult', rot, o.id);
        }
        return false;
      case 'marca':
        return dist < 8 && this.acao(b, 'ult', rot);
      default:
        return dist < 5 && this.acao(b, 'ult', rot);
    }
  }

  pensarBot(b, t, dt) {
    if (b.dash) {
      if (t < b.dash.ate) {
        b.x += b.dash.vx * dt;
        b.z += b.dash.vz * dt;
      } else b.dash = null;
    }
    if (b.kbx || b.kbz) {
      b.x += b.kbx * dt;
      b.z += b.kbz * dt;
      const f = Math.exp(-DECAIMENTO_EMPURRAO * dt);
      b.kbx *= f;
      b.kbz *= f;
      if (Math.hypot(b.kbx, b.kbz) < 0.05) b.kbx = b.kbz = 0;
    }
    limitarAoCirculo(b, REGRAS.raioArena - b.def.raio);
    b.mov = false;
    if (b.morto) return;
    if (b.vida < b.def.vida * 0.5) this.usarPocao(b);
    if (this.temEfeito(b, 'atordoado')) {
      if (b.ult >= 100 && b.def.ult?.usavelAtordoado) this.acao(b, 'ult', b.rot);
      return;
    }
    if (b.dash) return;

    let alvo = null;
    let dist = Infinity;
    for (const o of this.jogadores.values()) {
      if (o === b || !this.atingivel(o) || this.mesmaEquipe(b, o)) continue;
      const d = Math.hypot(o.x - b.x, o.z - b.z);
      if (d < dist) {
        dist = d;
        alvo = o;
      }
    }
    if (!alvo) return;

    const dx = alvo.x - b.x;
    const dz = alvo.z - b.z;
    const rotAlvo = Math.atan2(dx, dz);
    if (t >= b.ocupadoAte) b.rot = rotAlvo;

    if (t >= b.proximaDecisao) {
      b.proximaDecisao = t + 0.25 + Math.random() * 0.35;
      const d = b.def;
      if (b.ult >= 100 && d.ult && this.botUlt(b, alvo, dist, rotAlvo)) return;
      const tentativas = [
        ['hab2', Math.random() < 0.4],
        ['hab1', Math.random() < 0.5],
        ['ataque', true],
      ];
      for (const [slot, quer] of tentativas) {
        if (quer && this.alcancaCom(d[slot], dist) && this.acao(b, slot, rotAlvo)) break;
      }
    }

    const desejado = b.def.ataque.alcance * 0.7 + alvo.def.raio;
    if (dist > desejado && !b.dash) {
      const lento = t < b.ocupadoAte ? 0.35 : 1;
      const vel = b.def.velocidade * 0.85 * lento * this.produto(b, 'multVelocidade');
      b.x += (dx / dist) * vel * dt;
      b.z += (dz / dist) * vel * dt;
      b.mov = true;
    }

    for (const o of this.jogadores.values()) {
      if (o === b || !this.atingivel(o)) continue;
      const ox = b.x - o.x;
      const oz = b.z - o.z;
      const d = Math.hypot(ox, oz);
      const min = b.def.raio + o.def.raio;
      if (d > 0.001 && d < min) {
        b.x += (ox / d) * (min - d);
        b.z += (oz / d) * (min - d);
      }
    }
    limitarAoCirculo(b, REGRAS.raioArena - b.def.raio);
  }

  // Objetivo, tempo e recomeço ------------------------------------
  pontosPorEquipe() {
    const soma = { 1: 0, 2: 0 };
    for (const j of this.jogadores.values()) soma[j.equipe] = (soma[j.equipe] ?? 0) + j.abates;
    return soma;
  }

  liderAtual() {
    let melhor = null;
    for (const j of this.jogadores.values()) {
      if (!melhor || j.abates > melhor.abates || (j.abates === melhor.abates && j.mortes < melhor.mortes)) melhor = j;
    }
    return melhor;
  }

  verificarVitoria() {
    if (this.estado !== 'jogando') return;
    if (this.temModoTimes()) {
      const soma = this.pontosPorEquipe();
      for (const eq of [1, 2]) {
        if (soma[eq] >= this.config.objetivo) return this.fimPartida({ tipo: 'time', equipe: eq, pontos: soma[eq] });
      }
    } else {
      let venc = null;
      for (const j of this.jogadores.values()) {
        if (j.abates >= this.config.objetivo && (!venc || j.abates > venc.abates)) venc = j;
      }
      if (venc) return this.fimPartida({ tipo: 'jogador', id: venc.id, nome: venc.nome, equipe: venc.equipe, pontos: venc.abates });
    }
  }

  vencedorPorTempo() {
    if (this.temModoTimes()) {
      const soma = this.pontosPorEquipe();
      if (soma[1] === soma[2]) return { tipo: 'empate', pontos: soma[1] };
      const eq = soma[1] > soma[2] ? 1 : 2;
      return { tipo: 'time', equipe: eq, pontos: soma[eq] };
    }
    const lider = this.liderAtual();
    return lider
      ? { tipo: 'jogador', id: lider.id, nome: lider.nome, equipe: lider.equipe, pontos: lider.abates }
      : { tipo: 'empate', pontos: 0 };
  }

  placarFinal() {
    return [...this.jogadores.values()]
      .map((j) => ({ id: j.id, n: j.nome, p: j.personagem, eq: j.equipe, k: j.abates, d: j.mortes, b: j.bot ? 1 : 0 }))
      .sort((a, b) => b.k - a.k || a.d - b.d);
  }

  fimPartida(vencedor) {
    if (this.estado !== 'jogando') return;
    this.estado = 'resultado';
    this.vencedor = vencedor;
    this.fimEm = agora() + SALA.duracaoResultado;
    this.pendentes = [];
    this.projeteis = [];
    for (const j of this.jogadores.values()) {
      j.investida = null;
      j.dash = null;
    }
    this.transmitir({
      t: 'fimPartida',
      modo: this.config.modo,
      vencedor,
      placar: this.placarFinal(),
      proximaEm: SALA.duracaoResultado,
    });
    this.servidor.transmitirLobby();
  }

  reiniciarPartida() {
    for (const j of this.jogadores.values()) {
      j.abates = 0;
      j.mortes = 0;
      j.ult = 0;
      j.pocao = 0;
      j.efeitos = [];
      j.escudo = 0;
      j.recargas = { ataque: 0, hab1: 0, hab2: 0, esquiva: 0 };
      if (j.emJogo) this.renascer(j);
    }
    this.estado = 'jogando';
    this.vencedor = null;
    this.partidaEm = agora();
    this.transmitir({ t: 'novaPartida', objetivo: this.config.objetivo });
    this.servidor.transmitirLobby();
  }

  // Laço da sala (chamado pelo Servidor) --------------------------
  tick() {
    const t = agora();
    const dt = Math.min(t - this.ultimoTick, 0.25);
    this.ultimoTick = t;

    if (this.estado === 'resultado') {
      if (t >= this.fimEm) this.reiniciarPartida();
      this.transmitir(this.snapshot(t));
      return;
    }

    for (const j of this.jogadores.values()) {
      if (!j.emJogo) continue;
      if (j.efeitos.length) {
        j.efeitos = j.efeitos.filter((e) => e.ate > t);
        if (j.escudo > 0 && !j.efeitos.some((e) => e.escudo)) j.escudo = 0;
      }
      if (j.morto && t >= j.renasceEm) this.renascer(j);
      if (!j.morto) {
        const regen = j.def.regeneracao ?? REGRAS.regeneracao;
        if (regen > 0 && j.vida < j.def.vida) j.vida = Math.min(j.def.vida, j.vida + regen * dt);
        j.ult = Math.min(100, j.ult + REGRAS.ult.passivaPorSegundo * dt);
      }
    }

    for (const j of [...this.jogadores.values()]) if (j.bot) this.pensarBot(j, t, dt);

    const prontos = this.pendentes.filter((p) => p.em <= t);
    this.pendentes = this.pendentes.filter((p) => p.em > t);
    for (const p of prontos) this.resolverPendente(p);

    this.atualizarInvestidas(t);
    this.atualizarProjeteis(dt);

    if (this.config.tempoLimite > 0 && t - this.partidaEm >= this.config.tempoLimite) {
      this.fimPartida(this.vencedorPorTempo());
    }

    this.transmitir(this.snapshot(t));
  }

  atualizarInvestidas(t) {
    for (const j of this.jogadores.values()) {
      const inv = j.investida;
      if (!inv) continue;
      if (!this.atingivel(j) || t > inv.ate) {
        j.investida = null;
        continue;
      }
      for (const alvo of this.jogadores.values()) {
        if (alvo === j || !this.atingivel(alvo) || inv.atingidos.has(alvo.id) || this.mesmaEquipe(j, alvo)) continue;
        const d = distanciaAoSegmento(inv.ux, inv.uz, j.x, j.z, alvo.x, alvo.z);
        if (d > j.def.raio + alvo.def.raio + 0.35) continue;
        inv.atingidos.add(alvo.id);
        const f = frenteDe(inv.rot);
        this.ferir(alvo, j, inv.hab, f.x, f.z, d);
      }
      inv.ux = j.x;
      inv.uz = j.z;
    }
  }

  atualizarProjeteis(dt) {
    for (const p of this.projeteis) {
      const passo = Math.min(p.hab.velocidade * dt, p.restante);
      const nx = p.x + p.fx * passo;
      const nz = p.z + p.fz * passo;
      let acertou = null;
      for (const alvo of this.jogadores.values()) {
        if (alvo === p.dono || !this.atingivel(alvo) || this.mesmaEquipe(p.dono, alvo)) continue;
        if (distanciaAoSegmento(p.x, p.z, nx, nz, alvo.x, alvo.z) <= p.hab.raio + alvo.def.raio) {
          acertou = alvo;
          break;
        }
      }
      p.x = nx;
      p.z = nz;
      p.restante -= passo;
      if (acertou) this.ferir(acertou, p.dono, p.hab, p.fx, p.fz, 0);
      if (acertou || p.restante <= 0.001 || Math.hypot(p.x, p.z) > REGRAS.raioArena + 2) {
        p.fim = true;
        this.transmitir({ t: 'projetilFim', id: p.id, x: arred(p.x), z: arred(p.z), acertou: Boolean(acertou) });
      }
    }
    this.projeteis = this.projeteis.filter((p) => !p.fim);
  }

  snapshot(t) {
    const lista = [];
    for (const j of this.jogadores.values()) {
      if (!j.emJogo) continue;
      lista.push({
        id: j.id,
        n: j.nome,
        p: j.personagem,
        eq: j.equipe,
        x: arred(j.x),
        z: arred(j.z),
        r: arred(j.rot, 3),
        m: j.mov ? 1 : 0,
        v: Math.ceil(j.vida),
        e: Math.ceil(j.escudo),
        mo: j.morto ? 1 : 0,
        iv: t < j.invulneravelAte ? 1 : 0,
        k: j.abates,
        d: j.mortes,
        b: j.bot ? 1 : 0,
        u: Math.floor(j.ult),
        pc: j.pocao,
        ef: j.efeitos.map((e) => ({
          n: e.nome,
          c: e.cor,
          v: e.multVelocidade ?? 1,
          s: e.atordoado ? 1 : 0,
          mk: e.marcadoPor ? 1 : 0,
          im: e.imune ? 1 : 0,
          r: arred(e.ate - t, 1),
        })),
      });
    }
    const tr = this.config.tempoLimite > 0 && this.estado === 'jogando' ? Math.max(0, this.config.tempoLimite - (t - this.partidaEm)) : -1;
    return { t: 'snap', tempo: Math.round(t * 1000), st: this.estado === 'resultado' ? 1 : 0, tr: arred(tr, 1), j: lista };
  }

  // Resumo para a lista do lobby.
  infoLobby() {
    return {
      id: this.id,
      nome: this.config.nome,
      modo: this.config.modo,
      objetivo: this.config.objetivo,
      max: this.config.maxJogadores,
      jogadores: this.humanos().length,
      bots: this.jogadores.size - this.humanos().length,
      temSenha: Boolean(this.senha),
      emJogo: this.estado === 'jogando',
      tempoLimite: this.config.tempoLimite,
      permitirBots: this.config.permitirBots,
    };
  }
}

// =====================================================================
//  SERVIDOR — lobby e roteamento
// =====================================================================
export class Servidor {
  constructor({ enderecos = [] } = {}) {
    this.enderecos = enderecos;
    this.conexoes = new Map(); // id → jogador (humano)
    this.salas = new Map(); // id → Sala
    this.proximoId = 1;
    this.ultimoCodigo = 0;
    this.intervalo = setInterval(() => this.laco(), 1000 / REGRAS.taxaServidor);
  }

  novoId() {
    return this.proximoId++;
  }

  gerarCodigo() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo;
    do {
      codigo = Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
    } while (this.salas.has(codigo));
    return codigo;
  }

  // Conexões ------------------------------------------------------
  conectar(ws) {
    const j = jogadorBase({ id: this.novoId(), ws });
    this.conexoes.set(j.id, j);
    ws.on('message', (dados) => {
      let msg;
      try {
        msg = JSON.parse(dados);
      } catch {
        return;
      }
      if (msg && typeof msg.t === 'string') this.mensagem(j, msg);
    });
    ws.on('close', () => this.desconectar(j));
    ws.on('error', () => {});
    this.enviar(j, { t: 'ola', id: j.id, enderecos: this.enderecos, salas: this.listaSalas() });
    return j;
  }

  desconectar(j) {
    if (j.sala) j.sala.removerJogador(j);
    this.conexoes.delete(j.id);
    this.limparSalasVazias();
    this.transmitirLobby();
  }

  mensagem(j, m) {
    switch (m.t) {
      case 'ping':
        return this.enviar(j, { t: 'pong', c: m.c });
      case 'listarSalas':
        return this.enviarSalas(j);
      case 'criarSala':
        return this.criarSala(j, m);
      case 'entrarSala':
        return this.entrarSala(j, m);
      case 'sair':
      case 'sairSala':
        return this.sairSala(j);
      default:
        // Mensagens de partida só valem dentro de uma sala.
        if (j.sala) j.sala.mensagem(j, m);
    }
  }

  enviar(j, obj) {
    enviarMsg(j, obj);
  }

  // Lobby ---------------------------------------------------------
  listaSalas() {
    return [...this.salas.values()].map((s) => s.infoLobby());
  }

  enviarSalas(j) {
    this.enviar(j, { t: 'salas', lista: this.listaSalas() });
  }

  // Manda a lista atualizada para quem está no lobby (sem sala).
  transmitirLobby() {
    const msg = JSON.stringify({ t: 'salas', lista: this.listaSalas() });
    for (const j of this.conexoes.values()) {
      if (!j.sala && j.ws && j.ws.readyState === 1) j.ws.send(msg);
    }
  }

  sanearConfig(bruto = {}) {
    const p = SALA.padrao;
    const modo = Object.hasOwn(SALA.modos, bruto.modo) ? bruto.modo : p.modo;
    const tempos = SALA.temposLimite;
    const tempoLimite = tempos.includes(Number(bruto.tempoLimite)) ? Number(bruto.tempoLimite) : p.tempoLimite;
    return {
      nome: String(bruto.nome ?? '').trim().slice(0, 24) || 'Arena',
      modo,
      objetivo: Math.round(limitar(Number(bruto.objetivo) || p.objetivo, SALA.objetivoMin, SALA.objetivoMax)),
      maxJogadores: Math.round(limitar(Number(bruto.maxJogadores) || p.maxJogadores, SALA.jogadoresMin, SALA.jogadoresMax)),
      tempoLimite,
      permitirBots: bruto.permitirBots !== false,
      senha: String(bruto.senha ?? '').slice(0, 24),
    };
  }

  criarSala(j, m) {
    if (this.salas.size >= 50) return this.enviar(j, { t: 'erroSala', motivo: 'Muitas salas abertas. Tente mais tarde.' });
    if (j.sala) j.sala.removerJogador(j);
    const bruto = m.config ?? m;
    const config = this.sanearConfig({ ...bruto, senha: m.senha ?? bruto.senha });
    const id = this.gerarCodigo();
    const sala = new Sala(this, id, config, j.id);
    this.salas.set(id, sala);
    sala.reservar(j);
    this.enviar(j, this.msgSalaEntrou(sala));
    this.transmitirLobby();
  }

  entrarSala(j, m) {
    const sala = this.salas.get(String(m.salaId ?? '').toUpperCase());
    if (!sala) return this.enviar(j, { t: 'erroSala', motivo: 'Sala não encontrada.' });
    if (sala.senha && sala.senha !== String(m.senha ?? '')) {
      return this.enviar(j, { t: 'erroSala', motivo: 'Senha incorreta.' });
    }
    if (!sala.jogadores.has(j.id) && sala.participantes() >= sala.config.maxJogadores) {
      return this.enviar(j, { t: 'erroSala', motivo: 'Sala cheia.' });
    }
    if (j.sala && j.sala !== sala) j.sala.removerJogador(j);
    if (!sala.jogadores.has(j.id)) sala.reservar(j);
    this.enviar(j, this.msgSalaEntrou(sala));
    this.transmitirLobby();
  }

  sairSala(j) {
    if (!j.sala) return;
    j.sala.removerJogador(j);
    this.limparSalasVazias();
    this.enviar(j, { t: 'saiuSala' });
    this.enviarSalas(j);
    this.transmitirLobby();
  }

  msgSalaEntrou(sala) {
    return {
      t: 'salaEntrou',
      salaId: sala.id,
      config: {
        nome: sala.config.nome,
        modo: sala.config.modo,
        objetivo: sala.config.objetivo,
        maxJogadores: sala.config.maxJogadores,
        tempoLimite: sala.config.tempoLimite,
        permitirBots: sala.config.permitirBots,
      },
    };
  }

  limparSalasVazias() {
    for (const [id, sala] of this.salas) {
      if (!sala.humanos().length) this.salas.delete(id);
    }
  }

  // Laço geral: avança todas as salas (que têm gente).
  laco() {
    for (const sala of this.salas.values()) {
      if (sala.jogadores.size) sala.tick();
    }
  }

  encerrar() {
    clearInterval(this.intervalo);
  }
}

// Compatibilidade: o servidor antigo exportava `Jogo`.
export { Servidor as Jogo };
