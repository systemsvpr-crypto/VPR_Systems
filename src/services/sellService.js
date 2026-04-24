import { supabase } from '../supabase';

/**
 * sellService — Business logic for the Order-to-Dispatch (Sell) module.
 * Covers: Orders, Dispatch Planning, Party Notifications, Dispatch Completion.
 */
export const sellService = {

  // ─── ORDERS ────────────────────────────────────────────────────────────────

  /** Fetch all orders with cancel-qty summary */
  async getOrders() {
    const [ordersRes, cancelRes] = await Promise.all([
      supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('dispatch_plans').select('order_id, planned_qty').eq('status', 'Canceled'),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (cancelRes.error) throw cancelRes.error;

    const cancelMap = {};
    cancelRes.data.forEach(c => {
      cancelMap[c.order_id] = (cancelMap[c.order_id] || 0) + (parseFloat(c.planned_qty) || 0);
    });

    return ordersRes.data.map(o => ({
      ...o,
      canceledQty: cancelMap[o.id] || 0,
    }));
  },

  /** Calculate next order number */
  calcNextOrderNo(orders = []) {
    const nums = orders
      .map(o => o.order_number)
      .filter(n => n && String(n).startsWith('VPR/OR-'))
      .map(n => parseInt(String(n).split('-')[1], 10))
      .filter(n => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 100;
    return `VPR/OR-${max + 1}`;
  },

  /** Create new order rows (multi-item) */
  async createOrder({ orderDate, clientName, godownName, orderNo, items, submittedBy }) {
    const rows = items.map(item => ({
      order_date: orderDate,
      client_name: clientName,
      godown_name: item.godownName || godownName || '-',
      order_number: orderNo,
      item_name: item.itemName,
      rate: parseFloat(item.rate) || 0,
      qty: parseInt(item.qty, 10) || 0,
      submittedby: submittedBy || 'Unknown',
    }));
    const { error } = await supabase.from('app_orders').insert(rows);
    if (error) throw error;
    return true;
  },

  /** Cancel a portion of an order quantity — Safety Lock pattern */
  async cancelOrderQty({ orderId, orderNo, qtyToCancel, godownName, submittedBy }) {
    // 1. Get next dispatch number
    const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
    const maxNo = (plans || []).reduce((max, p) => {
      const n = parseInt(String(p.dispatch_number).replace('DSP', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);
    const newDNo = `DSP${maxNo + 1}-CXL`;

    // 2. Safety lock: insert history FIRST
    const { error: insErr } = await supabase.from('dispatch_plans').insert({
      order_id: orderId,
      dispatch_number: newDNo,
      planned_qty: qtyToCancel,
      planned_date: new Date().toISOString().split('T')[0],
      godown_name: godownName || '-',
      status: 'Canceled',
      dispatch_completed: true,
      informed_before_dispatch: true,
      informed_after_dispatch: true,
      submitted_by: submittedBy || 'System',
    });
    if (insErr) throw insErr;

    // 3. Reduce qty in app_orders
    const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', orderId).single();
    const newTotal = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;
    const { error: updErr } = await supabase.from('app_orders').update({ qty: newTotal }).eq('id', orderId);
    if (updErr) throw updErr;

    return true;
  },

  // ─── MASTER DATA ───────────────────────────────────────────────────────────

  /** Fetch dropdown lists for products, customers, godowns */
  async getMasterData() {
    const [productsRes, customersRes, godownsRes] = await Promise.all([
      supabase.from('products').select('name, godown_id').order('name'),
      supabase.from('users').select('full_name').order('full_name'),
      supabase.from('godowns').select('name').order('name'),
    ]);
    if (productsRes.error) throw productsRes.error;
    if (customersRes.error) throw customersRes.error;
    if (godownsRes.error) throw godownsRes.error;

    const productGodownMap = {};
    productsRes.data.forEach(p => {
      if (p.name) productGodownMap[p.name] = p.godown_id;
    });

    return {
      products: productsRes.data.map(p => p.name),
      customers: customersRes.data.map(c => c.full_name).filter(Boolean),
      godowns: godownsRes.data.map(g => g.name),
      productGodownMap,
    };
  },

  // ─── DISPATCH PLANNING ─────────────────────────────────────────────────────

  /** Fetch pending orders (those with remaining qty to plan) + live stock */
  async getPendingOrdersWithStock() {
    const [ordersRes, stockRes, plansRes] = await Promise.all([
      supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('name, godown_id, closing_quantity'),
      supabase.from('dispatch_plans').select('order_id, planned_qty, status, dispatch_completed').neq('status', 'Canceled'),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (stockRes.error) throw stockRes.error;

    // Build stock lookup
    const stockMap = {};
    stockRes.data.forEach(s => {
      const key = `${String(s.name).trim().toLowerCase()}|${String(s.godown_id).trim().toLowerCase()}`;
      stockMap[key] = s.closing_quantity;
    });

    // Build planned-qty map
    const plannedMap = {};
    const deliveredMap = {};
    (plansRes.data || []).forEach(p => {
      if (!p.order_id) return;
      plannedMap[p.order_id] = (plannedMap[p.order_id] || 0) + (parseFloat(p.planned_qty) || 0);
      if (p.dispatch_completed) {
        deliveredMap[p.order_id] = (deliveredMap[p.order_id] || 0) + (parseFloat(p.planned_qty) || 0);
      }
    });

    return ordersRes.data.map((o, idx) => {
      const stockKey = `${String(o.item_name || '').trim().toLowerCase()}|${String(o.godown_name || '').trim().toLowerCase()}`;
      const totalQty = parseFloat(o.qty) || 0;
      const alreadyPlanned = plannedMap[o.id] || 0;
      const remainingToPlan = Math.max(0, totalQty - alreadyPlanned);
      return {
        id: o.id,
        orderNo: o.order_number || '-',
        orderDate: o.order_date,
        clientName: o.client_name,
        godownName: o.godown_name,
        itemName: o.item_name,
        rate: o.rate,
        qty: totalQty,
        currentStock: stockMap[stockKey] !== undefined ? stockMap[stockKey] : '-',
        intransitQty: o.intransit_qty || '0',
        planningPendingQty: remainingToPlan,
        qtyDelivered: deliveredMap[o.id] || 0,
        alreadyPlannedSum: alreadyPlanned,
        gstIncluded: o.gst_included || 'No',
        originalIndex: idx,
      };
    }).filter(o => o.planningPendingQty > 0.001);
  },

  /** Fetch all dispatch plans (planning history) */
  async getDispatchPlans() {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .select('*, order:app_orders(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(item => ({
      ...item,
      dispatchNo: item.dispatch_number || '-',
      orderNo: item.order?.order_number || '-',
      orderDate: item.order?.order_date,
      clientName: item.order?.client_name,
      itemName: item.order?.item_name,
      qty: item.order?.qty,
      dispatchQty: item.planned_qty,
      dispatchDate: item.planned_date,
      gstIncluded: item.gst_included,
      godownName: item.godown_name,
    }));
  },

  /** Save dispatch plans (bulk insert) */
  async saveDispatchPlans(plans, submittedBy) {
    if (!plans || plans.length === 0) return;
    const { data: existing } = await supabase.from('dispatch_plans').select('dispatch_number');
    const maxNo = (existing || []).reduce((max, p) => {
      const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);

    let counter = maxNo;
    const rows = plans.map(p => {
      counter++;
      return {
        order_id: p.orderId,
        dispatch_number: `DN-${counter}`,
        planned_qty: parseInt(p.dispatchQty, 10) || 0,
        planned_date: p.dispatchDate,
        gst_included: p.gstIncluded || 'Yes',
        godown_name: p.godownName,
        status: 'Planned',
        submitted_by: submittedBy || 'System',
      };
    });

    const { error } = await supabase.from('dispatch_plans').insert(rows);
    if (error) throw error;
    return true;
  },

  /** Bulk cancel selected orders from planning */
  async bulkCancelOrders(cancelItems, submittedBy) {
    const { data: existing } = await supabase.from('dispatch_plans').select('dispatch_number');
    let counter = (existing || []).reduce((max, p) => {
      const n = parseInt(String(p.dispatch_number).replace('DSP', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);

    const cancelRecords = cancelItems.map(item => {
      counter++;
      return {
        order_id: String(item.orderId),
        dispatch_number: `DSP${counter}-CXL`,
        planned_qty: Number(item.qtyToCancel),
        planned_date: new Date().toISOString().split('T')[0],
        godown_name: String(item.godownName || '-'),
        status: 'Canceled',
        gst_included: item.gstIncluded || 'No',
        submitted_by: submittedBy || 'System',
        dispatch_completed: true,
        informed_before_dispatch: true,
        informed_after_dispatch: true,
      };
    });

    // Safety lock: insert history first
    const { error: insErr } = await supabase.from('dispatch_plans').insert(cancelRecords);
    if (insErr) throw insErr;

    // Then reduce order quantities
    await Promise.all(cancelItems.map(async item => {
      const { data: ord } = await supabase.from('app_orders').select('qty').eq('id', item.orderId).single();
      const newQty = (parseFloat(ord?.qty) || 0) - item.qtyToCancel;
      return supabase.from('app_orders').update({ qty: newQty }).eq('id', item.orderId);
    }));

    return true;
  },

  // ─── INFORM BEFORE DISPATCH ────────────────────────────────────────────────

  /** Mark selected dispatch_plans as informed before dispatch */
  async markInformedBeforeDispatch(ids, submittedBy) {
    const { error } = await supabase
      .from('dispatch_plans')
      .update({
        informed_before_dispatch: true,
        informed_at: new Date().toISOString(),
        submitted_by: submittedBy || 'System',
      })
      .in('id', ids);
    if (error) throw error;
    return true;
  },

  // ─── DISPATCH COMPLETE ─────────────────────────────────────────────────────

  /** Mark dispatch plans as dispatch_completed with vehicle & transporter info */
  async markDispatchComplete(ids, { vehicleNo, transporterName, submittedBy } = {}) {
    const { error } = await supabase
      .from('dispatch_plans')
      .update({
        dispatch_completed: true,
        completed_at: new Date().toISOString(),
        vehicle_no: vehicleNo || null,
        transporter_name: transporterName || null,
        submitted_by: submittedBy || 'System',
        status: 'Completed',
      })
      .in('id', ids);
    if (error) throw error;
    return true;
  },

  // ─── INFORM AFTER DISPATCH ─────────────────────────────────────────────────

  /** Mark dispatch plans as informed after dispatch */
  async markInformedAfterDispatch(ids, submittedBy) {
    const { error } = await supabase
      .from('dispatch_plans')
      .update({
        informed_after_dispatch: true,
        post_dispatch_informed_at: new Date().toISOString(),
        submitted_by: submittedBy || 'System',
      })
      .in('id', ids);
    if (error) throw error;
    return true;
  },

  // ─── DASHBOARD ANALYTICS ───────────────────────────────────────────────────

  /** Fetch full dashboard analytics data */
  async getDashboardData() {
    const [ordersRes, plansRes] = await Promise.all([
      supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('dispatch_plans').select('*, order:app_orders(*)').order('created_at', { ascending: false }),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (plansRes.error) throw plansRes.error;
    return { orders: ordersRes.data || [], plans: plansRes.data || [] };
  },

  // ─── GODOWN / PC REPORT ────────────────────────────────────────────────────

  /** Fetch godown summary for PC report */
  async getGodownSummary() {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .select('godown_name, planned_qty, status, dispatch_completed')
      .neq('status', 'Canceled');
    if (error) throw error;
    const map = {};
    (data || []).forEach(p => {
      const g = p.godown_name || 'Unassigned';
      if (!map[g]) map[g] = { planned: 0, delivered: 0 };
      map[g].planned += parseFloat(p.planned_qty) || 0;
      if (p.dispatch_completed) map[g].delivered += parseFloat(p.planned_qty) || 0;
    });
    return Object.entries(map).map(([godown, v]) => ({ godown, ...v })).sort((a, b) => b.planned - a.planned);
  },

  // ─── SKIP DELIVERED ────────────────────────────────────────────────────────

  /** Fetch items eligible for skip-delivered marking */
  async getSkipDeliveredItems() {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .select('*, order:app_orders(*)')
      .eq('dispatch_completed', true)
      .eq('informed_after_dispatch', false)
      .neq('status', 'Canceled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(item => ({
      id: item.id,
      dispatchNo: item.dispatch_number || '-',
      orderNo: item.order?.order_number || '-',
      clientName: item.order?.client_name || '-',
      itemName: item.order?.item_name || '-',
      godownName: item.godown_name || '-',
      dispatchQty: item.planned_qty,
      dispatchDate: item.planned_date,
      status: item.status,
    }));
  },

  /** Mark items as skip-delivered */
  async markSkipDelivered(ids, submittedBy) {
    const { error } = await supabase
      .from('dispatch_plans')
      .update({
        informed_after_dispatch: true,
        is_skip: true,
        post_dispatch_informed_at: new Date().toISOString(),
        submitted_by: submittedBy || 'System',
      })
      .in('id', ids);
    if (error) throw error;
    return true;
  },
};
