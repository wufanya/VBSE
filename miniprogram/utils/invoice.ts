export const STORAGE_NEXT_NUMBER = 'vbseInvoiceNextNumber'
export const STORAGE_HISTORY = 'vbseInvoiceHistory'
export const DEFAULT_INVOICE_NUMBER = '26412000001304072701'
export const MANUAL_COMPANY = '__manual__'
export const MANUAL_TAX_RATE = 'manual'

export interface CompanyOption {
  name: string
  taxId: string
}

export interface InvoiceLineDraft {
  name: string
  unit: string
  qty: number
  price: number
  taxRate: number
}

export interface InvoiceLine extends InvoiceLineDraft {
  amount: number
  taxAmount: number
}

export interface InvoiceDraft {
  invoiceNumber: string
  invoiceDate: string
  buyerName: string
  buyerTax: string
  sellerName: string
  sellerTax: string
  drawer: string
  remark: string
  lines: InvoiceLineDraft[]
  qrPayload?: string
}

export interface InvoiceRecord extends InvoiceDraft {
  id: string
  savedAt: string
  lines: InvoiceLine[]
  totalAmount: number
  totalTax: number
  grandTotal: number
  qrPayload: string
}

export interface InvoiceSummary {
  upperAmount: string
  grandTotalText: string
  totalAmountText: string
  totalTaxText: string
  lineCount: number
}

export const COMPANY_OPTIONS: CompanyOption[] = [
  { name: '宝乐童车制造有限公司', taxId: '110108809018632001' },
  { name: '小精灵童车制造有限公司', taxId: '110108809018633002' },
  { name: '童飞童车制造有限公司', taxId: '110108809018634003' },
  { name: '爱贝儿童车制造有限公司', taxId: '110108809018635004' },
  { name: '豆豆熊童车制造有限公司', taxId: '110108809018636005' },
  { name: '五彩梦童车制造有限公司', taxId: '110108809018637006' },
  { name: '旭日商贸有限公司', taxId: '110108554831327011' },
  { name: '华晨商贸有限公司', taxId: '110108753990101012' },
  { name: '仁和商贸有限公司', taxId: '110108554831245013' },
  { name: '天府商贸有限公司', taxId: '110108120101673014' },
  { name: '恒通工贸有限公司', taxId: '110000001012587015' },
  { name: '邦尼工贸有限公司', taxId: '110106311235740016' },
  { name: '思远工贸有限公司', taxId: '110020001012524017' },
  { name: '新越工贸有限公司', taxId: '110113050173019018' },
  { name: '隆飞物流有限公司', taxId: '100108231234856019' },
  { name: '百联集团有限公司', taxId: '100108666987335020' },
  { name: '五洲进出口有限公司', taxId: '110108120101688021' },
  { name: '立新会计师事务所', taxId: '100108964537943022' },
  { name: '新华招投标有限公司', taxId: '110108120101123023' },
  { name: '融通综合服务有限公司', taxId: '100108231234858024' },
  { name: '中国工商银行北京分行营业部', taxId: '100108532345678025' },
  { name: '中国银行北京分行营业部', taxId: '100123458675432012' },
  { name: '进出口服务中心', taxId: '100123458675433013' },
]

export const SAMPLE_LINES: InvoiceLineDraft[] = [
  { name: '*办公用品*资料夹', unit: '个', qty: 36, price: 8.5, taxRate: 0.13 },
  { name: '*印刷服务*宣传册', unit: '批', qty: 2, price: 680, taxRate: 0.06 },
  { name: '*技术服务*版面设计', unit: '项', qty: 1, price: 1200, taxRate: 0.06 },
]

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const SECTION_UNITS = ['', '万', '亿', '兆']
const UNITS = ['', '拾', '佰', '仟']
const TAX_RATE_OPTIONS = [0, 0.06, 0.09, 0.13]

export function todayString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function incrementDecimalString(value: string): string {
  const digits = String(value).split('')
  let carry = 1
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const sum = Number(digits[i]) + carry
    digits[i] = String(sum % 10)
    carry = sum > 9 ? 1 : 0
    if (!carry) break
  }
  if (carry) digits.unshift('1')
  return digits.join('')
}

export function formatMoney(value: number, withSymbol = false): string {
  const text = Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `¥${text}` : text
}

export function formatUnitPrice(value: number): string {
  const number = Number(value || 0)
  return Number.isInteger(number) ? number.toFixed(2) : String(number).replace(/0+$/, '').replace(/\.$/, '')
}

