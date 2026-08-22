import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  item_name: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  performer_name?: string;
}

interface ActivityTimelineProps {
  movements: ActivityItem[];
  isLoading?: boolean;
}

const getMovementIcon = (type: string) => {
  switch (type) {
    case 'issued':
      return ArrowUpRight;
    case 'returned':
      return ArrowDownLeft;
    case 'added':
      return Plus;
    case 'updated':
      return Pencil;
    case 'removed':
      return Trash2;
    default:
      return Plus;
  }
};

const getMovementStyle = (type: string) => {
  switch (type) {
    case 'issued':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'returned':
      return 'bg-success/10 text-success border-success/20';
    case 'added':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'removed':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export function ActivityTimeline({ movements, isLoading }: ActivityTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {movements.length} actions
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          
          <div className="space-y-4">
            {movements.slice(0, 6).map((movement, index) => {
              const Icon = getMovementIcon(movement.movement_type);
              const style = getMovementStyle(movement.movement_type);
              
              return (
                <div
                  key={movement.id}
                  className={cn(
                    'relative flex items-start gap-4 pl-10 animate-fade-in',
                    index === 0 && 'opacity-100',
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Icon */}
                  <div className={cn(
                    'absolute left-0 p-2 rounded-full border',
                    style
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {movement.item_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{movement.movement_type}</span>
                      {' · '}
                      {movement.quantity} items
                      {movement.performer_name && ` · by ${movement.performer_name}`}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {formatDistanceToNow(new Date(movement.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {movements.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No recent activity</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}