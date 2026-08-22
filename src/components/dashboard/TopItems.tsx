import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TopItem {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  status: string;
  category_name?: string;
}

interface TopItemsProps {
  items: TopItem[];
  isLoading?: boolean;
  title?: string;
  type?: 'low-stock' | 'top-items';
}

export function TopItems({ items, isLoading, title = 'Low Stock Items', type = 'low-stock' }: TopItemsProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_stock':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">In Stock</Badge>;
      case 'low_stock':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">Low Stock</Badge>;
      case 'out_of_stock':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">Out</Badge>;
      default:
        return null;
    }
  };

  const getStockPercentage = (quantity: number, minQuantity: number) => {
    if (minQuantity === 0) return 100;
    return Math.min((quantity / (minQuantity * 2)) * 100, 100);
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'in_stock':
        return 'bg-success';
      case 'low_stock':
        return 'bg-warning';
      case 'out_of_stock':
        return 'bg-destructive';
      default:
        return 'bg-primary';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const displayItems = type === 'low-stock'
    ? items.filter(i => i.status === 'low_stock' || i.status === 'out_of_stock').slice(0, 5)
    : items.slice(0, 5);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {type === 'low-stock' && displayItems.length > 0 && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              {displayItems.length} Alert{displayItems.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayItems.map((item, index) => (
            <div
              key={item.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  {getStatusBadge(item.status)}
                </div>
                <span className="text-sm font-semibold text-muted-foreground">
                  {item.quantity}/{item.min_quantity * 2}
                </span>
              </div>
              <div className="relative">
                <Progress
                  value={getStockPercentage(item.quantity, item.min_quantity)}
                  className="h-2 bg-muted"
                />
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-all',
                    getProgressColor(item.status)
                  )}
                  style={{ width: `${getStockPercentage(item.quantity, item.min_quantity)}%` }}
                />
              </div>
              {item.category_name && (
                <p className="text-xs text-muted-foreground mt-1">{item.category_name}</p>
              )}
            </div>
          ))}
          
          {displayItems.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">
                {type === 'low-stock' ? 'All items are well stocked!' : 'No items found'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
