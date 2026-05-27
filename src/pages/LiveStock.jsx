import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { Search, Download, RefreshCcw, ClipboardList, FileSpreadsheet, Printer, ChevronDown, ChevronRight, Filter, Package, ArrowLeft, ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { liveStockService } from '../services/liveStockService';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const sizeOrder = (a, b) => {
    const parseDim = (s) => {
        const parts = s.toUpperCase().replace(/\s/g, '').split('X');
        if (parts.length !== 2) return [999, 999];
        const numA = parseFloat(parts[0]) || 999;
        const numB = parseFloat(parts[1]) || 999;
        const area = numA * numB;
        const minDim = Math.min(numA, numB);
        return [minDim, area];
    };
    const [minA, areaA] = parseDim(a);
    const [minB, areaB] = parseDim(b);
    return minA - minB || areaA - areaB || a.localeCompare(b);
};

const StockLedger = () => {
    const navigate = useNavigate();
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [masterProducts, setMasterProducts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [dailySnapshots, setDailySnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGodown, setSelectedGodown] = useState('all');
    const [selectedMasterId, setSelectedMasterId] = useState(null); // Keep for now to avoid breaking references, but we will remove the UI
    const [visibleMasterCount, setVisibleMasterCount] = useState(10);
    const observerRef = React.useRef(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('closing'); // closing, opening, inward, outward

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await liveStockService.fetchLedgerData(selectedDate, silent);

            setProducts(data.products);
            setDailySnapshots(data.dailySnapshots);
            setTransactions(data.transactions);

            if (data.godowns && data.masterProducts) {
                setGodowns(data.godowns);
                setMasterProducts(data.masterProducts);
            }
        } catch (error) {
            console.error('Error fetching ledger data:', error);
            if (!silent) toast.error('Failed to fetch stock ledger data');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    // Real-time subscription
    useEffect(() => {
        const unsubscribe = liveStockService.createSubscription(
            'live-stock-ledger',
            ['products', 'stock_management', 'daily_stock_summary'],
            () => fetchData(true)
        );

        return unsubscribe;
    }, [fetchData]);




    const deferredSearchTerm = useDeferredValue(searchTerm);

    const filteredProducts = useMemo(() => {
        let filtered = [...products];

        // For past dates: only show products that have snapshot data
        if (selectedDate !== today) {
            const snapshotPids = new Set(dailySnapshots.map(s => s.product_id));
            filtered = filtered.filter(p => snapshotPids.has(p.product_id));
        }

        if (deferredSearchTerm) {
            const lowSearch = deferredSearchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name?.toLowerCase().includes(lowSearch) || 
                p.product_id?.toLowerCase().includes(lowSearch) ||
                p.product_type?.toLowerCase().includes(lowSearch)
            );
        }
        if (selectedGodown !== 'all') {
            filtered = filtered.filter(p => p.godown_id === selectedGodown);
        }
        return filtered;
    }, [products, deferredSearchTerm, selectedGodown, selectedDate, today, dailySnapshots]);

    const productGrid = useMemo(() => {
        const isToday = selectedDate === today;
        
        const snapMap = {};
        const openingMap = {};
        const inwardMap = {};
        const outwardMap = {};

        dailySnapshots.forEach(s => {
            if (selectedGodown === 'all' || s.godown_id === selectedGodown) {
                const pid = s.product_id; // UUID
                snapMap[pid] = (snapMap[pid] || 0) + (parseFloat(s.closing_stock) || 0);
                openingMap[pid] = (openingMap[pid] || 0) + (parseFloat(s.opening_stock) || 0);
                inwardMap[pid] = (inwardMap[pid] || 0) + (parseFloat(s.in_stock) || 0);
                outwardMap[pid] = (outwardMap[pid] || 0) + (parseFloat(s.out_stock) || 0);
            }
        });

        // Dynamic Today Map
        const todayInMap = {};
        const todayOutMap = {};
        if (isToday) {
            transactions.forEach(t => {
                const qty = parseFloat(t.quantity) || 0;
                // stock_management uses product_id as SKU
                if (selectedGodown === 'all' || t.godown_id === selectedGodown) {
                    if (t.transaction_type === 'in') {
                        todayInMap[t.product_id] = (todayInMap[t.product_id] || 0) + qty;
                    } else if (t.transaction_type === 'out') {
                        todayOutMap[t.product_id] = (todayOutMap[t.product_id] || 0) + qty;
                    }
                }
                if (t.from_location && (selectedGodown === 'all' || t.from_location === selectedGodown)) {
                    todayOutMap[t.product_id] = (todayOutMap[t.product_id] || 0) + qty;
                }
            });
        }

        if (filteredProducts.length === 0 && Object.keys(snapMap).length === 0) return { sortedMasters: [], grandTotal: 0 };

        const types = {}; // typeName -> { masterId -> { variantName -> qty } }
        const masters = {}; // masterId -> { name, variantNames: Set, typeNames: Set, variantData: { name -> productObj } }
        
        // Single pass for grouping
        for (const p of filteredProducts) {
            const mId = p.master_product_id || 'unassigned';
            const type = p.product_type || 'OTHER';
            const vName = p.name || 'Unknown';
            
            let qty = 0;
            if (viewMode === 'closing') {
                qty = isToday ? (parseFloat(p.current_stock) || 0) : (snapMap[p.product_id] || 0);
            } else if (viewMode === 'opening') {
                if (isToday) {
                    const in_t = todayInMap[p.product_id] || 0;
                    const out_t = todayOutMap[p.product_id] || 0;
                    qty = (parseFloat(p.current_stock) || 0) - in_t + out_t;
                } else {
                    qty = openingMap[p.product_id] || 0;
                }
            } else if (viewMode === 'inward') {
                qty = isToday ? (todayInMap[p.product_id] || 0) : (inwardMap[p.product_id] || 0);
            } else if (viewMode === 'outward') {
                qty = isToday ? (todayOutMap[p.product_id] || 0) : (outwardMap[p.product_id] || 0);
            }
            
            if (!types[type]) types[type] = {};
            if (!types[type][mId]) types[type][mId] = {};
            types[type][mId][vName] = (types[type][mId][vName] || 0) + qty;
            
            if (!masters[mId]) {
                masters[mId] = { 
                    name: masterProducts[mId] || (p.master_product_id ? 'Unknown' : 'Unassigned'), 
                    variantNames: new Set(), 
                    typeNames: new Set(),
                    variantData: {} 
                };
            }
            masters[mId].variantNames.add(vName);
            masters[mId].typeNames.add(type);
            masters[mId].variantData[vName] = p; // Keep product reference for history lookup
        }
        
        const sortedMasters = Object.entries(masters).map(([id, data]) => ({
            id,
            name: data.name,
            variants: Array.from(data.variantNames).sort(),
            typeNames: Array.from(data.typeNames).sort(sizeOrder),
            variantData: data.variantData
        })).sort((a, b) => a.name.localeCompare(b.name));
        
        const masterTotals = {};
        const variantTotals = {};
        const masterTypeTotals = {}; // masterId -> { typeName -> total }
        const typeGrandTotals = {}; // typeName -> total across all masters
        let grandTotal = 0;
        
        // Pre-calculate all totals in one sweep
        for (const m of sortedMasters) {
            let mt = 0;
            masterTypeTotals[m.id] = {};
            
            for (const v of m.variants) {
                let vt = 0;
                for (const tName of m.typeNames) {
                    const qty = (types[tName][m.id]?.[v] || 0);
                    vt += qty;
                    masterTypeTotals[m.id][tName] = (masterTypeTotals[m.id][tName] || 0) + qty;
                    typeGrandTotals[tName] = (typeGrandTotals[tName] || 0) + qty;
                }
                variantTotals[v] = vt;
                mt += vt;
            }
            masterTotals[m.id] = mt;
            grandTotal += mt;
        }
        
        return { types, sortedMasters, masterTotals, variantTotals, masterTypeTotals, typeGrandTotals, grandTotal };
    }, [filteredProducts, masterProducts, dailySnapshots, transactions, selectedGodown, viewMode, selectedDate, today]);

    // Reset pagination when filters change
    useEffect(() => {
        setVisibleMasterCount(10);
    }, [searchTerm, selectedGodown, selectedDate]);

    // Infinite scroll observer
    useEffect(() => {
        if (!observerRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleMasterCount(prev => prev + 10);
            }
        }, { threshold: 0.1 });

        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [productGrid.sortedMasters?.length]);

    const godownList = useMemo(() => {
        const gMap = {};
        godowns.forEach(g => { gMap[g.godown_id] = g; });
        return gMap;
    }, [godowns]);


    const godownSummaries = useMemo(() => {
        const isToday = selectedDate === today;
        const summaries = {};

        godowns.forEach(g => {
            const gId = g.godown_id;
            const gProducts = products.filter(p => p.godown_id === gId);
            const gSnapshots = dailySnapshots.filter(s => s.godown_id === gId);
            const gTxns = transactions.filter(t => t.godown_id === gId || t.from_location === gId);

            const directIn = gTxns.filter(t => t.godown_id === gId && t.transaction_type === 'in')
                .reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
            const directOut = gTxns.filter(t => t.godown_id === gId && t.transaction_type === 'out')
                .reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
            const outgoingTransfers = gTxns.filter(t => t.from_location === gId)
                .reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);

            const totalClosing = gProducts.reduce((s, p) => s + (parseFloat(p.current_stock) || 0), 0);
            const totalIn = directIn;
            const totalOut = directOut + outgoingTransfers;
            const totalOpening = totalClosing - totalIn + totalOut;

            summaries[gId] = {
                godown: g,
                opening: isToday ? totalOpening : gSnapshots.reduce((s, sn) => s + (parseFloat(sn.opening_stock) || 0), 0),
                inward: isToday ? totalIn : gSnapshots.reduce((s, sn) => s + (parseFloat(sn.in_stock) || 0), 0),
                outward: isToday ? totalOut : gSnapshots.reduce((s, sn) => s + (parseFloat(sn.out_stock) || 0), 0),
                closing: isToday ? totalClosing : gSnapshots.reduce((s, sn) => s + (parseFloat(sn.closing_stock) || 0), 0),
            };
        });

        return summaries;
    }, [godowns, products, dailySnapshots, transactions, selectedDate, today]);

    // Godown Match: check if main godown closing = sum of all others
    const godownMatch = useMemo(() => {
        const entries = Object.entries(godownSummaries);
        if (entries.length < 2) return { match: true, mainClosing: 0, othersSum: 0 };

        const main = entries[0][1];
        const othersSum = entries.slice(1).reduce((s, [, v]) => s + (parseFloat(v.closing) || 0), 0);
        const mainClosing = parseFloat(main.closing) || 0;
        return {
            match: Math.abs(mainClosing - othersSum) < 0.5,
            mainClosing,
            othersSum,
            diff: mainClosing - othersSum
        };
    }, [godownSummaries]);

    const handleExportXLSX = () => {
        try {
            const wb = XLSX.utils.book_new();

            // Helper to calculate column widths
            const getColWidths = (data) => {
                const maxChars = [];
                data.forEach(row => {
                    row.forEach((cell, i) => {
                        const len = cell ? cell.toString().length : 0;
                        if (!maxChars[i] || len > maxChars[i]) maxChars[i] = len;
                    });
                });
                return maxChars.map(w => ({ wch: Math.min(Math.max(w + 2, 8), 50) })); // Min 8, max 50 chars
            };

            // Summary sheet
            const summaryData = [['Godown', 'Opening', 'Inward', 'Outward', 'Closing']];
            Object.entries(godownSummaries).forEach(([id, s]) => {
                summaryData.push([s.godown.name, s.opening, s.inward, s.outward, s.closing]);
            });
            const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
            ws1['!cols'] = getColWidths(summaryData);
            XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

            // Product grid sheet
            const { sortedMasters, types } = productGrid;
            const gridData = [];

            sortedMasters.forEach(m => {
                // Section Header
                gridData.push([m.name, ...m.variants]);
                
                // Data Rows
                m.typeNames.forEach(tName => {
                    const row = [tName];
                    m.variants.forEach(vName => {
                        row.push(types[tName][m.id]?.[vName] || 0);
                    });
                    gridData.push(row);
                });
                
                // Spacer
                gridData.push([]);
            });

            const ws2 = XLSX.utils.aoa_to_sheet(gridData);
            ws2['!cols'] = getColWidths(gridData);
            XLSX.utils.book_append_sheet(wb, ws2, 'Stock Grid');

            XLSX.writeFile(wb, `Stock_Ledger_${selectedDate}.xlsx`);
            toast.success('Exported to Excel');
        } catch (e) {
            toast.error('Export failed: ' + e.message);
        }
    };

    const toggleGroup = (size) => {
        setExpandedGroups(prev => ({ ...prev, [size]: !prev[size] }));
    };

    const displayValue = (val) => {
        if (val === 0 || val === '0' || val === null || val === undefined) return '';
        return val;
    };

    if (loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#f8fafc]">
                <div className="flex flex-col items-center gap-4 p-8 bg-white/60 backdrop-blur-md border border-slate-200/50 rounded-3xl shadow-xl animate-in fade-in duration-300">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin w-12 h-12" />
                        <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center text-primary shadow-sm bg-white">
                            <RefreshCcw size={20} className="animate-spin text-primary" style={{ animationDuration: '3s' }} />
                        </div>
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-black text-slate-800 tracking-tight uppercase">Loading Live Ledger</p>
                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Fetching live stock data...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#f8fafc] overflow-hidden">
            {/* Minimal Fullscreen Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
                        title="Go Back"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <Package className="text-primary" size={20} />
                            LIVE STOCK LEDGER
                        </h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                            Real-time Inventory Management
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Compact stats in header */}
                    <div className="hidden md:flex items-center gap-6 px-6 border-l border-slate-100">
                        <div className="text-right">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Total Products</p>
                            <p className="text-sm font-black text-slate-700">{productGrid.sortedMasters.length}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Total Units</p>
                            <p className="text-sm font-black text-primary">{productGrid.grandTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4 lg:p-6 space-y-6">
                {/* Premium Header */}
                <div className="space-y-6 print:space-y-4">
                {/* Single Row Controls Bar */}
                <div className="flex flex-col lg:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
                        <div className="flex gap-3 w-full sm:w-auto">
                            <div className="w-1/2 sm:w-[160px] shrink-0">
                                <DatePicker
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    name="ledgerDate"
                                />
                            </div>
                            <select
                                value={selectedGodown}
                                onChange={(e) => setSelectedGodown(e.target.value)}
                                className="w-1/2 sm:w-[160px] sm:min-w-[140px] h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-white font-bold text-slate-700"
                            >
                                <option value="all">All Godowns</option>
                                {godowns.map(g => (
                                    <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* View Mode Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full sm:w-auto justify-between sm:justify-start">
                            {[
                                { id: 'closing', label: 'Closing', icon: Package },
                                { id: 'opening', label: 'Opening', icon: RefreshCcw },
                                { id: 'inward', label: 'Inward', icon: ArrowUp, color: 'text-emerald-600' },
                                { id: 'outward', label: 'Outward', icon: ArrowUp, color: 'text-rose-600', rotate: 180 }
                            ].map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setViewMode(mode.id)}
                                    className={cn(
                                        "flex-1 sm:flex-initial px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                                        viewMode === mode.id 
                                            ? "bg-white text-primary shadow-sm" 
                                            : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    <mode.icon size={12} className={cn(mode.color)} style={mode.rotate ? { transform: `rotate(${mode.rotate}deg)` } : {}} />
                                    <span className="hidden sm:inline">{mode.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
                        <input
                            type="text"
                            placeholder="Search products by name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 h-10 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 font-medium"
                        />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchData}
                            className="h-10 px-4 hover:bg-slate-50 transition-colors"
                            title="Refresh Data"
                        >
                            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportXLSX} className="h-10 gap-2 px-4 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all font-bold">
                            <FileSpreadsheet size={14} />
                            <span className="hidden sm:inline">Export</span>
                        </Button>
                    </div>
                </div>

            {/* Date Info Bar */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>
                    Showing <strong className="text-primary uppercase">{viewMode}</strong> data for <strong className="text-slate-600">{selectedDate}</strong>
                </span>
                <span>
                    {productGrid.sortedMasters.reduce((acc, m) => acc + m.typeNames.length, 0)} items across {productGrid.sortedMasters.length} master products
                    {' | '}Total: <strong className="text-slate-600">{productGrid.grandTotal.toLocaleString()}</strong> units
                </span>
            </div>
            </div>

            {/* Master Product Sections */}
            {productGrid.sortedMasters.length > 0 ? (
                <div className="erp-table-container bg-white border-2 border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[11px] leading-tight">
                            <tbody>
                                {productGrid.sortedMasters.slice(0, visibleMasterCount).map((mRow, mIdx) => {
                                    const themeColors = [
                                        { bg: 'bg-[#fdf2f8]', text: 'text-[#831843]', border: 'border-[#fbcfe8]' }, // Pink
                                        { bg: 'bg-[#f5f3ff]', text: 'text-[#4c1d95]', border: 'border-[#ddd6fe]' }, // Purple
                                        { bg: 'bg-[#ecfdf5]', text: 'text-[#064e3b]', border: 'border-[#a7f3d0]' }, // Emerald
                                        { bg: 'bg-[#eff6ff]', text: 'text-[#1e3a8a]', border: 'border-[#bfdbfe]' }, // Blue
                                        { bg: 'bg-[#fffbeb]', text: 'text-[#78350f]', border: 'border-[#fde68a]' }, // Amber
                                        { bg: 'bg-[#f0f9ff]', text: 'text-[#082f49]', border: 'border-[#bae6fd]' }, // Sky
                                    ];
                                    const theme = themeColors[mIdx % themeColors.length];
                                    const maxVariantCount = Math.max(...productGrid.sortedMasters.map(m => m.variants.length));

                                    return (
                                        <React.Fragment key={mRow.id}>
                                            {/* Unified Header Row - Product Name in first cell */}
                                            <tr className={cn(theme.bg, theme.text, mIdx > 0 ? "border-t-4 border-slate-300" : "")}>
                                                <th className="sticky left-0 z-20 px-4 py-3 text-left font-black bg-slate-50 text-slate-900 border-r-2 border-b-2 border-slate-200 uppercase tracking-tighter min-w-[160px]">
                                                    <div className="flex items-center gap-2">
                                                        <Package size={16} className={theme.text} />
                                                        <span>{mRow.name}</span>
                                                    </div>
                                                </th>
                                                {mRow.variants.map(vName => (
                                                    <th key={vName} className={cn(
                                                        "px-2 py-3 text-center font-bold border-b-2 border-r uppercase",
                                                        theme.bg, theme.text, theme.border
                                                    )}>
                                                        <div className="min-w-[90px] break-words flex flex-col items-center gap-1">
                                                            {vName}
                                                        </div>
                                                    </th>
                                                ))}
                                                {/* Pad empty cells */}
                                                {Array.from({ length: maxVariantCount - mRow.variants.length }).map((_, i) => (
                                                    <th key={`pad-h-${i}`} className={cn("border-b-2 border-r", theme.bg, theme.border)}></th>
                                                ))}
                                                <th className="sticky right-0 z-20 px-3 py-3 text-center font-black border-b-2 border-l-2 bg-slate-200 text-slate-800 min-w-[100px] shadow-[-2px_0_4px_rgba(0,0,0,0.03)]">
                                                    TOTAL
                                                </th>
                                            </tr>

                                            {/* Data Rows */}
                                            {mRow.typeNames.map((tName) => {
                                                const rowTotal = mRow.variants.reduce((sum, v) => sum + (productGrid.types[tName][mRow.id]?.[v] || 0), 0);
                                                return (
                                                    <tr key={tName} className="hover:bg-slate-50 transition-colors">
                                                        <td className="sticky left-0 z-10 px-3 py-1.5 font-black text-slate-700 bg-slate-50 border-r-2 border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)] uppercase">
                                                            {tName}
                                                        </td>
                                                        {mRow.variants.map(vName => {
                                                            const val = productGrid.types[tName][mRow.id]?.[vName] || 0;
                                                            return (
                                                                <td key={vName} className={cn(
                                                                    "px-2 py-1.5 text-center font-mono border-r border-b border-slate-100",
                                                                    val > 0 ? "text-slate-900 font-bold" : "text-slate-300",
                                                                    val < 0 ? "text-rose-600 font-bold bg-rose-50" : ""
                                                                )}>
                                                                    {displayValue(val)}
                                                                </td>
                                                            );
                                                        })}
                                                        {/* Pad empty cells */}
                                                        {Array.from({ length: maxVariantCount - mRow.variants.length }).map((_, i) => (
                                                            <td key={`pad-d-${i}`} className="border-r border-b border-slate-50"></td>
                                                        ))}
                                                        <td className="sticky right-0 z-10 px-3 py-1.5 text-center font-black text-slate-900 bg-slate-100 border-b border-l-2 border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.03)]">
                                                            {displayValue(rowTotal)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-24 bg-white rounded-xl border-2 border-dashed border-slate-200">
                    <ClipboardList size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-bold text-slate-600">No stock data available</p>
                    <p className="text-sm text-slate-400">Try adjusting your filters or date selection</p>
                </div>
            )}

            {/* Infinite Scroll Sentinel */}
            {productGrid.sortedMasters.length > visibleMasterCount && (
                <div ref={observerRef} className="py-12 text-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 mt-6">
                    <RefreshCcw size={24} className="animate-spin mx-auto text-slate-400 mb-3" />
                    <p className="text-sm font-bold text-slate-500 italic">Loading more stock collections...</p>
                </div>
            )}


            {/* Custom Styles for Sheet Look */}
            <style>{`
                @media print {
                    .print\\:hidden { display: none !important; }
                    body { background: white !important; }
                    .overflow-x-auto { overflow: visible !important; }
                    table { border-collapse: collapse !important; width: 100% !important; }
                    th, td { border: 1px solid #000 !important; font-size: 9px !important; padding: 2px 4px !important; }
                    .sticky { position: static !important; }
                    @page { size: landscape; margin: 5mm; }
                }
            `}</style>
        </div>
        </div>
    );
};

export default StockLedger;
