import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, ArrowUp, Download, RefreshCcw } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 8;

const LiveStockDashboard = () => {
    const [activeTab, setActiveTab] = useState('master');
    const [products, setProducts] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGodown, setFilterGodown] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [dayTransactions, setDayTransactions] = useState([]);
    const [dailySnapshots, setDailySnapshots] = useState([]);
    const [selectedTransfer, setSelectedTransfer] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterGodown]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [productsRes, godownsRes, transactionsRes, snapshotsRes] = await Promise.all([
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('stock_management').select('*').eq('date', summaryDate),
                supabase.from('daily_stock_summary').select('*').eq('date', summaryDate)
            ]);
            
            setProducts(productsRes.data || []);
            setGodowns(godownsRes.data || []);
            setDayTransactions(transactionsRes.data || []);
            setDailySnapshots(snapshotsRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch stock data');
        } finally {
            setLoading(false);
        }
    };

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
                master_opening: product.opening_quantity || 0,
                master_closing: product.closing_quantity || 0,
            };
        });
    }, [products, godowns]);

    const filteredStock = useMemo(() => {
        return enrichedStock.filter(s => {
            const matchesSearch =
                s.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.product_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGodown = !filterGodown || s.godown_id === filterGodown;
            return matchesSearch && matchesGodown;
        });
    }, [enrichedStock, searchTerm, filterGodown]);


    // Dynamic Master Summary Logic
    const dynamicSummary = useMemo(() => {
        return products.map(p => {
            const pTransactions = dayTransactions.filter(t => t.product_id === p.product_id && t.godown_id === p.godown_id);
            const in_stock = pTransactions.filter(t => t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            const out_stock = pTransactions.filter(t => t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            
            // If date is today, closing is current stock.
            // Opening = current - in + out
            const isToday = summaryDate === new Date().toISOString().split('T')[0];
            
            // Try to find snapshot for this product + godown
            const snapshot = dailySnapshots.find(s => s.product_id === p.product_id && s.godown_id === p.godown_id);

            const closing_stock = isToday ? (p.closing_quantity || 0) : (snapshot ? snapshot.closing_stock : 0);
            const opening_stock = isToday ? (closing_stock - in_stock + out_stock) : (snapshot ? snapshot.opening_stock : 0);

            const godown = getGodownDetails(p.godown_id);

            return {
                product_id: p.product_id,
                product_name: p.name,
                godown_id: p.godown_id,
                godown_name: godown.name || p.godown_id,
                mux: p.mux || '',
                opening_stock: isToday || snapshot ? opening_stock : '-', 
                in_stock,
                out_stock,
                transfers: dayTransactions.filter(t => t.product_id === p.product_id && (t.godown_id === p.godown_id ? t.from_location : t.from_location === p.godown_id)).length > 0
                    ? (dayTransactions.filter(t => t.product_id === p.product_id && t.godown_id === p.godown_id && t.from_location).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0) +
                       dayTransactions.filter(t => t.product_id === p.product_id && t.from_location === p.godown_id).reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0))
                    : 0,
                closing_stock: isToday || snapshot ? closing_stock : '-',
                master_opening: p.opening_quantity || 0,
                master_closing: p.closing_quantity || 0,
            };
        });
    }, [products, dayTransactions, summaryDate, godowns]);

    const filteredSummary = useMemo(() => {
        return dynamicSummary.filter(s => {
            const matchesSearch =
                s.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.product_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGodown = !filterGodown || s.godown_id === filterGodown;
            return matchesSearch && matchesGodown;
        });
    }, [dynamicSummary, searchTerm, filterGodown]);

    const totalPages = Math.ceil(filteredStock.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredStock.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredStock, currentPage]);

    useEffect(() => {
        fetchData();
    }, [summaryDate]);

    // Real-time subscription for relevant tables
    useEffect(() => {
        const stockChannel = supabase
            .channel('live-stock-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => fetchData()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'godowns' },
                () => fetchData()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'stock_management' },
                () => fetchData()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(stockChannel);
        };
    }, [summaryDate]);

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
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Stock Dashboard</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage and view inventory.</p>
            </div>


            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 mt-2">
                <button
                    onClick={() => setActiveTab('master')}
                    className={`pb-3 text-sm font-medium transition-all ${activeTab === 'master' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Master Inventory
                </button>
                <button
                    onClick={() => setActiveTab('live')}
                    className={`pb-3 text-sm font-medium transition-all ${activeTab === 'live' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Live Stock
                </button>
            </div>

            {activeTab === 'master' && (
                <div className="flex flex-col gap-4">
                    {/* Date Picker */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button 
                                onClick={fetchData} 
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
                            >
                                <RefreshCcw size={16} className={cn(loading && "animate-spin")} />
                                Refresh
                            </Button>
                        </div>

                        <div className="flex items-center gap-3">
                            {summaryDate && summaryDate !== new Date().toISOString().split('T')[0] && (
                                <Button
                                    variant="ghost"
                                    onClick={() => { setSummaryDate(new Date().toISOString().split('T')[0]); fetchData(); }}
                                    className="h-10 px-3 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                >
                                    <X size={16} />
                                    Clear
                                </Button>
                            )}

                            <div className="w-[240px]">
                                <DatePicker
                                    value={summaryDate}
                                    onChange={(e) => setSummaryDate(e.target.value)}
                                    name="summaryDate"
                                    placeholder="Select date"
                                />
                            </div>

                            <Button 
                                variant="outline" 
                                onClick={handleExport} 
                                disabled={!summaryDate}
                                className={cn(
                                    "gap-2 transition-all rounded-xl border border-emerald-200",
                                    summaryDate 
                                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm" 
                                        : "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200"
                                )}
                            >
                                <Download size={16} />
                                Export CSV
                            </Button>
                        </div>
                    </div>

                    {/* Godown-wise Aggregated Summary Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <HeaderCell>Godown Name</HeaderCell>
                                        <HeaderCell>Opening</HeaderCell>
                                        <HeaderCell>In</HeaderCell>
                                        <HeaderCell>Out</HeaderCell>
                                        <HeaderCell>Closing</HeaderCell>
                                        <HeaderCell>Transfers</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {godowns.map(godown => {
                                        const gTransactions = dayTransactions.filter(t => t.godown_id === godown.godown_id);
                                        const totalIn = gTransactions.filter(t => t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                        const totalOut = gTransactions.filter(t => t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
                                        
                                        const gProducts = products.filter(p => p.godown_id === godown.godown_id);
                                        const totalClosing = gProducts.reduce((sum, p) => sum + (parseFloat(p.closing_quantity) || 0), 0);
                                        const totalOpening = totalClosing - totalIn + totalOut;
                                        const isToday = summaryDate === new Date().toISOString().split('T')[0];

                                        return (
                                            <tr key={godown.godown_id} className="hover:bg-slate-50/80">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={16} className="text-blue-600" />
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{godown.name}</p>
                                                            <p className="text-xs text-slate-500">{godown.city}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium">{isToday ? totalOpening.toLocaleString() : '-'}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-green-600">+{totalIn.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-red-600">-{totalOut.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-sm font-bold">{isToday ? totalClosing.toLocaleString() : '-'}</td>
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
                        <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200">
                            Loading Stock Metrics...
                        </div>
                    ) : filteredSummary.length > 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <HeaderCell>Godown</HeaderCell>
                                            <HeaderCell>Product</HeaderCell>
                                            <HeaderCell>MUX</HeaderCell>
                                            <HeaderCell>Master Opening</HeaderCell>
                                            <HeaderCell>Master Closing</HeaderCell>
                                            <HeaderCell>Opening Stock</HeaderCell>
                                            <HeaderCell>In Stock</HeaderCell>
                                            <HeaderCell>Out Stock</HeaderCell>
                                            <HeaderCell>Closing Stock</HeaderCell>
                                            <HeaderCell>Transfers</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredSummary.map((s, idx) => (
                                            <tr key={`${s.godown_id}-${s.product_id}-${idx}`} className="hover:bg-slate-50/80">
                                                <td className="px-4 py-3 text-sm text-slate-900">{s.godown_name}</td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{s.product_name}</td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{s.mux || '-'}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-slate-500">{s.master_opening}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-slate-500">{s.master_closing}</td>
                                                <td className="px-4 py-3 text-sm font-medium">{s.opening_stock}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-green-600">+{s.in_stock}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-red-600">-{s.out_stock}</td>
                                                <td className="px-4 py-3 text-sm font-bold">{s.closing_stock}</td>
                                                <td className="px-4 py-3">
                                                    <button 
                                                       onClick={() => setSelectedTransfer({ type: 'product', id: s.product_id, godown_id: s.godown_id, name: s.product_name })}
                                                       className={cn(
                                                           "text-sm font-medium px-2 py-1 rounded-md transition-colors",
                                                           s.transfers > 0 ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "text-slate-400 cursor-default"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {currentItems.map((stock) => (
                                <StockCard
                                    key={`${stock.product_id}-${stock.godown_id}`}
                                    stock={stock}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <HeaderCell>Product</HeaderCell>
                                            <HeaderCell>Godown</HeaderCell>
                                            <HeaderCell>MUX</HeaderCell>
                                            <HeaderCell>Units</HeaderCell>
                                            <HeaderCell>Weight (KG)</HeaderCell>
                                            <HeaderCell>Master Opening</HeaderCell>
                                            <HeaderCell>Master Closing</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentItems.map((stock) => (
                                            <tr key={`${stock.product_id}-${stock.godown_id}`} className="hover:bg-slate-50/80">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                                            <Package size={14} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{stock.product_name}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{stock.godown_name}</td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{stock.mux || '-'}</td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{stock.current_stock}</td>
                                                <td className="px-4 py-3 text-sm font-bold text-primary">
                                                    {((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(3)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500">{stock.master_opening}</td>
                                                <td className="px-4 py-3 text-sm text-slate-500">{stock.master_closing}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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

    return (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/60 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 group">
            <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Package size={24} />
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border", levelBg[stockLevel])}>
                    {stockLevel === 'high' ? 'Healthy' : stockLevel === 'medium' ? 'Review' : 'Critical'}
                </span>
            </div>

            <div className="space-y-1 mb-4">
                <h3 className="font-bold text-slate-900 text-base leading-tight group-hover:text-primary transition-colors">{stock.product_name}</h3>
                <div className="flex items-center gap-1.5 text-slate-500">
                    <MapPin size={12} />
                    <span className="text-[11px] font-medium">{stock.godown_name}</span>
                </div>
            </div>

            <div className="relative pt-4 border-t border-slate-50 flex items-end justify-between overflow-hidden">
                <div className="z-10">
                    <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-black text-slate-900 tracking-tight">{stock.current_stock}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase">Qty</p>
                    </div>
                    {stock.mux && (
                        <div className="mt-2 flex flex-col">
                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Est. Weight</p>
                            <p className="text-base font-black text-indigo-600">
                                {((parseFloat(stock.mux) || 0) * (parseFloat(stock.current_stock) || 0)).toFixed(2)} <span className="text-[10px]">KG</span>
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 uppercase tracking-tighter">MUX: {stock.mux}</span>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Progress Bar Side */}
                <div className="flex flex-col items-center gap-2">
                    <div className="h-24 w-2 bg-slate-50 rounded-full overflow-hidden flex flex-col justify-end">
                        <div 
                            className={cn("w-full transition-all duration-700", levelColors[stockLevel])} 
                            style={{ height: `${Math.min(100, (stock.current_stock / 200) * 100)}%` }}
                        ></div>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 gap-2">
                <div className="text-center py-1 bg-slate-50 rounded-xl">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Opening</p>
                    <p className="text-xs font-bold text-slate-600">{stock.master_opening}</p>
                </div>
                <div className="text-center py-1 bg-blue-50/50 rounded-xl">
                    <p className="text-[9px] font-black text-blue-400 uppercase mb-0.5">Closing</p>
                    <p className="text-xs font-bold text-blue-700">{stock.master_closing}</p>
                </div>
            </div>
        </div>
    );
};

const HeaderCell = ({ children, align = "left" }) => (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
        {children}
    </th>
);

const TransferModal = ({ details, transactions, godowns, products, onClose }) => {
    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;

    const filteredTransfers = useMemo(() => {
        if (details.type === 'godown') {
            return transactions.filter(t => t.from_location === details.id || (t.godown_id === details.id && t.from_location));
        } else {
            return transactions.filter(t => t.product_id === details.id && (t.from_location === details.godown_id || (t.godown_id === details.godown_id && t.from_location)));
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
                                                    <p className="text-sm font-bold text-slate-900">{getProductName(t.product_id)}</p>
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
