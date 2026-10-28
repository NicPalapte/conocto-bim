// SHA-256 (FIPS 180-4), synchron und ohne Abhängigkeit.
//
// Warum nicht `crypto.subtle.digest`: das ist asynchron und fehlt außerhalb
// eines „sicheren Kontexts" (Dev-Server über eine LAN-Adresse mit http). Die
// Hashes sind Adressen, kein Schutz — es braucht nur ein überall gleiches
// Ergebnis, auch im Worker und im synchronen Fallback der Pipeline.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

// Puffer werden wiederverwendet: bei zehntausend kurzen Eingaben je Datei
// kostet das Anlegen typisierter Arrays mehr als das Rechnen selbst. Die Bytes
// selbst werden nie kopiert, nur der letzte, aufgefüllte Block (höchstens 128 Byte).
const W = new Uint32Array(64);
const H = new Uint32Array(8);
const TAIL = new Uint8Array(128);

/** Ein 64-Byte-Block ab `offset` in den Zustand `H` einrechnen. */
function compress(bytes: Uint8Array, offset: number): void {
  const w = W;
  for (let t = 0, i = offset; t < 16; t++, i += 4) {
    w[t] = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
  }
  for (let t = 16; t < 64; t++) {
    const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
    const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
    w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
  }
  const h = H;
  let a = h[0];
  let b = h[1];
  let c = h[2];
  let d = h[3];
  let e = h[4];
  let f = h[5];
  let g = h[6];
  let k = h[7];
  for (let t = 0; t < 64; t++) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (k + s1 + ch + K[t] + w[t]) | 0;
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + maj) | 0;
    k = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += d;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += k;
}

/** SHA-256 der Bytes als 64 Hex-Zeichen (Kleinbuchstaben). */
export function sha256Hex(data: Uint8Array): string {
  H.set([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const full = data.length & ~63;
  for (let offset = 0; offset < full; offset += 64) compress(data, offset);

  // Rest + 0x80 + Nullen + 64-Bit-Länge: ein oder zwei Blöcke.
  const rest = data.length - full;
  const tailLength = rest + 9 > 64 ? 128 : 64;
  TAIL.fill(0);
  TAIL.set(data.subarray(full));
  TAIL[rest] = 0x80;
  const bitsHigh = Math.floor(data.length / 0x20000000);
  const bitsLow = (data.length * 8) >>> 0;
  TAIL[tailLength - 8] = bitsHigh >>> 24;
  TAIL[tailLength - 7] = (bitsHigh >>> 16) & 0xff;
  TAIL[tailLength - 6] = (bitsHigh >>> 8) & 0xff;
  TAIL[tailLength - 5] = bitsHigh & 0xff;
  TAIL[tailLength - 4] = bitsLow >>> 24;
  TAIL[tailLength - 3] = (bitsLow >>> 16) & 0xff;
  TAIL[tailLength - 2] = (bitsLow >>> 8) & 0xff;
  TAIL[tailLength - 1] = bitsLow & 0xff;
  for (let offset = 0; offset < tailLength; offset += 64) compress(TAIL, offset);

  const h = H;
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += HEX[h[i] >>> 24] + HEX[(h[i] >>> 16) & 0xff] + HEX[(h[i] >>> 8) & 0xff];
    out += HEX[h[i] & 0xff];
  }
  return out;
}

const ENCODER = new TextEncoder();

/** SHA-256 eines Texts (UTF-8). */
export function sha256HexOfText(text: string): string {
  return sha256Hex(ENCODER.encode(text));
}
