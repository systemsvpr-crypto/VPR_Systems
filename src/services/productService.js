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
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getStats() {
        const [totalRes, activeRes] = await Promise.all([
            supabase.from('products').select('product_id', { count: 'exact', head: true }),
            supabase.from('products').select('product_id', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        return {
            total: totalRes.count || 0,
            active: activeRes.count || 0,
        };
    },

    async getFilteredPaginated({ searchTerm, filterStatus, page = 1, pageSize = 10 }) {
        let query = supabase.from('products').select('*', { count: 'exact' });

        if (searchTerm) {
            query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
        }
        if (filterStatus === 'active') {
            query = query.eq('is_active', true);
        } else if (filterStatus === 'inactive') {
            query = query.eq('is_active', false);
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
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

    async toggleActive(productId, isActive) {
        const { error } = await supabase
            .from('products')
            .update({ is_active: !isActive, updated_at: new Date().toISOString() })
            .eq('product_id', productId);
        if (error) throw error;
        return true;
    },

    async getTransactionsForProduct(productId) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('transaction_type, quantity, godown_id, from_location')
            .eq('product_id', productId);
        if (error) throw error;
        return data || [];
    },

    async getActiveGodowns() {
        const { data, error } = await supabase
            .from('godowns')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getAllBatched(search = '', godownFilter = 'all') {
        let accumulated = [];
        let pageIndex = 0;
        const pageSize = 5000;
        let done = false;

        while (!done) {
            let query = supabase
                .from('products')
                .select('*', { count: 'exact' })
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (search) {
                query = query.or(`name.ilike.%${search}%,product_id.ilike.%${search}%`);
            }
            if (godownFilter && godownFilter !== 'all') {
                query = query.eq('godown_id', godownFilter);
            }

            const from = pageIndex * pageSize;
            const to = from + pageSize - 1;

            const { data, error, count } = await query.range(from, to);
            if (error) throw error;

            if (pageIndex === 0) {
                accumulated.totalCount = count;
            }

            accumulated = [...accumulated, ...(data || [])];

            if (!data || data.length < pageSize) done = true;
            else pageIndex++;
        }

        return accumulated;
    },

    async updateProductBulk(productId, updateData) {
        const { error } = await supabase
            .from('products')
            .update({ ...updateData, updated_at: new Date().toISOString() })
            .eq('product_id', productId);
        if (error) throw error;
        return true;
    },

    async findByNameAndGodown(name, godownId, excludeProductId = null) {
        let query = supabase
            .from('products')
            .select('product_id, current_stock')
            .eq('name', name)
            .eq('godown_id', godownId);
        if (excludeProductId) {
            query = query.neq('product_id', excludeProductId);
        }
        const { data, error } = await query.maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    async getProductById(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('product_id', productId)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },
};