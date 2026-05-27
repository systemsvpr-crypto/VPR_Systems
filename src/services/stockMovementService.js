import { supabase } from '../supabase';

export const stockMovementService = {
    async getGodowns() {
        const { data, error } = await supabase
            .from('godowns')
            .select('godown_id, name, is_active')
            .order('name');
        if (error) throw error;
        return data || [];
    },

    async getAllProductsPaginated() {
        let allProducts = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('products')
                .select('id, product_id, name, godown_id, mux, is_active, product_type')
                .eq('is_active', true)
                .range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allProducts = allProducts.concat(data);
            if (data.length < pageSize) break;
            page++;
        }
        return allProducts;
    },

    async getTransfers(startDate, endDate) {
        let query = supabase
            .from('stock_management')
            .select('*')
            .not('godown_id', 'is', null)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async getGodownSummary(godownId, date) {
        let query = supabase
            .from('stock_management')
            .select('transaction_type, quantity, product_id, date')
            .eq('godown_id', godownId)
            .not('entry_id', 'like', '%-SRC')
            .order('date', { ascending: false })
            .limit(20000);

        if (date) {
            query = query.gte('date', date).lte('date', date);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async getProductTransactions(productId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('product_id', productId)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getProductClosingQuantity(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('current_stock')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return parseFloat(data?.current_stock) || 0;
    },
};
