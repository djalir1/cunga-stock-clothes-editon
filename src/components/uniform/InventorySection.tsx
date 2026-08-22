import { useState } from 'react';
import { Plus, Edit2, Trash2, Package, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UniformItem, UniformCategory } from '@/types/uniform';

interface InventorySectionProps {
  uniforms: UniformItem[];
  categories: UniformCategory[];
  onAddUniform?: (uniform: Omit<UniformItem, 'id' | 'remainingQuantity'>) => void;
  onUpdateUniform?: (id: string, updates: Partial<UniformItem>) => void;
  onDeleteUniform?: (id: string) => void;
  onAddCategory?: (name: string) => void;
  onDeleteCategory?: (id: string) => void;
}

export const InventorySection = ({
  uniforms,
  categories,
  onAddUniform,
  onUpdateUniform,
  onDeleteUniform,
  onAddCategory,
  onDeleteCategory,
}: InventorySectionProps) => {
  // If these functions aren't passed by the parent, the user is a Supervisor (Read Only)
  const isReadOnly = !onAddUniform && !onDeleteUniform;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingUniform, setEditingUniform] = useState<UniformItem | null>(null);
  const [restockItem, setRestockItem] = useState<UniformItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('0');
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    totalQuantity: '',
  });

  const handleAdd = () => {
    if (onAddUniform && formData.name && formData.category && formData.totalQuantity) {
      onAddUniform({
        name: formData.name,
        category: formData.category,
        totalQuantity: parseInt(formData.totalQuantity),
      });
      setFormData({ name: '', category: '', totalQuantity: '' });
      setIsAddOpen(false);
    }
  };

  const handleEdit = () => {
    if (onUpdateUniform && editingUniform && formData.name && formData.category) {
      onUpdateUniform(editingUniform.id, {
        name: formData.name,
        category: formData.category,
      });
      setFormData({ name: '', category: '', totalQuantity: '' });
      setEditingUniform(null);
      setIsEditOpen(false);
    }
  };

  const handleRestock = () => {
    const amount = parseInt(restockAmount);
    if (onUpdateUniform && restockItem && amount > 0) {
      onUpdateUniform(restockItem.id, {
        totalQuantity: restockItem.totalQuantity + amount,
        remainingQuantity: restockItem.remainingQuantity + amount
      });
      setIsRestockOpen(false);
      setRestockAmount('0');
      setRestockItem(null);
    }
  };

  const openEdit = (uniform: UniformItem) => {
    setEditingUniform(uniform);
    setFormData({
      name: uniform.name,
      category: uniform.category,
      totalQuantity: uniform.totalQuantity.toString(),
    });
    setIsEditOpen(true);
  };

  const getStockStatus = (remaining: number, total: number) => {
    const percentage = (remaining / total) * 100;
    if (percentage <= 10) return 'text-red-600 font-bold';
    if (percentage <= 30) return 'text-amber-600 font-semibold';
    return 'text-green-600 font-semibold';
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Uniform Inventory</h2>
            {isReadOnly && (
              <span className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                <ShieldCheck className="h-3 w-3" /> View Only Mode
              </span>
            )}
          </div>
        </div>
        
        {!isReadOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCategoryOpen(true)}>
              Categories
            </Button>
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Item
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Uniform Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-center">Total Stock</TableHead>
              <TableHead className="text-center">Remaining</TableHead>
              <TableHead className="text-center">Issued</TableHead>
              {!isReadOnly && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {uniforms.map((uniform) => (
              <TableRow key={uniform.id}>
                <TableCell className="font-medium">{uniform.name}</TableCell>
                <TableCell>
                  <span className="px-2 py-0.5 bg-muted rounded-full text-xs">
                    {uniform.category}
                  </span>
                </TableCell>
                <TableCell className="text-center font-mono">{uniform.totalQuantity}</TableCell>
                <TableCell className={`text-center font-mono ${getStockStatus(uniform.remainingQuantity, uniform.totalQuantity)}`}>
                  {uniform.remainingQuantity}
                </TableCell>
                <TableCell className="text-center font-mono text-muted-foreground">
                  {uniform.totalQuantity - uniform.remainingQuantity}
                </TableCell>
                
                {!isReadOnly && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => { setRestockItem(uniform); setIsRestockOpen(true); }}
                        title="Restock Item"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(uniform)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setItemToDelete(uniform.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* RESTOCK DIALOG */}
      {!isReadOnly && (
        <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" /> Restock: {restockItem?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Quantity to Add</Label>
                <Input
                  type="number"
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRestockOpen(false)}>Cancel</Button>
              <Button onClick={handleRestock}>Complete Restock</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* CATEGORY DIALOG */}
      {!isReadOnly && (
        <Dialog open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Categories</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex gap-2">
                <Input 
                  placeholder="New category name..." 
                  value={newCategoryName} 
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <Button onClick={() => {
                  if (onAddCategory && newCategoryName.trim()) {
                    onAddCategory(newCategoryName.trim());
                    setNewCategoryName('');
                  }
                }}>Add</Button>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <span className="text-sm font-medium">{cat.name}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive"
                      onClick={() => onDeleteCategory?.(cat.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ADD ITEM DIALOG */}
      {!isReadOnly && (
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Uniform</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData({...formData, category: val})}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total Quantity</Label>
                <Input type="number" value={formData.totalQuantity} onChange={(e) => setFormData({...formData, totalQuantity: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} className="w-full">Save Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* EDIT DIALOG */}
      {!isReadOnly && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Uniform</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData({...formData, category: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleEdit} className="w-full">Update Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DELETE ALERT */}
      {!isReadOnly && (
        <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (onDeleteUniform && itemToDelete) onDeleteUniform(itemToDelete);
                setItemToDelete(null);
              }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};