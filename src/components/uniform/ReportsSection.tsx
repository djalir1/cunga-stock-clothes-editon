import { useState } from 'react';
import { FileDown, Filter, Calendar } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IssuedUniform } from '@/types/uniform';
import { toast } from 'sonner';

interface ReportsSectionProps {
  records: IssuedUniform[];
}

export const ReportsSection = ({ records }: ReportsSectionProps) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filteredRecords, setFilteredRecords] = useState<IssuedUniform[]>([]);
  const [hasFiltered, setHasFiltered] = useState(false);

  const handleFilter = () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filtered = records.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= start && recordDate <= end;
    });

    setFilteredRecords(filtered);
    setHasFiltered(true);
    toast.success(`Found ${filtered.length} records in the selected date range`);
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    setFilteredRecords([]);
    setHasFiltered(false);
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const groupByCategory = (recs: IssuedUniform[]): Record<string, IssuedUniform[]> => {
    return recs.reduce((groups, record) => {
      const cat = record.uniformCategory;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(record);
      return groups;
    }, {} as Record<string, IssuedUniform[]>);
  };

  const generatePDF = async () => {
    if (filteredRecords.length === 0) {
      toast.error('No records to export. Please filter records first.');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const navy: [number, number, number] = [30, 58, 138];
    const now = new Date();
    const generatedAt = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      + ', ' + now.toLocaleTimeString('en-US', { hour12: false });

    // Load logo
    let logoBase64: string | null = null;
    try {
      const res = await fetch('/cunga-logo-nobg.png');
      const blob = await res.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* logo unavailable */ }

    if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 8, 32, 16);

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('Cunga Stock', pageWidth - 14, 16, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Stock Management System', pageWidth - 14, 22, { align: 'right' });

    doc.setDrawColor(...navy);
    doc.setLineWidth(0.6);
    doc.line(14, 27, pageWidth - 14, 27);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Student Uniform Issuance Report', 14, 37);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Period: ${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`,
      14, 44,
    );
    doc.text(`Generated: ${generatedAt}`, 14, 50);
    doc.text(`Total Records: ${filteredRecords.length}`, 14, 56);

    const grouped = groupByCategory(filteredRecords);
    let currentY = 64;

    Object.entries(grouped).forEach(([category, categoryRecords]) => {
      // Category header band
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(...navy);
      doc.rect(14, currentY, pageWidth - 28, 8, 'F');
      doc.text(
        `${category}  (${categoryRecords.length} record${categoryRecords.length !== 1 ? 's' : ''})`,
        17,
        currentY + 5.5,
      );

      currentY += 10;

      const tableData = categoryRecords.map(record => [
        record.studentName,
        record.uniformName,
        record.quantityTaken.toString(),
        formatDate(record.date),
      ]);

      autoTable(doc, {
        head: [['Student Name', 'Uniform', 'Quantity', 'Date']],
        body: tableData,
        startY: currentY,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [241, 245, 255] },
        margin: { left: 14, right: 14 },
      });

      const categoryTotal = categoryRecords.reduce((sum, r) => sum + r.quantityTaken, 0);
      currentY = (doc as any).lastAutoTable.finalY + 4;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`Subtotal for ${category}: ${categoryTotal} issued`, 14, currentY);
      currentY += 10;
    });

    // Grand total
    const totalQuantity = filteredRecords.reduce((sum, r) => sum + r.quantityTaken, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`Grand Total Issued: ${totalQuantity}`, 14, currentY);

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('Cunga Stock Management System', 14, doc.internal.pageSize.height - 10);
      doc.text(
        `Page ${i} of ${pageCount}  •  ${generatedAt}`,
        pageWidth - 14,
        doc.internal.pageSize.height - 10,
        { align: 'right' },
      );
    }

    doc.save(`cunga-uniform-report-${startDate}-to-${endDate}.pdf`);
    toast.success('PDF report downloaded successfully');
  };

  const groupedRecords = groupByCategory(filteredRecords);

  return (
    <div className="bg-card rounded-lg card-shadow p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-warning/10 rounded-lg">
          <Calendar className="h-5 w-5 text-warning" />
        </div>
        <h2 className="text-xl font-semibold text-card-foreground">Reports</h2>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={handleFilter} className="flex-1">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          {hasFiltered && (
            <Button variant="outline" onClick={clearFilter}>
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-end">
          <Button
            onClick={generatePDF}
            variant="secondary"
            className="w-full"
            disabled={filteredRecords.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Results grouped by category */}
      {hasFiltered && (
        <div className="overflow-x-auto">
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {filteredRecords.length} records from{' '}
            {new Date(startDate).toLocaleDateString()} to{' '}
            {new Date(endDate).toLocaleDateString()}
          </div>

          {filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No records found in the selected date range.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedRecords).map(([category, categoryRecords]) => (
                <div key={category} className="border border-border rounded-lg overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-primary text-primary-foreground">
                    <span className="font-semibold text-sm tracking-wide uppercase">
                      {category}
                    </span>
                    <span className="text-xs opacity-80">
                      {categoryRecords.length} record{categoryRecords.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Uniform</TableHead>
                        <TableHead className="text-center">Quantity</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.studentName}</TableCell>
                          <TableCell>{record.uniformName}</TableCell>
                          <TableCell className="text-center font-medium">
                            {record.quantityTaken}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(record.date)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Category subtotal */}
                  <div className="px-4 py-2 bg-secondary text-sm text-right border-t border-border">
                    <span className="text-muted-foreground">Subtotal: </span>
                    <span className="font-bold text-primary">
                      {categoryRecords.reduce((sum, r) => sum + r.quantityTaken, 0)} issued
                    </span>
                  </div>
                </div>
              ))}

              {/* Grand total */}
              <div className="p-3 bg-secondary rounded-lg flex justify-between items-center">
                <span className="font-medium">Grand Total Issued</span>
                <span className="text-primary font-bold text-lg">
                  {filteredRecords.reduce((sum, r) => sum + r.quantityTaken, 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {!hasFiltered && (
        <div className="text-center py-8 text-muted-foreground">
          Select a date range and click "Filter" to view reports.
        </div>
      )}
    </div>
  );
};