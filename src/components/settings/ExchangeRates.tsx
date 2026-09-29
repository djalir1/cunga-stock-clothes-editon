import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useShopSettings } from '@/hooks/useShopSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/shop/MoneyInput';
import { ArrowLeftRight } from 'lucide-react';

/**
 * FRW for 1 USD and 1 EUR. Prices and reports stay in FRW; these rates are only used
 * when a customer pays in dollars or euros (the till can still change the rate for one payment).
 */
export function ExchangeRates() {
  const { isManager } = useAuth();
  const { settings, saveRates } = useShopSettings();
  const [usd, setUsd] = useState('');
  const [eur, setEur] = useState('');

  useEffect(() => {
    if (!settings) return;
    setUsd(String(Math.round(Number(settings.usd_rate))));
    setEur(String(Math.round(Number(settings.eur_rate))));
  }, [settings]);

  const changed = settings && (Number(usd) !== Math.round(Number(settings.usd_rate)) || Number(eur) !== Math.round(Number(settings.eur_rate)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" /> Exchange rates</CardTitle>
        <CardDescription>
          Prices, debts and reports are always in FRW. When a customer pays in dollars or euros, the till uses these rates
          to show how much it is worth in FRW{isManager ? '. Update them when the rate changes.' : '. Only the owner or an admin can change them.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>1 US Dollar (USD) =</Label>
            <MoneyInput value={usd} onChange={setUsd} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label>1 Euro (EUR) =</Label>
            <MoneyInput value={eur} onChange={setEur} disabled={!isManager} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {settings?.rates_updated_at && <>Last changed {formatDistanceToNow(new Date(settings.rates_updated_at), { addSuffix: true })}.</>}
          </p>
          {isManager && (
            <Button onClick={() => saveRates.mutate({ usd_rate: Number(usd), eur_rate: Number(eur) })}
              disabled={!changed || !(Number(usd) > 0) || !(Number(eur) > 0) || saveRates.isPending}>
              {saveRates.isPending ? 'Saving…' : 'Save rates'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
