import { supabase } from '../supabase';

export const transactionService = {
    async getAllTransactions() {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getTransactionById(transactionId) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('*')
            .eq('transaction_id', transactionId)
            .single();
        if (error) throw error;
        return data;
    },

    async createTransaction(transactionData) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .insert([transactionData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateTransaction(transactionId, transactionData) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .update({ ...transactionData, updated_at: new Date().toISOString() })
            .eq('transaction_id', transactionId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTransaction(transactionId) {
        const { error } = await supabase
            .from('internal_transactions')
            .delete()
            .eq('transaction_id', transactionId);
        if (error) throw error;
        return true;
    },

    async getTransactionsByGodown(godownId) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('*')
            .or(`from_godown_id.eq.${godownId},to_godown_id.eq.${godownId}`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getTransactionsByProduct(productId) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('*')
            .eq('product_id', productId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getRecentTransactions(limit = 10) {
        const { data, error } = await supabase
            .from('internal_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },
};