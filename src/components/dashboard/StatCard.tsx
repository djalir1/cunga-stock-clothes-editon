import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}

const variantStyles = {
  default: {
    card: 'bg-card hover:shadow-lg',
    icon: 'bg-muted text-muted-foreground',
    glow: '',
  },
  primary: {
    card: 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 hover:border-primary/40',
    icon: 'bg-primary text-primary-foreground shadow-lg',
    glow: 'shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)]',
  },
  success: {
    card: 'bg-gradient-to-br from-success/10 via-success/5 to-transparent border-success/20 hover:border-success/40',
    icon: 'bg-success text-success-foreground shadow-lg',
    glow: 'shadow-[0_0_30px_-5px_hsl(var(--success)/0.3)]',
  },
  warning: {
    card: 'bg-gradient-to-br from-warning/10 via-warning/5 to-transparent border-warning/20 hover:border-warning/40',
    icon: 'bg-warning text-warning-foreground shadow-lg',
    glow: 'shadow-[0_0_30px_-5px_hsl(var(--warning)/0.3)]',
  },
  destructive: {
    card: 'bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent border-destructive/20 hover:border-destructive/40',
    icon: 'bg-destructive text-destructive-foreground shadow-lg',
    glow: 'shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.3)]',
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendValue,
  variant = 'default',
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card className={cn(
      'relative overflow-hidden transition-all duration-300 group',
      styles.card,
      styles.glow
    )}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{value}</span>
              {trend && trendValue && (
                <span className={cn(
                  'flex items-center text-xs font-medium',
                  trend === 'up' && 'text-success',
                  trend === 'down' && 'text-destructive'
                )}>
                  {trend === 'up' ? (
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                  )}
                  {trendValue}
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          
          <div className={cn(
            'p-3 rounded-xl transition-transform duration-300 group-hover:scale-110',
            styles.icon
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
