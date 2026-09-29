import { whatsappLink } from '@/hooks/useDebts';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle } from 'lucide-react';

/** Call / WhatsApp buttons. WhatsApp opens with the message ready to send (staff still press send). */
export function ContactButtons({ phone, message, compact = false }: { phone: string | null; message: string; compact?: boolean }) {
  if (!phone) return null;
  const wa = whatsappLink(phone, message);
  return (
    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
      <Button asChild size={compact ? 'icon' : 'sm'} variant="outline" className={compact ? 'h-8 w-8' : 'gap-1.5 h-8'}>
        <a href={`tel:${phone.replace(/\s/g, '')}`} aria-label="Call"><Phone className="w-3.5 h-3.5" />{!compact && 'Call'}</a>
      </Button>
      {wa && (
        <Button asChild size={compact ? 'icon' : 'sm'} variant="outline"
          className={`${compact ? 'h-8 w-8' : 'gap-1.5 h-8'} text-green-700 border-green-600/40 hover:bg-green-600/10 dark:text-green-400`}>
          <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp reminder"><MessageCircle className="w-3.5 h-3.5" />{!compact && 'WhatsApp'}</a>
        </Button>
      )}
    </div>
  );
}
