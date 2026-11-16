// =====================================================================
//  PERSONAGENS
//  Cada personagem tem vida, velocidade, um ataque básico e duas
//  habilidades. Os números aqui são lidos pelo servidor (que decide o
//  dano) e pelo cliente (menu, interface, movimento), então basta mudar
//  aqui. Depois de editar, o `npm run dev` reinicia o servidor sozinho.
//
//  Campos do personagem
//    nome, descricao, cor (cor do placeholder e da interface)
//    arma: 'espada' | 'foice' | 'machado' | 'martelo' (malha do placeholder)
//    vida, velocidade (m/s), raio (m, tamanho do corpo para colisão)
//    regeneracao (vida por segundo; sem o campo usa REGRAS.regeneracao)
//    rouboVida (0–1): fração do dano causado que vira cura, sempre ativa
//    altura (m): o modelo 3D é redimensionado para essa altura
//    modelo: null usa o boneco placeholder. Para um modelo 3D próprio:
//      modelo: {
//        arquivo: '/models/personagens/espadachim.glb',
//        rotacaoY: 0, // graus, até ele olhar para a frente ao andar
//        animacoes: {  // nome do clip do .glb para cada situação
//          parado: 'Idle', andar: 'Run', ataque: 'Slash', hab1: 'Dash',
//          hab2: 'Block', esquiva: 'Roll', dano: 'Hit', morrer: 'Death',
//        },
//      }
//
//  Tipos de habilidade (campo `tipo`)
//    golpe     – acerta quem estiver no leque à frente.
//                dano, alcance (m), arco (graus; 360 = em volta),
//                preparo (s até o golpe sair), duracao (s travado)
//    investida – avança `distancia` m em `duracao` s ferindo quem tocar.
//    projetil  – lança algo em linha reta: dano, velocidade (m/s),
//                alcance (m), raio (m, tamanho do projétil).
//    buff      – aplica `efeito` em si mesmo por efeito.duracao s:
//                reducaoDano (0–1), rouboVida (0–1), multDano,
//                multVelocidade, escudo (pontos absorvidos),
//                escudoMax (teto do escudo), imune (ignora atordoar,
//                lentidão, empurrão e puxão), cor.
//  Só na ultimate (`ult`, tecla F; não tem recarga, usa a carga):
//    execucao  – mata na hora um inimigo com vida ≤ limiteVida (fração)
//                a até `alcance` m. O jogador mira com o mouse.
//    marca     – marca um inimigo (sorteio que favorece quem tem mais
//                abates e vida) por marca.duracao s; todos causam
//                marca.multDanoRecebido × dano nele. Se ele morrer, o
//                abate é de quem marcou, que recupera toda a vida.
//    usavelAtordoado: true deixa usar a ult mesmo atordoado.
//  Opcionais em golpe/investida/projetil:
//    empurrao (m; negativo puxa para perto do atacante),
//    atordoar (s sem andar nem atacar),
//    lentidao: { duracao, mult },
//    curaSeAcertar (fração da vida máxima curada se acertar alguém;
//                   cura uma vez só, não importa quantos acertou).
//  Golpe com forma: 'retangulo' acerta uma faixa de `comprimento` ×
//    `largura` m à frente, em vez do leque (alcance/arco).
//  Todos têm `recarga` (s) e `animacao` (placeholder):
//    'corte' | 'pancada' | 'giro' | 'estocada' | 'investida' |
//    'arremesso' | 'buff' | 'giro'
// =====================================================================

