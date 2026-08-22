import { useState } from 'react';
import { FEATURES } from '@/config/features';
import { useAuth } from '@/contexts/AuthContext';
import { useTemporaryLoans, TempStockItem, TempStockLoan } from '@/hooks/useTemporaryLoans';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Timer, CheckCircle2, Trash2, AlertTriangle,
  User, Package, BookOpen, ShieldCheck, RefreshCcw,
  FileSpreadsheet, FileDown, Filter
} from 'lucide-react';
import { format, formatDistanceToNow, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-fade-in">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
          <Timer className="w-12 h-12 text-primary" />
        </div>
        <span className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
          <span className="text-white text-xs font-bold">!</span>
        </span>
      </div>
      <Badge className="mb-4 bg-amber-100 text-amber-700 border border-amber-300 text-sm px-4 py-1">
        Paid Feature — Coming Soon
      </Badge>
      <h2 className="text-2xl font-bold mb-2">Temporary Stock</h2>
      <p className="text-muted-foreground max-w-md text-base leading-relaxed">
        This feature allows staff to lend items to teachers and track returns.
        It's being prepared and will be available once activated.
      </p>
      <p className="mt-6 text-sm text-muted-foreground/60 italic">
        Contact your system administrator to enable this module.
      </p>
    </div>
  );
}

