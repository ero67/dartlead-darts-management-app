import React, { useState, useEffect } from 'react';
import { Target, Wand2, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tournamentService } from '../../services/tournamentService';
import { autoAssignBoards, pendingInPlayOrder } from '../../utils/boardSchedule';
import { toast } from 'sonner';

// Manager control above the match lists: number of boards, auto-assign the
// waiting matches of the current stage, clear. Finished and live matches keep
// their board (the RPC only touches pending ones).
export function BoardsControl({ tournament, onSaved, t }) {
  const [count, setCount] = useState(tournament.boardCount ? String(tournament.boardCount) : '');
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => { setCount(tournament.boardCount ? String(tournament.boardCount) : ''); }, [tournament.boardCount]);

  const boards = Number.parseInt(count, 10);
  const isValid = boards >= 1 && boards <= 99;
  const waiting = pendingInPlayOrder(tournament);
  const assignedCount = waiting.filter((m) => m.assignedBoard).length;

  const save = async (assignments, message) => {
    setIsSaving(true);
    try {
      await tournamentService.setMatchBoards(tournament.id, boards, assignments);
      await onSaved();
      toast.success(message);
    } catch (error) {
      console.error('Error saving board assignments:', error);
      toast.error(t('boards.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoAssign = () => {
    const assignments = autoAssignBoards(tournament, boards);
    save(assignments, t('boards.assigned', { count: Object.keys(assignments).length, boards }));
  };

  const handleClear = () => {
    save(Object.fromEntries(waiting.filter((m) => m.assignedBoard).map((m) => [m.id, null])), t('boards.cleared'));
  };

  return (
    <Card className="flex-row flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-count" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Target className="size-3.5" />
          {t('boards.count')}
        </Label>
        <Input
          id="board-count"
          type="number"
          inputMode="numeric"
          min="1"
          max="99"
          className="w-20"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <Button onClick={handleAutoAssign} disabled={!isValid || isSaving || waiting.length === 0}>
        <Wand2 />
        {t('boards.autoAssign')}
      </Button>
      <Button variant="outline" onClick={handleClear} disabled={!isValid || isSaving || assignedCount === 0}>
        <Eraser />
        {t('boards.clear')}
      </Button>
      <p className="basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1 sm:self-center">
        {waiting.length === 0 ? t('boards.nothingWaiting') : t('boards.hint', { assigned: assignedCount, waiting: waiting.length })}
      </p>
    </Card>
  );
}
