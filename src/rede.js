// Conexão WebSocket com o servidor (mesmo endereço da página, rota /ws).
// Reconecta sozinha se o servidor cair ou reiniciar.

export class Rede {
  constructor() {
    this.ouvintes = new Map();
    this.ws = null;
    this.conectado = false;
    this.ping = null;
    this.conectar();
    setInterval(() => this.enviar({ t: 'ping', c: performance.now() }), 2000);
    this.em('pong', ({ c }) => {
      this.ping = Math.round(performance.now() - c);
    });
  }

  conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocolo}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.conectado = true;
      this.emitir('conectado');
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.emitir(msg.t, msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const estava = this.conectado;
      this.conectado = false;
      this.ping = null;
      if (estava) this.emitir('desconectado');
      setTimeout(() => this.conectar(), 1500);
    };
  }

  em(tipo, fn) {
    if (!this.ouvintes.has(tipo)) this.ouvintes.set(tipo, []);
    this.ouvintes.get(tipo).push(fn);
  }

  emitir(tipo, msg) {
    for (const fn of this.ouvintes.get(tipo) ?? []) fn(msg);
  }

  enviar(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}
