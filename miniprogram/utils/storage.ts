import {
  DEFAULT_INVOICE_NUMBER,
  STORAGE_HISTORY,
  STORAGE_NEXT_NUMBER,
  incrementDecimalString,
  normalizeHistoryRecord,
  type InvoiceRecord,
} from './invoice'

export function getNextInvoiceNumber(): string {
  return wx.getStorageSync(STORAGE_NEXT_NUMBER) || DEFAULT_INVOICE_NUMBER
}

export function setNextInvoiceNumber(value: string): void {
  wx.setStorageSync(STORAGE_NEXT_NUMBER, String(value))
}

export function advanceInvoiceNumber(value: string): string {
  const source = /^\d+$/.test(String(value)) ? String(value) : getNextInvoiceNumber()
  const next = incrementDecimalString(source)
  setNextInvoiceNumber(next)
  return next
}

export function getInvoiceHistory(): InvoiceRecord[] {
  try {
    const history = wx.getStorageSync(STORAGE_HISTORY) || []
    if (!Array.isArray(history)) {
      return []
    }
    return history.map((item) => normalizeHistoryRecord(item))
  } catch (_error) {
    return []
  }
}

export function saveInvoiceHistory(record: InvoiceRecord): InvoiceRecord[] {
  const current = getInvoiceHistory().filter((item) => item.id !== record.id)
  const next = [record, ...current].slice(0, 100)
  wx.setStorageSync(STORAGE_HISTORY, next)
  return next
}

export function clearInvoiceHistory(): void {
  wx.removeStorageSync(STORAGE_HISTORY)
}
