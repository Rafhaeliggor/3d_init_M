// =====================================================================
//  PARTIDA (roda no servidor)
//  O servidor é quem decide o combate: valida recargas, resolve golpes,
//  projéteis, dano, mortes e renascimentos, e controla os bots.
//  Cada jogador move o próprio personagem no navegador e manda a posição
//  ~20x por segundo; o servidor repassa o estado de todos na mesma taxa.
// =====================================================================
import { PERSONAGENS } from '../shared/personagens.js';
import { REGRAS, EFEITO_ATORDOADO, EFEITO_LENTO, EFEITO_MARCADO, DECAIMENTO_EMPURRAO } from '../shared/regras.js';
import { dentroDoGolpe, dentroDoRetangulo, distanciaAoSegmento, frenteDe, limitarAoCirculo } from '../shared/util.js';

// Folga (s) ao conferir recargas: o relógio do navegador e o do servidor
// nunca batem exatamente, e o jogador não deve perder um golpe por isso.
const TOLERANCIA = 0.12;
const MAX_BOTS = 6;
const NOMES_BOTS = ['Bot Alfa', 'Bot Bravo', 'Bot Charlie', 'Bot Delta', 'Bot Eco', 'Bot Foxtrot'];

const agora = () => performance.now() / 1000;
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

export class Jogo {
  constructor({ enderecos = [] } = {}) {
    this.enderecos = enderecos;
    this.jogadores = new Map();
    this.pendentes = []; // golpes/projéteis aguardando o tempo de preparo
    this.projeteis = [];
    this.proximoId = 1;
    this.ultimoTick = agora();
    this.intervalo = setInterval(() => this.tick(), 1000 / REGRAS.taxaServidor);
  }

  // ---------------------------------------------------------------
  // Conexões
  // ---------------------------------------------------------------
  conectar(ws) {
    const j = this.novoJogador({ ws });
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
    this.enviar(j, { t: 'ola', id: j.id, enderecos: this.enderecos });
    return j;
  }

  novoJogador(extra) {
    const j = {
      id: this.proximoId++,
      ws: null,
      bot: false,
      nome: '',
      personagem: null,
      def: null,
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
      ult: 0, // carga da ultimate (0–100)
      pocao: 0, // abates rumo à poção; = REGRAS.pocao.abatesNecessarios quando tem uma
      // só bots (o servidor move): empurrão e avanço
      kbx: 0,
      kbz: 0,
      dash: null,
      proximaDecisao: 0,
      ...extra,
    };
    this.jogadores.set(j.id, j);
    return j;
  }

  desconectar(j) {
    if (!this.jogadores.has(j.id)) return;
    this.jogadores.delete(j.id);
    this.pendentes = this.pendentes.filter((p) => p.atacante !== j);
    this.projeteis = this.projeteis.filter((p) => p.dono !== j);
    if (j.emJogo) this.aviso(`${j.nome} saiu`);
    // Sem nenhuma pessoa conectada, os bots não têm por que continuar.
    if (![...this.jogadores.values()].some((o) => !o.bot)) this.removerBots();
  }

  mensagem(j, m) {
    switch (m.t) {
      case 'entrar':
        return this.entrar(j, m);
      case 'sair':
        if (j.emJogo) this.aviso(`${j.nome} saiu da arena`);
        j.emJogo = false;
        this.pendentes = this.pendentes.filter((p) => p.atacante !== j);
        return;
      case 'pos':
        return this.receberPosicao(j, m);
      case 'acao':
        return void this.acao(j, String(m.acao), Number(m.r), m.alvo);
      case 'pocao':
        return this.usarPocao(j);
      case 'ping':
        return this.enviar(j, { t: 'pong', c: m.c });
      case 'bot':
        if (m.cmd === 'adicionar') return this.adicionarBot();
        if (m.cmd === 'remover') return this.removerBots();
        return;
    }
  }

  entrar(j, m) {
    const chave = String(m.personagem);
    if (!Object.hasOwn(PERSONAGENS, chave)) return;
    const nome = String(m.nome ?? '').trim().slice(0, 16) || `Jogador ${j.id}`;
    const trocou = j.emJogo;
    j.nome = nome;
    j.personagem = chave;
    j.def = PERSONAGENS[chave];
    j.emJogo = true;
    j.recargas = { ataque: 0, hab1: 0, hab2: 0, esquiva: 0 };
    j.ult = 0;
    this.renascer(j);
    this.aviso(trocou ? `${nome} agora é ${j.def.nome}` : `${nome} entrou como ${j.def.nome}`);
  }

