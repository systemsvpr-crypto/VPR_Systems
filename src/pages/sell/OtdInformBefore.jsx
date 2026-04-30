import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BellRing, History, Save, X, ChevronUp, ChevronDown, RefreshCw, Search } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { supabase } from '../../supabase';
import { whatsappService } from '../../services/whatsappService';

const OtdInformBefore = () => {
    const { user } = useAuthStore();
    const [pendingItems, setPendingItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedRows, setSelectedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [godownFilter, setGodownFilter] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const abortControllerRef = useRef(null);

    const formatDisplayDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).replace(/ /g, '-');
        } catch (e) {
            return dateStr;
        }
    };

    // --- Skeleton Components ---
    const TableSkeleton = ({ cols }) => (
        <>
            {[...Array(6)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden">
                    {[...Array(cols)].map((_, j) => (
                        <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );

    const MobileSkeleton = () => (
        <div className="divide-y divide-gray-100">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4 space-y-4 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div className="space-y-2 w-2/3">
                            <div className="h-3 w-1/3 bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                            <div className="h-5 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                            </div>
                        </div>
                        <div className="h-6 w-12 bg-gray-100 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="h-8 bg-gray-50 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                        <div className="h-8 bg-gray-50 rounded-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const fetchInformData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from('dispatch_plans')
                .select(`
                    *,
                    order:app_orders(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const allItems = (data || []).map((item) => ({
                id: item.id,
                orderNo: item.order?.order_number || '-',
                dispatchNo: item.dispatch_number || '-',
                clientName: item.order?.client_name || '-',
                godownName: item.godown_name || '-',
                itemName: item.order?.item_name || '-',
                qty: item.order?.qty || '-',
                dispatchQty: item.planned_qty || '-',
                dispatchDate: item.planned_date || '-',
                informed: item.informed_before_dispatch,
                informedAt: item.informed_at,
                dispatchCompleted: item.dispatch_completed,
                status: item.status,
                is_skip: item.is_skip
            }));

            // Pending: Not informed, not completed, not canceled, and NOT a skip
            setPendingItems(allItems.filter(item => !item.informed && !item.dispatchCompleted && item.status !== 'Canceled' && item.is_skip !== true));
            // History: Everything that has been informed, excluding Canceled AND excluding skips
            setHistoryItems(allItems.filter(item => item.informed && item.status !== 'Canceled' && item.is_skip !== true));

        } catch (error) {
            console.error('fetchInformData error:', error);
            setError(error.message);
            toast.error('Failed to load data: ' + error.message);
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInformData();
    }, [fetchInformData]);

    const handleRefresh = useCallback(() => {
        fetchInformData(true);
    }, [fetchInformData]);

    const allUniqueClients = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.clientName), ...historyItems.map(h => h.clientName)])].sort(),
        [pendingItems, historyItems]
    );

    const allUniqueGodowns = useMemo(() =>
        [...new Set([...pendingItems.map(o => o.godownName), ...historyItems.map(h => h.godownName)])].sort(),
        [pendingItems, historyItems]
    );

    const requestSort = useCallback((key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

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

    const filteredAndSortedPending = useMemo(() => {
        const filtered = pendingItems.filter(item => {
            const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [pendingItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    const filteredAndSortedHistory = useMemo(() => {
        const filtered = historyItems.filter(item => {
            const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesClient = clientFilter === '' || item.clientName === clientFilter;
            const matchesGodown = godownFilter === '' || item.godownName === godownFilter;
            return matchesSearch && matchesClient && matchesGodown;
        });
        return getSortedItems(filtered);
    }, [historyItems, searchTerm, clientFilter, godownFilter, getSortedItems]);

    useEffect(() => {
        console.log(`Active Tab: ${activeTab}, Selected Rows Count: ${Object.keys(selectedRows).length}`);
    }, [activeTab, selectedRows]);

    const handleCheckboxToggle = (id) => {
        console.log('Toggling checkbox for ID:', id);
        setSelectedRows(prev => {
            const newSelected = { ...prev };
            if (newSelected[id]) delete newSelected[id];
            else newSelected[id] = 'yes';
            return newSelected;
        });
    };

    const handleStatusChange = (id, status) => {
        setSelectedRows(prev => ({ ...prev, [id]: status }));
    };

    const handleSave = async () => {
        const selectedIds = Object.keys(selectedRows);
        console.log('handleSave triggered with selectedIds:', selectedIds);
        if (selectedIds.length === 0) {
            console.log('No rows selected, exiting handleSave');
            return;
        }

        setIsSaving(true);
        try {
            // Group selected items by client for bulk notification
            const selectedItemsDetails = pendingItems.filter(item => selectedIds.includes(String(item.id)));
            const groupedByClient = selectedItemsDetails.reduce((acc, item) => {
                const client = item.clientName;
                if (!acc[client]) acc[client] = [];
                acc[client].push(item);
                return acc;
            }, {});

            const successfulIds = [];
            
            // 1. Send WhatsApp Notifications First
            for (const clientName in groupedByClient) {
                const items = groupedByClient[clientName];
                try {
                    console.log(`Attempting WhatsApp for ${clientName}`);
                    await whatsappService.sendBulkDispatchNotification('9691207533', {
                        customerName: clientName,
                        orderNumbers: items.map(i => i.orderNo),
                        productNames: items.map(i => `${i.itemName} (${i.dispatchQty})`),
                        dispatchDates: items.map(i => formatDisplayDate(i.dispatchDate))
                    }, { messageType: 'Before Dispatch' });
                    // If successful, add these items to the list to be updated in DB
                    items.forEach(it => successfulIds.push(it.id));
                } catch (wsError) {
                    console.error(`WhatsApp failed for ${clientName}:`, wsError);
                    const errorMsg = wsError.response?.data?.error?.message || wsError.message || 'Unknown error';
                    toast.error(`WhatsApp failed for ${clientName}: ${errorMsg}`);
                }
            }

            // 2. Only update database for items where WhatsApp was successful
            if (successfulIds.length > 0) {
                const { error: dbError } = await supabase
                    .from('dispatch_plans')
                    .update({
                        informed_before_dispatch: true,
                        informed_at: new Date().toISOString(),
                        submitted_by: user?.name || user?.full_name || user?.username || 'System'
                    })
                    .in('id', successfulIds);

                if (dbError) throw dbError;
                toast.success(`${successfulIds.length} notifications confirmed and recorded.`);
            } else {
                toast.error('No notifications were sent. Database not updated.');
            }

            setSelectedRows({});
            await fetchInformData(true);
        } catch (error) {
            console.error('Operation failed:', error);
            toast.error('Operation failed: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 lg:p-6 space-y-6">
            <div className="flex flex-col gap-6 bg-white p-6 rounded-lg shadow-sm border border-slate-200 max-w-[1200px] mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Inform Before Dispatch</h1>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Notify parties prior to dispatch</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <BellRing size={16} /> Pending
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <History size={16} /> History
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
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
                        <SearchableDropdown value={clientFilter} onChange={setClientFilter} options={allUniqueClients} allLabel="All Clients" className="h-[42px]" />
                        <SearchableDropdown value={godownFilter} onChange={setGodownFilter} options={allUniqueGodowns} allLabel="All Godowns" className="h-[42px]" />
                    </div>

                    <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-3">
                        <button onClick={handleRefresh} disabled={refreshing || isSaving} className="erp-btn-secondary h-[42px]">
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                        </button>
                        {activeTab === 'pending' && Object.keys(selectedRows).length > 0 && (
                            <button onClick={handleSave} className="erp-btn-primary h-[42px] px-6 shadow-md shadow-primary/10">
                                <Save size={18} /> Confirm Notification
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="erp-table-container max-w-[1200px] mx-auto">
                <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="erp-table">
                        <thead className="erp-table-thead">
                            <tr>
                                {activeTab === 'pending' && <th className="erp-table-th text-center w-16">Action</th>}
                                {[
                                    { label: 'Order No', key: 'orderNo' },
                                    { label: 'Dispatch No', key: 'dispatchNo', color: 'blue' },
                                    { label: 'Dispatch Qty', key: 'dispatchQty', align: 'right' },
                                    { label: 'Dispatch Date', key: 'dispatchDate', align: 'center' },
                                    { label: 'Client Name', key: 'clientName' },
                                    { label: 'Godown Name', key: 'godownName', align: 'center' },
                                    { label: 'Item Name', key: 'itemName' },
                                    { label: 'Total Qty', key: 'qty', align: 'right' },
                                    ...(activeTab === 'history' ? [{ label: 'Status', key: 'status', align: 'center' }] : [])
                                ].map((col) => (
                                    <th key={col.key} onClick={() => requestSort(col.key)} className={`erp-table-th cursor-pointer hover:bg-slate-100 transition-colors ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}>
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
                        <tbody className="divide-y divide-slate-100 text-sm font-medium">
                            {loading ? <TableSkeleton cols={activeTab === 'pending' ? 10 : 9} /> : (activeTab === 'pending' ? filteredAndSortedPending : filteredAndSortedHistory).map(item => (
                                <tr key={item.id} className="erp-table-tr group">
                                    {activeTab === 'pending' && (
                                        <td className="erp-table-td text-center w-16">
                                            <div className="flex items-center gap-2 justify-center">
                                                <input type="checkbox" checked={!!selectedRows[item.id]} onChange={() => handleCheckboxToggle(item.id)} className="rounded text-primary cursor-pointer w-4 h-4 shadow-sm" />
                                                {selectedRows[item.id] && (
                                                    <select value={selectedRows[item.id]} onChange={(e) => handleStatusChange(item.id, e.target.value)} className="text-[10px] font-black border border-green-200 rounded px-1.5 py-0.5 bg-green-50 text-primary outline-none">
                                                        <option value="yes">YES</option>
                                                        <option value="no">NO</option>
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    <td className="erp-table-td text-gray-500 font-bold">{item.orderNo}</td>
                                    <td className="erp-table-td font-black text-primary">{item.dispatchNo}</td>
                                    <td className="erp-table-td text-right font-black text-slate-800 text-base">{item.dispatchQty}</td>
                                    <td className="erp-table-td text-center font-black text-primary uppercase text-[10px] tracking-tighter bg-slate-50/50 rounded-lg whitespace-nowrap">{formatDisplayDate(item.dispatchDate)}</td>
                                    <td className="erp-table-td font-bold text-slate-900">{item.clientName}</td>
                                    <td className="erp-table-td text-center text-slate-600 italic font-black text-[11px] uppercase opacity-60 whitespace-nowrap">{item.godownName}</td>
                                    <td className="erp-table-td font-semibold text-slate-700 truncate max-w-[200px]" title={item.itemName}>{item.itemName}</td>
                                    <td className="erp-table-td text-right font-black text-slate-400">{item.qty}</td>
                                    {activeTab === 'history' && (
                                        <td className="erp-table-td text-center">
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">
                                                Informed
                                            </span>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isSaving && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-md">
                <RefreshCw size={40} className="animate-spin text-primary" />
            </div>}
        </div>
    );
};

export default OtdInformBefore;
