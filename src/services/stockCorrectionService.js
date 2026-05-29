import { supabase } from '../supabase';

export const stockCorrectionService = {
  async getAdjustments({ startDate, endDate, productId, godownId } = {}) {
    let query = supabase
      .from('stock_management')
      .select('*')
      .eq('transaction_type', 'correction')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (productId) query = query.eq('product_id', productId);
    if (godownId) query = query.eq('godown_id', godownId);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      difference: parseFloat(r.quantity) || 0,
      old_closing: (parseFloat(r.balance_after_transaction) || 0) - (parseFloat(r.quantity) || 0),
      new_closing: parseFloat(r.balance_after_transaction) || 0,
      reason: r.notes || '', 
    }));
  },

  async getDailyTransactions(date) {
    const { data, error } = await supabase
      .from('stock_management')
      .select('*')
      .eq('date', date)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getDailySnapshots(date) {
    const { data, error } = await supabase
      .from('daily_stock_summary')
      .select('*')
      .eq('date', date);

    if (error) throw error;
    return data || [];
  },

  async getSnapshotsForDateRange(fromDate, toDate) {
    const { data, error } = await supabase
      .from('daily_stock_summary')
      .select('*')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getProductsByGodown(godownId) {
    let query = supabase
      .from('products')
      .select('product_id, name, godown_id, current_stock, mux')
      .eq('is_active', true);

    if (godownId) query = query.eq('godown_id', godownId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getGodowns() {
    const { data, error } = await supabase
      .from('godowns')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  },

  async correctStock(date, productId, godownId, correctClosing, reason, createdBy = 'system') {
    const { data, error } = await supabase.rpc('correct_and_roll_forward', {
      p_date: date,
      p_product_id: productId,
      p_godown_id: godownId,
      p_correct_closing: correctClosing,
      p_reason: reason,
      p_created_by: createdBy,
    });

    if (error) throw error;
    return data;
  },

  async regenerateSummary(date) {
    const { error } = await supabase.rpc('regenerate_daily_summary', {
      target_date: date,
    });

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
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', productId);
    } catch (err) {
      console.error(`Error recalculating stock for ${productId}:`, err);
    }
  },
};
