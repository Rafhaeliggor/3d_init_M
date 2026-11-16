// =====================================================================
//  ÁUDIO — efeitos e trilha 100% sintetizados (WebAudio)
//  Nada é baixado: todos os sons são gerados por código, então não há
//  arquivos nem licenças para gerenciar e funciona offline. O contexto
//  de áudio só nasce depois de um gesto do usuário (clicar em "Lutar"),
//  como exigem os navegadores.
// =====================================================================

const PROGRESSAO = [
  // Lá menor melancólico: acordes (tônica, terça, quinta) em Hz.
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [164.81, 207.65, 246.94], // Em
];

class GerenciadorAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.musica = null;
    this.somLigado = true;
    this.musicaLigada = true;
    this._musicaTocando = false;
    this._timer = null;
    this._bar = 0;
    this._proxima = 0;
    try {
      this.somLigado = localStorage.getItem('combat:som') !== '0';
      this.musicaLigada = localStorage.getItem('combat:musica') !== '0';
    } catch {}
  }

  // Cria/retoma o contexto. Chamar a partir de um gesto do usuário.
  iniciar() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.somLigado ? 1 : 0;
      this.sfx.connect(this.master);
      this.musica = this.ctx.createGain();
      this.musica.gain.value = 0;
      this.musica.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicaLigada) this.iniciarMusica();
  }

  definirSom(ligado) {
    this.somLigado = ligado;
    try { localStorage.setItem('combat:som', ligado ? '1' : '0'); } catch {}
    if (this.sfx) {
      const t = this.ctx.currentTime;
      this.sfx.gain.cancelScheduledValues(t);
      this.sfx.gain.linearRampToValueAtTime(ligado ? 1 : 0, t + 0.1);
    }
  }

  definirMusica(ligada) {
    this.musicaLigada = ligada;
    try { localStorage.setItem('combat:musica', ligada ? '1' : '0'); } catch {}
    if (!this.ctx) return;
    if (ligada) {
      this.iniciarMusica();
      const t = this.ctx.currentTime;
      this.musica.gain.cancelScheduledValues(t);
      this.musica.gain.linearRampToValueAtTime(0.13, t + 1.5);
    } else if (this.musica) {
      const t = this.ctx.currentTime;
      this.musica.gain.cancelScheduledValues(t);
      this.musica.gain.linearRampToValueAtTime(0, t + 0.8);
    }
  }

  // -------------------------------------------------------------
  // Trilha generativa: um pad lento percorrendo 4 acordes, com um
  // arpejo suave por cima. Agenda os compassos com antecedência.
  // -------------------------------------------------------------
  iniciarMusica() {
    if (!this.ctx || this._musicaTocando) return;
    this._musicaTocando = true;
    const t = this.ctx.currentTime;
    this.musica.gain.cancelScheduledValues(t);
    this.musica.gain.setValueAtTime(Math.max(0.0001, this.musica.gain.value), t);
    this.musica.gain.linearRampToValueAtTime(0.13, t + 2.5);
    this._proxima = t + 0.15;
    this._agendar();
  }

  _agendar() {
    if (!this._musicaTocando || !this.ctx) return;
    const dur = 3.4; // segundos por acorde
    while (this._proxima < this.ctx.currentTime + 1.5) {
      this._compasso(this._proxima, dur, this._bar++);
      this._proxima += dur;
    }
    this._timer = setTimeout(() => this._agendar(), 500);
  }

  _compasso(t0, dur, i) {
    const acorde = PROGRESSAO[i % PROGRESSAO.length];
    // Pad: duas vozes levemente desafinadas por nota, filtro suave.
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 900;
    filtro.Q.value = 0.6;
    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, t0);
    padGain.gain.linearRampToValueAtTime(0.5, t0 + 1.0);
    padGain.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.2);
    filtro.connect(padGain);
    padGain.connect(this.musica);
    for (const f of acorde) {
      for (const det of [-3, 3]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(filtro);
        o.start(t0);
        o.stop(t0 + dur + 0.3);
      }
    }
    // Arpejo: notas dedilhadas (uma oitava acima) ao longo do compasso.
    const passos = 4;
    for (let p = 0; p < passos; p++) {
      const nota = acorde[(p + i) % acorde.length] * 2;
      this._pluck(t0 + (p / passos) * dur + 0.05, nota, 0.11);
    }
  }

  _pluck(t, freq, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(this.musica);
    o.start(t);
    o.stop(t + 1.0);
  }

  // -------------------------------------------------------------
  // Blocos de síntese para os efeitos
  // -------------------------------------------------------------
  _ruido(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _tom({ tipo = 'sine', f0, f1, dur, vol = 0.3, atraso = 0, destino }) {
    const t = this.ctx.currentTime + atraso;
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(destino ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _ruidoFiltrado({ tipo = 'bandpass', f0, f1, dur, vol = 0.3, Q = 1, atraso = 0 }) {
    const t = this.ctx.currentTime + atraso;
    const src = this._ruido(dur);
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.frequency.setValueAtTime(f0, t);
    if (f1 != null) filtro.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    filtro.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filtro);
    filtro.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // -------------------------------------------------------------
  // Efeitos do jogo. `vol` escala o volume (ex.: eventos distantes).
  // -------------------------------------------------------------
  tocar(nome, vol = 1) {
    if (!this.ctx || !this.somLigado) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const v = Math.max(0, Math.min(1.4, vol));
    switch (nome) {
      case 'golpe': // corte no ar
        this._ruidoFiltrado({ tipo: 'bandpass', f0: 1400, f1: 500, dur: 0.18, vol: 0.18 * v, Q: 1.2 });
        break;
      case 'dano': // impacto na carne/armadura
        this._tom({ tipo: 'sine', f0: 180, f1: 60, dur: 0.16, vol: 0.32 * v });
        this._ruidoFiltrado({ tipo: 'lowpass', f0: 1200, f1: 300, dur: 0.12, vol: 0.22 * v, Q: 0.7 });
        break;
      case 'projetil': // lançamento
        this._ruidoFiltrado({ tipo: 'bandpass', f0: 800, f1: 2200, dur: 0.22, vol: 0.16 * v, Q: 2 });
        break;
      case 'esquiva': // rolamento
        this._ruidoFiltrado({ tipo: 'bandpass', f0: 500, f1: 1400, dur: 0.2, vol: 0.14 * v, Q: 1 });
        break;
      case 'morte':
        this._tom({ tipo: 'sawtooth', f0: 260, f1: 50, dur: 0.6, vol: 0.28 * v });
        this._ruidoFiltrado({ tipo: 'lowpass', f0: 900, f1: 120, dur: 0.5, vol: 0.2 * v, Q: 0.6 });
        break;
      case 'cura':
        this._tom({ tipo: 'sine', f0: 523, dur: 0.18, vol: 0.14 * v });
        this._tom({ tipo: 'sine', f0: 659, dur: 0.22, vol: 0.14 * v, atraso: 0.08 });
        this._tom({ tipo: 'sine', f0: 784, dur: 0.3, vol: 0.14 * v, atraso: 0.16 });
        break;
      case 'ultimate':
        this._tom({ tipo: 'sawtooth', f0: 110, f1: 440, dur: 0.5, vol: 0.2 * v });
        this._tom({ tipo: 'square', f0: 220, f1: 660, dur: 0.5, vol: 0.12 * v, atraso: 0.02 });
        break;
      case 'execucao':
        this._tom({ tipo: 'sine', f0: 90, f1: 40, dur: 0.7, vol: 0.4 * v });
        this._ruidoFiltrado({ tipo: 'bandpass', f0: 3000, f1: 400, dur: 0.25, vol: 0.2 * v, Q: 1.5 });
        break;
      case 'lider': // fanfarra curta ao assumir a liderança
        this._tom({ tipo: 'triangle', f0: 523, dur: 0.14, vol: 0.18 * v });
        this._tom({ tipo: 'triangle', f0: 659, dur: 0.14, vol: 0.18 * v, atraso: 0.12 });
        this._tom({ tipo: 'triangle', f0: 880, dur: 0.3, vol: 0.2 * v, atraso: 0.24 });
        break;
      case 'ui':
        this._tom({ tipo: 'triangle', f0: 660, dur: 0.08, vol: 0.12 * v });
        break;
    }
  }
}

export const Audio = new GerenciadorAudio();
