/**
 * THE ICONS A PHONE ACTUALLY USES.
 *
 *   npm i --no-save sharp && node scripts/build-icons.mjs
 *
 * The manifest shipped one SVG and nothing else. iOS does not use SVG for a
 * home-screen icon, so anyone adding this to their home screen on an iPhone —
 * which is the whole point of shipping a manifest — got whatever the system
 * decided to substitute. Android's launcher additionally masks icons into its
 * own shape, and an icon that is not declared `maskable` gets letterboxed
 * inside that shape rather than filling it.
 *
 * WHY THE RASTER ART IS NOT A COPY OF icon.svg. That file draws its centrepiece
 * with an emoji glyph (🎬), which resolves against whatever emoji font the
 * viewer happens to have. In a browser that is fine. In a rasteriser with no
 * system emoji font it is a box, and a box is what would have been baked into
 * every PNG and shipped forever. So the raster art is the same palette and the
 * same two-cards motif drawn in pure shapes, which depends on nothing.
 *
 * `icon.svg` is left exactly as it is: it is served to browsers that take an
 * SVG favicon, where the emoji renders correctly.
 *
 * The maskable variant keeps everything important inside the middle 80%, which
 * is the safe zone every launcher shape is guaranteed to show.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const INK = "#0b0b13";
const CARD_BACK = "#1c1c2b";
const GOLD_A = "#f5b942";
const GOLD_B = "#d97a1b";

/**
 * @param {number} pad  fraction of the canvas kept clear at every edge.
 *   0.06 for a normal icon — just enough that the art is not flush to the
 *   corner. 0.20 for maskable, which is the safe-zone requirement.
 * @param {boolean} rounded  false for maskable: the launcher supplies the
 *   shape, and a rounded square inside a circle shows as a visible seam.
 */
function art(pad, rounded) {
  const S = 512;
  const inner = S * (1 - pad * 2);
  const o = S * pad;
  /* the two cards, sized off the inner box so padding actually moves them */
  const w = inner * 0.43;
  const h = inner * 0.625;
  const cx = o + inner / 2;
  const cy = o + inner / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD_A}"/>
      <stop offset="1" stop-color="${GOLD_B}"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" ${rounded ? `rx="${S * 0.22}"` : ""} fill="${INK}"/>
  <rect x="${cx - w * 0.95}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * 0.13}"
        fill="url(#g)" transform="rotate(-9 ${cx} ${cy})"/>
  <rect x="${cx - w * 0.05}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * 0.13}"
        fill="${CARD_BACK}" stroke="${GOLD_A}" stroke-width="${S * 0.022}"
        transform="rotate(7 ${cx} ${cy})"/>
</svg>`);
}

/* flattened onto the ink background: a transparent icon picks up whatever the
   launcher paints behind it, which is how a dark icon ends up on a dark tile */
const png = (svg, size) =>
  sharp(svg).resize(size, size).flatten({ background: INK }).png({ compressionLevel: 9 });

const outputs = [
  ["public/icon-192.png", art(0.06, true), 192],
  ["public/icon-512.png", art(0.06, true), 512],
  ["public/icon-maskable-512.png", art(0.2, false), 512],
  /* Apple ignores the manifest and looks for this at a fixed name; it also
     ignores transparency and squares the corners itself */
  ["public/apple-touch-icon.png", art(0.06, true), 180],
  ["public/favicon-32.png", art(0.04, true), 32],
];

for (const [path, svg, size] of outputs) {
  const buf = await png(svg, size).toBuffer();
  writeFileSync(path, buf);
  console.log(`  ${String(size).padStart(3)}px  ${(buf.length / 1024).toFixed(1).padStart(6)} KB  ${path}`);
}
console.log(`\n✅ ${outputs.length} icons`);
