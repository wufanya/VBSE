#!/usr/bin/env node
/**
 * 生成【临时占位】应用图标（明确非正式品牌素材，发布前必须替换）。
 * 输出：desktop/assets/icon.png（256x256 预览）与 desktop/assets/icon.ico（16~256 多尺寸 BMP 条目）。
 * 纯 Node 实现，无第三方依赖。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'desktop', 'assets')
fs.mkdirSync(outDir, { recursive: true })

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256]

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4)
  const u = size / 256
  const set = (x, y, [r, g, b, a = 255]) => {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
  }
  const rect = (x0, y0, w, h, c) => {
    for (let y = y0 * u; y < (y0 + h) * u; y++) {
      for (let x = x0 * u; x < (x0 + w) * u; x++) set(x, y, c)
    }
  }
  const circle = (cx, cy, r, c) => {
    for (let y = (cy - r) * u; y <= (cy + r) * u; y++) {
      for (let x = (cx - r) * u; x <= (cx + r) * u; x++) {
        const dx = x - cx * u
        const dy = y - cy * u
        if (dx * dx + dy * dy <= (r * u) * (r * u)) set(x, y, c)
      }
    }
  }
  // 蓝色底
  rect(0, 0, 256, 256, [22, 93, 255])
  // 白色票面
  rect(34, 26, 188, 204, [255, 253, 248])
  // 票头红条
  rect(34, 26, 188, 26, [180, 35, 24])
  // 明细行
  const lineColor = [148, 163, 184]
  for (const y of [74, 100, 126, 152]) rect(56, y, 144, 10, lineColor)
  // 合计行
  rect(56, 182, 90, 12, [31, 35, 40])
  // 红色教学圆章
  circle(180, 196, 40, [180, 35, 24])
  circle(180, 196, 31, [255, 253, 248])
  circle(180, 196, 24, [180, 35, 24])
  circle(180, 196, 9, [255, 253, 248])
  return px
}

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- ICO 编码（BMP 条目，最大兼容） ----
function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  const bodies = []
  let offset = 6 + 16 * entries.length
  entries.forEach((entry, index) => {
    const { size, rgba } = entry
    const andRowBytes = ((size + 31) >> 5) << 2
    const andMask = Buffer.alloc(andRowBytes * size) // 全 0：32 位 alpha 已定义
    const xor = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      const srcRow = y * size * 4
      const dstRow = (size - 1 - y) * size * 4
      for (let x = 0; x < size; x++) {
        const s = srcRow + x * 4
        xor[dstRow + x * 4 + 0] = rgba[s + 2] // B
        xor[dstRow + x * 4 + 1] = rgba[s + 1] // G
        xor[dstRow + x * 4 + 2] = rgba[s + 0] // R
        xor[dstRow + x * 4 + 3] = rgba[s + 3] // A
      }
    }
    const info = Buffer.alloc(40)
    info.writeUInt32LE(40, 0)
    info.writeInt32LE(size, 4)
    info.writeInt32LE(size * 2, 8)
    info.writeUInt16LE(1, 12)
    info.writeUInt16LE(32, 14)
    info.writeUInt32LE(0, 16)
    info.writeUInt32LE(xor.length + andMask.length, 20)
    const body = Buffer.concat([info, xor, andMask])
    bodies.push(body)

    const e = dir.subarray(index * 16, index * 16 + 16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(body.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += body.length
  })
  return Buffer.concat([header, dir, ...bodies])
}

const entries = ICON_SIZES.map((size) => ({ size, rgba: drawIcon(size) }))
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(entries))
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(256, drawIcon(256).buffer ? new Uint8Array(drawIcon(256).buffer) : drawIcon(256)))
console.log('temp icons written to', outDir)
