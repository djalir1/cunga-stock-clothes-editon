import { Badge } from '@/components/ui/badge';

export function PaymentBadge({ status }: { status: string }) {
  if (status === 'paid') return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Part paid</Badge>;
  return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20">On credit</Badge>;
}
