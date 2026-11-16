// =====================================================================
//  SERVIDOR
//  Um único processo, numa única porta, serve a página do jogo e o
//  WebSocket da partida (/ws). Escuta em todas as interfaces de rede,
//  então qualquer aparelho no mesmo Wi-Fi consegue entrar.
//
//    npm run dev  → modo desenvolvimento (Vite com recarga automática)
//    npm start    → serve a versão compilada em dist/ (npm run build)
// =====================================================================
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Servidor } from './jogo.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORTA = Number(process.env.PORT) || 3000;

function enderecosNaRede() {
  const lista = [];
  for (const [nome, interfaces] of Object.entries(os.networkInterfaces())) {
    for (const i of interfaces ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      // Adaptadores virtuais (WSL, VirtualBox, Docker…) não servem para o Wi-Fi.
      const virtual = /vEthernet|VirtualBox|VMware|WSL|Docker|Hyper-V|Loopback/i.test(nome);
      lista.push({ nome, url: `http://${i.address}:${PORTA}`, virtual });
    }
  }
  lista.sort((a, b) => a.virtual - b.virtual);
  return lista;
}

const servidor = http.createServer();

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: RAIZ,
    appType: 'spa',
    // A recarga automática do Vite usa o mesmo servidor/porta do jogo.
    server: { middlewareMode: true, hmr: { server: servidor } },
  });
  servidor.on('request', vite.middlewares);
} else {
  const dist = path.join(RAIZ, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('\nNão achei dist/index.html. Rode "npm run build" antes de "npm start",');
    console.error('ou use "npm run dev" para rodar sem compilar.\n');
    process.exit(1);
  }
  servidor.on('request', servirArquivos(dist));
}

const enderecos = enderecosNaRede();
const lobby = new Servidor({ enderecos: enderecos.filter((e) => !e.virtual).map((e) => e.url) });

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => lobby.conectar(ws));

servidor.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (!DEV) {
    socket.destroy(); // no modo dev, o Vite cuida das outras conexões
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nA porta ${PORTA} já está em uso. Feche o outro servidor ou use outra porta:`);
    console.error(`  PowerShell:  $env:PORT=3001; npm run dev\n`);
    process.exit(1);
  }
  throw e;
});

servidor.listen(PORTA, '0.0.0.0', () => {
  const linhas = [
    '',
    `  PROJECT COMBAT ${DEV ? '(desenvolvimento)' : ''}`,
    '',
    `  Neste computador:   http://localhost:${PORTA}`,
  ];
  const reais = enderecos.filter((e) => !e.virtual);
  for (const e of reais.length ? reais : enderecos) {
    linhas.push(`  Na rede (Wi-Fi):    ${e.url}   (${e.nome})`);
  }
  if (!enderecos.length) linhas.push('  Nenhuma rede encontrada: conecte-se ao Wi-Fi para jogar com outras pessoas.');
  linhas.push('', '  Mande o endereço "Na rede" para quem está no mesmo Wi-Fi.', '  Ctrl+C para encerrar.', '');
  console.log(linhas.join('\n'));
});

// ---------------------------------------------------------------------
// Arquivos estáticos (modo npm start)
// ---------------------------------------------------------------------
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function servirArquivos(pasta) {
  return (req, res) => {
    let caminho;
    try {
      caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let arquivo = path.join(pasta, caminho);
    if (!arquivo.startsWith(pasta)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      // Arquivo com extensão que não existe é 404 (ex.: um .glb com nome errado).
      if (path.extname(caminho)) {
        res.writeHead(404).end();
        return;
      }
      arquivo = path.join(pasta, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  };
}
