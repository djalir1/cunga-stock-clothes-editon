import { useState } from 'react';
import { useStockItems } from '@/hooks/useStockItems';
import { useStockMovements } from '@/hooks/useStockMovements';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  FileText, 
  Calendar as CalendarIcon, 
  Package, 
  TrendingUp, 
  TrendingDown,
  Filter,
  FileSpreadsheet,
  FileDown
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const { items } = useStockItems();
  const { data: movements = [] } = useStockMovements();
  const { categories } = useCategories();
  
  const getRecipient = (notes: string | null) =>
    notes?.startsWith('Issued to: ') ? notes.split('\n')[0].replace('Issued to: ', '') : null;

  const [reportType, setReportType] = useState<string>('full');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const filteredItems = items.filter((item) => {
    const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    
    let matchesDate = true;
    if (dateRange?.from && dateRange?.to) {
      const itemDate = new Date(item.created_at);
      matchesDate = isWithinInterval(itemDate, {
        start: startOfDay(dateRange.from),
        end: endOfDay(dateRange.to),
      });
    }
    
    return matchesCategory && matchesStatus && matchesDate;
  });

  const filteredMovements = movements.filter((movement) => {
    let matchesDate = true;
    if (dateRange?.from && dateRange?.to) {
      const movementDate = new Date(movement.created_at);
      matchesDate = isWithinInterval(movementDate, {
        start: startOfDay(dateRange.from),
        end: endOfDay(dateRange.to),
      });
    }
    return matchesDate;
  });

  const getReportData = () => {
    switch (reportType) {
      case 'in_stock':
        return filteredItems.filter(i => i.status === 'in_stock');
      case 'out_of_stock':
        return filteredItems.filter(i => i.status === 'out_of_stock');
      case 'low_stock':
        return filteredItems.filter(i => i.status === 'low_stock');
      case 'movements':
        return filteredMovements;
      default:
        return filteredItems;
    }
  };

  const reportData = getReportData();
  const isMovementReport = reportType === 'movements';

  const exportToCSV = () => {
    let csvContent = '';
    
    if (isMovementReport) {
      csvContent = 'Date,Time,Item,Type,Quantity,Previous Qty,New Qty,Notes,Issued To\n';
      filteredMovements.forEach((m) => {
        const date = format(new Date(m.created_at), 'yyyy-MM-dd');
        const time = format(new Date(m.created_at), 'HH:mm:ss');
        const itemName = m.item_name || 'Unknown';
        csvContent += `${date},${time},"${itemName}",${m.movement_type},${m.quantity},${m.previous_quantity},${m.new_quantity},"${m.notes?.startsWith('Issued to: ') ? '' : (m.notes || '')}","${getRecipient(m.notes) || ''}"\n`;
      });
    } else {
      // Updated CSV headers + columns for the three quantity fields
      csvContent = 'Name,Category,Total Added,Remaining,Issued,Status,Date Added,Last Updated\n';
      (reportData as typeof filteredItems).forEach((item) => {
        const dateAdded = format(new Date(item.created_at), 'yyyy-MM-dd HH:mm');
        const lastUpdated = format(new Date(item.updated_at), 'yyyy-MM-dd HH:mm');
        csvContent += `"${item.name}","${item.category?.name || 'Uncategorized'}",${item.total_added ?? 0},${item.quantity},${item.issued ?? 0},${item.status},${dateAdded},${lastUpdated}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cunga-stock-report-${reportType}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const now = new Date();
    const generatedAt = format(now, 'dd MMM yyyy, HH:mm:ss');
    const reportTitle = reportTypes.find(r => r.value === reportType)?.label || 'Stock Report';
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const navy: [number, number, number] = [30, 58, 138];
    const accentRow: [number, number, number] = [241, 245, 255];

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

    // Header block
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', 14, 8, 32, 16);
    }
    doc.setFontSize(22);
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.text('Cunga Stock', pageWidth - 14, 16, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Stock Management System', pageWidth - 14, 22, { align: 'right' });

    // Separator
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.6);
    doc.line(14, 27, pageWidth - 14, 27);

    // Report title + meta
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(reportTitle, 14, 37);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    let metaY = 44;
    if (dateRange?.from && dateRange?.to) {
      doc.text(`Period: ${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`, 14, metaY);
      metaY += 6;
    }
    doc.text(`Generated: ${generatedAt}`, 14, metaY);

    const startY = metaY + 10;

    if (isMovementReport) {
      const tableData = filteredMovements.map((m) => [
        format(new Date(m.created_at), 'dd MMM yyyy'),
        format(new Date(m.created_at), 'HH:mm:ss'),
        m.item_name || 'Unknown',
        m.movement_type.charAt(0).toUpperCase() + m.movement_type.slice(1),
        m.quantity.toString(),
        m.previous_quantity.toString(),
        m.new_quantity.toString(),
        m.notes?.startsWith('Issued to: ') ? '' : (m.notes || '–'),
        getRecipient(m.notes) || '–',
      ]);

      autoTable(doc, {
        startY,
        head: [['Date', 'Time', 'Item', 'Type', 'Qty', 'Prev', 'New', 'Notes', 'Issued To']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: accentRow },
        styles: { fontSize: 7.5, cellPadding: 3 },
        columnStyles: { 7: { cellWidth: 32 }, 8: { cellWidth: 28 } },
      });
    } else {
      const tableData = (reportData as typeof filteredItems).map((item) => [
        item.name,
        item.category?.name || 'Uncategorized',
        (item.total_added ?? 0).toString(),
        item.quantity.toString(),
        (item.issued ?? 0).toString(),
        item.status.replace(/_/g, ' ').toUpperCase(),
        format(new Date(item.created_at), 'dd MMM yyyy HH:mm'),
        format(new Date(item.updated_at), 'dd MMM yyyy HH:mm'),
      ]);

      autoTable(doc, {
        startY,
        head: [['Name', 'Category', 'Total Added', 'Remaining', 'Issued', 'Status', 'Date Added', 'Last Updated']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: accentRow },
        styles: { fontSize: 7.5, cellPadding: 3 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Cunga Stock Management System', 14, pageHeight - 10);
      doc.text(
        `Page ${i} of ${pageCount}  •  ${generatedAt}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: 'right' },
      );
    }

    doc.save(`cunga-stock-report-${reportType}-${format(now, 'yyyy-MM-dd')}.pdf`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_stock': return <Badge className="bg-success/20 text-success border-0">In Stock</Badge>;
      case 'low_stock': return <Badge className="bg-warning/20 text-warning border-0">Low Stock</Badge>;
      case 'out_of_stock': return <Badge variant="destructive">Out of Stock</Badge>;
      default: return null;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'added': return <Badge className="bg-success/20 text-success border-0"><TrendingUp className="w-3 h-3 mr-1" />Added</Badge>;
      case 'issued': return <Badge className="bg-destructive/20 text-destructive border-0"><TrendingDown className="w-3 h-3 mr-1" />Issued</Badge>;
      case 'returned': return <Badge className="bg-primary/20 text-primary border-0">Returned</Badge>;
      case 'adjusted': return <Badge variant="outline">Adjusted</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const reportTypes = [
    { value: 'full', label: 'Full Stock Report', icon: Package, count: items.length },
    { value: 'in_stock', label: 'In Stock Items', icon: TrendingUp, count: items.filter(i => i.status === 'in_stock').length },
    { value: 'out_of_stock', label: 'Out of Stock', icon: TrendingDown, count: items.filter(i => i.status === 'out_of_stock').length },
    { value: 'low_stock', label: 'Low Stock Alert', icon: Package, count: items.filter(i => i.status === 'low_stock').length },
    { value: 'movements', label: 'Movement History', icon: FileText, count: movements.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Generate and export stock reports</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </Button>
          <Button onClick={exportToPDF} className="gap-2">
            <FileDown className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Report Type Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          const isActive = reportType === type.value;
          return (
            <Card
              key={type.value}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                isActive && 'ring-2 ring-primary bg-primary/5'
              )}
              onClick={() => setReportType(type.value)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center">
                <Icon className={cn('w-6 h-6 mb-2', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm font-medium">{type.label}</p>
                <p className="text-2xl font-bold text-primary">{type.count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[280px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(dateRange.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {!isMovementReport && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="low_stock">Low Stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {dateRange && (
              <div className="flex items-end">
                <Button variant="ghost" onClick={() => setDateRange(undefined)}>
                  Clear Dates
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle>{reportTypes.find(r => r.value === reportType)?.label}</CardTitle>
          <CardDescription>
            {isMovementReport 
              ? `${filteredMovements.length} movement records`
              : `${(reportData as typeof filteredItems).length} items found`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMovementReport ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-center">Prev</TableHead>
                  <TableHead className="text-center">New</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Issued To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{format(new Date(movement.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(movement.created_at), 'HH:mm')}</TableCell>
                    <TableCell className="font-medium">{movement.item_name || 'Unknown'}</TableCell>
                    <TableCell>{getMovementBadge(movement.movement_type)}</TableCell>
                    <TableCell className="text-center font-mono">{movement.quantity}</TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{movement.previous_quantity}</TableCell>
                    <TableCell className="text-center font-mono">{movement.new_quantity}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {movement.notes?.startsWith('Issued to: ') ? '—' : (movement.notes || '—')}
                    </TableCell>
                    <TableCell className="font-medium">{getRecipient(movement.notes) || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Total Added</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportData as typeof filteredItems).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {item.category ? (
                        <Badge variant="outline" style={{ borderColor: item.category.color }}>
                          {item.category.name}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono">{item.total_added ?? 0}</TableCell>
                    <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-center font-mono text-rose-600">
                      {item.issued ?? 0}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-sm">{format(new Date(item.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(item.updated_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}