export function formatDateCn(dateValue: string): string {
  if (!dateValue) return ''
  const [year, month, day] = dateValue.split('-')
  return `${year}年${month}月${day}日`
}

export function formatTaxPercent(rate: number): string {
  const percent = Number(rate || 0) * 100
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)))
}

export function getTaxRateOptions(): number[] {
  return [...TAX_RATE_OPTIONS]
}

export function isCommonTaxRate(rate: number): boolean {
  return TAX_RATE_OPTIONS.some((item) => Math.abs(item - rate) < 0.000001)
}

export function getTaxRateValue(rate: number): string {
  return isCommonTaxRate(rate) ? String(rate) : MANUAL_TAX_RATE
}

export function toChineseUpperMoney(value: number): string {
  const number = Math.round(Math.abs(Number(value || 0)) * 100)
  const integer = Math.floor(number / 100)
  const fraction = number % 100

  let intText = ''
  let intPart = integer
  let sectionIndex = 0
  let needZero = false
  if (intPart === 0) intText = '零'

  while (intPart > 0) {
    const section = intPart % 10000
    if (section === 0) {
      needZero = intText.length > 0
    } else {
      const prefix = needZero ? '零' : ''
      intText = prefix + sectionToChinese(section) + SECTION_UNITS[sectionIndex] + intText
      needZero = section < 1000
    }
    intPart = Math.floor(intPart / 10000)
    sectionIndex += 1
  }

  const jiao = Math.floor(fraction / 10)
  const fen = fraction % 10
  let fractionText = ''
  if (jiao === 0 && fen === 0) {
    fractionText = '整'
  } else {
    if (jiao > 0) fractionText += DIGITS[jiao] + '角'
    if (fen > 0) fractionText += DIGITS[fen] + '分'
  }
  return `ⓧ${intText}圆${fractionText}`
}

function sectionToChinese(section: number): string {
  let result = ''
  let zero = false
  let current = section
  for (let i = 0; i < 4; i += 1) {
    const digit = current % 10
    if (digit === 0) {
      if (result) zero = true
    } else {
      result = DIGITS[digit] + UNITS[i] + (zero ? '零' : '') + result
      zero = false
    }
    current = Math.floor(current / 10)
  }
  return result
}

export function buildInvoiceLine(line: InvoiceLineDraft): InvoiceLine {
  const qty = Number(line.qty || 0)
  const price = Number(line.price || 0)
  const taxRate = Number(line.taxRate || 0)
  const amount = roundMoney(qty * price)
  const taxAmount = roundMoney(amount * taxRate)
  return {
    name: String(line.name || '').trim(),
    unit: String(line.unit || '份').trim() || '份',
    qty,
    price,
    taxRate,
    amount,
    taxAmount,
  }
}

export function ensureQrPayload(
  data: Pick<InvoiceDraft, 'invoiceNumber' | 'invoiceDate' | 'qrPayload'>,
  forceNew: boolean,
  randomFactory: () => string = defaultRandomFactory
): string {
  if (!forceNew && data.qrPayload) return data.qrPayload
  return `VBSE|NO:${data.invoiceNumber}|DATE:${data.invoiceDate}|CHK:${randomFactory()}|TRAINING`
}

function defaultRandomFactory(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export function buildInvoice(
  draft: InvoiceDraft,
  options?: { id?: string; savedAt?: string; forceNewQr?: boolean }
): InvoiceRecord {
  const lines = draft.lines
    .map((line) => buildInvoiceLine(line))
    .filter((line) => line.name || line.qty || line.price)

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)
  const totalTax = lines.reduce((sum, line) => sum + line.taxAmount, 0)
  const grandTotal = totalAmount + totalTax

  const invoice: InvoiceRecord = {
    id: options?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    savedAt: options?.savedAt || new Date().toISOString(),
    invoiceNumber: draft.invoiceNumber.trim() || DEFAULT_INVOICE_NUMBER,
    invoiceDate: draft.invoiceDate,
    buyerName: draft.buyerName.trim(),
    buyerTax: draft.buyerTax.trim(),
    sellerName: draft.sellerName.trim(),
    sellerTax: draft.sellerTax.trim(),
    drawer: draft.drawer.trim(),
    remark: draft.remark.trim(),
    lines,
    totalAmount,
    totalTax,
    grandTotal,
    qrPayload: '',
  }

  invoice.qrPayload = ensureQrPayload(
    {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      qrPayload: draft.qrPayload,
    },
    options?.forceNewQr ?? false
  )

  return invoice
}

