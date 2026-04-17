import { supabase } from '../supabase';

export const masterInventoryService = {
    async getDailySummary(date) {
        const { data, error } = await supabase
            .from('daily_stock_summary')
            .select('*')
            .eq('date', date)
            .order('godown_id', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getDailySummaryByGodown(godownId, date) {
        const { data, error } = await supabase
            .from('daily_stock_summary')
            .select('*')
            .eq('date', date)
            .eq('godown_id', godownId)
            .order('product_id', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getDailySummaryByProduct(productId, date) {
        const { data, error } = await supabase
            .from('daily_stock_summary')
            .select('*')
            .eq('date', date)
            .eq('product_id', productId)
            .order('godown_id', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getDateRangeSummary(startDate, endDate) {
        const { data, error } = await supabase
            .from('daily_stock_summary')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });
        if (error) throw error;
        return data;
    },

    async updateDailySummary(date, godownId, productId) {
        const { data, error } = await supabase.rpc('update_daily_stock_summary', {
            p_date: date,
            p_godown_id: godownId,
            p_product_id: productId
        });
        if (error) throw error;
        return data;
    },

    async getMasterInventoryData(godownId = null) {
        let query = supabase
            .from('daily_stock_summary')
            .select('*, godowns(name, city), products(name, sku, unit)')
            .order('date', { ascending: false })
            .order('godown_id', { ascending: true });

        if (godownId) {
            query = query.eq('godown_id', godownId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async generateTodaySummary() {
        const today = new Date().toISOString().split('T')[0];
        
        const [godownsRes, productsRes] = await Promise.all([
            supabase.from('godowns').select('godown_id').eq('is_active', true),
            supabase.from('products').select('product_id').eq('is_active', true)
        ]);

        const godowns = godownsRes.data || [];
        const products = productsRes.data || [];

        for (const godown of godowns) {
            for (const product of products) {
                await supabase.rpc('update_daily_stock_summary', {
                    p_date: today,
                    p_godown_id: godown.godown_id,
                    p_product_id: product.product_id
                });
            }
        }

        return true;
    },
};