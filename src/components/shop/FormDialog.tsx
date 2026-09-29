import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Dialog for forms: the body scrolls, the header and the action buttons stay
 * visible, so the save button is never pushed off-screen on small displays.
 */
export function FormDialog({ open, onOpenChange, title, description, children, footer, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[92vh] flex flex-col gap-0 p-0 sm:max-w-lg', className)}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">{children}</div>
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:rounded-b-lg">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}
