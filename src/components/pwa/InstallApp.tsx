import { useState } from 'react';
import { useInstall } from '@/lib/pwa';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Share, PlusSquare, Smartphone, X } from 'lucide-react';

const DISMISS_KEY = 'cunga-install-dismissed';

function IosSteps({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Cunga Stock Clothing to your iPhone</DialogTitle>
          <DialogDescription>It opens like a normal app, full screen.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span> Open this page in <b>Safari</b></li>
          <li className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">2</span> Tap <Share className="w-4 h-4 inline text-primary" /> <b>Share</b> at the bottom</li>
          <li className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">3</span> Choose <PlusSquare className="w-4 h-4 inline" /> <b>Add to Home Screen</b></li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** "Install app" button for the sidebar / settings. Renders nothing when not possible or already installed. */
export function InstallButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { state, install } = useInstall();
  const [ios, setIos] = useState(false);
  if (state === 'installed' || state === 'unavailable') return null;
  return (
    <>
      <Button variant="outline" size={compact ? 'icon' : 'sm'} className={className}
        onClick={() => (state === 'prompt' ? install() : setIos(true))} aria-label="Install app">
        <Download className="w-4 h-4" />{!compact && <span className="ml-2">Install app</span>}
      </Button>
      <IosSteps open={ios} onOpenChange={setIos} />
    </>
  );
}

/** Dashboard card inviting staff to install the app on their phone (can be dismissed). */
export function InstallCard() {
  const { state, install } = useInstall();
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (dismissed || state === 'installed' || state === 'unavailable') return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };
  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10">
      <CardContent className="p-4 flex items-center gap-4">
        <img src="/icon-maskable-192.png" alt="" className="w-12 h-12 rounded-xl shadow-sm" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-primary" /> Put Cunga Stock Clothing on your phone</p>
          <p className="text-sm text-muted-foreground">Opens in one tap from the home screen, full screen and faster.</p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => (state === 'prompt' ? install() : setIos(true))}>
          <Download className="w-4 h-4" /> Install
        </Button>
        <Button size="icon" variant="ghost" className="shrink-0" onClick={dismiss} aria-label="Not now"><X className="w-4 h-4" /></Button>
        <IosSteps open={ios} onOpenChange={setIos} />
      </CardContent>
    </Card>
  );
}
