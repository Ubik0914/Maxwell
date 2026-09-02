#!/usr/bin/env node
/**
 * Draws the app icons, so that `public/icons/` is a build product with
 * a source rather than four binaries nobody can edit.
 *
 * An installed app is its icon: it is what someone taps on a home
 * screen and what sits beside a notification, at sizes where a
 * screenshot of the graph would be a smudge. So the mark is the
 * smallest true picture of what Maxwell is — one node fanning into two
 * and back into one, a DAG you can still read at 48px.
 *
 * PNG rather than SVG because the platforms that matter here disagree
 * about SVG: iOS wants a PNG for the home screen, and a notification
 * icon on Android is a raster either way.
 *
 * Written with node:zlib and nothing else. A rasteriser would be a
 * dependency, a toolchain and a lockfile entry for four files that
 * change about never — and the drawing is two shapes, a disc and a
 * thick line, both of which are one distance function each.
 *
 *   node scripts/icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** The palette, straight out of globals.css. */
const BACKGROUND = [0x0a, 0x0d, 0x14];
const MARK = [0x22, 0xd3, 0xee];

/**
 * The graph itself, in a unit square: START on the left, two tasks that
 * can run at once, and the goal they both lead to.
 */
const NODES = [
  { x: 0.2, y: 0.5, r: 0.082 },
  { x: 0.5, y: 0.255, r: 0.082 },
  { x: 0.5, y: 0.745, r: 0.082 },
  { x: 0.8, y: 0.5, r: 0.082 },
];
const EDGES = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
];
const EDGE_WIDTH = 0.03;

/** Samples per pixel per axis. Three is enough to hide the stairs. */
const SUPERSAMPLE = 3;

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * How much of the mark covers this point, in [0, 1].
 *
 * `scale` shrinks the drawing towards the centre, which is all a
 * maskable icon needs: the platform may crop anything outside a circle
 * 80% across, so the graph is drawn inside that and the background
 * takes the crop.
 */
function coverage(x, y, scale) {
  const px = 0.5 + (x - 0.5) / scale;
  const py = 0.5 + (y - 0.5) / scale;

  for (const node of NODES) {
    if (Math.hypot(px - node.x, py - node.y) <= node.r) return true;
  }
  for (const [from, to] of EDGES) {
    const a = NODES[from];
    const b = NODES[to];
    if (distanceToSegment(px, py, a.x, a.y, b.x, b.y) <= EDGE_WIDTH / 2) return true;
  }
  return false;
}

function render(size, scale, transparent = false) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (column + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (row + (sy + 0.5) / SUPERSAMPLE) / size;
          if (coverage(x, y, scale)) hits += 1;
        }
      }

      const alpha = hits / (SUPERSAMPLE * SUPERSAMPLE);
      const at = (row * size + column) * 4;

      if (transparent) {
        // The mark alone, cut out of nothing: a badge is a stencil the
        // platform fills with its own colour, so only the alpha of this
        // one is ever read.
        pixels.set(MARK, at);
        pixels[at + 3] = Math.round(alpha * 0xff);
        continue;
      }

      for (let channel = 0; channel < 3; channel += 1) {
        pixels[at + channel] = Math.round(
          BACKGROUND[channel] * (1 - alpha) + MARK[channel] * alpha,
        );
      }
      // Opaque throughout: every other place these are shown puts them
      // on a surface whose colour is not ours to guess.
      pixels[at + 3] = 0xff;
    }
  }

  return pixels;
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte per scanline, and "none" every time: the image is
  // four flat colours and a deflate stream has no trouble with it.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) {
    raw[row * (size * 4 + 1)] = 0;
    pixels.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */

const FILES = [
  // What a browser installs with, and what a notification is stamped
  // with on Android.
  { name: "icon-192.png", size: 192, scale: 1 },
  { name: "icon-512.png", size: 512, scale: 1 },
  // Maskable: drawn small enough to survive whatever shape the platform
  // crops it to.
  { name: "icon-maskable-512.png", size: 512, scale: 0.72 },
  // iOS home screen. Same drawing; the corners are rounded for us.
  { name: "apple-touch-icon.png", size: 180, scale: 1 },
  // The monochrome stencil Android draws in the status bar. It is
  // filled from the notification's colour, so only the alpha survives —
  // which the flat one here gives it.
  { name: "badge-96.png", size: 96, scale: 0.86, transparent: true },
];

mkdirSync(OUT, { recursive: true });
for (const { name, size, scale, transparent } of FILES) {
  writeFileSync(join(OUT, name), png(size, render(size, scale, transparent)));
  process.stdout.write(`${name} ${size}x${size}\n`);
}
