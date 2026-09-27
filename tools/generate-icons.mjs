// 从 desktop/assets/icon-source.png 生成 desktop/assets/icon.ico 与 icon.png
// 用法: npm run icons
// 流程: 调 tools/resize-icon.ps1（System.Drawing 高质量缩放，导出 BGRA 原始像素）
//       → 本脚本组装标准 ICO（16–128 为 32bpp BMP 条目，256 内嵌 PNG 条目）
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const assetsDir = path.resolve(import.meta.dirname, '..', 'desktop', 'assets')
const sourcePath = path.join(assetsDir, 'icon-source.png')
const icoPath = path.join(assetsDir, 'icon.ico')
const pngPath = path.join(assetsDir, 'icon.png')
const bmpSizes = [16, 24, 32, 48, 64, 128]
const pngEntrySize = 256

if (!fs.existsSync(sourcePath)) throw new Error(`缺少源图: ${sourcePath}`)

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbse-icons-'))
try {
  execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.resolve(import.meta.dirname, 'resize-icon.ps1'),
    '-Source', sourcePath, '-OutDir', tmpDir,
  ], { stdio: 'inherit' })

  const entries = bmpSizes.map((size) => {
    const raw = fs.readFileSync(path.join(tmpDir, `raw-${size}.bin`))
    if (raw.length !== size * size * 4) throw new Error(`raw-${size}.bin 尺寸异常: ${raw.length}`)
    // 顶行到底行 → BMP 要求自底向上
    const stride = size * 4
    const xor = Buffer.alloc(raw.length)
    for (let row = 0; row < size; row++) {
      raw.copy(xor, (size - 1 - row) * stride, row * stride, (row + 1) * stride)
    }
    // AND 掩码（1bpp，每行 4 字节对齐；32bpp 下不透明度由 alpha 表达，掩码全 0）
    const maskRow = Math.ceil(size / 32) * 4
    const and = Buffer.alloc(maskRow * size)

    const header = Buffer.alloc(40)
    header.writeUInt32LE(40, 0)           // biSize
    header.writeInt32LE(size, 4)          // biWidth
    header.writeInt32LE(size * 2, 8)      // biHeight = XOR + AND
    header.writeUInt16LE(1, 12)           // biPlanes
    header.writeUInt16LE(32, 14)          // biBitCount
    header.writeUInt32LE(0, 16)           // biCompression = BI_RGB
    header.writeUInt32LE(xor.length + and.length, 20) // biSizeImage

    return { size, data: Buffer.concat([header, xor, and]) }
  })

  const png256 = fs.readFileSync(path.join(tmpDir, 'png-256.png'))
  entries.push({ size: pngEntrySize, data: png256 })
  entries.sort((a, b) => a.size - b.size)

  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)               // reserved
  dir.writeUInt16LE(1, 2)               // type = icon
  dir.writeUInt16LE(entries.length, 4)
  const dirEntries = []
  let offset = 6 + 16 * entries.length
  for (const e of entries) {
    const de = Buffer.alloc(16)
    const dim = e.size >= 256 ? 0 : e.size
    de.writeUInt8(dim, 0)
    de.writeUInt8(dim, 1)
    de.writeUInt16LE(1, 4)              // planes
    de.writeUInt16LE(32, 6)             // bit count
    de.writeUInt32LE(e.data.length, 8)
    de.writeUInt32LE(offset, 12)
    dirEntries.push(de)
    offset += e.data.length
  }

  fs.writeFileSync(icoPath, Buffer.concat([dir, ...dirEntries, ...entries.map((e) => e.data)]))
  fs.writeFileSync(pngPath, png256)
  console.log(`已生成 ${icoPath} 与 ${pngPath}（源图: ${sourcePath}）`)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
