import { supabase } from '../supabase';

export const godownService = {
    async getAll() {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getById(godownId) {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .eq('godown_id', godownId)
            .single();
        if (error) throw error;
        return data;
    },

    async create(godownData) {
        const { data, error } = await supabase
            .from('godowns')
            .insert([godownData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async update(godownId, godownData) {
        const { data, error } = await supabase
            .from('godowns')
            .update({ ...godownData, updated_at: new Date().toISOString() })
            .eq('godown_id', godownId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async delete(godownId) {
        const { error } = await supabase
            .from('godowns')
            .delete()
            .eq('godown_id', godownId);
        if (error) throw error;
        return true;
    },

    async toggleActive(godownId, isActive) {
        const { data, error } = await supabase
            .from('godowns')
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq('godown_id', godownId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getActive() {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data;
    },

    async generateGodownId() {
        const { data, error } = await supabase.rpc('generate_godown_id');
        if (error) throw error;
        return data;
    },
};