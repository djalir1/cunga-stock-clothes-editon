import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ShoppingCart, Timer, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export function QuickActions() {
  const actions = [
    {
      label: 'New Sale',
      icon: ShoppingCart,
      href: '/sales',
      color: 'bg-success hover:bg-success/90 text-success-foreground',
    },
    {
      label: 'Add Item',
      icon: Plus,
      href: '/stock?add=1',
      color: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    },
    {
      label: 'Out to Customer',
      icon: Timer,
      href: '/temporary-stock?checkout=1',
      color: 'bg-warning hover:bg-warning/90 text-warning-foreground',
    },
    {
      label: 'Reports',
      icon: FileText,
      href: '/reports',
      color: 'bg-accent hover:bg-accent/90 text-accent-foreground',
    },
  ];

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Link key={action.label} to={action.href}>
            <Button
              variant="outline"
              className={`w-full h-auto flex-col gap-2 py-4 ${action.color}`}
            >
              <action.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{action.label}</span>
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
