import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, ArrowUp, Download, RefreshCcw } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

const BATCH_SIZE = 1000; // Supabase max rows per request — used for Godown Distribution
const PAGE_SIZE = 50;   // Rows per page — used for Detailed Metrics infinite scroll

const LiveStockDashboard = () => {
    const [activeTab, setActiveTab] = useState('master');
    // allProducts: full dataset (all batches) — used for Godown Distribution totals
    const [allProducts, setAllProducts] = useState([]);
    // products: paginated slice — used for Detailed Metrics with infinite scroll
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
    
    const today = new Date().toISOString().split('T')[0];
    const [summaryDate, setSummaryDate] = useState(today);
    const [dayTransactions, setDayTransactions] = useState([]);
    const [dailySnapshots, setDailySnapshots] = useState([]);
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [historicalBalances, setHistoricalBalances] = useState({});

    const isFutureDate = useMemo(() => summaryDate > today, [summaryDate, today]);

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

    // ─── Fetch ALL products (batch loop) ─────────────────────────────────────
    // Powers the Godown Distribution table — needs complete data for accurate totals.
    const fetchAllProducts = async () => {
        try {
            let accumulated = [];
            let batchIndex = 0;
            let done = false;

            while (!done) {
                let query = supabase
                    .from('products')
                    .select('godown_id, product_id, closing_quantity, opening_quantity')
                    .eq('is_active', true);

                if (filterGodown) query = query.eq('godown_id', filterGodown);

                const from = batchIndex * BATCH_SIZE;
                const to   = from + BATCH_SIZE - 1;

                const { data, error } = await query
                    .order('name', { ascending: true })
                    .range(from, to);

                if (error) throw error;

                accumulated = [...accumulated, ...(data || [])];

                if (!data || data.length < BATCH_SIZE) done = true;
                else batchIndex++;
            }

            setAllProducts(accumulated);
        } catch (error) {
            console.error('Error fetching all products:', error);
        }
    };

    // ─── Fetch paginated products ─────────────────────────────────────────────
    // Powers the Detailed Product Metrics table with infinite scroll.
    const fetchProducts = async (pageNumber, reset = false) => {
        if (reset) setLoading(true);
        else setLoadingMore(true);

        try {
            let query = supabase
                .from('products')
                .select('*', { count: 'exact' })
                .eq('is_active', true);

            if (searchTerm)   query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
            if (filterGodown) query = query.eq('godown_id', filterGodown);

            const { data, count, error } = await query
                .order('name', { ascending: true })
                .range(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE - 1);

            if (error) throw error;

            if (reset) {
                setProducts(data || []);
            } else {
                setProducts(prev => {
                    const existingKeys = new Set(prev.map(p => `${p.product_id}-${p.godown_id}`));
                    const unique = (data || []).filter(item => !existingKeys.has(`${item.product_id}-${item.godown_id}`));
                    return [...prev, ...unique];
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
            // Paginated fetch for Detailed Metrics
            fetchProducts(0, true);
            // Full fetch for Godown Distribution (runs in background, no loading spinner)
            fetchAllProducts();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, filterGodown, summaryDate]);

    // Fetch historical transactions up to summaryDate for accurate opening/closing computation
    useEffect(() => {
        const productIds = products.map(p => p.product_id);
        if (productIds.length === 0 || !summaryDate || isFutureDate) {
            setHistoricalBalances({});
            return;
        }
        let cancelled = false;
        const computeBalances = async () => {
            try {
                const { data, error } = await supabase
                    .from('stock_management')
                    .select('product_id, date, transaction_type, quantity, godown_id, from_location')
                    .in('product_id', productIds)
                    .lte('date', summaryDate)
                    .order('date', { ascending: true })
                    .order('created_at', { ascending: true });

                if (error || cancelled) return;

                // Compute running balance per (product_id, godown_id) pair.
                // Dual-entry transfers create a -SRC out entry for the source godown,
                // so the destination entry's from_location is NOT replayed here to avoid double-counting.
                const balances = {};
                (data || []).forEach(t => {
                    const key = `${t.product_id}-${t.godown_id}`;
                    if (!balances[key]) {
                        const prod = products.find(p => p.product_id === t.product_id && p.godown_id === t.godown_id);
                        balances[key] = parseFloat(prod?.opening_quantity) || 0;
                    }
                    const qty = parseFloat(t.quantity) || 0;
                    if (t.transaction_type === 'in') balances[key] += qty;
                    else balances[key] -= qty;
                });

                if (!cancelled) setHistoricalBalances(balances);
            } catch (err) {
                if (!cancelled) console.error('Error computing historical balances:', err);
            }
        };
        computeBalances();
        return () => { cancelled = true; };
    }, [products, summaryDate, isFutureDate]);

    // Infinite Scroll — triggers paginated fetchProducts
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
            const isToday = summaryDate === today;
            if (isFutureDate) {
                const godown = getGodownDetails(p.godown_id);
                return {
                    product_id: p.product_id,
                    product_name: p.name,
                    godown_id: p.godown_id,
                    godown_name: godown.name || p.godown_id,
                    mux: p.mux || '',
                    opening_stock: '-',
                    in_stock: '-',
                    out_stock: '-',
                    transfers: 0,
                    closing_stock: '-',
                    opening_quantity: 0,
                    closing_quantity: 0,
                };
            }

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

            let opening_stock, closing_stock, display_in, display_out;

            if (isToday) {
                // Live data for today
                display_in = in_stock;
                display_out = out_stock;
                closing_stock = p.closing_quantity;
                opening_stock = p.closing_quantity - in_stock + out_stock;
            } else if (snapshot) {
                // Snapshot data for past dates
                opening_stock = snapshot.opening_stock;
                closing_stock = snapshot.closing_stock;
                display_in = snapshot.in_stock;
                display_out = snapshot.out_stock;
            } else {
                // Historical computation from transactions up to summaryDate
                const histClosing = historicalBalances[`${p.product_id}-${p.godown_id}`];
                if (histClosing !== undefined) {
                    closing_stock = Math.max(0, histClosing);
                    opening_stock = Math.max(0, histClosing - in_stock + out_stock);
                } else {
                    opening_stock = '-';
                    closing_stock = '-';
                }
                display_in = in_stock;
                display_out = out_stock;
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
    }, [products, dayTransactions, summaryDate, godowns, dailySnapshots, historicalBalances]);

    // Server-side filtering already applies to dynamicSummary base (which depends on products)
    const filteredSummary = dynamicSummary;



    // Real-time subscription for relevant tables
    useEffect(() => {
        const stockChannel = supabase
            .channel('live-stock-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => { fetchProducts(0, true); fetchAllProducts(); }
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

    const handleExport = async () => {
        const toastId = toast.loading("Preparing export of all records...");
        try {
            let accumulated = [];
            let batchIndex = 0;
            let done = false;
            const EXPORT_BATCH_SIZE = 1000;

            while (!done) {
                let query = supabase
                    .from('products')
                    .select('name, product_type, closing_quantity, godown_name, godown_id')
                    .eq('is_active', true);

                if (searchTerm) {
                    query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
                }
                if (filterGodown) {
                    query = query.eq('godown_id', filterGodown);
                }

                const from = batchIndex * EXPORT_BATCH_SIZE;
                const to = from + EXPORT_BATCH_SIZE - 1;

                const { data, error } = await query
                    .order('name', { ascending: true })
                    .range(from, to);

                if (error) throw error;

                accumulated = [...accumulated, ...(data || [])];

                if (!data || data.length < EXPORT_BATCH_SIZE) {
                    done = true;
                } else {
                    batchIndex++;
                }
            }

            if (accumulated.length === 0) {
                toast.error("No data found to export", { id: toastId });
                return;
            }

            const headers = ["Godown Name", "Product Name", "Product Type", "Closing Quantity"];
            const rows = accumulated.map(p => {
                const godown = godowns.find(g => g.godown_id === p.godown_id) || {};
                const gName = godown.name || p.godown_name || p.godown_id || 'Not Assigned';
                return [
                    gName,
                    p.name || '',
                    p.product_type || '',
                    p.closing_quantity ?? 0
                ];
            });

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(","))
                .join("\n");

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Stock_Report_${summaryDate}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Exported ${accumulated.length} records successfully!`, { id: toastId });
        } catch (error) {
            console.error('Error during export:', error);
            toast.error('Failed to export data: ' + error.message, { id: toastId });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col">
            {/* Minimal Sticky Header */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-6 py-4">
                <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Package size={22} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
                                Stock <span className="text-primary">Dashboard</span>
                            </h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1.5">
                                Inventory Intelligence & Control
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 ml-auto">
                        <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                            <button
                                onClick={() => setActiveTab('master')}
                                className={cn(
                                    "px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200",
                                    activeTab === 'master' 
                                        ? "bg-white text-primary shadow-sm" 
                                        : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                                )}
                            >
                                Master Inventory
                            </button>
                            <button
                                onClick={() => setActiveTab('live')}
                                className={cn(
                                    "px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200",
                                    activeTab === 'live' 
                                        ? "bg-white text-primary shadow-sm" 
                                        : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                                )}
                            >
                                Live Status
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="hidden sm:flex flex-col text-right px-4 border-r border-slate-200">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Assets</p>
                                <p className="text-sm font-black text-slate-900">{totalProducts.toLocaleString()}</p>
                            </div>
                            <button
                                onClick={() => { fetchGodownsAndTransactions(); fetchProducts(0, true); }}
                                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-all shadow-sm group"
                            >
                                <RefreshCcw size={18} className={cn(loading && "animate-spin", "group-hover:scale-110 transition-transform")} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
                {/* Global Controls */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex flex-col lg:flex-row items-center gap-4">
                    <div className="flex flex-col sm:flex-row flex-1 items-center gap-4 w-full">
                        <div className="relative w-full sm:flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <Input
                                type="text"
                                placeholder="Search products, IDs or attributes..."
                                className="pl-11 h-11 bg-slate-50/50 border-slate-200 focus:bg-white transition-all rounded-xl text-sm font-medium w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-1 h-11 w-full sm:w-auto justify-between sm:justify-start shrink-0">
                            <div className="flex-1 sm:flex-initial px-3 border-r border-slate-200 flex items-center justify-center sm:justify-start gap-2">
                                <MapPin size={14} className="text-primary" />
                                <select
                                    value={filterGodown}
                                    onChange={(e) => setFilterGodown(e.target.value)}
                                    className="bg-transparent text-xs font-black text-slate-700 focus:outline-none uppercase tracking-wider min-w-[120px] sm:min-w-[140px] cursor-pointer"
                                >
                                    <option value="">ALL GODOWNS</option>
                                    {godowns.map(g => (
                                        <option key={g.godown_id} value={g.godown_id}>{g.name.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 sm:flex-initial w-[130px] sm:w-[140px]">
                                <DatePicker
                                    value={summaryDate}
                                    onChange={(e) => setSummaryDate(e.target.value)}
                                    name="summaryDate"
                                    className="border-none bg-transparent h-9 text-xs font-bold text-slate-700 text-center sm:text-left"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto">
                        <button
                            onClick={handleExport}
                            className="h-11 px-6 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2 group w-full lg:w-auto"
                        >
                            <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                            Export Report
                        </button>
                    </div>
                </div>

                {activeTab === 'master' && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                        {/* Godown-wise Aggregated Summary Table */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <MapPin size={16} className="text-primary" />
                                    Godown Distribution
                                </h2>
                            </div>
                            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Godown Location</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Opening</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock In</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock Out</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closing</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Transfers</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {godowns.filter(g => !filterGodown || g.godown_id === filterGodown).map(godown => {
                                                if (isFutureDate) {
                                                    return (
                                                        <tr key={godown.godown_id} className="group hover:bg-slate-50/80 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                        <MapPin size={14} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-slate-900 leading-none">{godown.name}</p>
                                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{godown.city}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                        </tr>
                                                    );
                                                }
                                                const directIn = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                                const directOut = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                                const outgoingTransfers = dayTransactions.filter(t => t.from_location === godown.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                                const totalIn = directIn;
                                                const totalOut = directOut + outgoingTransfers;
                                                // Use allProducts (complete dataset) for accurate godown totals
                                                const gProducts = allProducts.filter(p => p.godown_id === godown.godown_id);
                                                const totalClosing = gProducts.reduce((sum, p) => sum + (parseFloat(p.closing_quantity) || 0), 0);
                                                const totalOpening = totalClosing - totalIn + totalOut;
                                                const isToday = summaryDate === today;

                                                // Snapshot-based aggregates for past dates
                                                const gSnapshots = dailySnapshots.filter(s => s.godown_id === godown.godown_id);
                                                const hasSnapshots = gSnapshots.length > 0;
                                                const snapOpening = gSnapshots.reduce((s, sn) => s + (parseFloat(sn.opening_stock) || 0), 0);
                                                const snapClosing = gSnapshots.reduce((s, sn) => s + (parseFloat(sn.closing_stock) || 0), 0);
                                                const snapIn = gSnapshots.reduce((s, sn) => s + (parseFloat(sn.in_stock) || 0), 0);
                                                const snapOut = gSnapshots.reduce((s, sn) => s + (parseFloat(sn.out_stock) || 0), 0);
                                                // Fall back to live transaction data when no snapshots exist yet
                                                const displayOpening = isToday ? totalOpening : (hasSnapshots ? snapOpening : totalOpening);
                                                const displayClosing = isToday ? totalClosing : (hasSnapshots ? snapClosing : totalClosing);
                                                const displayIn = isToday ? totalIn : (hasSnapshots ? snapIn : totalIn);
                                                const displayOut = isToday ? totalOut : (hasSnapshots ? snapOut : totalOut);

                                                return (
                                                    <tr key={godown.godown_id} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                    <MapPin size={14} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900 leading-none">{godown.name}</p>
                                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{godown.city}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-mono text-xs text-slate-600">
                                                            {displayOpening.toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">+{displayIn.toLocaleString()}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-md">-{displayOut.toLocaleString()}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center text-sm font-black text-slate-900">
                                                            {displayClosing.toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                onClick={() => setSelectedTransfer({ type: 'godown', id: godown.godown_id, name: godown.name })}
                                                                className={cn(
                                                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all",
                                                                    (dayTransactions.filter(t => t.godown_id === godown.godown_id && t.from_location).length > 0 ||
                                                                        dayTransactions.filter(t => t.from_location === godown.godown_id).length > 0)
                                                                        ? "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                                                                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
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
                        </section>

                        {/* Detailed Metrics Table */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <Package size={16} className="text-primary" />
                                    Detailed Product Metrics
                                </h2>
                                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-tighter">
                                    Showing {filteredSummary.length} Records
                                </span>
                            </div>
                            
                            {loading ? (
                                <div className="bg-white rounded-3xl border border-slate-200/60 p-12 text-center">
                                    <RefreshCcw size={32} className="animate-spin text-primary/30 mx-auto mb-4" />
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Aggregating real-time data...</p>
                                </div>
                            ) : filteredSummary.length > 0 ? (
                                <React.Fragment>
                                    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Details</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Opening</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closing</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">In</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Out</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Transfers</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {filteredSummary.map((s, idx) => (
                                                        <tr key={`${s.godown_id}-${s.product_id}-${idx}`} className="group hover:bg-slate-50/80 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-[10px] group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                        {s.product_name.charAt(0)}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-slate-900 leading-none">{s.product_name}</p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{s.product_id}</span>
                                                                            {s.mux && <span className="text-[10px] font-black text-primary px-1.5 py-0.5 bg-primary/5 rounded">MUX: {s.mux}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider">{s.godown_name}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center font-mono text-xs text-slate-500">{s.opening_stock ?? '-'}</td>
                                                            <td className="px-6 py-4 text-center font-mono text-xs font-black text-slate-900">{s.closing_stock ?? '-'}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className="text-xs font-black text-emerald-600">{s.in_stock === '-' ? '-' : `+${s.in_stock}`}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className="text-xs font-black text-rose-600">{s.out_stock === '-' ? '-' : `-${s.out_stock}`}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <button
                                                                    onClick={() => setSelectedTransfer({ type: 'product', id: s.product_id, godown_id: s.godown_id, name: s.product_name })}
                                                                    className={cn(
                                                                        "px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all",
                                                                        s.transfers > 0 ? "bg-slate-900 text-white hover:scale-105" : "bg-slate-100 text-slate-300"
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
                                    {hasMore && (
                                        <button 
                                            onClick={() => fetchProducts(page + 1)}
                                            disabled={loadingMore}
                                            className="w-full py-4 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-primary transition-all mt-4 rounded-xl border border-dashed border-slate-200"
                                        >
                                            {loadingMore ? 'Fetching More Metrics...' : 'Load More Records'}
                                        </button>
                                    )}
                                </React.Fragment>
                            ) : (
                                <div className="bg-white rounded-3xl border border-slate-200/60 p-16 text-center space-y-4">
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                                        <RotateCcw size={32} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-lg font-bold text-slate-900">Quiet Day in Inventory</p>
                                        <p className="text-xs text-slate-400 max-w-xs mx-auto font-medium">No transactions were recorded for the selected date and filters. Try exploring other dates or godowns.</p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {activeTab === 'live' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <RotateCcw size={16} className="text-primary animate-spin-slow" />
                                Live Availability
                            </h2>
                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-primary text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={cn("p-2 rounded-lg transition-all", viewMode === 'table' ? "bg-primary text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="h-64 bg-white rounded-3xl border border-slate-200 animate-pulse" />
                                ))}
                            </div>
                        ) : filteredStock.length === 0 ? (
                            <div className="bg-white rounded-3xl border border-slate-200/60 p-20 text-center space-y-4">
                                <Search size={48} className="text-slate-200 mx-auto" />
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No matching products found</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {filteredStock.map((stock) => (
                                        <StockCard
                                            key={`${stock.product_id}-${stock.godown_id}`}
                                            stock={stock}
                                        />
                                    ))}
                                </div>
                                {hasMore && (
                                    <button 
                                        onClick={() => fetchProducts(page + 1)}
                                        disabled={loadingMore}
                                        className="w-full py-4 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest hover:border-primary/30 hover:text-primary transition-all disabled:opacity-50"
                                    >
                                        {loadingMore ? 'Loading Assets...' : 'Load More Inventory'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">MUX</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Units</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Mass (KG)</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Opening</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closing</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {filteredStock.map((stock) => (
                                                <tr key={`${stock.product_id}-${stock.godown_id}`} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                                                <Package size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-slate-900 leading-none">{stock.product_name}</p>
                                                                <p className="text-[10px] text-slate-400 font-mono tracking-tighter mt-1">{stock.product_id}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <MapPin size={12} className="text-slate-400" />
                                                            <span className="text-xs font-black text-slate-600 uppercase tracking-tight">{stock.godown_name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-900">{stock.mux || '-'}</td>
                                                    <td className="px-6 py-4 text-center font-black text-slate-900">{stock.current_stock}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="px-3 py-1 bg-primary/5 text-primary text-xs font-black rounded-lg border border-primary/10">
                                                            {((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(3)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-mono text-xs text-slate-400">{stock.opening_quantity}</td>
                                                    <td className="px-6 py-4 text-center font-mono text-xs font-black text-slate-900">{stock.closing_quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {hasMore && (
                                    <button 
                                        onClick={() => fetchProducts(page + 1)}
                                        disabled={loadingMore}
                                        className="w-full py-4 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-primary transition-all"
                                    >
                                        {loadingMore ? 'Fetching...' : 'Show More Data'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>




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
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200/60 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 group flex flex-col h-full overflow-hidden relative">
            {/* Glossy Overlay effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors duration-500" />
            
            {/* Header */}
            <div className="flex items-start justify-between mb-6 shrink-0 relative z-10">
                <div className="flex flex-col gap-1">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.1em] border w-fit", levelBg[stockLevel])}>
                        {stockLevel === 'high' ? 'Optimal' : stockLevel === 'medium' ? 'Review' : 'Action Required'}
                    </span>
                    <div className="flex items-center gap-1.5 text-slate-400 mt-2">
                        <MapPin size={10} strokeWidth={3} className="text-primary/60" />
                        <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-[100px]">{stock.godown_name}</span>
                    </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-500">
                    <Package size={24} strokeWidth={1.5} />
                </div>
            </div>

            {/* Product Name */}
            <div className="mb-6 min-h-[3rem] relative z-10">
                <h3 className="font-black text-slate-900 text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                    {stock.product_name}
                </h3>
                <p className="text-[10px] font-mono text-slate-300 mt-1 uppercase tracking-tighter">{stock.product_id}</p>
            </div>

            {/* Metrics Visualization */}
            <div className="space-y-6 relative z-10">
                <div className="flex items-end justify-between gap-4">
                    <div className="flex flex-col">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Net Inventory</p>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-slate-900 tracking-tighter">{stock.current_stock}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">Units</span>
                        </div>
                    </div>
                    <div className="flex flex-col text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Calculated Mass</p>
                        <div className="flex items-baseline justify-end gap-1.5">
                            <span className="text-xl font-black text-primary tracking-tighter">{weight}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase">KG</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full transition-all duration-1000 ease-out", levelColors[stockLevel])}
                        style={{ width: `${Math.min(100, Math.max(5, (stock.current_stock / 250) * 100))}%` }}
                    />
                </div>
            </div>

            {/* Footer Metadata */}
            <div className="mt-auto pt-6 flex items-center justify-between border-t border-slate-50 relative z-10">
                <div className="flex gap-4">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Opening</span>
                        <span className="text-xs font-bold text-slate-500 mt-0.5">{stock.opening_quantity}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Closing</span>
                        <span className="text-xs font-black text-slate-900 mt-0.5">{stock.closing_quantity}</span>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-[9px] font-black text-slate-900 px-2 py-1 bg-slate-100 rounded-lg uppercase tracking-tight">MUX: {stock.mux || '0.00'}</span>
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
