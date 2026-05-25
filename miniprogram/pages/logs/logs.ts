import {
  formatDateCn,
  formatMoney,
  normalizeHistoryRecord,
  type InvoiceRecord,
} from '../../utils/invoice'
import { clearInvoiceHistory, getInvoiceHistory } from '../../utils/storage'

interface HistoryCard {
  id: string
  invoiceNumber: string
  invoiceDateCn: string
  buyerName: string
  sellerName: string
  grandTotalText: string
  savedAt: string
  record: InvoiceRecord
}

interface HistoryPageData {
  cards: HistoryCard[]
  empty: boolean
}

Page<HistoryPageData, WechatMiniprogram.IAnyObject>({
  data: {
    cards: [],
    empty: false,
  },
  onShow() {
    this.loadHistory()
  },
  loadHistory() {
    const cards = getInvoiceHistory().map((record) => {
      const normalized = normalizeHistoryRecord(record)
      return {
        id: normalized.id,
        invoiceNumber: normalized.invoiceNumber,
        invoiceDateCn: formatDateCn(normalized.invoiceDate),
        buyerName: normalized.buyerName,
        sellerName: normalized.sellerName,
        grandTotalText: formatMoney(normalized.grandTotal, true),
        savedAt: normalized.savedAt.slice(0, 19).replace('T', ' '),
        record: normalized,
      }
    })
    this.setData({
      cards,
      empty: cards.length === 0,
    })
  },
  handleLoad(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const card = this.data.cards[index]
    if (!card) return
    const app = getApp<IAppOption>()
    app.globalData.pendingHistoryAction = {
      mode: 'load',
      record: card.record,
    }
    wx.navigateBack()
  },
  handleRegenerate(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const card = this.data.cards[index]
    if (!card) return
    const app = getApp<IAppOption>()
    app.globalData.pendingHistoryAction = {
      mode: 'regenerate',
      record: card.record,
    }
    wx.navigateBack()
  },
  handleClear() {
    wx.showModal({
      title: '清空历史',
      content: '确定要清空本机保存的全部发票历史吗？',
      success: (res) => {
        if (!res.confirm) return
        clearInvoiceHistory()
        this.loadHistory()
      },
    })
  },
})
