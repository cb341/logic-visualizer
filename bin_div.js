import { mkdirSync, openSync, closeSync, writeSync } from "node:fs";
import { createDeflate } from "node:zlib";
import { once } from "node:events";

// Huge image config
const VALUE_BITS = 16;
const TABLE_SIZE = 1 << VALUE_BITS; // 65536
const PALETTE_NAME = "pallete_1";
const OUT_DIR = `./out/huge/${PALETTE_NAME}`;
const OUT_FILE = `${OUT_DIR}/l_nand.png`;
const CELL_SIZE = 1; // 1 pixel = 1 logical value

const firstPalette = [
  [6, 6, 6],
  [20, 20, 20],
  [34, 34, 34],
  [48, 48, 48],
  [64, 64, 64],
  [90, 90, 90],
  [120, 120, 120],
  [160, 160, 160],
];

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(type, payload) {
  let crc = 0xffffffff;

  for (let i = 0; i < type.length; i++) {
    crc = CRC_TABLE[(crc ^ type.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }

  for (let i = 0; i < payload.length; i++) {
    crc = CRC_TABLE[(crc ^ payload[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeSyncAll(fd, buffer) {
  let written = 0;
  while (written < buffer.length) {
    written += writeSync(fd, buffer, written, buffer.length - written);
  }
}

function writeChunk(fd, type, payload) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(payload.length, 0);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(type, payload), 0);

  writeSyncAll(fd, length);
  writeSyncAll(fd, typeBuf);
  writeSyncAll(fd, payload);
  writeSyncAll(fd, crc);
}

function buildColorTable() {
  const table = new Uint8Array(TABLE_SIZE * 4);
  const contribution = 255 / 16;

  for (let value = 0; value < TABLE_SIZE; value++) {
    let r = 0;
    let g = 0;
    let b = 0;

    for (let i = 0; i < 16; i++) {
      if ((value & (1 << i)) === 0) continue;
      const c = firstPalette[i % 8];
      r += (c[0] / 255) * contribution;
      g += (c[1] / 255) * contribution;
      b += (c[2] / 255) * contribution;
    }

    const i = value * 4;
    table[i] = Math.min(255, Math.round(r));
    table[i + 1] = Math.min(255, Math.round(g));
    table[i + 2] = Math.min(255, Math.round(b));
    table[i + 3] = 255;
  }

  return table;
}

function buildIHDR() {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(TABLE_SIZE, 0); // width
  ihdr.writeUInt32BE(TABLE_SIZE, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return ihdr;
}

async function writeHugeNand() {
  mkdirSync(OUT_DIR, { recursive: true });
  const fd = openSync(OUT_FILE, "w");
  const colorTable = buildColorTable();
  const row = Buffer.allocUnsafe(1 + TABLE_SIZE * 4);
  const deflate = createDeflate({ level: 9 });

  const done = new Promise((resolve, reject) => {
    const handleError = (error) => reject(error);
    deflate.once("error", handleError);
    deflate.once("end", resolve);
    deflate.on("data", (chunk) => {
      writeChunk(fd, "IDAT", chunk);
    });
  });

  writeSyncAll(fd, pngSignature);
  writeChunk(fd, "IHDR", buildIHDR());

  for (let y = 0; y < TABLE_SIZE; y++) {
    row[0] = 0;
    for (let x = 0, p = 1; x < TABLE_SIZE; x++, p += 4) {
      const value = (~(x & y)) & 0xffff;
      const source = value * 4;
      row[p] = colorTable[source];
      row[p + 1] = colorTable[source + 1];
      row[p + 2] = colorTable[source + 2];
      row[p + 3] = 255;
    }

    const ok = deflate.write(Buffer.from(row));
    if (!ok) {
      await once(deflate, "drain");
    }
  }

  deflate.end();
  await done;
  writeChunk(fd, "IEND", Buffer.allocUnsafe(0));
  closeSync(fd);
}

if (CELL_SIZE !== 1) {
  throw new Error("This script now supports only CELL_SIZE = 1 for huge generation.");
}

await writeHugeNand();