export const PERSONAGENS = {
  espada: {
    nome: 'Espadachim',
    arma: 'espada',
    cor: '#4f86f7',
    descricao: 'Equilibrado e ágil. Entra e sai da luta com a investida.',
    vida: 100,
    velocidade: 4.6,
    raio: 0.4,
    altura: 1.8,
    regeneracao: 1.5,
    modelo: {
      arquivo: '/models/personagens/Male_Peasant.gltf', rotacaoY: 0,
      cabeca: '/models/personagens/Superhero_Male_FullBody.gltf',
      cabelos: ['/models/personagens/Hair_SimpleParted.gltf', '/models/personagens/Eyebrows_Regular.gltf'],
      corCabelo: '#3b2a1a',
    },
    ataque: {
      nome: 'Corte',
      tipo: 'golpe',
      animacao: 'corte',
      descricao: 'Corte rápido em arco à frente.',
      dano: 12,
      alcance: 2.0,
      arco: 110,
      preparo: 0.12,
      duracao: 0.35,
      recarga: 0.4,
      empurrao: 0.3,
    },
    hab1: {
      nome: 'Investida',
      tipo: 'investida',
      animacao: 'investida',
      descricao: 'Avança 6 m ferindo e empurrando quem estiver no caminho.',
      dano: 18,
      distancia: 6,
      duracao: 0.25,
      recarga: 5,
      empurrao: 1.5,
    },
    hab2: {
      nome: 'Postura Defensiva',
      tipo: 'buff',
      animacao: 'buff',
      descricao: 'Reduz 70% do dano recebido por 2,5 s, mas anda mais devagar.',
      duracao: 0.3,
      recarga: 9,
      efeito: { duracao: 2.5, reducaoDano: 0.7, multVelocidade: 0.6, cor: '#7fb2ff' },
    },
    ult: {
      nome: 'Sentença',
      tipo: 'marca',
      animacao: 'buff',
      descricao:
        'Marca um inimigo (de preferência o mais forte) por 7 s: todos causam +75% de dano nele. Se ele morrer, o abate é seu e você recupera toda a vida.',
      duracao: 0.4,
      marca: { duracao: 7, multDanoRecebido: 1.75 },
    },
  },

  foice: {
    nome: 'Ceifador',
    arma: 'foice',
    cor: '#9b59d6',
    descricao: 'Alcance longo e golpes largos. Não regenera: se cura com o dano que causa.',
    vida: 90,
    velocidade: 4.8,
    raio: 0.4,
    altura: 1.85,
    regeneracao: 0,
    rouboVida: 0.5,
    modelo: {
      arquivo: '/models/personagens/Female_Ranger.gltf', rotacaoY: 0,
      cabeca: '/models/personagens/Superhero_Female_FullBody.gltf',
      capuz: '/models/personagens/Female_Ranger_Head_Hood.gltf',
      cabelos: ['/models/personagens/Eyebrows_Female.gltf'],
      corCabelo: '#1a1015',
    },
    ataque: {
      nome: 'Ceifada',
      tipo: 'golpe',
      animacao: 'corte',
      descricao: 'Golpe largo, de quase meia-volta, com bom alcance.',
      dano: 11,
      alcance: 2.6,
      arco: 160,
      preparo: 0.18,
      duracao: 0.45,
      recarga: 0.55,
      empurrao: 0.3,
    },
    hab1: {
      nome: 'Tufão',
      tipo: 'golpe',
      animacao: 'giro',
      descricao: 'Rodopia com a foice: o dobro do dano do ataque em todos à volta. Cura 10% da vida se pegar alguém.',
      dano: 22, // 2× o ataque
      alcance: 2.6,
      arco: 360,
      preparo: 0.2,
      duracao: 0.55,
      recarga: 7,
      empurrao: 0.4,
      curaSeAcertar: 0.1,
    },
    hab2: {
      nome: 'Colheita',
      tipo: 'golpe',
      forma: 'retangulo',
      animacao: 'estocada',
      descricao: 'Golpe em linha reta de 6 m à frente. Fere todos na faixa e cura 25% da vida se acertar alguém.',
      dano: 16,
      comprimento: 6,
      largura: 1.4,
      preparo: 0.25,
      duracao: 0.45,
      recarga: 10,
      curaSeAcertar: 0.25,
    },
    ult: {
      nome: 'Execução',
      tipo: 'execucao',
      animacao: 'corte',
      descricao:
        'Aperte F e clique num inimigo com 25% de vida ou menos (marcado com ☠) a até 10 m: ele morre na hora.',
      duracao: 0.45,
      alcance: 10,
      limiteVida: 0.25,
    },
  },

  machado: {
    nome: 'Bárbaro',
    arma: 'machado',
    cor: '#e0662a',
    descricao: 'Golpes pesados e um machado de arremesso. Fica perigoso na fúria.',
    vida: 125,
    velocidade: 4.2,
    raio: 0.45,
    altura: 1.9,
    regeneracao: 1.5,
    modelo: {
      arquivo: '/models/personagens/Male_Peasant.gltf', rotacaoY: 0,
      cabeca: '/models/personagens/Superhero_Male_FullBody.gltf',
      cabelos: ['/models/personagens/Hair_Buzzed.gltf', '/models/personagens/Hair_Beard.gltf', '/models/personagens/Eyebrows_Regular.gltf'],
      corCabelo: '#8b2500',
    },
    ataque: {
      nome: 'Machadada',
      tipo: 'golpe',
      animacao: 'pancada',
      descricao: 'Golpe pesado de cima para baixo.',
      dano: 19,
      alcance: 1.9,
      arco: 90,
      preparo: 0.25,
      duracao: 0.55,
      recarga: 0.75,
      empurrao: 0.6,
    },
    hab1: {
      nome: 'Arremesso',
      tipo: 'projetil',
      animacao: 'arremesso',
      descricao: 'Arremessa um machado em linha reta até 14 m.',
      dano: 22,
      velocidade: 16,
      alcance: 14,
      raio: 0.5,
      preparo: 0.2,
      duracao: 0.45,
      recarga: 6,
      empurrao: 1,
    },
    hab2: {
      nome: 'Fúria',
      tipo: 'buff',
      animacao: 'buff',
      descricao: '+50% de dano e +20% de velocidade por 5 s.',
      duracao: 0.3,
      recarga: 14,
      efeito: { duracao: 5, multDano: 1.5, multVelocidade: 1.2, cor: '#ff4d2e' },
    },
    ult: {
      nome: 'Imparável',
      tipo: 'buff',
      animacao: 'buff',
      descricao:
        'Por 6 s: +40% de velocidade e imune a atordoamento, lentidão, empurrões e puxões. Funciona até se estiver atordoado.',
      duracao: 0.3,
      usavelAtordoado: true,
      efeito: { duracao: 6, multVelocidade: 1.4, imune: true, cor: '#ff8a2e' },
    },
  },

  martelo: {
    nome: 'Guardião',
    arma: 'martelo',
    cor: '#d9a520',
    descricao: 'Lento e resistente. Atordoa grupos e aguenta muito dano.',
    vida: 150,
    velocidade: 3.8,
    raio: 0.5,
    altura: 1.95,
    regeneracao: 2,
    modelo: {
      arquivo: '/models/personagens/Female_Peasant.gltf', rotacaoY: 0,
      cabeca: '/models/personagens/Superhero_Female_FullBody.gltf',
      cabelos: ['/models/personagens/Hair_Buns.gltf', '/models/personagens/Eyebrows_Female.gltf'],
      corCabelo: '#2a1a0e',
    },
    ataque: {
      nome: 'Marretada',
      tipo: 'golpe',
      animacao: 'pancada',
      descricao: 'Golpe lento que arremessa o inimigo para trás.',
      dano: 23,
      alcance: 2.0,
      arco: 80,
      preparo: 0.35,
      duracao: 0.7,
      recarga: 1.0,
      empurrao: 1.6,
    },
    hab1: {
      nome: 'Terremoto',
      tipo: 'golpe',
      animacao: 'pancada',
      descricao: 'Golpeia o chão: fere e atordoa por 1 s todos a até 3,5 m.',
      dano: 16,
      alcance: 3.5,
      arco: 360,
      preparo: 0.45,
      duracao: 0.8,
      recarga: 8,
      empurrao: 1.2,
      atordoar: 1.0,
    },
    hab2: {
      nome: 'Pele de Pedra',
      tipo: 'buff',
      animacao: 'buff',
      descricao: 'Escudo que absorve até 40 de dano por 6 s.',
      duracao: 0.3,
      recarga: 12,
      efeito: { duracao: 6, escudo: 40, escudoMax: 40, cor: '#e8d27a' },
    },
    ult: {
      nome: 'Juízo Final',
      tipo: 'golpe',
      forma: 'retangulo',
      animacao: 'pancada',
      descricao: 'Esmaga uma faixa de 8 × 3 m à frente: 12 de dano e atordoa todos atingidos por 2 s.',
      dano: 12,
      comprimento: 8,
      largura: 3,
      preparo: 0.5,
      duracao: 0.9,
      atordoar: 2,
    },
  },
};

// Ordem dos slots na interface e no teclado.
export const SLOTS = ['ataque', 'hab1', 'hab2', 'esquiva', 'ult'];
