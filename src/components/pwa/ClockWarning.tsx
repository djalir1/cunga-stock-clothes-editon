import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Clock } from 'lucide-react';

/**
 * Logins break when the device clock is wrong (usually the wrong time zone): the phone/PC
 * thinks every login has already expired and keeps renewing it until the server logs it out.
 * This compares the device clock with the server and says how to fix it.
 */
export function ClockWarning() {
  const [skewMin, setSkewMin] = useState(0);

  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    supabase.rpc('server_time').then(({ data, error }) => {
      if (!alive || error || !data) return;
      const roundTrip = Date.now() - t0;
      const server = new Date(data as string).getTime() + roundTrip / 2;
      setSkewMin(Math.round((Date.now() - server) / 60000));
    });
    return () => { alive = false; };
  }, []);

  if (Math.abs(skewMin) < 5) return null;
  const hours = Math.floor(Math.abs(skewMin) / 60), mins = Math.abs(skewMin) % 60;
  const amount = [hours && `${hours} h`, mins && `${mins} min`].filter(Boolean).join(' ');

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <Clock className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
      <div>
        <p className="font-semibold text-destructive">This device's clock is {amount} {skewMin > 0 ? 'ahead' : 'behind'} — you'll keep getting logged out.</p>
        <p className="text-muted-foreground mt-0.5">
          Windows: Settings → Time &amp; language → Date &amp; time → turn on <b>Set time zone automatically</b> and <b>Set time automatically</b>
          {' '}(or choose <b>(UTC+02:00) Harare, Pretoria</b> — Kigali time), then press <b>Sync now</b>. Phones: turn on automatic date &amp; time.
        </p>
      </div>
    </div>
  );
}
