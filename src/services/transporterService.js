import { supabase } from '../supabase';

export const transporterService = {
    async getAll() {
        const { data, error } = await supabase
            .from('transporters')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(transporterData) {
        const { error } = await supabase
            .from('transporters')
            .insert([transporterData]);
        if (error) throw error;
        return true;
    },

    async update(transporterId, transporterData) {
        const { error } = await supabase
            .from('transporters')
            .update({ ...transporterData, updated_at: new Date().toISOString() })
            .eq('transporter_id', transporterId);
        if (error) throw error;
        return true;
    },

    async delete(transporterId) {
        const { error } = await supabase
            .from('transporters')
            .delete()
            .eq('transporter_id', transporterId);
        if (error) throw error;
        return true;
    },

    async getActiveGodowns() {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getActiveProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getFreightHistory() {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*, godowns!stock_management_from_location_fkey(name), transporters!stock_management_transporter_id_fkey(name)')
            .eq('transaction_type', 'in')
            .not('transporter_id', 'is', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },
};