export function buildInvoiceSummary(invoice: InvoiceRecord): InvoiceSummary {
  return {
    upperAmount: toChineseUpperMoney(invoice.grandTotal),
    grandTotalText: formatMoney(invoice.grandTotal, true),
    totalAmountText: formatMoney(invoice.totalAmount, true),
    totalTaxText: formatMoney(invoice.totalTax, true),
    lineCount: Math.max(8, invoice.lines.length),
  }
}

export function validateInvoiceDraft(draft: InvoiceDraft): string {
  if (!draft.invoiceDate) return '请选择开票日期'
  if (!draft.buyerName || !draft.buyerTax) return '请选择或填写购买方名称和税号'
  if (!draft.sellerName || !draft.sellerTax) return '请选择或填写销售方名称和税号'
  if (draft.lines.length === 0) return '请至少填写一行项目明细'
  if (draft.lines.some((line) => !String(line.name || '').trim())) return '项目明细的名称不能为空'
  if (draft.lines.some((line) => Number(line.qty) <= 0 || Number(line.price) < 0)) return '数量必须大于 0，不含税单价不能为负数'
  if (draft.lines.some((line) => Number(line.taxRate) < 0 || Number(line.taxRate) > 1)) return '税率请输入 0 到 100 之间的百分比'
  return ''
}

export function findCompanyValue(name: string, taxId: string): string {
  const index = COMPANY_OPTIONS.findIndex((company) => company.name === name && company.taxId === taxId)
  return index >= 0 ? String(index) : MANUAL_COMPANY
}

export function getCompanyByValue(value: string): CompanyOption | null {
  if (value === MANUAL_COMPANY) return null
  return COMPANY_OPTIONS[Number(value)] || null
}

export function getInitialLines(): InvoiceLineDraft[] {
  return SAMPLE_LINES.map((line) => ({ ...line }))
}

export function createEmptyLine(): InvoiceLineDraft {
  return {
    name: '',
    unit: '份',
    qty: 1,
    price: 0,
    taxRate: 0.13,
  }
}

export function createDefaultDraft(dateValue = todayString(), invoiceNumber = DEFAULT_INVOICE_NUMBER): InvoiceDraft {
  return {
    invoiceNumber,
    invoiceDate: dateValue,
    buyerName: '',
    buyerTax: '',
    sellerName: '',
    sellerTax: '',
    drawer: '',
    remark: '',
    lines: [createEmptyLine()],
  }
}

export function createSampleDraft(dateValue = todayString(), invoiceNumber = DEFAULT_INVOICE_NUMBER): InvoiceDraft {
  return {
    invoiceNumber,
    invoiceDate: dateValue,
    buyerName: COMPANY_OPTIONS[7].name,
    buyerTax: COMPANY_OPTIONS[7].taxId,
    sellerName: COMPANY_OPTIONS[0].name,
    sellerTax: COMPANY_OPTIONS[0].taxId,
    drawer: '李明',
    remark: '购方开户银行：--;    银行账号：-;\n销方开户银行：--;    银行账号：-',
    lines: getInitialLines(),
  }
}

export function normalizeHistoryRecord(item: Partial<InvoiceRecord>): InvoiceRecord {
  const draft: InvoiceDraft = {
    invoiceNumber: String(item.invoiceNumber || DEFAULT_INVOICE_NUMBER),
    invoiceDate: String(item.invoiceDate || ''),
    buyerName: String(item.buyerName || ''),
    buyerTax: String(item.buyerTax || ''),
    sellerName: String(item.sellerName || ''),
    sellerTax: String(item.sellerTax || ''),
    drawer: String(item.drawer || ''),
    remark: String(item.remark || ''),
    qrPayload: typeof item.qrPayload === 'string' ? item.qrPayload : undefined,
    lines: Array.isArray(item.lines)
      ? item.lines.map((line) => ({
          name: String(line.name || ''),
          unit: String(line.unit || '份'),
          qty: Number(line.qty || 0),
          price: Number(line.price || 0),
          taxRate: Number(line.taxRate || 0),
        }))
      : [],
  }

  return buildInvoice(draft, {
    id: typeof item.id === 'string' ? item.id : undefined,
    savedAt: typeof item.savedAt === 'string' ? item.savedAt : undefined,
    forceNewQr: false,
  })
}

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}