function TemporaryStockContent() {
  const { role } = useAuth();
  const isKeeper = role === 'storekeeper';
  const today = new Date().toISOString().slice(0, 10);

  const {
    items, loans, activeLoans, returnedLoans, overdueLoans, isLoading,
    addItem, deleteItem, lendItem, returnLoan, deleteLoan,
  } = useTemporaryLoans();

  // --- Add Item dialog ---
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', total_quantity: '1' });

  // --- Lend dialog ---
  const [lendingItem, setLendingItem] = useState<TempStockItem | null>(null);
  const [lendForm, setLendForm] = useState({
    teacher_name: '', department: '', quantity: '1',
    borrowed_date: today, expected_return_date: '', notes: '',
  });

  // --- Confirm dialogs ---
  const [returnConfirmId, setReturnConfirmId] = useState<string | null>(null);
  const [deleteItemConfirmId, setDeleteItemConfirmId] = useState<string | null>(null);
  const [deleteLoanConfirmId, setDeleteLoanConfirmId] = useState<string | null>(null);

  // --- Reports ---
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [hasFiltered, setHasFiltered] = useState(false);

  const reportLoans = hasFiltered && reportStart && reportEnd
    ? loans.filter(l => {
        const d = new Date(l.borrowed_date);
        return isWithinInterval(d, { start: startOfDay(new Date(reportStart)), end: endOfDay(new Date(reportEnd)) });
      })
    : [];

  // --- Helpers ---
  const isOverdue = (loan: TempStockLoan) =>
    loan.expected_return_date && loan.expected_return_date < today;

  const fmtDate = (d: string | null) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  const resetItemForm = () => setItemForm({ name: '', description: '', total_quantity: '1' });
  const openLend = (item: TempStockItem) => {
    setLendingItem(item);
    setLendForm({ teacher_name: '', department: '', quantity: '1', borrowed_date: today, expected_return_date: '', notes: '' });
  };

  const handleAddItem = async () => {
    if (!itemForm.name.trim()) return;
    await addItem.mutateAsync({ name: itemForm.name, description: itemForm.description || undefined, total_quantity: Number(itemForm.total_quantity) || 1 });
    resetItemForm();
    setIsAddItemOpen(false);
  };

  const handleLend = async () => {
    if (!lendingItem || !lendForm.teacher_name.trim()) return;
    await lendItem.mutateAsync({
      item_id: lendingItem.id,
      teacher_name: lendForm.teacher_name,
      department: lendForm.department || undefined,
      quantity: Number(lendForm.quantity) || 1,
      borrowed_date: lendForm.borrowed_date,
      expected_return_date: lendForm.expected_return_date || undefined,
      notes: lendForm.notes || undefined,
    });
    setLendingItem(null);
  };

  // --- CSV export ---
  const exportCSV = () => {
    const rows = reportLoans;
    let csv = 'Teacher,Department,Item,Qty,Borrowed Date,Expected Return,Actual Return,Status,Notes\n';
    rows.forEach(l => {
      csv += `"${l.teacher_name}","${l.department || ''}","${l.item_name}",${l.quantity},${fmtDate(l.borrowed_date)},${fmtDate(l.expected_return_date)},${fmtDate(l.actual_return_date)},${l.status},"${l.notes || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cunga-temp-stock-report-${reportStart}-to-${reportEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- PDF export ---
  const exportPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const navy: [number, number, number] = [30, 58, 138];
    const now = new Date();
    const generatedAt = format(now, 'dd MMM yyyy, HH:mm:ss');

    let logoBase64: string | null = null;
    try {
      const res = await fetch('/cunga-logo-nobg.png');
      const blob = await res.blob();
      logoBase64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* unavailable */ }

    if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 8, 32, 16);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
    doc.text('Cunga Stock', pageWidth - 14, 16, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Temporary Stock Management', pageWidth - 14, 22, { align: 'right' });
    doc.setDrawColor(...navy); doc.setLineWidth(0.6);
    doc.line(14, 27, pageWidth - 14, 27);

    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text('Teacher Lending Report', 14, 37);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${fmtDate(reportStart)} – ${fmtDate(reportEnd)}`, 14, 44);
    doc.text(`Generated: ${generatedAt}`, 14, 50);
    doc.text(`Total records: ${reportLoans.length}`, 14, 56);

    const tableData = reportLoans.map(l => [
      l.teacher_name,
      l.department || '—',
      l.item_name,
      l.quantity.toString(),
      fmtDate(l.borrowed_date),
      fmtDate(l.expected_return_date),
      fmtDate(l.actual_return_date),
      l.status === 'returned' ? 'Returned' : 'Active',
      l.notes || '—',
    ]);

    autoTable(doc, {
      startY: 62,
      head: [['Teacher', 'Dept', 'Item', 'Qty', 'Borrowed', 'Exp. Return', 'Returned', 'Status', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [241, 245, 255] },
      styles: { fontSize: 7.5, cellPadding: 3 },
      columnStyles: { 8: { cellWidth: 28 } },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
      doc.text('Cunga Stock — Temporary Stock', 14, pageHeight - 10);
      doc.text(`Page ${i} of ${pageCount}  •  ${generatedAt}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }

    doc.save(`cunga-temp-stock-${reportStart}-to-${reportEnd}.pdf`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Temporary Stock</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Items temporarily lent to teachers</p>
            {!isKeeper && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
                <ShieldCheck className="w-3 h-3" /> View Only
              </Badge>
            )}
          </div>
        </div>
        {isKeeper && (
          <Button className="gap-2" onClick={() => setIsAddItemOpen(true)}>
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Package className="w-5 h-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">Items in Stock</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Timer className="w-5 h-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{activeLoans.length}</p><p className="text-xs text-muted-foreground">Active Loans</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
              <div><p className="text-2xl font-bold text-amber-500">{overdueLoans.length}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="active">Active ({activeLoans.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ── INVENTORY TAB ── */}
        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Lendable Items</CardTitle>
              <CardDescription>Items available to lend to teachers</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No items yet. {isKeeper && 'Click "Add Item" to get started.'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Available</TableHead>
                      <TableHead className="text-center">Out</TableHead>
                      {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.description || '—'}</TableCell>
                        <TableCell className="text-center font-mono">{item.total_quantity}</TableCell>
                        <TableCell className="text-center font-mono">
                          <span className={item.available_quantity === 0 ? 'text-destructive font-semibold' : 'text-green-600 font-semibold'}>
                            {item.available_quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-rose-600">
                          {item.total_quantity - item.available_quantity}
                        </TableCell>
                        {isKeeper && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => openLend(item)}
                                disabled={item.available_quantity === 0}
                              >
                                <BookOpen className="w-3.5 h-3.5" /> Lend
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteItemConfirmId(item.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ACTIVE LOANS TAB ── */}
        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Loans</CardTitle>
              <CardDescription>Items currently out with teachers</CardDescription>
            </CardHeader>
            <CardContent>
              {activeLoans.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No active loans. All items are in.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Borrowed</TableHead>
                      <TableHead>Expected Return</TableHead>
                      <TableHead>Notes</TableHead>
                      {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLoans.map(loan => (
                      <TableRow key={loan.id} className={isOverdue(loan) ? 'bg-amber-500/5' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />{loan.teacher_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{loan.department || '—'}</TableCell>
                        <TableCell>{loan.item_name}</TableCell>
                        <TableCell className="text-center font-mono">{loan.quantity}</TableCell>
                        <TableCell className="text-sm">{fmtDate(loan.borrowed_date)}</TableCell>
                        <TableCell>
                          {loan.expected_return_date ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-sm ${isOverdue(loan) ? 'text-amber-600 font-semibold' : ''}`}>
                                {fmtDate(loan.expected_return_date)}
                              </span>
                              {isOverdue(loan) && (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                  {formatDistanceToNow(new Date(loan.expected_return_date!), { addSuffix: true })}
                                </Badge>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{loan.notes || '—'}</TableCell>
                        {isKeeper && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm" variant="outline"
                                className="gap-1 text-green-600 border-green-600/30 hover:bg-green-600/10"
                                onClick={() => setReturnConfirmId(loan.id)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Returned
                              </Button>
                              <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteLoanConfirmId(loan.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Return History</CardTitle>
              <CardDescription>Items that have been returned</CardDescription>
            </CardHeader>
            <CardContent>
              {returnedLoans.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No returned items yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Borrowed</TableHead>
                      <TableHead>Returned</TableHead>
                      <TableHead>Notes</TableHead>
                      {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnedLoans.map(loan => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">{loan.teacher_name}</TableCell>
                        <TableCell className="text-muted-foreground">{loan.department || '—'}</TableCell>
                        <TableCell>{loan.item_name}</TableCell>
                        <TableCell className="text-center font-mono">{loan.quantity}</TableCell>
                        <TableCell className="text-sm">{fmtDate(loan.borrowed_date)}</TableCell>
                        <TableCell className="text-sm text-green-600 font-medium">{fmtDate(loan.actual_return_date)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{loan.notes || '—'}</TableCell>
                        {isKeeper && (
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteLoanConfirmId(loan.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REPORTS TAB ── */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Filter className="w-4 h-4" /> Filter by Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={reportStart} onChange={e => { setReportStart(e.target.value); setHasFiltered(false); }} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={reportEnd} onChange={e => { setReportEnd(e.target.value); setHasFiltered(false); }} />
                </div>
                <Button onClick={() => setHasFiltered(true)} disabled={!reportStart || !reportEnd} className="gap-2">
                  <Filter className="w-4 h-4" /> Generate Report
                </Button>
                {hasFiltered && (
                  <Button variant="ghost" onClick={() => { setHasFiltered(false); setReportStart(''); setReportEnd(''); }}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {hasFiltered && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Lending Report</CardTitle>
                  <CardDescription>
                    {fmtDate(reportStart)} – {fmtDate(reportEnd)} &nbsp;·&nbsp; {reportLoans.length} records
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={reportLoans.length === 0}>
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </Button>
                  <Button className="gap-2" onClick={exportPDF} disabled={reportLoans.length === 0}>
                    <FileDown className="w-4 h-4" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {reportLoans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No loans in the selected date range.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>Borrowed</TableHead>
                        <TableHead>Returned</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportLoans.map(l => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.teacher_name}</TableCell>
                          <TableCell className="text-muted-foreground">{l.department || '—'}</TableCell>
                          <TableCell>{l.item_name}</TableCell>
                          <TableCell className="text-center font-mono">{l.quantity}</TableCell>
                          <TableCell className="text-sm">{fmtDate(l.borrowed_date)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(l.actual_return_date)}</TableCell>
                          <TableCell>
                            {l.status === 'returned'
                              ? <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Returned</Badge>
                              : <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Active</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Item Dialog ── */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Item to Temporary Stock</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 30cm Ruler, Calculator, Scissors" value={itemForm.name}
                onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input placeholder="e.g. Wooden ruler, scientific calculator" value={itemForm.description}
                onChange={e => setItemForm({ ...itemForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Total Quantity</Label>
              <Input type="number" min="1" value={itemForm.total_quantity}
                onChange={e => setItemForm({ ...itemForm, total_quantity: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetItemForm(); setIsAddItemOpen(false); }}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!itemForm.name.trim() || addItem.isPending}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lend Dialog ── */}
      <Dialog open={!!lendingItem} onOpenChange={v => !v && setLendingItem(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Lend Item</DialogTitle>
            {lendingItem && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{lendingItem.name}</span>
                &nbsp;·&nbsp;{lendingItem.available_quantity} available
              </p>
            )}
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2 col-span-2">
              <Label>Teacher Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Mr. John Smith" value={lendForm.teacher_name}
                onChange={e => setLendForm({ ...lendForm, teacher_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Department / Subject</Label>
              <Input placeholder="e.g. Mathematics" value={lendForm.department}
                onChange={e => setLendForm({ ...lendForm, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="1" max={lendingItem?.available_quantity}
                value={lendForm.quantity}
                onChange={e => setLendForm({ ...lendForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date Borrowed <span className="text-destructive">*</span></Label>
              <Input type="date" value={lendForm.borrowed_date}
                onChange={e => setLendForm({ ...lendForm, borrowed_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Expected Return Date</Label>
              <Input type="date" value={lendForm.expected_return_date}
                onChange={e => setLendForm({ ...lendForm, expected_return_date: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional details..." rows={2} value={lendForm.notes}
                onChange={e => setLendForm({ ...lendForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLendingItem(null)}>Cancel</Button>
            <Button onClick={handleLend}
              disabled={!lendForm.teacher_name.trim() || !lendForm.borrowed_date || lendItem.isPending}>
              Confirm Lending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Return Confirm ── */}
      <AlertDialog open={!!returnConfirmId} onOpenChange={() => setReturnConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Returned?</AlertDialogTitle>
            <AlertDialogDescription>Today's date will be recorded as the return date and the item will be added back to available stock.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-600 hover:bg-green-700"
              onClick={() => { if (returnConfirmId) returnLoan.mutate(returnConfirmId); setReturnConfirmId(null); }}>
              Confirm Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Item Confirm ── */}
      <AlertDialog open={!!deleteItemConfirmId} onOpenChange={() => setDeleteItemConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the item and all its loan records. Cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteItemConfirmId) deleteItem.mutate(deleteItemConfirmId); setDeleteItemConfirmId(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Loan Confirm ── */}
      <AlertDialog open={!!deleteLoanConfirmId} onOpenChange={() => setDeleteLoanConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete loan record?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the lending record. If the item is still out, the quantity will be restored.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteLoanConfirmId) deleteLoan.mutate(deleteLoanConfirmId); setDeleteLoanConfirmId(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function TemporaryStock() {
  return FEATURES.temporaryStock ? <TemporaryStockContent /> : <ComingSoon />;
}
