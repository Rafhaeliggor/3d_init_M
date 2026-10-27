import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MAPA, MODELOS, MEMBROS } from './config.js';

const RAIO_MAPA = 38;
const VELOCIDADE_PADRAO = { andar: 1.4, correr: 4 };
const COMBATE_PADRAO = { vida: 100, dano: 20, alcance: 1, recarga: 0.8 };
const DIRECOES = ['frente', 'tras', 'esquerda', 'direita'];

// ---------------------------------------------------------------------
// Renderizadores, cena, câmera e luzes
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const rotulosRenderer = new CSS2DRenderer();
rotulosRenderer.setSize(window.innerWidth, window.innerHeight);
rotulosRenderer.domElement.style.position = 'fixed';
rotulosRenderer.domElement.style.top = '0';
rotulosRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(rotulosRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
scene.fog = new THREE.Fog(0x9fc4e8, 30, 80);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b3a, 1.6));

const sol = new THREE.DirectionalLight(0xffffff, 2.5);
sol.position.set(8, 15, 6);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = -20;
sol.shadow.camera.right = 20;
sol.shadow.camera.top = 20;
sol.shadow.camera.bottom = -20;
sol.shadow.bias = -0.0005;
scene.add(sol);

// ---------------------------------------------------------------------
// Carregamento (barra de progresso compartilhada por todos os modelos)
// ---------------------------------------------------------------------
const elCarregando = document.getElementById('carregando');
const elProgresso = document.getElementById('progresso');
const elErros = document.getElementById('erros');

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, carregados, total) => {
  elProgresso.textContent = `${Math.round((carregados / total) * 100)}%`;
};
const loader = new GLTFLoader(manager);

// Cada arquivo é baixado uma vez só; membros com o mesmo modelo recebem
// cópias (SkeletonUtils.clone) que animam de forma independente.
const cacheGltf = new Map();
function carregarGltf(arquivo) {
  if (!cacheGltf.has(arquivo)) {
    const promessa = loader.loadAsync(arquivo);
    promessa.catch(() => cacheGltf.delete(arquivo));
    cacheGltf.set(arquivo, promessa);
  }
  return cacheGltf.get(arquivo);
}

function mostrarErro(msg) {
  console.error(msg);
  elErros.textContent += msg + '\n';
}

