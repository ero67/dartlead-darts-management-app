import React, { useState, useEffect } from 'react';
import { Monitor, Target, Save, X, Vibrate } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useLanguage } from '../contexts/LanguageContext';
import { HAPTIC_LEVELS, getHapticsLevel, setHapticsLevel, isHapticsAvailable, hapticTap } from '../lib/haptics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function DeviceSettings({ isOpen, onClose }) {
  const { deviceId, deviceName, boardNumber, setDeviceInfo } = useLiveMatch();
  const { t } = useLanguage();

  const [localDeviceName, setLocalDeviceName] = useState(deviceName || '');
  const [localBoardNumber, setLocalBoardNumber] = useState(boardNumber || '');
  const [saved, setSaved] = useState(false);
  const [hapticsLevel, setHapticsLevelState] = useState(getHapticsLevel());

  // Applies immediately (per device, not per account) and plays a sample so
  // the user can compare strengths without leaving the dialog.
  const handleHapticsChange = (next) => {
    if (!next) return; // ToggleGroup reports '' when the active item is tapped again
    setHapticsLevel(next);
    setHapticsLevelState(next);
    hapticTap();
  };

  // Update local state when context changes
  useEffect(() => {
    setLocalDeviceName(deviceName || '');
    setLocalBoardNumber(boardNumber || '');
  }, [deviceName, boardNumber]);

  const handleSave = () => {
    const parsedBoardNumber = localBoardNumber ? parseInt(localBoardNumber, 10) : null;
    setDeviceInfo(
      localDeviceName.trim() || null,
      isNaN(parsedBoardNumber) ? null : parsedBoardNumber
    );
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  // Dialog portals to document.body, so opening it from inside the sidebar
  // drawer on phones still gives a real full-screen sheet.
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="tw sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deviceSettings.title', 'Nastavenia zariadenia')}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Monitor className="size-4" />
            <span>Device ID:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{deviceId}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deviceName" className="flex items-center gap-2">
              <Monitor className="size-4" />
              {t('deviceSettings.deviceName', 'Názov zariadenia')}
            </Label>
            <Input
              id="deviceName"
              value={localDeviceName}
              onChange={(e) => setLocalDeviceName(e.target.value)}
              placeholder={t('deviceSettings.deviceNamePlaceholder', 'napr. Tablet pri okne')}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">{t('deviceSettings.deviceNameHint', 'Vlastný názov pre ľahšiu identifikáciu')}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="boardNumber" className="flex items-center gap-2">
              <Target className="size-4" />
              {t('deviceSettings.boardNumber', 'Číslo terča')}
            </Label>
            <Input
              id="boardNumber"
              type="number"
              inputMode="numeric"
              min="1"
              max="99"
              value={localBoardNumber}
              onChange={(e) => setLocalBoardNumber(e.target.value)}
              placeholder={t('deviceSettings.boardNumberPlaceholder', 'napr. 1, 2, 3...')}
            />
            <p className="text-xs text-muted-foreground">{t('deviceSettings.boardNumberHint', 'Číslo terča pri ktorom je toto zariadenie')}</p>
          </div>

          {isHapticsAvailable() && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-2">
                <Vibrate className="size-4" />
                {t('deviceSettings.haptics', 'Vibration feedback')}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={hapticsLevel}
                onValueChange={handleHapticsChange}
                aria-label={t('deviceSettings.haptics', 'Vibration feedback')}
                className="justify-start"
              >
                {HAPTIC_LEVELS.map((lvl) => (
                  <ToggleGroupItem key={lvl} value={lvl} className="min-h-11 px-4">
                    {t(`deviceSettings.haptics_${lvl}`, lvl)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {t('deviceSettings.hapticsHint', 'Keypad taps, busts and won legs on the match screen. Applies to this device only.')}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">{t('deviceSettings.preview', 'Náhľad zobrazenia')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {localBoardNumber ? (
                <Badge className="tabular-nums">
                  <Target className="size-3" />
                  {t('deviceSettings.board', 'Board')} {localBoardNumber}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">—</Badge>
              )}
              {localDeviceName && <Badge variant="secondary">{localDeviceName}</Badge>}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground tabular-nums" title={`${__APP_VERSION__} (${__BUILD_SHA__})`}>
            {t('deviceSettings.version', 'Version')} {__APP_VERSION__} · {__BUILD_SHA__}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X />
            {t('common.cancel', 'Zrušiť')}
          </Button>
          <Button onClick={handleSave} disabled={saved}>
            <Save />
            {saved ? t('common.saved', 'Uložené!') : t('common.save', 'Uložiť')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Inline component for showing device badge in match lists
export function DeviceBadge({ boardNumber, deviceName, compact = false }) {
  const { t } = useLanguage();

  if (!boardNumber && !deviceName) return null;

  return (
    <span className="tw inline-flex flex-wrap items-center gap-1">
      {boardNumber && (
        <Badge variant="secondary" className={compact ? 'px-1.5 text-[11px]' : ''}>
          <Target className={compact ? 'size-3' : 'size-3.5'} />
          <span>{t('deviceSettings.board', 'Board')} {boardNumber}</span>
        </Badge>
      )}
      {deviceName && !compact && <Badge variant="outline">{deviceName}</Badge>}
    </span>
  );
}
