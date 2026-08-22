import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Package } from 'lucide-react';
import type { StockStatus } from '@/lib/types';

interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  status: StockStatus;
  category_name?: string;
}

interface LowStockAlertProps {
  items: LowStockItem[];
  isLoading?: boolean;
}

export function LowStockAlert({ items, isLoading }: LowStockAlertProps) {
  const lowStockItems = items.filter(
    (item) => item.status === 'low_stock' || item.status === 'out_of_stock'
  );

  if (isLoading) {
    return (
      <Card className="border-warning/20 bg-warning/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Low Stock Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={lowStockItems.length > 0 ? 'border-warning/20 bg-warning/5' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${lowStockItems.length > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
          Low Stock Alerts
          {lowStockItems.length > 0 && (
            <Badge variant="secondary" className="ml-auto bg-warning/20 text-warning">
              {lowStockItems.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px]">
          {lowStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Package className="w-12 h-12 text-success/50 mb-4" />
              <p className="text-muted-foreground">All items are well stocked!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background/50"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      item.status === 'out_of_stock' ? 'bg-destructive' : 'bg-warning'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} / {item.min_quantity} min
                    </p>
                  </div>
                  <Badge
                    variant={item.status === 'out_of_stock' ? 'destructive' : 'secondary'}
                    className={item.status === 'out_of_stock' ? '' : 'bg-warning/20 text-warning'}
                  >
                    {item.status === 'out_of_stock' ? 'Out' : 'Low'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
