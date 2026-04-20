import { supabase } from '../supabase';

export const stockService = {
    async getAll() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        // Map products fields to stock-like fields for backward compatibility if needed
        return data.map(p => ({
            ...p,
            current_stock: p.closing_quantity
        }));
    },

    async getByGodown(godownId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('godown_id', godownId);
        if (error) throw error;
        return data.map(p => ({
            ...p,
            current_stock: p.closing_quantity
        }));
    },

    async getByProduct(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return {
            ...data,
            current_stock: data.closing_quantity
        };
    },

    async getStock(productId, godownId) {
        // Since we are consolidating to the products table, we check by productId.
        // We can also verify godownId if needed.
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return null;
        return {
            ...data,
            current_stock: data.closing_quantity
        };
    },

    async updateStock(productId, godownId, quantity) {
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('mux')
            .eq('product_id', productId)
            .single();
        
        if (fetchError) throw fetchError;

        const mux = parseFloat(product.mux) || 0;
        const totalWeight = quantity * mux;

        const { data, error } = await supabase
            .from('products')
            .update({
                closing_quantity: quantity,
                quantity: totalWeight,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();
        
        if (error) throw error;
        return {
            ...data,
            current_stock: data.closing_quantity
        };
    },

    async addStock(productId, godownId, quantity) {
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('closing_quantity, mux')
            .eq('product_id', productId)
            .single();
        
        if (fetchError) throw fetchError;

        const newClosingQty = (parseFloat(product.closing_quantity) || 0) + parseFloat(quantity);
        const mux = parseFloat(product.mux) || 0;
        const newTotalWeight = newClosingQty * mux;

        const { data, error } = await supabase
            .from('products')
            .update({
                closing_quantity: newClosingQty,
                quantity: newTotalWeight,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();
        
        if (error) throw error;
        return {
            ...data,
            current_stock: data.closing_quantity
        };
    },

    async removeStock(productId, godownId, quantity) {
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('closing_quantity, mux')
            .eq('product_id', productId)
            .single();
        
        if (fetchError) throw fetchError;

        const currentClosingQty = parseFloat(product.closing_quantity) || 0;
        const newClosingQty = currentClosingQty - parseFloat(quantity);

        if (newClosingQty < 0) {
            throw new Error('Insufficient stock');
        }

        const mux = parseFloat(product.mux) || 0;
        const newTotalWeight = newClosingQty * mux;

        const { data, error } = await supabase
            .from('products')
            .update({
                closing_quantity: newClosingQty,
                quantity: newTotalWeight,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId)
            .select()
            .single();
        
        if (error) throw error;
        return {
            ...data,
            current_stock: data.closing_quantity
        };
    },

    async getTotalStockByProduct(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('closing_quantity')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return parseFloat(data.closing_quantity) || 0;
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
        return data.map(p => ({
            ...p,
            current_stock: p.closing_quantity,
            product_name: p.name, // compatibility
            godown_name: p.godowns?.name
        }));
    },
};