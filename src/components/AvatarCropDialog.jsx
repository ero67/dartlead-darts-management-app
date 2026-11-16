import React, { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MIN_ZOOM = 1; // the photo just fills the circle
const MAX_ZOOM = 4;

// Position and zoom a new profile photo inside the circle before it uploads.
// onSave gets the picked square in source pixels ({ x, y, width, height }).
export function AvatarCropDialog({ file, onSave, onCancel, onUnsupported }) {
  const { t } = useLanguage();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState(null);
  const [url, setUrl] = useState(null);
  // Create and revoke in one effect so StrictMode's double run can't revoke a URL still in use.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('playerProfile.adjustPhoto')}</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
              mediaProps={{ onError: onUnsupported }}
            />
          )}
        </div>
        <label className="flex items-center gap-3 text-muted-foreground">
          <ZoomOut className="size-4 shrink-0" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t('playerProfile.zoom')}
            className="w-full accent-primary"
          />
          <ZoomIn className="size-4 shrink-0" />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button onClick={() => onSave(area)} disabled={!area}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
