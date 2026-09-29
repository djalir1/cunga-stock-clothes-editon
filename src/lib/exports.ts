import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { SHOP } from '@/config/shop';

type Cell = string | number | null | undefined;

/** Plain CSV (Excel opens it). Money columns are raw numbers so they can be summed. */
export function downloadCSV(filename: string, header: string[], rows: Cell[][]) {
  const esc = (v: Cell) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface PdfSection {
  title: string;
  head: string[];
  body: Cell[][];
  /** Bold last row (totals) */
  totals?: boolean;
}

/** A4 report with the shop name, title, period and one table per section. */
export function downloadPDF(filename: string, title: string, subtitle: string, sections: PdfSection[], footnote?: string) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;
  const navy: [number, number, number] = [30, 58, 138];

  if (SHOP.logoData) {
    const props = doc.getImageProperties(SHOP.logoData);
    const h = 14, lw = Math.min(40, (props.width / props.height) * h);
    doc.addImage(SHOP.logoData, w - 14 - lw, 10, lw, (lw / props.width) * props.height);
  }
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(SHOP.name, 14, 18);
  doc.setFontSize(12); doc.setTextColor(30, 30, 30);
  doc.text(title, 14, 27);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
  doc.text(`${subtitle}   ·   Printed ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 33);

  let y = 40;
  sections.forEach(sec => {
    if (y > h - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(sec.title, 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [sec.head],
      body: sec.body.map(r => r.map(c => (c === null || c === undefined ? '—' : String(c)))),
      theme: 'grid',
      headStyles: { fillColor: navy, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2 },
      alternateRowStyles: { fillColor: [241, 245, 255] },
      didParseCell: data => {
        if (sec.totals && data.section === 'body' && data.row.index === sec.body.length - 1) data.cell.styles.fontStyle = 'bold';
        if (data.column.index > 0 && /^(FRW|USD|EUR) |^-?\d[\d,]*%?$/.test(String(data.cell.raw ?? ''))) data.cell.styles.halign = 'right';
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10;
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    if (footnote) doc.text(footnote, 14, h - 14);
    doc.text(`${SHOP.name} · Powered by Cunga Stock`, 14, h - 10);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 10, { align: 'right' });
  }
  doc.save(filename);
}