function ativarSombras(objeto) {
  objeto.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

// ---------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------
async function carregarMapa() {
  if (!MAPA.arquivo) {
    scene.add(criarMapaPadrao());
    return;
  }
  try {
    const gltf = await loader.loadAsync(MAPA.arquivo);
    gltf.scene.scale.setScalar(MAPA.escala);
    gltf.scene.position.fromArray(MAPA.posicao);
    ativarSombras(gltf.scene);
    scene.add(gltf.scene);
  } catch (e) {
    mostrarErro(`Não foi possível carregar o mapa ${MAPA.arquivo}: ${e.message}`);
    scene.add(criarMapaPadrao());
  }
}

// Gerador aleatório com semente, para o mapa sair igual toda vez.
function aleatorio(semente) {
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Praça com gramado, caminho, chafariz, postes e árvores, tudo em metros,
// para servir de referência de tamanho aos personagens.
function criarMapaPadrao() {
  const mapa = new THREE.Group();
  const rand = aleatorio(42);

  const matGrama = new THREE.MeshStandardMaterial({ color: 0x6f9b4a });
  const matPedra = new THREE.MeshStandardMaterial({ color: 0xc9b99a });
  const matPedraEscura = new THREE.MeshStandardMaterial({ color: 0x9a9288 });
  const matAgua = new THREE.MeshStandardMaterial({ color: 0x4f8fc0, roughness: 0.1 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x333a40, metalness: 0.6, roughness: 0.4 });
  const matTronco = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
  const matFolhas = new THREE.MeshStandardMaterial({ color: 0x3f7a35, flatShading: true });

  const grama = new THREE.Mesh(new THREE.CircleGeometry(RAIO_MAPA + 2, 64), matGrama);
  grama.rotation.x = -Math.PI / 2;
  grama.receiveShadow = true;
  mapa.add(grama);

  const praca = new THREE.Mesh(new THREE.CircleGeometry(7, 48), matPedra);
  praca.rotation.x = -Math.PI / 2;
  praca.position.y = 0.01;
  praca.receiveShadow = true;
  mapa.add(praca);

  const caminho = new THREE.Mesh(new THREE.PlaneGeometry(2.5, RAIO_MAPA - 6), matPedra);
  caminho.rotation.x = -Math.PI / 2;
  caminho.position.set(0, 0.01, 6 + (RAIO_MAPA - 6) / 2);
  caminho.receiveShadow = true;
  mapa.add(caminho);

  // Chafariz: borda de 0,5 m de altura.
  const chafariz = new THREE.Group();
  const borda = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.5, 32), matPedraEscura);
  borda.position.y = 0.25;
  const agua = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.05, 32), matAgua);
  agua.position.y = 0.45;
  const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.4, 16), matPedraEscura);
  coluna.position.y = 0.7;
  chafariz.add(borda, agua, coluna);
  chafariz.position.set(0, 0, -4.5);
  mapa.add(chafariz);

  // Postes de 3 m na borda da praça.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const poste = new THREE.Group();
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), matMetal);
    haste.position.y = 1.5;
    const lampada = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 0.6 }),
    );
    lampada.position.y = 3.1;
    poste.add(haste, lampada);
    poste.position.set(Math.sin(ang) * 6.6, 0, Math.cos(ang) * 6.6);
    mapa.add(poste);
  }

  // Árvores e pedras espalhadas fora da praça, sem ocupar o caminho.
  const troncoGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.8, 8);
  const copaGeo = new THREE.IcosahedronGeometry(1.2, 0);
  const pedraGeo = new THREE.DodecahedronGeometry(0.35, 0);
  for (let i = 0; i < 70; i++) {
    const ang = rand() * Math.PI * 2;
    const raio = 10 + rand() * (RAIO_MAPA - 12);
    const x = Math.sin(ang) * raio;
    const z = Math.cos(ang) * raio;
    if (Math.abs(x) < 3 && z > 0) continue;

    if (i % 5 === 0) {
      const pedra = new THREE.Mesh(pedraGeo, matPedraEscura);
      pedra.position.set(x, 0.15, z);
      pedra.scale.setScalar(0.6 + rand());
      pedra.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      mapa.add(pedra);
      continue;
    }
    const arvore = new THREE.Group();
    const tronco = new THREE.Mesh(troncoGeo, matTronco);
    tronco.position.y = 0.9;
    const copa = new THREE.Mesh(copaGeo, matFolhas);
    copa.position.y = 2.4;
    arvore.add(tronco, copa);
    arvore.position.set(x, 0, z);
    arvore.scale.setScalar(0.9 + rand() * 0.8);
    arvore.rotation.y = rand() * Math.PI * 2;
    mapa.add(arvore);
  }

  ativarSombras(mapa);
  grama.castShadow = false;
  praca.castShadow = false;
  caminho.castShadow = false;
  return mapa;
}

// ---------------------------------------------------------------------
// Personagens
// ---------------------------------------------------------------------
const personagens = [];
const hitboxes = [];
let selecionado = null;

