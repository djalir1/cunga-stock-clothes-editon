import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, Plus, Pencil, Trash2, History, PackagePlus } from 'lucide-react';
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

export function ActivityTimeline({ movements, isLoading }: ActivityTimelineProps) {
  
  const getActionConfig = (type: string) => {
    switch (type) {
      case 'issued':
        return { 
          icon: ArrowUpRight, 
          color: 'text-amber-600 bg-amber-50 border-amber-200',
          description: (m: ActivityItem) => `Issued ${m.quantity} units to ${m.performer_name || 'Student'}`
        };
      case 'returned':
        return { 
          icon: ArrowDownLeft, 
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          description: (m: ActivityItem) => `Returned ${m.quantity} units from ${m.performer_name || 'Student'}`
        };
      case 'restocked':
        return { 
          icon: RefreshCw, 
          color: 'text-blue-600 bg-blue-50 border-blue-200',
          description: (m: ActivityItem) => `Restocked ${m.quantity} new units to inventory`
        };
      case 'added':
        return { 
          icon: PackagePlus, 
          color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
          description: (m: ActivityItem) => `Created new item with ${m.quantity} initial units`
        };
      case 'removed':
        return { 
          icon: Trash2, 
          color: 'text-red-600 bg-red-50 border-red-200',
          description: () => `Permanently removed from system`
        };
      default:
        return { 
          icon: Pencil, 
          color: 'text-slate-600 bg-slate-50 border-slate-200',
          description: () => `Updated item details`
        };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-20" /></div></div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card shadow-sm border-muted">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">Live Activity Feed</CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px]">{movements.length} LOGS</Badge>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />
          
          <div className="space-y-6">
            {movements.slice(0, 10).map((movement) => {
              const config = getActionConfig(movement.movement_type);
              const Icon = config.icon;
              
              return (
                <div key={movement.id} className="relative flex items-start gap-4 pl-1">
                  <div className={cn("z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm bg-white", config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-sm font-bold text-foreground truncate">
                        {movement.item_name}
                      </h4>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {formatDistanceToNow(new Date(movement.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {config.description(movement)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {movements.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No activity recorded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}