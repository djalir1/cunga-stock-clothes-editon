import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface StockStatusChartProps {
  inStock: number;
  lowStock: number;
  outOfStock: number;
  isLoading?: boolean;
}

export function StockStatusChart({ inStock, lowStock, outOfStock, isLoading }: StockStatusChartProps) {
  const data = [
    { name: 'In Stock', value: inStock, color: 'hsl(var(--success))' },
    { name: 'Low Stock', value: lowStock, color: 'hsl(var(--warning))' },
    { name: 'Out of Stock', value: outOfStock, color: 'hsl(var(--destructive))' },
  ].filter(item => item.value > 0);

  const total = inStock + lowStock + outOfStock;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <Skeleton className="h-32 w-32 rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Stock Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative h-32 w-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-popover text-popover-foreground px-3 py-2 rounded-lg shadow-lg border border-border text-sm">
                          <p className="font-medium">{payload[0].name}</p>
                          <p className="text-muted-foreground">{payload[0].value} items</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-2xl font-bold">{total}</span>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 space-y-3">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <span className="text-sm font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