// Cria um membro: a `raiz` é quem anda e gira pela cena, e continua a
// mesma quando o modelo é trocado. Rótulo e caixa de clique ficam presos
// nela. O `corpo` fica entre a raiz e o modelo e é usado nos movimentos
// de combate feitos por código (avançar no ataque, tombar ao morrer).
function criarPersonagem(membro) {
  const raiz = new THREE.Group();
  raiz.position.fromArray(membro.posicao);
  scene.add(raiz);

  const corpo = new THREE.Group();
  raiz.add(corpo);

  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  raiz.add(hitbox);

  const elRotulo = document.createElement('div');
  elRotulo.className = 'rotulo';
  elRotulo.innerHTML = '<span></span><div class="barra-vida"><div></div></div>';
  elRotulo.firstChild.textContent = membro.nome;
  const rotulo = new CSS2DObject(elRotulo);
  raiz.add(rotulo);

  const p = {
    membro,
    chaveModelo: null,
    raiz,
    corpo,
    hitbox,
    rotulo,
    elRotulo,
    elBarraVida: elRotulo.querySelector('.barra-vida div'),
    modelo: null,
    mixer: null,
    acoes: new Map(),
    atual: null,
    clips: {},
    velocidade: VELOCIDADE_PADRAO,
    altura: 1,
    raioCorpo: 0.3,
    movendo: false,
    carregamento: 0,
    // combate
    materiais: [],
    combate: COMBATE_PADRAO,
    vida: COMBATE_PADRAO.vida,
    estado: 'livre', // livre | atacando | atingido | morto
    estadoDesde: 0,
    estadoAte: 0,
    golpeEm: 0,
    golpeFeito: false,
    prontoEm: 0,
    invulneravelAte: 0,
    brilho: 0,
    empurrao: new THREE.Vector3(),
    abates: 0,
    mortes: 0,
  };
  hitbox.userData.personagem = p;
  hitboxes.push(hitbox);
  personagens.push(p);
  return p;
}

// Usa o clip indicado no config.js ou procura um com nome parecido.
function descobrirClips(cfg, nomes) {
  const achar = (re) => nomes.find((n) => re.test(n));
  return {
    parado: cfg.animacoes?.parado ?? achar(/idle|parado|survey|breath/i) ?? nomes[0],
    andar: cfg.animacoes?.andar ?? achar(/walk|andar|caminh/i),
    correr: cfg.animacoes?.correr ?? achar(/run|correr|sprint/i),
    atacar: cfg.animacoes?.atacar ?? achar(/attack|atac|punch|slash|kick|bite|strike|swing/i),
    dano: cfg.animacoes?.dano ?? achar(/hit|hurt|damage|dano|impact|react/i),
    morrer: cfg.animacoes?.morrer ?? achar(/death|die|dead|morr/i),
  };
}

