import { Shirt, ShieldAlert } from 'lucide-react';
import { InventorySection } from '@/components/uniform/InventorySection';
import { IssuanceForm } from '@/components/uniform/IssuanceForm';
import { IssuedRecordsTable } from '@/components/uniform/IssuedRecordsTable';
import { ReportsSection } from '@/components/uniform/ReportsSection';
import { useUniformStore } from '@/hooks/useUniformStore';
import { useAuth } from '@/contexts/AuthContext'; // 1. Added useAuth
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const Index = () => {
  const { role } = useAuth(); // 2. Get role
  const isKeeper = role === 'storekeeper';

  const {
    categories,
    uniforms,
    issuedUniforms,
    addCategory,
    deleteCategory,
    addUniform,
    updateUniform,
    deleteUniform,
    issueUniform,
    updateIssuedUniform,
    deleteIssuedUniform,
  } = useUniformStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Shirt className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Uniform Management</h1>
                <p className="text-sm text-muted-foreground">Track and manage student uniforms efficiently</p>
              </div>
            </div>
            
            {/* Show a badge if in View Only mode */}
            {!isKeeper && (
              <div className="hidden md:block">
                <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-amber-200">
                  Supervisor Mode (View Only)
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          
          {!isKeeper && (
            <Alert className="bg-amber-50 border-amber-200 text-amber-800">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>View Only</AlertTitle>
              <AlertDescription>
                You are logged in as a Supervisor. You can view records and reports but cannot modify inventory or issue uniforms.
              </AlertDescription>
            </Alert>
          )}

          {/* Top Row: Inventory + Issuance Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <InventorySection
                uniforms={uniforms}
                categories={categories}
                // Only pass functions if they are a keeper
                onAddUniform={isKeeper ? addUniform : undefined}
                onUpdateUniform={isKeeper ? updateUniform : undefined}
                onDeleteUniform={isKeeper ? deleteUniform : undefined}
                onAddCategory={isKeeper ? addCategory : undefined}
                onDeleteCategory={isKeeper ? deleteCategory : undefined}
              />
            </div>
            <div className="lg:col-span-1">
              {/* Hide the Issuance Form entirely for Supervisors */}
              {isKeeper ? (
                <IssuanceForm
                  uniforms={uniforms}
                  onIssue={issueUniform}
                />
              ) : (
                <Card className="p-6 border-dashed bg-muted/20">
                  <p className="text-center text-sm text-muted-foreground">
                    Issuance form is disabled for supervisors.
                  </p>
                </Card>
              )}
            </div>
          </div>

          {/* Issued Records */}
          <IssuedRecordsTable
            records={issuedUniforms}
            // If they aren't a keeper, don't pass the update/delete functions
            onUpdate={isKeeper ? updateIssuedUniform : undefined}
            onDelete={isKeeper ? deleteIssuedUniform : undefined}
          />

          {/* Reports - Always visible to both roles */}
          <ReportsSection records={issuedUniforms} />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-muted-foreground">
            Student Uniform Management System © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;