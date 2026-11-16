// =====================================================================
//  PROJECT COMBAT — cliente
//  Liga as partes: rede, menu, arena, entidades, controle e HUD.
// =====================================================================
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PERSONAGENS } from '../shared/personagens.js';
import { REGRAS, SALA } from '../shared/regras.js';
import { CAMERA } from './config.js';
import { carregarMapa } from './mapa.js';
import { Rede } from './rede.js';
import { Entidades } from './entidades.js';
import { Controle } from './controle.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Lobby } from './lobby.js';
import { iniciarEfeitos, atualizarEfeitos, limparEfeitos, criarProjetil, fimProjetil, execucao } from './efeitos.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const rotulos = new CSS2DRenderer();
rotulos.setSize(window.innerWidth, window.innerHeight);
rotulos.domElement.id = 'rotulos';
document.body.insertBefore(rotulos.domElement, renderer.domElement.nextSibling);

const cena = new THREE.Scene();
cena.background = new THREE.Color(0x9fc4e8);
cena.fog = new THREE.Fog(0x9fc4e8, 35, 75);
cena.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b3a, 1.5));
const sol = new THREE.DirectionalLight(0xffffff, 2.6);
sol.position.set(10, 20, 8);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
const s = REGRAS.raioArena + 4;
Object.assign(sol.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: 60 });
sol.shadow.bias = -0.0005;
cena.add(sol);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, CAMERA.altura, CAMERA.distancia);

// Seta no chão apontando para o mouse.
const seta = new THREE.Mesh(
  new THREE.ConeGeometry(0.16, 0.4, 3),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
);
seta.geometry.rotateX(Math.PI / 2); // ponta para +z
const mira = new THREE.Group();
seta.position.z = 1.0;
mira.add(seta);
mira.visible = false;
cena.add(mira);

iniciarEfeitos(cena);
const carregandoMapa = carregarMapa(cena);

// ---------------------------------------------------------------------
// Pós-processamento: contorno vermelho no inimigo sob o cursor.
// ---------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(cena, camera));
const contorno = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), cena, camera);
contorno.edgeStrength = 6;
contorno.edgeGlow = 0.4;
contorno.edgeThickness = 1.5;
contorno.pulsePeriod = 1.6;
contorno.visibleEdgeColor.set('#ff2a2a');
contorno.hiddenEdgeColor.set('#7a0d0d');
composer.addPass(contorno);
composer.addPass(new OutputPass());

const raycasterHover = new THREE.Raycaster();

// ---------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------
const rede = new Rede();
const entidades = new Entidades(cena);
const controle = new Controle(rede, camera, renderer.domElement);
const hud = new Hud();
const nomes = new Map(); // id → nome (para avisos e tela de derrota)
let meuId = null;
let tela = 'menu'; // 'menu' | 'salas' | 'jogo'
let escolha = null; // { nome, personagem }
let salaConfig = null; // { modo, objetivo, maxJogadores, tempoLimite, permitirBots }
let salaAtual = null; // { id, senha } da sala em que estou
let minhaEquipe = 0; // 0 (ffa) | 1 | 2 (times)
let pausado = false;
let zoom = 1;
let tremor = 0;

const menu = new Menu({ aoEscolher: aoEscolherPersonagem, aoVoltar: sairParaLista });
const lobby = new Lobby({ aoCriar: criarSala, aoEntrar: entrarSala });
lobby.definirAtualizar(() => rede.enviar({ t: 'listarSalas' }));

let reentrando = false; // reconexão: voltar à sala sem reescolher personagem
let autoEscolha = null; // atalho de teste: entrar direto com um personagem
let senhaPendente = ''; // senha usada ao entrar (para reconectar)

// Fluxo: lista de salas → (criar/entrar) → escolher personagem → arena.
function abrirLobby() {
  tela = 'salas';
  menu.fechar();
  hud.mostrar(false);
  mira.visible = false;
  contorno.selectedObjects = [];
  rotulos.domElement.style.display = 'none';
  $('resultado').classList.add('oculto');
  limparEfeitos();
  entidades.limpar();
  salaAtual = null;
  salaConfig = null;
  definirPausa(false);
  lobby.abrir();
}

function criarSala({ config, senha }) {
  Audio.iniciar();
  senhaPendente = senha ?? '';
  rede.enviar({ t: 'criarSala', config, senha });
}