async function vestirModelo(p, chave) {
  const cfg = MODELOS[chave];
  const pedido = ++p.carregamento;
  const gltf = await carregarGltf(cfg.arquivo);
  // Se o usuário trocou de novo enquanto este carregava, descarta.
  if (pedido !== p.carregamento) return;

  if (gltf.animations.length < 3) {
    mostrarErro(`${cfg.nome}: o modelo tem só ${gltf.animations.length} animação(ões); o trabalho pede pelo menos 3.`);
  }

  const modelo = SkeletonUtils.clone(gltf.scene);
  modelo.rotation.y = THREE.MathUtils.degToRad(cfg.rotacaoY ?? 0);
  ativarSombras(modelo);

  // Mede o modelo num grupo na origem, redimensiona para a altura real e
  // deixa os pés em y = 0, centralizado em x/z.
  const medidor = new THREE.Group();
  medidor.add(modelo);
  medidor.updateMatrixWorld(true);
  modelo.traverse((o) => o.isSkinnedMesh && o.skeleton.update());

  const caixa = new THREE.Box3().setFromObject(modelo);
  const tamanho = caixa.getSize(new THREE.Vector3());
  const centro = caixa.getCenter(new THREE.Vector3());
  const escala = cfg.alturaMetros / tamanho.y;
  modelo.scale.multiplyScalar(escala);
  modelo.position.set(-centro.x * escala, -caixa.min.y * escala, -centro.z * escala);
  tamanho.multiplyScalar(escala);

  // Materiais próprios, para o brilho vermelho de dano não pintar outros
  // membros que usem o mesmo modelo.
  p.materiais = [];
  modelo.traverse((o) => {
    if (!o.isMesh) return;
    const copiar = (m) => {
      const c = m.clone();
      if (c.emissive) p.materiais.push({ material: c, emissiva: c.emissive.clone() });
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(copiar) : copiar(o.material);
  });

  if (p.modelo) {
    p.mixer.stopAllAction();
    p.corpo.remove(p.modelo);
  }
  p.corpo.add(modelo);

  p.hitbox.scale.set(Math.max(tamanho.x, 0.4), tamanho.y, Math.max(tamanho.z, 0.4));
  p.hitbox.position.y = tamanho.y / 2;
  p.rotulo.position.y = tamanho.y + 0.25;

  p.chaveModelo = chave;
  p.modelo = modelo;
  p.altura = tamanho.y;
  p.raioCorpo = Math.max(Math.min(tamanho.x, tamanho.z) / 2, 0.15);
  p.velocidade = { ...VELOCIDADE_PADRAO, ...cfg.velocidade };
  p.combate = { ...COMBATE_PADRAO, alcance: 0.4 + tamanho.y * 0.45, ...cfg.combate };
  p.mixer = new THREE.AnimationMixer(modelo);
  p.mixer.timeScale = Number(elVelocidadeAnim.value);
  p.acoes = new Map(gltf.animations.map((clip) => [clip.name, p.mixer.clipAction(clip)]));
  p.clips = descobrirClips(cfg, [...p.acoes.keys()]);
  p.atual = null;
  // Corpo novo: volta com a vida cheia.
  p.vida = p.combate.vida;
  p.elRotulo.classList.remove('morto');
  liberar(p);
  atualizarVida(p);

  if (p.li) atualizarItemMembro(p);
  if (p === selecionado) selecionar(p);
}

// `umaVez` toca o clip uma vez só e congela no último quadro (ataque,
// dano, morte); sem ele o clip repete. Devolve a duração em segundos reais.
function tocar(p, nome, umaVez = false) {
  const nova = p.acoes.get(nome);
  if (!nova || (nova === p.atual && !umaVez)) return 0;
  nova.setLoop(umaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  nova.clampWhenFinished = umaVez;
  nova.reset();
  nova.setEffectiveWeight(1);
  nova.play();
  if (p.atual && p.atual !== nova) nova.crossFadeFrom(p.atual, umaVez ? 0.15 : 0.3, true);
  p.atual = nova;
  if (p === selecionado) atualizarBotoesAnimacao();
  return nova.getClip().duration / Math.max(p.mixer.timeScale, 0.1);
}

// ---------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------
const elAvisos = document.getElementById('avisos');
const vermelho = new THREE.Color(0xff2020);
const paraFrente = new THREE.Vector3();
const paraAlvo = new THREE.Vector3();
let tempo = 0;

function vivo(p) {
  return p.modelo && p.estado !== 'morto';
}

function mudarEstado(p, estado, duracao) {
  p.estado = estado;
  p.estadoDesde = tempo;
  p.estadoAte = tempo + duracao;
  p.movendo = false;
}

// Volta ao estado normal, podendo andar e atacar.
function liberar(p) {
  p.estado = 'livre';
  p.movendo = false;
  p.corpo.position.set(0, 0, 0);
  p.corpo.rotation.set(0, 0, 0);
  tocar(p, p.clips.parado);
}

function atacar(p) {
  if (!vivo(p) || p.estado !== 'livre' || tempo < p.prontoEm) return;
  mirar(p);
  const duracaoClip = p.clips.atacar ? tocar(p, p.clips.atacar, true) : 0;
  const duracao = duracaoClip ? Math.min(duracaoClip, 2.5) : 0.45;
  mudarEstado(p, 'atacando', duracao);
  // O golpe "acerta" um pouco antes da metade do movimento.
  p.golpeEm = tempo + duracao * 0.4;
  p.golpeFeito = false;
  p.prontoEm = tempo + Math.max(duracao, p.combate.recarga);
}

// Mira leve: vira para o inimigo mais próximo que esteja um pouco além do
// alcance e no meio-círculo da frente, para não precisar acertar o ângulo
// exato no teclado.
function mirar(p) {
  const ang = p.raiz.rotation.y;
  paraFrente.set(Math.sin(ang), 0, Math.cos(ang));
  let melhor = null;
  let menorDist = Infinity;
  for (const alvo of personagens) {
    if (alvo === p || !vivo(alvo)) continue;
    paraAlvo.subVectors(alvo.raiz.position, p.raiz.position).setY(0);
    const dist = paraAlvo.length();
    if (dist > p.combate.alcance + alvo.raioCorpo + 0.5 || paraAlvo.dot(paraFrente) < 0) continue;
    if (dist < menorDist) {
      menorDist = dist;
      melhor = alvo;
    }
  }
  if (melhor && menorDist > 0.01) {
    p.raiz.rotation.y = Math.atan2(
      melhor.raiz.position.x - p.raiz.position.x,
      melhor.raiz.position.z - p.raiz.position.z,
    );
  }
}

// Acerta todos os outros membros vivos que estejam dentro do alcance e
// mais ou menos na frente do atacante.
function resolverGolpe(atacante) {
  const ang = atacante.raiz.rotation.y;
  paraFrente.set(Math.sin(ang), 0, Math.cos(ang));
  for (const alvo of personagens) {
    if (alvo === atacante || !vivo(alvo) || tempo < alvo.invulneravelAte) continue;
    paraAlvo.subVectors(alvo.raiz.position, atacante.raiz.position).setY(0);
    const dist = paraAlvo.length();
    if (dist > atacante.combate.alcance + alvo.raioCorpo) continue;
    if (dist > 0.01 && paraAlvo.dot(paraFrente) / dist < 0.35) continue;
    receberDano(alvo, atacante, dist > 0.01 ? paraAlvo.divideScalar(dist) : paraFrente);
  }
}

function receberDano(alvo, atacante, direcao) {
  const dano = atacante.combate.dano;
  alvo.vida = Math.max(0, alvo.vida - dano);
  alvo.brilho = 1;
  alvo.empurrao.copy(direcao).multiplyScalar(1.5); // ~20 cm
  mostrarNumeroDano(alvo, dano);
  atualizarVida(alvo);

  if (alvo.vida === 0) {
    morrer(alvo, atacante);
    return;
  }
  // Reação ao golpe: interrompe o que o alvo estava fazendo.
  const duracaoClip = alvo.clips.dano ? tocar(alvo, alvo.clips.dano, true) : 0;
  mudarEstado(alvo, 'atingido', duracaoClip ? Math.min(duracaoClip, 0.8) : 0.3);
}

function morrer(alvo, atacante) {
  alvo.mortes++;
  atacante.abates++;
  mudarEstado(alvo, 'morto', 4);
  if (alvo.clips.morrer) tocar(alvo, alvo.clips.morrer, true);
  else tocar(alvo, alvo.clips.parado);
  alvo.elRotulo.classList.add('morto');
  avisar(`${atacante.membro.nome} derrotou ${alvo.membro.nome}!`);
  atualizarItemMembro(alvo);
  atualizarItemMembro(atacante);
}

function renascer(p) {
  p.vida = p.combate.vida;
  p.raiz.position.fromArray(p.membro.posicao);
  p.raiz.rotation.y = 0;
  p.empurrao.set(0, 0, 0);
  p.invulneravelAte = tempo + 1.5;
  p.elRotulo.classList.remove('morto');
  liberar(p);
  atualizarVida(p);
}

function reiniciarLuta() {
  for (const p of personagens) {
    if (!p.modelo) continue;
    p.abates = 0;
    p.mortes = 0;
    renascer(p);
    atualizarItemMembro(p);
  }
  avisar('Luta reiniciada');
}

function limitarAoMapa(p) {
  const dist = Math.hypot(p.raiz.position.x, p.raiz.position.z);
  if (dist > RAIO_MAPA) p.raiz.position.multiplyScalar(RAIO_MAPA / dist);
}

function atualizarCombate(p, dt) {
  if (!p.modelo) return;

  if (p.empurrao.lengthSq() > 1e-4) {
    p.raiz.position.addScaledVector(p.empurrao, dt);
    p.empurrao.multiplyScalar(Math.exp(-8 * dt));
    limitarAoMapa(p);
  }

  if (p.brilho > 0) {
    p.brilho = Math.max(0, p.brilho - dt * 3);
    for (const { material, emissiva } of p.materiais) material.emissive.copy(emissiva).lerp(vermelho, p.brilho);
  }

  // Pisca enquanto está invulnerável depois de renascer.
  p.modelo.visible = tempo >= p.invulneravelAte || Math.floor(tempo * 10) % 2 === 0;

  const progresso = Math.min(1, (tempo - p.estadoDesde) / Math.max(p.estadoAte - p.estadoDesde, 0.001));
  if (p.estado === 'atacando') {
    // Sem clip de ataque: dá um bote para frente e volta.
    if (!p.clips.atacar) p.corpo.position.z = Math.sin(progresso * Math.PI) * p.combate.alcance * 0.35;
    if (!p.golpeFeito && tempo >= p.golpeEm) {
      p.golpeFeito = true;
      resolverGolpe(p);
    }
  }
  if (p.estado === 'morto' && !p.clips.morrer) {
    // Sem clip de morte: tomba de lado.
    const queda = Math.min(1, (tempo - p.estadoDesde) / 0.5);
    p.corpo.rotation.z = (-Math.PI / 2) * queda * queda;
    p.corpo.position.y = p.raioCorpo * queda;
  }

  if (p.estado !== 'livre' && tempo >= p.estadoAte) {
    if (p.estado === 'morto') renascer(p);
    else liberar(p);
  }
}

function atualizarVida(p) {
  const fracao = p.vida / p.combate.vida;
  p.elBarraVida.style.width = `${fracao * 100}%`;
  p.elBarraVida.style.background = fracao > 0.5 ? '#5ad15a' : fracao > 0.25 ? '#e8c43a' : '#e5484d';
  if (p.li) atualizarItemMembro(p);
}

function mostrarNumeroDano(p, dano) {
  // O CSS2DRenderer posiciona `el` via transform; quem sobe animado é o filho.
  const el = document.createElement('div');
  const texto = document.createElement('div');
  texto.className = 'numero-dano';
  texto.textContent = `-${dano}`;
  el.appendChild(texto);
  const numero = new CSS2DObject(el);
  numero.position.y = p.altura + 0.5;
  p.raiz.add(numero);
  setTimeout(() => p.raiz.remove(numero), 900);
}

function avisar(texto) {
  const el = document.createElement('div');
  el.textContent = texto;
  elAvisos.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------
const elListaMembros = document.getElementById('lista-membros');
const elListaAnimacoes = document.getElementById('lista-animacoes');
const elNomeSelecionado = document.getElementById('nome-selecionado');
const elSeletorModelo = document.getElementById('seletor-modelo');
const elTeclasSelecionado = document.getElementById('teclas-selecionado');
const elVelocidadeAnim = document.getElementById('velocidade-anim');

for (const [chave, cfg] of Object.entries(MODELOS)) {
  elSeletorModelo.add(new Option(`${cfg.nome} (${cfg.alturaMetros} m)`, chave));
}

elSeletorModelo.addEventListener('change', async () => {
  const p = selecionado;
  if (!p) return;
  elSeletorModelo.disabled = true;
  try {
    await vestirModelo(p, elSeletorModelo.value);
  } catch (e) {
    mostrarErro(`Não foi possível carregar ${MODELOS[elSeletorModelo.value].arquivo}: ${e.message}`);
    elSeletorModelo.value = p.chaveModelo;
  } finally {
    elSeletorModelo.disabled = false;
    elSeletorModelo.blur(); // devolve o teclado para a cena
  }
});

function montarListaMembros() {
  elListaMembros.innerHTML = '';
  for (const p of personagens) {
    p.li = document.createElement('li');
    p.li.addEventListener('click', () => selecionar(p));
    atualizarItemMembro(p);
    elListaMembros.appendChild(p.li);
  }
}

function atualizarItemMembro(p) {
  const cfg = MODELOS[p.chaveModelo];
  const vida = p.estado === 'morto' ? 'derrotado' : `♥ ${p.vida}/${p.combate.vida}`;
  p.li.innerHTML =
    `${p.membro.nome} <span>· ${cfg?.nome ?? 'sem modelo'} · ${p.acoes.size} animações</span>` +
    `<div class="placar-membro">${vida} · ${p.abates} abates · ${p.mortes} mortes</div>` +
    `<div class="teclas-membro">${descreverTeclas(p.membro.teclas)}</div>`;
}

function descreverTeclas(t) {
  if (!t) return 'Sem atalhos: adicione "teclas" no config.js.';
  const mover = ['frente', 'esquerda', 'tras', 'direita'].map((d) => `<kbd>${nomeTecla(t[d])}</kbd>`).join('');
  const atacar = t.atacar ? ` · <kbd>${nomeTecla(t.atacar)}</kbd> ataca` : '';
  return `${mover} anda · <kbd>${nomeTecla(t.correr)}</kbd> corre${atacar}`;
}

// Mostra "ArrowUp" como "↑", "KeyW" como "W" etc.
function nomeTecla(codigo) {
  const setas = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (setas[codigo]) return setas[codigo];
  if (/^Shift/.test(codigo)) return codigo === 'ShiftRight' ? 'Shift dir.' : 'Shift esq.';
  return codigo.replace(/^(Key|Digit)/, '');
}

function selecionar(p) {
  selecionado = p;
  for (const outro of personagens) {
    outro.li?.classList.toggle('ativo', outro === p);
    outro.elRotulo.classList.toggle('ativo', outro === p);
  }
  elNomeSelecionado.textContent = `— ${p.membro.nome}`;
  if (p.chaveModelo) elSeletorModelo.value = p.chaveModelo;

  elTeclasSelecionado.innerHTML = descreverTeclas(p.membro.teclas);

  elListaAnimacoes.innerHTML = '';
  [...p.acoes.keys()].forEach((nome, i) => {
    const botao = document.createElement('button');
    botao.textContent = i < 9 ? `${i + 1}. ${nome}` : nome;
    botao.dataset.clip = nome;
    botao.addEventListener('click', () => {
      if (p.estado !== 'livre') return;
      p.movendo = false;
      tocar(p, nome);
    });
    elListaAnimacoes.appendChild(botao);
  });
  atualizarBotoesAnimacao();
}

function atualizarBotoesAnimacao() {
  const nomeAtual = selecionado?.atual?.getClip().name;
  for (const botao of elListaAnimacoes.children) {
    botao.classList.toggle('ativo', botao.dataset.clip === nomeAtual);
  }
}

elVelocidadeAnim.addEventListener('input', () => {
  for (const p of personagens) if (p.mixer) p.mixer.timeScale = Number(elVelocidadeAnim.value);
});

document.getElementById('reiniciar-luta').addEventListener('click', (e) => {
  reiniciarLuta();
  e.currentTarget.blur(); // devolve o teclado para a cena
});

// ---------------------------------------------------------------------
// Entrada: clique para selecionar, teclado para animar, mover e atacar
// ---------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
let inicioClique = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  inicioClique = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  // Ignora quando o usuário estava arrastando a câmera.
  if (!inicioClique || Math.hypot(e.clientX - inicioClique.x, e.clientY - inicioClique.y) > 5) return;
  ponteiro.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ponteiro, camera);
  const [acerto] = raycaster.intersectObjects(hitboxes, false);
  if (acerto) selecionar(acerto.object.userData.personagem);
});

