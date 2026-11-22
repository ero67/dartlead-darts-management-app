import React, { useEffect, useState } from 'react';
import { ImageOff, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoadingState } from '../shared/LoadingState';
import { refreshActivePartner } from '../../hooks/useActivePartner';
import { confirmDialog } from '../../lib/confirmDialog';
import { partnerService } from '@/services/partnerService';

const AUDIENCES = [
  { value: 'off', label: 'Off', hint: 'Nobody sees a partner.' },
  { value: 'admins', label: 'Admins only', hint: 'Only admins see the active partner (preview, screenshots).' },
  { value: 'everyone', label: 'Everyone', hint: 'Every visitor and player sees the active partner.' },
];
const NONE = 'none';
const EMPTY_FORM = { name: '', code: '', discount_label: '', url: 'https://' };

const imageErrorText = (error) => {
  if (error?.code === 'too_large') return 'Image is larger than 10 MB';
  if (error?.code === 'unsupported') return 'This image format is not supported';
  return error?.message || 'Upload failed';
};

// Admin panel tab: the shop partners, which one is active, and who sees it.
// Players only ever read the active one through get_active_partner().
export function PartnerSettings() {
  const [partners, setPartners] = useState(undefined);
  const [settings, setSettings] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, partner = edit

  useEffect(() => {
    Promise.all([partnerService.listPartners(), partnerService.getSettings()])
      .then(([list, current]) => {
        setPartners(list);
        setSettings(current);
      })
      .catch((error) => {
        console.error('Error loading partners:', error);
        setPartners(null);
      });
  }, []);

  const saveSettings = async (changes) => {
    setIsSaving(true);
    try {
      setSettings(await partnerService.updateSettings(changes));
      refreshActivePartner();
      toast.success('Partner settings saved');
    } catch (error) {
      toast.error(error.message || 'Could not save the partner settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaved = (saved) => {
    setPartners((list) => (list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved]));
    setEditing(null);
    refreshActivePartner();
  };

  const handleDelete = async (partner) => {
    const isActive = settings?.active_partner_id === partner.id;
    const message = isActive
      ? `Delete ${partner.name}? It is the active partner, so players stop seeing it right away.`
      : `Delete ${partner.name}?`;
    if (!(await confirmDialog(message, { title: 'Delete partner', confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await partnerService.deletePartner(partner.id);
      setPartners((list) => list.filter((p) => p.id !== partner.id));
      if (isActive) setSettings((s) => ({ ...s, active_partner_id: null }));
      refreshActivePartner();
      toast.success('Partner deleted');
    } catch (error) {
      toast.error(error.message || 'Could not delete the partner');
    }
  };

  if (partners === undefined) return <LoadingState />;
  if (!partners || !settings) return <p className="text-sm text-destructive">Could not load the partners. Is the shop_partners migration applied?</p>;
  const audience = AUDIENCES.find((a) => a.value === settings.audience);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>Who sees the active partner after matches, in practice, in the sidebar and on the TV display.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={settings.audience}
            onValueChange={(next) => next && next !== settings.audience && saveSettings({ audience: next })}
            disabled={isSaving}
            aria-label="Partner visibility"
            className="justify-start"
          >
            {AUDIENCES.map((a) => (
              <ToggleGroupItem key={a.value} value={a.value} className="min-h-11 px-4">{a.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-sm text-muted-foreground">{audience?.hint}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Partners</CardTitle>
            <CardDescription>At most one partner is active at a time.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus />
            Add partner
          </Button>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={settings.active_partner_id ?? NONE}
            onValueChange={(value) => saveSettings({ active_partner_id: value === NONE ? null : value })}
            disabled={isSaving}
            aria-label="Active partner"
            className="gap-0 divide-y"
          >
            <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
              <RadioGroupItem value={NONE} />
              <span className="text-sm text-muted-foreground">No active partner</span>
            </label>
            {partners.map((partner) => (
              <div key={partner.id} className="flex min-h-14 items-center gap-3 py-2">
                <RadioGroupItem value={partner.id} id={`partner-${partner.id}`} aria-label={`Make ${partner.name} active`} />
                <label htmlFor={`partner-${partner.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  {partner.image_url
                    ? <img src={partner.image_url} alt="" className="h-8 w-20 shrink-0 object-contain" />
                    : <span className="flex h-8 w-20 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"><ImageOff className="size-4" /></span>}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{partner.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{partner.discount_label} · {partner.code}</span>
                  </span>
                </label>
                <Button variant="ghost" size="icon" aria-label={`Edit ${partner.name}`} onClick={() => setEditing(partner)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${partner.name}`} onClick={() => handleDelete(partner)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {editing && <PartnerDialog partner={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
    </div>
  );
}

function PartnerDialog({ partner, onClose, onSaved }) {
  const isNew = !partner.id;
  const [form, setForm] = useState(isNew ? EMPTY_FORM : {
    name: partner.name, code: partner.code, discount_label: partner.discount_label, url: partner.url,
  });
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(partner.image_url || null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!imageFile) return undefined;
    const objectUrl = URL.createObjectURL(imageFile);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const isUrlValid = form.url.startsWith('https://') && form.url.length > 'https://'.length;
  const canSave = form.name.trim() && form.code.trim() && form.discount_label.trim() && isUrlValid && !isSaving;
  const setField = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const fields = { id: partner.id, name: form.name.trim(), code: form.code.trim(), discount_label: form.discount_label.trim(), url: form.url.trim() };
      const { imageError, ...saved } = await partnerService.savePartner(fields, imageFile);
      onSaved(saved);
      if (imageError) toast.error(`${saved.name} saved without the image: ${imageErrorText(imageError)}`);
      else toast.success(isNew ? 'Partner added' : 'Partner saved');
    } catch (error) {
      toast.error(imageErrorText(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    if (imageFile) {
      setImageFile(null);
      setPreview(partner.image_url || null);
      return;
    }
    setIsSaving(true);
    try {
      onSaved(await partnerService.removePartnerImage(partner.id));
      toast.success('Image removed');
    } catch (error) {
      toast.error(error.message || 'Could not remove the image');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add partner' : `Edit ${partner.name}`}</DialogTitle>
          <DialogDescription>Players see the name or image, the discount and the code, linked to the shop.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="partner-name">Name</Label>
            <Input id="partner-name" value={form.name} onChange={setField('name')} placeholder="Darteg" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner-code">Discount code</Label>
              <Input id="partner-code" value={form.code} onChange={setField('code')} placeholder="DARTLEAD" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="partner-discount">Discount</Label>
              <Input id="partner-discount" value={form.discount_label} onChange={setField('discount_label')} placeholder="−10 %" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="partner-url">Shop URL</Label>
            <Input id="partner-url" type="url" value={form.url} onChange={setField('url')} aria-invalid={!isUrlValid} />
            {!isUrlValid && <p className="text-xs text-destructive">URL must start with https://</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="partner-image">Logo or banner</Label>
            {preview && <img src={preview} alt="" className="h-16 max-w-full self-start rounded border object-contain p-1" />}
            <div className="flex items-center gap-2">
              <Input id="partner-image" type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
              {preview && (
                <Button variant="outline" size="sm" onClick={handleRemoveImage} disabled={isSaving || (!imageFile && isNew)}>
                  Remove image
                </Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            <Save />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
