import { useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { useStockItems } from '@/hooks/useStockItems';
import { useAuth } from '@/contexts/AuthContext'; // 1. Added useAuth import
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, FolderOpen, Edit, Trash2, Package } from 'lucide-react';
import { format } from 'date-fns';

const colorPresets = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function Categories() {
  const { categories, isLoading, addCategory, updateCategory, deleteCategory } = useCategories();
  const { items } = useStockItems();
  const { role } = useAuth(); // 2. Get the role from AuthContext
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', description: '', color: '#3B82F6' });
  const [editData, setEditData] = useState({ name: '', description: '', color: '#3B82F6' });

  // Safety check: Prevents supervisor from triggering mutation even if they find a way to click
  const isKeeper = role === 'storekeeper';

  const handleAddCategory = () => {
    if (!newCategory.name || !isKeeper) return;
    addCategory.mutate(newCategory);
    setNewCategory({ name: '', description: '', color: '#3B82F6' });
    setIsAddOpen(false);
  };

  const handleEditCategory = (id: string) => {
    if (!isKeeper) return;
    updateCategory.mutate({ id, ...editData });
    setEditingCategory(null);
  };

  const handleDeleteCategory = (id: string) => {
    if (!isKeeper) return;
    setDeletingCategoryId(id);
  };

  const getItemCount = (categoryId: string) => {
    return items.filter(item => item.category_id === categoryId).length;
  };

  const openEditDialog = (category: typeof categories[0]) => {
    setEditData({ name: category.name, description: category.description || '', color: category.color });
    setEditingCategory(category.id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground">Organize your stock items</p>
        </div>

        {/* 3. Wrap "Add Category" in a role check */}
        {isKeeper && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Add Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Category</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input 
                    value={newCategory.name} 
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} 
                    placeholder="Category name" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea 
                    value={newCategory.description} 
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })} 
                    placeholder="Optional description" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${newCategory.color === color ? 'border-foreground scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewCategory({ ...newCategory, color })}
                      />
                    ))}
                  </div>
                </div>
                <Button onClick={handleAddCategory} className="w-full" disabled={!newCategory.name}>
                  Add Category
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No categories yet. Create one to organize your stock.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const itemCount = getItemCount(category.id);
            return (
              <Card key={category.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: category.color + '20' }}
                      >
                        <FolderOpen className="w-5 h-5" style={{ color: category.color }} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{category.name}</CardTitle>
                        <CardDescription className="text-xs">
                          Created {format(new Date(category.created_at), 'MMM dd, yyyy')}
                        </CardDescription>
                      </div>
                    </div>

                    {/* 4. Wrap Edit/Delete buttons in role check */}
                    {isKeeper && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" onClick={() => openEditDialog(category)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteCategory(category.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mb-3">{category.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="gap-1">
                      <Package className="w-3 h-3" />
                      {itemCount} items
                    </Badge>
                    <div 
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: category.color }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deletingCategoryId} onOpenChange={() => setDeletingCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category. Items assigned to it will become uncategorized. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deletingCategoryId) deleteCategory.mutate(deletingCategoryId); setDeletingCategoryId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog - Only renders if keeper is editing */}
      <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input 
                value={editData.name} 
                onChange={(e) => setEditData({ ...editData, name: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editData.description} 
                onChange={(e) => setEditData({ ...editData, description: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${editData.color === color ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditData({ ...editData, color })}
                  />
                ))}
              </div>
            </div>
            <Button onClick={() => editingCategory && handleEditCategory(editingCategory)} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}