import { useMemo } from 'react';
import { useStockItems } from '@/hooks/useStockItems';
import { useDebts, isOverdue } from '@/hooks/useDebts';
import { usePurchaseOrders, isLate } from '@/hooks/usePurchaseOrders';
import { useTemporaryStock } from '@/hooks/useTemporaryStock';
import { formatRWF } from '@/lib/format';

export interface Alert {
  id: string;
  kind: 'stock' | 'debt' | 'order' | 'temp';
  title: string;
  message: string;
  timestamp: Date;
  href: string;
}

/**
 * Things that need someone's attention. Every source is live (realtime), so the
 * bell and the Notifications page update on all phones without refreshing.
 */
export function useAlerts() {
  const { items } = useStockItems();
  const { debts } = useDebts();
  const { orders } = usePurchaseOrders();
  const { openCheckouts } = useTemporaryStock();

  return useMemo<Alert[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const list: Alert[] = [];
    items.filter(i => i.status !== 'in_stock').forEach(i => list.push({
      id: `stock-${i.id}-${i.quantity}`,
      kind: 'stock',
      title: i.status === 'out_of_stock' ? 'Sold out' : 'Running low',
      message: i.status === 'out_of_stock' ? `${i.name} has no pieces left` : `${i.name}: only ${i.quantity} left (warn below ${i.min_quantity})`,
      timestamp: new Date(i.updated_at),
      href: '/stock',
    }));
    debts.filter(isOverdue).forEach(d => list.push({
      id: `debt-${d.id}-${d.balance}`,
      kind: 'debt',
      title: 'Payment overdue',
      message: `${d.customer_name} owes ${formatRWF(d.balance)} — was due ${d.due_date}`,
      timestamp: new Date(`${d.due_date}T08:00:00`),
      href: '/debts',
    }));
    orders.filter(isLate).forEach(o => list.push({
      id: `order-${o.id}-${o.status}`,
      kind: 'order',
      title: 'Delivery late',
      message: `Order #${o.po_no}${o.supplier_name ? ` from ${o.supplier_name}` : ''} was expected ${o.expected_on}`,
      timestamp: new Date(`${o.expected_on}T08:00:00`),
      href: '/orders',
    }));
    openCheckouts.filter(c => c.expected_return_date && c.expected_return_date < today).forEach(c => list.push({
      id: `temp-${c.id}`,
      kind: 'temp',
      title: 'Not brought back',
      message: `${c.customer_name} still has ${c.quantity} × ${c.item_name} (due back ${c.expected_return_date})`,
      timestamp: new Date(`${c.expected_return_date}T08:00:00`),
      href: '/temporary-stock',
    }));
    return list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [items, debts, orders, openCheckouts]);
}
