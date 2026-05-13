import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, ArrowUp, Download, RefreshCcw } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const LiveStockDashboard = () => {
    const [activeTab, setActiveTab] = useState('master');
    const [products, setProducts] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGodown, setFilterGodown] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [totalProducts, setTotalProducts] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [dayTransactions, setDayTransactions] = useState([]);
    const [dailySnapshots, setDailySnapshots] = useState([]);
    const [selectedTransfer, setSelectedTransfer] = useState(null);

    const fetchGodownsAndTransactions = async () => {
        try {
            const [godownsRes, transactionsRes, snapshotsRes, prodNamesRes] = await Promise.all([
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('stock_management').select('*').eq('date', summaryDate),
                supabase.from('daily_stock_summary').select('*').eq('date', summaryDate),
                supabase.from('products').select('product_id, name').eq('is_active', true)
            ]);

            const godownsData = godownsRes.data || [];
            setGodowns(godownsData);
            setDailySnapshots(snapshotsRes.data || []);

            const lookupProducts = prodNamesRes.data || [];
            const flattenedTransactions = (transactionsRes.data || []).map(t => {
                const prod = lookupProducts.find(p => p.product_id === t.product_id);
                return {
                    ...t,
                    product_name: prod?.name || t.product_name || 'Unknown Product'
                };
            });
            setDayTransactions(flattenedTransactions);
        } catch (error) {
            console.error('Error fetching static data:', error);
            toast.error('Failed to fetch auxiliary data');
        }
    };

    const fetchProducts = async (pageNumber, reset = false) => {
        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true);
            
            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
            }
            if (filterGodown) {
                query = query.eq('godown_id', filterGodown);
            }

            const { data, count, error } = await query
                .order('name', { ascending: true })
                .range(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            if (reset) {
                setProducts(data || []);
            } else {
                setProducts(prev => {
                    const newItems = data || [];
                    const existingIds = new Set(prev.map(p => p.product_id));
                    const uniqueNewItems = newItems.filter(item => !existingIds.has(item.product_id));
                    return [...prev, ...uniqueNewItems];
                });
            }
            setTotalProducts(count || 0);
            setHasMore((data || []).length === PAGE_SIZE && (pageNumber + 1) * PAGE_SIZE < count);
            setPage(pageNumber);
        } catch (error) {
            console.error('Error fetching products:', error);
            toast.error('Failed to fetch products');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchGodownsAndTransactions();
    }, [summaryDate]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts(0, true);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, filterGodown, summaryDate]);

    // Handle Infinite Scroll
    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 100) {
                if (hasMore && !loadingMore && !loading) {
                    fetchProducts(page + 1, false);
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [hasMore, loadingMore, loading, page, searchTerm, filterGodown]);

    const getGodownDetails = (godownId) => godowns.find(g => g.godown_id === godownId) || {};

    const enrichedStock = useMemo(() => {
        return products.map(product => {
            const godown = getGodownDetails(product.godown_id);
            return {
                ...product,
                product_name: product.name,
                product_unit: product.unit || '',
                mux: product.mux || '',
                godown_name: godown.name || product.godown_id || 'Not Assigned',
                current_stock: parseFloat(product.closing_quantity) || 0,
                opening_quantity: product.opening_quantity || 0,
                closing_quantity: product.closing_quantity || 0,
            };
        });
    }, [products, godowns]);

    // Since filtering is done server-side now, filteredStock is just enrichedStock
    const filteredStock = enrichedStock;


    // Dynamic Master Summary Logic
    const dynamicSummary = useMemo(() => {
        return products.map(p => {
            const isToday = summaryDate === new Date().toISOString().split('T')[0];

            // 1. Try to find the snapshot for this specific date
            const snapshot = dailySnapshots.find(s => s.product_id === p.product_id && s.godown_id === p.godown_id);

            // 2. Real-time calculations for Today (if snapshot isn't available or for live feel)
            const pTransactions = dayTransactions.filter(t =>
                (t.godown_id === p.godown_id && t.product_id === p.product_id) ||
                (t.from_location === p.godown_id && t.product_name === p.name)
            ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            const in_stock = pTransactions.filter(t => t.godown_id === p.godown_id && t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            const out_stock = pTransactions.filter(t => t.transaction_type === 'out' && t.godown_id === p.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0) +
                pTransactions.filter(t => t.from_location === p.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);

            let opening_stock = snapshot ? snapshot.opening_stock : '-';
            let closing_stock = snapshot ? snapshot.closing_stock : '-';
            let display_in = snapshot ? snapshot.in_stock : in_stock;
            let display_out = snapshot ? snapshot.out_stock : out_stock;

            // Priority logic for Today
            if (isToday) {
                display_in = in_stock;
                display_out = out_stock;
                
                // Dynamically calculate opening and closing stock for today 
                // to perfectly reflect any edits made to the master product opening quantity
                closing_stock = p.closing_quantity;
                opening_stock = p.closing_quantity - in_stock + out_stock;
            }

            const godown = getGodownDetails(p.godown_id);
            const pTransfers = pTransactions.filter(t => t.from_location || (t.godown_id === p.godown_id && t.from_location));

            return {
                product_id: p.product_id,
                product_name: p.name,
                godown_id: p.godown_id,
                godown_name: godown.name || p.godown_id,
                mux: p.mux || '',
                opening_stock: opening_stock ?? '-',
                in_stock: display_in,
                out_stock: display_out,
                transfers: pTransfers.length > 0
                    ? pTransfers.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)
                    : 0,
                closing_stock: closing_stock ?? '-',
                opening_quantity: p.opening_quantity || 0,
                closing_quantity: p.closing_quantity || 0,
            };
        });
    }, [products, dayTransactions, summaryDate, godowns, dailySnapshots]);

    // Server-side filtering already applies to dynamicSummary base (which depends on products)
    const filteredSummary = dynamicSummary;



    // Real-time subscription for relevant tables
    useEffect(() => {
        const stockChannel = supabase
            .channel('live-stock-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => fetchProducts(0, true)
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'godowns' },
                () => fetchGodownsAndTransactions()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'stock_management' },
                () => fetchGodownsAndTransactions()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(stockChannel);
        };
    }, [summaryDate, searchTerm, filterGodown]);

    const handleExport = () => {
        const headers = ["Godown", "Product", "MUX", "Opening", "In", "Out", "Closing", "Transfers"];
        const rows = filteredSummary.map(s => [
            s.godown_name,
            s.product_name,
            s.mux || '-',
            s.opening_stock === '-' ? 0 : s.opening_stock,
            s.in_stock,
            s.out_stock,
            s.closing_stock === '-' ? 0 : s.closing_stock,
            s.transfers
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Stock_Summary_${summaryDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported data for ${summaryDate}`);
    };

    return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Premium Header */}
      <div className="flex flex-col gap-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Stock <span className="text-primary">Dashboard</span>
            </h1>
            <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest border border-slate-200/60">
                    Total: {totalProducts} Products
                </span>
                <span className="px-3 py-1 bg-primary/5 rounded-lg text-[10px] font-black text-primary uppercase tracking-widest border border-primary/10">
                    Live Status
                </span>
            </div>
          </div>
          
          <div className="flex p-1 bg-slate-100 rounded-xl shadow-inner">
            <button
              onClick={() => setActiveTab('master')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'master' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Master Inventory
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'live' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Live Stock
            </button>

          </div>
        </div>
      </div>

            {activeTab === 'master' && (
                <div className="flex flex-col gap-4">
                    {/* Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        <div className="md:col-span-2 flex items-center gap-3">
                            <button
                                onClick={() => { fetchGodownsAndTransactions(); fetchProducts(0, true); }}
                                className="erp-btn-primary h-[42px] px-6"
                            >
                                <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> Refresh
                            </button>
                            <div className="w-[200px]">
                                <DatePicker
                                    value={summaryDate}
                                    onChange={(e) => setSummaryDate(e.target.value)}
                                    name="summaryDate"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2 flex items-center justify-end gap-3">
                            <button
                                onClick={handleExport}
                                disabled={!summaryDate}
                                className="erp-btn-secondary h-[42px]"
                            >
                                <Download size={16} /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Godown-wise Aggregated Summary Table */}
                    <div className="erp-table-container max-w-[1400px] mx-auto">
                        <div className="overflow-x-auto">
                            <table className="erp-table">
                                <thead className="erp-table-thead">
                                    <tr className="erp-table-tr">
                                        <th className="erp-table-th">Godown Name</th>
                                        <th className="erp-table-th text-center">Opening</th>
                                        <th className="erp-table-th text-center">In</th>
                                        <th className="erp-table-th text-center">Out</th>
                                        <th className="erp-table-th text-center font-black">Closing</th>
                                        <th className="erp-table-th text-center">Transfers</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {godowns.map(godown => {
                                        // Total IN = Direct In + Incoming Transfers
                                        const directIn = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);

                                        // Total OUT = Direct Out + Outgoing Transfers
                                        const directOut = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                        const outgoingTransfers = dayTransactions.filter(t => t.from_location === godown.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);

                                        const totalIn = directIn; // Direct In already includes transfers (since they are 'in' at godown_id)
                                        const totalOut = directOut + outgoingTransfers;

                                        const gProducts = products.filter(p => p.godown_id === godown.godown_id);
                                        const totalClosing = gProducts.reduce((sum, p) => sum + (parseFloat(p.closing_quantity) || 0), 0);
                                        const totalOpening = totalClosing - totalIn + totalOut;
                                        const isToday = summaryDate === new Date().toISOString().split('T')[0];

                                        return (
                                            <tr key={godown.godown_id} className="erp-table-tr group">
                                                <td className="erp-table-td">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={14} className="text-primary" />
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900">{godown.name}</p>
                                                            <p className="text-[10px] text-slate-400 font-semibold uppercase">{godown.city}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="erp-table-td text-center font-semibold">{isToday ? totalOpening.toLocaleString() : '-'}</td>
                                                <td className="erp-table-td text-center font-bold text-emerald-600">+{totalIn.toLocaleString()}</td>
                                                <td className="erp-table-td text-center font-bold text-rose-600">-{totalOut.toLocaleString()}</td>
                                                <td className="erp-table-td text-center font-bold text-slate-900">{isToday ? totalClosing.toLocaleString() : '-'}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setSelectedTransfer({ type: 'godown', id: godown.godown_id, name: godown.name })}
                                                        className={cn(
                                                            "text-sm font-medium px-2 py-1 rounded-md transition-colors",
                                                            (dayTransactions.filter(t => t.godown_id === godown.godown_id && t.from_location).length > 0 ||
                                                                dayTransactions.filter(t => t.from_location === godown.godown_id).length > 0)
                                                                ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                                : "text-slate-400 cursor-default"
                                                        )}
                                                    >
                                                        {(dayTransactions.filter(t => t.godown_id === godown.godown_id && t.from_location).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0) +
                                                            dayTransactions.filter(t => t.from_location === godown.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)).toLocaleString()}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Dynamic Summary Table */}
                    {loading ? (
                        <div className="erp-card py-12 text-center text-slate-400">
                            Loading Stock Metrics...
                        </div>
                    ) : filteredSummary.length > 0 ? (
                        <div className="erp-table-container max-w-[1400px] mx-auto">
                            <div className="overflow-x-auto">
                                <table className="erp-table">
                                    <thead className="erp-table-thead">
                                        <tr className="erp-table-tr">
                                            <th className="erp-table-th">Godown</th>
                                            <th className="erp-table-th">Product Details</th>
                                            <th className="erp-table-th text-center">Opening (KG)</th>
                                            <th className="erp-table-th text-center font-black">Closing (KG)</th>
                                            <th className="erp-table-th text-center">In</th>
                                            <th className="erp-table-th text-center">Out</th>
                                            <th className="erp-table-th text-center">Transfers</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSummary.map((s, idx) => (
                                            <tr key={`${s.godown_id}-${s.product_id}-${idx}`} className="erp-table-tr">
                                                <td className="erp-table-td text-xs font-semibold text-slate-500 uppercase">{s.godown_name}</td>
                                                <td className="erp-table-td text-sm font-bold text-slate-900">{s.product_name}</td>
                                                <td className="erp-table-td text-center text-slate-500">{s.opening_quantity}</td>
                                                <td className="erp-table-td text-center font-bold text-slate-900">{s.closing_quantity}</td>
                                                <td className="erp-table-td text-center font-bold text-emerald-600">+{s.in_stock}</td>
                                                <td className="erp-table-td text-center font-bold text-rose-600">-{s.out_stock}</td>
                                                <td className="erp-table-td text-center">
                                                    <button
                                                        onClick={() => setSelectedTransfer({ type: 'product', id: s.product_id, godown_id: s.godown_id, name: s.product_name })}
                                                        className={cn(
                                                            "text-xs font-bold px-2 py-1 rounded-md transition-all",
                                                            s.transfers > 0 ? "bg-slate-100 text-primary hover:bg-primary hover:text-white" : "text-slate-300"
                                                        )}
                                                    >
                                                        {s.transfers}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-3">
                            <RotateCcw size={40} className="mx-auto text-slate-300 mb-2" />
                            <p className="font-medium text-slate-900">No transactions recorded for this date</p>
                            <p className="text-xs max-w-xs mx-auto">Try selecting a different date or check live stock tab for current inventory.</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'live' && (
                <div className="flex flex-col gap-4">
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                            <Input
                                type="text"
                                placeholder="Search stock..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={filterGodown}
                                onChange={(e) => setFilterGodown(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none"
                            >
                                <option value="">All Godowns</option>
                                {godowns.map(g => (
                                    <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                ))}
                            </select>

                            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
                                >
                                    <span className="sr-only">Grid</span>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`p-2 ${viewMode === 'table' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
                                >
                                    <span className="sr-only">Table</span>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-20 text-slate-500">Loading...</div>
                    ) : filteredStock.length === 0 ? (
                        <div className="text-center py-20 text-slate-500">No stock data found.</div>
                    ) : viewMode === 'grid' ? (
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredStock.map((stock) => (
                                    <StockCard
                                        key={`${stock.product_id}-${stock.godown_id}`}
                                        stock={stock}
                                    />
                                ))}
                            </div>
                            {loadingMore && (
                                <div className="text-center py-4 text-slate-500">
                                    Loading more products...
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="erp-table-container">
                            <div className="overflow-x-auto">
                                <table className="erp-table">
                                    <thead className="erp-table-thead">
                                        <tr className="erp-table-tr">
                                            <HeaderCell>Product</HeaderCell>
                                            <HeaderCell>Godown</HeaderCell>
                                            <HeaderCell align="center">MUX</HeaderCell>
                                            <HeaderCell align="center">Units</HeaderCell>
                                            <HeaderCell align="center">Weight (KG)</HeaderCell>
                                            <HeaderCell align="center">Opening (KG)</HeaderCell>
                                            <HeaderCell align="center">Closing (KG)</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredStock.map((stock) => (
                                            <tr key={`${stock.product_id}-${stock.godown_id}`} className="erp-table-tr">
                                                <td className="erp-table-td">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary font-black text-xs border border-slate-200 overflow-hidden shrink-0">
                                                            <Package size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900">{stock.product_name}</p>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stock.product_id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="erp-table-td">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={12} className="text-primary" />
                                                        <span className="text-sm text-slate-600 font-bold">{stock.godown_name}</span>
                                                    </div>
                                                </td>
                                                <td className="erp-table-td text-center font-bold text-slate-900">{stock.mux || '-'}</td>
                                                <td className="erp-table-td text-center font-black text-slate-900">{stock.current_stock}</td>
                                                <td className="erp-table-td text-center">
                                                    <span className="px-3 py-1 bg-primary/5 text-primary font-black rounded-lg border border-primary/10">
                                                        {((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(3)}
                                                    </span>
                                                </td>
                                                <td className="erp-table-td text-center font-medium text-slate-500">{stock.opening_quantity}</td>
                                                <td className="erp-table-td text-center font-black text-slate-900">{stock.closing_quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {loadingMore && (
                                    <div className="text-center py-4 text-slate-500">
                                        Loading more products...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}




            {selectedTransfer && (
                <TransferModal
                    details={selectedTransfer}
                    transactions={dayTransactions}
                    godowns={godowns}
                    products={products}
                    onClose={() => setSelectedTransfer(null)}
                />
            )}

        </div>
    );
};

export default LiveStockDashboard;

const StockCard = ({ stock }) => {
    const stockLevel = stock.current_stock > 100 ? 'high' : stock.current_stock > 10 ? 'medium' : 'low';

    const levelColors = {
        high: 'bg-emerald-500',
        medium: 'bg-amber-500',
        low: 'bg-rose-500'
    };

    const levelBg = {
        high: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        medium: 'bg-amber-50 text-amber-700 border-amber-100',
        low: 'bg-rose-50 text-rose-700 border-rose-100'
    };

    const weight = ((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(2);

    return (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border", levelBg[stockLevel])}>
                        {stockLevel === 'high' ? 'Healthy' : stockLevel === 'medium' ? 'Review' : 'Critical'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded">
                        Live
                    </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    <MapPin size={10} strokeWidth={3} />
                    <span className="text-[9px] font-black uppercase tracking-tight truncate max-w-[80px]">{stock.godown_name}</span>
                </div>
            </div>

            {/* Product Name - Fixed height for alignment */}
            <div className="mb-4 min-h-[2.5rem]">
                <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {stock.product_name}
                </h3>
            </div>

            {/* Availability Grid - More flexible to prevent overflow */}
            <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                <div className="flex flex-col min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Available Pcs</p>
                    <div className="flex items-baseline gap-1 min-w-0 overflow-hidden">
                        <span className="text-2xl font-black text-slate-900 tracking-tighter truncate">{stock.current_stock}</span>
                    </div>
                </div>
                <div className="flex flex-col border-l border-slate-200 pl-4 min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">Net Weight</p>
                    <div className="flex flex-col min-w-0">
                        <span className="text-lg font-black text-primary tracking-tighter truncate leading-tight">
                            {weight}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">KG</span>
                    </div>
                </div>
            </div>

            {/* Footer Data */}
            <div className="mt-auto space-y-3 pt-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Opening</span>
                        <span className="text-[11px] font-bold text-slate-600 mt-0.5 truncate">{stock.opening_quantity} KG</span>
                    </div>
                    <div className="flex flex-col text-right min-w-0">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">Closing</span>
                        <span className="text-[11px] font-black text-slate-900 mt-0.5 truncate">{stock.closing_quantity} KG</span>
                    </div>
                </div>
                
                {/* Level Indicator */}
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full transition-all duration-1000", levelColors[stockLevel])}
                        style={{ width: `${Math.min(100, Math.max(0, (stock.current_stock / 200) * 100))}%` }}
                    />
                </div>
                
                <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-tighter shrink-0 pt-1">
                    <span className="truncate mr-2">MUX: {stock.mux || '-'}</span>
                    <span className="shrink-0">Synced Now</span>
                </div>
            </div>
        </div>
    );
};

const HeaderCell = ({ children, align = "left" }) => (
    <th className={cn(`erp-table-th`, align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
        {children}
    </th>
);

const TransferModal = ({ details, transactions, godowns, products, onClose }) => {
    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;

    const filteredTransfers = useMemo(() => {
        // Match by NAME for product transfers to catch all legs of the transfer
        if (details.type === 'godown') {
            return transactions.filter(t => t.from_location === details.id || (t.godown_id === details.id && t.from_location));
        } else {
            return transactions.filter(t => t.product_name === details.name && (t.from_location === details.godown_id || (t.godown_id === details.godown_id && t.from_location)));
        }
    }, [details, transactions]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                            <RotateCcw size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Stock Transfers</h2>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{details.name}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X size={20} />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredTransfers.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No transfers recorded for this selection.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <HeaderCell>Product</HeaderCell>
                                        <HeaderCell>From</HeaderCell>
                                        <HeaderCell>To</HeaderCell>
                                        <HeaderCell align="right">Quantity</HeaderCell>
                                        <HeaderCell align="center">Type</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredTransfers.map((t, idx) => {
                                        const isOut = t.from_location === (details.type === 'godown' ? details.id : details.godown_id);
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-slate-900">{t.product_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">{t.product_id}</p>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 font-medium">
                                                    {getGodownName(t.from_location)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 font-medium">
                                                    {getGodownName(t.godown_id)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={cn(
                                                        "text-sm font-black tracking-tight",
                                                        isOut ? "text-amber-600" : "text-emerald-600"
                                                    )}>
                                                        {isOut ? '-' : '+'}{t.quantity}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                                        isOut ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                    )}>
                                                        {isOut ? 'Stock Out' : 'Stock In'}
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

                <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                    <Button onClick={onClose} className="px-6 rounded-xl">Close</Button>
                </div>
            </div>
        </div>
    );
};
