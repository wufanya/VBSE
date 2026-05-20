"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const invoice_1 = require("../../utils/invoice");
const storage_1 = require("../../utils/storage");
const qr_1 = require("../../utils/qr");
const COMPANY_OPTION_VIEWS = invoice_1.COMPANY_OPTIONS
    .map((company, index) => ({ label: company.name, value: String(index) }))
    .concat([{ label: '手动输入企业', value: invoice_1.MANUAL_COMPANY }]);
const TAX_RATE_OPTION_VIEWS = (0, invoice_1.getTaxRateOptions)().map((rate) => ({
    label: `${(0, invoice_1.formatTaxPercent)(rate)}%`,
    value: String(rate),
})).concat([{ label: '手动', value: invoice_1.MANUAL_TAX_RATE }]);
const EXPORT_WIDTH = 750;
let currentPreviewInvoice = null;
let toastTimer;
function getCompanyIndex(name, taxId) {
    const value = (0, invoice_1.findCompanyValue)(name, taxId);
    const index = COMPANY_OPTION_VIEWS.findIndex((item) => item.value === value);
    return index >= 0 ? index : COMPANY_OPTION_VIEWS.length - 1;
}
function getTaxRateIndex(rate) {
    const value = (0, invoice_1.getTaxRateValue)(rate);
    const index = TAX_RATE_OPTION_VIEWS.findIndex((item) => item.value === value);
    return index >= 0 ? index : TAX_RATE_OPTION_VIEWS.length - 1;
}
function toLineView(line) {
    const qty = Number(line.qty || 0);
    const price = Number(line.price || 0);
    const taxRate = Number(line.taxRate || 0);
    const amount = qty * price;
    const taxAmount = amount * taxRate;
    const taxRateValue = (0, invoice_1.getTaxRateValue)(taxRate);
    const taxRateIndex = getTaxRateIndex(taxRate);
    return {
        name: line.name,
        unit: line.unit,
        qty,
        price,
        taxRateValue,
        taxRateManual: taxRateValue === invoice_1.MANUAL_TAX_RATE ? (0, invoice_1.formatTaxPercent)(taxRate) : '',
        taxRateIndex,
        taxRateLabel: (TAX_RATE_OPTION_VIEWS[taxRateIndex] && TAX_RATE_OPTION_VIEWS[taxRateIndex].label) || '手动',
        amountText: (0, invoice_1.formatMoney)(amount),
        taxAmountText: (0, invoice_1.formatMoney)(taxAmount),
    };
}
function buildDraftLines(lines) {
    return lines.map((line) => ({
        name: line.name,
        unit: line.unit,
        qty: Number(line.qty || 0),
        price: Number(line.price || 0),
        taxRate: line.taxRateValue === invoice_1.MANUAL_TAX_RATE
            ? Number(line.taxRateManual || 0) / 100
            : Number(line.taxRateValue || 0),
    }));
}
function buildPreviewRows(invoice) {
    const summary = (0, invoice_1.buildInvoiceSummary)(invoice);
    const rows = invoice.lines.map((line) => ({
        name: line.name,
        unit: line.unit,
        qtyText: String(line.qty),
        priceText: (0, invoice_1.formatUnitPrice)(line.price),
        amountText: (0, invoice_1.formatMoney)(line.amount),
        taxRateText: `${(0, invoice_1.formatTaxPercent)(line.taxRate)}%`,
        taxAmountText: (0, invoice_1.formatMoney)(line.taxAmount),
    }));
    while (rows.length < summary.lineCount) {
        rows.push({
            name: '',
            unit: '',
            qtyText: '',
            priceText: '',
            amountText: '',
            taxRateText: '',
            taxAmountText: '',
            empty: true,
        });
    }
    return rows;
}
function buildDraftFromRecord(record) {
    return {
        invoiceNumber: record.invoiceNumber,
        invoiceDate: record.invoiceDate,
        buyerName: record.buyerName,
        buyerTax: record.buyerTax,
        sellerName: record.sellerName,
        sellerTax: record.sellerTax,
        drawer: record.drawer,
        remark: record.remark,
        qrPayload: record.qrPayload,
        lines: record.lines.map((line) => ({
            name: line.name,
            unit: line.unit,
            qty: line.qty,
            price: line.price,
            taxRate: line.taxRate,
        })),
    };
}
function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const paragraphs = text.split('\n');
    let currentY = y;
    for (const paragraph of paragraphs) {
        let line = '';
        for (const char of paragraph) {
            const next = line + char;
            if (ctx.measureText(next).width > maxWidth && line) {
                ctx.fillText(line, x, currentY);
                currentY += lineHeight;
                line = char;
                maxLines -= 1;
                if (maxLines <= 0)
                    return;
            }
            else {
                line = next;
            }
        }
        if (line) {
            ctx.fillText(line, x, currentY);
            currentY += lineHeight;
            maxLines -= 1;
            if (maxLines <= 0)
                return;
        }
    }
}
function drawCellText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    let currentLine = '';
    let currentY = y;
    let renderedLines = 0;
    for (const char of text) {
        const next = currentLine + char;
        if (ctx.measureText(next).width > maxWidth && currentLine) {
            ctx.fillText(currentLine, x, currentY);
            currentY += lineHeight;
            renderedLines += 1;
            currentLine = char;
            if (renderedLines >= maxLines)
                return;
        }
        else {
            currentLine = next;
        }
    }
    if (currentLine && renderedLines < maxLines) {
        ctx.fillText(currentLine, x, currentY);
    }
}
function fitTextSize(ctx, text, maxWidth, initialSize, fontFamily, fontWeight = '400', minSize = 9) {
    let size = initialSize;
    while (size > minSize) {
        ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
        if (ctx.measureText(text).width <= maxWidth)
            return size;
        size -= 1;
    }
    ctx.font = `${fontWeight} ${minSize}px ${fontFamily}`;
    return minSize;
}
function drawFittedText(ctx, text, x, y, maxWidth, initialSize, fontFamily, align = 'left', fontWeight = '400', minSize = 9) {
    fitTextSize(ctx, text, maxWidth, initialSize, fontFamily, fontWeight, minSize);
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}
function drawVerticalLabel(ctx, chars, x, y, lineHeight) {
    chars.forEach((char, index) => {
        ctx.fillText(char, x, y + index * lineHeight);
    });
}
function getPosterHeight(lineCount) {
    const bodyRows = Math.max(lineCount, 6);
    return 462 + bodyRows * 24 + 110;
}
function renderPoster(canvas, invoice) {
    const ratio = wx.getSystemInfoSync().pixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const bodyRows = Math.max(invoice.lines.length, 6);
    const exportHeight = getPosterHeight(invoice.lines.length);
    canvas.width = EXPORT_WIDTH * ratio;
    canvas.height = exportHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, EXPORT_WIDTH, exportHeight);
    const borderColor = '#4f4f4f';
    const textColor = '#202020';
    const tableX = 16;
    const tableWidth = 718;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 20, 62, 62);
    (0, qr_1.drawQrMatrix)(ctx, (0, qr_1.makeQrMatrix)(invoice.qrPayload), 50, 24, 26);
    ctx.fillStyle = '#9d1f18';
    drawFittedText(ctx, '电子发票（普通发票）', 344, 38, 320, 27, 'KaiTi, SimSun, serif', 'center', '400', 20);
    ctx.strokeStyle = '#9d1f18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(202, 56);
    ctx.lineTo(486, 56);
    ctx.stroke();
    ctx.save();
    ctx.translate(344, 92);
    ctx.rotate(-0.12);
    ctx.strokeStyle = '#a83a32';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 64, 34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 29, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#a83a32';
    ctx.font = '12px KaiTi, SimSun, serif';
    ctx.textAlign = 'center';
    ctx.fillText('全国统一发票监制章', 0, -9);
    ctx.font = '11px KaiTi, SimSun, serif';
    ctx.fillText('税  务  总  局', 0, 12);
    ctx.restore();
    ctx.fillStyle = textColor;
    drawFittedText(ctx, `发票号码：${invoice.invoiceNumber}`, 514, 44, 206, 12, 'SimSun, serif');
    drawFittedText(ctx, `开票日期：${(0, invoice_1.formatDateCn)(invoice.invoiceDate)}`, 514, 70, 206, 12, 'SimSun, serif');
    const partyTop = 126;
    const labelWidth = 34;
    const contentWidth = 327;
    const partyHeight = 116;
    ctx.lineWidth = 2;
    ctx.strokeRect(tableX, partyTop, tableWidth, partyHeight);
    ctx.beginPath();
    ctx.moveTo(tableX + labelWidth, partyTop);
    ctx.lineTo(tableX + labelWidth, partyTop + partyHeight);
    ctx.moveTo(tableX + labelWidth + contentWidth, partyTop);
    ctx.lineTo(tableX + labelWidth + contentWidth, partyTop + partyHeight);
    ctx.moveTo(tableX + labelWidth + contentWidth + labelWidth, partyTop);
    ctx.lineTo(tableX + labelWidth + contentWidth + labelWidth, partyTop + partyHeight);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '12px FangSong, SimSun, serif';
    ctx.textAlign = 'center';
    drawVerticalLabel(ctx, ['购', '买', '方', '信', '息'], tableX + labelWidth / 2, partyTop + 22, 17);
    const sellerLabelX = tableX + labelWidth + contentWidth + labelWidth / 2;
    drawVerticalLabel(ctx, ['销', '售', '方', '信', '息'], sellerLabelX, partyTop + 22, 17);
    ctx.textAlign = 'left';
    ctx.font = '14px SimSun, serif';
    drawFittedText(ctx, `名称：${invoice.buyerName}`, tableX + labelWidth + 10, partyTop + 22, contentWidth - 16, 13, 'SimSun, serif');
    ctx.fillText('统一社会信用代码/纳税人识别号：', tableX + labelWidth + 10, partyTop + 48);
    ctx.fillText(invoice.buyerTax, tableX + labelWidth + 10, partyTop + 76);
    const sellerTextX = tableX + labelWidth + contentWidth + labelWidth + 10;
    drawFittedText(ctx, `名称：${invoice.sellerName}`, sellerTextX, partyTop + 22, contentWidth - 16, 13, 'SimSun, serif');
    ctx.fillText('统一社会信用代码/纳税人识别号：', sellerTextX, partyTop + 48);
    ctx.fillText(invoice.sellerTax, sellerTextX, partyTop + 76);
    const goodsTop = 250;
    const headerHeight = 22;
    const rowHeight = 24;
    const totalRows = bodyRows + 1;
    const goodsHeight = headerHeight + bodyRows * rowHeight + rowHeight;
    const colWidths = [188, 62, 72, 116, 108, 88, 84];
    ctx.strokeRect(tableX, goodsTop, tableWidth, goodsHeight);
    let runningX = tableX;
    colWidths.slice(0, -1).forEach((width) => {
        runningX += width;
        ctx.beginPath();
        ctx.moveTo(runningX, goodsTop);
        ctx.lineTo(runningX, goodsTop + goodsHeight);
        ctx.stroke();
    });
    for (let rowIndex = 1; rowIndex <= totalRows; rowIndex += 1) {
        const y = goodsTop + headerHeight + (rowIndex - 1) * rowHeight;
        ctx.beginPath();
        ctx.moveTo(tableX, y);
        ctx.lineTo(tableX + tableWidth, y);
        ctx.stroke();
    }
    ctx.font = '14px FangSong, serif';
    ctx.textAlign = 'center';
    const headers = ['项目名称', '单位', '数量', '不含税单价', '金额', '税率/征收率', '税额'];
    let headerX = tableX;
    headers.forEach((label, index) => {
        ctx.fillText(label, headerX + colWidths[index] / 2, goodsTop + 16);
        headerX += colWidths[index];
    });
    ctx.font = '14px SimSun, serif';
    invoice.lines.forEach((line, index) => {
        const y = goodsTop + headerHeight + index * rowHeight + 17;
        const values = [
            line.name,
            line.unit,
            String(line.qty),
            (0, invoice_1.formatUnitPrice)(line.price),
            line.amount.toFixed(2),
            `${(0, invoice_1.formatTaxPercent)(line.taxRate)}%`,
            line.taxAmount.toFixed(2),
        ];
        let x = tableX;
        values.forEach((value, valueIndex) => {
            ctx.textAlign = valueIndex === 0 ? 'left' : valueIndex === 1 || valueIndex === 5 ? 'center' : 'right';
            const drawX = valueIndex === 0 ? x + 4 : valueIndex === 1 || valueIndex === 5 ? x + colWidths[valueIndex] / 2 : x + colWidths[valueIndex] - 4;
            ctx.fillText(value, drawX, y);
            x += colWidths[valueIndex];
        });
    });
    const totalY = goodsTop + headerHeight + bodyRows * rowHeight + 17;
    ctx.font = '14px FangSong, serif';
    ctx.textAlign = 'center';
    ctx.fillText('合    计', tableX + (colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]) / 2, totalY);
    ctx.font = '14px SimSun, serif';
    ctx.textAlign = 'right';
    ctx.fillText(`￥${invoice.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] - 4, totalY);
    ctx.fillText(`￥${invoice.totalTax.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tableX + tableWidth - 4, totalY);
    const amountTop = goodsTop + goodsHeight;
    const amountHeight = 26;
    ctx.strokeRect(tableX, amountTop, tableWidth, amountHeight);
    ctx.beginPath();
    ctx.moveTo(188, amountTop);
    ctx.lineTo(188, amountTop + amountHeight);
    ctx.moveTo(530, amountTop);
    ctx.lineTo(530, amountTop + amountHeight);
    ctx.stroke();
    ctx.font = '14px FangSong, serif';
    ctx.textAlign = 'center';
    ctx.fillText('价 税 合 计 （ 大 写 ）', 102, amountTop + 18);
    ctx.textAlign = 'left';
    ctx.font = '14px SimSun, serif';
    ctx.fillText((0, invoice_1.buildInvoiceSummary)(invoice).upperAmount, 196, amountTop + 18);
    ctx.textAlign = 'center';
    ctx.fillText(`（小写）￥${invoice.grandTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 624, amountTop + 18);
    const remarkTop = amountTop + amountHeight;
    const remarkHeight = 40;
    ctx.strokeRect(tableX, remarkTop, tableWidth, remarkHeight);
    ctx.beginPath();
    ctx.moveTo(188, remarkTop);
    ctx.lineTo(188, remarkTop + remarkHeight);
    ctx.stroke();
    ctx.font = '16px FangSong, serif';
    ctx.textAlign = 'center';
    ctx.fillText('备 注', 102, remarkTop + 22);
    ctx.font = '14px SimSun, serif';
    ctx.textAlign = 'left';
    wrapText(ctx, invoice.remark || ' ', 196, remarkTop + 16, tableWidth - 206, 18, 2);
    ctx.font = '14px SimSun, serif';
    ctx.fillText(`开票人：${invoice.drawer || ''}`, 52, remarkTop + 56);
    ctx.textAlign = 'center';
    ctx.fillText('复核：', 160, remarkTop + 56);
    ctx.textAlign = 'left';
    ctx.fillText('实训票据，仅供教学使用', 226, remarkTop + 56);
    return exportHeight;
}
Page({
    data: {
        companyOptionViews: COMPANY_OPTION_VIEWS,
        taxRateOptions: TAX_RATE_OPTION_VIEWS,
        buyerCompanyIndex: COMPANY_OPTION_VIEWS.length - 1,
        sellerCompanyIndex: COMPANY_OPTION_VIEWS.length - 1,
        showBuyerManualTip: false,
        showSellerManualTip: false,
        invoiceNumber: '',
        invoiceDate: '',
        buyerName: '',
        buyerTax: '',
        sellerName: '',
        sellerTax: '',
        drawer: '',
        remark: '',
        lines: [],
        toastMessage: '',
        previewInvoiceNumber: '',
        previewInvoiceDateCn: '',
        previewBuyerName: '',
        previewBuyerTax: '',
        previewSellerName: '',
        previewSellerTax: '',
        previewRows: [],
        previewTotalAmount: '',
        previewTotalTax: '',
        previewGrandTotal: '',
        previewUpperAmount: '',
        previewRemark: '',
        previewDrawer: '',
        historyCount: 0,
        nextInvoiceNumber: '',
    },
    onLoad() {
        const nextNumber = (0, storage_1.getNextInvoiceNumber)();
        this.hydrateDraft((0, invoice_1.createSampleDraft)((0, invoice_1.todayString)(), nextNumber));
        this.refreshHistoryCount();
        wx.showShareMenu({ withShareTicket: true });
    },
    onShow() {
        this.refreshHistoryCount();
        this.consumePendingHistoryAction();
    },
    onShareAppMessage() {
        return {
            title: `VBSE 发票 ${this.data.previewInvoiceNumber || this.data.invoiceNumber}`,
            path: '/pages/index/index',
        };
    },
    refreshHistoryCount() {
        this.setData({
            historyCount: (0, storage_1.getInvoiceHistory)().length,
            nextInvoiceNumber: (0, storage_1.getNextInvoiceNumber)(),
        });
    },
    consumePendingHistoryAction() {
        const app = getApp();
        const action = app.globalData.pendingHistoryAction;
        if (!action)
            return;
        app.globalData.pendingHistoryAction = undefined;
        const record = (0, invoice_1.normalizeHistoryRecord)(action.record);
        if (action.mode === 'regenerate') {
            const draft = buildDraftFromRecord(record);
            draft.invoiceNumber = (0, storage_1.getNextInvoiceNumber)();
            draft.invoiceDate = (0, invoice_1.todayString)();
            draft.qrPayload = undefined;
            this.hydrateDraft(draft);
            this.showToast(`已载入历史发票 ${record.invoiceNumber}，可重新生成`);
            return;
        }
        this.hydrateDraft(buildDraftFromRecord(record));
        this.showToast(`已载入历史发票 ${record.invoiceNumber}`);
    },
    hydrateDraft(draft) {
        const lines = (draft.lines.length ? draft.lines : [(0, invoice_1.createEmptyLine)()]).map((line) => toLineView(line));
        this.setData({
            buyerCompanyIndex: getCompanyIndex(draft.buyerName, draft.buyerTax),
            sellerCompanyIndex: getCompanyIndex(draft.sellerName, draft.sellerTax),
            showBuyerManualTip: (0, invoice_1.findCompanyValue)(draft.buyerName, draft.buyerTax) === invoice_1.MANUAL_COMPANY,
            showSellerManualTip: (0, invoice_1.findCompanyValue)(draft.sellerName, draft.sellerTax) === invoice_1.MANUAL_COMPANY,
            invoiceNumber: draft.invoiceNumber,
            invoiceDate: draft.invoiceDate,
            buyerName: draft.buyerName,
            buyerTax: draft.buyerTax,
            sellerName: draft.sellerName,
            sellerTax: draft.sellerTax,
            drawer: draft.drawer,
            remark: draft.remark,
            lines,
        }, () => {
            this.refreshPreview();
        });
    },
    collectDraft() {
        return {
            invoiceNumber: this.data.invoiceNumber.trim() || (0, storage_1.getNextInvoiceNumber)(),
            invoiceDate: this.data.invoiceDate,
            buyerName: this.data.buyerName.trim(),
            buyerTax: this.data.buyerTax.trim(),
            sellerName: this.data.sellerName.trim(),
            sellerTax: this.data.sellerTax.trim(),
            drawer: this.data.drawer.trim(),
            remark: this.data.remark.trim(),
            lines: buildDraftLines(this.data.lines),
        };
    },
    applyPreview(invoice) {
        currentPreviewInvoice = invoice;
        const summary = (0, invoice_1.buildInvoiceSummary)(invoice);
        this.setData({
            previewInvoiceNumber: invoice.invoiceNumber,
            previewInvoiceDateCn: (0, invoice_1.formatDateCn)(invoice.invoiceDate),
            previewBuyerName: invoice.buyerName,
            previewBuyerTax: invoice.buyerTax,
            previewSellerName: invoice.sellerName,
            previewSellerTax: invoice.sellerTax,
            previewRows: buildPreviewRows(invoice),
            previewTotalAmount: summary.totalAmountText,
            previewTotalTax: summary.totalTaxText,
            previewGrandTotal: summary.grandTotalText,
            previewUpperAmount: summary.upperAmount,
            previewRemark: invoice.remark || ' ',
            previewDrawer: invoice.drawer || '—',
        }, () => {
            this.updateQrCanvas(invoice.qrPayload);
        });
    },
    refreshPreview() {
        this.applyPreview((0, invoice_1.buildInvoice)(this.collectDraft()));
    },
    showToast(message) {
        this.setData({ toastMessage: message });
        if (toastTimer !== undefined) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(() => {
            this.setData({ toastMessage: '' });
        }, 2600);
    },
    onFieldInput(e) {
        const field = String(e.currentTarget.dataset.field || '');
        if (!field)
            return;
        this.setData({ [field]: e.detail.value });
        this.refreshPreview();
    },
    onDateChange(e) {
        this.setData({ invoiceDate: e.detail.value });
        this.refreshPreview();
    },
    onCompanyChange(e) {
        const role = String(e.currentTarget.dataset.role || '');
        const optionIndex = Number(e.detail.value);
        const option = COMPANY_OPTION_VIEWS[optionIndex];
        if (!role || !option)
            return;
        const company = (0, invoice_1.getCompanyByValue)(option.value);
        const isBuyer = role === 'buyer';
        const data = isBuyer
            ? { buyerCompanyIndex: optionIndex, showBuyerManualTip: option.value === invoice_1.MANUAL_COMPANY }
            : { sellerCompanyIndex: optionIndex, showSellerManualTip: option.value === invoice_1.MANUAL_COMPANY };
        if (company) {
            if (isBuyer) {
                data.buyerName = company.name;
                data.buyerTax = company.taxId;
            }
            else {
                data.sellerName = company.name;
                data.sellerTax = company.taxId;
            }
        }
        this.setData(data);
        this.refreshPreview();
    },
    onLineInput(e) {
        const index = Number(e.currentTarget.dataset.index);
        const field = String(e.currentTarget.dataset.field || '');
        if (Number.isNaN(index) || !field)
            return;
        const lines = [...this.data.lines];
        const line = { ...lines[index] };
        if (field === 'qty' || field === 'price') {
            ;
            line[field] = Number(e.detail.value || 0);
        }
        else {
            ;
            line[field] = e.detail.value;
        }
        lines[index] = toLineView({
            name: line.name,
            unit: line.unit,
            qty: Number(line.qty || 0),
            price: Number(line.price || 0),
            taxRate: line.taxRateValue === invoice_1.MANUAL_TAX_RATE
                ? Number(line.taxRateManual || 0) / 100
                : Number(line.taxRateValue || 0),
        });
        this.setData({ lines });
        this.refreshPreview();
    },
    onTaxRateChange(e) {
        const index = Number(e.currentTarget.dataset.index);
        const optionIndex = Number(e.detail.value);
        const option = TAX_RATE_OPTION_VIEWS[optionIndex];
        if (Number.isNaN(index) || !option)
            return;
        const lines = [...this.data.lines];
        const line = { ...lines[index] };
        line.taxRateValue = option.value;
        line.taxRateIndex = optionIndex;
        line.taxRateLabel = option.label;
        if (option.value !== invoice_1.MANUAL_TAX_RATE) {
            line.taxRateManual = '';
        }
        lines[index] = toLineView({
            name: line.name,
            unit: line.unit,
            qty: Number(line.qty || 0),
            price: Number(line.price || 0),
            taxRate: line.taxRateValue === invoice_1.MANUAL_TAX_RATE
                ? Number(line.taxRateManual || 0) / 100
                : Number(line.taxRateValue || 0),
        });
        this.setData({ lines });
        this.refreshPreview();
    },
    addLine() {
        this.setData({ lines: [...this.data.lines, toLineView((0, invoice_1.createEmptyLine)())] });
        this.refreshPreview();
    },
    removeLine(e) {
        const index = Number(e.currentTarget.dataset.index);
        if (Number.isNaN(index))
            return;
        const lines = this.data.lines.filter((_line, lineIndex) => lineIndex !== index);
        this.setData({ lines: lines.length ? lines : [toLineView((0, invoice_1.createEmptyLine)())] });
        this.refreshPreview();
    },
    fillSample() {
        this.hydrateDraft((0, invoice_1.createSampleDraft)((0, invoice_1.todayString)(), (0, storage_1.getNextInvoiceNumber)()));
        this.showToast('已填入教学示例数据');
    },
    resetForm() {
        const draft = (0, invoice_1.createDefaultDraft)((0, invoice_1.todayString)(), (0, storage_1.getNextInvoiceNumber)());
        draft.lines = [(0, invoice_1.createEmptyLine)()];
        this.hydrateDraft(draft);
        this.showToast('已清空表单，保留当前起始发票号');
    },
    generateInvoice() {
        const draft = this.collectDraft();
        const error = (0, invoice_1.validateInvoiceDraft)(draft);
        if (error) {
            this.showToast(error);
            return;
        }
        const invoice = (0, invoice_1.buildInvoice)(draft, { forceNewQr: true });
        (0, storage_1.saveInvoiceHistory)(invoice);
        const nextNumber = (0, storage_1.advanceInvoiceNumber)(invoice.invoiceNumber);
        this.applyPreview(invoice);
        this.setData({
            invoiceNumber: nextNumber,
            nextInvoiceNumber: nextNumber,
        });
        this.refreshHistoryCount();
        this.showToast(`已生成并保存发票 ${invoice.invoiceNumber}`);
    },
    updateQrCanvas(text) {
        const query = wx.createSelectorQuery().in(this);
        query.select('#previewQrCanvas').fields({ node: true, size: true }).exec((result) => {
            const canvas = result[0] ? result[0].node : undefined;
            if (!canvas)
                return;
            const ratio = wx.getSystemInfoSync().pixelRatio || 1;
            canvas.width = 132 * ratio;
            canvas.height = 132 * ratio;
            (0, qr_1.drawQrToCanvas)(canvas, text, 132);
        });
    },
    savePreviewImage() {
        const invoice = currentPreviewInvoice;
        if (!invoice) {
            this.showToast('当前没有可导出的发票');
            return;
        }
        const draft = this.collectDraft();
        const error = (0, invoice_1.validateInvoiceDraft)({
            ...draft,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: draft.invoiceDate || (0, invoice_1.todayString)(),
        });
        if (error) {
            this.showToast(error);
            return;
        }
        const query = wx.createSelectorQuery().in(this);
        query.select('#exportCanvas').fields({ node: true, size: true }).exec((result) => {
            const canvas = result[0] ? result[0].node : undefined;
            if (!canvas) {
                this.showToast('导出画布初始化失败');
                return;
            }
            const exportHeight = renderPoster(canvas, invoice);
            setTimeout(() => {
                wx.canvasToTempFilePath({
                    canvas,
                    width: EXPORT_WIDTH,
                    height: exportHeight,
                    destWidth: EXPORT_WIDTH * 2,
                    destHeight: exportHeight * 2,
                    fileType: 'png',
                    success: (exportResult) => {
                        wx.saveImageToPhotosAlbum({
                            filePath: exportResult.tempFilePath,
                            success: () => this.showToast('发票图片已保存到系统相册'),
                            fail: (saveError) => {
                                const message = String(saveError.errMsg || '');
                                if (message.includes('auth') || message.includes('deny')) {
                                    wx.showModal({
                                        title: '需要相册权限',
                                        content: '请在设置中允许保存到相册后重试。',
                                        success: (modalResult) => {
                                            if (modalResult.confirm) {
                                                wx.openSetting();
                                            }
                                        },
                                    });
                                    return;
                                }
                                this.showToast('保存失败，请稍后再试');
                            },
                        });
                    },
                    fail: () => this.showToast('导出失败，请稍后再试'),
                });
            }, 80);
        });
    },
    goHistory() {
        wx.navigateTo({
            url: '/pages/logs/logs',
            fail: () => this.showToast('历史页打开失败，请重新编译后再试'),
        });
    },
});
