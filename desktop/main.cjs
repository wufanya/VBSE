'use strict'

// VBSE 发票教学工具 - Windows 桌面版主进程
// 安全基线：contextIsolation 开启、nodeIntegration 关闭、沙箱开启、
// 拒绝外链导航/新窗口、阻断一切网络请求（首版必须离线可用且不外传数据）。

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, session, Menu } = require('electron')

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
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const values = sanitizeValues(parsed && parsed.values)
    if (values) return values
    quarantine(file)
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    quarantine(file)
  }
  // 主文件缺失或损坏时尝试备份
  try {
    const parsed = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))
    const values = sanitizeValues(parsed && parsed.values)
    if (values) {
      writeStoreAtomic(values)
      return values
    }
  } catch (_) { /* 备份也不可用 */ }
  return {}
}

function writeStoreAtomic(values) {
  const file = storeFile()
  const payload = JSON.stringify({ version: 1, values }, null, 2)
  if (payload.length > MAX_STORE_JSON) return false
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
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: APP_TITLE,
    backgroundColor: '#eef2f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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
