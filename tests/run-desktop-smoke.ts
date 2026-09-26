import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const projectRoot = process.cwd()
const electronBin = require('electron')

type SmokeResult = Record<string, any>

function runPhase(phase: string, userDataDir: string): Promise<{ code: number | null; results: SmokeResult[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBin, [path.join(projectRoot, 'desktop', 'main.cjs')], {
      cwd: projectRoot,
      env: {
        ...process.env,
        VBSE_SMOKE: phase,
        VBSE_USER_DATA_DIR: userDataDir,
        ELECTRON_ENABLE_LOGGING: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const results: SmokeResult[] = []
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      for (const line of stdout.split('\n')) {
        if (line.startsWith('SMOKE_RESULT ')) {
          try { results.push(JSON.parse(line.slice('SMOKE_RESULT '.length))) } catch { /* 忽略非 JSON 行 */ }
        }
      }
      stdout = ''
    })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`阶段 ${phase} 超时\nstdout 之外错误：${stderr.slice(-2000)}`))
    }, 60000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (results.length === 0 && code !== 0) {
        reject(new Error(`阶段 ${phase} 无结果退出 code=${code}\n${stderr.slice(-2000)}`))
        return
      }
      resolve({ code, results })
    })
  })
}

function findResult(results: SmokeResult[], phase: string): SmokeResult {
  const found = results.find((item) => item.phase === phase)
  assert.ok(found, `缺少 ${phase} 阶段结果`)
  return found
}

test('desktop app smoke: launch, storage bridge, offline page', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbse-smoke-'))
  try {
    // 1) 首次启动：基础检查
    const first = await runPhase('basic', userDataDir)
    const basic = findResult(first.results, 'basic')
    assert.equal(basic.ok, true, `basic 失败: ${JSON.stringify(basic)}`)
    assert.equal(basic.state.hasBridge, true)
    assert.equal(basic.state.buyerOptions, 24)
    assert.equal(basic.state.sellerOptions, 24)
    assert.ok(basic.state.qrDarkPixels > 100, '二维码未绘制')
    assert.equal(basic.state.disclaimerOnPage, true, '缺少教学标注')
    assert.equal(basic.state.localStorageUntouched, true, '桌面版不应写 localStorage')
    assert.ok(basic.state.storeFile.endsWith('invoice-store.json'), `数据文件异常: ${basic.state.storeFile}`)
    assert.ok(basic.state.storeFile.startsWith(userDataDir), `数据目录未使用临时目录: ${basic.state.storeFile}`)

    // 2) 写入历史与下一号码
    const write = await runPhase('write', userDataDir)
    const written = findResult(write.results, 'write')
    assert.equal(written.ok, true, `write 失败: ${JSON.stringify(written)}`)
    assert.ok(fs.existsSync(written.storeFile), '数据文件未生成')

    // 3) 重新启动进程（模拟关闭重开），数据仍在
    const read = await runPhase('read', userDataDir)
    const readBack = findResult(read.results, 'read')
    assert.equal(readBack.ok, true, `read 失败: ${JSON.stringify(readBack)}`)

    // 4) 打印能力：打印机列表 + PDF 渲染 + 打印媒体截图
    const print = await runPhase('print', userDataDir)
    const printed = findResult(print.results, 'print')
    assert.equal(printed.ok, true, `print 失败: ${JSON.stringify(printed)}`)
    assert.ok(printed.pdfBytes > 5000, 'PDF 输出过小')
    assert.ok(Array.isArray(printed.printers), '未获取打印机列表')
    assert.ok(fs.existsSync(printed.screenshotPath), '打印媒体截图缺失')
    // 记录信息供人工核对（不作为断言：环境可能没有 PDF 打印机）
    console.log('[smoke] printers =', JSON.stringify(printed.printers))
    console.log('[smoke] pdf =', printed.pdfPath, printed.pdfBytes, 'bytes')
    console.log('[smoke] print screenshot =', printed.screenshotPath)
    console.log('[smoke] store =', basic.state.storeFile)
  } finally {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch { /* 清理失败不阻塞 */ }
  }
})
