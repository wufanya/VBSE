"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextInvoiceNumber = getNextInvoiceNumber;
exports.setNextInvoiceNumber = setNextInvoiceNumber;
exports.advanceInvoiceNumber = advanceInvoiceNumber;
exports.getInvoiceHistory = getInvoiceHistory;
exports.saveInvoiceHistory = saveInvoiceHistory;
exports.clearInvoiceHistory = clearInvoiceHistory;
const invoice_1 = require("./invoice");
function getNextInvoiceNumber() {
    return wx.getStorageSync(invoice_1.STORAGE_NEXT_NUMBER) || invoice_1.DEFAULT_INVOICE_NUMBER;
}
function setNextInvoiceNumber(value) {
    wx.setStorageSync(invoice_1.STORAGE_NEXT_NUMBER, String(value));
}
function advanceInvoiceNumber(value) {
    const source = /^\d+$/.test(String(value)) ? String(value) : getNextInvoiceNumber();
    const next = (0, invoice_1.incrementDecimalString)(source);
    setNextInvoiceNumber(next);
    return next;
}
function getInvoiceHistory() {
    try {
        const history = wx.getStorageSync(invoice_1.STORAGE_HISTORY) || [];
        if (!Array.isArray(history)) {
            return [];
        }
        return history.map((item) => (0, invoice_1.normalizeHistoryRecord)(item));
    }
    catch (_error) {
        return [];
    }
}
function saveInvoiceHistory(record) {
    const current = getInvoiceHistory().filter((item) => item.id !== record.id);
    const next = [record, ...current].slice(0, 100);
    wx.setStorageSync(invoice_1.STORAGE_HISTORY, next);
    return next;
}
function clearInvoiceHistory() {
    wx.removeStorageSync(invoice_1.STORAGE_HISTORY);
}