  receberPosicao(j, m) {
    if (!j.emJogo || j.morto) return;
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

  // ---------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------
  enviar(j, obj) {
    if (j.ws && j.ws.readyState === 1) j.ws.send(JSON.stringify(obj));
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

  // ---------------------------------------------------------------
  // Ações e combate
  // ---------------------------------------------------------------
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

  // Devolve true se a ação foi aceita.
  acao(j, slot, rot, alvoId) {
    if (!j.emJogo || j.morto || !Number.isFinite(rot)) return false;
    const hab = this.habilidade(j, slot);
    if (!hab) return false;
    const t = agora();
    const ult = slot === 'ult';
    if (this.temEfeito(j, 'atordoado') && !(ult && hab.usavelAtordoado)) return false;
    if (t < j.ocupadoAte - TOLERANCIA) return false;
    if (ult ? j.ult < 100 : t < j.recargas[slot] - TOLERANCIA) return false;

    // Ultimates com alvo: confere antes de gastar a carga.
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
        // Imune: já sai do atordoamento/lentidão que estiver sofrendo.
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
    if (!alvo || alvo === j || !this.atingivel(alvo)) return false;
    // Pequena folga: a tela de quem mira mostra o alvo ~100 ms atrasado.
    if (alvo.vida / alvo.def.vida > hab.limiteVida + 0.03) return false;
    return Math.hypot(alvo.x - j.x, alvo.z - j.z) <= hab.alcance + 1.5;
  }

  // Sorteio que favorece quem tem mais abates e mais vida.
  sortearMarca(j) {
    const candidatos = [...this.jogadores.values()].filter((o) => o !== j && this.atingivel(o));
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
    if (j.pocao >= n) return; // só carrega uma poção
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
      if (alvo === a || !this.atingivel(alvo)) continue;
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

    // Cura por acertar (Tufão, Colheita): uma vez só, mesmo pegando vários.
    if (acertou && hab.curaSeAcertar && this.atingivel(a) && a.vida < a.def.vida) {
      const cura = Math.min(a.def.vida - a.vida, Math.round(a.def.vida * hab.curaSeAcertar));
      a.vida += cura;
      this.transmitir({ t: 'cura', alvo: a.id, valor: Math.round(cura) });
    }
  }

  lancarProjetil(a, hab, rot) {
    const f = frenteDe(rot);
    const p = {
      id: this.proximoId++,
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

    // Carga da ultimate: quem bate e quem apanha.
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
    // Puxão: no máximo até encostar no atacante.
    if (empurrao < 0) empurrao = -Math.min(-empurrao, Math.max(0, dist - a.def.raio - alvo.def.raio - 0.2));
    if (empurrao && !this.temEfeito(alvo, 'imune')) this.empurrar(alvo, dx * empurrao, dz * empurrao);

    if (alvo.vida <= 0) return this.morrer(alvo, a);
    if (hab.atordoar) this.aplicarEfeito(alvo, { ...EFEITO_ATORDOADO, duracao: hab.atordoar });
    if (hab.lentidao) {
      this.aplicarEfeito(alvo, {
        ...EFEITO_LENTO,
        multVelocidade: hab.lentidao.mult,
        duracao: hab.lentidao.duracao,
      });
    }
  }

  // Deslocamento em metros. Jogadores aplicam no próprio navegador;
  // bots são movidos aqui.
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
    // Marcado pela Sentença: o abate é de quem marcou, que recupera a vida.
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
  }

  pontoDeNascimento() {
    const vivos = [...this.jogadores.values()].filter((j) => this.atingivel(j));
    let melhor = null;
    let melhorDist = -1;
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = REGRAS.raioArena * 0.65;
      const p = { x: Math.sin(ang) * r, z: Math.cos(ang) * r };
      const d = vivos.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.z - p.z)), 999);
      if (d > melhorDist) {
        melhor = p;
        melhorDist = d;
      }
    }
    return melhor;
  }

  renascer(j) {
    const p = this.pontoDeNascimento();
    j.x = p.x;
    j.z = p.z;
    j.rot = Math.atan2(-p.x, -p.z); // olhando para o centro
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

  // ---------------------------------------------------------------
  // Bots
  // ---------------------------------------------------------------
  adicionarBot() {
    const bots = [...this.jogadores.values()].filter((j) => j.bot);
    if (bots.length >= MAX_BOTS) return;
    const chaves = Object.keys(PERSONAGENS);
    const chave = chaves[Math.floor(Math.random() * chaves.length)];
    const nome = NOMES_BOTS.find((n) => !bots.some((b) => b.nome === n)) ?? 'Bot';
    const b = this.novoJogador({ bot: true, nome, personagem: chave, def: PERSONAGENS[chave], emJogo: true });
    this.renascer(b);
    this.aviso(`${nome} (${b.def.nome}) entrou`);
  }

  removerBots() {
    let removidos = 0;
    for (const j of [...this.jogadores.values()]) {
      if (!j.bot) continue;
      this.desconectarBot(j);
      removidos++;
    }
    if (removidos) this.aviso('Bots removidos');
  }

  desconectarBot(b) {
    this.jogadores.delete(b.id);
    this.pendentes = this.pendentes.filter((p) => p.atacante !== b);
    this.projeteis = this.projeteis.filter((p) => p.dono !== b);
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

  // Usa a ultimate quando faz sentido. Devolve true se usou.
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
    // Física controlada pelo servidor: avanço e empurrão.
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
      if (o === b || !this.atingivel(o)) continue;
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

    // Decide com um pequeno "tempo de reação", para não ser perfeito.
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

    // Anda até ficar no alcance do ataque básico.
    const desejado = b.def.ataque.alcance * 0.7 + alvo.def.raio;
    if (dist > desejado && !b.dash) {
      const lento = t < b.ocupadoAte ? 0.35 : 1;
      const vel = b.def.velocidade * 0.85 * lento * this.produto(b, 'multVelocidade');
      b.x += (dx / dist) * vel * dt;
      b.z += (dz / dist) * vel * dt;
      b.mov = true;
    }

    // Não atravessa os outros.
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

  // ---------------------------------------------------------------
  // Laço principal
  // ---------------------------------------------------------------
  tick() {
    const t = agora();
    const dt = Math.min(t - this.ultimoTick, 0.25);
    this.ultimoTick = t;

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
      // Testa o trecho percorrido desde o último tick, não só o ponto atual.
      for (const alvo of this.jogadores.values()) {
        if (alvo === j || !this.atingivel(alvo) || inv.atingidos.has(alvo.id)) continue;
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
        if (alvo === p.dono || !this.atingivel(alvo)) continue;
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
    return { t: 'snap', tempo: Math.round(t * 1000), j: lista };
  }

  encerrar() {
    clearInterval(this.intervalo);
  }
}
