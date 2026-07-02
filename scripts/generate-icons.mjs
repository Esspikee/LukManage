// One-off generator for PWA icons. Renders brand-blue app icons
// (Money Manager "$") into public/icons. The generated PNGs are committed,
// so this only needs re-running if the icon design changes.
// Requires sharp (not a project dependency): pnpm add -D sharp && node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/icons");

const BG = "#171721";
const ACCENT = "#FFC212";

// Rounded-square icon (for maskable=false / standard use).
const rounded = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${BG}"/>
  <text x="256" y="256" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="300"
    font-weight="800" fill="${ACCENT}" text-anchor="middle" dominant-baseline="central">$</text>
</svg>`;

// Full-bleed icon with the glyph inside the safe zone (for maskable=true).
const maskable = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <text x="256" y="256" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="230"
    font-weight="800" fill="${ACCENT}" text-anchor="middle" dominant-baseline="central">$</text>
</svg>`;

async function render(svg, size, name) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(resolve(outDir, name), png);
  console.log("wrote", name);
}

await mkdir(outDir, { recursive: true });
await render(rounded(192), 192, "icon-192.png");
await render(rounded(512), 512, "icon-512.png");
await render(maskable(512), 512, "icon-maskable-512.png");
await render(rounded(180), 180, "apple-touch-icon.png");
console.log("done");
