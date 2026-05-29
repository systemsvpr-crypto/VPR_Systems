import { supabase } from '../supabase';

export const stockManagementService = {
    async getAll() {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getById(entryId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('entry_id', entryId)
            .single();
        if (error) throw error;
        return data;
    },

    async create(entryData) {
        const { error } = await supabase
            .from('stock_management')
            .insert([entryData]);
        if (error) throw error;
        return true;
    },

    async update(entryId, entryData) {
        const { error } = await supabase
            .from('stock_management')
            .update({ ...entryData, updated_at: new Date().toISOString() })
            .eq('entry_id', entryId);
        if (error) throw error;
        return true;
    },

    async delete(entryId, deletedBy = 'system') {
        const { error } = await supabase
            .from('stock_management')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: deletedBy
            })
            .eq('entry_id', entryId);
        if (error) throw error;
        return true;
    },

    async getByGodown(godownId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('godown_id', godownId)
            .is('deleted_at', null)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByProduct(productId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('product_id', productId)
            .is('deleted_at', null)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByDateRange(startDate, endDate) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
            .is('deleted_at', null)
            .order('date', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getByType(transactionType) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('*')
            .eq('transaction_type', transactionType)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    // ─── Enhanced Stock Management Operations ─────────────────────────────────

    async getActiveGodowns() {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getActiveTransporters() {
        const { data, error } = await supabase
            .from('transporters')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async fetchAllProducts() {
        let accumulated = [];
        let pageIndex = 0;
        const pageSize = 1000;
        let done = false;

        while (!done) {
            const from = pageIndex * pageSize;
            const to = from + pageSize - 1;
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true })
                .range(from, to);

            if (error) throw error;
            accumulated = [...accumulated, ...(data || [])];
            if (!data || data.length < pageSize) done = true;
            else pageIndex++;
        }
        return accumulated;
    },

    async getLastProductId() {
        const { data, error } = await supabase
            .from('products')
            .select('product_id')
            .order('product_id', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data && data.length > 0 ? data[0].product_id : null;
    },

    async getProductClosingQuantity(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('current_stock, mux')
            .eq('product_id', productId)
            .single();
        if (error) throw error;
        return { current_stock: parseFloat(data?.current_stock) || 0, mux: parseFloat(data?.mux) || 0 };
    },

    async updateProductStock(productId, currentStock) {
        const { error } = await supabase
            .from('products')
            .update({
                current_stock: currentStock,
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId);
        if (error) throw error;
        return true;
    },

    async createProduct(productData) {
        const { data, error } = await supabase
            .from('products')
            .insert([productData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async createNotification(notificationData) {
        const { error } = await supabase
            .from('stock_notifications')
            .insert([notificationData]);
        if (error) throw error;
        return true;
    },

    async recalculateProductStock(productId) {
        if (!productId) return;
        try {
            const { data: product, error: prodErr } = await supabase
                .from('products')
                .select('mux')
                .eq('product_id', productId)
                .single();
            if (prodErr || !product) return;

            const { data: transactions } = await supabase
                .from('stock_management')
                .select('transaction_type, quantity')
                .eq('product_id', productId)
                .is('deleted_at', null)
                .or('is_reversed.is.null,is_reversed.eq.false');

            let running = 0;
            (transactions || []).forEach(t => {
                const qty = parseFloat(t.quantity) || 0;
                if (['in', 'purchase', 'transfer_in', 'return_in', 'opening'].includes(t.transaction_type)) {
                    running += qty;
                } else {
                    running -= qty;
                }
            });
            running = Math.max(0, running);

            await supabase
                .from('products')
                .update({
                    current_stock: running,
                    updated_at: new Date().toISOString()
                })
                .eq('product_id', productId);
        } catch (err) {
            console.error(`Error recalculating stock for ${productId}:`, err);
        }
    },

    async getSourceEntry(sourceEntryId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('product_id')
            .eq('entry_id', sourceEntryId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    },

    async getNextEntryId(date) {
        const dateStr = date.replace(/-/g, '');
        const prefix = `STK-${dateStr}-`;

        const { data, error } = await supabase
            .from('stock_management')
            .select('entry_id')
            .ilike('entry_id', `${prefix}%`)
            .is('deleted_at', null);

        if (error) throw error;

        let maxNum = 0;
        for (const row of data || []) {
            const rest = row.entry_id.slice(prefix.length);
            const numMatch = rest.match(/^(\d{4})(?:-|$)/);
            if (numMatch) {
                const num = parseInt(numMatch[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }

        const nextNum = Math.max(maxNum + 1, 1);
        return `STK-${dateStr}-${nextNum.toString().padStart(4, '0')}`;
    },

    async regenerateDailySummary(date) {
        const { data, error } = await supabase
            .rpc('generate_daily_summary', { target_date: date });
        if (error) throw error;
        return data;
    },

    // ─── Batch Operations (atomic via server-side RPC) ────────────────────────

    async batchCreate(entries) {
        const { data, error } = await supabase
            .rpc('batch_create_stock_entries', { entries });
        if (error) throw error;
        return data;
    },

    async batchSoftDelete(entryIds, deletedBy = 'system') {
        const { data, error } = await supabase
            .rpc('batch_soft_delete_stock_entries', {
                entry_ids: entryIds,
                deleted_by: deletedBy
            });
        if (error) throw error;
        return data;
    },
};
