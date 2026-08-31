/**
 * Report Generator Utility
 * Generates branded, professional PDF and CSV reports.
 */

const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

const BRAND_NAME = 'Restaurant';

/* ─── Brand palette (mirrors the client's red/gold theme) ───
   PDFKit's standard fonts only support WinAnsi glyphs, so currency is
   rendered as a literal "Rs." prefix rather than a Rupee sign glyph,
   which the built-in fonts cannot draw. */
const BRAND = {
    primary: '#b91c1c',
    primaryDark: '#7f1d1d',
    accent: '#f59e0b',
    text: '#111827',
    textMuted: '#6b7280',
    border: '#e2e8f0',
    stripe: '#f5f5fa',
    success: '#059669',
    danger: '#dc2626',
    warning: '#d97706',
};

/* ─── Formatting helpers ─── */
function formatCurrency(value) {
    const num = Number(value) || 0;
    return `Rs. ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function titleCase(key) {
    return String(key)
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
}

function statusColor(status) {
    const s = String(status || '').toLowerCase();
    if (['delivered', 'completed', 'success', 'paid'].includes(s)) return BRAND.success;
    if (['cancelled', 'failed', 'rejected', 'declined'].includes(s)) return BRAND.danger;
    if (['pending', 'processing', 'preparing', 'confirmed', 'out_for_delivery'].includes(s)) return BRAND.warning;
    return BRAND.text;
}

function autoSum(data, keys) {
    for (const key of keys) {
        if (data.length && data[0][key] !== undefined) {
            const sum = data.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
            return { key, sum };
        }
    }
    return null;
}

/* ─── Per-report-type table column definitions (PDF) ───
   `flex` values are proportional weights; actual pixel widths are
   computed against the available content width at render time. */
function getTableConfig(reportType, data) {
    switch (reportType) {
        case 'orders_report': {
            const rows = (data || []).flatMap((order) => {
                const items = order.items && order.items.length > 0
                    ? order.items
                    : [{ productName: order.productName || 'N/A', quantity: order.quantity || 0, unitPrice: order.price || 0, subtotal: order.totalAmount || 0 }];

                return items.map((item, idx) => ({
                    orderId: idx === 0 ? (order.orderId || 'N/A') : '',
                    orderDate: idx === 0 ? (order.orderDate || (order.createdAt ? formatDate(order.createdAt) : 'N/A')) : '',
                    productName: item.productName || 'N/A',
                    quantity: item.quantity || 0,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal,
                    status: idx === 0 ? (order.status || 'N/A') : '',
                }));
            });
            return {
                rows,
                statusColumns: ['status'],
                columns: [
                    { key: 'orderId', label: 'Order ID', flex: 1.4 },
                    { key: 'orderDate', label: 'Date', flex: 1.15 },
                    { key: 'productName', label: 'Product', flex: 2.5 },
                    { key: 'quantity', label: 'Qty', flex: 0.7, align: 'right' },
                    { key: 'unitPrice', label: 'Unit Price', flex: 1.25, align: 'right', format: formatCurrency },
                    { key: 'subtotal', label: 'Subtotal', flex: 1.25, align: 'right', format: formatCurrency },
                    { key: 'status', label: 'Status', flex: 1.0, bold: true },
                ],
            };
        }

        case 'user_activity_report':
            return {
                rows: data || [],
                statusColumns: ['status'],
                columns: [
                    { key: 'action', label: 'Action', flex: 1.3, format: (v) => String(v || 'N/A').replace(/_/g, ' ') },
                    { key: 'actionDescription', label: 'Description', flex: 2.3 },
                    { key: 'status', label: 'Status', flex: 0.9, bold: true },
                    { key: 'ipAddress', label: 'IP Address', flex: 1.1, format: (v) => v || '—' },
                    { key: 'timestamp', label: 'Timestamp', flex: 1.6, format: formatDateTime },
                ],
            };

        case 'sales_report':
            return {
                rows: data || [],
                statusColumns: [],
                columns: [
                    { key: 'orderId', label: 'Order ID', flex: 1.2 },
                    { key: 'userName', label: 'Customer', flex: 1.6 },
                    { key: 'productName', label: 'Product', flex: 1.6 },
                    { key: 'quantity', label: 'Qty', flex: 0.6, align: 'right' },
                    { key: 'totalAmount', label: 'Amount', flex: 1.1, align: 'right', format: formatCurrency },
                    { key: 'createdAt', label: 'Date', flex: 1.3, format: formatDate },
                ],
            };

        case 'orders_analytics':
            return {
                rows: data || [],
                statusColumns: ['status'],
                columns: [
                    { key: 'orderId', label: 'Order ID', flex: 1.2 },
                    { key: 'customer', label: 'Customer', flex: 1.6 },
                    { key: 'totalAmount', label: 'Amount', flex: 1.0, align: 'right', format: formatCurrency },
                    { key: 'status', label: 'Status', flex: 1.0, bold: true },
                    { key: 'paymentMethod', label: 'Payment', flex: 1.1, format: (v) => String(v || 'N/A').replace(/_/g, ' ') },
                    { key: 'createdAt', label: 'Date', flex: 1.3 },
                ],
            };

        case 'menu_analytics':
            return {
                rows: data || [],
                statusColumns: [],
                columns: [
                    { key: 'itemName', label: 'Item', flex: 2.2 },
                    { key: 'totalQuantitySold', label: 'Qty Sold', flex: 1.0, align: 'right' },
                    { key: 'totalRevenue', label: 'Revenue', flex: 1.2, align: 'right', format: formatCurrency },
                    { key: 'orderCount', label: 'Orders', flex: 0.9, align: 'right' },
                    { key: 'avgPrice', label: 'Avg Price', flex: 1.1, align: 'right', format: formatCurrency },
                ],
            };

        case 'payments_analytics':
            return {
                rows: data || [],
                statusColumns: [],
                columns: [
                    { key: 'paymentMethod', label: 'Payment Method', flex: 1.6, format: (v) => String(v || 'N/A').replace(/_/g, ' ') },
                    { key: 'transactionCount', label: 'Transactions', flex: 1.0, align: 'right' },
                    { key: 'totalRevenue', label: 'Revenue', flex: 1.3, align: 'right', format: formatCurrency },
                ],
            };

        case 'kitchen_analytics':
            return {
                rows: data || [],
                statusColumns: [],
                columns: [
                    { key: 'hour', label: 'Hour', flex: 1 },
                    { key: 'orders', label: 'Orders', flex: 1, align: 'right' },
                    { key: 'revenue', label: 'Revenue', flex: 1.3, align: 'right', format: formatCurrency },
                ],
            };

        default: {
            const keys = data && data[0] ? Object.keys(data[0]) : [];
            return {
                rows: data || [],
                statusColumns: [],
                columns: keys.map((key) => ({ key, label: titleCase(key), flex: 1 })),
            };
        }
    }
}

/* ─── Per-report-type CSV column labels (kept separate from the PDF
   config since CSV rows are shaped slightly differently — e.g. orders
   are flattened to one row per line item upstream in ReportService). ─── */
const CSV_COLUMNS = {
    orders_report: [
        { value: 'orderId', label: 'Order ID' },
        { value: 'orderDate', label: 'Order Date' },
        { value: 'productName', label: 'Product' },
        { value: 'quantity', label: 'Quantity' },
        { value: 'unitPrice', label: 'Unit Price (Rs.)' },
        { value: 'subtotal', label: 'Subtotal (Rs.)' },
        { value: 'orderTotal', label: 'Order Total (Rs.)' },
        { value: 'status', label: 'Status' },
        { value: 'paymentStatus', label: 'Payment Status' },
    ],
    user_activity_report: [
        { value: 'action', label: 'Action' },
        { value: 'actionDescription', label: 'Description' },
        { value: 'timestamp', label: 'Timestamp' },
        { value: 'ipAddress', label: 'IP Address' },
        { value: 'status', label: 'Status' },
    ],
    sales_report: [
        { value: 'orderId', label: 'Order ID' },
        { value: 'userName', label: 'Customer' },
        { value: 'productName', label: 'Product' },
        { value: 'quantity', label: 'Quantity' },
        { value: 'totalAmount', label: 'Amount (Rs.)' },
        { value: 'createdAt', label: 'Order Date' },
        { value: 'deliveredAt', label: 'Delivered At' },
    ],
    orders_analytics: [
        { value: 'orderId', label: 'Order ID' },
        { value: 'customer', label: 'Customer' },
        { value: 'totalAmount', label: 'Amount (Rs.)' },
        { value: 'status', label: 'Status' },
        { value: 'paymentMethod', label: 'Payment Method' },
        { value: 'paymentStatus', label: 'Payment Status' },
        { value: 'createdAt', label: 'Date' },
    ],
    menu_analytics: [
        { value: 'itemName', label: 'Item' },
        { value: 'totalQuantitySold', label: 'Quantity Sold' },
        { value: 'totalRevenue', label: 'Revenue (Rs.)' },
        { value: 'orderCount', label: 'Orders' },
        { value: 'avgPrice', label: 'Avg Price (Rs.)' },
    ],
    payments_analytics: [
        { value: 'paymentMethod', label: 'Payment Method' },
        { value: 'transactionCount', label: 'Transactions' },
        { value: 'totalRevenue', label: 'Revenue (Rs.)' },
    ],
    kitchen_analytics: [
        { value: 'hour', label: 'Hour' },
        { value: 'orders', label: 'Orders' },
        { value: 'revenue', label: 'Revenue (Rs.)' },
    ],
};

class ReportGenerator {
    /**
     * Generate a branded PDF report.
     * @param {Object} reportData - Report metadata (title, reportType, format, createdAt, dateRange, metadata)
     * @param {Array} data - Array of data records
     * @returns {Promise<Buffer>}
     */
    static async generatePDF(reportData, data) {
        return new Promise((resolve, reject) => {
            try {
                const rows = Array.isArray(data) ? data : [];
                const doc = new PDFDocument({ margin: 0, bufferPages: true, size: 'letter' });
                const chunks = [];

                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                const contentLeft = 40;
                const contentWidth = doc.page.width - 80;

                let y = this.drawHeader(doc, reportData);
                y += 24;

                const cards = this.buildSummaryCards(reportData, rows);
                y = this.drawSummaryCards(doc, cards, { contentLeft, contentWidth, y });

                y = this.drawSectionTitle(doc, 'Report Data', { contentLeft, y });

                const tableConfig = getTableConfig(reportData.reportType, rows);
                this.renderTable(doc, {
                    columns: tableConfig.columns,
                    rows: tableConfig.rows,
                    statusColumns: tableConfig.statusColumns,
                    startY: y,
                    contentLeft,
                    contentWidth,
                });

                this.drawFooters(doc, reportData);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /* ── Header band: flat brand color, monogram, title, format pill ── */
    static drawHeader(doc, reportData) {
        const pageWidth = doc.page.width;
        const headerH = 108;

        doc.rect(0, 0, pageWidth, headerH).fill(BRAND.primaryDark);
        doc.rect(0, headerH, pageWidth, 3).fill(BRAND.accent);

        // Monogram badge
        doc.save();
        doc.fillOpacity(0.18);
        doc.roundedRect(40, 28, 40, 40, 10).fill('#ffffff');
        doc.restore();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
            .text(BRAND_NAME.charAt(0).toUpperCase(), 40, 39, { width: 40, align: 'center' });

        // Title + subtitle
        const textX = 96;
        const textW = pageWidth - textX - 130;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19)
            .text(reportData.title || 'Report', textX, 28, { width: textW, ellipsis: true });
        doc.fillColor('#ffffff', 0.85).font('Helvetica').fontSize(9.5)
            .text(
                `${String(reportData.reportType || '').replace(/_/g, ' ')} · generated ${formatDateTime(reportData.createdAt || new Date())}`,
                textX,
                52,
                { width: textW }
            );
        doc.fillColor('#ffffff', 0.7).font('Helvetica').fontSize(8.5)
            .text(BRAND_NAME, textX, 72, { width: textW });

        // Format pill
        const pillW = 74, pillH = 22;
        const pillX = pageWidth - 40 - pillW, pillY = 34;
        doc.save();
        doc.fillOpacity(0.2);
        doc.roundedRect(pillX, pillY, pillW, pillH, 11).fill('#ffffff');
        doc.restore();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
            .text(String(reportData.format || 'pdf').toUpperCase(), pillX, pillY + 6, { width: pillW, align: 'center' });

        return headerH + 3;
    }

    /* ── KPI summary cards row ── */
    static buildSummaryCards(reportData, data) {
        const meta = reportData.metadata || {};
        const count = meta.totalRecords ?? data.length;
        const cards = [{ label: 'Total Records', value: String(count) }];

        let moneyLabel = null;
        let moneyValue;
        if (meta.totalValue !== undefined) {
            moneyLabel = 'Total Value';
            moneyValue = meta.totalValue;
        } else if (meta.totalRevenue !== undefined) {
            moneyLabel = 'Total Revenue';
            moneyValue = meta.totalRevenue;
        } else {
            const auto = autoSum(data, ['totalAmount', 'totalRevenue', 'revenue']);
            if (auto) {
                moneyLabel = 'Total Revenue';
                moneyValue = auto.sum;
            }
        }
        if (moneyLabel) cards.push({ label: moneyLabel, value: formatCurrency(moneyValue) });

        if (reportData.dateRange?.startDate && reportData.dateRange?.endDate) {
            cards.push({ label: 'Period', value: `${formatDate(reportData.dateRange.startDate)} - ${formatDate(reportData.dateRange.endDate)}` });
        } else {
            cards.push({ label: 'Period', value: 'All Time' });
        }

        if (moneyLabel && count > 0 && cards.length < 4) {
            cards.push({ label: 'Average / Record', value: formatCurrency(moneyValue / count) });
        }

        return cards.slice(0, 4);
    }

    static drawSummaryCards(doc, cards, { contentLeft, contentWidth, y }) {
        if (!cards.length) return y;
        const gap = 12;
        const cardW = (contentWidth - gap * (cards.length - 1)) / cards.length;
        const cardH = 54;

        cards.forEach((card, i) => {
            const x = contentLeft + i * (cardW + gap);
            doc.roundedRect(x, y, cardW, cardH, 8).fillAndStroke(BRAND.stripe, BRAND.border);
            doc.fillColor(BRAND.textMuted).font('Helvetica-Bold').fontSize(7.5)
                .text(card.label.toUpperCase(), x + 12, y + 10, { width: cardW - 24 });
            doc.fillColor(BRAND.primaryDark).font('Helvetica-Bold').fontSize(14)
                .text(card.value, x + 12, y + 27, { width: cardW - 24, ellipsis: true });
        });

        return y + cardH + 22;
    }

    static drawSectionTitle(doc, text, { contentLeft, y }) {
        doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12).text(text, contentLeft, y);
        doc.moveTo(contentLeft, y + 17).lineTo(contentLeft + 34, y + 17).lineWidth(2.5).strokeColor(BRAND.primary).stroke();
        return y + 30;
    }

    /* ── Generic, pagination-aware, zebra-striped data table ── */
    static renderTable(doc, { columns, rows, statusColumns = [], startY, contentLeft, contentWidth }) {
        const HEADER_H = 24;
        const ROW_H = 20;
        const FOOTER_RESERVE = 55;

        const totalFlex = columns.reduce((sum, col) => sum + (col.flex || 1), 0);
        const widths = columns.map((col) => ((col.flex || 1) / totalFlex) * contentWidth);
        const xPositions = [];
        let acc = contentLeft;
        widths.forEach((w) => { xPositions.push(acc); acc += w; });

        const drawTableHeader = (y) => {
            doc.rect(contentLeft, y, contentWidth, HEADER_H).fill(BRAND.primary);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
            columns.forEach((col, i) => {
                doc.text(col.label.toUpperCase(), xPositions[i] + 8, y + 8, {
                    width: widths[i] - 12,
                    align: col.align || 'left',
                });
            });
            return y + HEADER_H;
        };

        const startNewPage = () => {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 5).fill(BRAND.primary);
            doc.fillColor(BRAND.textMuted).font('Helvetica-Oblique').fontSize(8)
                .text('Report continued', contentLeft, 16);
            return drawTableHeader(40);
        };

        let y = drawTableHeader(startY);

        if (!rows.length) {
            doc.fillColor(BRAND.textMuted).font('Helvetica-Oblique').fontSize(10)
                .text('No records found for the selected period.', contentLeft, y + 20, {
                    width: contentWidth,
                    align: 'center',
                });
            return y + 60;
        }

        rows.forEach((row, idx) => {
            if (y + ROW_H > doc.page.height - FOOTER_RESERVE) {
                y = startNewPage();
            }

            if (idx % 2 === 1) {
                doc.rect(contentLeft, y, contentWidth, ROW_H).fill(BRAND.stripe);
            }

            columns.forEach((col, i) => {
                const raw = col.format ? col.format(row[col.key], row) : (row[col.key] ?? '—');
                const color = statusColumns.includes(col.key) ? statusColor(row[col.key]) : BRAND.text;
                doc.fillColor(color).font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
                doc.text(String(raw === '' ? '' : raw), xPositions[i] + 8, y + 6, {
                    width: widths[i] - 12,
                    align: col.align || 'left',
                    height: ROW_H - 4,
                    ellipsis: true,
                });
            });

            y += ROW_H;
        });

        doc.moveTo(contentLeft, y).lineTo(contentLeft + contentWidth, y).lineWidth(0.5).strokeColor(BRAND.border).stroke();

        return y + 10;
    }

    /* ── Footer stamped on every buffered page: brand + owner + page numbers ── */
    static drawFooters(doc, reportData = {}) {
        const range = doc.bufferedPageRange();
        const genStamp = new Date().toLocaleString();
        const generatedBy = reportData.generatedBy;
        const ownerLabel = generatedBy?.name
            ? ` · by ${generatedBy.name}${generatedBy.email ? ` (${generatedBy.email})` : ''}`
            : '';

        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);
            const pw = doc.page.width;
            const ph = doc.page.height;

            doc.moveTo(40, ph - 40).lineTo(pw - 40, ph - 40).lineWidth(0.5).strokeColor(BRAND.border).stroke();
            doc.fillColor(BRAND.textMuted).font('Helvetica').fontSize(8)
                .text(`${BRAND_NAME} · generated ${genStamp}${ownerLabel}`, 40, ph - 30, { width: pw / 2 - 40, ellipsis: true });
            doc.fillColor(BRAND.textMuted).font('Helvetica').fontSize(8)
                .text(`Page ${i - range.start + 1} of ${range.count}`, pw / 2, ph - 30, { width: pw / 2 - 40, align: 'right' });
        }
    }

    /**
     * Generate a CSV report with a readable title/metadata preamble
     * and human-friendly column headers.
     * @param {Array} data - Array of data records
     * @param {string} [reportType] - Used to look up friendly column labels
     * @param {Object} [meta] - { title, dateRange }
     * @returns {string} CSV content
     */
    static generateCSV(data, reportType, meta = {}) {
        try {
            const rows = Array.isArray(data) ? data : [];
            const preamble = [];

            if (meta.title) preamble.push(`"${String(meta.title).replace(/"/g, '""')}"`);
            preamble.push(`"Generated: ${new Date().toLocaleString()}"`);
            if (meta.dateRange?.startDate && meta.dateRange?.endDate) {
                preamble.push(`"Period: ${formatDate(meta.dateRange.startDate)} - ${formatDate(meta.dateRange.endDate)}"`);
            }
            preamble.push(`"Total Records: ${rows.length}"`);
            preamble.push('');

            if (rows.length === 0) {
                preamble.push('"No records found for the selected period."');
                return preamble.join('\n');
            }

            const fields = CSV_COLUMNS[reportType];
            const parser = new Parser(fields ? { fields } : undefined);
            const body = parser.parse(rows);

            return `${preamble.join('\n')}\n${body}`;
        } catch (error) {
            console.error('Error generating CSV:', error);
            throw new Error('Failed to generate CSV report');
        }
    }
}

module.exports = ReportGenerator;
