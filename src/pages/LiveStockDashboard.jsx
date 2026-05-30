import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, Download, RefreshCcw, Save } from 'lucide-react';
import { liveStockDashboardService } from '../services/liveStockDashboardService';
import { stockManagementService } from '../services/stockManagementService';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

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
    const [summaryDate, setSummaryDate] = useState(() => localStorage.getItem('vpr_summaryDate') || today);
    const [dayTransactions, setDayTransactions] = useState([]);
    const [futureTransactions, setFutureTransactions] = useState([]);
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [expandedTxRows, setExpandedTxRows] = useState({});
    const [productTxMap, setProductTxMap] = useState({});
    const [changedRows, setChangedRows] = useState({});
    const [edits, setEdits] = useState({});
    const [txEdits, setTxEdits] = useState({});
    const [txErrors, setTxErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const handleTxQuantityEdit = (productId, godownId, entryId, value) => {
        const raw = parseFloat(value);
        const num = isNaN(raw) ? 0 : raw;
        const key = `${godownId}-${productId}`;
        const txs = productTxMap[key] || [];

        const origQty = parseFloat(txs.find(tx => tx.entry_id === entryId)?.quantity) || 0;

        let inTotal = 0, outTotal = 0;
        for (const tx of txs) {
            // Entry matching via from_location belongs to a different godown (transfer destination);
            // the -SRC entry already captures the outgoing stock for this godown. Skip it here.
            if (tx.from_location === godownId && tx.godown_id !== godownId) continue;
            const prevEdit = txEdits[tx.entry_id];
            const useQty = tx.entry_id === entryId ? num : (prevEdit !== undefined ? prevEdit : (parseFloat(tx.quantity) || 0));
            const isInType = tx.transaction_type === 'in' || tx.transaction_type === 'adjustment' || tx.transaction_type === 'transfer_in' || tx.transaction_type === 'purchase' || tx.transaction_type === 'return_in' || tx.transaction_type === 'opening';
            if (isInType) inTotal += useQty;
            else outTotal += useQty;
        }

        const s = (filteredSummary || []).find(item => item.product_id === productId && item.godown_id === godownId);
        const opening = parseFloat(s?.opening_stock) || 0;
        const closing = opening + inTotal - outTotal;

        const origIn = parseFloat(s?.in_stock) || 0;
        const origOut = parseFloat(s?.out_stock) || 0;
        const isRowChanged = inTotal !== origIn || outTotal !== origOut;

        setTxEdits(prev => {
            const next = { ...prev };
            if (num === origQty) delete next[entryId];
            else next[entryId] = num;
            return next;
        });

        if (closing < 0) {
            setTxErrors(prev => ({ ...prev, [entryId]: true }));
            return;
        }
        setTxErrors(prev => {
            const next = { ...prev };
            delete next[entryId];
            return next;
        });

        setEdits(prev => {
            if (isRowChanged) {
                const row = { ...(prev[key] || {}) };
                row.in_stock = inTotal;
                row.out_stock = outTotal;
                row.closing_stock = closing;
                return { ...prev, [key]: row };
            }
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setChangedRows(prev => {
            if (isRowChanged) return { ...prev, [key]: true };
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };


    const handleCancelTxEdit = (productId, godownId, entryId) => {
        const key = `${godownId}-${productId}`;
        const txs = productTxMap[key] || [];
        const tx = txs.find(t => t.entry_id === entryId);
        if (!tx) return;

        setTxErrors(prev => {
            const next = { ...prev };
            delete next[entryId];
            return next;
        });
        handleTxQuantityEdit(productId, godownId, entryId, tx.quantity);
    };

    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id || '-';

    const handleSaveAll = async () => {
        const changedKeys = Object.keys(changedRows);
        if (changedKeys.length === 0) {
            toast('No changes to save');
            return;
        }

        setSaving(true);
        const toastId = toast.loading(`Saving ${changedKeys.length} changes...`);
        const affectedProducts = new Set();
        let successCount = 0;
        let errorCount = 0;

        for (const key of changedKeys) {
            const s = (filteredSummary || []).find(item => `${item.godown_id}-${item.product_id}` === key);
            if (!s) continue;
            const { product_id: productId } = s;

            const txs = productTxMap[key] || [];
            const hasTxError = txs.some(tx => txErrors[tx.entry_id]);
            if (hasTxError) {
                errorCount++;
                continue;
            }

            try {
                for (const tx of txs) {
                    const newQty = txEdits[tx.entry_id];
                    if (newQty !== undefined) {
                        await stockManagementService.update(tx.entry_id, {
                            quantity: newQty,
                        });
                    }
                }

                affectedProducts.add(productId);
                successCount++;
            } catch (err) {
                console.error(`Error saving ${key}:`, err);
                errorCount++;
            }
        }

        for (const pid of affectedProducts) {
            await stockManagementService.recalculateProductStock(pid);
        }

        toast.dismiss(toastId);
        if (errorCount === 0) {
            toast.success(`Saved ${successCount} changes successfully`);
        } else {
            toast.error(`Saved ${successCount}, ${errorCount} failed`);
        }

        setSaving(false);
        setTxEdits({});
        setTxErrors({});
        setEdits({});
        setChangedRows({});
        fetchGodownsAndTransactions();
        fetchProducts(page, true);
    };

    const isFutureDate = useMemo(() => summaryDate > today, [summaryDate, today]);

    const loadProductTransactions = (productId, godownId) => {
        const key = `${godownId}-${productId}`;
        const matchingTxs = (dayTransactions || []).filter(t =>
            t.product_id === productId && (t.godown_id === godownId || t.from_location === godownId)
        );
        setProductTxMap(prev => ({ ...prev, [key]: matchingTxs }));
    };

    const fetchGodownsAndTransactions = async () => {
        try {
            const data = await liveStockDashboardService.fetchDashboardData(summaryDate);
            setGodowns(data.godowns || []);

            const flattenedTransactions = (data.transactions || []).map(t => {
                const prod = (data.masterProducts || []).find(p => p.product_id === t.product_id);
                return {
                    ...t,
                    product_name: prod?.name || t.product_name || 'Unknown Product'
                };
            });
            setDayTransactions(flattenedTransactions);

            if (summaryDate < today) {
                const future = await liveStockDashboardService.fetchAllTransactionsFromDate(summaryDate);
                setFutureTransactions(future || []);
            } else {
                setFutureTransactions([]);
            }
        } catch (error) {
            console.error('Error fetching static data:', error);
            toast.error('Failed to fetch auxiliary data');
        }
    };

    // ─── Fetch ALL products (batch loop) ─────────────────────────────────────
    // Powers the Godown Distribution table — needs complete data for accurate totals.
    const fetchAllProducts = async () => {
        try {
            let accumulated = await stockManagementService.fetchAllProducts();
            if (filterGodown) {
                accumulated = accumulated.filter(p => p.godown_id === filterGodown);
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
            let filtered = await stockManagementService.fetchAllProducts();

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                filtered = filtered.filter(p =>
                    (p.name || '').toLowerCase().includes(term) ||
                    (p.product_id || '').toLowerCase().includes(term)
                );
            }
            if (filterGodown) {
                filtered = filtered.filter(p => p.godown_id === filterGodown);
            }

            filtered.sort((a, b) => (a.name || '').localeCompare(b.name));

            const sliced = filtered.slice(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE);
            const count = filtered.length;

            if (reset) {
                setProducts(sliced);
            } else {
                setProducts(prev => {
                    const existingKeys = new Set(prev.map(p => `${p.product_id}-${p.godown_id}`));
                    const unique = sliced.filter(item => !existingKeys.has(`${item.product_id}-${item.godown_id}`));
                    return [...prev, ...unique];
                });
            }

            setTotalProducts(count);
            setHasMore(sliced.length === PAGE_SIZE && (pageNumber + 1) * PAGE_SIZE < count);
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
        localStorage.setItem('vpr_summaryDate', summaryDate);
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
                current_stock: parseFloat(product.current_stock) || 0,
            };
        });
    }, [products, godowns]);

    // Since filtering is done server-side now, filteredStock is just enrichedStock
    const filteredStock = enrichedStock;


    // Dynamic Master Summary Logic
    const dynamicSummary = useMemo(() => {
        if (isFutureDate) {
            return products.map(p => {
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
                    current_stock: 0,
                };
            });
        }

        const isToday = summaryDate === today;

        if (isToday) {
            return products.map(p => {
                const pTransactions = dayTransactions.filter(t =>
                    (t.godown_id === p.godown_id && t.product_id === p.product_id) ||
                    (t.from_location === p.godown_id && t.product_name === p.name)
                ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const in_stock = pTransactions.filter(t => t.godown_id === p.godown_id && t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                const out_stock = pTransactions.filter(t => t.transaction_type === 'out' && t.godown_id === p.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);

                const currentStock = parseFloat(p.current_stock) || 0;
                const opening_stock = currentStock - in_stock + out_stock;
                const closing_stock = opening_stock + in_stock - out_stock;

                const godown = getGodownDetails(p.godown_id);
                const pTransfers = pTransactions.filter(t => t.from_location || (t.godown_id === p.godown_id && t.from_location));

                return {
                    product_id: p.product_id,
                    product_name: p.name,
                    godown_id: p.godown_id,
                    godown_name: godown.name || p.godown_id,
                    mux: p.mux || '',
                    opening_stock: opening_stock,
                    in_stock: in_stock,
                    out_stock: out_stock,
                    transfers: pTransfers.length > 0
                        ? pTransfers.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0)
                        : 0,
                    closing_stock: closing_stock,
                    current_stock: currentStock,
                    verified: true,
                    source: 'computed',
                };
            });
        }

        // ─── Past dates: computed from current_stock ───
        const pastFiltered = allProducts.filter(p => {
            if (filterGodown && p.godown_id !== filterGodown) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const name = (p.name || '').toLowerCase();
                const id = (p.product_id || '').toLowerCase();
                if (!name.includes(term) && !id.includes(term)) return false;
            }
            return true;
        });

        return pastFiltered.map(p => {
            const godown = getGodownDetails(p.godown_id);
            const currentStock = parseFloat(p.current_stock) || 0;

            const inDate = (dayTransactions || []).filter(t =>
                t.product_id === p.product_id && t.godown_id === p.godown_id && t.transaction_type === 'in'
            ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
            const outDate = (dayTransactions || []).filter(t =>
                t.product_id === p.product_id && t.godown_id === p.godown_id && t.transaction_type === 'out'
            ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
            const inAfter = (futureTransactions || []).filter(t =>
                t.product_id === p.product_id && t.godown_id === p.godown_id && t.date > summaryDate && t.transaction_type === 'in'
            ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
            const outAfter = (futureTransactions || []).filter(t =>
                t.product_id === p.product_id && t.godown_id === p.godown_id && t.date > summaryDate && t.transaction_type === 'out'
            ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);

            const opening = currentStock - inDate - inAfter + outDate + outAfter;
            const closing = opening + inDate - outDate;

            return {
                product_id: p.product_id,
                product_name: p.name || p.product_id,
                godown_id: p.godown_id,
                godown_name: godown.name || p.godown_id,
                mux: p.mux || '',
                opening_stock: opening,
                in_stock: inDate,
                out_stock: outDate,
                transfers: 0,
                closing_stock: closing,
                current_stock: currentStock,
                verified: true,
                source: 'computed',
            };
        });
    }, [products, dayTransactions, futureTransactions, summaryDate, godowns, isFutureDate, today, searchTerm, filterGodown, allProducts]);

    // Server-side filtering already applies to dynamicSummary base (which depends on products)
    const filteredSummary = dynamicSummary;

    const editableSummary = useMemo(() => {
        return filteredSummary.map(s => {
            const key = `${s.godown_id}-${s.product_id}`;
            const edit = edits[key];
            if (!edit) return s;
            return { ...s, in_stock: edit.in_stock, out_stock: edit.out_stock, closing_stock: edit.closing_stock };
        });
    }, [filteredSummary, edits]);

    const totalStats = useMemo(() => {
        let opening = 0, in_stock = 0, out_stock = 0, closing = 0, currentStock = 0;
        for (const s of editableSummary) {
            const op = typeof s.opening_stock === 'number' ? s.opening_stock : (parseFloat(s.opening_stock) || 0);
            const in_s = typeof s.in_stock === 'number' ? s.in_stock : (parseFloat(s.in_stock) || 0);
            const out_s = typeof s.out_stock === 'number' ? s.out_stock : (parseFloat(s.out_stock) || 0);
            opening += op;
            in_stock += in_s;
            out_stock += out_s;
            closing += op + in_s - out_s;
            currentStock += parseFloat(s.current_stock) || 0;
        }
        return { opening, in_stock, out_stock, closing, currentStock };
    }, [editableSummary]);

    // Real-time subscription for relevant tables
    useEffect(() => {
        const unsubscribe = liveStockDashboardService.createSubscription(
            'live-stock-realtime',
            ['products', 'godowns', 'stock_management'],
            (payload) => {
                if (payload.table === 'products') {
                    fetchProducts(0, true);
                    fetchAllProducts();
                } else {
                    fetchGodownsAndTransactions();
                }
            }
        );

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [summaryDate, searchTerm, filterGodown]);

    const handleExport = async () => {
        const toastId = toast.loading("Preparing export...");
        try {
            if (!editableSummary || editableSummary.length === 0) {
                toast.error("No data found to export", { id: toastId });
                return;
            }

            let exportData = editableSummary;

            if (filterGodown) {
                exportData = exportData.filter(s => s.godown_id === filterGodown);
            }
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                exportData = exportData.filter(s =>
                    (s.product_name || '').toLowerCase().includes(term) ||
                    (s.product_id || '').toLowerCase().includes(term)
                );
            }

            if (exportData.length === 0) {
                toast.error("No data found to export", { id: toastId });
                return;
            }

            const godownFilterLabel = filterGodown
                ? (godowns.find(g => g.godown_id === filterGodown)?.name || filterGodown)
                : 'All Godowns';

            let formattedDate = summaryDate;
            if (summaryDate && summaryDate.includes('-')) {
                const [year, month, day] = summaryDate.split('-');
                formattedDate = `${day}/${month}/${year}`;
            }

            const headers = ["Item Name", "Product Type", "Godown Name", "Opening", "Stock In", "Stock Out", "Closing", "Current Stock"];
            const rows = exportData.map(s => {
                const safeVal = (v) => typeof v === 'number' && !isNaN(v) ? v : 0;
                return [
                    s.product_name || '',
                    s.product_type || '',
                    s.godown_name || '',
                    safeVal(s.opening_stock),
                    safeVal(s.in_stock),
                    safeVal(s.out_stock),
                    safeVal(s.closing_stock),
                    safeVal(s.current_stock),
                ];
            });

            const csvContent = [
                ["Date:", formattedDate],
                ["Godown:", godownFilterLabel],
                [],
                headers,
                ...rows
            ]
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

            toast.success(`Exported ${exportData.length} records successfully!`, { id: toastId });
        } catch (error) {
            console.error('Error during export:', error);
            toast.error('Failed to export data: ' + error.message, { id: toastId });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col">
            <main className="flex-1 px-4 lg:px-8 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
                {/* Global Controls */}
                <div className="sticky top-0 z-40 bg-slate-50/50 pt-2 pb-3 -mx-4 lg:-mx-8 px-4 lg:px-8 flex flex-row flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={() => setActiveTab('master')}
                            className={cn(
                                "h-9 px-2.5 sm:px-4 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all",
                                activeTab === 'master' 
                                    ? "bg-white text-primary shadow-sm border border-slate-200/60" 
                                    : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Master
                        </button>
                        <button
                            onClick={() => setActiveTab('live')}
                            className={cn(
                                "h-9 px-2.5 sm:px-4 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all",
                                activeTab === 'live' 
                                    ? "bg-white text-primary shadow-sm border border-slate-200/60" 
                                    : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Live
                        </button>
                    </div>

                    <div className="flex flex-row flex-wrap items-center gap-1.5 sm:gap-2 flex-1 min-w-[260px]">
                        <div className="relative w-[140px] sm:w-[180px] lg:w-[240px] shrink-0">
                            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <Input
                                type="text"
                                placeholder="Search..."
                                className="pl-8 sm:pl-9 h-9 bg-white border-slate-200 focus:bg-white transition-all rounded-xl text-xs w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                            <select
                                value={filterGodown}
                                onChange={(e) => setFilterGodown(e.target.value)}
                                className="h-9 text-[10px] sm:text-xs font-medium text-slate-600 bg-transparent focus:outline-none cursor-pointer max-w-[80px] sm:max-w-none truncate"
                            >
                                <option value="">All Godowns</option>
                                {godowns.map(g => (
                                    <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                ))}
                            </select>
                            <span className="text-slate-200 hidden sm:inline">|</span>
                            <DatePicker
                                value={summaryDate}
                                onChange={(e) => { if (e.target.value) setSummaryDate(e.target.value); }}
                                name="summaryDate"
                                className="border-none bg-transparent h-9 text-[10px] sm:text-xs font-medium text-slate-600"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {Object.keys(changedRows).length > 0 && (
                            <button
                                onClick={handleSaveAll}
                                disabled={saving}
                                className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 transition-all flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Save size={14} />
                                {saving ? 'Saving...' : `Save (${Object.keys(changedRows).length})`}
                            </button>
                        )}
                        <button
                            onClick={handleExport}
                            className="h-9 px-3 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center justify-center gap-1"
                        >
                            <Download size={14} />
                            Export
                        </button>
                        <button
                            onClick={() => { fetchGodownsAndTransactions(); fetchProducts(0, true); }}
                            className="h-9 w-9 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center"
                        >
                            <RefreshCcw size={14} className={cn(loading && "animate-spin")} />
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
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Godown Location</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Opening</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock In</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock Out</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closing</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Transfers</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {godowns.filter(g => !filterGodown || g.godown_id === filterGodown).map(godown => {
                                                if (isFutureDate) {
                                                    return (
                                                        <tr key={godown.godown_id} className="group hover:bg-slate-50/80 transition-colors">
                                                            <td className="px-3 sm:px-6 py-4">
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
                                                            <td className="px-3 sm:px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-3 sm:px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-3 sm:px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-3 sm:px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                            <td className="px-3 sm:px-6 py-4 text-center text-xs text-slate-300">-</td>
                                                        </tr>
                                                    );
                                                }
                                                const isToday = summaryDate === today;
                                                const directIn = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                                const directOut = dayTransactions.filter(t => t.godown_id === godown.godown_id && t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                                const totalIn = directIn;
                                                const totalOut = directOut;
                                                // Use allProducts (complete dataset) for accurate godown totals
                                                const gProducts = allProducts.filter(p => p.godown_id === godown.godown_id);
                                                const totalClosing = gProducts.reduce((sum, p) => sum + (parseFloat(p.current_stock) || 0), 0);

                                                // Past dates: compute opening/closing from current_stock + transactions
                                                const gInAfter = (futureTransactions || []).filter(t =>
                                                    t.godown_id === godown.godown_id && t.date > summaryDate && t.transaction_type === 'in'
                                                ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
                                                const gOutAfter = (futureTransactions || []).filter(t =>
                                                    t.godown_id === godown.godown_id && t.date > summaryDate && t.transaction_type === 'out'
                                                ).reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
                                                const gOpening = totalClosing - totalIn - gInAfter + totalOut + gOutAfter;
                                                const gComputedClosing = gOpening + totalIn - totalOut;

                                                const displayOpening = isToday ? gOpening : gOpening;
                                                const computedClosing = displayOpening + totalIn - totalOut;
                                                const displayClosing = isToday ? computedClosing : gComputedClosing;
                                                const displayIn = isToday ? totalIn : totalIn;
                                                const displayOut = isToday ? totalOut : totalOut;

                                                return (
                                                    <tr key={godown.godown_id} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="px-3 sm:px-6 py-4">
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
                                                        <td className="px-3 sm:px-6 py-4 text-center font-mono text-xs text-slate-600">
                                                            {displayOpening.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 sm:px-6 py-4 text-center">
                                                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">+{displayIn.toLocaleString()}</span>
                                                        </td>
                                                        <td className="px-3 sm:px-6 py-4 text-center">
                                                            <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-md">-{displayOut.toLocaleString()}</span>
                                                        </td>
                                                        <td className="px-3 sm:px-6 py-4 text-center text-sm font-black text-slate-900">
                                                            {displayClosing.toLocaleString()}
                                                        </td>
                                                        <td className="px-3 sm:px-6 py-4 text-center">
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
                                    Showing {editableSummary.length} Records {Object.keys(changedRows).length > 0 && <span className="text-amber-600 ml-1">({Object.keys(changedRows).length} edited)</span>}
                                </span>
                            </div>
                            
                            {loading ? (
                                <div className="bg-white rounded-3xl border border-slate-200/60 p-12 text-center">
                                    <RefreshCcw size={32} className="animate-spin text-primary/30 mx-auto mb-4" />
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Aggregating real-time data...</p>
                                </div>
                            ) : editableSummary.length > 0 ? (
                                <React.Fragment>
                                    <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-10">#</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Details</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Opening</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">In</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Out</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Closing</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Current Stock</th>
                                                        <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Transfers</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {(() => {
                                                        let rowIndex = 0;
                                                        return editableSummary.map((s, idx) => {
                                                        const txKey = `${s.godown_id}-${s.product_id}`;
                                                                 const isExpanded = expandedTxRows[txKey];
                                                                 const isRowChanged = changedRows[txKey];
                                                                 const rowEdit = edits[txKey] || {};
                                                                 const displayOpening = rowEdit.opening_stock ?? s.opening_stock ?? 0;
                                                                 const displayIn = rowEdit.in_stock ?? s.in_stock;
                                                                 const displayOut = rowEdit.out_stock ?? s.out_stock;
                                                                 const displayClosing = rowEdit.closing_stock ?? s.closing_stock;
                                                                 return (
                                                            <React.Fragment key={txKey}>
                                                                <tr
                                                                    className={cn("group hover:bg-slate-50/80 transition-colors cursor-pointer", isRowChanged && "bg-amber-50/50")}
                                                                    onClick={() => {
                                                                        setExpandedTxRows(prev => ({ ...prev, [txKey]: !prev[txKey] }));
                                                                        if (!productTxMap[txKey]) {
                                                                            loadProductTransactions(s.product_id, s.godown_id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <td className="px-3 sm:px-6 py-4 text-center text-xs font-mono text-slate-400">{++rowIndex}</td>
                                                                    <td className="px-3 sm:px-6 py-4">
                                                                        <p className="text-sm font-bold text-slate-900 leading-none">{s.product_name}</p>
                                                                        <p className="text-[10px] text-slate-400 font-mono tracking-tighter mt-0.5">{s.product_id}</p>
                                                                    </td>
                                                                    <td className="px-3 sm:px-6 py-4">
                                                                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider">{s.godown_name}</span>
                                                                    </td>
                                                                     <td className="px-3 sm:px-6 py-4 text-center font-mono text-xs text-slate-500">
                                                                         {displayOpening}
                                                                     </td>
<td className="px-3 sm:px-6 py-4 text-center">
                                                                         <span className="text-xs font-black text-emerald-600">{String(displayIn) === '-' ? '-' : `+${displayIn}`}</span>
                                                                     </td>
                                                                     <td className="px-3 sm:px-6 py-4 text-center">
                                                                         <span className="text-xs font-black text-rose-600">{String(displayOut) === '-' ? '-' : `-${displayOut}`}</span>
                                                                     </td>
                                                                     <td className="px-3 sm:px-6 py-4 text-center">
                                                                         <span className={cn("text-xs font-black", isRowChanged ? "text-amber-700" : "text-slate-900")}>{displayClosing ?? '-'}</span>
                                                                     </td>
                                                                    <td className="px-3 sm:px-6 py-4 text-center font-mono text-xs text-slate-600">
                                                                        {parseFloat(s.current_stock) || 0}
                                                                    </td>
                                                                    <td className="px-3 sm:px-6 py-4 text-center">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setSelectedTransfer({ type: 'product', id: s.product_id, godown_id: s.godown_id, name: s.product_name }); }}
                                                                            className={cn(
                                                                                "px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all",
                                                                                s.transfers > 0 ? "bg-slate-900 text-white hover:scale-105" : "bg-slate-100 text-slate-300"
                                                                            )}
                                                                        >
                                                                            {s.transfers}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                                {isExpanded && productTxMap[txKey] && (
                                                                    <tr key={`${txKey}-txns`}>
                                                                        <td colSpan={9} className="px-6 py-3 bg-slate-50/80 border-b border-slate-100">
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                                                    Stock Management Transactions for {s.product_name} on {summaryDate}
                                                                                </div>
                                                                                {isRowChanged && (
                                                                                    <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Edited</span>
                                                                                )}
                                                                            </div>
                                                                            {productTxMap[txKey].length === 0 ? (
                                                                                <div className="text-[10px] text-slate-400 italic">No transactions on this date</div>
                                                                            ) : (
                                                                                <div className="overflow-x-auto">
                                                                                    <table className="w-full text-[10px]">
                                                                                        <thead>
                                                                                             <tr className="border-b border-slate-200">
                                                                                                 <th className="px-2 py-1 text-left font-bold text-slate-500">Date</th>
                                                                                                 <th className="px-2 py-1 text-left font-bold text-slate-500">Type</th>
                                                                                                 <th className="px-2 py-1 text-right font-bold text-slate-500">Qty</th>
                                                                                                 <th className="px-2 py-1 text-left font-bold text-slate-500">From Godown</th>
                                                                                                 <th className="px-2 py-1 text-left font-bold text-slate-500">To Godown</th>
                                                                                                 <th className="px-2 py-1 text-center font-bold text-slate-500"></th>
                                                                                             </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                             {productTxMap[txKey].map(tx => {
                                                                                                  const isIn = tx.transaction_type === 'in' || tx.transaction_type === 'adjustment' || tx.transaction_type === 'transfer_in' || tx.transaction_type === 'purchase' || tx.transaction_type === 'return_in' || tx.transaction_type === 'opening';
                                                                                                 const txQty = parseFloat(txEdits[tx.entry_id] ?? tx.quantity) || 0;
                                                                                                 const isTxChanged = txEdits[tx.entry_id] !== undefined;
                                                                                                 const hasTxError = txErrors[tx.entry_id];
                                                                                                  const isOutType = tx.transaction_type === 'out';
                                                                                                  const isSrcEntry = isOutType && (tx.entry_id?.endsWith('-SRC') || dayTransactions.some(t => t.product_id === tx.product_id && t.from_location === tx.godown_id && (t.transaction_type === 'in' || t.transaction_type === 'transfer_in' || t.transaction_type === 'adjustment')));
                                                                                                  const linkedDestGodown = isSrcEntry ? dayTransactions.find(t => t.product_id === tx.product_id && t.from_location === tx.godown_id && (t.transaction_type === 'in' || t.transaction_type === 'transfer_in' || t.transaction_type === 'adjustment'))?.godown_id : null;
                                                                                                 return (
                                                                                                 <tr key={tx.id} className={cn("border-b border-slate-100 hover:bg-white transition-colors", isTxChanged && !hasTxError && "bg-amber-50/50", hasTxError && "bg-red-50")}>
                                                                                                         <td className="px-2 py-1 font-mono text-[10px] text-slate-500">{tx.date || '-'}</td>
                                                                                                         <td className="px-2 py-1">
                                                                                                             <span className={cn(
                                                                                                                 "px-1.5 py-0.5 rounded font-black uppercase",
                                                                                                                 isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                                                                                             )}>{tx.transaction_type}</span>
                                                                                                         </td>
                                                                                                         <td className="px-2 py-1 text-right font-mono font-bold">
                                                                                                             <input type="number" value={txQty}
                                                                                                                 onChange={(e) => handleTxQuantityEdit(s.product_id, s.godown_id, tx.entry_id, e.target.value)}
                                                                                                                 className={cn("w-16 text-right font-mono text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1", hasTxError ? "border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-200" : isTxChanged ? "border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-200" : "border-transparent hover:border-slate-200 focus:border-primary focus:ring-primary/20")} />
                                                                                                         </td>
<td className="px-2 py-1 text-slate-500">{tx.from_location && godowns.find(g => g.godown_id === tx.from_location) ? getGodownName(tx.from_location) : (isIn ? 'New Stock' : getGodownName(tx.godown_id))}</td>
                                                                                                            <td className="px-2 py-1 text-slate-500">{isSrcEntry && linkedDestGodown ? getGodownName(linkedDestGodown) : (isOutType ? 'Dispatch' : getGodownName(tx.godown_id))}</td>
                                                                                                         <td className="px-2 py-1 text-center">
                                                                                                             {isTxChanged && (
                                                                                                                 <button onClick={(e) => { e.stopPropagation(); handleCancelTxEdit(s.product_id, s.godown_id, tx.entry_id); }}
                                                                                                                     className="text-[9px] font-black text-red-500 hover:text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors">
                                                                                                                     Cancel
                                                                                                                 </button>
                                                                                                             )}
                                                                                                         </td>
                                                                                                     </tr>
                                                                                                );
                                                                                            })}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })})()}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                                                        <td className="px-3 sm:px-4 py-3"></td>
                                                        <td className="px-3 sm:px-4 py-3 text-[10px] font-black text-slate-600 uppercase tracking-widest" colSpan={2}>
                                                            <span className="flex items-center gap-1"><Package size={12} /> Totals</span>
                                                        </td>
                                                        <td className="px-3 sm:px-4 py-3 text-center font-mono text-sm font-black text-slate-900">{totalStats.opening.toLocaleString()}</td>
                                                        <td className="px-3 sm:px-4 py-3 text-center font-mono text-sm font-black text-emerald-700">{totalStats.in_stock.toLocaleString()}</td>
                                                        <td className="px-3 sm:px-4 py-3 text-center font-mono text-sm font-black text-rose-700">{totalStats.out_stock.toLocaleString()}</td>
                                                        <td className="px-3 sm:px-4 py-3 text-center font-mono text-sm font-black text-slate-900">{totalStats.closing.toLocaleString()}</td>
                                                        <td className="px-3 sm:px-4 py-3 text-center font-mono text-sm font-black text-slate-600">{totalStats.currentStock.toLocaleString()}</td>
                                                        <td className="px-3 sm:px-4 py-3 text-center"></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                    {summaryDate === today && hasMore && (
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
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Details</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">MUX</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Units</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Mass (KG)</th>
                                                <th className="px-3 sm:px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Current Stock</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {filteredStock.map((stock) => (
                                                <tr key={`${stock.product_id}-${stock.godown_id}`} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-3 sm:px-6 py-4">
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
                                                    <td className="px-3 sm:px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <MapPin size={12} className="text-slate-400" />
                                                            <span className="text-xs font-black text-slate-600 uppercase tracking-tight">{stock.godown_name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 sm:px-6 py-4 text-center font-bold text-slate-900">{stock.mux || '-'}</td>
                                                    <td className="px-3 sm:px-6 py-4 text-center font-black text-slate-900">{stock.current_stock}</td>
                                                    <td className="px-3 sm:px-6 py-4 text-center">
                                                        <span className="px-3 py-1 bg-primary/5 text-primary text-xs font-black rounded-lg border border-primary/10">
                                                            {((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(3)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-6 py-4 text-center font-mono text-xs font-black text-slate-900">{stock.current_stock}</td>
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
                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Current</span>
                            <span className="text-xs font-black text-slate-900 mt-0.5">{stock.current_stock}</span>
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
        if (details.type === 'godown') {
            return transactions.filter(t =>
                t.from_location === details.id || (t.godown_id === details.id && t.from_location)
            );
        }
        return transactions.filter(t =>
            t.product_id === details.id &&
            (t.from_location === details.godown_id || t.godown_id === details.godown_id)
        );
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
                                        const isInType = t.transaction_type === 'in' || t.transaction_type === 'adjustment' || t.transaction_type === 'transfer_in' || t.transaction_type === 'purchase' || t.transaction_type === 'return_in' || t.transaction_type === 'opening';
                                        const isOutgoing = t.transaction_type === 'out';
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
                                                        isOutgoing ? "text-amber-600" : "text-emerald-600"
                                                    )}>
                                                        {isOutgoing ? '-' : '+'}{t.quantity}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                                                        isInType ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                                                    )}>
                                                        {t.transaction_type}
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
