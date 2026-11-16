// Lobby: lista de salas e criação de sala. Aparece depois de escolher o
// personagem e antes de entrar na arena.
import { SALA } from '../shared/regras.js';

const $ = (id) => document.getElementById(id);

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function formatarTempo(seg) {
  if (!seg) return 'sem limite';
  const m = Math.floor(seg / 60);
  return `${m} min`;
}

export class Lobby {
  constructor({ aoCriar, aoEntrar }) {
    this.aoCriar = aoCriar;
    this.aoEntrar = aoEntrar;
    this.ultimaLista = [];

    this.el = $('tela-salas');
    this.elLista = $('salas-lista');
    this.elVazio = $('salas-vazio');
    this.elErro = $('salas-erro');
    this.elPersonagem = $('salas-personagem');

    $('btn-atualizar-salas').addEventListener('click', () => this.pedirLista?.());
    $('btn-criar-sala').addEventListener('click', () => this.criar());

    // Sliders com rótulo ao vivo.
    const liga = (idRange, idValor) => {
      const r = $(idRange);
      const v = $(idValor);
      r.addEventListener('input', () => (v.textContent = r.value));
    };
    liga('sala-objetivo', 'sala-objetivo-valor');
    liga('sala-max', 'sala-max-valor');

    // Enter no nome da sala cria direto.
    $('sala-nome').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.criar();
    });
  }

  // Callback para pedir a lista ao servidor (definido pelo main).
  definirAtualizar(fn) {
    this.pedirLista = fn;
  }

  abrir() {
    this.el.classList.remove('oculto');
    this.elPersonagem.textContent = 'Entre numa sala ou crie a sua — você escolhe o personagem em seguida.';
    this.limparErro();
    this.render();
    this.pedirLista?.();
  }

  fechar() {
    this.el.classList.add('oculto');
  }

  erro(texto) {
    this.elErro.textContent = texto;
    this.elErro.classList.remove('oculto');
  }

  limparErro() {
    this.elErro.classList.add('oculto');
  }

  salas(lista) {
    this.ultimaLista = Array.isArray(lista) ? lista : [];
    if (!this.el.classList.contains('oculto')) this.render();
  }

  render() {
    const lista = this.ultimaLista;
    this.elVazio.classList.toggle('oculto', lista.length > 0);
    this.elLista.innerHTML = lista
      .map((s) => {
        const cheia = s.jogadores + s.bots >= s.max;
        const modo = s.modo === 'times' ? 'TIMES' : 'FFA';
        const detalhes = [
          `meta ${s.objetivo}`,
          formatarTempo(s.tempoLimite),
          s.bots ? `${s.bots} bot${s.bots > 1 ? 's' : ''}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const senha = s.temSenha
          ? `<input class="sala-senha-entrar" data-id="${s.id}" type="password" maxlength="24" placeholder="senha" />`
          : '';
        return `
          <li data-id="${escapar(s.id)}">
            <div class="sala-info">
              <div class="sala-titulo">
                <strong>${escapar(s.nome)}</strong>
                <span class="modo-badge ${s.modo}">${modo}</span>
                ${s.temSenha ? '<span class="cadeado" title="Com senha">🔒</span>' : ''}
              </div>
              <small>${escapar(detalhes)} · <span class="codigo">${escapar(s.id)}</span></small>
            </div>
            <div class="sala-acao">
              <span class="sala-lotacao${cheia ? ' cheia' : ''}">${s.jogadores + s.bots}/${s.max}</span>
              ${senha}
              <button class="botao entrar" data-id="${escapar(s.id)}" ${cheia ? 'disabled' : ''}>Entrar</button>
            </div>
          </li>`;
      })
      .join('');

    for (const btn of this.elLista.querySelectorAll('button.entrar')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const campo = this.elLista.querySelector(`.sala-senha-entrar[data-id="${id}"]`);
        this.limparErro();
        this.aoEntrar({ salaId: id, senha: campo?.value ?? '' });
      });
    }
  }

  criar() {
    const modo = $('sala-modo').value === 'times' ? 'times' : 'ffa';
    const config = {
      nome: $('sala-nome').value.trim().slice(0, 24),
      modo,
      objetivo: Number($('sala-objetivo').value),
      maxJogadores: Number($('sala-max').value),
      tempoLimite: Number($('sala-tempo').value),
      permitirBots: $('sala-bots').checked,
    };
    const senha = $('sala-senha').value;
    this.limparErro();
    this.aoCriar({ config, senha });
  }
}

export { SALA };
