import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, ImagePlus, X } from 'lucide-react';

/** Item photo: take one with the phone camera or choose from the gallery. Optional. */
export function PhotoInput({ url, file, onFile, onRemove }: {
  /** Photo already saved */
  url?: string | null;
  /** New photo picked but not uploaded yet */
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const shown = preview ?? url ?? null;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
        {shown ? (
          <>
            <img src={shown} alt="Item" className="w-full h-full object-cover" />
            <button type="button" aria-label="Remove photo" onClick={onRemove}
              className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : <ImagePlus className="w-7 h-7 text-muted-foreground/60" />}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => cameraRef.current?.click()}>
            <Camera className="w-4 h-4" /> Take photo
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="w-4 h-4" /> Gallery
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Optional. We shrink it to save space and suggest its colours.</p>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}

/** Small square thumbnail used in lists; falls back to the category colour. */
export function ItemThumb({ url, color, className = 'w-10 h-10' }: { url: string | null | undefined; color?: string | null; className?: string }) {
  if (url) return <img src={url} alt="" loading="lazy" className={`${className} rounded-lg object-cover border border-border shrink-0`} />;
  return (
    <span className={`${className} rounded-lg shrink-0 flex items-center justify-center border border-border`}
      style={{ backgroundColor: color ? `${color}22` : undefined }}>
      <svg viewBox="0 0 24 24" className="w-1/2 h-1/2" fill="none" stroke={color ?? 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
        <path d="M8 3l4 2 4-2 5 3-2 4-2-1v12H7V9L5 10 3 6z" />
      </svg>
    </span>
  );
}
