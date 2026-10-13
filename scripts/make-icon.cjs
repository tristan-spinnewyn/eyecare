/**
 * Génère build/icon.ico, build/icon.png et assets/icon.png sans dépendances externes.
 * Design Eyecare 20-20-20 : carré sombre aux coins arrondis + œil stylisé avec iris bleu reposant.
 *
 * Exécution : node scripts/make-icon.cjs
 */
const zlib = require('zlib');
const { writeFileSync, mkdirSync } = require('fs');
const { resolve, dirname } = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const SS = 4; // Suréchantillonnage pour un anti-aliasing parfait

const BG_TOP = [15, 23, 42];      // slate-900 (#0F172A)
const BG_BOT = [30, 41, 59];      // slate-800 (#1E293B)
const EYE_OUTLINE = [96, 165, 250]; // blue-400 (#60A5FA)
const EYE_WHITE = [241, 245, 249];  // slate-100 (#F1F5F9)
const IRIS_TOP = [59, 130, 246];    // blue-500 (#3B82F6)
const IRIS_BOT = [29, 78, 216];     // blue-700 (#1D4ED8)
const PUPIL = [15, 23, 42];         // dark pupil
const HIGHLIGHT = [255, 255, 255];  // white reflection

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function inRoundedRect(x, y, r) {
  const nx = Math.min(x, 1 - x);
  const ny = Math.min(y, 1 - y);
  if (nx >= r && ny >= r) return true;
  if (nx >= r || ny >= r) return nx >= 0 && ny >= 0;
  const dx = r - nx;
  const dy = r - ny;
  return dx * dx + dy * dy <= r * r;
}

// Fonction de l'œil : intersection de deux arcs de cercle
function inEyeShape(x, y) {
  const dx = (x - 0.5) * 1.5;
  const dy = y - 0.5;
  const r = 0.55;
  // Arc supérieur et arc inférieur
  const d1 = (dx * dx + (dy + 0.3) * (dy + 0.3));
  const d2 = (dx * dx + (dy - 0.3) * (dy - 0.3));
  return d1 <= r * r && d2 <= r * r;
}

function renderPixel(nx, ny) {
  if (!inRoundedRect(nx, ny, 0.22)) {
    return [0, 0, 0, 0];
  }

  // Fond dégradé
  const bg = mix(BG_TOP, BG_BOT, ny);

  // Forme de l'œil
  const inEye = inEyeShape(nx, ny);
  if (!inEye) {
    return [...bg, 255];
  }

  // Centre de l'œil (iris et pupille)
  const cx = 0.5;
  const cy = 0.5;
  const distCenter = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));

  // Reflet lumineux
  const distHighlight = Math.sqrt((nx - 0.46) * (nx - 0.46) + (ny - 0.44) * (ny - 0.44));
  if (distHighlight < 0.035) {
    return [...HIGHLIGHT, 255];
  }

  // Pupille
  if (distCenter < 0.065) {
    return [...PUPIL, 255];
  }

  // Iris
  if (distCenter < 0.15) {
    const irisColor = mix(IRIS_TOP, IRIS_BOT, (ny - (cy - 0.15)) / 0.3);
    return [...irisColor, 255];
  }

  // Blanc de l'œil avec contour bleu
  const edgeDist = Math.abs(ny - 0.5) + Math.abs((nx - 0.5) * 0.7);
  if (edgeDist > 0.24) {
    return [...EYE_OUTLINE, 255];
  }

  return [...EYE_WHITE, 255];
}

function renderSize(size) {
  const buf = Buffer.alloc(size * size * 4);
  const totalSub = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const [r, g, b, a] = renderPixel(nx, ny);
          rAcc += r; gAcc += g; bAcc += b; aAcc += a;
        }
      }

      const offset = (y * size + x) * 4;
      buf[offset] = Math.round(rAcc / totalSub);
      buf[offset + 1] = Math.round(gAcc / totalSub);
      buf[offset + 2] = Math.round(bAcc / totalSub);
      buf[offset + 3] = Math.round(aAcc / totalSub);
    }
  }

  return buf;
}

// ---- PNG Encoding ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO Packaging ----
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  pngs.forEach((p, i) => {
    const e = dir.subarray(i * 16);
    e[0] = p.size >= 256 ? 0 : p.size;
    e[1] = p.size >= 256 ? 0 : p.size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(p.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += p.data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

function generateIcons(rootDir = process.cwd()) {
  console.log('🎨 Génération des icônes pour Windows et Linux...');
  const pngs = SIZES.map((size) => {
    process.stdout.write(`\r  rendu ${size}×${size}…   `);
    return { size, data: encodePng(renderSize(size), size) };
  });

  // Pour l'ICO : jusqu'à 256
  const icoPngs = pngs.filter((p) => p.size <= 256);
  const ico = buildIco(icoPngs);

  const buildDir = resolve(rootDir, 'build');
  const assetsDir = resolve(rootDir, 'assets');
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  const icoPath = resolve(buildDir, 'icon.ico');
  const pngPath = resolve(buildDir, 'icon.png');
  const assetsPngPath = resolve(assetsDir, 'icon.png');

  // PNG 512x512 pour Linux AppImage et deb
  const largestPng = pngs[pngs.length - 1].data;

  writeFileSync(icoPath, ico);
  writeFileSync(pngPath, largestPng);
  writeFileSync(assetsPngPath, largestPng);

  console.log(`\n✔ ${icoPath} (${(ico.length / 1024).toFixed(1)} Ko)`);
  console.log(`✔ ${pngPath} (${(largestPng.length / 1024).toFixed(1)} Ko, 512×512)`);
  console.log(`✔ ${assetsPngPath}`);
}

if (require.main === module) {
  generateIcons();
}

module.exports = { generateIcons };