const teclas = new Set();
const teclasDosMembros = new Set(MEMBROS.flatMap((m) => Object.values(m.teclas ?? {})));

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
  if (teclasDosMembros.has(e.code)) e.preventDefault(); // setas não rolam a página
  teclas.add(e.code);
  if (!e.repeat) {
    for (const p of personagens) if (p.membro.teclas?.atacar === e.code) atacar(p);
  }
  const numero = Number(e.key);
  if (selecionado?.estado === 'livre' && numero >= 1 && numero <= 9) {
    const nome = [...selecionado.acoes.keys()][numero - 1];
    if (nome) {
      selecionado.movendo = false;
      tocar(selecionado, nome);
    }
  }
});
window.addEventListener('keyup', (e) => teclas.delete(e.code));
window.addEventListener('blur', () => teclas.clear());

const frente = new THREE.Vector3();
const direita = new THREE.Vector3();
const direcao = new THREE.Vector3();
const alvoCamera = new THREE.Vector3();
const deslocamento = new THREE.Vector3();

function mover(p, dt) {
  if (!p.modelo || p.estado !== 'livre') return;
  const t = p.membro.teclas ?? {};
  const ativo = (d) => teclas.has(t[d]);

  direcao.set(0, 0, 0);
  if (ativo('frente')) direcao.add(frente);
  if (ativo('tras')) direcao.sub(frente);
  if (ativo('direita')) direcao.add(direita);
  if (ativo('esquerda')) direcao.sub(direita);

  if (direcao.lengthSq() === 0) {
    if (p.movendo) {
      p.movendo = false;
      tocar(p, p.clips.parado);
    }
    return;
  }

  const correndo = teclas.has(t.correr);
  direcao.normalize();
  p.raiz.position.addScaledVector(direcao, (correndo ? p.velocidade.correr : p.velocidade.andar) * dt);

  limitarAoMapa(p);

  // Gira suavemente para a direção do movimento.
  const anguloAlvo = Math.atan2(direcao.x, direcao.z);
  let diff = anguloAlvo - p.raiz.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  p.raiz.rotation.y += diff * Math.min(1, dt * 10);

  p.movendo = true;
  // Sem clip de correr usa o de andar; sem nenhum dos dois, só desliza.
  tocar(p, (correndo && p.clips.correr) || p.clips.andar);
}

