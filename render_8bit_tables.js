import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const bits = 8;
const size = 1 << bits;
const mask = size - 1;
const outputDir = "out/8bit-tables";
const operators = ["NAND", "AND", "NOR", "OR", "XOR", "ADD", "MUL", "DIV", "LSHFT", "RSHFT", "CMP"];
const palettes = ["Vibrant", "Monochrome", "MSB Invert", "Nibble RGB"];
const vibrant = [
  [255, 32, 32], [255, 96, 0], [255, 168, 24], [255, 255, 64],
  [255, 96, 192], [255, 32, 128], [192, 0, 255], [255, 255, 255],
];

function operate(a, b, op) {
  switch (op) {
    case 0: return ~(a & b) & mask;
    case 1: return a & b;
    case 2: return ~(a | b) & mask;
    case 3: return a | b;
    case 4: return a ^ b;
    case 5: return (a + b) & mask;
    case 6: return (a * b) & mask;
    case 7: return b === 0 ? 0 : Math.floor(a / b) & mask;
    case 8: return (a << (b & 7)) & mask;
    case 9: return a >>> (b & 7);
    case 10: return (a === b ? 1 : 0) | (a < b ? 2 : 0) | (a > b ? 4 : 0);
    default: return 0;
  }
}

// Mirrors index.html's bitLayer() and valuePixelRgb() for bits = 8.
function pixelColour(value, palette) {
  const rgb = [0, 0, 0];
  const negative = (value & 128) !== 0;
  for (let bit = 0; bit < bits; bit++) {
    if (((value >>> bit) & 1) === 0) continue;
    let colour;
    if (palette === 1) {
      const level = (bit + 1) / 8;
      colour = [level, level, level];
    } else if (palette === 3) {
      const level = ((bit % 4) + 1) / 4;
      colour = bit < 4 ? [level, 0, 0] : [0, 0, level];
    } else {
      colour = vibrant[bit].map((channel) => channel / 255);
      if (palette === 2 && negative) colour = colour.map((channel) => 1 - channel);
    }
    rgb[0] += colour[0] / bits;
    rgb[1] += colour[1] / bits;
    rgb[2] += colour[2] / bits;
  }
  return rgb.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255));
}

mkdirSync(outputDir, { recursive: true });

for (let op = 0; op < operators.length; op++) {
  for (let palette = 0; palette < palettes.length; palette++) {
    const png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) {
      const b = mask - y; // identical orientation to downloadFullPng() in index.html
      for (let a = 0; a < size; a++) {
        const [r, g, blue] = pixelColour(operate(a, b, op), palette);
        const offset = (y * size + a) * 4;
        png.data[offset] = r;
        png.data[offset + 1] = g;
        png.data[offset + 2] = blue;
        png.data[offset + 3] = 255;
      }
    }
    const filename = `${operators[op].toLowerCase()}-palette-${palette}.png`;
    writeFileSync(`${outputDir}/${filename}`, PNG.sync.write(png));
  }
}

const cells = operators.map((operator) => `
      <tr><th scope="row">${operator}</th>${palettes.map((palette, index) => {
  const src = `${outputDir}/${operator.toLowerCase()}-palette-${index}.png`;
  const viewer = `index.html?theme=${index}&image=8&op=${operator}`;
  return `<td><a href="${viewer}"><img src="${src}" alt="${operator}, ${palette}" loading="lazy"></a></td>`;
}).join("")}</tr>`).join("");

writeFileSync("table.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>8-bit operation tables</title>
<style>
  :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  body { margin: 0; padding: 24px; background: #111; color: #e8e8e8; }
  h1 { font: 600 22px/1.2 system-ui, sans-serif; margin: 0 0 8px; }
  p { color: #a8a8a8; margin: 0 0 24px; }
  table { border-collapse: separate; border-spacing: 10px; margin: 0 auto; }
  th { color: #fff; font-size: 14px; text-align: center; white-space: nowrap; }
  th[scope=row] { text-align: right; }
  td { padding: 0; background: #000; line-height: 0; }
  img { display: block; width: 256px; height: 256px; image-rendering: pixelated; }
  a:focus-visible { outline: 3px solid #7cf; outline-offset: 2px; }
  @media (max-width: 1200px) { body { padding: 12px; } table { border-spacing: 5px; } img { width: 180px; height: 180px; } }
</style></head><body>
<h1>8-bit operation tables</h1><p>Rows are operators; columns are palettes. Each image is a direct 256 × 256 PNG render (A increases left→right, B increases bottom→top). Click an image to open that view in the visualizer. <a href="https://cb341.dev/blog/shape-of-logic/">Read the article.</a></p>
<table><thead><tr><th></th>${palettes.map((palette) => `<th scope="col">${palette}</th>`).join("")}</tr></thead><tbody>${cells}
</tbody></table></body></html>\n`);

console.log(`Wrote ${operators.length * palettes.length} PNGs to ${outputDir} and table.html.`);
