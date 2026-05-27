import { supabase } from '../supabase';

export const customerService = {
    async getAll() {
        const { data, error } = await supabase
            .from('master_customers')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(customerData) {
        const { error } = await supabase
            .from('master_customers')
            .insert([customerData]);
        if (error) throw error;
        return true;
    },

    async update(id, customerData) {
        const { error } = await supabase
            .from('master_customers')
            .update(customerData)
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async delete(id) {
        const { error } = await supabase
            .from('master_customers')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },
};
