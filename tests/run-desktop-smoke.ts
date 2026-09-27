import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  COMPANY_OPTIONS,
  DEFAULT_INVOICE_NUMBER,
  SAMPLE_LINES,
  buildInvoiceLine,
  formatMoney,
  incrementDecimalString,
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

// 网页版零变化基线：2026-09-27 于 Electron(Chromium) 无 vbse-desktop 类、1440×940 视口实测。
// 这是共享 HTML 的金标准：任何改动若导致下列断言失败，即网页版渲染或行为发生变化——
// 要么回退改动，要么有意识地更新此基线并在 CHANGELOG 中说明原因。
const WEB_BASELINE = {
  htmlClassName: '',
  bodyFont: '"Microsoft YaHei", "PingFang SC", sans-serif',
  layoutColumns: '720px 666.667px',
  invoicePosition: 'relative',
  previewPosition: 'static',
  previewTop: 'auto',
  sealTop: '38px',
  sealLeft: '563.333px',
  ioBtnDisplay: 'none',
  historyDeleteDisplay: 'none',
  formPanelHeight: 1339,
  previewPanelHeight: 1015,
  stageMinHeight: '552.852px',
} as const

// 网页版打印态基线：2026-09-27 于 print 媒体仿真实测（1440×940，无 vbse-desktop 类）
const WEB_PRINT_BASELINE = {
  topbarDisplay: 'none',
  ioBtnDisplay: 'none',
  invoicePosition: 'relative',
  sealTop: '25px',
  sealLeft: '516px',
  grandTotalText: '￥3,059.38',
  goodsRowCount: 8,
} as const

