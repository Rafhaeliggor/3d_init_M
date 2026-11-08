// =====================================================================
//  PROJECT COMBAT — cliente
//  Liga as partes: rede, menu, arena, entidades, controle e HUD.
// =====================================================================
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { PERSONAGENS } from '../shared/personagens.js';
import { REGRAS } from '../shared/regras.js';
import { CAMERA } from './config.js';
import { carregarMapa } from './mapa.js';
import { Rede } from './rede.js';
import { Entidades } from './entidades.js';
import { Controle } from './controle.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { iniciarEfeitos, atualizarEfeitos, limparEfeitos, criarProjetil, fimProjetil, execucao } from './efeitos.js';

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
// Estado
// ---------------------------------------------------------------------
const rede = new Rede();
const entidades = new Entidades(cena);
const controle = new Controle(rede, camera, renderer.domElement);
const hud = new Hud();
const nomes = new Map(); // id → nome (para avisos e tela de derrota)
let meuId = null;
let tela = 'menu'; // 'menu' | 'jogo'
let escolha = null; // { nome, personagem }
let pausado = false;
let zoom = 1;
let tremor = 0;

const menu = new Menu({ aoEscolher: entrar });

function entrar(e) {
  escolha = e;
  tela = 'jogo';
  menu.fechar();
  const def = PERSONAGENS[e.personagem];
  controle.iniciar(def);
  hud.montar(def);
  hud.mostrar(true);
  rotulos.domElement.style.display = '';
  definirPausa(false);
  rede.enviar({ t: 'entrar', nome: e.nome, personagem: e.personagem });
}

function sairDaArena() {
  rede.enviar({ t: 'sair' });
  tela = 'menu';
  controle.parar();
  hud.mostrar(false);
  definirPausa(false);
  mira.visible = false;
  rotulos.domElement.style.display = 'none';
  limparEfeitos();
  menu.abrir();
}

function definirPausa(valor) {
  pausado = valor;
  $('pausa').classList.toggle('oculto', !valor);
  controle.definirAtivo(tela === 'jogo' && !valor);
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
  // Reconectou no meio da partida: entra de novo com o mesmo personagem.
  if (tela === 'jogo' && escolha) entrar(escolha);
});

rede.em('snap', (snap) => {
  entidades.aplicarSnapshot(snap);
  for (const j of snap.j) nomes.set(j.id, j.n);
  menu.online(snap.j);
  const meu = snap.j.find((j) => j.id === meuId);
  if (meu && tela === 'jogo') controle.sincronizar(meu);
  hud.placar(snap.j, meuId);
});

rede.em('acao', (m) => {
  if (m.id !== meuId) entidades.get(m.id)?.acao(m.acao, m.r);
});

rede.em('dano', (m) => {
  entidades.get(m.alvo)?.atingido(m.valor, m.absorvido);
  if (m.alvo === meuId) tremor = Math.min(1, tremor + 0.5 + m.valor / 40);
});

rede.em('cura', (m) => entidades.get(m.alvo)?.curado(m.valor));

rede.em('morte', (m) => {
  const alvo = nomes.get(m.alvo) ?? '?';
  const autor = nomes.get(m.de) ?? '?';
  const meu = m.alvo === meuId || m.de === meuId;
  hud.aviso(m.alvo === m.de ? `${alvo} se derrotou` : `${autor} derrotou ${alvo}`, meu ? 'destaque' : '');
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
  if (m.alvo === meuId) tremor = 1;
});
rede.em('projetil', criarProjetil);
rede.em('projetilFim', fimProjetil);
rede.em('aviso', (m) => tela === 'jogo' && hud.aviso(m.texto));

controle.aoAgir = (slot, rot) => entidades.get(meuId)?.acao(slot, rot);

// Execução (ult do Ceifador): inimigo executável mais perto do cursor.
controle.buscarAlvo = (hab) => {
  const eu = controle.estado;
  const ponto = controle.pontoNoChao();
  if (!eu || !ponto) return null;
  let melhor = null;
  let menor = 1.8; // metros de tolerância em volta do cursor
  for (const ent of entidades.mapa.values()) {
    if (ent.id === meuId || ent.dados.mo || ent.dados.v / ent.def.vida > hab.limiteVida) continue;
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
    renderer.domElement.style.cursor = controle.mirandoUlt ? 'crosshair' : '';
    hud.atualizar(controle, meu?.dados, rede.ping, nomes);
    renderer.render(cena, camera);
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
menu.abrir();
await carregandoMapa;
$('carregando').classList.add('oculto');
renderer.setAnimationLoop(quadro);

// Atalho para testes: ?personagem=espada&nome=Ana entra direto na arena.
// Sem ele, todo mundo começa na escolha de personagem.
const params = new URLSearchParams(location.search);
const auto = PERSONAGENS[params.get('personagem')]
  ? { nome: params.get('nome') ?? '', personagem: params.get('personagem') }
  : null;
if (auto) {
  const tentar = () => (rede.conectado && meuId ? entrar(auto) : setTimeout(tentar, 100));
  tentar();
}

