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
  buildInvoiceLine,
  toChineseUpperMoney,
  roundMoney,
} from '../miniprogram/utils/invoice.ts'

test('incrementDecimalString preserves width while incrementing', () => {
  assert.equal(incrementDecimalString('0099'), '0100')
  assert.equal(incrementDecimalString(DEFAULT_INVOICE_NUMBER), '26412000001304072702')
})

// —— 发布前收尾：Infinity / 数值溢出防御（测试带 timeout，函数若卡死会被判定失败而非挂死进程）——

test('toChineseUpperMoney defends against non-finite input', { timeout: 2000 }, () => {
  // Infinity 曾导致 while 循环无法收敛；现在必须立即返回安全结果
  assert.equal(toChineseUpperMoney(Infinity), 'ⓧ零圆整')
  assert.equal(toChineseUpperMoney(-Infinity), 'ⓧ零圆整')
  assert.equal(toChineseUpperMoney(NaN), 'ⓧ零圆整')
  // 有限巨大值必须立即返回正常转换结果（不挂起即可）
  assert.ok(toChineseUpperMoney(1e200).startsWith('ⓧ'), '有限巨大值转换异常')
})

test('roundMoney defends against overflow', { timeout: 2000 }, () => {
  assert.equal(roundMoney(Infinity), Infinity) // 透传 Infinity 本身，由调用方归零
  assert.equal(roundMoney(2.675), 2.68)
  assert.equal(roundMoney(NaN), NaN)
})

test('buildInvoiceLine zeroes non-finite and overflowing inputs', { timeout: 2000 }, () => {
  // NaN 输入：归零（曾产生 NaN 金额直通票面）
  const nanLine = buildInvoiceLine({ name: 'x', unit: '项', qty: NaN, price: 1, taxRate: 0.13 })
  assert.equal(nanLine.qty, 0)
  assert.equal(nanLine.amount, 0)
  assert.equal(Number.isFinite(nanLine.taxAmount), true)
  // 有限但乘积溢出：qty = 1e200, price = 1e200 → qty*price = Infinity → 归零
  const overflowLine = buildInvoiceLine({ name: 'x', unit: '项', qty: 1e200, price: 1e200, taxRate: 0.13 })
  assert.equal(overflowLine.amount, 0)
  assert.equal(overflowLine.taxAmount, 0)
  // 超过业务上限（1e9）：数量被归零，金额为 0
  const cappedLine = buildInvoiceLine({ name: 'x', unit: '项', qty: 1e10, price: 100, taxRate: 0.13 })
  assert.equal(cappedLine.qty, 0)
  assert.equal(cappedLine.amount, 0)
  // 税额溢出防线：合法行金额上限内 taxAmount 必然有限
  const normalLine = buildInvoiceLine({ name: 'x', unit: '项', qty: 3, price: 100, taxRate: 0.13 })
  assert.equal(normalLine.amount, 300)
  assert.equal(normalLine.taxAmount, 39)
})

test('validateInvoiceDraft rejects non-finite and over-cap values', () => {
  const base = {
    invoiceNumber: DEFAULT_INVOICE_NUMBER,
    invoiceDate: '2026-09-27',
    buyerName: '甲',
    buyerTax: '000000000000000000',
    sellerName: '乙',
    sellerTax: '111111111111111111',
    drawer: '',
    remark: '',
  }
  assert.match(validateInvoiceDraft({ ...base, lines: [{ name: 'x', unit: '项', qty: NaN, price: 1, taxRate: 0.13 }] }), /数量必须大于 0/)
  assert.match(validateInvoiceDraft({ ...base, lines: [{ name: 'x', unit: '项', qty: 1e200, price: 1, taxRate: 0.13 }] }), /数量必须大于 0/)
  assert.match(validateInvoiceDraft({ ...base, lines: [{ name: 'x', unit: '项', qty: 1, price: 1e200, taxRate: 0.13 }] }), /数量必须大于 0/)
  assert.equal(validateInvoiceDraft({ ...base, lines: [{ name: 'x', unit: '项', qty: 2, price: 100, taxRate: 0.13 }] }), '')
})

test('buildInvoice produces finite totals even for hostile lines', { timeout: 2000 }, () => {
  const invoice = buildInvoice({
    invoiceNumber: DEFAULT_INVOICE_NUMBER,
    invoiceDate: '2026-09-27',
    buyerName: '甲',
    buyerTax: '000000000000000000',
    sellerName: '乙',
    sellerTax: '111111111111111111',
    drawer: '',
    remark: '',
    lines: [
      { name: '溢出行', unit: '项', qty: 1e200, price: 1e200, taxRate: 0.13 },
      { name: 'NaN行', unit: '项', qty: NaN, price: 1, taxRate: 0.13 },
    ],
  })
  assert.equal(Number.isFinite(invoice.totalAmount), true)
  assert.equal(Number.isFinite(invoice.totalTax), true)
  assert.equal(Number.isFinite(invoice.grandTotal), true)
  // toChineseUpperMoney 对合计值必须立即结束且产出有限字符串
  assert.equal(typeof toChineseUpperMoney(invoice.grandTotal), 'string')
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
  assert.equal(COMPANY_OPTIONS.length, 23)
  assert.ok(COMPANY_OPTIONS.some((company) => company.name === '爱贝尔童车制造有限公司'))
  assert.ok(COMPANY_OPTIONS.some((company) => company.name === '新耀工贸有限公司'))
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
