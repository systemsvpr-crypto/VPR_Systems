import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Mail, History, Save, ChevronUp, ChevronDown, RefreshCw, ClipboardList, CheckCircle, Search, Package } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { supabase } from '../../supabase';
import { whatsappService } from '../../services/whatsappService';

// --- Format date for display ---
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
  } catch { return dateStr; }
};

// --- High-Fidelity Skeletons ---
const TableSkeleton = ({ cols = 8 }) => (
  <tr>
    <td colSpan={cols} className="p-0">
      <div className="w-full space-y-4 p-4">
        <div className="h-10 bg-gray-100 rounded-lg w-full mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex space-x-4 border-b border-gray-50 pb-4 relative overflow-hidden">
            {[...Array(7)].map((_, j) => (
              <div key={j} className="flex-1 h-4 bg-gray-50 rounded relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </td>
  </tr>
);

const OtdInformAfter = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedRows, setSelectedRows] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isSaving, setIsSaving] = useState(false);

  const [pendingItems, setPendingItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Data ---
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .select(`
                *,
                order:app_orders(*)
            `)
        .order('informed_after_dispatch', { ascending: false });

      if (error) throw error;

      const allMapped = (data || []).map(item => ({
        id: item.id,
        dispatchNo: item.dispatch_number || '-',
        dispatchDate: item.planned_date || '-',
        orderNo: item.order?.order_number || '-',
        customerName: item.order?.client_name || '-',
        productName: item.order?.item_name || '-',
        godown: item.godown_name || '-',
        crmName: item.order?.submittedby || '-',
        orderQty: item.order?.qty || '0',
        dispatchQty: item.planned_qty || '0',
        completed: item.dispatch_completed,
        informedAfter: item.informed_after_dispatch,
        informedAt: item.informed_at,
        is_skip: item.is_skip,
        db_status: item.status,
        status: item.informed_after_dispatch ? 'Informed' : 'Pending'
      }));

      setPendingItems(allMapped.filter(i => i.db_status === 'Completed' && !i.informedAfter));
      setHistoryItems(allMapped.filter(i => i.db_status === 'Completed' && i.informedAfter));

    } catch (error) {
      console.error('fetchData error:', error);
      toast.error('Failed to load items: ' + error.message);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Filtering & Sorting ---
  const allUniqueClients = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.customerName), ...historyItems.map(h => h.customerName)])].sort(),
    [pendingItems, historyItems]
  );
  const allUniqueGodowns = useMemo(() =>
    [...new Set([...pendingItems.map(o => o.godown), ...historyItems.map(h => h.godown)])].sort(),
    [pendingItems, historyItems]
  );

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortedItems = useCallback((itemsToSort) => {
    if (!sortConfig.key) return itemsToSort;
    return [...itemsToSort].sort((a, b) => {
      let aVal = a[sortConfig.key], bVal = b[sortConfig.key];
      const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const filteredItems = useMemo(() => {
    const source = activeTab === 'pending' ? pendingItems : historyItems;
    const filtered = source.filter(item => {
      const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesClient = !clientFilter || item.customerName === clientFilter;
      const matchesGodown = !godownFilter || item.godown === godownFilter;
      return matchesSearch && matchesClient && matchesGodown;
    });
    return getSortedItems(filtered);
  }, [pendingItems, historyItems, activeTab, searchTerm, clientFilter, godownFilter, getSortedItems]);

  useEffect(() => {
    console.log(`InformAfter - Active Tab: ${activeTab}, Selected Rows Count: ${Object.keys(selectedRows).length}`);
  }, [activeTab, selectedRows]);

  // --- Actions ---
  const handleCheckboxToggle = (id) => {
    console.log('InformAfter - Toggling checkbox for ID:', id);
    setSelectedRows(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const handleSave = async () => {
    const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
    console.log('OtdInformAfter handleSave triggered with:', selectedIds);
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      // Group selected items by client for bulk notification
      const selectedItemsDetails = pendingItems.filter(item => selectedIds.includes(String(item.id)));
      const groupedByClient = selectedItemsDetails.reduce((acc, item) => {
        const client = item.customerName;
        if (!acc[client]) acc[client] = [];
        acc[client].push(item);
        return acc;
      }, {});

      const successfulIds = [];

      // 1. Send WhatsApp Notifications First
      for (const clientName in groupedByClient) {
        const items = groupedByClient[clientName];
        try {
          console.log(`Attempting WhatsApp After for ${clientName}`);
          await whatsappService.sendBulkDispatchNotification('9691207533', {
            customerName: clientName,
            orderNumbers: items.map(i => i.orderNo),
            productNames: items.map(i => `${i.productName} (${i.dispatchQty})`),
            dispatchDates: items.map(i => formatDisplayDate(i.dispatchDate))
          }, { stage: 'After Dispatch' });
          // Add to successful list
          items.forEach(it => successfulIds.push(it.id));
        } catch (wsError) {
          console.error(`WhatsApp failed for ${clientName}:`, wsError);
          toast.error(`WhatsApp failed for ${clientName}: ${wsError.message}`, { duration: 5000 });
        }
      }

      // 2. Only update database for items where WhatsApp was successful
      if (successfulIds.length > 0) {
        const { error: dbError } = await supabase
          .from('dispatch_plans')
          .update({
            informed_after_dispatch: true,
            informed_after: new Date().toISOString(),
            submitted_by: user?.name || user?.full_name || user?.username || 'System'
          })
          .in('id', successfulIds);

        if (dbError) throw dbError;
        toast.success(`${successfulIds.length} after-dispatch notifications confirmed.`);
      } else {
        toast.error('No notifications were sent. Database not updated.');
      }

      setSelectedRows({});
      fetchData(true);
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = () => fetchData(true);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-6 bg-white p-6 rounded-lg shadow-sm border border-slate-200 max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Inform to Party</h1>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Post-Dispatch Client Notifications</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => { setActiveTab('pending'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ClipboardList size={16} /> PENDING
              </button>
              <button
                onClick={() => { setActiveTab('history'); setSelectedRows({}); }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <History size={16} /> HISTORY
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Filters & Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative group">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
              />
            </div>
            <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="ALL CLIENTS" placeholder="Client" className="h-[42px]" />
            <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="ALL GODOWNS" placeholder="Godown" className="h-[42px]" />
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-3">
            <button onClick={handleRefresh} disabled={isRefreshing} className="erp-btn-secondary h-[42px]">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> REFRESH
            </button>
            {activeTab === 'pending' && Object.keys(selectedRows).length > 0 && (
              <button onClick={handleSave} disabled={isSaving} className="erp-btn-primary h-[42px] px-6 shadow-md shadow-primary/10">
                {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? 'SAVING...' : 'CONFIRM NOTIFY'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="erp-table-container max-w-[1200px] mx-auto">
        <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="erp-table">
            <thead className="erp-table-thead">
              <tr>
                {activeTab === 'pending' && <th className="erp-table-th text-center w-16">Action</th>}
                {[
                  { label: 'Dispatch No', key: 'dispatchNo' },
                  { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                  { label: 'Order No', key: 'orderNo' },
                  { label: 'Customer', key: 'customerName' },
                  { label: 'Product Name', key: 'productName' },
                  { label: 'Godown', key: 'godown', align: 'center' },
                  { label: 'CRM Name', key: 'crmName' },
                  { label: 'Order Qty', key: 'orderQty', align: 'right' },
                  { label: 'Status', key: 'status', align: 'center' },
                  { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                ].map(col => (
                  <th key={col.key} className={`erp-table-th cursor-pointer hover:bg-slate-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => requestSort(col.key)}>
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
              {isLoading ? (
                <TableSkeleton cols={activeTab === 'pending' ? 10 : 9} />
              ) : filteredItems.length === 0 ? (
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
                filteredItems.map((item, idx) => {
                  const isSelected = activeTab === 'pending' && !!selectedRows[item.id];
                  return (
                    <tr key={idx} className="erp-table-tr group">
                      {activeTab === 'pending' && (
                        <td className="erp-table-td text-center w-16">
                          <input type="checkbox" checked={isSelected} onChange={() => handleCheckboxToggle(item.id)} className="rounded-md w-5 h-5 cursor-pointer" />
                        </td>
                      )}
                      <td className="erp-table-td font-black text-primary">{item.dispatchNo}</td>
                      <td className="erp-table-td text-center font-black text-primary uppercase text-[10px] tracking-tighter bg-slate-50/50 rounded-lg whitespace-nowrap">{formatDisplayDate(item.dispatchDate)}</td>
                      <td className="erp-table-td text-gray-500 font-bold">{item.orderNo}</td>
                      <td className="erp-table-td font-bold text-slate-900">{item.customerName}</td>
                      <td className="erp-table-td font-semibold text-slate-700 truncate max-w-[200px]" title={item.productName}>{item.productName}</td>
                      <td className="erp-table-td text-center text-slate-600 italic font-black text-[11px] uppercase opacity-60 whitespace-nowrap">{item.godown}</td>
                      <td className="erp-table-td text-gray-400 text-[11px] italic font-bold">{item.crmName}</td>
                      <td className="erp-table-td text-right font-black text-slate-400">{item.orderQty}</td>
                      <td className="erp-table-td text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${activeTab === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="erp-table-td text-right font-black text-primary text-base leading-tight">{item.dispatchQty}</td>
                    </tr>
                  );
                } ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OtdInformAfter;
