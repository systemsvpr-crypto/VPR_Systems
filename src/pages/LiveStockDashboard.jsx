import React, { useState, useEffect, useMemo } from 'react';
import { Search, Package, MapPin, RotateCcw, X, ArrowRightLeft, ArrowDown, ArrowUp, Truck } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';

const ITEMS_PER_PAGE = 8;

const LiveStockDashboard = () => {
    const [activeTab, setActiveTab] = useState('master');
    const [stockData, setStockData] = useState([]);
    const [products, setProducts] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGodown, setFilterGodown] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [currentPage, setCurrentPage] = useState(1);
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [summaryData, setSummaryData] = useState([]);
    const [internalTransfers, setInternalTransfers] = useState([]);
    const [stockOutEntries, setStockOutEntries] = useState([]);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [selectedTransferGodown, setSelectedTransferGodown] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterGodown]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [stockRes, productsRes, godownsRes, summaryRes, transfersRes, stockOutRes] = await Promise.all([
                supabase.from('product_godown_stock').select('*').order('updated_at', { ascending: false }),
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('daily_stock_summary').select('*').eq('date', summaryDate).order('godown_id', { ascending: true }),
                supabase.from('internal_transactions').select('*').eq('transfer_date', summaryDate),
                supabase.from('stock_management').select('*').eq('transaction_type', 'out').order('created_at', { ascending: false })
            ]);
            if (stockRes.error) throw stockRes.error;
            setStockData(stockRes.data || []);
            setProducts(productsRes.data || []);
            setGodowns(godownsRes.data || []);
            setSummaryData(summaryRes.data || []);
            setInternalTransfers(transfersRes.data || []);
            setStockOutEntries(stockOutRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch stock data');
        } finally {
            setLoading(false);
        }
    };

    const getProductDetails = (productId) => products.find(p => p.product_id === productId) || {};
    const getGodownDetails = (godownId) => godowns.find(g => g.godown_id === godownId) || {};

    const enrichedStock = useMemo(() => {
        return stockData.map(stock => {
            const product = getProductDetails(stock.product_id);
            const godown = getGodownDetails(stock.godown_id);
            return {
                ...stock,
                product_name: product.name || stock.product_id,
                product_sku: product.sku || '',
                product_unit: product.unit || '',
                godown_name: godown.name || stock.godown_id,
                current_stock: parseFloat(stock.current_stock) || 0
            };
        });
    }, [stockData, products, godowns]);

    const filteredStock = useMemo(() => {
        return enrichedStock.filter(s => {
            const matchesSearch =
                s.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.product_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGodown = !filterGodown || s.godown_id === filterGodown;
            return matchesSearch && matchesGodown;
        });
    }, [enrichedStock, searchTerm, filterGodown]);

    const totalPages = Math.ceil(filteredStock.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredStock.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredStock, currentPage]);

    const enrichedSummary = useMemo(() => {
        return summaryData.map(s => {
            const product = getProductDetails(s.product_id);
            const godown = getGodownDetails(s.godown_id);
            return {
                ...s,
                product_name: product.name || s.product_id,
                product_sku: product.sku || '',
                product_unit: product.unit || '',
                godown_name: godown.name || s.godown_id,
            };
        });
    }, [summaryData, products, godowns]);

    const filteredSummary = useMemo(() => {
        return enrichedSummary.filter(s => {
            const matchesSearch =
                s.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.product_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGodown = !filterGodown || s.godown_id === filterGodown;
            return matchesSearch && matchesGodown;
        });
    }, [enrichedSummary, searchTerm, filterGodown]);

    useEffect(() => {
        fetchData();
    }, [summaryDate]);

    // Real-time subscription for all tables
    useEffect(() => {
        const stockChannel = supabase
            .channel('live-stock-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'product_godown_stock' },
                () => fetchData()
            )
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
                { event: '*', schema: 'public', table: 'daily_stock_summary' },
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

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200">
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
                        <Button variant="outline" onClick={() => { setSummaryDate(new Date().toISOString().split('T')[0]); fetchData(); }} className="gap-2">
                            <RotateCcw size={16} />
                            Today
                        </Button>
                    </div>

                    {/* Master Inventory - Single Row Table Style */}
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
                                        <HeaderCell>Stock Transfer</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {godowns.map(godown => {
                                        const godownSummary = summaryData.filter(s => s.godown_id === godown.godown_id);
                                        const totalOpening = godownSummary.reduce((sum, s) => sum + (parseFloat(s.opening_stock) || 0), 0);
                                        const totalIn = godownSummary.reduce((sum, s) => sum + (parseFloat(s.in_stock) || 0), 0);
                                        const totalOut = godownSummary.reduce((sum, s) => sum + (parseFloat(s.out_stock) || 0), 0);
                                        const totalClosing = godownSummary.reduce((sum, s) => sum + (parseFloat(s.closing_stock) || 0), 0);
                                        const stockTransfer = totalIn - totalOut;

                                        const transfersIn = internalTransfers
                                            .filter(t => t.to_godown_id === godown.godown_id)
                                            .map(t => {
                                                const fromGodown = godowns.find(g => g.godown_id === t.from_godown_id);
                                                return {
                                                    from: fromGodown?.name || t.from_godown_id,
                                                    quantity: parseFloat(t.quantity) || 0
                                                };
                                            });
                                        const transfersOut = internalTransfers
                                            .filter(t => t.from_godown_id === godown.godown_id)
                                            .map(t => {
                                                const toGodown = godowns.find(g => g.godown_id === t.to_godown_id);
                                                return {
                                                    to: toGodown?.name || t.to_godown_id,
                                                    quantity: parseFloat(t.quantity) || 0
                                                };
                                            });

                                        return (
                                            <tr
                                                key={godown.godown_id}
                                                className="hover:bg-slate-50/80"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={16} className="text-blue-600" />
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{godown.name}</p>
                                                            <p className="text-xs text-slate-500">{godown.city}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium">{totalOpening.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-green-600">+{totalIn.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-red-600">-{totalOut.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-sm font-bold">{totalClosing.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    {(transfersIn.length > 0 || transfersOut.length > 0) ? (
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                <span className={`text-sm font-bold shrink-0 ${stockTransfer >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {stockTransfer >= 0 ? '+' : ''}{stockTransfer.toLocaleString()}
                                                                </span>
                                                                <div className="space-y-0.5 min-w-0">
                                                                    {transfersIn.length > 0 && (
                                                                        <div className="text-xs truncate">
                                                                            <span className="text-green-600 font-medium">In: </span>
                                                                            {transfersIn.map((t, i) => (
                                                                                <span key={i} className="text-green-700">
                                                                                    {t.quantity} from {t.from}{i < transfersIn.length - 1 ? ', ' : ''}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {transfersOut.length > 0 && (
                                                                        <div className="text-xs truncate">
                                                                            <span className="text-red-600 font-medium">Out: </span>
                                                                            {transfersOut.map((t, i) => (
                                                                                <span key={i} className="text-red-700">
                                                                                    {t.quantity} to {t.to}{i < transfersOut.length - 1 ? ', ' : ''}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => { setSelectedTransferGodown(godown); setTransferModalOpen(true); }}
                                                                className="px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded cursor-pointer shrink-0"
                                                            >
                                                                View
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Summary Table */}
                    {filteredSummary.length > 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <HeaderCell>Godown</HeaderCell>
                                            <HeaderCell>Product</HeaderCell>
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
                                                <td className="px-4 py-3 text-sm font-medium">{parseFloat(s.opening_stock) || 0}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-green-600">+{parseFloat(s.in_stock) || 0}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-red-600">-{parseFloat(s.out_stock) || 0}</td>
                                                <td className="px-4 py-3 text-sm font-bold">{parseFloat(s.closing_stock) || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200">
                            Loading........
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
                                            <HeaderCell>Current Stock</HeaderCell>
                                            <HeaderCell>Unit</HeaderCell>
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
                                                            <p className="text-xs text-slate-500">{stock.product_sku}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-900">{stock.godown_name}</td>
                                                <td className="px-4 py-3 text-sm font-bold">{stock.current_stock}</td>
                                                <td className="px-4 py-3 text-sm text-slate-500">{stock.product_unit || '-'}</td>
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
                                            <HeaderCell>Godown</HeaderCell>
                                            <HeaderCell>Quantity</HeaderCell>
                                            <HeaderCell>Date</HeaderCell>
                                            <HeaderCell>LR Number</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {stockOutEntries.map((entry) => {
                                            const product = products.find(p => p.product_id === entry.product_id);
                                            const godown = godowns.find(g => g.godown_id === entry.godown_id);
                                            return (
                                                <tr key={entry.entry_id} className="hover:bg-slate-50/80">
                                                    <td className="px-4 py-3 text-sm text-slate-900 font-mono">{entry.entry_id}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                                                                <Package size={12} className="text-orange-600" />
                                                            </div>
                                                            <span className="text-sm font-medium text-slate-900">{product?.name || entry.product_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-600">{godown?.name || entry.godown_id}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm font-bold text-orange-600">-{entry.quantity}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">{entry.date}</td>
                                                    <td className="px-4 py-3 text-sm text-slate-500">{entry.lr_number || '-'}</td>
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

            {/* Stock Transfer Details Modal */}
            {transferModalOpen && selectedTransferGodown && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setTransferModalOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Stock Transfer Details</h2>
                                <p className="text-sm text-slate-500">{selectedTransferGodown.name} - {summaryDate}</p>
                            </div>
                            <Button variant="ghost" size="icon" type="button" onClick={() => setTransferModalOpen(false)} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {/* Transfers IN */}
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <ArrowDown size={16} className="text-green-600" />
                                    Transfers In (Received)
                                </h3>
                                {internalTransfers.filter(t => t.to_godown_id === selectedTransferGodown.godown_id).length === 0 ? (
                                    <div className="text-center py-4 text-slate-500 text-sm">No transfers received</div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Product</th>
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">From Godown</th>
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {internalTransfers.filter(t => t.to_godown_id === selectedTransferGodown.godown_id).map((t, idx) => {
                                                    const fromGodown = godowns.find(g => g.godown_id === t.from_godown_id);
                                                    const product = products.find(p => p.product_id === t.product_id);
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-2 text-sm text-slate-900">{product?.name || t.product_id}</td>
                                                            <td className="px-4 py-2 text-sm text-slate-600">{fromGodown?.name || t.from_godown_id}</td>
                                                            <td className="px-4 py-2 text-sm font-medium text-green-600 text-right">+{parseFloat(t.quantity) || 0}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Transfers OUT */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <ArrowUp size={16} className="text-red-600" />
                                    Transfers Out (Sent)
                                </h3>
                                {internalTransfers.filter(t => t.from_godown_id === selectedTransferGodown.godown_id).length === 0 ? (
                                    <div className="text-center py-4 text-slate-500 text-sm">No transfers sent</div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Product</th>
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">To Godown</th>
                                                    <th className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {internalTransfers.filter(t => t.from_godown_id === selectedTransferGodown.godown_id).map((t, idx) => {
                                                    const toGodown = godowns.find(g => g.godown_id === t.to_godown_id);
                                                    const product = products.find(p => p.product_id === t.product_id);
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-2 text-sm text-slate-900">{product?.name || t.product_id}</td>
                                                            <td className="px-4 py-2 text-sm text-slate-600">{toGodown?.name || t.to_godown_id}</td>
                                                            <td className="px-4 py-2 text-sm font-medium text-red-600 text-right">-{parseFloat(t.quantity) || 0}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <Button onClick={() => setTransferModalOpen(false)} className="w-full sm:w-auto px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveStockDashboard;

const StockCard = ({ stock }) => {
    const stockLevel = stock.current_stock > 100 ? 'high' : stock.current_stock > 10 ? 'medium' : 'low';

    const levelColors = { high: 'bg-green-500', medium: 'bg-yellow-500', low: 'bg-red-500' };
    const levelBg = { high: 'bg-green-50', medium: 'bg-yellow-50', low: 'bg-red-50' };

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <Package size={20} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelBg[stockLevel]} ${stockLevel === 'high' ? 'text-green-700' : stockLevel === 'medium' ? 'text-yellow-700' : 'text-red-700'}`}>
                    {stockLevel === 'high' ? 'In Stock' : stockLevel === 'medium' ? 'Low' : 'Critical'}
                </span>
            </div>

            <h3 className="font-semibold text-slate-900 text-sm mb-1">{stock.product_name}</h3>
            <p className="text-xs text-slate-500 mb-3">{stock.godown_name}</p>

            <div className="flex items-end justify-between">
                <div>
                    <p className="text-2xl font-bold text-slate-900">{stock.current_stock}</p>
                    <p className="text-xs text-slate-500">{stock.product_unit || 'units'}</p>
                </div>
                <div className={`h-1.5 w-16 rounded-full ${levelColors[stockLevel]}`}></div>
            </div>
        </div>
    );
};

const HeaderCell = ({ children, align = "left" }) => (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
        {children}
    </th>
);