function entrarSala({ salaId, senha }) {
  Audio.iniciar();
  senhaPendente = senha ?? '';
  rede.enviar({ t: 'entrarSala', salaId, senha });
}

// Entrou na sala (ainda sem personagem): abre a seleção de personagem.
function escolherPersonagem() {
  tela = 'selecao';
  lobby.fechar();
  menu.abrir();
}

// Escolheu o personagem → pede para nascer na sala.
function aoEscolherPersonagem(e) {
  Audio.iniciar();
  escolha = e;
  rede.enviar({ t: 'entrar', nome: e.nome, personagem: e.personagem });
}

// Servidor confirmou o nascimento → entra na arena, já posicionado.
function entrarArena(m) {
  minhaEquipe = m.suaEquipe ?? 0;
  tela = 'jogo';
  menu.fechar();
  lobby.fechar();
  $('resultado').classList.add('oculto');
  const def = PERSONAGENS[escolha.personagem];
  controle.iniciar(def);
  controle.posicionar(m.x, m.z, m.r); // posição inicial → câmera volta ao top-down
  hud.montar(def);
  hud.configurarPartida(salaConfig, minhaEquipe);
  hud.mostrar(true);
  entidades.minhaEquipe = minhaEquipe;
  entidades.modo = salaConfig.modo;
  const semBots = !salaConfig.permitirBots;
  $('btn-bot').classList.toggle('oculto', semBots);
  $('btn-sem-bots').classList.toggle('oculto', semBots);
  rotulos.domElement.style.display = '';
  definirPausa(false);
}

// Voltar da seleção de personagem para a lista de salas.
function sairParaLista() {
  rede.enviar({ t: 'sair' });
  abrirLobby();
}

function sairDaArena() {
  rede.enviar({ t: 'sair' });
  controle.parar();
  abrirLobby();
}

function definirPausa(valor) {
  pausado = valor;
  $('pausa').classList.toggle('oculto', !valor);
  controle.definirAtivo(tela === 'jogo' && !valor);
}