test('web version zero-change regression (no preload, 1440x940)', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbse-web-'))
  try {
    const web = await runPhase('web', userDataDir)
    const webResult = findResult(web.results, 'web')
    // golden 首次生成属于置红动作：必须人工核对图像并提交后，重跑才进入比对模式。
    // 失败消息用紧凑诊断对象（CI 注解有 1KB 截断，完整 JSON 装不下）
    if (!webResult.ok) {
      const st = webResult.state || {}
      const diag = JSON.stringify({
        error: webResult.error,
        layout: st.layout,
        printState: webResult.printState,
        diff: webResult.diff,
        business: st.business,
      })
      assert.equal(webResult.ok, true, `web 失败: ${diag}`)
    }
    assert.equal(webResult.ok, true, `web 失败: ${JSON.stringify(webResult)}`)
    const s = webResult.state
    // —— A. 页面身份与教学安全标识 ——
    assert.equal(s.identity.htmlClassName, '', '网页版渲染不应带 vbse-desktop 类')
    assert.equal(s.identity.hasBridge, false, '网页版不应有 vbseStorage 桥')
    assert.equal(s.identity.hasIO, false, '网页版不应有 vbseIO 桥')
    assert.equal(s.identity.disclaimerOnPage, true, '票面教学声明缺失')
    assert.equal(s.identity.teachingBadge, true, '顶栏教学徽标缺失')
    // —— E/F. 桌面专属入口实际不可见（computed style，而非仅 DOM 存在）——
    assert.equal(s.layout.ioBtnDisplay, 'none', '导出/导入按钮在网页版可见（桌面入口泄漏）')
    assert.equal(s.layout.historyDeleteDisplay, 'none', '单条删除按钮在网页版可见（桌面入口泄漏）')
    // —— B. 企业预设（数量、名单 fixture、典型企业回填）——
    assert.equal(s.companies.buyerOptions, COMPANY_OPTIONS.length + 1, '企业下拉数量变化（23 家 + 手动输入）')
    assert.equal(
      s.companies.optionsText,
      COMPANY_OPTIONS.map((c) => c.name).join('|') + '|手动输入企业',
      '企业名单与小程序基准不一致',
    )
    assert.equal(s.companyFill.name, COMPANY_OPTIONS[7].name, '选择企业后名称未按当前行为回填')
    assert.equal(s.companyFill.tax, COMPANY_OPTIONS[7].taxId, '选择企业后税号未按当前行为回填')
    // —— C. 发票基础流程（金额/税额/合计/价税合计/大写，与 invoice.ts 基准比对，未重新实现算法）——
    const webLines = SAMPLE_LINES.map(buildInvoiceLine)
    const webAmount = webLines.reduce((sum, l) => sum + l.amount, 0)
    const webTax = webLines.reduce((sum, l) => sum + l.taxAmount, 0)
    const webGrand = webAmount + webTax
    assert.equal(s.money.lineAmounts.join('|'), webLines.map((l) => formatMoney(l.amount)).join('|'), '明细金额与基准不一致')
    assert.equal(s.money.lineTaxes.join('|'), webLines.map((l) => formatMoney(l.taxAmount)).join('|'), '明细税额与基准不一致')
    assert.equal(asOracleMoney(s.money.totalAmount), formatMoney(webAmount, true), '合计与基准不一致')
    assert.equal(asOracleMoney(s.money.totalTax), formatMoney(webTax, true), '税额合计与基准不一致')
    assert.equal(asOracleMoney(s.money.grandTotal), formatMoney(webGrand, true), '价税合计与基准不一致')
    assert.equal(s.money.upperAmount.endsWith(toChineseUpperMoney(webGrand)), true, `大写金额变化: ${s.money.upperAmount}`)
    // —— D. 发票号码（初始→生成递增→历史回填不异常）——
    assert.equal(s.business.nextNumber, incrementDecimalString(DEFAULT_INVOICE_NUMBER), '生成后号码未按当前行为递增')
    assert.equal(s.historyRestore.formNumber, s.historyRestore.previewNumber, '历史回填后表单号码与票面不一致')
    assert.equal(s.historyRestore.buyerName, COMPANY_OPTIONS[7].name, '历史回填购方异常')
    // —— E. 历史记录 ——
    assert.equal(s.business.historyCountAfter, 1, '网页版历史写入异常')
    assert.equal(s.business.historyCardCount, 1, '网页版历史渲染异常')
    // —— F. localStorage 存储路径（网页版必须写 localStorage，与桌面版断言互为镜像）——
    assert.equal(s.business.localStorageHistory, true, '网页版应写 localStorage 历史')
    assert.equal(s.business.localStorageNext, true, '网页版应写 localStorage 号码')
    // —— 布局基线：样式/定位逐项比对 ——
    // 像素派生值（栅格列宽/监制章 left 为 50% 求解结果）受滚动条与亚像素取整影响，
    // 允许 ±2px；语义值（字体栈/定位方式/top:auto）必须精确一致
    const pxValues = (v: string) => (v.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    const assertPxClose = (label: string, actual: string, expected: string) => {
      const a = pxValues(actual)
      const e = pxValues(expected)
      assert.equal(a.length, e.length, `${label} 维度数变化: ${actual} vs ${expected}`)
      a.forEach((v, i) => assert.ok(Math.abs(v - e[i]) <= 2, `${label} 变化: ${actual} vs ${expected}（容差 ±2px）`))
    }
    assert.equal(s.layout.bodyFont, WEB_BASELINE.bodyFont, '正文字体栈变化')
    assert.equal(s.layout.invoicePosition, WEB_BASELINE.invoicePosition, '发票定位方式变化')
    assert.equal(s.layout.previewPosition, WEB_BASELINE.previewPosition, '预览面板定位变化')
    assert.equal(s.layout.previewTop, WEB_BASELINE.previewTop, '预览面板 top 变化')
    assert.equal(s.layout.sealTop, WEB_BASELINE.sealTop, '监制章 top 变化')
    assertPxClose('栅格列', s.layout.layoutColumns, WEB_BASELINE.layoutColumns)
    assertPxClose('监制章 left', s.layout.sealLeft, WEB_BASELINE.sealLeft)
    // 几何尺寸使用 ±2px 容差：亚像素取整与字体渲染跨环境存在 ≤2px 级抖动；
    // 桌面样式泄漏会造成数十~数百 px 级差异，2px 容差不会掩盖真回归
    const layoutTolerance2Px: Array<[string, number]> = [
      ['formPanelHeight', WEB_BASELINE.formPanelHeight],
      ['previewPanelHeight', WEB_BASELINE.previewPanelHeight],
    ]
    for (const [key, expected] of layoutTolerance2Px) {
      const actual = (s.layout as Record<string, number>)[key]
      assert.ok(Math.abs(actual - expected) <= 2, `网页版 ${key} 变化: ${actual} vs 基线 ${expected}（容差 ±2px）`)
    }
    assert.ok(
      Math.abs(parseFloat(s.layout.stageMinHeight) - parseFloat(WEB_BASELINE.stageMinHeight)) <= 2,
      `网页版 stage 占位高度变化: ${s.layout.stageMinHeight} vs ${WEB_BASELINE.stageMinHeight}（容差 ±2px）`,
    )
    // —— 打印回归（print 媒体仿真）——
    assert.equal(webResult.printState.topbarDisplay, WEB_PRINT_BASELINE.topbarDisplay, '打印态顶栏未隐藏')
    assert.equal(webResult.printState.ioBtnDisplay, WEB_PRINT_BASELINE.ioBtnDisplay, '打印态桌面入口泄漏')
    assert.equal(webResult.printState.invoicePosition, WEB_PRINT_BASELINE.invoicePosition, '打印态发票定位变化')
    assert.equal(webResult.printState.sealTop, WEB_PRINT_BASELINE.sealTop, '打印态监制章位置变化')
    assert.equal(webResult.printState.sealLeft, WEB_PRINT_BASELINE.sealLeft, '打印态监制章位置变化')
    assert.equal(webResult.printState.grandTotalText, WEB_PRINT_BASELINE.grandTotalText, '打印态价税合计变化')
    assert.equal(webResult.printState.goodsRowCount, WEB_PRINT_BASELINE.goodsRowCount, '打印态票面结构变化')
    assert.equal(webResult.printState.disclaimerOnPage, true, '打印态教学声明缺失')
    // —— 视觉基线（golden 像素对比，阈值：>64 通道差 ≤0.1%、8~64 差 ≤2%）——
    assert.ok(webResult.diff, '缺少 golden 比对结果')
    assert.equal(webResult.diff.match, true, `截图偏离 golden 基线: hard ${webResult.diff.hardPct?.toFixed(3)}% / soft ${webResult.diff.softPct?.toFixed(3)}%`)
    console.log('[smoke] web =', `golden 比对通过（hard ${webResult.diff.hardPct?.toFixed(4)}% / soft ${webResult.diff.softPct?.toFixed(4)}%）；1440×940 快照与基线一致`)
    // —— CSS 静态隔离检查：所有桌面专属规则必须挂 html.vbse-desktop ——
    const htmlText = fs.readFileSync(path.join(projectRoot, 'VBSE发票小程序（2.2版).html'), 'utf8')
    const styleMatch = htmlText.match(/<style>([\s\S]*?)<\/style>/)
    assert.ok(styleMatch, '未找到样式表')
    const css = styleMatch[1]
    const marker = '/* ===== 桌面版专属样式'
    const markerIdx = css.indexOf(marker)
    assert.ok(markerIdx > 0, '未找到桌面样式分区标记')
    const sharedCss = css.slice(0, markerIdx)
    const desktopCss = css.slice(markerIdx)
    // 共享区对 vbse-desktop 的规则引用只允许既定的三处打印复位（.invoice/.preview-panel/.seal）；
    // 说明性注释（/* ... html.vbse-desktop ... */）不算规则
    const vdLines = sharedCss
      .split('\n')
      .filter((line) => line.includes('vbse-desktop') && line.trim().startsWith('html.vbse-desktop'))
    assert.deepEqual(
      vdLines.map((line) => line.trim().split('{')[0].trim()).sort(),
      ['html.vbse-desktop .invoice', 'html.vbse-desktop .preview-panel', 'html.vbse-desktop .seal'].sort(),
      '共享区 vbse-desktop 引用超出既定的三处打印复位',
    )
    assert.ok(!sharedCss.includes('position: sticky'), '共享 CSS 出现 sticky（桌面专属预览钉住）')
    assert.ok(!sharedCss.includes('minmax(480px, 1fr)'), '共享 CSS 出现桌面双栏栅格')
    for (const cls of ['.io-btn', '.history-delete']) {
      const occurrences = sharedCss.split(cls).length - 1
      assert.equal(occurrences, 1, `${cls} 在共享 CSS 应只出现 1 次（默认隐藏规则）`)
      assert.ok(
        new RegExp(cls.replace(/\./g, '\\.') + '\\s*\\{[^}]*display:\\s*none').test(sharedCss),
        `${cls} 共享规则应为 display:none`,
      )
    }
    const ruleLines = desktopCss.split('\n').filter((line) => line.trim().endsWith('{'))
    assert.ok(ruleLines.length >= 10, '桌面样式区规则数异常')
    for (const line of ruleLines) {
      assert.ok(line.includes('vbse-desktop'), `桌面样式区规则缺少 vbse-desktop 前缀: ${line.trim()}`)
    }
    // —— Source-of-truth 守卫（目标 04）：核心规则只能经生成块进入 HTML ——
    // 守卫范围 = 核心生成块之外的文本（生成块内部的声明是合法产物）
    const coreBegin = htmlText.indexOf('INVOICE-CORE:BEGIN')
    const coreEnd = htmlText.indexOf('INVOICE-CORE:END')
    assert.ok(coreBegin > 0 && coreEnd > coreBegin, 'INVOICE-CORE 生成块缺失')
    const htmlOutsideCore = htmlText.slice(0, coreBegin) + htmlText.slice(coreEnd)
    assert.equal(htmlText.split('INVOICE-CORE:BEGIN').length - 1, 1, 'INVOICE-CORE 生成块应恰好一个')
    assert.ok(!htmlOutsideCore.includes('const COMPANY_OPTIONS = ['), 'COMPANY_OPTIONS 出现手写数组（应使用 VBSECore.COMPANY_OPTIONS）')
    assert.ok(!htmlOutsideCore.includes('"零", "壹", "贰"'), '人民币大写数字表出现第二份实现')
    for (const name of ['incrementDecimalString', 'formatMoney', 'toChineseUpperMoney', 'formatDateCn', 'formatUnitPrice', 'formatTaxPercent', 'ensureQrPayload', 'today']) {
      const delegate = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[^}]*VBSECore\\.`)
      assert.ok(delegate.test(htmlOutsideCore), `页面函数 ${name} 应为 VBSECore 薄适配（不得重新实现）`)
    }
    console.log('[smoke] web-css =', `共享/桌面样式隔离完好（桌面区 ${ruleLines.length} 条规则全部挂 vbse-desktop）`)
  } finally {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch { /* 清理失败不阻塞 */ }
  }
})

