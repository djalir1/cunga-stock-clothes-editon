import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FEATURES } from '@/config/features';
import { useAuth } from '@/contexts/AuthContext';
import { useTemporaryStock, TempStockCheckout, CheckoutStatus } from '@/hooks/useTemporaryStock';
import { useStockItems } from '@/hooks/useStockItems';
import { formatRWF } from '@/lib/format';
import { FormDialog } from '@/components/shop/FormDialog';
import { CustomerPicker, type CustomerChoice } from '@/components/shop/CustomerPicker';
import { VariantPicker, type PickedVariant } from '@/components/shop/VariantPicker';
import { OptionTag } from '@/components/shop/OptionPickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Timer, CheckCircle2, Trash2, AlertTriangle,
  User, Package, ShoppingBag, ShieldCheck, RefreshCcw,
  FileSpreadsheet, FileDown, Filter, Undo2, Phone, ChevronDown, Minus
} from 'lucide-react';
import { addDays, format, formatDistanceToNow, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
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
        This feature lets staff track garments customers take on approval or reserve,
        and record whether they come back or get bought.
        It's being prepared and will be available once activated.
      </p>
      <p className="mt-6 text-sm text-muted-foreground/60 italic">
        Contact your system administrator to enable this module.
      </p>
    </div>
  );
}

const statusLabel: Record<CheckoutStatus, string> = { out: 'Out', returned: 'Returned', sold: 'Sold' };

function StatusBadge({ status }: { status: CheckoutStatus }) {
  if (status === 'returned') return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Returned</Badge>;
  if (status === 'sold') return <Badge className="bg-primary/10 text-primary border-primary/20">Sold</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Out</Badge>;
}

