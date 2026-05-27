import { supabase } from '../supabase';

export const vendorService = {
    async getAll() {
        const { data, error } = await supabase
            .from('master_vendors')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(vendorData) {
        const { error } = await supabase
            .from('master_vendors')
            .insert([vendorData]);
        if (error) throw error;
        return true;
    },

    async update(id, vendorData) {
        const { error } = await supabase
            .from('master_vendors')
            .update(vendorData)
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async delete(id) {
        const { error } = await supabase
            .from('master_vendors')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },
};
