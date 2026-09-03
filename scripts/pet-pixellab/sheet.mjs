// Hoja de contacto ×6 con etiquetas, para comparar candidatos a ojo (o pegarla en una issue).
//   node scripts/pet-pixellab/sheet.mjs <out.png> etiqueta=fichero.png [etiqueta=fichero.png ...]
import sharp from "sharp";

const [out, ...items] = process.argv.slice(2);
if (!out || items.length === 0) { console.error("uso: sheet.mjs <out.png> etiqueta=fichero.png ..."); process.exit(1); }
const S = 6, C = 40, PAD = 8, LABEL = 18;
const cells = items.map((i) => { const [label, file] = i.split("="); return { label, file }; });
const W = cells.length * (C * S + PAD) + PAD, H = C * S + PAD * 2 + LABEL;
const comps = [];
for (let i = 0; i < cells.length; i++) {
  const x = PAD + i * (C * S + PAD);
  const img = await sharp(cells[i].file)
    .resize(C, C, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(C * S, C * S, { kernel: "nearest" }).png().toBuffer();
  comps.push({ input: img, left: x, top: PAD });
  const svg = `<svg width="${C * S}" height="${LABEL}"><text x="2" y="14" font-family="monospace" font-size="13" fill="#222">${cells[i].label}</text></svg>`;
  comps.push({ input: Buffer.from(svg), left: x, top: PAD + C * S + 2 });
}
await sharp({ create: { width: W, height: H, channels: 4, background: "#f3ead8" } }).composite(comps).png().toFile(out);
console.log("ok", out, `${W}x${H}`);
