import { useState } from 'react';
import { useStockItems } from '@/hooks/useStockItems';
import { useStockMovements } from '@/hooks/useStockMovements';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Trash2,
  Package,
  TrendingDown
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export default function Notifications() {
  const { items } = useStockItems();
  const { data: movements = [] } = useStockMovements();

  // Generate notifications based on stock status and recent movements
  const generateNotifications = (): Notification[] => {
    const notifications: Notification[] = [];

    // Low stock alerts
    items.filter(item => item.status === 'low_stock').forEach(item => {
      notifications.push({
        id: `low-${item.id}`,
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${item.name} is running low (${item.quantity} remaining, min: ${item.min_quantity})`,
        timestamp: new Date(item.updated_at),
        read: false,
      });
    });

    // Out of stock alerts
    items.filter(item => item.status === 'out_of_stock').forEach(item => {
      notifications.push({
        id: `out-${item.id}`,
        type: 'warning',
        title: 'Out of Stock',
        message: `${item.name} is out of stock and needs restocking`,
        timestamp: new Date(item.updated_at),
        read: false,
      });
    });

    // Recent movements as info notifications
    movements.slice(0, 5).forEach(movement => {
      notifications.push({
        id: `movement-${movement.id}`,
        type: (movement.movement_type === 'added' || movement.movement_type === 'returned') ? 'success' : 'info',
        title: `Stock ${String(movement.movement_type).charAt(0).toUpperCase() + String(movement.movement_type).slice(1)}`,
        message: `${movement.item_name || 'Unknown item'}: ${movement.quantity} units ${movement.movement_type}`,
        timestamp: new Date(movement.created_at),
        read: true,
      });
    });

    return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const [notifications, setNotifications] = useState<Notification[]>(generateNotifications());

  const unreadCount = notifications.filter(n => !n.read).length;
  const warningCount = notifications.filter(n => n.type === 'warning').length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'success': return <CheckCircle2 className="w-5 h-5 text-success" />;
      default: return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <div 
      className={cn(
        'flex items-start gap-4 p-4 rounded-lg transition-colors',
        notification.read ? 'bg-muted/30' : 'bg-primary/5 border-l-4 border-primary'
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{notification.title}</span>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount} new</Badge>
            )}
          </h1>
          <p className="text-muted-foreground">Stay updated with stock alerts and activities</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0}>
            Mark all as read
          </Button>
          <Button variant="outline" onClick={clearAll} disabled={notifications.length === 0}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear all
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{notifications.length}</p>
                <p className="text-sm text-muted-foreground">Total Notifications</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{warningCount}</p>
                <p className="text-sm text-muted-foreground">Alerts Requiring Action</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{items.filter(i => i.status === 'out_of_stock').length}</p>
                <p className="text-sm text-muted-foreground">Items Out of Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>All Notifications</CardTitle>
          <CardDescription>Recent alerts and updates from your stock system</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
              <TabsTrigger value="alerts">Alerts ({warningCount})</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No notifications</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
            <TabsContent value="unread" className="mt-4">
              {notifications.filter(n => !n.read).length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {notifications.filter(n => !n.read).map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
            <TabsContent value="alerts" className="mt-4">
              {notifications.filter(n => n.type === 'warning').length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-success/50 mb-4" />
                  <p className="text-muted-foreground">No active alerts</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {notifications.filter(n => n.type === 'warning').map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
