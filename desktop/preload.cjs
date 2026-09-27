'use strict'

// 预加载脚本（沙箱 + contextIsolation）。
// 只向页面暴露与 localStorage 同形的极窄存储 API：
// getItem / setItem / removeItem，且只允许两个业务键，不暴露任何文件系统能力。

const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_KEYS = ['vbseInvoiceHistory', 'vbseInvoiceNextNumber']

const loaded = ipcRenderer.sendSync('vbse-store:load')
const values = Object.assign({}, loaded && loaded.values ? loaded.values : {})

function persist() {
  const payload = {}
  for (const key of ALLOWED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(values, key)) payload[key] = values[key]
  }
  ipcRenderer.send('vbse-store:save', { values: payload })
}

contextBridge.exposeInMainWorld('vbseStorage', {
  getItem(key) {
    if (!ALLOWED_KEYS.includes(key)) return null
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
  },
  setItem(key, value) {
    if (!ALLOWED_KEYS.includes(key)) return
    values[key] = String(value)
    persist()
  },
  removeItem(key) {
    if (!ALLOWED_KEYS.includes(key)) return
    delete values[key]
    persist()
  },
})

// 桌面版标识类：页面样式表据此应用桌面专属样式，网页版不含此类、外观不变
function markDesktop() {
  try {
    document.documentElement.classList.add('vbse-desktop')
  } catch (_) { /* 极早期失败时回退网页版外观 */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', markDesktop, { once: true })
} else {
  markDesktop()
}
