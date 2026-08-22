import { useState } from 'react';
import { useStockMovements } from '@/hooks/useStockMovements';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  History as HistoryIcon, 
  TrendingUp, 
  TrendingDown, 
  Plus,           // ← Changed from RotateCcw to Plus
  Settings,
  Search,
  Package,
  User,
  Clock,
  RefreshCw       // ← Optional: if you want a cleaner reload icon later
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function History() {
  const { data: movements = [], isLoading: movementsLoading } = useStockMovements();
  const { data: logs = [], isLoading: logsLoading } = useActivityLogs();
  const [movementFilter, setMovementFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMovements = movements.filter((movement) => {
    const matchesFilter = movementFilter === 'all' || movement.movement_type === movementFilter;
    const matchesSearch = movement.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          movement.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && (searchQuery === '' || matchesSearch);
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'added': return <TrendingUp className="w-4 h-4 text-success" />;
      case 'issued': return <TrendingDown className="w-4 h-4 text-destructive" />;
      case 'returned': return <Plus className="w-4 h-4 text-primary" />; // ← Updated icon
      case 'adjusted': return <Settings className="w-4 h-4 text-muted-foreground" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'added': return <Badge className="bg-success/20 text-success border-0">Added</Badge>;
      case 'issued': return <Badge className="bg-destructive/20 text-destructive border-0">Issued</Badge>;
      case 'returned': return <Badge className="bg-primary/20 text-primary border-0">Returned</Badge>;
      case 'adjusted': return <Badge variant="outline">Adjusted</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getActivityIcon = (action: string) => {
    if (action.includes('created') || action.includes('added')) return <TrendingUp className="w-4 h-4 text-success" />;
    if (action.includes('deleted') || action.includes('removed')) return <TrendingDown className="w-4 h-4 text-destructive" />;
    if (action.includes('updated') || action.includes('modified')) return <Settings className="w-4 h-4 text-primary" />;
    return <Package className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">History</h1>
        <p className="text-muted-foreground">Track all stock movements and activities</p>
      </div>

      <Tabs defaultValue="movements" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="movements" className="gap-2">
            <HistoryIcon className="w-4 h-4" />
            Stock Movements
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Clock className="w-4 h-4" />
            Activity Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movements" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search movements..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={movementFilter} onValueChange={setMovementFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="added">Added</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                    <SelectItem value="adjusted">Adjusted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Movements Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Stock Movements</CardTitle>
              <CardDescription>{filteredMovements.length} movement records</CardDescription>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="text-center py-12">
                  <HistoryIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No movements found</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="relative">
                    <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-6">
                      {filteredMovements.map((movement, index) => (
                        <div key={movement.id} className="relative flex gap-4 animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                          <div className={cn(
                            'relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 border-background',
                            movement.movement_type === 'added' && 'bg-success/20',
                            movement.movement_type === 'issued' && 'bg-destructive/20',
                            movement.movement_type === 'returned' && 'bg-primary/20',
                            movement.movement_type === 'adjusted' && 'bg-muted'
                          )}>
                            {getMovementIcon(movement.movement_type)}
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                              <span className="font-semibold">{movement.item_name || 'Unknown Item'}</span>
                              {getMovementBadge(movement.movement_type)}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-2">
                              <span className="font-mono">Qty: {movement.quantity}</span>
                              <span>
                                {movement.previous_quantity} → {movement.new_quantity}
                              </span>
                            </div>
                            {movement.notes?.startsWith('Issued to: ') ? (
                              <>
                                <p className="text-sm bg-blue-500/10 text-blue-400 rounded-md px-3 py-2 mb-2 flex items-center gap-2">
                                  <User className="w-3 h-3 shrink-0" />
                                  Issued to: <span className="font-semibold text-foreground">{movement.notes.split('\n')[0].replace('Issued to: ', '')}</span>
                                </p>
                                {movement.notes.split('\n').slice(1).join('\n') && (
                                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 mb-2">
                                    {movement.notes.split('\n').slice(1).join('\n')}
                                  </p>
                                )}
                              </>
                            ) : movement.notes ? (
                              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 mb-2">
                                {movement.notes}
                              </p>
                            ) : null}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(movement.created_at), 'MMM dd, yyyy HH:mm')}
                              </span>
                              <span className="text-muted-foreground/60">
                                {formatDistanceToNow(new Date(movement.created_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>All system activities and changes</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No activity logs found</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {logs.map((log, index) => (
                      <div 
                        key={log.id} 
                        className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                          {getActivityIcon(log.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium capitalize">{log.action.replace(/_/g, ' ')}</span>
                            <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>
                          </div>
                          {log.details && (
                            <p className="text-sm text-muted-foreground truncate">
                              {typeof log.details === 'object' 
                                ? JSON.stringify(log.details).slice(0, 100) + '...'
                                : String(log.details)
                              }
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <User className="w-3 h-3" />
                            <span>{log.user_name || 'System'}</span>
                            <span>•</span>
                            <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}