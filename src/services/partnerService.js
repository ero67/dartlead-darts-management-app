import { supabase } from '../lib/supabase.js';
import { mediaService } from './mediaService.js';

const PARTNER_COLUMNS = 'id, name, code, discount_label, url, image_url';
const SETTINGS_COLUMNS = 'audience, active_partner_id';
const imagePath = (id) => `partners/${id}.webp`;

export const partnerService = {
  // The partner players see right now, or null (none active, hidden by the visibility switch, or an error).
  async getActivePartner() {
    try {
      // Plain array, not .maybeSingle(): that asks PostgREST for one object and gets a 406 when none is active.
      const { data, error } = await supabase.rpc('get_active_partner');
      if (error) throw error;
      return data?.[0] ?? null;
    } catch (error) {
      console.error('Error loading the active partner:', error);
      return null;
    }
  },

  // Everything below is admins only (RLS) and throws on failure.
  async listPartners() {
    const { data, error } = await supabase.from('partners').select(PARTNER_COLUMNS).order('created_at');
    if (error) throw error;
    return data;
  },

  async getSettings() {
    const { data, error } = await supabase.from('partner_settings').select(SETTINGS_COLUMNS).single();
    if (error) throw error;
    return data;
  },

  async updateSettings(changes) {
    const { data, error } = await supabase
      .from('partner_settings')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  // Insert (no id) or update the partner, then upload the image when one is given:
  // the storage path needs the partner's id, so the row comes first. A failed upload
  // does not throw (the row is already saved, and Save again would insert a duplicate):
  // the saved partner comes back with `imageError` set instead.
  async savePartner({ id, name, code, discount_label, url }, imageFile = null) {
    const fields = { name, code, discount_label, url, updated_at: new Date().toISOString() };
    const query = id
      ? supabase.from('partners').update(fields).eq('id', id)
      : supabase.from('partners').insert(fields);
    const { data, error } = await query.select(PARTNER_COLUMNS).single();
    if (error) throw error;
    if (!imageFile) return data;
    try {
      const imageUrl = await mediaService.uploadImage(imagePath(data.id), imageFile, { maxSide: 512, square: false });
      return await this.setImageUrl(data.id, imageUrl);
    } catch (imageError) {
      return { ...data, imageError };
    }
  },

  async setImageUrl(id, imageUrl) {
    const { data, error } = await supabase
      .from('partners')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(PARTNER_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async removePartnerImage(id) {
    await mediaService.removeImage(imagePath(id));
    return this.setImageUrl(id, null);
  },

  // File first (storage remove of a missing file is not an error), then the row;
  // partner_settings.active_partner_id falls back to NULL in the database.
  async deletePartner(id) {
    await mediaService.removeImage(imagePath(id));
    const { error } = await supabase.from('partners').delete().eq('id', id);
    if (error) throw error;
  },
};
