import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
    ArrowRightLeft,
    Search,
    Download,
    RefreshCw,
    ArrowLeft,
    ArrowRight,
    Eye,
    X,
    Activity,
    SlidersHorizontal,
    Box,
    Truck,
    MapPin,
    CalendarDays,
    FileText,
    Package,
    Clock,
    ArrowDownCircle,
    ArrowUpCircle,
    BarChart3,
    Warehouse
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const StockMovement = () => {
    const navigate = useNavigate();

    // Core Data States
    const [transfers, setTransfers] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);

    // Loading States
    const [loadingData, setLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filter States
    const [startDate, setStartDate] = useState(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterSourceGodown, setFilterSourceGodown] = useState('all');
    const [filterDestGodown, setFilterDestGodown] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Godown Summary Panel States
    const [summaryGodown, setSummaryGodown] = useState('');
    const [summaryDate, setSummaryDate] = useState('');
    const [summaryData, setSummaryData] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(false);

    // Drilldown Detail Modal States
    const [selectedTransferRow, setSelectedTransferRow] = useState(null);
    const [detailTransactions, setDetailTransactions] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Fetch Reference Data
    const fetchMetadata = async () => {
        try {
            const godownsRes = await supabase.from('godowns').select('godown_id, name, is_active').order('name');
            if (godownsRes.error) throw godownsRes.error;
            setGodowns(godownsRes.data || []);

            // Fetch all products using pagination to overcome the 1000-record PostgREST limit
            let allProducts = [];
            let page = 0;
            const pageSize = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, product_id, name, godown_id, mux, is_active, product_type')
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;
                allProducts = allProducts.concat(data);
                if (data.length < pageSize) break;
                page++;
            }

            setProducts(allProducts);
        } catch (error) {
            console.error('Error fetching metadata:', error);
            toast.error('Failed to load configuration data');
        }
    };

    // Main Data Fetcher
    const fetchMovementData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoadingData(true);

        try {
            let transfersQuery = supabase
                .from('stock_management')
                .select('*')
                .not('godown_id', 'is', null)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });

            if (startDate) transfersQuery = transfersQuery.gte('date', startDate);
            if (endDate) transfersQuery = transfersQuery.lte('date', endDate);

            const transfersRes = await transfersQuery;

            if (transfersRes.error) throw transfersRes.error;

            setTransfers(transfersRes.data || []);

            if (isRefresh) toast.success('Transfer log synchronized');
        } catch (error) {
            console.error('Error fetching movement data:', error);
            toast.error('Failed to load transfer records');
        } finally {
            setLoadingData(false);
            setRefreshing(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        const loadAll = async () => {
            await fetchMetadata();
            await fetchMovementData();
        };
        loadAll();
    }, [fetchMovementData]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSourceGodown, filterDestGodown]);

    // Fetch Godown Summary — up to 20,000 records, with optional single-day filter
    const fetchGodownSummary = useCallback(async (godownId, date) => {
        if (!godownId) {
            setSummaryData(null);
            return;
        }
        setLoadingSummary(true);
        try {
            let query = supabase
                .from('stock_management')
                .select('transaction_type, quantity, product_id, date')
                .eq('godown_id', godownId)
                .not('entry_id', 'like', '%-SRC')
                .order('date', { ascending: false })
                .limit(20000);

            if (date) {
                query = query.gte('date', date).lte('date', date);
            }

            const { data, error } = await query;
            if (error) throw error;

            const rows = data || [];
            let totalIn = 0;
            let totalOut = 0;
            let inCount = 0;
            let outCount = 0;

            rows.forEach(r => {
                const qty = parseFloat(r.quantity) || 0;
                if (r.transaction_type === 'in') {
                    totalIn += qty;
                    inCount++;
                } else {
                    totalOut += qty;
                    outCount++;
                }
            });

            setSummaryData({
                godownId,
                date: date || null,
                totalIn,
                totalOut,
                netBalance: totalIn - totalOut,
                inCount,
                outCount,
                totalRecords: rows.length,
            });
        } catch (err) {
            console.error('Error fetching godown summary:', err);
            toast.error('Failed to load godown summary');
        } finally {
            setLoadingSummary(false);
        }
    }, []);

    useEffect(() => {
        fetchGodownSummary(summaryGodown, summaryDate);
    }, [summaryGodown, summaryDate, fetchGodownSummary]);

    // Lookup Maps
    const godownMap = useMemo(() => {
        const map = {};
        godowns.forEach(g => { map[g.godown_id] = g.name; });
        return map;
    }, [godowns]);

    const productMap = useMemo(() => {
        const map = {};
        products.forEach(p => { map[p.product_id] = p; });
        return map;
    }, [products]);

    // Filtered Data
    const filteredTransfers = useMemo(() => {
        return transfers.filter(t => {
            // Filter out source duplicate transfer outflows to avoid duplicate transfer rows
            if (t.entry_id && t.entry_id.endsWith('-SRC')) {
                return false;
            }

            if (filterSourceGodown !== 'all') {
                if (filterSourceGodown === 'new_stock') {
                    // Inflow from system new stock has from_location === null and type 'in'
                    if (t.transaction_type === 'in' && t.from_location !== null) return false;
                    if (t.transaction_type === 'out') return false;
                } else {
                    // For specific godowns:
                    // Inflow transfer must originate from filterSourceGodown
                    if (t.transaction_type === 'in' && t.from_location !== filterSourceGodown) return false;
                    // Outflow dispatch must reduce stock from filterSourceGodown
                    if (t.transaction_type === 'out' && t.godown_id !== filterSourceGodown) return false;
                }
            }

            if (filterDestGodown !== 'all') {
                // Inflow transfer/receipt stock is added to godown_id
                if (t.transaction_type === 'in' && t.godown_id !== filterDestGodown) return false;
                // Outflow dispatch has no destination godown in the system, so exclude
                if (t.transaction_type === 'out') return false;
            }

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const product = productMap[t.product_id];
                const entryMatch = t.entry_id?.toLowerCase().includes(term);
                const notesMatch = t.notes?.toLowerCase().includes(term);
                const refMatch = t.reference_number?.toLowerCase().includes(term);
                const prodNameMatch = product?.name?.toLowerCase().includes(term);
                const prodIdMatch = t.product_id?.toLowerCase().includes(term);

                if (!entryMatch && !notesMatch && !refMatch && !prodNameMatch && !prodIdMatch) return false;
            }
            return true;
        });
    }, [transfers, filterSourceGodown, filterDestGodown, searchTerm, productMap]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE));
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const items = filteredTransfers.slice(start, start + ITEMS_PER_PAGE);
        while (items.length < ITEMS_PER_PAGE) {
            items.push(null);
        }
        return items;
    }, [filteredTransfers, currentPage]);

    const handleExportExcel = () => {
        try {
            if (filteredTransfers.length === 0) {
                toast.error('No records available to export');
                return;
            }

            const dataToExport = filteredTransfers.map(t => {
                const product = productMap[t.product_id];
                const fromGodown = t.transaction_type === 'out'
                    ? (godownMap[t.godown_id] || t.godown_id)
                    : (t.from_location ? (godownMap[t.from_location] || t.from_location) : 'New Stock (System)');
                const toGodown = t.transaction_type === 'out'
                    ? 'Dispatch / Out'
                    : (godownMap[t.godown_id] || t.godown_id);

                return {
                    'Date': t.date,
                    'Entry ID': t.entry_id,
                    'Product ID': t.product_id,
                    'Product Name': product ? product.name : 'Unknown',
                    'From Godown': fromGodown,
                    'To Godown': toGodown,
                    'Quantity (Bags)': parseFloat(t.quantity) || 0,
                    'Mux (Weight Factor)': product ? parseFloat(product.mux) || 1 : 1,
                    'Total Weight (KG)': product ? (parseFloat(t.quantity) || 0) * (parseFloat(product.mux) || 0) : 0,
                    'LR Number': t.lr_number || '—',
                    'Reference Number': t.reference_number || '—',
                    'Created By': t.created_by || '—',
                    'Notes': t.notes || ''
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Transfers');

            const wscols = Object.keys(dataToExport[0]).map(key => ({ wch: Math.max(key.length + 3, 14) }));
            worksheet['!cols'] = wscols;

            XLSX.writeFile(workbook, `Inter_Godown_Transfers_${startDate}_to_${endDate}.xlsx`);
            toast.success('Report exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export to Excel');
        }
    };

    const handleOpenDrilldown = async (row) => {
        setSelectedTransferRow(row);
        setIsDetailModalOpen(true);
        setLoadingDetails(true);
        setDetailTransactions([]);

        try {
            // Fetch all transactions for this product, sorted ASC for balance computation
            const { data, error } = await supabase
                .from('stock_management')
                .select('*')
                .eq('product_id', row.product_id)
                .order('date', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;

            const transactions = data || [];

            // Get current closing quantity from products to use as anchor
            const { data: productData } = await supabase
                .from('products')
                .select('closing_quantity')
                .eq('product_id', row.product_id)
                .single();

            const currentClosing = parseFloat(productData?.closing_quantity) || 0;

            // Compute running balance dynamically by replaying all transactions in order
            let runningBalance = 0;
            const withBalances = transactions.map(t => {
                const qty = parseFloat(t.quantity) || 0;
                if (t.transaction_type === 'in') {
                    runningBalance += qty;
                } else {
                    runningBalance -= qty;
                }
                return { ...t, _running_balance: runningBalance };
            });

            // Calculate offset to anchor the computed balance to the actual current stock.
            // This handles opening stock that existed before the first logged transaction.
            const offset = currentClosing - runningBalance;

            // Apply offset and reverse for display (newest first)
            const withOffset = withBalances.map(t => ({
                ...t,
                computed_running_balance: t._running_balance + offset
            })).reverse();

            setDetailTransactions(withOffset);
        } catch (error) {
            console.error('Error fetching details:', error);
            toast.error('Failed to load transaction history');
        } finally {
            setLoadingDetails(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all text-slate-600"
                        title="Go Back"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRightLeft className="text-primary" size={20} />
                            Stock Movement & Transfers
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            Track stock inflows, outflows, and transfers between locations
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => fetchMovementData(true)}
                        disabled={refreshing || loadingData}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border border-slate-200 transition-all disabled:opacity-50 shadow-sm"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-primary' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-primary/95 transition-all"
                    >
                        <Download size={14} />
                        Export
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto pb-24">

                {/* ── Godown Summary Panel ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Panel Header — matches filter-bar style */}
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-end gap-4 flex-wrap">

                        {/* Title block */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Summary</label>
                            <div className="flex items-center gap-2 h-10">
                                <Warehouse size={16} className="text-primary" />
                                <span className="text-sm font-bold text-slate-700">Godown In / Out</span>
                            </div>
                        </div>

                        {/* Godown select */}
                        <div className="space-y-1 flex-1 min-w-[180px]">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Godown</label>
                            <select
                                value={summaryGodown}
                                onChange={(e) => setSummaryGodown(e.target.value)}
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
                            >
                                <option value="">— Select Godown —</option>
                                {godowns.map(g => (
                                    <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date */}
                        <div className="space-y-1 min-w-[140px]">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date</label>
                            <DatePicker
                                value={summaryDate}
                                onChange={(e) => setSummaryDate(e.target.value)}
                            />
                        </div>

                        {/* Clear + Refresh */}
                        <div className="flex items-center gap-2">
                            {summaryDate && (
                                <button
                                    onClick={() => setSummaryDate('')}
                                    className="h-10 px-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg bg-white hover:bg-rose-50 hover:border-rose-200 transition-all"
                                >
                                    <X size={12} />
                                    Clear
                                </button>
                            )}
                            {summaryGodown && (
                                <button
                                    onClick={() => fetchGodownSummary(summaryGodown, summaryDate)}
                                    disabled={loadingSummary}
                                    className="h-10 px-3 flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-all disabled:opacity-50"
                                >
                                    <RefreshCw size={11} className={loadingSummary ? 'animate-spin text-primary' : ''} />
                                    Refresh
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Panel Body */}
                    {!summaryGodown ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <BarChart3 size={32} className="text-slate-200" />
                            <p className="text-sm font-medium">Select a godown above to view its In / Out summary</p>
                        </div>
                    ) : loadingSummary ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="animate-spin text-primary" size={24} />
                            <p className="text-sm font-semibold text-slate-500">Calculating summary…</p>
                        </div>
                    ) : summaryData ? (
                        <div className="p-4">
                            {/* Four stat cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {/* Stock IN */}
                                <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <ArrowDownCircle size={14} className="text-emerald-600" />
                                        <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Stock In</span>
                                    </div>
                                    <div className="text-xl font-black text-emerald-700 leading-none">
                                        {summaryData.totalIn.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-emerald-500 font-medium mt-0.5">Bags received</div>
                                    <div className="text-[10px] text-emerald-400">{summaryData.inCount.toLocaleString()} entries</div>
                                </div>

                                {/* Stock OUT */}
                                <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-rose-50 border border-rose-100">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <ArrowUpCircle size={14} className="text-rose-600" />
                                        <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Stock Out</span>
                                    </div>
                                    <div className="text-xl font-black text-rose-700 leading-none">
                                        {summaryData.totalOut.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-rose-500 font-medium mt-0.5">Bags dispatched</div>
                                    <div className="text-[10px] text-rose-400">{summaryData.outCount.toLocaleString()} entries</div>
                                </div>

                                {/* Net Movement */}
                                <div className={cn(
                                    "flex flex-col gap-0.5 p-3 rounded-lg border",
                                    summaryData.netBalance >= 0
                                        ? "bg-blue-50 border-blue-100"
                                        : "bg-amber-50 border-amber-100"
                                )}>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <BarChart3 size={14} className={summaryData.netBalance >= 0 ? "text-blue-600" : "text-amber-600"} />
                                        <span className={cn(
                                            "text-[11px] font-bold uppercase tracking-wider",
                                            summaryData.netBalance >= 0 ? "text-blue-600" : "text-amber-600"
                                        )}>Net Movement</span>
                                    </div>
                                    <div className={cn(
                                        "text-xl font-black leading-none",
                                        summaryData.netBalance >= 0 ? "text-blue-700" : "text-amber-700"
                                    )}>
                                        {summaryData.netBalance >= 0 ? '+' : ''}{summaryData.netBalance.toLocaleString()}
                                    </div>
                                    <div className={cn(
                                        "text-xs font-medium mt-0.5",
                                        summaryData.netBalance >= 0 ? "text-blue-500" : "text-amber-500"
                                    )}>In minus Out</div>
                                </div>

                                {/* Total Entries */}
                                <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <Activity size={14} className="text-slate-500" />
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Entries</span>
                                    </div>
                                    <div className="text-xl font-black text-slate-700 leading-none">
                                        {(summaryData.inCount + summaryData.outCount).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium mt-0.5">All transactions</div>
                                    <div className="text-[10px] text-slate-400">
                                        {summaryData.inCount} in · {summaryData.outCount} out
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Simple Row Filter Bar */}
                <div className="flex items-end gap-4 flex-wrap w-full mb-4">
                    <div className="space-y-1 flex-1 min-w-[140px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">From Date</label>
                        <DatePicker
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1 flex-1 min-w-[140px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">To Date</label>
                        <DatePicker
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1 flex-1 min-w-[180px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Source Godown</label>
                        <select
                            value={filterSourceGodown}
                            onChange={(e) => setFilterSourceGodown(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
                        >
                            <option value="all">All Sources</option>
                            <option value="new_stock">✨ New Stock</option>
                            {godowns.map(g => (
                                <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1 flex-1 min-w-[180px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Dest. Godown</label>
                        <select
                            value={filterDestGodown}
                            onChange={(e) => setFilterDestGodown(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
                        >
                            <option value="all">All Destinations</option>
                            {godowns.map(g => (
                                <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1 flex-[2] min-w-[250px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search Records</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search by product, ID, notes..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 bg-white border-slate-200 rounded-lg focus-visible:ring-primary text-sm font-medium w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Standard Table View */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto custom-scrollbar min-h-[500px]">
                        {loadingData ? (
                            <div className="py-24 flex flex-col items-center justify-center gap-3">
                                <RefreshCw className="animate-spin text-primary" size={28} />
                                <p className="text-sm font-semibold text-slate-500">Loading Transfer Records...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse min-w-[1200px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                                        <th className="px-6 py-4 whitespace-nowrap">Date</th>
                                        <th className="px-6 py-4 whitespace-nowrap">Entry ID</th>
                                        <th className="px-6 py-4 whitespace-nowrap">Product Name</th>
                                        <th className="px-6 py-4 whitespace-nowrap">Stock Reduced From</th>
                                        <th className="px-6 py-4 whitespace-nowrap">Stock Added To</th>
                                        <th className="px-6 py-4 whitespace-nowrap text-right">Total Transferred</th>
                                        <th className="px-6 py-4 whitespace-nowrap text-right">Balance</th>
                                        <th className="px-6 py-4 whitespace-nowrap">LR No. / Notes</th>
                                        <th className="px-6 py-4 whitespace-nowrap text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {paginatedItems.map((t, index) => {
                                        if (!t) {
                                            return (
                                                <tr key={`empty-${index}`} className="h-[73px]">
                                                    <td className="px-6 py-4" colSpan="9">
                                                        {index === 0 && filteredTransfers.length === 0 ? <span className="text-slate-400 italic">No transfer records found.</span> : null}
                                                    </td>
                                                </tr>
                                            );
                                        }
                                        const product = productMap[t.product_id];
                                        return (
                                            <tr
                                                key={t.entry_id || index}
                                                className="hover:bg-slate-50 transition-colors group cursor-pointer h-[73px]"
                                                onClick={() => handleOpenDrilldown(t)}
                                            >
                                                <td className="px-6 py-4 font-medium text-slate-600 whitespace-nowrap">{t.date}</td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{t.entry_id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="font-semibold text-slate-800 mr-2">{product ? product.name : 'Unknown Product'}</span>
                                                    <span className="text-xs text-slate-400 font-mono">(SKU: {t.product_id})</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {t.transaction_type === 'out' ? (
                                                        <>
                                                            <span className="font-semibold text-slate-700 mr-2">
                                                                {godownMap[t.godown_id] || t.godown_id}
                                                            </span>
                                                            <span className="text-xs font-bold text-rose-600">(-{parseFloat(t.quantity).toLocaleString()})</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-semibold text-slate-700 mr-2">
                                                                {t.from_location ? (godownMap[t.from_location] || t.from_location) : '✨ New Stock'}
                                                            </span>
                                                            {t.from_location && (
                                                                <span className="text-xs font-bold text-amber-600">(-{parseFloat(t.quantity).toLocaleString()})</span>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {t.transaction_type === 'out' ? (
                                                        <span className="text-slate-400 italic font-medium">Dispatch / Out</span>
                                                    ) : (
                                                        <>
                                                            <span className="font-semibold text-slate-700 mr-2">{godownMap[t.godown_id] || t.godown_id}</span>
                                                            <span className="text-xs font-bold text-emerald-600">(+{parseFloat(t.quantity).toLocaleString()})</span>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-700 whitespace-nowrap">
                                                    {parseFloat(t.quantity).toLocaleString()} <span className="text-xs text-slate-400 font-normal">Bags</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-primary whitespace-nowrap">
                                                    {parseFloat(t.closing_stock || 0).toLocaleString()} <span className="text-[10px] text-primary/70 font-normal">Bags</span>
                                                </td>
                                                <td className="px-6 py-4 max-w-[200px] truncate">
                                                    <span className="text-xs text-slate-600">
                                                        {t.lr_number ? <span className="font-mono font-medium text-slate-600 mr-2">{t.lr_number}</span> : null}
                                                        <span className="text-slate-500" title={t.notes}>{t.notes}</span>
                                                        {!t.lr_number && !t.notes && <span className="text-slate-300 italic">--</span>}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button className="text-slate-400 hover:text-primary transition-colors flex items-center justify-center w-full">
                                                        <Eye size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                        <span className="text-sm font-medium text-slate-500">
                            Showing <span className="font-semibold text-slate-700">{filteredTransfers.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * ITEMS_PER_PAGE, filteredTransfers.length)}</span> of <span className="font-semibold text-slate-700">{filteredTransfers.length}</span> records
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                            >
                                Previous
                            </button>
                            <div className="flex items-center gap-1 px-2">
                                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                    let pageNum = currentPage;
                                    if (totalPages <= 5) pageNum = i + 1;
                                    else if (currentPage <= 3) pageNum = i + 1;
                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                    else pageNum = currentPage - 2 + i;

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={cn(
                                                "w-8 h-8 rounded-lg text-sm font-bold transition-all",
                                                currentPage === pageNum
                                                    ? "bg-primary text-white"
                                                    : "bg-white text-slate-600 hover:bg-slate-50 hover:text-primary"
                                            )}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drilldown Modal Overlay */}
            {isDetailModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 xl:p-6 animate-fadeIn">
                    <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 transform animate-slideUpScale">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                            <div className="flex flex-col gap-1">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Clock className="text-primary" size={18} />
                                    Product Ledger History
                                </h3>
                                {selectedTransferRow && productMap[selectedTransferRow.product_id] && (
                                    <p className="text-sm font-medium text-slate-500">
                                        Recent activity for <span className="font-semibold text-slate-700">{productMap[selectedTransferRow.product_id].name}</span> (SKU: {selectedTransferRow.product_id})
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setIsDetailModalOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                            {loadingDetails ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-4">
                                    <RefreshCw className="animate-spin text-primary" size={28} />
                                    <p className="text-sm font-semibold text-slate-500">Loading ledger records...</p>
                                </div>
                            ) : detailTransactions.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-3">
                                    <FileText className="text-slate-300" size={40} />
                                    <p className="text-sm font-bold text-slate-600">No transaction history found</p>
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                                                <th className="px-4 py-3 whitespace-nowrap">Date / ID</th>
                                                <th className="px-4 py-3 whitespace-nowrap">Type</th>
                                                <th className="px-4 py-3">Location Details</th>
                                                <th className="px-4 py-3 whitespace-nowrap text-right">Quantity</th>
                                                <th className="px-4 py-3 whitespace-nowrap text-right">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm bg-white">
                                            {detailTransactions.map((dt, idx) => {
                                                const isOutflow = dt.transaction_type === 'out' || dt.from_location;
                                                const isTransfer = dt.from_location && dt.godown_id;

                                                return (
                                                    <tr key={dt.entry_id || idx} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <div className="font-medium text-slate-700">{dt.date}</div>
                                                            <div className="font-mono text-[10px] text-slate-400 mt-0.5">{dt.entry_id}</div>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <span className={cn(
                                                                "px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border",
                                                                isTransfer ? "bg-blue-50 text-blue-600 border-blue-100" : (isOutflow ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100")
                                                            )}>
                                                                {isTransfer ? 'Transfer' : (isOutflow ? 'Dispatch Out' : 'Receipt In')}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {isTransfer ? (
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="font-semibold text-slate-700">{godownMap[dt.from_location] || dt.from_location}</span>
                                                                    <ArrowRight size={12} className="text-slate-400" />
                                                                    <span className="font-semibold text-slate-700">{godownMap[dt.godown_id] || dt.godown_id}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="text-xs font-semibold text-slate-700">
                                                                    {godownMap[dt.godown_id] || dt.godown_id || 'External Partner'}
                                                                </div>
                                                            )}
                                                            {(dt.lr_number || dt.notes) && (
                                                                <div className="text-[10px] text-slate-500 mt-1 flex flex-col gap-0.5">
                                                                    {dt.lr_number && <span><span className="font-semibold">LR:</span> <span className="font-mono">{dt.lr_number}</span></span>}
                                                                    {dt.notes && <span className="truncate max-w-[300px]" title={dt.notes}>{dt.notes}</span>}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                                            <span className={cn(
                                                                "font-bold",
                                                                isOutflow && !isTransfer ? "text-amber-600" : "text-emerald-600"
                                                            )}>
                                                                {isTransfer ? '' : (isOutflow ? '-' : '+')}{parseFloat(dt.quantity).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">Bags</span>
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                                            <span className="font-black text-primary">
                                                                {parseFloat(dt.computed_running_balance ?? dt.closing_stock ?? 0).toLocaleString()} <span className="text-[10px] font-normal text-primary/70">Bags</span>
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockMovement;
