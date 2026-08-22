import { useState } from 'react';
import { Search, Edit2, Trash2, FileText, AlertTriangle, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IssuedUniform } from '@/types/uniform';

interface IssuedRecordsTableProps {
  records: IssuedUniform[];
  onUpdate?: (id: string, updates: any) => void;
  onDelete?: (id: string) => void;
  userRole: string;
}

export const IssuedRecordsTable = ({ records, onUpdate, onDelete, userRole }: IssuedRecordsTableProps) => {
  const isSupervisor = userRole === 'supervisor';
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<IssuedUniform | null>(null);
  const [editFormData, setEditFormData] = useState({ studentName: '', quantityTaken: '', date: '', sweaterNumber: '' });
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);

  const filteredRecords = records.filter(record =>
    record.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.uniformName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.uniformCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.sweaterNumber ?? '').includes(searchTerm)
  );

  const isSweater = (cat: string) => cat.toLowerCase().includes('sweater');

  const openEdit = (record: IssuedUniform) => {
    setEditingRecord(record);
    setEditFormData({
      studentName: record.studentName,
      quantityTaken: record.quantityTaken.toString(),
      date: record.date ? new Date(record.date).toISOString().split('T')[0] : '',
      sweaterNumber: record.sweaterNumber ?? '',
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingRecord || !onUpdate) return;
    const newQty = parseInt(editFormData.quantityTaken) || 0;
    const stockAdjustment = editingRecord.quantityTaken - newQty;
    onUpdate(editingRecord.id, {
      studentName: editFormData.studentName,
      quantityTaken: newQty,
      date: editFormData.date,
      stockAdjustment,
      sweaterNumber: isSweater(editingRecord.uniformCategory) ? editFormData.sweaterNumber : undefined,
    });
    setIsEditOpen(false);
    setEditingRecord(null);
  };

  const openDeleteConfirm = (id: string) => {
    setRecordToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (recordToDelete && onDelete) {
      onDelete(recordToDelete);
      setIsDeleteConfirmOpen(false);
      setRecordToDelete(null);
    }
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-card-foreground">Issued Records</h2>
          <span className="text-sm text-muted-foreground">({records.length} total)</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, uniform, category or sweater #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student Name</TableHead>
              <TableHead>Uniform</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead>Sweater #</TableHead>
              <TableHead>Date</TableHead>
              {!isSupervisor && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSupervisor ? 6 : 7} className="text-center text-muted-foreground py-12">
                  No records match your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.studentName}</TableCell>
                  <TableCell>{record.uniformName}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium">
                      {record.uniformCategory}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{record.quantityTaken}</TableCell>
                  <TableCell>
                    {isSweater(record.uniformCategory) ? (
                      record.sweaterNumber ? (
                        <Badge variant="outline" className="gap-1 font-mono">
                          <Hash className="w-3 h-3" />{record.sweaterNumber}
                        </Badge>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">Not set</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateDisplay(record.date)}</TableCell>
                  {!isSupervisor && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(record)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteConfirm(record.id)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Issued Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Student Name</Label>
              <Input
                value={editFormData.studentName}
                onChange={(e) => setEditFormData({ ...editFormData, studentName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Item (Read-only)</Label>
              <Input value={editingRecord?.uniformName || ''} disabled className="bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={editFormData.quantityTaken}
                  onChange={(e) => setEditFormData({ ...editFormData, quantityTaken: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                />
              </div>
            </div>
            {editingRecord && isSweater(editingRecord.uniformCategory) && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-primary" />
                  Sweater Number
                </Label>
                <Input
                  value={editFormData.sweaterNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, sweaterNumber: e.target.value })}
                  placeholder="e.g. 231"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Used to identify whose sweater this is when found/lost.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <p className="text-center text-muted-foreground">
            Are you sure you want to delete this record? This action cannot be undone and will restore the items to inventory.
          </p>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
