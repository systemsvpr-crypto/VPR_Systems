import { supabase } from '../supabase';

const BATCH_SIZE = 1000;
const EXPORT_BATCH_SIZE = 1000;
const PAGE_SIZE = 50;

export const liveStockDashboardService = {
    async fetchGodownsAndTransactions(summaryDate) {
        const [godownsRes, transactionsRes, prodNamesRes] = await Promise.all([
            supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('stock_management').select('*').eq('date', summaryDate),
            supabase.from('products').select('product_id, name').eq('is_active', true),
        ]);

        const godownsData = godownsRes.data || [];
        const lookupProducts = prodNamesRes.data || [];
        const flattenedTransactions = (transactionsRes.data || []).map(t => {
            const prod = lookupProducts.find(p => p.product_id === t.product_id);
            return { ...t, product_name: prod?.name || t.product_name || 'Unknown Product' };
        });

        return {
            godowns: godownsData,
            transactions: flattenedTransactions,
        };
    },

    async fetchAllProducts(filterGodown = '') {
        let accumulated = [];
        let batchIndex = 0;
        let done = false;

        while (!done) {
            let query = supabase
                .from('products')
                .select('godown_id, product_id, current_stock')
                .eq('is_active', true);

            if (filterGodown) query = query.eq('godown_id', filterGodown);

            const from = batchIndex * BATCH_SIZE;
            const to = from + BATCH_SIZE - 1;

            const { data, error } = await query
                .order('name', { ascending: true })
                .range(from, to);

            if (error) throw error;
            accumulated = [...accumulated, ...(data || [])];
            if (!data || data.length < BATCH_SIZE) done = true;
            else batchIndex++;
        }

        return accumulated;
    },

    async fetchProducts({ pageNumber, reset, searchTerm, filterGodown }) {
        let query = supabase
            .from('products')
            .select('*', { count: 'exact' })
            .eq('is_active', true);

        if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
        if (filterGodown) query = query.eq('godown_id', filterGodown);

        const { data, count, error } = await query
            .order('name', { ascending: true })
            .range(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
    },

    async fetchAllTransactionsFromDate(fromDate) {
        if (!fromDate) return [];
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('stock_management')
            .select('product_id, godown_id, date, transaction_type, quantity, from_location')
            .gte('date', fromDate)
            .lte('date', today)
            .order('date', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchTransactionsFromDate(productIds, fromDate) {
        if (!productIds?.length || !fromDate) return [];
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('stock_management')
            .select('product_id, godown_id, date, transaction_type, quantity, from_location')
            .in('product_id', productIds)
            .gte('date', fromDate)
            .lte('date', today)
            .order('date', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchProductTransactions(productIds, godownId, date) {
        if (!productIds?.length || !date) return [];
        let query = supabase
            .from('stock_management')
            .select('id, product_id, godown_id, transaction_type, quantity, from_location, created_at, date, notes, reference_number, entry_id, opening_stock, closing_stock, balance_after_transaction')
            .in('product_id', productIds)
            .eq('date', date);
        if (godownId) {
            query = query.or(`godown_id.eq.${godownId},from_location.eq.${godownId}`);
        }
        const { data, error } = await query
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchDashboardData(summaryDate) {
        const [godownsRes, transactionsRes, prodNamesRes, productsRes, masterProductsRes] = await Promise.all([
            supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('stock_management').select('*').eq('date', summaryDate).limit(10000),
            supabase.from('products').select('product_id, name').eq('is_active', true),
            supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }).limit(10000),
            supabase.from('master_product').select('*').eq('is_active', true).order('name', { ascending: true }),
        ]);

        const godownsData = godownsRes.data || [];
        const lookupProducts = prodNamesRes.data || [];
        const flattenedTransactions = (transactionsRes.data || []).map(t => {
            const prod = lookupProducts.find(p => p.product_id === t.product_id);
            return { ...t, product_name: prod?.name || t.product_name || 'Unknown Product' };
        });

        return {
            godowns: godownsData,
            transactions: flattenedTransactions,
            products: productsRes.data || [],
            masterProducts: masterProductsRes.data || [],
        };
    },

    createSubscription(channelName, tables, callback) {
        const channel = supabase.channel(channelName);
        tables.forEach(table => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table }, callback);
        });
        channel.subscribe();
        return () => supabase.removeChannel(channel);
    },

    async exportProducts({ searchTerm, filterGodown }) {
        let accumulated = [];
        let batchIndex = 0;
        let done = false;

        while (!done) {
            let query = supabase
                .from('products')
                .select('name, product_type, current_stock')
                .eq('is_active', true);

            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
            }
            if (filterGodown) {
                query = query.eq('godown_id', filterGodown);
            }

            const from = batchIndex * EXPORT_BATCH_SIZE;
            const to = from + EXPORT_BATCH_SIZE - 1;

            const { data, error } = await query
                .order('name', { ascending: true })
                .range(from, to);

            if (error) throw error;
            accumulated = [...accumulated, ...(data || [])];
            if (!data || data.length < EXPORT_BATCH_SIZE) done = true;
            else batchIndex++;
        }

        return accumulated;
    },
};
