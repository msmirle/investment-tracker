// Generates PNG icons for the PWA manifest from a simple SVG.
// Run with: node scripts/generate-pwa-icons.mjs
// Requires the optional "sharp" dev dependency. If sharp is not installed,
// you can replace public/icons/*.png with your own artwork manually.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "icons");

const baseSvg = (size, padded) => {
  // padded=true => leave ~10% safe area for "maskable" icons.
  const pad = padded ? Math.round(size * 0.1) : 0;
  const inner = size - pad * 2;
  const fontSize = Math.round(inner * 0.42);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0b1220"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${Math.round(inner * 0.22)}" fill="#16a34a"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, Segoe UI, Roboto, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="#ffffff">$</text>
</svg>`;
};

async function main() {
  await mkdir(outDir, { recursive: true });
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error('Missing "sharp". Install it with: npm i -D sharp');
    process.exit(1);
  }
  const targets = [
    { name: "icon-192.png", size: 192, padded: false },
    { name: "icon-512.png", size: 512, padded: false },
    { name: "icon-maskable-512.png", size: 512, padded: true },
    { name: "apple-touch-icon.png", size: 180, padded: false },
  ];
  for (const t of targets) {
    const svg = Buffer.from(baseSvg(t.size, t.padded));
    const png = await sharp(svg).png().toBuffer();
    await writeFile(resolve(outDir, t.name), png);
    console.log("wrote", t.name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
