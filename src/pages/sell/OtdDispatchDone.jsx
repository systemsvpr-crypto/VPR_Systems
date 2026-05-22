import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CheckCircle, History, Save, ChevronDown, ChevronUp, RefreshCw, ClipboardList, X, XCircle, Trash2, Search, Package } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { supabase } from '../../supabase';
import { whatsappService } from '../../services/whatsappService';
import Pagination from '@/components/ui/Pagination';

const ITEMS_PER_PAGE = 10;

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
  const [currentPage, setCurrentPage] = useState(1);
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
  const [productsData, setProductsData] = useState([]);
  const [godownsData, setGodownsData] = useState([]);

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
        supabase.from('products').select('product_id, name, godown_id, closing_quantity, is_active').eq('is_active', true),
        supabase.from('godowns').select('godown_id, name, is_active').eq('is_active', true).order('name')
      ]);
      if (productsRes.error) throw productsRes.error;
      if (godownsRes.error) throw godownsRes.error;

      setProductsData(productsRes.data || []);
      setGodownsData(godownsRes.data || []);

      setItemNames([...new Set((productsRes.data || []).map(p => p.name))].sort());
      setGodowns((godownsRes.data || []).map(g => g.name));
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data: ' + error.message);
    }
  }, []);

  useEffect(() => { fetchMasterData(); }, [fetchMasterData]);

  // Helper to format godown option string with stock availability of a product
  const getGodownOptionString = useCallback((godownName, productName) => {
    const godownObj = godownsData.find(g => g.name === godownName);
    if (!godownObj) return godownName;
    const prodStock = productsData.find(p => p.name === productName && p.godown_id === godownObj.godown_id);
    const availableQty = prodStock ? parseFloat(prodStock.closing_quantity) || 0 : 0;
    return `${godownName} (${availableQty} units)`;
  }, [godownsData, productsData]);

  // Helper to get godown options with availability for a product
  const getGodownOptionsForProduct = useCallback((productName) => {
    return godownsData.map(g => {
      const prodStock = productsData.find(p => p.name === productName && p.godown_id === g.godown_id);
      const availableQty = prodStock ? parseFloat(prodStock.closing_quantity) || 0 : 0;
      return `${g.name} (${availableQty} units)`;
    });
  }, [godownsData, productsData]);

  useEffect(() => {
    setSelectedRows({});
    setEditData({});
  }, [activeTab]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, clientFilter, godownFilter, activeTab]);

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

  const activeFilteredItems = activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory;
  const totalPages = Math.ceil(activeFilteredItems.length / ITEMS_PER_PAGE);
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageEndIndex = pageStartIndex + ITEMS_PER_PAGE;
  const currentItems = activeFilteredItems.slice(pageStartIndex, pageEndIndex);
  const paginationStart = activeFilteredItems.length === 0 ? 0 : pageStartIndex + 1;
  const paginationEnd = Math.min(pageEndIndex, activeFilteredItems.length);

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

    // --- Validate Stock Availability for all selected items first ---
    for (const id of selectedIds) {
      const item = orders.find(o => String(o.id) === String(id));
      if (item) {
        const finalQty = editData[id]?.dispatchQty !== undefined
          ? parseFloat(editData[id].dispatchQty)
          : parseFloat(item.dispatchQty);
        const finalGodown = editData[id]?.godown || item.godownName;
        const finalProduct = editData[id]?.product || item.itemName;

        if (isNaN(finalQty) || finalQty <= 0) {
          toast.error(`Please enter a valid quantity for dispatch ${item.dispatchNo}`);
          return;
        }

        const godownObj = godownsData.find(g => g.name === finalGodown);
        if (!godownObj) {
          toast.error(`Godown "${finalGodown}" not found for dispatch ${item.dispatchNo}`);
          return;
        }

        const prodStock = productsData.find(p => p.name === finalProduct && p.godown_id === godownObj.godown_id);
        const availableStock = prodStock ? parseFloat(prodStock.closing_quantity) || 0 : 0;

        if (finalQty > availableStock) {
          toast.error(`Insufficient stock for "${finalProduct}" in "${finalGodown}" for dispatch ${item.dispatchNo}.\nAvailable: ${availableStock}, Requested: ${finalQty}`);
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();

      for (const id of selectedIds) {
        const item = orders.find(o => String(o.id) === String(id));
        if (item) {
          const finalQty = editData[id]?.dispatchQty !== undefined
            ? parseFloat(editData[id].dispatchQty)
            : parseFloat(item.dispatchQty);
          const finalGodown = editData[id]?.godown || item.godownName;
          const finalProduct = editData[id]?.product || item.itemName;

          // 1. Update the dispatch_plans record
          const { error: planErr } = await supabase.from('dispatch_plans').update({
            planned_qty: finalQty,
            godown_name: finalGodown,
            product_name: finalProduct,
            dispatch_completed: true,
            completed_at: now,
            status: 'Completed',
            submitted_by: user?.name || user?.full_name || user?.username || 'System',
          }).eq('id', item.id);
          if (planErr) throw planErr;

          // 2. Log in dispatch_completed_log
          const { error: logErr } = await supabase.from('dispatch_completed_log').insert([{
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
            order_no: item.orderNumber,
            is_skip: false
          }]);
          if (logErr) throw logErr;

          // 3. Process stock outflow if applicable
          if (finalGodown && finalProduct && finalQty > 0) {
            const { data: gData, error: gErr } = await supabase.from('godowns').select('godown_id').eq('name', finalGodown).single();
            if (gErr) throw gErr;

            if (gData?.godown_id) {
              // Re-fetch the latest product details from database for this exact product-godown mapping
              const { data: pData, error: pErr } = await supabase.from('products').select('*').eq('name', finalProduct).eq('godown_id', gData.godown_id).single();
              if (pErr) throw pErr;

              if (pData) {
                const currentStock = parseFloat(pData.closing_quantity) || 0;
                const newStock = currentStock - finalQty;
                const mux = parseFloat(pData.mux) || 0;

                // Update product table closing stock and derived quantity
                const { error: prodUpErr } = await supabase.from('products').update({
                  closing_quantity: newStock,
                  quantity: (newStock * mux).toFixed(3),
                  updated_at: now
                }).eq('product_id', pData.product_id);
                if (prodUpErr) throw prodUpErr;

                // Insert into stock_management ledger
                const entryId = `STK-SAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
                const { error: smErr } = await supabase.from('stock_management').insert([{
                  entry_id: entryId,
                  godown_id: gData.godown_id,
                  product_id: pData.product_id,
                  transaction_type: 'out',
                  quantity: finalQty,
                  opening_stock: currentStock,
                  closing_stock: newStock,
                  reference_number: item.dispatchNo,
                  date: now.split('T')[0],
                  notes: `Sales Dispatch: ${item.dispatchNo} for ${item.clientName}`,
                }]);
                if (smErr) throw smErr;

                // Insert stock notification entry
                const { error: notifErr } = await supabase.from('stock_notifications').insert([{
                  notification_type: 'stock_out',
                  title: 'Stock OUT (Sales)',
                  message: `${finalQty} units dispatched to ${item.clientName} from ${finalGodown}`,
                  product_id: pData.product_id,
                  godown_id: gData.godown_id,
                  related_id: entryId
                }]);
                if (notifErr) throw notifErr;
              }
            }
          }
        }
      }

      toast.success('Dispatch marked as completed!');
      setSelectedRows({});
      setEditData({});
      await fetchPendingOrders(true);
      await fetchHistory(true);
      await fetchMasterData();
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
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <CheckCircle className="text-primary" size={24} />
                Dispatch Completed
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Inventory Outflow & Completion Logs</p>
            </div>
            
            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button
                onClick={() => { setActiveTab('pending'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black transition-all uppercase tracking-widest ${activeTab === 'pending' ? 'bg-white text-primary shadow-md shadow-primary/5' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <ClipboardList size={14} /> Pending
              </button>
              <button
                onClick={() => { setActiveTab('history'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black transition-all uppercase tracking-widest ${activeTab === 'history' ? 'bg-white text-primary shadow-md shadow-primary/5' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <History size={14} /> History
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Filters & Actions */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-3xl">
            <div className="relative group">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
              />
            </div>
            <div className="h-[42px]"><SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="w-full h-full" focusColor="primary" /></div>
            <div className="h-[42px]"><SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="w-full h-full" focusColor="primary" /></div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleRefresh} 
              disabled={isRefreshing || isSaving} 
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all font-bold text-xs shadow-sm"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-primary' : ''} />
              Refresh
            </button>
            {activeTab === 'pending' && Object.values(selectedRows).some(v => v) && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                <button
                  onClick={handleBulkCancelDispatch}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl hover:bg-rose-600 hover:text-white transition-all font-black text-xs shadow-sm"
                >
                  <XCircle size={14} /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all font-black text-xs shadow-md shadow-primary/20"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  Complete All
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
      <div className="erp-table-container max-w-[1400px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="hidden md:block relative overflow-x-auto custom-scrollbar">
          <table className="erp-table">
            <thead className="erp-table-thead">
              <tr>
                {activeTab === 'pending' && <th className="erp-table-th text-center w-16">Action</th>}
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
                    className={`erp-table-th cursor-pointer hover:bg-slate-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : {}}
                    onClick={() => requestSort(col.key)}
                  >
                    <div className={`flex items-center gap-1.5 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {col.label}
                      <div className="flex flex-col -space-y-1">
                        <ChevronUp size={12} className={sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'text-primary' : 'text-slate-300'} />
                        <ChevronDown size={12} className={sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'text-primary' : 'text-slate-300'} />
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingOrders || loadingHistory ? (
                <TableSkeleton cols={activeTab === 'pending' ? 12 : 9} />
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-5 bg-slate-50 rounded-full text-slate-300">
                        <Package size={40} strokeWidth={1.5} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No records found</p>
                        <p className="text-xs text-slate-300">Try adjusting your filters or search term</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                currentItems.map((item) => {
                  const itemId = item.id;
                  const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                  return (
                    <tr key={itemId} className="erp-table-tr group">
                      {activeTab === 'pending' && (
                        <td className="px-6 py-4 text-center">
                          <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(itemId)} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" />
                        </td>
                      )}
                    <td className="erp-table-td">
                      <span className="font-black text-slate-900 tracking-tight">{item.dispatchNo}</span>
                    </td>
                    <td className="erp-table-td text-center">
                      <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 font-black text-[10px] uppercase rounded-md tracking-tighter border border-slate-200">
                        {formatDisplayDate(item.dispatchDate)}
                      </span>
                    </td>
                    {activeTab === 'pending' && <td className="erp-table-td font-bold text-slate-400">{item.orderNumber}</td>}
                      <td className="erp-table-td font-bold text-slate-900">{item.clientName}</td>

                      {/* Product — editable dropdown when selected; edit goes to dispatch_plans only */}
                      <td className={`erp-table-td font-semibold text-slate-700 relative ${isSelected ? 'z-[70] min-w-[275px]' : 'truncate max-w-[200px]'}`}>
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
                      <td className={`erp-table-td text-center text-slate-600 italic font-black text-[11px] uppercase opacity-60 whitespace-nowrap relative ${isSelected ? 'z-[60] min-w-[210px]' : ''}`}>
                        {activeTab === 'pending' && isSelected ? (
                          <div className="w-48 mx-auto">
                            <SearchableDropdown
                              value={getGodownOptionString(editData[itemId]?.godown || item.godownName, editData[itemId]?.product || item.itemName)}
                              onChange={(val) => {
                                const rawGodownName = godownsData.find(g => val === g.name || val.startsWith(g.name + ' ('))?.name || val;
                                handleEditChange(itemId, 'godown', rawGodownName);
                              }}
                              options={getGodownOptionsForProduct(editData[itemId]?.product || item.itemName)}
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

                    <td className="erp-table-td text-right">
                      <span className="font-black text-slate-400">{item.qty}</span>
                    </td>

                    {/* Dispatch Qty */}
                    <td className="erp-table-td text-right bg-slate-50/30">
                      {activeTab === 'pending' && isSelected ? (
                        <input
                          type="text"
                          value={editData[itemId]?.dispatchQty !== undefined ? editData[itemId].dispatchQty : item.dispatchQty}
                          onChange={(e) => handleEditChange(itemId, 'dispatchQty', e.target.value)}
                          className="w-24 h-8 px-2 border-2 border-slate-200 rounded-lg text-sm font-black text-slate-900 outline-none focus:border-primary transition-all text-center shadow-sm"
                        />
                      ) : (
                        <span className="text-base font-black text-primary tracking-tight">{item.dispatchQty}</span>
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
                              className="h-8 px-2 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:border-primary disabled:opacity-40 transition-all"
                            />
                          </td>
                          <td className={`px-6 py-4 text-center relative ${isSelected ? 'z-[50]' : ''}`}>
                            <div className="relative group">
                              <select
                                disabled={!isSelected}
                                value={editData[itemId]?.status || 'Completed'}
                                onChange={(e) => handleEditChange(itemId, 'status', e.target.value)}
                                className={`w-full pl-3 pr-8 h-8 border border-slate-200 rounded-lg text-[11px] font-black uppercase tracking-wider appearance-none bg-white transition-all shadow-sm ${isSelected ? 'cursor-pointer hover:border-primary focus:ring-4 focus:ring-primary/5 outline-none' : 'bg-slate-50 opacity-40 cursor-not-allowed'}`}
                              >
                                <option value="Completed">Completed</option>
                                <option value="Pending">Pending</option>
                              </select>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronDown size={12} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 border-l border-slate-50">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.crmName}</span>
                              <button
                                onClick={() => handleCancelDispatch(item)}
                                className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
                            <span className="inline-block px-2.5 py-1.5 bg-emerald-50 text-emerald-600 font-black text-[10px] uppercase rounded-lg tracking-widest border border-emerald-100 shadow-sm">
                              {item.status}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
              {!(loadingOrders || loadingHistory) && Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                <tr key={`empty-${i}`}><td colSpan="14" className="h-16"></td></tr>
              ))}
            </tbody>
          </table>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 to-transparent pointer-events-none opacity-30"></div>
        </div>
        {!(loadingOrders || loadingHistory) && (
          <div className="hidden md:block">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={activeFilteredItems.length}
              startIndex={paginationStart}
              endIndex={paginationEnd}
              onPageChange={setCurrentPage}
              className="border-t border-slate-100"
            />
          </div>
        )}

        {/* Mobile view */}
        <div className="md:hidden">
          {loadingOrders || loadingHistory ? (
            <MobileSkeleton />
          ) : currentItems.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-slate-50 rounded-full text-slate-200"><ClipboardList size={32} /></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No items found</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 p-2">
              {currentItems.map((item) => {
                const itemId = item.id;
                const isSelected = activeTab === 'pending' && !!selectedRows[itemId];
                return (
                  <div
                    key={itemId}
                    className={`p-5 mb-3 rounded-2xl border transition-all ${isSelected ? 'bg-primary/5 border-primary/20 shadow-lg' : 'bg-white border-slate-100 shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dispatch No</p>
                        <p className="font-black text-slate-900 text-base">{item.dispatchNo}</p>
                      </div>
                      {activeTab === 'pending' && (
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleCancelDispatch(item)} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={18} />
                          </button>
                          <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(itemId)} className="rounded text-primary focus:ring-primary w-5 h-5 cursor-pointer" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="col-span-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</p>
                        <p className="font-bold text-slate-800">{item.clientName}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Date</p>
                        <p className="font-bold text-slate-600 text-xs bg-slate-50 px-2 py-1 rounded-md inline-block">{formatDisplayDate(item.dispatchDate)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Order Qty</p>
                        <p className="font-black text-slate-400 text-xs">{item.qty}</p>
                      </div>
                      <div className="col-span-2 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Item & Godown</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-bold text-slate-800 leading-tight">{item.itemName}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase italic opacity-60">@{item.godownName}</p>
                        </div>
                      </div>
                      <div className="col-span-2 pt-2 flex items-center justify-between">
                         <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dispatch Qty</p>
                            <p className="text-lg font-black text-primary tracking-tight">{item.dispatchQty}</p>
                         </div>
                         {activeTab === 'history' && (
                            <span className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm">
                                {item.status}
                            </span>
                         )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!(loadingOrders || loadingHistory) && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={activeFilteredItems.length}
              startIndex={paginationStart}
              endIndex={paginationEnd}
              onPageChange={setCurrentPage}
              className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OtdDispatchDone;