function moverTodos(dt) {
  // Direções relativas à câmera, no plano do chão.
  camera.getWorldDirection(frente);
  frente.y = 0;
  frente.normalize();
  direita.crossVectors(frente, THREE.Object3D.DEFAULT_UP);
  for (const p of personagens) mover(p, dt);
}

// A câmera acompanha o personagem selecionado.
function seguirSelecionado(dt) {
  if (!selecionado) return;
  alvoCamera.copy(selecionado.raiz.position);
  alvoCamera.y += selecionado.altura * 0.6;
  deslocamento.subVectors(alvoCamera, controls.target).multiplyScalar(Math.min(1, dt * 5));
  controls.target.add(deslocamento);
  camera.position.add(deslocamento);
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const relogio = new THREE.Clock();

function animar() {
  const dt = Math.min(relogio.getDelta(), 0.1);
  tempo += dt;
  moverTodos(dt);
  for (const p of personagens) {
    atualizarCombate(p, dt);
    p.mixer?.update(dt);
  }
  seguirSelecionado(dt);
  controls.update();
  renderer.render(scene, camera);
  rotulosRenderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  rotulosRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
await carregarMapa();
const criados = MEMBROS.map(criarPersonagem);
const resultados = await Promise.allSettled(criados.map((p) => vestirModelo(p, p.membro.modelo)));
resultados.forEach((r, i) => {
  if (r.status === 'rejected') {
    const m = MEMBROS[i];
    mostrarErro(`Não foi possível carregar ${m.nome} (${MODELOS[m.modelo]?.arquivo ?? m.modelo}): ${r.reason?.message ?? r.reason}`);
  }
});

montarListaMembros();
if (personagens.length) selecionar(personagens[0]);

elCarregando.classList.add('oculto');
renderer.setAnimationLoop(animar);