function escaparTexto(t) {
  return String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function corEquipe(eq) {
  return SALA.equipes[eq]?.cor ?? '#888';
}

function tituloVencedor(m) {
  const v = m.vencedor ?? {};
  if (v.tipo === 'empate') return '🤝 Empate!';
  if (v.tipo === 'time') {
    const info = SALA.equipes[v.equipe];
    const meu = v.equipe === minhaEquipe ? ' — Você venceu!' : '';
    return `🏆 <span style="color:${info?.cor ?? '#fff'}">${info?.nome ?? 'Time'}</span> venceu!${meu}`;
  }
  const meu = v.id === meuId ? 'Você venceu!' : `${escaparTexto(v.nome ?? '?')} venceu!`;
  return `🏆 ${meu}`;
}

// Fim de partida: mostra o pódio e a contagem até recomeçar.
let contagemResultado = null;
function mostrarResultado(m) {
  if (tela !== 'jogo') return;
  controle.definirAtivo(false);
  Audio.tocar('lider');
  $('resultado-titulo').innerHTML = tituloVencedor(m);
  $('resultado-podio').innerHTML = (m.placar ?? [])
    .slice(0, 8)
    .map((j, i) => {
      const def = PERSONAGENS[j.p];
      const cor = m.modo === 'times' ? corEquipe(j.eq) : def?.cor ?? '#888';
      const voce = j.id === meuId ? ' class="voce"' : '';
      const marca = j.b ? ' 🤖' : '';
      return `<li${voce}><span class="pos">${i + 1}</span><i style="background:${cor}"></i><span class="nome">${escaparTexto(j.n)}${marca}</span><b>${j.k}</b><em>${j.d}</em></li>`;
    })
    .join('');
  $('resultado').classList.remove('oculto');

  let resta = Math.ceil(m.proximaEm ?? SALA.duracaoResultado);
  const elContagem = $('resultado-contagem');
  elContagem.textContent = `Nova partida em ${resta} s`;
  clearInterval(contagemResultado);
  contagemResultado = setInterval(() => {
    resta--;
    elContagem.textContent = resta > 0 ? `Nova partida em ${resta} s` : 'Começando…';
    if (resta <= 0) clearInterval(contagemResultado);
  }, 1000);
}

// ---------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------
rede.em('conectado', () => {
  menu.conexao(true);
  $('reconectando').classList.add('oculto');
});

rede.em('desconectado', () => {
  menu.conexao(false);
  entidades.limpar();
  limparEfeitos();
  if (tela === 'jogo') $('reconectando').classList.remove('oculto');
});

rede.em('ola', (m) => {
  meuId = m.id;
  entidades.limpar();
  entidades.meuId = m.id;
  menu.enderecos(m.enderecos);
  lobby.salas(m.salas);
  // Reconectou no meio da partida: tenta voltar para a mesma sala.
  if (tela === 'jogo' && salaAtual && escolha) {
    reentrando = true;
    rede.enviar({ t: 'entrarSala', salaId: salaAtual.id, senha: salaAtual.senha });
  }
});

rede.em('salas', (m) => lobby.salas(m.lista));

// Entrou na sala (sem personagem ainda).
rede.em('salaEntrou', (m) => {
  salaConfig = m.config;
  salaAtual = { id: m.salaId, senha: senhaPendente };
  if (reentrando || autoEscolha) {
    // Reconexão ou atalho de teste: já nasce com o personagem conhecido.
    const e = autoEscolha ?? escolha;
    reentrando = false;
    autoEscolha = null;
    escolha = e;
    rede.enviar({ t: 'entrar', nome: e.nome, personagem: e.personagem });
  } else {
    escolherPersonagem();
  }
});

// Nasceu na arena (já com posição inicial).
rede.em('nascido', (m) => entrarArena(m));

rede.em('erroSala', (m) => {
  reentrando = false;
  if (tela === 'jogo' || tela === 'selecao') {
    // Reconexão falhou ou a sala sumiu: volta para a lista de salas.
    controle.parar();
    abrirLobby();
  }
  lobby.erro(m.motivo ?? 'Não foi possível entrar na sala.');
});

rede.em('fimPartida', mostrarResultado);
rede.em('novaPartida', () => {
  $('resultado').classList.add('oculto');
  if (tela === 'jogo') controle.definirAtivo(!pausado);
});

rede.em('snap', (snap) => {
  entidades.aplicarSnapshot(snap);
  for (const j of snap.j) nomes.set(j.id, j.n);
  const meu = snap.j.find((j) => j.id === meuId);
  if (meu && tela === 'jogo') controle.sincronizar(meu);
  hud.placar(snap.j, meuId);
  if (tela === 'jogo') hud.partida(snap, meuId, minhaEquipe);
});

rede.em('acao', (m) => {
  if (m.id !== meuId) entidades.get(m.id)?.acao(m.acao, m.r);
});

// Volume de um evento conforme a distância até o seu personagem.
function volumePorPos(pos) {
  const eu = controle.estado;
  if (!eu || !pos) return 0.6;
  const d = Math.hypot(pos.x - eu.x, pos.z - eu.z);
  return Math.max(0.12, Math.min(0.7, 1 - d / 30));
}

rede.em('dano', (m) => {
  const alvo = entidades.get(m.alvo);
  const atacante = entidades.get(m.de);
  alvo?.atingido(m.valor, m.absorvido, atacante?.raiz.position);
  const meu = m.alvo === meuId || m.de === meuId;
  if (m.valor > 0) Audio.tocar('dano', meu ? 1 : volumePorPos(alvo?.raiz.position));
  if (m.alvo === meuId) tremor = Math.min(1, tremor + 0.5 + m.valor / 40);
});

rede.em('cura', (m) => {
  entidades.get(m.alvo)?.curado(m.valor);
  if (m.alvo === meuId) Audio.tocar('cura');
});

rede.em('morte', (m) => {
  const alvo = nomes.get(m.alvo) ?? '?';
  const autor = nomes.get(m.de) ?? '?';
  const meu = m.alvo === meuId || m.de === meuId;
  hud.aviso(m.alvo === m.de ? `${alvo} se derrotou` : `${autor} derrotou ${alvo}`, meu ? 'destaque' : '');
  Audio.tocar('morte', meu ? 1 : volumePorPos(entidades.get(m.alvo)?.raiz.position));
  if (m.alvo === meuId) controle.morrer(m.de);
});

rede.em('renascer', (m) => {
  entidades.get(m.id)?.teleportar(m.x, m.z, m.r);
  if (m.id === meuId && tela === 'jogo') controle.posicionar(m.x, m.z, m.r);
});

rede.em('impulso', (m) => controle.impulso(m.x, m.z));
rede.em('execucao', (m) => {
  const alvo = entidades.get(m.alvo);
  if (alvo) execucao(alvo.raiz.position.x, alvo.raiz.position.z);
  Audio.tocar('execucao', m.alvo === meuId || m.de === meuId ? 1 : volumePorPos(alvo?.raiz.position));
  if (m.alvo === meuId) tremor = 1;
});
rede.em('projetil', (m) => {
  criarProjetil(m);
  Audio.tocar('projetil', m.dono === meuId ? 0.8 : volumePorPos({ x: m.x, z: m.z }));
});
rede.em('projetilFim', fimProjetil);
rede.em('aviso', (m) => tela === 'jogo' && hud.aviso(m.texto));

controle.aoAgir = (slot, rot) => {
  entidades.get(meuId)?.acao(slot, rot);
  if (slot === 'esquiva') Audio.tocar('esquiva');
  else if (slot === 'ult') Audio.tocar('ultimate');
  else Audio.tocar('golpe'); // ataque, hab1, hab2
};
hud.aoNovoLider = () => Audio.tocar('lider');

// Execução (ult do Ceifador): inimigo executável mais perto do cursor.
controle.buscarAlvo = (hab) => {
  const eu = controle.estado;
  const ponto = controle.pontoNoChao();
  if (!eu || !ponto) return null;
  let melhor = null;
  let menor = 1.8; // metros de tolerância em volta do cursor
  for (const ent of entidades.mapa.values()) {
    if (ent.id === meuId || ent.dados.mo || ent.dados.v / ent.def.vida > hab.limiteVida) continue;
    if (entidades.ehAliado(ent.dados)) continue; // não executa companheiros de time
    const p = ent.raiz.position;
    if (Math.hypot(p.x - eu.x, p.z - eu.z) > hab.alcance) continue;
    const d = Math.hypot(p.x - ponto.x, p.z - ponto.z);
    if (d < menor) {
      menor = d;
      melhor = { id: ent.id, x: p.x, z: p.z };
    }
  }
  return melhor;
};

// ---------------------------------------------------------------------
// Pausa, zoom, janela
// ---------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (tela === 'jogo' && e.key === 'Escape') definirPausa(!pausado);
});
$('btn-continuar').addEventListener('click', () => definirPausa(false));
$('btn-trocar').addEventListener('click', sairDaArena);
$('btn-bot').addEventListener('click', () => rede.enviar({ t: 'bot', cmd: 'adicionar' }));
$('btn-sem-bots').addEventListener('click', () => rede.enviar({ t: 'bot', cmd: 'remover' }));

