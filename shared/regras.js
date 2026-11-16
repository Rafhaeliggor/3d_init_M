// =====================================================================
//  REGRAS GERAIS DA PARTIDA
//  Usadas pelo servidor (quem decide dano, morte, recargas) e pelo
//  cliente (movimento, interface). Depois de editar, reinicie o
//  servidor (no `npm run dev` ele reinicia sozinho).
// =====================================================================

export const REGRAS = {
  raioArena: 15, // metros; ninguém sai deste círculo
  tempoRenascer: 4, // segundos caído antes de voltar
  invulneravelAoRenascer: 1.5, // segundos piscando, sem tomar dano
  taxaServidor: 20, // atualizações por segundo enviadas aos jogadores

  // Vida recuperada por segundo. Cada personagem pode ter o próprio valor
  // no campo `regeneracao` (o Ceifador tem 0: só se cura causando dano).
  regeneracao: 1.5,

  // Poção: a cada `abatesNecessarios` abates você ganha uma. Só dá para
  // carregar uma; enquanto ela não for usada os abates não acumulam.
  pocao: {
    abatesNecessarios: 3,
    cura: 0.25, // fração da vida máxima
  },

  // Ultimate (tecla F): enche até 100.
  ult: {
    passivaPorSegundo: 0.5, // enchendo sozinha (200 s do zero ao cheio)
    porDanoCausado: 0.4, // por ponto de dano que você causa
    porDanoRecebido: 0.3, // por ponto de dano que você recebe
  },

  // Habilidade que todo personagem tem (tecla Espaço).
  esquiva: {
    nome: 'Esquiva',
    tipo: 'esquiva',
    animacao: 'esquiva',
    descricao: 'Rolamento rápido. Fica invulnerável durante o movimento.',
    distancia: 4,
    duracao: 0.3,
    recarga: 1.5,
    invulneravel: 0.3,
  },
};

// Salas: configuração de uma partida. Os limites valem no servidor e na
// tela de criação de sala.
export const SALA = {
  modos: {
    ffa: { nome: 'Todos contra todos', times: false },
    times: { nome: 'Times (Azul × Vermelho)', times: true },
  },
  padrao: {
    modo: 'ffa',
    objetivo: 10, // abates para vencer
    maxJogadores: 8,
    tempoLimite: 0, // segundos (0 = sem limite)
    permitirBots: true,
  },
  objetivoMin: 3,
  objetivoMax: 50,
  jogadoresMin: 2,
  jogadoresMax: 12,
  temposLimite: [0, 180, 300, 600], // opções em segundos (0 = sem limite)
  duracaoResultado: 8, // segundos na tela de resultado antes de recomeçar
  equipes: { 1: { nome: 'Time Azul', cor: '#3f8bff' }, 2: { nome: 'Time Vermelho', cor: '#ff4d4d' } },
};

// Efeitos aplicados por golpes (atordoar / lentidao nas habilidades).
export const EFEITO_ATORDOADO = { nome: 'Atordoado', atordoado: true, cor: '#ffe14d' };
export const EFEITO_LENTO = { nome: 'Lento', cor: '#6ab0ff' };
export const EFEITO_MARCADO = { nome: 'Marcado', cor: '#ff3b3b' };

// O empurrão é configurado em metros; a velocidade inicial é
// metros × DECAIMENTO_EMPURRAO e diminui exponencialmente.
export const DECAIMENTO_EMPURRAO = 6;
