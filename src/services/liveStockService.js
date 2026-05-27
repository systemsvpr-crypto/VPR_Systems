import { supabase } from '../supabase';

export const liveStockService = {
    async fetchLedgerData(selectedDate, silent = false) {
        const promises = [
            supabase.from('products').select('*').eq('is_active', true).order('id').limit(10000),
            supabase.from('daily_stock_summary').select('*').eq('date', selectedDate).limit(10000),
            supabase.from('stock_management').select('*').eq('date', selectedDate).limit(10000),
        ];

        const shouldFetchMetadata = !silent;
        if (shouldFetchMetadata) {
            promises.push(supabase.from('godowns').select('*').eq('is_active', true).order('name'));
            promises.push(supabase.from('master_product').select('*').eq('is_active', true).order('name'));
        }

        const results = await Promise.all(promises);

        const data = {
            products: results[0].data || [],
            dailySnapshots: results[1].data || [],
            transactions: results[2].data || [],
        };

        if (shouldFetchMetadata && results[3] && results[4]) {
            data.godowns = results[3].data || [];
            const mpMap = {};
            (results[4].data || []).forEach(mp => { mpMap[mp.id] = mp.name; });
            data.masterProducts = mpMap;
        }

        return data;
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
