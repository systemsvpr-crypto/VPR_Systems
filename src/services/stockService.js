import { supabase } from '../supabase';

export const stockService = {
    async getAll() {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByGodown(godownId) {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select('*')
            .eq('godown_id', godownId);
        if (error) throw error;
        return data;
    },

    async getByProduct(productId) {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select('*')
            .eq('product_id', productId);
        if (error) throw error;
        return data;
    },

    async getStock(productId, godownId) {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select('*')
            .eq('product_id', productId)
            .eq('godown_id', godownId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async updateStock(productId, godownId, quantity) {
        const existing = await this.getStock(productId, godownId);
        
        if (existing) {
            const { data, error } = await supabase
                .from('product_godown_stock')
                .update({
                    current_stock: quantity,
                    updated_at: new Date().toISOString()
                })
                .eq('product_id', productId)
                .eq('godown_id', godownId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase
                .from('product_godown_stock')
                .insert([{
                    product_id: productId,
                    godown_id: godownId,
                    current_stock: quantity
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    async addStock(productId, godownId, quantity) {
        const existing = await this.getStock(productId, godownId);
        
        if (existing) {
            const newStock = (parseFloat(existing.current_stock) || 0) + parseFloat(quantity);
            const { data, error } = await supabase
                .from('product_godown_stock')
                .update({
                    current_stock: newStock,
                    updated_at: new Date().toISOString()
                })
                .eq('product_id', productId)
                .eq('godown_id', godownId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase
                .from('product_godown_stock')
                .insert([{
                    product_id: productId,
                    godown_id: godownId,
                    current_stock: quantity
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    async removeStock(productId, godownId, quantity) {
        const existing = await this.getStock(productId, godownId);
        
        if (!existing) {
            throw new Error('Stock not found for this product in the godown');
        }

        const currentStock = parseFloat(existing.current_stock) || 0;
        const newStock = currentStock - parseFloat(quantity);

        if (newStock < 0) {
            throw new Error('Insufficient stock');
        }

        const { data, error } = await supabase
            .from('product_godown_stock')
            .update({
                current_stock: newStock,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .eq('godown_id', godownId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getTotalStockByProduct(productId) {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select('current_stock')
            .eq('product_id', productId);
        if (error) throw error;
        return data.reduce((sum, item) => sum + (parseFloat(item.current_stock) || 0), 0);
    },

    async getAllStockWithDetails() {
        const { data, error } = await supabase
            .from('product_godown_stock')
            .select(`
                *,
                products (name, sku, category, unit),
                godowns (name, city)
            `);
        if (error) throw error;
        return data;
    },
};