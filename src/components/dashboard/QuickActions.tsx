import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ArrowUpRight, ArrowDownLeft, FileText, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

export function QuickActions() {
  const actions = [
    {
      label: 'Add Item',
      icon: Plus,
      href: '/stock',
      color: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    },
    {
      label: 'Issue Stock',
      icon: ArrowUpRight,
      href: '/stock',
      color: 'bg-warning hover:bg-warning/90 text-warning-foreground',
    },
    {
      label: 'Return Stock',
      icon: ArrowDownLeft,
      href: '/stock',
      color: 'bg-success hover:bg-success/90 text-success-foreground',
    },
    {
      label: 'Generate Report',
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
              variant="ghost"
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
