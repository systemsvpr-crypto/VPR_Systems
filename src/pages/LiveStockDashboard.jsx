import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, ArrowDown, ArrowUp, Truck } from 'lucide-react';
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
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGodown, setFilterGodown] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [dayTransactions, setDayTransactions] = useState([]);
    const [stockOutEntries, setStockOutEntries] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterGodown]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [productsRes, godownsRes, transactionsRes, stockOutRes, transportersRes] = await Promise.all([
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('stock_management').select('*').eq('date', summaryDate),
                supabase.from('stock_management')
                    .select('*, transporters(name), godowns!stock_management_godown_id_fkey(name)')
                    .eq('transaction_type', 'out')
                    .order('created_at', { ascending: false }),
                supabase.from('transporters').select('*').eq('is_active', true)
            ]);
            
            setProducts(productsRes.data || []);
            setGodowns(godownsRes.data || []);
            setDayTransactions(transactionsRes.data || []);
            setStockOutEntries(stockOutRes.data || []);
            setTransporters(transportersRes.data || []);
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

    // Metrics calculation
    const metrics = useMemo(() => {
        const totalProducts = products.length;
        const totalWeight = enrichedStock.reduce((sum, s) => sum + ((parseFloat(s.mux) || 0) * (parseFloat(s.current_stock) || 0)), 0);
        const lowStockItems = enrichedStock.filter(s => s.current_stock <= 10).length;
        const activeTransits = stockOutEntries.length;

        return {
            totalProducts,
            totalWeight: totalWeight.toFixed(2),
            lowStockItems,
            activeTransits
        };
    }, [products, enrichedStock, stockOutEntries]);

    // Dynamic Master Summary Logic
    const dynamicSummary = useMemo(() => {
        return products.map(p => {
            const pTransactions = dayTransactions.filter(t => t.product_id === p.product_id && t.godown_id === p.godown_id);
            const in_stock = pTransactions.filter(t => t.transaction_type === 'in').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            const out_stock = pTransactions.filter(t => t.transaction_type === 'out').reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            
            // If date is today, closing is current stock.
            // Opening = current - in + out
            const isToday = summaryDate === new Date().toISOString().split('T')[0];
            const closing_stock = p.closing_quantity || 0;
            const opening_stock = closing_stock - in_stock + out_stock;

            const godown = getGodownDetails(p.godown_id);

            return {
                product_id: p.product_id,
                product_name: p.name,
                godown_id: p.godown_id,
                godown_name: godown.name || p.godown_id,
                mux: p.mux || '',
                opening_stock: isToday ? opening_stock : '-', // Only accurate for today without historical chain
                in_stock,
                out_stock,
                closing_stock: isToday ? closing_stock : '-',
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

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Stock Dashboard</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage and view inventory.</p>
            </div>

            {/* Status Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                <MetricCard 
                    label="Total Products" 
                    value={metrics.totalProducts} 
                    icon={Package} 
                    color="blue" 
                />
                <MetricCard 
                    label="Total Weight (KG)" 
                    value={metrics.totalWeight} 
                    icon={MapPin} 
                    color="indigo" 
                />
                <MetricCard 
                    label="Low Stock Alert" 
                    value={metrics.lowStockItems} 
                    icon={ArrowDown} 
                    color="red" 
                    trend={metrics.lowStockItems > 0 ? "Check inventory" : "All good"}
                />
                <MetricCard 
                    label="In-Transit" 
                    value={metrics.activeTransits} 
                    icon={Truck} 
                    color="orange" 
                />
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
                <button
                    onClick={() => setActiveTab('in-transit')}
                    className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'in-transit' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Truck size={16} />
                    In-Transit
                    {stockOutEntries.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 text-xs font-medium rounded-full">
                            {stockOutEntries.length}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'master' && (
                <div className="flex flex-col gap-4">
                    {/* Date Picker */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-[280px]">
                                <DatePicker
                                    value={summaryDate}
                                    onChange={(e) => setSummaryDate(e.target.value)}
                                    name="summaryDate"
                                    placeholder="Select date"
                                />
                            </div>
                            {summaryDate && summaryDate !== new Date().toISOString().split('T')[0] && (
                                <Button
                                    variant="ghost"
                                    onClick={() => { setSummaryDate(new Date().toISOString().split('T')[0]); fetchData(); }}
                                    className="h-10 px-3 text-red-500 hover:text-red-600 hover:bg-red-50"
                                >
                                    <X size={16} />
                                    Clear
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => { setSummaryDate(new Date().toISOString().split('T')[0]); fetchData(); }} className="gap-2">
                                <RotateCcw size={16} />
                                Today
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

            {activeTab === 'in-transit' && (
                <div className="flex flex-col gap-4">
                    {loading ? (
                        <div className="text-center py-20 text-slate-500">Loading...</div>
                    ) : stockOutEntries.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                            <Truck className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">No products in transit</p>
                            <p className="text-slate-400 text-sm mt-1">Products dispatched to customers will appear here</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <HeaderCell>Entry ID</HeaderCell>
                                            <HeaderCell>Product</HeaderCell>
                                            <HeaderCell>Transporter</HeaderCell>
                                            <HeaderCell>Dispatcher</HeaderCell>
                                            <HeaderCell>Quantity</HeaderCell>
                                            <HeaderCell>Date</HeaderCell>
                                            <HeaderCell>LR Number</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {stockOutEntries.map((entry) => {
                                            const product = products.find(p => p.product_id === entry.product_id);
                                            return (
                                                <tr key={entry.entry_id} className="hover:bg-slate-50/80">
                                                    <td className="px-4 py-3 text-sm text-slate-900 font-mono">{entry.entry_id}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                                                                 <Package size={12} className="text-orange-600" />
                                                            </div>
                                                            <div>
                                                                <span className="text-sm font-medium text-slate-900 block">{product?.name || entry.product_id}</span>
                                                                <span className="text-[10px] text-slate-500 uppercase">{product?.product_id}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Truck size={14} className="text-slate-400" />
                                                            <span className="text-sm text-slate-600 font-medium">
                                                                {entry.transporters?.name || 'Self Carry'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-slate-800">{entry.godowns?.name || entry.godown_id}</span>
                                                            <span className="text-[10px] text-slate-500">Dispatch Godown</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm font-bold text-orange-600">-{entry.quantity}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">{entry.date}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">
                                                        <div className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-mono w-fit">
                                                            {entry.lr_number || 'N/A'}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Truck size={18} className="text-orange-500" />
                                        <span className="text-sm font-medium text-slate-700">Total In-Transit</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-slate-500">{stockOutEntries.length} entries</span>
                                        <span className="text-lg font-bold text-orange-600">
                                            {stockOutEntries.reduce((sum, e) => sum + (parseInt(e.quantity) || 0), 0)} units
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
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

const MetricCard = ({ label, value, icon: Icon, color, trend }) => {
    const colors = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        orange: 'bg-orange-50 text-orange-600 border-orange-100',
        red: 'bg-red-50 text-red-600 border-red-100',
    };

    return (
        <div className={cn("p-4 rounded-2xl border flex flex-col gap-1 shadow-sm transition-all hover:shadow-md", colors[color])}>
            <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-xl bg-white/80")}>
                    <Icon size={20} />
                </div>
                {trend && <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{trend}</span>}
            </div>
            <div className="mt-2">
                <h3 className="text-2xl font-black">{value}</h3>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{label}</p>
            </div>
        </div>
    );
};