// Botões de áudio (pausa): ligam/desligam som e música, com rótulo refletindo o estado.
const btnSom = $('btn-som');
const btnMusica = $('btn-musica');
function atualizarBotoesAudio() {
  btnSom.textContent = Audio.somLigado ? '🔊 Som' : '🔇 Som';
  btnSom.setAttribute('aria-pressed', String(Audio.somLigado));
  btnSom.classList.toggle('desligado', !Audio.somLigado);
  btnMusica.textContent = Audio.musicaLigada ? '🎵 Música' : '🎵 Música (off)';
  btnMusica.setAttribute('aria-pressed', String(Audio.musicaLigada));
  btnMusica.classList.toggle('desligado', !Audio.musicaLigada);
}
btnSom.addEventListener('click', () => {
  Audio.iniciar();
  Audio.definirSom(!Audio.somLigado);
  if (Audio.somLigado) Audio.tocar('ui');
  atualizarBotoesAudio();
});
btnMusica.addEventListener('click', () => {
  Audio.iniciar();
  Audio.definirMusica(!Audio.musicaLigada);
  atualizarBotoesAudio();
});
atualizarBotoesAudio();

renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    if (tela !== 'jogo') return;
    zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), CAMERA.zoomMin, CAMERA.zoomMax);
  },
  { passive: true },
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  contorno.setSize(window.innerWidth, window.innerHeight);
  rotulos.setSize(window.innerWidth, window.innerHeight);
  menu.vitrine.redimensionar();
});

// ---------------------------------------------------------------------
// Laço
// ---------------------------------------------------------------------
const relogio = new THREE.Clock();
const alvoCamera = new THREE.Vector3();
const posCamera = new THREE.Vector3();

