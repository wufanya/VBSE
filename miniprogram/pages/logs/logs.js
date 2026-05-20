"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const invoice_1 = require("../../utils/invoice");
const storage_1 = require("../../utils/storage");
Page({
    data: {
        cards: [],
        empty: false,
    },
    onShow() {
        this.loadHistory();
    },
    loadHistory() {
        const cards = (0, storage_1.getInvoiceHistory)().map((record) => {
            const normalized = (0, invoice_1.normalizeHistoryRecord)(record);
            return {
                id: normalized.id,
                invoiceNumber: normalized.invoiceNumber,
                invoiceDateCn: (0, invoice_1.formatDateCn)(normalized.invoiceDate),
                buyerName: normalized.buyerName,
                sellerName: normalized.sellerName,
                grandTotalText: (0, invoice_1.formatMoney)(normalized.grandTotal, true),
                savedAt: normalized.savedAt.slice(0, 19).replace('T', ' '),
                record: normalized,
            };
        });
        this.setData({
            cards,
            empty: cards.length === 0,
        });
    },
    handleLoad(e) {
        const index = Number(e.currentTarget.dataset.index);
        const card = this.data.cards[index];
        if (!card)
            return;
        const app = getApp();
        app.globalData.pendingHistoryAction = {
            mode: 'load',
            record: card.record,
        };
        wx.navigateBack();
    },
    handleRegenerate(e) {
        const index = Number(e.currentTarget.dataset.index);
        const card = this.data.cards[index];
        if (!card)
            return;
        const app = getApp();
        app.globalData.pendingHistoryAction = {
            mode: 'regenerate',
            record: card.record,
        };
        wx.navigateBack();
    },
    handleClear() {
        wx.showModal({
            title: '清空历史',
            content: '确定要清空本机保存的全部发票历史吗？',
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, storage_1.clearInvoiceHistory)();
                this.loadHistory();
            },
        });
    },
});