function TemporaryStockContent() {
  const { canEdit } = useAuth();
  const isKeeper = canEdit;
  const today = new Date().toISOString().slice(0, 10);

  const {
    checkouts, openCheckouts, closedCheckouts, overdueCheckouts, isLoading,
    checkOut, closeCheckout, deleteCheckout,
  } = useTemporaryStock();
  const { items } = useStockItems();

  // --- Check-out dialog ---
  const emptyCheckoutForm = {
    picked: null as PickedVariant | null,
    customer: null as CustomerChoice | null,
    quantity: 1,
    expected_return_date: '',
    deposit: '',
    taken_date: today,
    notes: '',
  };
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState(emptyCheckoutForm);
  const maxQty = checkoutForm.picked?.variant.quantity ?? 1;
  const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

  // --- Returned / Sold ---
  const [returnConfirmId, setReturnConfirmId] = useState<string | null>(null);
  const [selling, setSelling] = useState<TempStockCheckout | null>(null);
  const [sellForm, setSellForm] = useState({ unitPrice: '', amountPaid: '', dueDate: '' });
  const sellTotal = selling && sellForm.unitPrice !== '' ? selling.quantity * Number(sellForm.unitPrice) : null;
  const sellPaid = sellForm.amountPaid === '' ? sellTotal : Number(sellForm.amountPaid);
  const sellOwes = sellTotal !== null && sellPaid !== null ? sellTotal - sellPaid : 0;

  const [deleteCheckoutConfirmId, setDeleteCheckoutConfirmId] = useState<string | null>(null);

  // Dashboard "Out to Customer" links here with ?checkout=1
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('checkout') === '1' && isKeeper) {
      setIsCheckoutOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isKeeper]);

  // --- Reports ---
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [hasFiltered, setHasFiltered] = useState(false);

  const reportRows = hasFiltered && reportStart && reportEnd
    ? checkouts.filter(c => {
        const d = new Date(c.taken_date);
        return isWithinInterval(d, { start: startOfDay(new Date(reportStart)), end: endOfDay(new Date(reportEnd)) });
      })
    : [];

  // --- Helpers ---
  const isOverdue = (c: TempStockCheckout) =>
    c.expected_return_date && c.expected_return_date < today;

  const fmtDate = (d: string | null) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
  const variant = (size: string | null, color: string | null) => [size, color].filter(Boolean).join(' · ') || '—';
  const piecesOut = openCheckouts.reduce((sum, c) => sum + c.quantity, 0);

  const openCheckoutDialog = () => {
    setCheckoutForm(emptyCheckoutForm);
    setShowMore(false);
    setIsCheckoutOpen(true);
  };

  const handleCheckout = async () => {
    const { picked, customer } = checkoutForm;
    if (!picked || !customer) return;
    await checkOut.mutateAsync({
      variant_id: picked.variant.id,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone || undefined,
      quantity: checkoutForm.quantity,
      deposit: checkoutForm.deposit ? Number(checkoutForm.deposit) : undefined,
      taken_date: checkoutForm.taken_date,
      expected_return_date: checkoutForm.expected_return_date || undefined,
      notes: checkoutForm.notes || undefined,
    });
    setIsCheckoutOpen(false);
  };

  const openSell = (c: TempStockCheckout) => {
    setSelling(c);
    setSellForm({ unitPrice: '', amountPaid: '', dueDate: '' });
  };

  const handleSell = async () => {
    if (!selling || sellTotal === null) return;
    await closeCheckout.mutateAsync({
      id: selling.id,
      outcome: 'sold',
      unitPrice: Number(sellForm.unitPrice),
      amountPaid: sellPaid ?? undefined,
      dueDate: sellForm.dueDate || undefined,
    });
    setSelling(null);
  };

  // --- CSV export ---
  const exportCSV = () => {
    let csv = 'Customer,Phone,Item,Size/Colour,Qty,Deposit (RWF),Taken Date,Expected Return,Closed Date,Status,Notes\n';
    reportRows.forEach(c => {
      csv += `"${c.customer_name}","${c.customer_phone || ''}","${c.item_name}","${variant(c.size, c.color)}",${c.quantity},${c.deposit ?? ''},${fmtDate(c.taken_date)},${fmtDate(c.expected_return_date)},${fmtDate(c.closed_date)},${statusLabel[c.status]},"${c.notes || ''}"\n`;
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
    doc.text('Customer Checkout Report', 14, 37);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${fmtDate(reportStart)} – ${fmtDate(reportEnd)}`, 14, 44);
    doc.text(`Generated: ${generatedAt}`, 14, 50);
    doc.text(`Total records: ${reportRows.length}`, 14, 56);

    const tableData = reportRows.map(c => [
      c.customer_name,
      c.customer_phone || '—',
      c.item_name,
      variant(c.size, c.color),
      c.quantity.toString(),
      c.deposit === null ? '—' : formatRWF(c.deposit),
      fmtDate(c.taken_date),
      fmtDate(c.expected_return_date),
      fmtDate(c.closed_date),
      statusLabel[c.status],
    ]);

    autoTable(doc, {
      startY: 62,
      head: [['Customer', 'Phone', 'Item', 'Size/Colour', 'Qty', 'Deposit', 'Taken', 'Exp. Return', 'Closed', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [241, 245, 255] },
      styles: { fontSize: 7.5, cellPadding: 3 },
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

  const customerCell = (c: TempStockCheckout) => (
    <div>
      <div className="flex items-center gap-1.5 font-medium">
        <User className="w-3.5 h-3.5 text-muted-foreground" />{c.customer_name}
      </div>
      {c.customer_phone && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <Phone className="w-3 h-3" />{c.customer_phone}
        </div>
      )}
    </div>
  );

  const itemCell = (c: TempStockCheckout) => (
    <>
      <div>{c.item_name}</div>
      <div className="text-xs text-muted-foreground">{variant(c.size, c.color)}</div>
    </>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Temporary Stock</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Garments out with customers on approval or reserved</p>
            {!isKeeper && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
                <ShieldCheck className="w-3 h-3" /> View Only
              </Badge>
            )}
          </div>
        </div>
        {isKeeper && (
          <Button className="gap-2" onClick={openCheckoutDialog}>
            <Plus className="w-4 h-4" /> Check Out Item
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Package className="w-5 h-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{piecesOut}</p><p className="text-xs text-muted-foreground">Pieces Out</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Timer className="w-5 h-5 text-blue-500" /></div>
              <div><p className="text-2xl font-bold">{openCheckouts.length}</p><p className="text-xs text-muted-foreground">Out with Customers</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
              <div><p className="text-2xl font-bold text-amber-500">{overdueCheckouts.length}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="active">Out ({openCheckouts.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ── OUT WITH CUSTOMERS TAB ── */}
        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Out with Customers</CardTitle>
              <CardDescription>Garments currently taken on approval or reserved</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
              ) : openCheckouts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Nothing is out with customers right now.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Deposit</TableHead>
                      <TableHead>Taken</TableHead>
                      <TableHead>Expected Return</TableHead>
                      <TableHead>Notes</TableHead>
                      {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openCheckouts.map(c => (
                      <TableRow key={c.id} className={isOverdue(c) ? 'bg-amber-500/5' : ''}>
                        <TableCell>{customerCell(c)}</TableCell>
                        <TableCell>{itemCell(c)}</TableCell>
                        <TableCell className="text-center font-mono">{c.quantity}</TableCell>
                        <TableCell className="text-sm">{formatRWF(c.deposit)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(c.taken_date)}</TableCell>
                        <TableCell>
                          {c.expected_return_date ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-sm ${isOverdue(c) ? 'text-amber-600 font-semibold' : ''}`}>
                                {fmtDate(c.expected_return_date)}
                              </span>
                              {isOverdue(c) && (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                  {formatDistanceToNow(new Date(c.expected_return_date!), { addSuffix: true })}
                                </Badge>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{c.notes || '—'}</TableCell>
                        {isKeeper && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm" variant="outline"
                                className="gap-1 text-green-600 border-green-600/30 hover:bg-green-600/10"
                                onClick={() => setReturnConfirmId(c.id)}
                                disabled={!c.variant_id}
                              >
                                <Undo2 className="w-3.5 h-3.5" /> Returned
                              </Button>
                              <Button
                                size="sm" variant="outline"
                                className="gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                onClick={() => openSell(c)}
                                disabled={!c.variant_id}
                              >
                                <ShoppingBag className="w-3.5 h-3.5" /> Sold
                              </Button>
                              <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteCheckoutConfirmId(c.id)}>
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
              <CardTitle>History</CardTitle>
              <CardDescription>Garments that were returned or bought</CardDescription>
            </CardHeader>
            <CardContent>
              {closedCheckouts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No closed records yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Taken</TableHead>
                      <TableHead>Closed</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Notes</TableHead>
                      {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedCheckouts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>{customerCell(c)}</TableCell>
                        <TableCell>{itemCell(c)}</TableCell>
                        <TableCell className="text-center font-mono">{c.quantity}</TableCell>
                        <TableCell className="text-sm">{fmtDate(c.taken_date)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmtDate(c.closed_date)}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.notes || '—'}</TableCell>
                        {isKeeper && (
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteCheckoutConfirmId(c.id)}>
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
                  <CardTitle>Checkout Report</CardTitle>
                  <CardDescription>
                    {fmtDate(reportStart)} – {fmtDate(reportEnd)} &nbsp;·&nbsp; {reportRows.length} records
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={reportRows.length === 0}>
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </Button>
                  <Button className="gap-2" onClick={exportPDF} disabled={reportRows.length === 0}>
                    <FileDown className="w-4 h-4" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {reportRows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No records in the selected date range.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>Deposit</TableHead>
                        <TableHead>Taken</TableHead>
                        <TableHead>Closed</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportRows.map(c => (
                        <TableRow key={c.id}>
                          <TableCell>{customerCell(c)}</TableCell>
                          <TableCell>{itemCell(c)}</TableCell>
                          <TableCell className="text-center font-mono">{c.quantity}</TableCell>
                          <TableCell className="text-sm">{formatRWF(c.deposit)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(c.taken_date)}</TableCell>
                          <TableCell className="text-sm">{fmtDate(c.closed_date)}</TableCell>
                          <TableCell><StatusBadge status={c.status} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.notes || '—'}</TableCell>
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

      {/* ── Check Out Dialog ── */}
      <FormDialog
        open={isCheckoutOpen}
        onOpenChange={setIsCheckoutOpen}
        title="Check Out to Customer"
        description="The pieces leave the shelf until they come back or are bought."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>Cancel</Button>
            <Button onClick={handleCheckout} disabled={!checkoutForm.picked || !checkoutForm.customer || checkOut.isPending}>
              Confirm Check Out
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>What is the customer taking?</Label>
          {checkoutForm.picked ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{checkoutForm.picked.item.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <OptionTag size={checkoutForm.picked.variant.size} color={checkoutForm.picked.variant.color} />
                  <span>· {checkoutForm.picked.variant.quantity} on the shelf</span>
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCheckoutForm({ ...checkoutForm, picked: null, quantity: 1 })}>Change</Button>
            </div>
          ) : (
            <VariantPicker items={items} onPick={picked => setCheckoutForm({ ...checkoutForm, picked, quantity: 1 })} />
          )}
        </div>

        <div className="space-y-2">
          <Label>Customer</Label>
          <CustomerPicker value={checkoutForm.customer} onChange={customer => setCheckoutForm({ ...checkoutForm, customer })} />
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-4 items-end">
          <div className="space-y-2">
            <Label>Pieces</Label>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                disabled={checkoutForm.quantity <= 1}
                onClick={() => setCheckoutForm({ ...checkoutForm, quantity: checkoutForm.quantity - 1 })}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center font-semibold">{checkoutForm.quantity}</span>
              <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                disabled={checkoutForm.quantity >= maxQty}
                onClick={() => setCheckoutForm({ ...checkoutForm, quantity: checkoutForm.quantity + 1 })}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Bring back by</Label>
            <Input type="date" value={checkoutForm.expected_return_date}
              onChange={e => setCheckoutForm({ ...checkoutForm, expected_return_date: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 -mt-2">
          {[{ label: 'Tomorrow', days: 1 }, { label: 'In 3 days', days: 3 }, { label: 'In a week', days: 7 }].map(o => (
            <Button key={o.days} type="button" size="sm"
              variant={checkoutForm.expected_return_date === inDays(o.days) ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setCheckoutForm({ ...checkoutForm, expected_return_date: inDays(o.days) })}>
              {o.label}
            </Button>
          ))}
        </div>

        <button type="button" onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1 text-sm text-primary font-medium">
          <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          {showMore ? 'Fewer details' : 'More details (deposit, date, notes)'}
        </button>
        {showMore && (
          <div className="grid grid-cols-2 gap-4 animate-fade-in">
            <div className="space-y-2">
              <Label>Deposit Paid (RWF)</Label>
              <Input type="number" min="0" placeholder="0" value={checkoutForm.deposit}
                onChange={e => setCheckoutForm({ ...checkoutForm, deposit: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date Taken</Label>
              <Input type="date" value={checkoutForm.taken_date}
                onChange={e => setCheckoutForm({ ...checkoutForm, taken_date: e.target.value || today })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea placeholder="e.g. Trying for a wedding, may need alterations…" rows={2} value={checkoutForm.notes}
                onChange={e => setCheckoutForm({ ...checkoutForm, notes: e.target.value })} />
            </div>
          </div>
        )}
      </FormDialog>

      {/* ── Sold Dialog ── */}
      <FormDialog
        open={!!selling}
        onOpenChange={v => !v && setSelling(null)}
        title="Mark as Sold"
        description={selling && (
          <span>
            <span className="font-medium text-foreground">{selling.customer_name}</span> kept {selling.quantity} × {selling.item_name} ({variant(selling.size, selling.color)})
          </span>
        )}
        footer={
          <>
            <Button variant="outline" onClick={() => setSelling(null)}>Cancel</Button>
            <Button onClick={handleSell} disabled={sellTotal === null || sellOwes < 0 || closeCheckout.isPending}>
              Confirm Sale
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Price per piece (RWF)</Label>
            <Input type="number" min="0" placeholder="Agreed price" autoFocus value={sellForm.unitPrice}
              onChange={e => setSellForm({ ...sellForm, unitPrice: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Amount Paid (RWF)</Label>
            <Input type="number" min="0" placeholder={sellTotal !== null ? `Full: ${sellTotal.toLocaleString('en-US')}` : ''}
              value={sellForm.amountPaid}
              onChange={e => setSellForm({ ...sellForm, amountPaid: e.target.value })} />
          </div>
        </div>
        {selling?.deposit ? (
          <p className="text-xs text-muted-foreground">
            Deposit already taken: {formatRWF(selling.deposit)} — include it in the amount paid.
          </p>
        ) : null}
        {sellOwes > 0 && (
          <div className="space-y-2">
            <Label>Pay the rest by</Label>
            <Input type="date" value={sellForm.dueDate} onChange={e => setSellForm({ ...sellForm, dueDate: e.target.value })} />
          </div>
        )}
        {sellTotal !== null && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">{formatRWF(sellTotal)}</span></div>
            {sellOwes > 0 && (
              <div className="flex justify-between text-amber-600"><span>Still owes (added to debts)</span><span className="font-semibold">{formatRWF(sellOwes)}</span></div>
            )}
          </div>
        )}
        {sellOwes < 0 && <p className="text-sm text-destructive">Amount paid can't be more than the total.</p>}
      </FormDialog>

      {/* ── Returned Confirm ── */}
      <AlertDialog open={!!returnConfirmId} onOpenChange={() => setReturnConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Returned?</AlertDialogTitle>
            <AlertDialogDescription>
              Today's date will be recorded as the return date and the pieces go back into stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => { if (returnConfirmId) closeCheckout.mutate({ id: returnConfirmId, outcome: 'returned' }); setReturnConfirmId(null); }}>
              Confirm Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Checkout Confirm ── */}
      <AlertDialog open={!!deleteCheckoutConfirmId} onOpenChange={() => setDeleteCheckoutConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the customer record. If the item is still out, it goes back into stock.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteCheckoutConfirmId) deleteCheckout.mutate(deleteCheckoutConfirmId); setDeleteCheckoutConfirmId(null); }}>
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