function seguirCamera(dt) {
  const e = controle.estado;
  if (!e) return;
  alvoCamera.set(e.x, 0.8, e.z);
  posCamera.set(e.x, CAMERA.altura * zoom, e.z + CAMERA.distancia * zoom);
  camera.position.lerp(posCamera, Math.min(1, dt * 8));
  if (tremor > 0) {
    tremor = Math.max(0, tremor - dt * 3);
    camera.position.x += (Math.random() - 0.5) * tremor * 0.3;
    camera.position.y += (Math.random() - 0.5) * tremor * 0.3;
  }
  camera.lookAt(alvoCamera);
}

// Acende o contorno vermelho no inimigo vivo sob o cursor (ou apaga).
// Devolve true se há um inimigo sob o cursor.
const alvosHover = [];
function atualizarContorno() {
  alvosHover.length = 0;
  for (const e of entidades.mapa.values()) {
    if (e.id === meuId || e.dados.mo || !e.visual?.raiz?.visible) continue;
    if (entidades.ehAliado(e.dados)) continue; // não contorna companheiros de time
    alvosHover.push(e.visual.raiz);
  }
  if (!alvosHover.length) {
    contorno.selectedObjects = [];
    return false;
  }
  raycasterHover.setFromCamera(controle.mouse, camera);
  const hits = raycasterHover.intersectObjects(alvosHover, true);
  let no = hits[0]?.object ?? null;
  while (no && !no.userData.entidade) no = no.parent;
  const ent = no?.userData.entidade;
  contorno.selectedObjects = ent ? [ent.visual.raiz] : [];
  return Boolean(ent);
}

function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.1);

  if (tela === 'jogo') {
    const outros = [];
    for (const e of entidades.mapa.values()) {
      if (e.id !== meuId && !e.dados.mo) outros.push({ x: e.raiz.position.x, z: e.raiz.position.z, raio: e.def.raio });
    }
    controle.atualizar(dt, outros);
    entidades.atualizar(dt, controle.estado);
    atualizarEfeitos(dt);
    seguirCamera(dt);

    const e = controle.estado;
    mira.visible = Boolean(e && !controle.morto && !pausado);
    if (mira.visible) {
      mira.position.set(e.x, 0.06, e.z);
      mira.rotation.y = controle.anguloMira();
    }
    const meu = entidades.get(meuId);
    const ultDef = controle.def?.ult;
    entidades.limiteExecucao = ultDef?.tipo === 'execucao' && controle.ult >= 100 ? ultDef.limiteVida : 0;
    const sobreInimigo = atualizarContorno();
    renderer.domElement.style.cursor = controle.mirandoUlt ? 'crosshair' : sobreInimigo ? 'pointer' : '';
    hud.atualizar(controle, meu?.dados, rede.ping, nomes);
    composer.render();
    rotulos.render(cena, camera);
  } else {
    menu.vitrine.atualizar(dt);
    renderer.render(menu.vitrine.cena, menu.vitrine.camera);
  }
}

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
rotulos.domElement.style.display = 'none';
abrirLobby();
await carregandoMapa;
$('carregando').classList.add('oculto');
renderer.setAnimationLoop(quadro);

// Atalho para testes: ?personagem=espada&nome=Ana entra direto na arena.
// Sem ele, todo mundo começa na escolha de personagem.
// Com ?sala=CODE entra na sala existente (útil para abrir em várias abas);
// sem ela, cria uma sala de teste e entra direto.
const params = new URLSearchParams(location.search);
const auto = PERSONAGENS[params.get('personagem')]
  ? { nome: params.get('nome') ?? '', personagem: params.get('personagem') }
  : null;
if (auto) {
  const tentar = () => {
    if (!(rede.conectado && meuId)) return void setTimeout(tentar, 100);
    autoEscolha = auto; // ao receber 'salaEntrou', nasce direto com este personagem
    const cod = params.get('sala');
    if (cod) entrarSala({ salaId: cod.toUpperCase(), senha: params.get('senha') ?? '' });
    else
      criarSala({
        config: {
          nome: auto.nome || 'Teste',
          modo: params.get('modo') === 'times' ? 'times' : 'ffa',
          objetivo: 10,
          maxJogadores: 8,
          tempoLimite: 0,
          permitirBots: true,
        },
        senha: '',
      });
  };
  tentar();
}

