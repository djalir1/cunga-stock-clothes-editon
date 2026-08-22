import React from 'react';
import { useUniformStore } from '@/hooks/useUniformStore';
import { InventorySection } from './InventorySection';
import { IssuanceForm } from './IssuanceForm';
import { IssuedRecordsTable } from './IssuedRecordsTable';
import { ReportsSection } from './ReportsSection';
import { ActivityTimeline } from './ActivityTimeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext'; 
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck } from 'lucide-react';

export default function UniformPage() {
  const { role } = useAuth(); 
  const isKeeper = role === 'storekeeper';

  const { 
    uniforms, 
    issuedUniforms, 
    categories, 
    movements,
    isLoading, 
    isLoadingMovements,
    onAddUniform, 
    onUpdateUniform, 
    onDeleteUniform,
    onAddCategory,
    onDeleteCategory,
    issueUniform,
    onUpdateIssuedRecord, 
    onDeleteIssuedRecord 
  } = useUniformStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Uniform Management</h1>
          <p className="text-muted-foreground">Track inventory levels and recent student issuances.</p>
        </div>
        
        {!isKeeper && (
          <Alert className="w-fit bg-blue-50 border-blue-200 py-2 px-4">
            <div className="flex items-center gap-2 text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription className="text-xs font-medium uppercase tracking-wider">
                Read-Only Access (Supervisor)
              </AlertDescription>
            </div>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-3 space-y-8">
          <Tabs defaultValue="inventory" className="w-full">
            <TabsList className={`grid w-full max-w-md mb-8 ${isKeeper ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              {isKeeper && <TabsTrigger value="issuance">Issue Uniform</TabsTrigger>}
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="space-y-6">
              <InventorySection 
                uniforms={uniforms} 
                categories={categories}
                onAddUniform={isKeeper ? onAddUniform : undefined}
                onUpdateUniform={isKeeper ? onUpdateUniform : undefined}
                onDeleteUniform={isKeeper ? onDeleteUniform : undefined}
                onAddCategory={isKeeper ? onAddCategory : undefined}
                onDeleteCategory={isKeeper ? onDeleteCategory : undefined}
              />
              
              <IssuedRecordsTable 
                records={issuedUniforms}
                // Passing undefined here is critical for hiding buttons
                onUpdate={isKeeper ? onUpdateIssuedRecord : undefined} 
                onDelete={isKeeper ? onDeleteIssuedRecord : undefined}
                userRole={role || 'supervisor'} 
              />
            </TabsContent>

            {isKeeper && (
              <TabsContent value="issuance">
                <IssuanceForm uniforms={uniforms} onIssue={issueUniform} />
              </TabsContent>
            )}

            <TabsContent value="reports">
              <ReportsSection records={issuedUniforms} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="xl:col-span-1">
          <ActivityTimeline 
            movements={movements} 
            isLoading={isLoadingMovements} 
          />
        </div>
      </div>
    </div>
  );
}