import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Download, RefreshCcw, ClipboardList, FileSpreadsheet, Printer, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '../supabase';
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
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [masterProducts, setMasterProducts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [dailySnapshots, setDailySnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGodown, setSelectedGodown] = useState('all');
    const [expandedGroups, setExpandedGroups] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const fetchGodowns = useCallback(async () => {
        const { data } = await supabase.from('godowns').select('*').eq('is_active', true).order('name');
        setGodowns(data || []);
    }, []);

    const fetchMasterProducts = useCallback(async () => {
        const { data } = await supabase.from('master_product').select('*').eq('is_active', true).order('name');
        const mpMap = {};
        (data || []).forEach(mp => { mpMap[mp.id] = mp.name; });
        setMasterProducts(mpMap);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [prodRes, snapRes, txnRes] = await Promise.all([
                supabase.from('products').select('*').eq('is_active', true),
                supabase.from('daily_stock_summary').select('*').eq('date', selectedDate),
                supabase.from('stock_management').select('*').eq('date', selectedDate)
            ]);

            setProducts(prodRes.data || []);
            setDailySnapshots(snapRes.data || []);
            setTransactions(txnRes.data || []);
        } catch (error) {
            console.error('Error fetching ledger data:', error);
            toast.error('Failed to fetch stock ledger data');
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchGodowns();
        fetchMasterProducts();
    }, [fetchGodowns, fetchMasterProducts]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const godownList = useMemo(() => {
        const gMap = {};
        godowns.forEach(g => { gMap[g.godown_id] = g; });
        return gMap;
    }, [godowns]);

    const filteredProducts = useMemo(() => {
        let filtered = products;
        if (selectedGodown !== 'all') {
            filtered = filtered.filter(p => p.godown_id === selectedGodown);
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(term) ||
                (p.product_id || '').toLowerCase().includes(term)
            );
        }
        return filtered;
    }, [products, selectedGodown, searchTerm]);

    const deriveBaseName = useCallback((product) => {
        if (product.master_product_id && masterProducts[product.master_product_id]) {
            return masterProducts[product.master_product_id];
        }
        const sizePattern = /\s*\d+[\s.]*[xX*][\s]*\d+.*$/;
        const cleaned = product.name.replace(sizePattern, '').trim();
        return cleaned || product.name;
    }, [masterProducts]);

    const productGrid = useMemo(() => {
        const sizeMap = {};
        const brandMap = {};

        filteredProducts.forEach(p => {
            const size = p.product_type || 'OTHER';
            const brand = deriveBaseName(p);
            const qty = parseFloat(p.closing_quantity) || 0;

            if (!sizeMap[size]) sizeMap[size] = {};
            if (!sizeMap[size][brand]) sizeMap[size][brand] = 0;
            sizeMap[size][brand] += qty;

            brandMap[brand] = (brandMap[brand] || 0) + 1;
        });

        const sizes = Object.keys(sizeMap).sort(sizeOrder);
        const brands = Object.keys(brandMap).sort();

        // Compute totals per size and per brand
        const sizeTotals = {};
        const brandTotals = {};
        let grandTotal = 0;

        sizes.forEach(size => {
            let st = 0;
            brands.forEach(brand => {
                const val = sizeMap[size]?.[brand] || 0;
                st += val;
                brandTotals[brand] = (brandTotals[brand] || 0) + val;
            });
            sizeTotals[size] = st;
            grandTotal += st;
        });

        return { grid: sizeMap, sizes, brands, sizeTotals, brandTotals, grandTotal };
    }, [filteredProducts, deriveBaseName]);

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

            const totalClosing = gProducts.reduce((s, p) => s + (parseFloat(p.closing_quantity) || 0), 0);
            const totalIn = directIn;
            const totalOut = directOut + outgoingTransfers;
            const totalOpening = totalClosing - totalIn + totalOut;

            summaries[gId] = {
                godown: g,
                opening: isToday ? totalOpening : (gSnapshots.length > 0 ? gSnapshots[0]?.opening_stock : '-'),
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

            // Summary sheet
            const summaryData = [['Godown', 'Opening', 'Inward', 'Outward', 'Closing']];
            Object.entries(godownSummaries).forEach(([id, s]) => {
                summaryData.push([s.godown.name, s.opening, s.inward, s.outward, s.closing]);
            });
            const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

            // Product grid sheet
            const { sizes, brands, grid } = productGrid;
            const gridData = [['Size', ...brands, 'Total']];
            sizes.forEach(size => {
                const row = [size];
                let st = 0;
                brands.forEach(b => {
                    const v = grid[size]?.[b] || '';
                    row.push(v === 0 ? '' : v);
                    st += v || 0;
                });
                row.push(st);
                gridData.push(row);
            });
            const totalRow = ['TOTAL'];
            let gt = 0;
            brands.forEach(b => {
                const t = productGrid.brandTotals[b] || 0;
                totalRow.push(t);
                gt += t;
            });
            totalRow.push(gt);
            gridData.push(totalRow);

            const ws2 = XLSX.utils.aoa_to_sheet(gridData);
            XLSX.utils.book_append_sheet(wb, ws2, 'Stock Grid');

            XLSX.writeFile(wb, `Stock_Ledger_${selectedDate}.xlsx`);
            toast.success('Exported to Excel');
        } catch (e) {
            toast.error('Export failed: ' + e.message);
        }
    };

    const handlePrint = () => {
        window.print();
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
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCcw size={32} className="animate-spin text-primary" />
                    <p className="text-sm font-medium text-slate-500">Loading Stock Ledger...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-[180px]">
                        <DatePicker
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            name="ledgerDate"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        className="gap-2"
                    >
                        <RefreshCcw size={14} /> Refresh
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportXLSX} className="gap-2">
                        <FileSpreadsheet size={14} /> Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                        <Printer size={14} /> Print
                    </Button>
                </div>
            </div>

            {/* Godown Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
                    <Filter size={12} className="inline mr-1" />Godown:
                </span>
                <button
                    onClick={() => setSelectedGodown('all')}
                    className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
                        selectedGodown === 'all'
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-primary/30 hover:text-primary'
                    )}
                >
                    All
                </button>
                {godowns.map(g => (
                    <button
                        key={g.godown_id}
                        onClick={() => setSelectedGodown(g.godown_id)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
                            selectedGodown === g.godown_id
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-primary/30 hover:text-primary'
                        )}
                    >
                        {g.name}
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <div className="relative w-full md:w-72 print:hidden">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Object.entries(godownSummaries).map(([id, s], idx) => {
                    const colors = [
                        'border-l-blue-500',
                        'border-l-emerald-500',
                        'border-l-amber-500',
                        'border-l-rose-500',
                        'border-l-violet-500',
                        'border-l-cyan-500',
                    ];
                    return (
                        <div
                            key={id}
                            className={cn(
                                'bg-white rounded-xl border border-slate-200 border-l-4 p-4 shadow-sm',
                                colors[idx % colors.length]
                            )}
                        >
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                {s.godown.name}
                            </p>
                            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opening</p>
                                    <p className="text-sm font-bold text-slate-700">{displayValue(s.opening) || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Inward</p>
                                    <p className="text-sm font-bold text-emerald-600">+{displayValue(s.inward) || 0}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Outward</p>
                                    <p className="text-sm font-bold text-rose-600">-{displayValue(s.outward) || 0}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Closing</p>
                                    <p className="text-sm font-black text-slate-900">{displayValue(s.closing) || '-'}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {/* Godown Match Badge */}
                {godowns.length > 1 && (
                    <div className={cn(
                        'rounded-xl border-2 p-4 flex items-center justify-center',
                        godownMatch.match
                            ? 'bg-green-50 border-green-300'
                            : 'bg-red-50 border-red-300'
                    )}>
                        <div className="text-center">
                            <p className={cn(
                                'text-xs font-black uppercase tracking-wider',
                                godownMatch.match ? 'text-green-700' : 'text-red-700'
                            )}>
                                {godownMatch.match ? '✓ Godown Match' : '✗ Godown Mismatch'}
                            </p>
                            {!godownMatch.match && (
                                <p className="text-[10px] text-red-500 font-medium mt-1">
                                    Diff: {godownMatch.diff.toFixed(1)}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Date Info Bar */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>
                    Showing data for <strong className="text-slate-600">{selectedDate}</strong>
                </span>
                <span>
                    {productGrid.sizes.length} sizes × {productGrid.brands.length} products
                    {' | '}Total: <strong className="text-slate-600">{productGrid.grandTotal}</strong> units
                </span>
            </div>

            {/* Main Pivot Grid */}
            {productGrid.sizes.length > 0 && productGrid.brands.length > 0 ? (
                <div className="erp-table-container overflow-hidden print:border-none print:shadow-none">
                    <div className="overflow-x-auto max-w-full" style={{ maxHeight: '70vh' }}>
                        <table className="erp-table w-full text-xs print:text-[8px]">
                            <thead className="sticky top-0 z-20">
                                {/* Column Group Header Row */}
                                <tr className="bg-blue-600 text-white">
                                    <th className="sticky left-0 z-30 bg-blue-600 text-white px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider min-w-[80px]">
                                        Size ↓ / Product →
                                    </th>
                                    {productGrid.brands.map(brand => (
                                        <th
                                            key={brand}
                                            className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider border-l border-blue-500/30 min-w-[90px] max-w-[140px] truncate"
                                            title={brand}
                                        >
                                            {brand}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider bg-blue-700 border-l border-blue-500/30 min-w-[60px] sticky right-0 z-20">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {productGrid.sizes.map((size, si) => {
                                    const sizeTotal = productGrid.sizeTotals[size];
                                    const isEvenRow = si % 2 === 0;
                                    return (
                                        <tr
                                            key={size}
                                            className={cn(
                                                'hover:bg-blue-50/40 transition-colors',
                                                isEvenRow ? 'bg-white' : 'bg-slate-50/30'
                                            )}
                                        >
                                            <td className={cn(
                                                'sticky left-0 z-10 px-3 py-2 font-bold text-slate-700 text-[11px]',
                                                isEvenRow ? 'bg-white' : 'bg-slate-50/30',
                                                'group-hover:bg-blue-50/40'
                                            )}>
                                                {size}
                                            </td>
                                            {productGrid.brands.map(brand => {
                                                const val = productGrid.grid[size]?.[brand] || 0;
                                                return (
                                                    <td
                                                        key={brand}
                                                        className={cn(
                                                            'px-2 py-2 text-center font-mono text-[11px]',
                                                            val > 0 ? 'text-slate-800 font-semibold' : 'text-slate-300',
                                                            val < 0 ? 'text-rose-600 font-semibold' : ''
                                                        )}
                                                    >
                                                        {displayValue(val)}
                                                    </td>
                                                );
                                            })}
                                            <td className="sticky right-0 z-10 px-3 py-2 text-center font-bold bg-blue-50 text-blue-700 border-l border-slate-200 text-[11px]">
                                                {sizeTotal}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {/* Grand Total Row */}
                                <tr className="bg-yellow-50 font-bold border-t-2 border-yellow-400 sticky bottom-0 z-10">
                                    <td className="sticky left-0 z-20 bg-yellow-50 px-3 py-2.5 text-[11px] text-slate-800 font-black uppercase">
                                        TOTAL
                                    </td>
                                    {productGrid.brands.map(brand => {
                                        const t = productGrid.brandTotals[brand] || 0;
                                        return (
                                            <td
                                                key={brand}
                                                className={cn(
                                                    'px-2 py-2.5 text-center font-mono text-[11px] font-bold',
                                                    t > 0 ? 'text-slate-900' : 'text-slate-400',
                                                    t < 0 ? 'text-rose-700' : ''
                                                )}
                                            >
                                                {displayValue(t)}
                                            </td>
                                        );
                                    })}
                                    <td className="sticky right-0 z-20 bg-yellow-50 px-3 py-2.5 text-center font-black text-yellow-700 border-l border-yellow-300 text-[11px]">
                                        {productGrid.grandTotal}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
                    <ClipboardList size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-medium text-slate-600">No stock data found</p>
                    <p className="text-xs mt-1">Try selecting a different date or godown.</p>
                </div>
            )}

            {/* Transaction Detail Modal - inline simple version */}
            <style>{`
                @media print {
                    body * { visibility: visible !important; }
                    .print\\:hidden { display: none !important; }
                    .erp-table-container { overflow: visible !important; max-height: none !important; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                    @page { size: landscape; margin: 10mm; }
                }
            `}</style>
        </div>
    );
};

export default StockLedger;
