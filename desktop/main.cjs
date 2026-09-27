'use strict'

// VBSE 发票教学工具 - Windows 桌面版主进程
// 安全基线：contextIsolation 开启、nodeIntegration 关闭、沙箱开启、
// 拒绝外链导航/新窗口、阻断一切网络请求（首版必须离线可用且不外传数据）。

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, session, Menu, screen, dialog } = require('electron')

const APP_TITLE = 'VBSE发票教学工具'
const HTML_NAME = 'VBSE发票小程序（2.2版).html'
const STORE_FILENAME = 'invoice-store.json'
const STORE_KEYS = ['vbseInvoiceHistory', 'vbseInvoiceNextNumber']
const MAX_STORE_JSON = 5 * 1024 * 1024

const SMOKE_PHASE = process.env.VBSE_SMOKE || ''

// ---- 本地数据（userData 下的 JSON，窄作用域 IPC 读写） --------------------

function storeFile() {
  return path.join(app.getPath('userData'), STORE_FILENAME)
}

function sanitizeValues(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  for (const key of STORE_KEYS) {
    if (typeof raw[key] === 'string') out[key] = raw[key]
  }
  return out
}

function quarantine(file) {
  try {
    fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`))
  } catch (_) { /* 忽略：仅尽力保留现场 */ }
}

function loadValues() {
  const file = storeFile()
  let values = null
  let needsQuarantine = false
  try {
    // 读取前先做尺寸检查：超过上限的文件直接隔离，绝不读入内存
    if (fs.statSync(file).size > MAX_STORE_JSON) {
      needsQuarantine = true
    } else {
      values = sanitizeValues(JSON.parse(fs.readFileSync(file, 'utf8')).values)
      if (!values) needsQuarantine = true
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    needsQuarantine = true
  }
  if (needsQuarantine) quarantine(file)
  if (values) return values
  // 主文件缺失或损坏时尝试备份
  try {
    const parsedBak = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))
    const valuesBak = sanitizeValues(parsedBak && parsedBak.values)
    if (valuesBak) {
      writeStoreAtomic(valuesBak)
      return valuesBak
    }
  } catch (_) { /* 备份也不可用 */ }
  return {}
}

function writeStoreAtomic(values) {
  const file = storeFile()
  const payload = JSON.stringify({ version: 1, values }, null, 2)
  // 按字节而非字符数校验上限（中文 3 字节/字，防止 UTF-8 展开绕过）
  if (Buffer.byteLength(payload, 'utf8') > MAX_STORE_JSON) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, payload, 'utf8')
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
  } catch (_) { /* 备份失败不阻塞写入 */ }
  fs.renameSync(tmp, file)
  return true
}

ipcMain.on('vbse-store:load', (event) => {
  let values = {}
  try {
    values = loadValues() || {}
  } catch (_) {
    values = {}
  }
  event.returnValue = { ok: true, values }
})

ipcMain.on('vbse-store:save', (_event, payload) => {
  const values = sanitizeValues(payload && payload.values)
  if (!values) return
  try {
    writeStoreAtomic(values)
  } catch (_) {
    // 出错时不打印任何票面内容
  }
})

// ---- 票据导出/导入（教学材料流转；文件读写只在主进程，页面仅传 JSON 字符串） ----

const MAX_EXPORT_JSON = 512 * 1024

function safeExportName(name) {
  const base = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim()
  return base && base.endsWith('.json') ? base : 'VBSE票据.json'
}

ipcMain.handle('vbse-io:export', async (_event, payload) => {
  const json = payload && typeof payload.json === 'string' ? payload.json : ''
  if (!json.trim() || json.length > MAX_EXPORT_JSON) {
    return { ok: false, error: '票据数据为空或超出大小限制' }
  }
  let target
  if (SMOKE_PHASE) {
    target = process.env.VBSE_SMOKE_EXPORT_FILE || ''
    if (!target) return { ok: false, error: '冒烟环境未配置导出路径' }
  } else {
    const options = {
      title: '导出当前票据',
      defaultPath: path.join(app.getPath('documents'), safeExportName(payload && payload.fileName)),
      filters: [{ name: 'JSON 票据', extensions: ['json'] }],
    }
    const ret = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (ret.canceled || !ret.filePath) return { ok: false, canceled: true }
    target = ret.filePath
  }
  try {
    fs.writeFileSync(target, json, 'utf8')
  } catch (error) {
    return { ok: false, error: `写入失败: ${error && error.code ? error.code : '未知错误'}` }
  }
  return { ok: true, path: target }
})

ipcMain.handle('vbse-io:import', async () => {
  let source
  if (SMOKE_PHASE) {
    source = process.env.VBSE_SMOKE_IMPORT_FILE || ''
    if (!source || !fs.existsSync(source)) return { ok: false, error: '冒烟环境未配置导入文件' }
  } else {
    const options = {
      title: '导入票据 JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON 票据', extensions: ['json'] }],
    }
    const ret = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (ret.canceled || !ret.filePaths || !ret.filePaths[0]) return { ok: false, canceled: true }
    source = ret.filePaths[0]
  }
  try {
    if (fs.statSync(source).size > MAX_EXPORT_JSON) return { ok: false, error: '文件超出大小限制' }
    return { ok: true, json: fs.readFileSync(source, 'utf8') }
  } catch (error) {
    return { ok: false, error: `读取失败: ${error && error.code ? error.code : '未知错误'}` }
  }
})

// ---- 窗口与安全 -----------------------------------------------------------

function resolveHtmlFile() {
  const candidates = [
    path.join(app.getAppPath(), HTML_NAME),
    path.join(app.getAppPath(), '..', HTML_NAME),
    path.join(__dirname, '..', HTML_NAME),
    path.join(__dirname, HTML_NAME),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (_) { /* 继续尝试 */ }
  }
  throw new Error(`找不到页面文件: ${HTML_NAME}`)
}

let mainWindow = null

function guardWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

app.on('web-contents-created', (_event, contents) => guardWebContents(contents))

function createWindow() {
  // 初始尺寸不超过屏幕工作区：教学机常见 1366×768，固定 1440×940 会超出屏幕
  const workArea = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.min(1440, workArea.width),
    height: Math.min(940, workArea.height),
    minWidth: 1100,
    minHeight: 720,
    title: APP_TITLE,
    backgroundColor: '#eef2f6',
    show: false,
    // 打包后由 exe 图标承担窗口/任务栏图标；这里主要服务开发模式
    icon: app.isPackaged ? undefined : path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      // web 冒烟阶段刻意不带 preload：等价纯浏览器网页版（无 vbse-desktop 类、无桥、存储走
      // localStorage），用于"网页版零变化"回归；发布路径永远带 preload，安全模型不变
      preload: SMOKE_PHASE === 'web' ? undefined : path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  mainWindow.once('ready-to-show', () => {
    // print/dialog 阶段需要可见窗口（隐藏窗口截图会挂起；打印对话框需可见）
    if (!SMOKE_PHASE || SMOKE_PHASE === 'print' || SMOKE_PHASE === 'dialog') mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(APP_TITLE)
    if (SMOKE_PHASE) {
      runSmoke(SMOKE_PHASE, mainWindow.webContents).catch(failSmoke)
    }
  })

  mainWindow.loadFile(resolveHtmlFile()).catch((error) => {
    failSmoke(error)
  })
}

// ---- 冒烟测试阶段（仅当设置了 VBSE_SMOKE 时执行） --------------------------

function incrementDigits(value) {
  const digits = String(value).split('')
  let carry = 1
  for (let i = digits.length - 1; i >= 0; i--) {
    const sum = Number(digits[i]) + carry
    digits[i] = String(sum % 10)
    carry = sum > 9 ? 1 : 0
    if (!carry) break
  }
  if (carry) digits.unshift('1')
  return digits.join('')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emitSmoke(result) {
  process.stdout.write(`SMOKE_RESULT ${JSON.stringify(result)}\n`)
}

function failSmoke(error) {
  emitSmoke({ ok: false, error: String(error && error.message ? error.message : error) })
  app.exit(1)
}

const BASIC_STATE_SCRIPT = `(function () {
  var canvas = document.getElementById('pQrCanvas');
  var dark = 0;
  if (canvas) {
    var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 0; i < data.length; i += 4) { if (data[i] < 128 && data[i + 3] > 0) dark++; }
  }
  var invoice = document.getElementById('invoice');
  return {
    documentTitle: document.title,
    buyerOptions: document.querySelectorAll('#buyerCompany option').length,
    sellerOptions: document.querySelectorAll('#sellerCompany option').length,
    historyNode: !!document.querySelector('.history-empty, .history-card'),
    invoiceNumberShown: (document.getElementById('pInvoiceNumber') || {}).textContent || '',
    nextNumber: typeof getNextInvoiceNumber === 'function' ? getNextInvoiceNumber() : null,
    hasBridge: !!window.vbseStorage,
    bridgeKeys: window.vbseStorage ? Object.keys(window.vbseStorage) : [],
    qrDarkPixels: dark,
    disclaimerOnPage: document.body.innerText.indexOf('教学样票，不作为真实开票或报销凭证') >= 0,
    localStorageUntouched: localStorage.getItem('vbseInvoiceHistory') === null && localStorage.getItem('vbseInvoiceNextNumber') === null,
    invoiceNoOverflow: invoice ? invoice.scrollWidth <= invoice.clientWidth + 1 : false
  };
})()`

const WRITE_SCRIPT = `(function () {
  setNextInvoiceNumber('26412000001304072777');
  saveHistory({
    id: 'smoke-test-0001',
    savedAt: '2026-09-26T00:00:00.000Z',
    invoiceNumber: '26412000001304072777',
    invoiceDate: '2026-09-26',
    buyerName: '冒烟测试购方',
    buyerTax: '000000000000000000',
    sellerName: '冒烟测试销方',
    sellerTax: '111111111111111111',
    drawer: '冒烟',
    remark: '',
    lines: [{ name: '冒烟项目', unit: '项', qty: 1, price: 1, taxRate: 0.13 }]
  });
  return true;
})()`

const FLOW_SCRIPT = `(function () {
  var confirmOriginal = window.confirm;
  var printOriginal = window.print;
  var printCalls = 0;
  window.confirm = function () { return true; };
  window.print = function () { printCalls++; };

  var beforeNumber = getNextInvoiceNumber();
  var beforeCount = getHistory().length;

  fillSample();
  createInvoice();

  var afterCreate = {
    nextNumber: getNextInvoiceNumber(),
    count: getHistory().length,
    savedNumber: (getHistory()[0] || {}).invoiceNumber,
    previewNumber: (document.getElementById('pInvoiceNumber') || {}).textContent || ''
  };

  var money = (function () {
    var rows = [];
    Array.prototype.forEach.call(document.querySelectorAll('#pGoodsBody tr'), function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length >= 7 && tds[4].textContent.trim() !== '') {
        rows.push({ amount: tds[4].textContent, tax: tds[6].textContent });
      }
    });
    return {
      lineAmounts: rows.map(function (r) { return r.amount; }),
      lineTaxes: rows.map(function (r) { return r.tax; }),
      totalAmount: document.getElementById('pTotalAmount').textContent,
      totalTax: document.getElementById('pTotalTax').textContent,
      grandTotal: document.getElementById('pGrandTotal').textContent,
      upperAmount: document.getElementById('pUpperAmount').textContent
    };
  })();

  var firstId = (getHistory()[0] || {}).id;
  loadHistory(firstId);
  var afterLoad = {
    invoiceNumber: document.getElementById('invoiceNumber').value,
    buyerName: document.getElementById('buyerName').value,
    sellerName: document.getElementById('sellerName').value,
    buyerSelect: document.getElementById('buyerCompany').value,
    guideText: (document.getElementById('toast') || {}).textContent || ''
  };

  printHistory(firstId);
  var printInvoked = printCalls;

  clearHistory();
  var afterClear = { count: getHistory().length };

  window.confirm = confirmOriginal;
  window.print = printOriginal;

  return {
    beforeNumber: beforeNumber,
    beforeCount: beforeCount,
    afterCreate: afterCreate,
    money: money,
    afterLoad: afterLoad,
    printCalls: printInvoked,
    afterClear: afterClear
  };
})()`

// 导出→破坏表单→导入回放：验证 JSON 往返与页面回填（文件路径由冒烟环境变量指定）
const IO_SCRIPT = `(function () {
  fillSample();
  var data = collectInvoiceData();
  return window.vbseIO.exportInvoice(JSON.stringify(data), 'VBSE票据-' + data.invoiceNumber + '.json')
    .then(function (exp) {
      if (!exp || !exp.ok) return { exportOk: false, exportError: exp && exp.error };
      fillForm({
        invoiceNumber: '0',
        buyerName: '导入前占位',
        buyerTax: 'x',
        sellerName: '导入前占位',
        sellerTax: 'y',
        lines: [{ name: '占位', unit: '项', qty: 1, price: 1, taxRate: 0.13 }]
      });
      return window.vbseIO.importInvoice().then(function (imp) {
        if (!imp || !imp.ok) return { exportOk: true, importOk: false, importError: imp && imp.error };
        var parsed = JSON.parse(imp.json);
        var validationProblem = validateImportedInvoice(parsed);
        var normalized = normalizeHistoryItem(parsed);
        fillForm(normalized);
        renderInvoice(normalized);
        return {
          exportOk: true,
          importOk: true,
          validationProblem: validationProblem,
          importedJson: imp.json,
          importedNumber: document.getElementById('invoiceNumber').value,
          importedBuyer: document.getElementById('buyerName').value,
          importedGrand: document.getElementById('pGrandTotal').textContent,
          importedUpper: document.getElementById('pUpperAmount').textContent
        };
      });
    });
})()`

// 非法导入边界：主进程侧拒绝超大文件 + 页面级校验矩阵 + 失败不污染表单与历史
const BADIO_SCRIPT = `(async function () {
  fillSample();
  var before = {
    formNumber: document.getElementById('invoiceNumber').value,
    historyCount: getHistory().length
  };
  var oversize = await window.vbseIO.importInvoice();
  var goodLine = { name: '合法明细', unit: '项', qty: 2, price: 3.5, taxRate: 0.13, amount: 7, taxAmount: 0.91 };
  function recordWith(overrides) {
    var rec = {
      invoiceNumber: '26412000001304079999', invoiceDate: '2026-09-27',
      buyerName: '校验购方', buyerTax: '000000000000000000',
      sellerName: '校验销方', sellerTax: '111111111111111111',
      drawer: '测试', remark: '',
      totalAmount: 7, totalTax: 0.91, grandTotal: 7.91,
      lines: [Object.assign({}, goodLine)]
    };
    if (overrides) overrides(rec);
    return rec;
  }
  var cases = [
    { title: 'null', rec: null, valid: false },
    { title: 'array', rec: [], valid: false },
    { title: 'empty object', rec: {}, valid: false },
    { title: 'number invoiceNumber', rec: recordWith(function (r) { r.invoiceNumber = 1; }), valid: false },
    { title: 'impossible date', rec: recordWith(function (r) { r.invoiceDate = '2026-02-31'; }), valid: false },
    { title: 'negative qty', rec: recordWith(function (r) { r.lines[0].qty = -1; }), valid: false },
    { title: 'string qty', rec: recordWith(function (r) { r.lines[0].qty = '12abc'; }), valid: false },
    { title: 'taxRate > 1', rec: recordWith(function (r) { r.lines[0].taxRate = 1.5; }), valid: false },
    { title: 'Infinity price', rec: recordWith(function (r) { r.lines[0].price = Infinity; }), valid: false },
    { title: 'missing amount', rec: recordWith(function (r) { delete r.lines[0].amount; }), valid: false },
    { title: 'too many lines', rec: recordWith(function (r) { r.lines = []; for (var i = 0; i < 201; i++) r.lines.push(Object.assign({}, goodLine)); }), valid: false },
    { title: 'totals mismatch', rec: recordWith(function (r) { r.totalAmount = 9999; }), valid: false },
    { title: 'line amount mismatch', rec: recordWith(function (r) { r.lines[0].amount = 999; r.totalAmount = 999; r.grandTotal = 999.91; }), valid: false },
    { title: 'line taxAmount inconsistent with rate', rec: recordWith(function (r) { r.lines[0].taxAmount = 1; r.totalTax = 1; r.grandTotal = 8; }), valid: false },
    { title: 'washed numbers trap (normalize-first would accept)', rec: recordWith(function (r) { r.lines[0].price = '5e999'; r.lines[0].amount = '5e999'; r.lines[0].taxAmount = '5e999'; r.totalAmount = '5e999'; r.totalTax = '5e999'; r.grandTotal = '5e999'; }), valid: false },
    { title: 'json 1e999 -> Infinity', rec: JSON.parse('{"invoiceNumber":"N","invoiceDate":"2026-09-27","buyerName":"a","buyerTax":"b","sellerName":"c","sellerTax":"d","totalAmount":0,"totalTax":0,"grandTotal":0,"lines":[{"name":"x","unit":"项","qty":1e999,"price":1,"taxRate":0.13,"amount":1,"taxAmount":0.13}]}'), valid: false },
    { title: 'valid record', rec: recordWith(null), valid: true }
  ];
  var results = cases.map(function (c) {
    return { title: c.title, got: validateImportedInvoice(c.rec), valid: c.valid };
  });
  var after = {
    formNumber: document.getElementById('invoiceNumber').value,
    historyCount: getHistory().length
  };
  return { oversizeRejected: !!(oversize && oversize.ok === false), results: results, before: before, after: after };
})()`

// 网页版零变化回归：无 preload 渲染（等价纯浏览器），固定视口采集特征快照。
// 断言基线维护在 tests/run-desktop-smoke.ts 的 WEB_BASELINE——共享 HTML 的任何改动
// 若改变网页版渲染/行为，这里的状态会偏离基线并在测试中报错。
const WEB_SCRIPT = `(function () {
  var cs = function (el, prop) { return el ? getComputedStyle(el)[prop] : ''; };
  var formPanel = document.querySelector('.form-panel');
  var previewPanel = document.querySelector('.preview-panel');
  var layout = document.querySelector('.layout');
  var invoice = document.getElementById('invoice');
  var seal = document.querySelector('.seal');
  var stage = document.getElementById('invoiceStage');
  fillSample();
  createInvoice();
  var rows = [];
  Array.prototype.forEach.call(document.querySelectorAll('#pGoodsBody tr'), function (tr) {
    var tds = tr.querySelectorAll('td');
    if (tds.length >= 7 && tds[4].textContent.trim() !== '') {
      rows.push({ amount: tds[4].textContent, tax: tds[6].textContent });
    }
  });
  return {
    htmlClassName: document.documentElement.className,
    hasBridge: !!window.vbseStorage,
    hasIO: !!window.vbseIO,
    bodyFont: cs(document.body, 'fontFamily'),
    layoutColumns: cs(layout, 'gridTemplateColumns'),
    invoicePosition: cs(invoice, 'position'),
    previewPosition: cs(previewPanel, 'position'),
    previewTop: cs(previewPanel, 'top'),
    sealTop: cs(seal, 'top'),
    sealLeft: cs(seal, 'left'),
    ioBtnDisplay: cs(document.querySelector('.io-btn'), 'display'),
    historyDeleteDisplay: cs(document.querySelector('.history-delete'), 'display'),
    formPanelHeight: formPanel ? formPanel.offsetHeight : 0,
    previewPanelHeight: previewPanel ? previewPanel.offsetHeight : 0,
    stageMinHeight: stage ? stage.style.minHeight : '',
    viewport: { w: window.innerWidth, h: window.innerHeight },
    invoiceScrollOk: invoice ? invoice.scrollWidth <= invoice.clientWidth + 1 : false,
    money: {
      lineAmounts: rows.map(function (r) { return r.amount; }),
      lineTaxes: rows.map(function (r) { return r.tax; }),
      totalAmount: (document.getElementById('pTotalAmount') || {}).textContent || '',
      totalTax: (document.getElementById('pTotalTax') || {}).textContent || '',
      grandTotal: (document.getElementById('pGrandTotal') || {}).textContent || '',
      upperAmount: (document.getElementById('pUpperAmount') || {}).textContent || ''
    },
    business: {
      historyCountAfter: getHistory().length,
      nextNumber: getNextInvoiceNumber(),
      localStorageHistory: localStorage.getItem('vbseInvoiceHistory') !== null,
      localStorageNext: localStorage.getItem('vbseInvoiceNextNumber') !== null,
      historyCardCount: document.querySelectorAll('.history-card').length
    }
  };
})()`

async function runSmoke(phase, contents) {
  const result = { phase, ok: false }

  if (phase === 'basic') {
    const state = await contents.executeJavaScript(BASIC_STATE_SCRIPT, true)
    result.state = Object.assign({ appPath: app.getAppPath(), storeFile: storeFile() }, state)
    result.ok = state.hasBridge === true &&
      state.buyerOptions === 24 &&
      state.sellerOptions === 24 &&
      state.qrDarkPixels > 100 &&
      state.disclaimerOnPage === true &&
      state.localStorageUntouched === true
  } else if (phase === 'write') {
    await contents.executeJavaScript(WRITE_SCRIPT, true)
    await sleep(800) // 等待异步 IPC 落盘
    result.storeFile = storeFile()
    result.ok = fs.existsSync(result.storeFile)
  } else if (phase === 'read') {
    result.state = await contents.executeJavaScript(`({
      next: getNextInvoiceNumber(),
      count: getHistory().length,
      first: (getHistory()[0] || {}).invoiceNumber
    })`, true)
    result.ok = result.state.next === '26412000001304072777' &&
      result.state.count >= 1 &&
      result.state.first === '26412000001304072777'
  } else if (phase === 'flow') {
    const state = await contents.executeJavaScript(FLOW_SCRIPT, true)
    await sleep(500)
    result.state = state
    const storeAfter = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
    result.storeHistoryCount = JSON.parse(storeAfter.values.vbseInvoiceHistory || '[]').length
    result.ok = state.afterCreate.count === state.beforeCount + 1 &&
      state.afterCreate.nextNumber === incrementDigits(state.beforeNumber) &&
      state.afterCreate.savedNumber === state.afterCreate.previewNumber &&
      state.afterLoad.buyerName.length > 0 &&
      state.afterLoad.sellerName.length > 0 &&
      state.afterLoad.buyerSelect !== '__manual__' &&
      state.printCalls >= 1 &&
      state.afterClear.count === 0 &&
      result.storeHistoryCount === 0
  } else if (phase === 'io') {
    const state = await contents.executeJavaScript(IO_SCRIPT, true)
    result.state = state
    result.exportFile = process.env.VBSE_SMOKE_EXPORT_FILE || ''
    result.ok = state.exportOk === true &&
      state.importOk === true &&
      state.validationProblem === "" &&
      !!result.exportFile &&
      fs.existsSync(result.exportFile)
  } else if (phase === 'badio') {
    const state = await contents.executeJavaScript(BADIO_SCRIPT, true)
    result.state = state
    const rejected = state.results.filter((r) => !r.valid)
    const accepted = state.results.filter((r) => r.valid)
    result.ok = state.oversizeRejected === true &&
      rejected.every((r) => r.got !== "") &&
      accepted.every((r) => r.got === "") &&
      state.before.formNumber === state.after.formNumber &&
      state.before.historyCount === state.after.historyCount
  } else if (phase === 'web') {
    // 固定 1440×940 视口（调试器仿真，与窗口/屏幕无关），消除环境差异后采集快照
    process.stdout.write('WEB_STEP emulate\n')
    contents.debugger.attach('1.3')
    await contents.debugger.sendCommand('Page.enable')
    await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 940, deviceScaleFactor: 1, mobile: false,
    })
    await sleep(300)
    const state = await contents.executeJavaScript(WEB_SCRIPT, true)
    try {
      await contents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
    } catch (_) { /* 已 detach */ }
    try { contents.debugger.detach() } catch (_) { /* 已分离 */ }
    result.state = state
    result.ok = state.hasBridge === false &&
      state.hasIO === false &&
      String(state.htmlClassName).indexOf('vbse-desktop') < 0 &&
      state.viewport.w === 1440 &&
      state.viewport.h === 940 &&
      state.business.historyCountAfter === 1 &&
      state.business.localStorageHistory === true &&
      state.business.localStorageNext === true &&
      state.invoiceScrollOk === true
  } else if (phase === 'print') {
    await runPrintSmoke(result, contents)
  } else if (phase === 'dialog') {
    contents.executeJavaScript('window.print(); true;', false)
    await sleep(3000)
    emitSmoke({ phase, ok: true, note: 'window.print() invoked' })
    await sleep(6000)
    app.exit(0)
    return
  } else {
    failSmoke(new Error(`未知冒烟阶段: ${phase}`))
    return
  }

  emitSmoke(result)
  app.exit(result.ok ? 0 : 1)
}

async function runPrintSmoke(result, contents) {
  process.stdout.write('PRINT_STEP printers\n')
  const printers = await contents.getPrintersAsync()
  process.stdout.write(`PRINT_STEP printers-done count=${printers.length}\n`)
  result.printers = printers.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    isDefault: p.isDefault,
    type: p.type,
  }))
  const pdf = await contents.printToPDF({
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  })
  process.stdout.write(`PRINT_STEP pdf-done bytes=${pdf.length}\n`)
  const pdfPath = path.join(app.getPath('temp'), 'vbse-smoke-print.pdf')
  fs.writeFileSync(pdfPath, pdf)
  result.pdfPath = pdfPath
  result.pdfBytes = pdf.length

  // 打印媒体仿真截图，用于人工核对打印版式
  let shotSaved = false
  try {
    process.stdout.write('PRINT_STEP attach-debugger\n')
    contents.debugger.attach('1.3')
    await contents.debugger.sendCommand('Page.enable')
    process.stdout.write('PRINT_STEP emulate\n')
    await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1123, height: 1500, deviceScaleFactor: 1, mobile: false,
    })
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
    await sleep(300)
    process.stdout.write('PRINT_STEP screenshot\n')
    const shot = await contents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })
    const shotPath = path.join(app.getPath('temp'), 'vbse-smoke-print-media.png')
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    result.screenshotPath = shotPath
    shotSaved = true
  } catch (error) {
    result.screenshotError = String(error && error.message ? error.message : error)
  } finally {
    try { contents.debugger.detach() } catch (_) { /* 已分离 */ }
  }
  result.hasPdfPrinter = result.printers.some((p) => /pdf/i.test(`${p.name} ${p.displayName}`))
  result.ok = result.pdfBytes > 5000 && shotSaved
}

// ---- 启动 -----------------------------------------------------------------

app.setName(APP_TITLE)
app.setPath('userData', process.env.VBSE_USER_DATA_DIR
  ? path.resolve(process.env.VBSE_USER_DATA_DIR)
  : path.join(app.getPath('appData'), APP_TITLE))

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // 不显示 Electron 默认英文菜单栏（教学工具界面保持中文简洁）
    Menu.setApplicationMenu(null)
    // 阻断一切网络请求：页面必须完全离线可用，且本地票据数据不可能外传
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true })
    )
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    createWindow()
  }).catch((error) => {
    if (SMOKE_PHASE) failSmoke(error)
    else console.error(error)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
