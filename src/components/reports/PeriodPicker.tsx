import { endOfMonth, format, startOfMonth, startOfWeek, startOfYear, subDays, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const d = (x: Date) => format(x, 'yyyy-MM-dd');
export const PERIODS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [d(new Date()), d(new Date())] },
  { label: 'Yesterday', range: () => [d(subDays(new Date(), 1)), d(subDays(new Date(), 1))] },
  { label: 'This week', range: () => [d(startOfWeek(new Date(), { weekStartsOn: 1 })), d(new Date())] },
  { label: 'Last 7 days', range: () => [d(subDays(new Date(), 6)), d(new Date())] },
  { label: 'This month', range: () => [d(startOfMonth(new Date())), d(new Date())] },
  { label: 'Last month', range: () => [d(startOfMonth(subMonths(new Date(), 1))), d(endOfMonth(subMonths(new Date(), 1)))] },
  { label: 'This year', range: () => [d(startOfYear(new Date())), d(new Date())] },
];

export interface Period { preset: string; from: string; to: string }
export const defaultPeriod = (): Period => { const [from, to] = PERIODS[4].range(); return { preset: 'This month', from, to }; };

export function periodLabel({ from, to }: Pick<Period, 'from' | 'to'>) {
  const f = (s: string) => format(new Date(`${s}T00:00:00`), 'dd MMM yyyy');
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <Button key={p.label} size="sm" className="h-8" variant={value.preset === p.label ? 'default' : 'outline'}
            onClick={() => { const [from, to] = p.range(); onChange({ preset: p.label, from, to }); }}>{p.label}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input type="date" className="w-40 h-9" value={value.from} max={value.to} onChange={e => e.target.value && onChange({ preset: '', from: e.target.value, to: value.to })} />
        <span className="text-muted-foreground">to</span>
        <Input type="date" className="w-40 h-9" value={value.to} min={value.from} onChange={e => e.target.value && onChange({ preset: '', from: value.from, to: e.target.value })} />
      </div>
    </div>
  );
}

/** CSV + PDF buttons used by every report tab */
export function ExportButtons({ onCSV, onPDF, disabled }: { onCSV: () => void; onPDF: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onCSV} disabled={disabled}>CSV</Button>
      <Button size="sm" className="gap-1.5" onClick={onPDF} disabled={disabled}>PDF</Button>
    </div>
  );
}
