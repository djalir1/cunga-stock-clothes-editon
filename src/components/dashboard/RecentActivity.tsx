import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Package, ArrowRightLeft, RefreshCw, Plus, Minus } from 'lucide-react';
import type { MovementType } from '@/lib/types';

interface Movement {
  id: string;
  item_name: string | null;
  movement_type: MovementType;
  quantity: number;
  created_at: string;
  performer_name: string | null;
}

interface RecentActivityProps {
  movements: Movement[];
  isLoading?: boolean;
}

const movementConfig: Record<MovementType, { label: string; icon: typeof Package; color: string }> = {
  added: { label: 'Added', icon: Plus, color: 'bg-success/10 text-success' },
  issued: { label: 'Issued', icon: Minus, color: 'bg-warning/10 text-warning' },
  returned: { label: 'Returned', icon: RefreshCw, color: 'bg-primary/10 text-primary' },
  adjusted: { label: 'Adjusted', icon: ArrowRightLeft, color: 'bg-muted text-muted-foreground' },
};

export function RecentActivity({ movements, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Package className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-4">
              {movements.map((movement) => {
                const config = movementConfig[movement.movement_type];
                const Icon = config.icon;
                return (
                  <div
                    key={movement.id}
                    className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {movement.item_name || 'Unknown Item'}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {Math.abs(movement.quantity)} items
                        {movement.performer_name && ` by ${movement.performer_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(movement.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
