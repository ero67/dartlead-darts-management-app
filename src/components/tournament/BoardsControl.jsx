import React, { useState, useEffect } from 'react';
import { Target, Wand2, Eraser, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tournamentService } from '../../services/tournamentService';
import { autoAssignBoards, pendingInPlayOrder } from '../../utils/boardSchedule';
import { toast } from 'sonner';

const boardsOfGroups = (groups) => Object.fromEntries((groups || []).map((g) => [g.id, g.boards || []]));

// Manager control above the match lists: number of boards, auto-assign the
// waiting matches of the current stage, clear, and which boards each group
// plays on (none = any). Finished and live matches keep their board (the RPC
// only touches pending ones).
export function BoardsControl({ tournament, onSaved, t }) {
  const [count, setCount] = useState(tournament.boardCount ? String(tournament.boardCount) : '');
  const [groupBoards, setGroupBoards] = useState(() => boardsOfGroups(tournament.groups));
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => { setCount(tournament.boardCount ? String(tournament.boardCount) : ''); }, [tournament.boardCount]);
  useEffect(() => { setGroupBoards(boardsOfGroups(tournament.groups)); }, [tournament.groups]);

  const boards = Number.parseInt(count, 10);
  const isValid = boards >= 1 && boards <= 99;
  const waiting = pendingInPlayOrder(tournament);
  const assignedCount = waiting.filter((m) => m.assignedBoard).length;
  // Group boards only matter while group matches are waiting (not in playoffs).
  const showGroupBoards = isValid && waiting.some((m) => m.groupId);

  const save = async (assignments, message, groups = null) => {
    setIsSaving(true);
    try {
      await tournamentService.setMatchBoards(tournament.id, boards, assignments, groups);
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

  const toggleGroupBoard = (groupId, board) => {
    setGroupBoards((prev) => {
      const current = prev[groupId] || [];
      const next = current.includes(board) ? current.filter((b) => b !== board) : [...current, board].sort((a, b) => a - b);
      return { ...prev, [groupId]: next };
    });
  };

  const handleSaveGroupBoards = () => save({}, t('boards.groupBoardsSaved'), groupBoards);

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
      {showGroupBoards && (
        <div className="basis-full flex flex-col gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">{t('boards.groupBoards')}</span>
          {tournament.groups.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-sm font-medium">{g.name}</span>
              {Array.from({ length: boards }, (_, i) => i + 1).map((b) => {
                const isOn = (groupBoards[g.id] || []).includes(b);
                return (
                  <Button
                    key={b}
                    type="button"
                    size="sm"
                    variant={isOn ? 'default' : 'outline'}
                    aria-pressed={isOn}
                    className="min-w-9 tabular-nums"
                    onClick={() => toggleGroupBoard(g.id, b)}
                  >
                    {b}
                  </Button>
                );
              })}
              {(groupBoards[g.id] || []).length === 0 && <span className="text-xs text-muted-foreground">{t('boards.anyBoard')}</span>}
            </div>
          ))}
          <Button variant="outline" className="self-start" onClick={handleSaveGroupBoards} disabled={isSaving}>
            <Save />
            {t('boards.saveGroupBoards')}
          </Button>
        </div>
      )}
    </Card>
  );
}
