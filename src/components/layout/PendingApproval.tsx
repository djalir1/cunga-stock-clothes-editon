import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, LogOut } from 'lucide-react';

export function PendingApproval() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <img
            src="/cunga-logo-nobg.png"
            alt="Cunga Stock"
            className="w-16 h-16 mx-auto rounded-lg object-contain bg-white p-1 shadow-md"
          />
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Waiting for approval</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Your account <span className="font-medium text-foreground">{user?.email}</span> has been created.
              The shop owner needs to give you access before you can use Cunga Stock Clothing.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
