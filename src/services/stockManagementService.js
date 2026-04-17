import { supabase } from '../supabase';

export const stockManagementService = {
    async getAll() {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getById(entryId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('entry_id', entryId)
            .single();
        if (error) throw error;
        return data;
    },

    async create(entryData) {
        const { data, error } = await supabase
            .from('stock_management')
            .insert([entryData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async update(entryId, entryData) {
        const { data, error } = await supabase
            .from('stock_management')
            .update({ ...entryData, updated_at: new Date().toISOString() })
            .eq('entry_id', entryId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async delete(entryId) {
        const { error } = await supabase
            .from('stock_management')
            .delete()
            .eq('entry_id', entryId);
        if (error) throw error;
        return true;
    },

    async getByGodown(godownId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('godown_id', godownId)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByProduct(productId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('product_id', productId)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByDateRange(startDate, endDate) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByType(transactionType) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('transaction_type', transactionType)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },
};