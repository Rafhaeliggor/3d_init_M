// Funções de geometria usadas pelo servidor e pelo cliente.
// Convenção de ângulo: rot = 0 olha para +z; a frente é (sin rot, cos rot).

export function normalizarAngulo(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function frenteDe(rot) {
  return { x: Math.sin(rot), z: Math.cos(rot) };
}

// O alvo (círculo de raio `raioAlvo`) está dentro do golpe em leque?
export function dentroDoGolpe(ax, az, rot, alcance, arcoGraus, alvoX, alvoZ, raioAlvo) {
  const dx = alvoX - ax;
  const dz = alvoZ - az;
  const dist = Math.hypot(dx, dz);
  if (dist > alcance + raioAlvo) return false;
  if (arcoGraus >= 360 || dist < 0.01) return true;
  const diff = Math.abs(normalizarAngulo(Math.atan2(dx, dz) - rot));
  // Soma a "largura angular" do corpo do alvo, para não errar por um triz.
  const folga = Math.asin(Math.min(1, raioAlvo / dist));
  return diff <= (arcoGraus * Math.PI) / 360 + folga;
}

// O alvo está dentro do retângulo que começa no atacante e vai
// `comprimento` m para a frente, com `largura` m de lado a lado?
export function dentroDoRetangulo(ax, az, rot, comprimento, largura, alvoX, alvoZ, raioAlvo) {
  const dx = alvoX - ax;
  const dz = alvoZ - az;
  const f = frenteDe(rot);
  const frente = dx * f.x + dz * f.z;
  const lado = dx * f.z - dz * f.x;
  return frente >= -raioAlvo && frente <= comprimento + raioAlvo && Math.abs(lado) <= largura / 2 + raioAlvo;
}

// Distância do ponto (px, pz) ao segmento (ax, az)-(bx, bz).
export function distanciaAoSegmento(ax, az, bx, bz, px, pz) {
  const vx = bx - ax;
  const vz = bz - az;
  const comp2 = vx * vx + vz * vz;
  let t = comp2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / comp2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

export function limitarAoCirculo(pos, raio) {
  const d = Math.hypot(pos.x, pos.z);
  if (d > raio) {
    pos.x *= raio / d;
    pos.z *= raio / d;
  }
}
