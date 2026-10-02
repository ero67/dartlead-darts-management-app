import React from 'react';
import { Play, Star } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Groups preview + edit before the tournament officially starts.
export function GroupsPreviewDialog({ open, onClose, groups, seededPlayerIds, onMovePlayer, onRegenerate, onConfirm, isStarting }) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('registration.groupPreviewTitle') || 'Groups preview (edit before start)'}</DialogTitle>
          <DialogDescription>
            {t('registration.groupPreviewHint') || 'You can move players between groups. Groups + matches will be created only after you confirm Start.'}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6">
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRegenerate}>
              {t('registration.regenerateGroups') || 'Shuffle / regenerate'}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(group => (
              <Card key={group.id} className="gap-3 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{group.name}</span>
                    <Badge variant="secondary" className="tabular-nums">{(group.players || []).length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 px-4">
                  {(group.players || []).map(player => (
                    <div key={player.id} className="flex items-center gap-2 text-sm">
                      {seededPlayerIds.has(player.id) && <Star className="size-3.5 shrink-0 fill-current text-amber-500" />}
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{player.name}</span>
                      <Select value={group.id} onValueChange={(toGroupId) => onMovePlayer(player.id, toGroupId)}>
                        <SelectTrigger size="sm" className="w-24 shrink-0" title={t('registration.moveToGroup') || 'Move to group'} aria-label={t('registration.moveToGroup') || 'Move to group'}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('registration.cancel') || 'Cancel'}</Button>
          <Button onClick={onConfirm} disabled={isStarting}>
            <Play />
            {isStarting ? t('common.loading') : t('registration.startTournament')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
