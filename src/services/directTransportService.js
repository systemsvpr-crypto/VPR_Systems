import { supabase } from '../supabase';

export const directTransportService = {
    async getAll() {
        const { data, error } = await supabase
            .from('direct_delivery_transport')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(entryData) {
        const { error } = await supabase
            .from('direct_delivery_transport')
            .insert([entryData]);
        if (error) throw error;
        return true;
    },

    async update(id, entryData) {
        const { error } = await supabase
            .from('direct_delivery_transport')
            .update({ ...entryData, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async delete(id) {
        const { error } = await supabase
            .from('direct_delivery_transport')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async getProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getTransporters() {
        const { data, error } = await supabase
            .from('transporters')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getCustomers() {
        const { data, error } = await supabase
            .from('master_customers')
            .select('*')
            .order('customer_name', { ascending: true });
        if (error) throw error;
        return data || [];
    },
};
