import { supabase } from '../supabase';

export const liveStockService = {
    async fetchLedgerData(selectedDate, silent = false) {
        const today = new Date().toISOString().split('T')[0];

        const promises = [
            supabase.from('products').select('*').eq('is_active', true).order('id').limit(10000),
            supabase.from('stock_management').select('*').eq('date', selectedDate).limit(10000),
            supabase.from('stock_management').select('*').gte('date', selectedDate).lte('date', today).limit(10000),
        ];

        const shouldFetchMetadata = !silent;
        if (shouldFetchMetadata) {
            promises.push(supabase.from('godowns').select('*').eq('is_active', true).order('name'));
            promises.push(supabase.from('master_product').select('*').eq('is_active', true).order('name'));
        }

        const results = await Promise.all(promises);

        const data = {
            products: results[0].data || [],
            transactions: results[1].data || [],
            futureTransactions: results[2].data || [],
        };

        if (shouldFetchMetadata && results[3] && results[4]) {
            data.godowns = results[3].data || [];
            const mpMap = {};
            (results[4].data || []).forEach(mp => { mpMap[mp.id] = mp.name; });
            data.masterProducts = mpMap;
        }

        return data;
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

    createSubscription(channelName, tables, callback) {
        const channelConfig = {
            channelName,
            tables: Array.isArray(tables) ? tables : [tables],
        };

        const channel = supabase
            .channel(channelConfig.channelName);

        channelConfig.tables.forEach(table => {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => callback()
            );
        });

        channel.subscribe();
        return () => supabase.removeChannel(channel);
    },
};
