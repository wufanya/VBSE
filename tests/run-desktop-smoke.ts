import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  SAMPLE_LINES,
  buildInvoiceLine,
  formatMoney,
  toChineseUpperMoney,
} from '../miniprogram/utils/invoice.ts'

const require = createRequire(import.meta.url)
const projectRoot = process.cwd()
const electronBin = require('electron')

// 页面端渲染 ￥（全角）、invoice.ts 渲染 ¥（半角）——已知的显示层漂移，待用户裁决；
// 金额断言先归一符号，聚焦计算口径本身
const asOracleMoney = (text: string) => String(text).replace(/￥/g, '¥')

type SmokeResult = Record<string, any>

function runPhase(
  phase: string,
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ code: number | null; results: SmokeResult[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBin, [path.join(projectRoot, 'desktop', 'main.cjs')], {
      cwd: projectRoot,
      env: {
        ...process.env,
        VBSE_SMOKE: phase,
        VBSE_USER_DATA_DIR: userDataDir,
        ...extraEnv,
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

    // 4) 完整业务流：生成（号码自增）→ 历史回填 → 打印历史 → 清空历史
    const flow = await runPhase('flow', userDataDir)
    const flowResult = findResult(flow.results, 'flow')
    assert.equal(flowResult.ok, true, `flow 失败: ${JSON.stringify(flowResult)}`)
    console.log('[smoke] flow =', JSON.stringify(flowResult.state))

    // 4.5) 页面端业务口径断言：页面渲染结果必须与 miniprogram/utils/invoice.ts 基准一致
    //（两份实现并存，任何一端改了计算口径这里立即失败）
    const oracleLines = SAMPLE_LINES.map(buildInvoiceLine)
    const oracleAmount = oracleLines.reduce((sum, line) => sum + line.amount, 0)
    const oracleTax = oracleLines.reduce((sum, line) => sum + line.taxAmount, 0)
    const oracleGrand = oracleAmount + oracleTax
    const money = flowResult.state.money
    assert.equal(
      money.lineAmounts.join('|'),
      oracleLines.map((line) => formatMoney(line.amount)).join('|'),
      `页面明细金额与基准不一致: ${money.lineAmounts.join('|')}`,
    )
    assert.equal(
      money.lineTaxes.join('|'),
      oracleLines.map((line) => formatMoney(line.taxAmount)).join('|'),
      `页面明细税额与基准不一致: ${money.lineTaxes.join('|')}`,
    )
    assert.equal(asOracleMoney(money.totalAmount), formatMoney(oracleAmount, true), '合计与基准不一致')
    assert.equal(asOracleMoney(money.totalTax), formatMoney(oracleTax, true), '税额合计与基准不一致')
    assert.equal(asOracleMoney(money.grandTotal), formatMoney(oracleGrand, true), '价税合计与基准不一致')
    assert.equal(money.upperAmount, toChineseUpperMoney(oracleGrand), '大写金额与基准不一致')
    console.log('[smoke] money =', `${money.grandTotal} / ${money.upperAmount}（与 invoice.ts 基准一致）`)

    // 5) 导出 → 破坏表单 → 导入回放：JSON 往返 + 页面回填一致
    const exportFile = path.join(userDataDir, 'vbse-io-export.json')
    const io = await runPhase('io', userDataDir, {
      VBSE_SMOKE_EXPORT_FILE: exportFile,
      VBSE_SMOKE_IMPORT_FILE: exportFile,
    })
    const ioResult = findResult(io.results, 'io')
    assert.equal(ioResult.ok, true, `io 失败: ${JSON.stringify(ioResult)}`)
    const exportedRaw = fs.readFileSync(exportFile, 'utf8')
    assert.equal(ioResult.state.importedJson, exportedRaw, '导入内容与导出文件不一致')
    const exported = JSON.parse(exportedRaw)
    assert.equal(exported.buyerName, '华晨商贸有限公司', '导出数据购方异常')
    assert.equal(
      exported.lines.map((line: { amount: number }) => formatMoney(line.amount)).join('|'),
      oracleLines.map((line) => formatMoney(line.amount)).join('|'),
      '导出 JSON 的明细金额与基准不一致',
    )
    assert.equal(
      formatMoney(exported.grandTotal as number, true),
      formatMoney(oracleGrand, true),
      '导出 JSON 的价税合计与基准不一致',
    )
    assert.equal(ioResult.state.importedNumber, exported.invoiceNumber, '导入回填号码不一致')
    assert.equal(ioResult.state.importedBuyer, exported.buyerName, '导入回填购方不一致')
    assert.equal(asOracleMoney(ioResult.state.importedGrand), formatMoney(oracleGrand, true), '导入回填价税合计与基准不一致')
    assert.equal(ioResult.state.importedUpper, toChineseUpperMoney(oracleGrand), '导入回填大写与基准不一致')
    console.log('[smoke] io =', `导出/导入回放一致，价税合计 ${ioResult.state.importedGrand}`)

    // 5) 打印能力：打印机列表 + PDF 渲染 + 打印媒体截图
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

test('desktop smoke: corrupt/oversized store and illegal import resilience', async () => {
  const dirs: string[] = []
  const mk = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }
  try {
    // A) 损坏 store：应用必须正常启动，坏文件被隔离保留现场，随后写入回读正常
    const dirA = mk('vbse-bad-')
    fs.writeFileSync(path.join(dirA, 'invoice-store.json'), '{"version":1,"values":{"vbseInvoiceHistory":', 'utf8')
    const basicA = await runPhase('basic', dirA)
    assert.equal(findResult(basicA.results, 'basic').ok, true, '损坏 store 下应用未能正常启动')
    assert.ok(
      fs.readdirSync(dirA).some((f) => /^invoice-store\.corrupt-\d+\.json$/.test(f)),
      '损坏文件未被隔离保留',
    )
    assert.ok(!fs.existsSync(path.join(dirA, 'invoice-store.json')), '隔离后不应残留原文件')
    await runPhase('write', dirA)
    const readA = await runPhase('read', dirA)
    assert.equal(findResult(readA.results, 'read').ok, true, '损坏隔离后写入回读失败')

    // B) 超大 store（>5MB）：读取前尺寸检查拦截，不读入内存，同样隔离
    const dirB = mk('vbse-big-')
    fs.writeFileSync(path.join(dirB, 'invoice-store.json'), '{"values":"' + 'x'.repeat(6 * 1024 * 1024) + '"}', 'utf8')
    const basicB = await runPhase('basic', dirB)
    assert.equal(findResult(basicB.results, 'basic').ok, true, '超大 store 下应用未能正常启动')
    assert.ok(
      fs.readdirSync(dirB).some((f) => /^invoice-store\.corrupt-\d+\.json$/.test(f)),
      '超大文件未被隔离保留',
    )

    // C) 主文件损坏但 .bak 有效：自动从备份恢复，不丢数据
    const dirC = mk('vbse-bak-')
    fs.writeFileSync(path.join(dirC, 'invoice-store.json'), '{invalid', 'utf8')
    fs.writeFileSync(
      path.join(dirC, 'invoice-store.json.bak'),
      JSON.stringify({
        version: 1,
        values: {
          vbseInvoiceNextNumber: '26412000001304072777',
          vbseInvoiceHistory: JSON.stringify([{
            id: 'bak-1', invoiceNumber: '26412000001304072777', invoiceDate: '2026-09-27',
            buyerName: '备份购方', buyerTax: '000000000000000000',
            sellerName: '备份销方', sellerTax: '111111111111111111',
            drawer: 'bak', remark: '',
            lines: [{ name: '备份明细', unit: '项', qty: 1, price: 1, taxRate: 0.13, amount: 1, taxAmount: 0.13 }],
          }]),
        },
      }),
      'utf8',
    )
    const readC = await runPhase('read', dirC)
    assert.equal(findResult(readC.results, 'read').ok, true, '.bak 恢复失败')
    assert.ok(fs.existsSync(path.join(dirC, 'invoice-store.json')), '恢复后未重建主文件')

    // D) 非法导入：主进程拒绝超大文件；页面校验矩阵全部按预期拒绝/放行；失败不污染表单与历史
    const dirD = mk('vbse-badio-')
    const bigImport = path.join(dirD, 'bad-import.json')
    fs.writeFileSync(bigImport, 'x'.repeat(512 * 1024 + 1), 'utf8')
    const badio = await runPhase('badio', dirD, { VBSE_SMOKE_IMPORT_FILE: bigImport })
    const badResult = findResult(badio.results, 'badio')
    assert.equal(badResult.ok, true, `badio 失败: ${JSON.stringify(badResult)}`)
    assert.equal(badResult.state.oversizeRejected, true, '主进程未拒绝超大导入文件')
    assert.equal(badResult.state.before.formNumber, badResult.state.after.formNumber, '非法导入污染了表单')
    assert.equal(badResult.state.before.historyCount, badResult.state.after.historyCount, '非法导入污染了历史')
    console.log('[smoke] badio =', JSON.stringify(badResult.state.results.map((r: { title: string; got: string }) => `${r.title}:${r.got ? '拒绝' : '通过'}`)))
  } finally {
    for (const dir of dirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* 清理失败不阻塞 */ }
    }
  }
})
