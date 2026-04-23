import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CheckCircle, History, Save, ChevronDown, ChevronUp, RefreshCw, ClipboardList, X, XCircle, Trash2 } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { supabase } from '../../supabase';

// --- Format date for display (e.g., 25-Feb-2026) ---
const formatDisplayDate = (dateStr) => {
  if (!dateStr || dateStr === '-') return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
};

const OtdDispatchDone = () => {
  const { user } = useAuthStore();

  // --- UI state ---
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedRows, setSelectedRows] = useState({});
  const [editData, setEditData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isSaving, setIsSaving] = useState(false);

  // --- Data state ---
  const [orders, setOrders] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);

  // --- Master data ---
  const [itemNames, setItemNames] = useState([]);
  const [godowns, setGodowns] = useState([]);

  const pendingAbortRef = useRef(null);
  const historyAbortRef = useRef(null);

  // ─── Fetch pending (Planned, informed before dispatch, not yet completed) ───
  const fetchPendingOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingOrders(true);
    else setLoadingOrders(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`*, order:app_orders(*)`)
        .eq('dispatch_completed', false)
        .eq('informed_before_dispatch', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((item, idx) => ({
        id: item.id,
        order_id: item.order_id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNumber: item.order?.order_number || '-',
        clientName: item.order?.client_name || '-',
        // Use product_name from dispatch_plans if set; fallback to order item_name
        itemName: item.product_name || item.order?.item_name || '-',
        godownName: item.godown_name || '-',
        qty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        gstIncluded: item.gst_included || 'No',
        crmName: item.order?.submittedby || '-',
        isSkip: item.is_skip,
        originalIndex: idx
      }));

      setOrders(mapped.filter(o => o.isSkip !== true));
    } catch (error) {
      console.error('fetchPendingOrders error:', error);
      toast.error('Failed to load pending dispatches: ' + error.message);
    } finally {
      setLoadingOrders(false);
      setRefreshingOrders(false);
    }
  }, []);

  // ─── Fetch history (completed, not skip) ────────────────────────────────────
  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshingHistory(true);
    else setLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`*, order:app_orders(*)`)
        .eq('dispatch_completed', true)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(item => ({
        id: item.id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNumber: item.order?.order_number || '-',
        clientName: item.order?.client_name || '-',
        itemName: item.product_name || item.order?.item_name || '-',
        godownName: item.godown_name || '-',
        qty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        crmName: item.order?.submittedby || '-',
        completedAt: item.completed_at,
        informedBefore: item.informed_before_dispatch,
        isSkip: item.is_skip,
        status: item.status
      }));

      setHistoryItems(mapped.filter(i => i.status === 'Completed' && i.isSkip !== true));
    } catch (error) {
      console.error('fetchHistory error:', error);
      toast.error('Failed to load history: ' + error.message);
    } finally {
      setLoadingHistory(false);
      setRefreshingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingOrders();
    fetchHistory();
    return () => {
      if (pendingAbortRef.current) pendingAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
    };
  }, [fetchPendingOrders, fetchHistory]);

  // ─── Master data ─────────────────────────────────────────────────────────────
  const fetchMasterData = useCallback(async () => {
    try {
      const [productsRes, godownsRes] = await Promise.all([
        supabase.from('products').select('name').order('name'),
        supabase.from('godowns').select('name').order('name')
      ]);
      if (productsRes.error) throw productsRes.error;
      if (godownsRes.error) throw godownsRes.error;
      setItemNames(productsRes.data.map(p => p.name));
      setGodowns(godownsRes.data.map(g => g.name));
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data: ' + error.message);
    }
  }, []);

  useEffect(() => { fetchMasterData(); }, [fetchMasterData]);

  useEffect(() => {
    setSelectedRows({});
    setEditData({});
  }, [activeTab]);

  const isLoading = loadingOrders || loadingHistory;
  const isRefreshing = refreshingOrders || refreshingHistory;

  // ─── Filters ─────────────────────────────────────────────────────────────────
  const allUniqueClients = useMemo(() =>
    [...new Set([...(orders || []).map(o => o.clientName), ...(historyItems || []).map(h => h.clientName)])].sort(),
    [orders, historyItems]
  );
  const allUniqueGodowns = useMemo(() =>
    [...new Set([...(orders || []).map(o => o.godownName), ...(historyItems || []).map(h => h.godownName)])].sort(),
    [orders, historyItems]
  );

  // ─── Sort ─────────────────────────────────────────────────────────────────────
  const requestSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const getSortedItems = useCallback((itemsToSort) => {
    if (!sortConfig.key) return itemsToSort;
    return [...itemsToSort].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      if (sortConfig.key.toLowerCase().includes('date')) {
        const aDate = new Date(aVal); const bDate = new Date(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
      }
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const filteredAndSortedPending = useMemo(() =>
    getSortedItems(
      (orders || []).filter(item => {
        const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesClient = clientFilter === '' || item.clientName === clientFilter;
        const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
      })
    ),
    [orders, searchTerm, clientFilter, godownFilter, getSortedItems]
  );

  const filteredAndSortedHistory = useMemo(() =>
    getSortedItems(
      (historyItems || []).filter(item => {
        const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesClient = clientFilter === '' || item.clientName === clientFilter;
        const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
        return matchesSearch && matchesClient && matchesGodown;
      })
    ),
    [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]
  );

  const handleCheckboxToggle = useCallback((id) => {
    setSelectedRows(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleEditChange = useCallback((idx, field, value) => {
    setEditData(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
  }, []);

  // ─── Mark Complete ────────────────────────────────────────────────────────────
  // LOGIC RULES:
  //  • order_number is always sent to dispatch_completed_log
  //  • Item name edits update dispatch_plans.product_name ONLY — NOT app_orders
  const handleSave = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const rowsToLog = [];
      const updates = [];

      for (const id of selectedIds) {
        const item = orders.find(o => String(o.id) === String(id));
        if (item) {
          const finalQty = editData[id]?.dispatchQty !== undefined
            ? parseFloat(editData[id].dispatchQty)
            : parseFloat(item.dispatchQty);
          const finalGodown = editData[id]?.godown || item.godownName;
          // Item name edit on this page → dispatch_plans.product_name ONLY
          const finalProduct = editData[id]?.product || item.itemName;

          // Log entry — (matching exact schema to prevent 400 Bad Request)
          rowsToLog.push({
            dispatch_id: item.id,
            dispatch_number: item.dispatchNo,
            dispatch_date: item.dispatchDate,
            complete_date: now.split('T')[0],
            client_name: item.clientName,
            product_name: finalProduct,
            godown_name: finalGodown,
            order_qty: parseFloat(item.qty) || 0,
            dispatch_qty: finalQty,
            crm_name: item.crmName,
            status: 'Completed',
            order_no: item.orderNumber
          });

          // Update dispatch_plans — item name goes to product_name here, NOT app_orders
          updates.push(
            supabase.from('dispatch_plans').update({
              planned_qty: finalQty,
              godown_name: finalGodown,
              product_name: finalProduct,       // ← dispatch_plans only
              dispatch_completed: true,
              completed_at: now,
              status: 'Completed',
              submitted_by: user?.name || user?.full_name || user?.username || 'System',
            }).eq('id', item.id)
          );
        }
      }

      // 1. Insert log first (safety lock)
      if (rowsToLog.length > 0) {
        const logResult = await supabase.from('dispatch_completed_log').insert(rowsToLog);
        if (logResult.error) throw logResult.error;
      }

      // 2. Then update plans
      if (updates.length > 0) {
        const results = await Promise.all(updates);
        const errorRes = results.find(r => r.error);
        if (errorRes) throw errorRes.error;
      }

      toast.success('Dispatch marked as completed!');
      setSelectedRows({});
      setEditData({});
      await fetchPendingOrders(true);
      await fetchHistory(true);
    } catch (error) {
      console.error('Save failed:', error);
      toast.error(`Failed to save dispatch completion: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Single Cancel ────────────────────────────────────────────────────────────
  // LOGIC RULES:
  //  • Reduce planned_qty in dispatch_plans (or mark Canceled)
  //  • Then REDUCE app_orders.qty by the cancelled amount
  const handleCancelDispatch = async (item) => {
    const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for ${item.dispatchNo} (Max: ${item.dispatchQty}):`, item.dispatchQty);
    if (cancelQtyStr === null) return;

    const qtyToCancel = parseFloat(cancelQtyStr);
    const currentQty = parseFloat(item.dispatchQty);

    if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (qtyToCancel > currentQty + 0.001) {
      toast.error('Cannot cancel more than the planned quantity');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const orderId = item.order_id;

      const { data: allPlans } = await supabase.from('dispatch_plans').select('dispatch_number');
      const maxNo = (allPlans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      // ① Update dispatch_plans: reduce or fully cancel
      if (Math.abs(qtyToCancel - currentQty) < 0.001) {
        // Full cancel — mark existing plan Canceled
        const { error } = await supabase.from('dispatch_plans').update({
          status: 'Canceled',
          dispatch_completed: true,
          informed_before_dispatch: true,
          informed_after_dispatch: true,
          submitted_by: user?.name || user?.full_name || user?.username || 'System',
          cancelled_at: now,
        }).eq('id', item.id);
        if (error) throw new Error(`Cancel update failed: ${error.message}`);
      } else {
        // Partial cancel — reduce planned_qty on existing plan
        const remainingPlannedQty = currentQty - qtyToCancel;
        const { error: upErr } = await supabase.from('dispatch_plans')
          .update({ planned_qty: remainingPlannedQty }).eq('id', item.id);
        if (upErr) throw new Error(`Existing plan update failed: ${upErr.message}`);

        // Create audit CXL record
        const { error: inErr } = await supabase.from('dispatch_plans').insert({
          order_id: orderId,
          dispatch_number: `DN-${maxNo + 1}-CXL`,
          planned_qty: qtyToCancel,
          planned_date: item.dispatchDate,
          godown_name: item.godownName,
          status: 'Canceled',
          gst_included: item.gstIncluded || 'No',
          dispatch_completed: true,
          informed_before_dispatch: true,
          informed_after_dispatch: true,
          submitted_by: user?.name || user?.full_name || user?.username || 'System',
          product_name: item.itemName,
          client_name: item.clientName,
          order_number: item.orderNumber,
          cancelled_at: now,
        });
        if (inErr) throw new Error(`Audit record creation failed: ${inErr.message}`);
      }

      // ② REDUCE app_orders.qty by qtyToCancel (total qty reflects remaining after cancellations)
      const { data: currentOrder, error: fetchErr } = await supabase
        .from('app_orders').select('qty').eq('id', orderId).single();
      if (fetchErr) throw fetchErr;
      const newOrderQty = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;
      const { error: ordErr } = await supabase.from('app_orders').update({ qty: newOrderQty }).eq('id', orderId);
      if (ordErr) throw ordErr;

      // ③ Prevent data mismatch: sync the reduced order_qty back to all existing plans for this order
      const { error: planSyncErr } = await supabase
        .from('dispatch_plans')
        .update({ order_qty: newOrderQty })
        .eq('order_id', orderId);
      if (planSyncErr) throw planSyncErr;

      toast.success('Order quantity reduced and dispatch cancellation processed');
      await fetchPendingOrders(true);
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Bulk Cancel ─────────────────────────────────────────────────────────────
  const handleBulkCancelDispatch = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to permanently CANCEL and REDUCE the quantity for these ${selectedIds.length} dispatches?`)) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const { data: plansData } = await supabase.from('dispatch_plans').select('dispatch_number');
      let currentMaxNo = (plansData || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      for (const dispatchId of selectedIds) {
        const rowData = orders.find(o => String(o.id) === String(dispatchId));
        if (!rowData) continue;

        const loopOrderId = rowData.order_id;
        const qtyToCancel = editData[dispatchId]?.dispatchQty !== undefined
          ? parseFloat(editData[dispatchId].dispatchQty)
          : parseFloat(rowData.dispatchQty);
        const currentQty = parseFloat(rowData.dispatchQty);

        // ① Update dispatch_plans
        if (Math.abs(qtyToCancel - currentQty) < 0.001) {
          const { error: updErr } = await supabase.from('dispatch_plans').update({
            status: 'Canceled',
            submitted_by: user?.name || user?.full_name || user?.username || 'System',
            dispatch_completed: true,
            informed_before_dispatch: true,
            informed_after_dispatch: true,
            cancelled_at: now,
          }).eq('id', rowData.id);
          if (updErr) throw new Error(`Audit update failed: ${updErr.message}`);
        } else {
          const remainingPlannedQty = currentQty - qtyToCancel;
          const { error: upErr } = await supabase.from('dispatch_plans')
            .update({ planned_qty: remainingPlannedQty }).eq('id', rowData.id);
          if (upErr) throw new Error(`Existing plan update failed: ${upErr.message}`);

          currentMaxNo++;
          const { error: insErr } = await supabase.from('dispatch_plans').insert({
            order_id: loopOrderId,
            dispatch_number: `DN-${currentMaxNo}-CXL`,
            planned_qty: qtyToCancel,
            planned_date: rowData.dispatchDate,
            godown_name: rowData.godownName,
            status: 'Canceled',
            gst_included: rowData.gstIncluded || 'No',
            submitted_by: user?.name || user?.full_name || user?.username || 'System',
            dispatch_completed: true,
            informed_before_dispatch: true,
            informed_after_dispatch: true,
            product_name: rowData.itemName,
            client_name: rowData.clientName,
            order_number: rowData.orderNumber,
            cancelled_at: now,
          });
          if (insErr) throw new Error(`Audit record creation failed: ${insErr.message}`);
        }

        // ② REDUCE app_orders.qty by qtyToCancel
        const { data: currentOrder } = await supabase.from('app_orders').select('qty').eq('id', loopOrderId).single();
        const newOrderTotal = (parseFloat(currentOrder?.qty) || 0) - qtyToCancel;
        const { error: ordErr } = await supabase.from('app_orders').update({ qty: newOrderTotal }).eq('id', loopOrderId);
        if (ordErr) throw ordErr;

        // ③ Prevent data mismatch: sync the reduced order_qty back to all existing plans for this order
        const { error: planSyncErr } = await supabase
          .from('dispatch_plans')
          .update({ order_qty: newOrderTotal })
          .eq('order_id', loopOrderId);
        if (planSyncErr) throw planSyncErr;
      }

      toast.success('Selected dispatches cancelled & quantities reduced');
      await fetchPendingOrders(true);
      setSelectedRows({});
      setEditData({});
    } catch (err) {
      console.error(err);
      toast.error('Error during bulk cancel: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchPendingOrders(true);
    fetchHistory(true);
    fetchMasterData();
  }, [fetchPendingOrders, fetchHistory, fetchMasterData]);

  // ─── Skeleton components ──────────────────────────────────────────────────────
  const TableSkeleton = ({ cols = 10 }) => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden h-16">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden w-full">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  const MobileSkeleton = () => (
    <div className="md:hidden divide-y divide-gray-100">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-6 space-y-4 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-5 w-40 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-4 w-16 bg-primary/5 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="space-y-2">
                <div className="h-2 w-10 bg-gray-50 rounded"></div>
                <div className="h-4 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="">
      {/* Header bar */}
      <div className="flex flex-col gap-4 mb-6 bg-white p-4 lg:p-5 rounded shadow-sm border border-white/50 max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">Dispatch Completed</h1>
            <div className="flex bg-gray-100 p-1 rounded">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <CheckCircle size={16} /> Pending
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <History size={16} /> History
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:items-start">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all"
            />
            <div className="h-[42px]">
              <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="w-full h-full" focusColor="primary" />
            </div>
            <div className="h-[42px]">
              <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="w-full h-full" focusColor="primary" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isSaving}
              className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-bold border border-gray-200 disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            {(searchTerm || clientFilter || godownFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setClientFilter(''); setGodownFilter(''); }}
                className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-green-50 text-primary rounded hover:bg-green-100 transition-colors text-sm font-bold border border-green-100"
              >
                <X size={15} /> Clear
              </button>
            )}
            {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
              <div className="flex items-center gap-2 sm:border-l sm:border-gray-200 sm:pl-3">
                <button
                  onClick={() => { setSelectedRows({}); setEditData({}); }}
                  className="flex items-center justify-center gap-1.5 px-4 h-[42px] bg-white text-gray-700 rounded hover:bg-gray-50 transition-colors font-bold text-sm border border-gray-200"
                >
                  <X size={15} /> Cancel
                </button>
                <button
                  onClick={handleBulkCancelDispatch}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-4 h-[42px] bg-red-600 text-white rounded hover:bg-red-700 shadow-md font-bold text-sm shadow-red-500/20 transition-all"
                >
                  <XCircle size={15} /> Cancel Selected
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 px-5 h-[42px] bg-primary text-white rounded hover:bg-primary-hover shadow-md font-bold text-sm disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={16} />}
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refresh progress bar */}
      {(refreshingOrders || refreshingHistory) && (
        <div className="fixed top-0 left-0 w-full h-1 z-[101] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-progress-loading shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden max-w-[1200px] mx-auto">
        <div className="hidden md:block relative overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                {activeTab === 'pending' && <th className="px-6 py-4 text-center w-16">Action</th>}
                {[
                  { label: 'Dispatch No', key: 'dispatchNo' },
                  { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                  ...(activeTab === 'pending' ? [{ label: 'Order No', key: 'orderNumber' }] : []),
                  { label: 'Customer', key: 'clientName' },
                  { label: 'Product', key: 'itemName' },
                  { label: 'Godown', key: 'godownName', align: 'center' },
                  { label: 'Order Qty', key: 'qty', align: 'right' },
                  { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                  ...(activeTab === 'pending'
                    ? [{ label: 'Complete Date', key: 'completeDate', align: 'center' }, { label: 'Status', key: 'status', align: 'center', minWidth: '140px' }, { label: 'CRM Name', key: 'crmName' }]
                    : [{ label: 'Complete Date', key: 'completedAt', align: 'center' }, { label: 'Status', key: 'status', align: 'center', minWidth: '120px' }]
                  ),
                ].map((col) => (
                  <th
                    key={col.key}
                    className={`px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : {}}
                    onClick={() => requestSort(col.key)}
                  >
                    <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.label}
                      <div className="flex flex-col">
                        <ChevronUp size={10} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-primary' : 'text-gray-300'} />
                        <ChevronDown size={10} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-primary' : 'text-gray-300'} />
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {loadingOrders || loadingHistory ? (
                <TableSkeleton cols={activeTab === 'pending' ? 12 : 9} />
              ) : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'pending' ? 12 : 9} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-50 rounded-full"><ClipboardList size={32} className="text-gray-200" /></div>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No items found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                  const itemId = item.id;
                  const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                  return (
                    <tr key={itemId} className={`transition-colors ${isSelected ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                      {activeTab === 'pending' && (
                        <td className="px-6 py-4 text-center">
                          <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(itemId)} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" />
                        </td>
                      )}
                      <td className="px-6 py-4 font-bold text-gray-900">{item.dispatchNo}</td>
                      <td className="px-6 py-4 text-gray-500 text-center text-xs font-medium">{formatDisplayDate(item.dispatchDate)}</td>
                      {activeTab === 'pending' && <td className="px-6 py-4 text-gray-600 text-xs font-medium">{item.orderNumber}</td>}
                      <td className="px-6 py-4 font-semibold text-gray-800">{item.clientName}</td>

                      {/* Product — editable dropdown when selected; edit goes to dispatch_plans only */}
                      <td className={`px-6 py-4 text-gray-600 font-medium whitespace-nowrap relative ${isSelected ? 'z-[70]' : ''}`}>
                        {activeTab === 'pending' && isSelected ? (
                          <div className="w-64">
                            <SearchableDropdown
                              value={editData[itemId]?.product || item.itemName}
                              onChange={(val) => handleEditChange(itemId, 'product', val)}
                              options={itemNames}
                              placeholder="Select Product"
                              showAll={false}
                              focusColor="primary"
                              className="w-full"
                            />
                          </div>
                        ) : (
                          item.itemName
                        )}
                      </td>

                      {/* Godown */}
                      <td className={`px-6 py-4 text-center font-bold text-gray-800 relative ${isSelected ? 'z-[60]' : ''}`}>
                        {activeTab === 'pending' && isSelected ? (
                          <div className="w-48 mx-auto">
                            <SearchableDropdown
                              value={editData[itemId]?.godown || item.godownName}
                              onChange={(val) => handleEditChange(itemId, 'godown', val)}
                              options={godowns}
                              placeholder="Select Godown"
                              showAll={false}
                              focusColor="primary"
                              className="w-full"
                            />
                          </div>
                        ) : (
                          item.godownName
                        )}
                      </td>

                      <td className="px-6 py-4 border-l border-gray-50 text-right text-xs font-medium text-gray-700">{item.qty}</td>

                      {/* Dispatch Qty */}
                      <td className="px-6 py-4 border-l border-gray-50 text-right text-xs font-black text-primary bg-primary/5">
                        {activeTab === 'pending' && isSelected ? (
                          <input
                            type="text"
                            value={editData[itemId]?.dispatchQty !== undefined ? editData[itemId].dispatchQty : item.dispatchQty}
                            onChange={(e) => handleEditChange(itemId, 'dispatchQty', e.target.value)}
                            className="w-full px-1 py-0.5 border rounded text-xs outline-none focus:border-primary text-right"
                          />
                        ) : (
                          item.dispatchQty
                        )}
                      </td>

                      {/* Pending tab extra columns */}
                      {activeTab === 'pending' && (
                        <>
                          <td className={`px-6 py-4 text-center relative ${isSelected ? 'z-[50]' : ''}`}>
                            <input
                              type="date"
                              disabled={!isSelected}
                              value={editData[itemId]?.completeDate || ''}
                              onChange={(e) => handleEditChange(itemId, 'completeDate', e.target.value)}
                              className="px-1 py-0.5 border rounded text-xs outline-none focus:border-primary disabled:opacity-50"
                            />
                          </td>
                          <td className={`px-6 py-4 text-center relative ${isSelected ? 'z-[50]' : ''}`}>
                            <div className="relative group">
                              <select
                                disabled={!isSelected}
                                value={editData[itemId]?.status || 'Completed'}
                                onChange={(e) => handleEditChange(itemId, 'status', e.target.value)}
                                className={`w-full pl-3 pr-8 py-2 border border-gray-200 rounded text-xs font-semibold appearance-none bg-white transition-all shadow-sm ${isSelected ? 'cursor-pointer hover:border-primary focus:ring-primary focus:border-transparent outline-none' : 'bg-gray-50 opacity-70 cursor-not-allowed'}`}
                              >
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                              </select>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <ChevronDown size={14} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 border-l border-gray-50 text-xs font-medium text-gray-500">
                            <div className="flex items-center justify-between gap-2">
                              <span>{item.crmName}</span>
                              <button
                                onClick={() => handleCancelDispatch(item)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="Cancel Dispatch"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}

                      {/* History tab extra columns */}
                      {activeTab === 'history' && (
                        <>
                          <td className="px-6 py-4 text-gray-500 text-center text-[11px] font-bold">
                            {item.completedAt ? new Date(item.completedAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            }) : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border border-green-200 shadow-sm">
                              {item.status}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none opacity-30"></div>
        </div>

        {/* Mobile view */}
        <div className="md:hidden">
          {loadingOrders || loadingHistory ? (
            <MobileSkeleton />
          ) : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-gray-50 rounded-full"><ClipboardList size={32} className="text-gray-200" /></div>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No items found</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {(activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map((item) => {
                const itemId = item.id;
                const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                return (
                  <div
                    key={itemId}
                    className={`p-4 space-y-4 transition-colors ${isSelected ? 'bg-green-50/50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch No</p>
                        <p className="font-bold text-gray-900 text-sm">{item.dispatchNo}</p>
                      </div>
                      {activeTab === 'pending' && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleCancelDispatch(item)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={18} />
                          </button>
                          <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(itemId)} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-1" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Customer</p>
                        <p className="font-semibold text-gray-800">{item.clientName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch Date</p>
                        <p className="text-gray-600">{formatDisplayDate(item.dispatchDate)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Product</p>
                        {activeTab === 'pending' && isSelected ? (
                          <SearchableDropdown value={editData[itemId]?.product || item.itemName} onChange={(val) => handleEditChange(itemId, 'product', val)} options={itemNames} placeholder="Select Product" showAll={false} focusColor="primary" className="w-full" />
                        ) : (
                          <p className="text-gray-700">{item.itemName}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Godown</p>
                        {activeTab === 'pending' && isSelected ? (
                          <SearchableDropdown value={editData[itemId]?.godown || item.godownName} onChange={(val) => handleEditChange(itemId, 'godown', val)} options={godowns} placeholder="Select Godown" showAll={false} focusColor="primary" className="w-full" />
                        ) : (
                          <p className="text-gray-700">{item.godownName}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Dispatch Qty</p>
                        {activeTab === 'pending' && isSelected ? (
                          <input type="text" value={editData[itemId]?.dispatchQty !== undefined ? editData[itemId].dispatchQty : item.dispatchQty} onChange={(e) => handleEditChange(itemId, 'dispatchQty', e.target.value)} className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-primary" />
                        ) : (
                          <p className="font-black text-primary">{item.dispatchQty}</p>
                        )}
                      </div>
                      {activeTab === 'pending' && (
                        <div>
                          <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Complete Date</p>
                          <input type="date" disabled={!isSelected} value={editData[itemId]?.completeDate || ''} onChange={(e) => handleEditChange(itemId, 'completeDate', e.target.value)} className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-primary disabled:opacity-50" />
                        </div>
                      )}
                      {activeTab === 'history' && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Completed At</p>
                          <p className="text-gray-600 text-xs">{item.completedAt ? new Date(item.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OtdDispatchDone;
