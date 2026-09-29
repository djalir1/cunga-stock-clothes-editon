import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useStockMovements } from '@/hooks/useStockMovements';
import { useStockItems } from '@/hooks/useStockItems';
import { StatCard } from '@/components/dashboard/StatCard';
import { CategoryChart } from '@/components/dashboard/CategoryChart';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { StockStatusChart } from '@/components/dashboard/StockStatusChart';
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline';
import { TopItems } from '@/components/dashboard/TopItems';
import { useTodaySummary } from '@/hooks/useSales';
import { useTemporaryStock } from '@/hooks/useTemporaryStock';
import { formatRWF } from '@/lib/format';
import { ShoppingBag, Timer, HandCoins, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: movements = [], isLoading: movementsLoading } = useStockMovements(undefined, 10);
  const { items, isLoading: itemsLoading } = useStockItems();
  const { data: today } = useTodaySummary();
  const { openCheckouts, overdueCheckouts } = useTemporaryStock();
  const piecesOut = openCheckouts.reduce((sum, c) => sum + c.quantity, 0);
  const needRestock = (stats?.lowStock ?? 0) + (stats?.outOfStock ?? 0);

  const currentDate = new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Shop Overview</h1>
          <p className="text-muted-foreground">
            Today's sales, garments out with customers and what needs restocking
          </p>
        </div>
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-semibold">{format(currentDate, 'MMM dd, yyyy · HH:mm')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sales Today"
          value={formatRWF(today?.revenue ?? 0)}
          icon={ShoppingBag}
          description={`${today?.salesCount ?? 0} sales · ${today?.piecesSold ?? 0} pieces`}
          variant="primary"
          href="/sales"
        />
        <StatCard
          title="Out with Customers"
          value={piecesOut}
          icon={Timer}
          description={overdueCheckouts.length ? `${overdueCheckouts.length} overdue to come back` : 'Pieces on approval or reserved'}
          variant="success"
          href="/temporary-stock"
        />
        <StatCard
          title="Owed to the Shop"
          value={formatRWF(today?.owedToShop ?? 0)}
          icon={HandCoins}
          description="Unpaid balances from credit sales"
          variant="warning"
        />
        <StatCard
          title="Need Restocking"
          value={needRestock}
          icon={AlertTriangle}
          description={`${stats?.lowStock ?? 0} low · ${stats?.outOfStock ?? 0} sold out`}
          variant="destructive"
          href="/notifications"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Charts Row */}
          <div className="grid gap-6 sm:grid-cols-2">
            <StockStatusChart
              inStock={stats?.inStock ?? 0}
              lowStock={stats?.lowStock ?? 0}
              outOfStock={stats?.outOfStock ?? 0}
              isLoading={statsLoading}
            />
            <CategoryChart
              data={stats?.categoryBreakdown ?? []}
              isLoading={statsLoading}
            />
          </div>

          {/* Activity Timeline */}
          <ActivityTimeline
            movements={movements.map(m => ({
              id: m.id,
              item_name: m.item_name,
              movement_type: m.movement_type,
              quantity: m.quantity,
              created_at: m.created_at,
              performer_name: m.performer_name,
            }))}
            isLoading={movementsLoading}
          />
        </div>

        {/* Right Column - Quick Actions & Alerts */}
        <div className="space-y-6">
          <QuickActions />
          
          <TopItems
            items={items.map(i => ({
              id: i.id,
              name: i.name,
              quantity: i.quantity,
              min_quantity: i.min_quantity,
              status: i.status,
              category_name: i.category?.name,
            }))}
            isLoading={itemsLoading}
            title="Low Stock Alerts"
            type="low-stock"
          />

          {/* Recent Additions */}
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Recently Added
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items.slice(0, 4).map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.category?.name || 'Uncategorized'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      +{item.quantity}
                    </span>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No items added yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
