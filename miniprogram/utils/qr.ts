type Canvas2DContext = WechatMiniprogram.CanvasContext

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1)
  }
}

function bitsToByte(bits: number[]): number {
  return bits.reduce((value, bit) => (value << 1) | bit, 0)
}

function asciiBytes(text: string): number[] {
  const safe = String(text).replace(/[^\x20-\x7e]/g, '?')
  return Array.from(safe).map((ch) => ch.charCodeAt(0))
}

function drawFinder(matrix: boolean[][], reserved: boolean[][], x: number, y: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx
      const yy = y + dy
      if (xx < 0 || yy < 0 || xx >= matrix.length || yy >= matrix.length) {
        continue
      }
      const on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4))
      matrix[yy][xx] = on
      reserved[yy][xx] = true
    }
  }
}

function drawTiming(matrix: boolean[][], reserved: boolean[][], size: number): void {
  for (let i = 8; i < size - 8; i += 1) {
    const on = i % 2 === 0
    matrix[6][i] = on
    matrix[i][6] = on
    reserved[6][i] = true
    reserved[i][6] = true
  }
}

function drawAlignment(matrix: boolean[][], reserved: boolean[][], cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy))
      matrix[cy + dy][cx + dx] = dist !== 1
      reserved[cy + dy][cx + dx] = true
    }
  }
}

function reserveFormat(reserved: boolean[][], size: number): void {
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true
      reserved[i][8] = true
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[size - 1 - i][8] = true
    reserved[8][size - 1 - i] = true
  }
  reserved[8][size - 8] = true
}

function placeData(matrix: boolean[][], reserved: boolean[][], codewords: number[], size: number): void {
  const bits: number[] = []
  codewords.forEach((byte) => appendBits(bits, byte, 8))
  let bitIndex = 0
  let upward = true
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) {
      x -= 1
    }
    for (let yStep = 0; yStep < size; yStep += 1) {
      const y = upward ? size - 1 - yStep : yStep
      for (let dx = 0; dx < 2; dx += 1) {
        const xx = x - dx
        if (reserved[y][xx]) {
          continue
        }
        let bit = bitIndex < bits.length ? bits[bitIndex] : 0
        bitIndex += 1
        if ((xx + y) % 2 === 0) {
          bit ^= 1
        }
        matrix[y][xx] = bit === 1
      }
    }
    upward = !upward
  }
}

function drawFormatBits(matrix: boolean[][], size: number, eccLevel: number, mask: number): void {
  const bits = getFormatBits((eccLevel << 3) | mask)
  for (let i = 0; i <= 5; i += 1) matrix[8][i] = ((bits >> i) & 1) !== 0
  matrix[8][7] = ((bits >> 6) & 1) !== 0
  matrix[8][8] = ((bits >> 7) & 1) !== 0
  matrix[7][8] = ((bits >> 8) & 1) !== 0
  for (let i = 9; i < 15; i += 1) matrix[14 - i][8] = ((bits >> i) & 1) !== 0
  for (let i = 0; i < 8; i += 1) matrix[size - 1 - i][8] = ((bits >> i) & 1) !== 0
  for (let i = 8; i < 15; i += 1) matrix[8][size - 15 + i] = ((bits >> i) & 1) !== 0
}

function getFormatBits(data: number): number {
  let value = data << 10
  const generator = 0x537
  for (let i = 14; i >= 10; i -= 1) {
    if (((value >> i) & 1) !== 0) {
      value ^= generator << (i - 10)
    }
  }
  return ((data << 10) | value) ^ 0x5412
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree)
  const result = Array(degree).fill(0) as number[]
  data.forEach((byte) => {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(generator[i], factor)
    }
  })
  return result
}

function reedSolomonGenerator(degree: number): number[] {
  let result = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = Array(result.length + 1).fill(0) as number[]
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= gfMultiply(result[j], 1)
      next[j + 1] ^= gfMultiply(result[j], gfPow(2, i))
    }
    result = next
  }
  return result.slice(1)
}

function gfPow(x: number, power: number): number {
  let result = 1
  for (let i = 0; i < power; i += 1) {
    result = gfMultiply(result, x)
  }
  return result
}

function gfMultiply(x: number, y: number): number {
  let a = x
  let b = y
  let result = 0
  while (b > 0) {
    if (b & 1) result ^= a
    a <<= 1
    if (a & 0x100) a ^= 0x11d
    b >>= 1
  }
  return result
}

export function makeQrMatrix(text: string): boolean[][] {
  const version = 4
  const size = 33
  const dataCodewords = 80
  const eccCodewords = 20
  const bytes = asciiBytes(text || 'VBSE').slice(0, 62)
  const bits: number[] = []
  appendBits(bits, 0x4, 4)
  appendBits(bits, bytes.length, 8)
  bytes.forEach((byte) => appendBits(bits, byte, 8))
  const capacityBits = dataCodewords * 8
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8) {
    bits.push(0)
  }
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bitsToByte(bits.slice(i, i + 8)))
  }
  for (let pad = 0xec; data.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) {
    data.push(pad)
  }
  const ecc = reedSolomonRemainder(data, eccCodewords)
  const codewords = data.concat(ecc)
  const matrix = Array.from({ length: size }, () => Array(size).fill(false)) as boolean[][]
  const reserved = Array.from({ length: size }, () => Array(size).fill(false)) as boolean[][]
  drawFinder(matrix, reserved, 0, 0)
  drawFinder(matrix, reserved, size - 7, 0)
  drawFinder(matrix, reserved, 0, size - 7)
  drawTiming(matrix, reserved, size)
  drawAlignment(matrix, reserved, 26, 26)
  reserveFormat(reserved, size)
  matrix[4 * version + 9][8] = true
  reserved[4 * version + 9][8] = true
  placeData(matrix, reserved, codewords, size)
  drawFormatBits(matrix, size, 1, 0)
  return matrix
}

export function drawQrMatrix(
  context: Canvas2DContext,
  matrix: boolean[][],
  size: number,
  x = 0,
  y = 0
): void {
  const quiet = 4
  const modules = matrix.length + quiet * 2
  const scale = Math.max(1, Math.floor(size / modules))
  const realSize = modules * scale
  const offset = Math.floor((size - realSize) / 2)
  context.fillStyle = '#ffffff'
  context.fillRect(x, y, size, size)
  context.fillStyle = '#000000'
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (matrix[row][col]) {
        context.fillRect(x + offset + (col + quiet) * scale, y + offset + (row + quiet) * scale, scale, scale)
      }
    }
  }
}

export function drawQrToCanvas(canvas: WechatMiniprogram.Canvas, text: string, size: number): void {
  const context = canvas.getContext('2d') as Canvas2DContext
  drawQrMatrix(context, makeQrMatrix(text || 'VBSE'), size)
}
