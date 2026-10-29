import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingState } from '../shared/LoadingState';
import { assistantService } from '@/services/assistantService';

// Admin panel tab: who sees the AI assistant and how many questions a day each user may ask.
// The API enforces both through use_assistant_question; the web app only hides the button.
export function AssistantSettings() {
  const [settings, setSettings] = useState(undefined);
  const [limits, setLimits] = useState({ daily_limit: '', admin_daily_limit: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    assistantService.getSettings().then((data) => {
      setSettings(data);
      if (data) setLimits({ daily_limit: String(data.daily_limit), admin_daily_limit: String(data.admin_daily_limit) });
    });
  }, []);

  const save = async (changes) => {
    setIsSaving(true);
    try {
      setSettings(await assistantService.updateSettings(changes));
      toast.success('Assistant settings saved');
    } catch (error) {
      toast.error(error.message || 'Could not save the assistant settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLimits = () => {
    const daily = Number.parseInt(limits.daily_limit, 10);
    const adminDaily = Number.parseInt(limits.admin_daily_limit, 10);
    if (!(daily >= 0 && adminDaily >= 0)) {
      toast.error('Limits must be whole numbers, 0 or more');
      return;
    }
    save({ daily_limit: daily, admin_daily_limit: adminDaily });
  };

  if (settings === undefined) return <LoadingState />;
  if (!settings) return <p className="text-sm text-destructive">Could not load the assistant settings. Is the assistant_access migration applied?</p>;
  const isPublic = settings.audience === 'everyone';

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI assistant</CardTitle>
        <CardDescription>Who can use the chat, and how many questions each user may ask per day (UTC).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="assistant-public">Available to everyone</Label>
            <p className="text-sm text-muted-foreground">
              {isPublic
                ? 'Every signed-in user sees the chat, and the landing page shows the assistant section.'
                : 'Only admins see the chat. The landing page section is hidden.'}
            </p>
          </div>
          <Switch
            id="assistant-public"
            checked={isPublic}
            disabled={isSaving}
            onCheckedChange={(checked) => save({ audience: checked ? 'everyone' : 'admins' })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="assistant-daily-limit">Questions per day, per user</Label>
            <Input id="assistant-daily-limit" type="number" min="0" value={limits.daily_limit}
              onChange={(event) => setLimits(l => ({ ...l, daily_limit: event.target.value }))} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="assistant-admin-daily-limit">Questions per day, per admin</Label>
            <Input id="assistant-admin-daily-limit" type="number" min="0" value={limits.admin_daily_limit}
              onChange={(event) => setLimits(l => ({ ...l, admin_daily_limit: event.target.value }))} />
          </div>
        </div>
        <Button className="w-fit" onClick={handleSaveLimits} disabled={isSaving}>
          <Save />
          Save limits
        </Button>
      </CardContent>
    </Card>
  );
}
