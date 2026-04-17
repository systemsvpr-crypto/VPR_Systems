import { supabase } from '../supabase';

export const productService = {
    async getAll() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getById(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return data;
    },

    async create(productData) {
        const { data, error } = await supabase
            .from('products')
            .insert([productData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async update(productId, productData) {
        const { data, error } = await supabase
            .from('products')
            .update({ ...productData, updated_at: new Date().toISOString() })
            .eq('product_id', productId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async delete(productId) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('product_id', productId);
        if (error) throw error;
        return true;
    },

    async toggleActive(productId, isActive) {
        const { data, error } = await supabase
            .from('products')
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq('product_id', productId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getActive() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getActiveWithStock() {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                product_godown_stock (
                    godown_id,
                    current_stock
                )
            `)
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data;
    },
};