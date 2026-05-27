import { supabase } from '../supabase';

export const masterProductService = {
    async getAll() {
        const { data, error } = await supabase
            .from('master_product')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getVariantCounts() {
        const { data: products, error } = await supabase
            .from('products')
            .select('master_product_id')
            .eq('is_active', true)
            .order('id')
            .limit(10000);
        if (error) throw error;
        const counts = {};
        (products || []).forEach(p => {
            if (p.master_product_id) {
                counts[p.master_product_id] = (counts[p.master_product_id] || 0) + 1;
            }
        });
        return counts;
    },

    async create(data) {
        const { error } = await supabase
            .from('master_product')
            .insert([data]);
        if (error) throw error;
        return true;
    },

    async update(id, data) {
        const { error } = await supabase
            .from('master_product')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async getLinkedProductCount(id) {
        const { count, error } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('master_product_id', id);
        if (error) throw error;
        return count || 0;
    },

    async delete(id) {
        const { error } = await supabase
            .from('master_product')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async getAllProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('id, name, product_id, unit, master_product_id, godown_id')
            .order('name', { ascending: true })
            .limit(10000);
        if (error) throw error;
        return data || [];
    },

    async getVariantsByMasterId(masterId) {
        const { data, error } = await supabase
            .from('products')
            .select('name, product_id, unit, description')
            .eq('master_product_id', masterId)
            .order('name', { ascending: true })
            .limit(1000);
        if (error) throw error;
        return data || [];
    },

    async getPreviouslyLinkedIds(masterId) {
        const { data, error } = await supabase
            .from('products')
            .select('id')
            .eq('master_product_id', masterId);
        if (error) throw error;
        return (data || []).map(p => p.id);
    },

    async unlinkAll(masterId) {
        const { error } = await supabase
            .from('products')
            .update({ master_product_id: null })
            .eq('master_product_id', masterId);
        if (error) throw error;
        return true;
    },

    async linkProducts(masterId, productIds) {
        const { error } = await supabase
            .from('products')
            .update({ master_product_id: masterId })
            .in('id', productIds);
        if (error) throw error;
        return true;
    },
};
