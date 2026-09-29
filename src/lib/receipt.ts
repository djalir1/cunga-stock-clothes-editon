import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { SHOP } from '@/config/shop';
import { formatRWF } from '@/lib/format';

export interface ReceiptLine {
  item_name: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  /** Set the piece was sold in, e.g. "Linen suit" */
  set_name?: string | null;
}

export interface ReceiptGroup {
  /** null for pieces sold on their own */
  set_name: string | null;
  lines: ReceiptLine[];
  total: number;
}

/** Pieces sold as part of a set are shown together under the set's name. */
export function groupReceiptLines(lines: ReceiptLine[]): ReceiptGroup[] {
  const groups: ReceiptGroup[] = [];
  const bySet = new Map<string, ReceiptGroup>();
  for (const l of lines) {
    const amount = l.quantity * l.unit_price;
    if (!l.set_name) { groups.push({ set_name: null, lines: [l], total: amount }); continue; }
    let g = bySet.get(l.set_name);
    if (!g) { g = { set_name: l.set_name, lines: [], total: 0 }; bySet.set(l.set_name, g); groups.push(g); }
    g.lines.push(l);
    g.total += amount;
  }
  return groups;
}

export interface ReceiptSale {
  receipt_no: number;
  sold_at: string;
  customer_name: string | null;
  total: number;
  amount_paid: number;
  payment_status: string;
  payment_method: string;
  lines: ReceiptLine[];
  /** Balance still owed on this sale, if any (live from the debt) */
  balance?: number | null;
  due_date?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', mobile_money: 'Mobile Money', bank: 'Bank', other: 'Other',
};

export const receiptNumber = (n: number) => `#${String(n).padStart(5, '0')}`;

/** 80 mm till-roll receipt. */
function buildReceipt(sale: ReceiptSale): jsPDF {
  const width = 80;
  const margin = 5;
  const lineGap = 4.2;
  const groups = groupReceiptLines(sale.lines);
  const height = 78 + sale.lines.length * 9 + groups.filter(g => g.set_name).length * 5 + (sale.payment_status !== 'paid' ? 14 : 0);
  const doc = new jsPDF({ unit: 'mm', format: [width, height] });
  const right = width - margin;
  let y = 9;

  const center = (text: string, size: number, bold = false) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(text, width / 2, y, { align: 'center' });
    y += size * 0.45;
  };
  const row = (left: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(left, margin, y);
    doc.text(value, right, y, { align: 'right' });
    y += lineGap;
  };
  const rule = () => {
    doc.setDrawColor(180); doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(margin, y - 1.5, right, y - 1.5);
    y += 2;
  };

  doc.setTextColor(20);
  center(SHOP.name, 13, true);
  center(SHOP.tagline, 8.5);
  center([SHOP.location, SHOP.phone].filter(Boolean).join(' · '), 7.5);
  y += 2;
  rule();

  doc.setFontSize(8);
  row(`Receipt ${receiptNumber(sale.receipt_no)}`, format(new Date(sale.sold_at), 'dd MMM yyyy HH:mm'));
  if (sale.customer_name) row('Customer', sale.customer_name);
  rule();

  groups.forEach(g => {
    if (g.set_name) {
      doc.setFontSize(8.5);
      row(`SET: ${g.set_name}`, formatRWF(g.total), true);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      g.lines.forEach(l => {
        const option = [l.size, l.color].filter(Boolean).join(' / ');
        doc.text(doc.splitTextToSize(`  ${l.quantity} × ${l.item_name}${option ? ` (${option})` : ''}`, width - margin * 2)[0], margin, y);
        y += lineGap;
      });
      doc.setFontSize(8);
      return;
    }
    const l = g.lines[0];
    const option = [l.size, l.color].filter(Boolean).join(' / ');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(option ? `${l.item_name} (${option})` : l.item_name, width - margin * 2)[0], margin, y);
    y += lineGap;
    doc.setFont('helvetica', 'normal');
    row(`  ${l.quantity} × ${formatRWF(l.unit_price)}`, formatRWF(l.quantity * l.unit_price));
  });
  rule();

  doc.setFontSize(10);
  row('TOTAL', formatRWF(sale.total), true);
  doc.setFontSize(8);
  row(`Paid (${METHOD_LABELS[sale.payment_method] ?? sale.payment_method})`, formatRWF(sale.amount_paid));
  if (sale.payment_status !== 'paid') {
    const owed = sale.balance ?? sale.total - sale.amount_paid;
    row('Balance owed', formatRWF(owed), true);
    if (sale.due_date) row('Pay by', format(new Date(sale.due_date), 'dd MMM yyyy'));
  }
  rule();

  y += 1;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(SHOP.receiptFooter, width - margin * 2), width / 2, y, { align: 'center' });
  return doc;
}

export function downloadReceipt(sale: ReceiptSale) {
  buildReceipt(sale).save(`receipt-${sale.receipt_no}.pdf`);
}

/** Opens the receipt in a new tab with the print dialog. */
export function printReceipt(sale: ReceiptSale) {
  const doc = buildReceipt(sale);
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}
