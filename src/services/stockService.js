import { supabase } from '../supabase';

export const stockService = {
    async getAll() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getByGodown(godownId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('godown_id', godownId);
        if (error) throw error;
        return data || [];
    },

    async getByProduct(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return data;
    },

    async getStock(productId, godownId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    async updateStock(productId, godownId, quantity) {
        const { data, error } = await supabase
            .from('products')
            .update({
                current_stock: quantity,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async addStock(productId, godownId, quantity) {
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('current_stock')
            .eq('product_id', productId)
            .single();

        if (fetchError) throw fetchError;

        const newCurrentStock = (parseFloat(product.current_stock) || 0) + parseFloat(quantity);

        const { data, error } = await supabase
            .from('products')
            .update({
                current_stock: newCurrentStock,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async removeStock(productId, godownId, quantity) {
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('current_stock')
            .eq('product_id', productId)
            .single();

        if (fetchError) throw fetchError;

        const currentStock = parseFloat(product.current_stock) || 0;
        const newCurrentStock = currentStock - parseFloat(quantity);

        if (newCurrentStock < 0) {
            throw new Error('Insufficient stock');
        }

        const { data, error } = await supabase
            .from('products')
            .update({
                current_stock: newCurrentStock,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getTotalStockByProduct(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('current_stock')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return parseFloat(data.current_stock) || 0;
    },

    async getAllStockWithDetails() {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                godowns (name, city)
            `)
            .order('name', { ascending: true });
        if (error) throw error;
        return (data || []).map(p => ({
            ...p,
            product_name: p.name,
            godown_name: p.godowns?.name
        }));
    },
};