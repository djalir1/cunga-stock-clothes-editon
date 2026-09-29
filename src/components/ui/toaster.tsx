import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long each kind of message stays up (ms). Errors stay longer so they can be read. */
const DURATION = { default: 3500, info: 4500, destructive: 7000 } as const;

const STYLE = {
  default: { icon: CheckCircle2, iconClass: "text-green-600 bg-green-600/10", bar: "bg-green-600" },
  info: { icon: Info, iconClass: "text-primary bg-primary/10", bar: "bg-primary" },
  destructive: { icon: AlertTriangle, iconClass: "text-destructive bg-destructive/10", bar: "bg-destructive" },
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant, duration, ...props }) {
        const kind = (variant ?? "default") as keyof typeof STYLE;
        const { icon: Icon, iconClass, bar } = STYLE[kind];
        const ms = duration ?? DURATION[kind];
        return (
          <Toast key={id} variant={kind} duration={ms} {...props}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 rounded-full p-1.5 shrink-0", iconClass)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="grid gap-0.5">
                {title && <ToastTitle className="text-sm font-semibold">{title}</ToastTitle>}
                {description && <ToastDescription className="text-sm text-muted-foreground opacity-100">{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
            {/* Time left before it closes (pauses while hovered, like the toast itself) */}
            <span
              className={cn("absolute bottom-0 left-0 h-1 w-full origin-left animate-toast-timer group-hover:[animation-play-state:paused]", bar)}
              style={{ animationDuration: `${ms}ms` }}
            />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
