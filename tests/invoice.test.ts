import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANY_OPTIONS,
  DEFAULT_INVOICE_NUMBER,
  MANUAL_COMPANY,
  buildInvoice,
  buildInvoiceSummary,
  createDefaultDraft,
  ensureQrPayload,
  findCompanyValue,
  getInitialLines,
  incrementDecimalString,
  normalizeHistoryRecord,
  validateInvoiceDraft,
} from '../miniprogram/utils/invoice.ts'

test('incrementDecimalString preserves width while incrementing', () => {
  assert.equal(incrementDecimalString('0099'), '0100')
  assert.equal(incrementDecimalString(DEFAULT_INVOICE_NUMBER), '26412000001304072702')
})

test('buildInvoice computes totals for multiple line items', () => {
  const invoice = buildInvoice({
    invoiceNumber: DEFAULT_INVOICE_NUMBER,
    invoiceDate: '2026-05-18',
    buyerName: COMPANY_OPTIONS[7].name,
    buyerTax: COMPANY_OPTIONS[7].taxId,
    sellerName: COMPANY_OPTIONS[0].name,
    sellerTax: COMPANY_OPTIONS[0].taxId,
    drawer: '李明',
    remark: '测试备注',
    lines: [
      { name: '办公用品', unit: '项', qty: 2, price: 100, taxRate: 0.13 },
      { name: '技术服务', unit: '项', qty: 1, price: 500, taxRate: 0.06 },
    ],
  })

  assert.equal(invoice.lines[0].amount, 200)
  assert.equal(invoice.lines[0].taxAmount, 26)
  assert.equal(invoice.totalAmount, 700)
  assert.equal(invoice.totalTax, 56)
  assert.equal(invoice.grandTotal, 756)
})

test('validateInvoiceDraft rejects missing or invalid invoice fields', () => {
  assert.equal(
    validateInvoiceDraft({
      invoiceNumber: DEFAULT_INVOICE_NUMBER,
      invoiceDate: '',
      buyerName: '',
      buyerTax: '',
      sellerName: '',
      sellerTax: '',
      drawer: '',
      remark: '',
      lines: [],
    }),
    '请选择开票日期'
  )

  assert.equal(
    validateInvoiceDraft({
      invoiceNumber: DEFAULT_INVOICE_NUMBER,
      invoiceDate: '2026-05-18',
      buyerName: '采购方',
      buyerTax: '123',
      sellerName: '销售方',
      sellerTax: '456',
      drawer: '',
      remark: '',
      lines: [{ name: '', unit: '项', qty: 1, price: 10, taxRate: 0.13 }],
    }),
    '项目明细的名称不能为空'
  )
})

test('findCompanyValue matches preset company or falls back to manual', () => {
  assert.equal(
    findCompanyValue(COMPANY_OPTIONS[0].name, COMPANY_OPTIONS[0].taxId),
    '0'
  )
  assert.equal(findCompanyValue('自定义企业', '999'), MANUAL_COMPANY)
})

test('ensureQrPayload is stable unless forced to regenerate', () => {
  const seed = {
    invoiceNumber: DEFAULT_INVOICE_NUMBER,
    invoiceDate: '2026-05-18',
    qrPayload: 'VBSE|NO:1|DATE:2026-05-18|CHK:ABCD1234|TRAINING',
  }

  assert.equal(
    ensureQrPayload(seed, false, () => 'ZXCV1234'),
    'VBSE|NO:1|DATE:2026-05-18|CHK:ABCD1234|TRAINING'
  )

  assert.equal(
    ensureQrPayload(seed, true, () => 'ZXCV1234'),
    `VBSE|NO:${DEFAULT_INVOICE_NUMBER}|DATE:2026-05-18|CHK:ZXCV1234|TRAINING`
  )
})

test('normalizeHistoryRecord recomputes totals and preserves payload', () => {
  const normalized = normalizeHistoryRecord({
    id: 'abc',
    savedAt: '2026-05-18T10:00:00.000Z',
    invoiceNumber: DEFAULT_INVOICE_NUMBER,
    invoiceDate: '2026-05-18',
    buyerName: '采购方',
    buyerTax: '123',
    sellerName: '销售方',
    sellerTax: '456',
    drawer: '李明',
    remark: '',
    qrPayload: 'VBSE|NO:1|DATE:2026-05-18|CHK:KEEPIT|TRAINING',
    lines: [{ name: '商品', unit: '份', qty: 3, price: 20, taxRate: 0.13, amount: 0, taxAmount: 0 }],
    totalAmount: 0,
    totalTax: 0,
    grandTotal: 0,
  })

  assert.equal(normalized.totalAmount, 60)
  assert.equal(normalized.totalTax, 7.8)
  assert.equal(normalized.grandTotal, 67.8)
  assert.equal(normalized.qrPayload, 'VBSE|NO:1|DATE:2026-05-18|CHK:KEEPIT|TRAINING')
})

test('default draft and sample lines are ready for the teaching flow', () => {
  const draft = createDefaultDraft('2026-05-18', '26412000001304072709')
  const lines = getInitialLines()
  const summary = buildInvoiceSummary(
    buildInvoice({
      ...draft,
      buyerName: COMPANY_OPTIONS[7].name,
      buyerTax: COMPANY_OPTIONS[7].taxId,
      sellerName: COMPANY_OPTIONS[0].name,
      sellerTax: COMPANY_OPTIONS[0].taxId,
      drawer: '李明',
      lines,
    })
  )

  assert.equal(draft.invoiceDate, '2026-05-18')
  assert.equal(draft.invoiceNumber, '26412000001304072709')
  assert.equal(lines.length, 3)
  assert.match(summary.upperAmount, /^ⓧ/)
  assert.match(summary.grandTotalText, /^¥/)
})
