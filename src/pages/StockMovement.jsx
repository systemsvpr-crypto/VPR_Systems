import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
    ArrowRightLeft,
    Calendar,
    MapPin,
    Package,
    Search,
    Download,
    RefreshCw,
    FileText,
    ArrowLeft,
    Move,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Activity,
    SlidersHorizontal,
    X,
    Clock,
    History,
    Eye,
    ChevronUp,
    ChevronDown
} from 'lucide-react';

const ITEMS_PER_PAGE = 25; // Increased page limit so more records are visible at once

const StockMovement = () => {
    const navigate = useNavigate();
    
    // Core Data States
    const [transfers, setTransfers] = useState([]);
    const [summaries, setSummaries] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [masterProducts, setMasterProducts] = useState([]);
    
    // Loading States
    const [loadingData, setLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Active Tab: 'transfers' | 'summaries'
    const [activeTab, setActiveTab] = useState('transfers');
    
    // Filter States
    const [startDate, setStartDate] = useState(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days ago
    );
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]); // today
    
    const [filterSourceGodown, setFilterSourceGodown] = useState('all');
    const [filterDestGodown, setFilterDestGodown] = useState('all');
    const [filterGodown, setFilterGodown] = useState('all'); // single godown filter for daily summary
    const [filterMasterProduct, setFilterMasterProduct] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Drilldown Detail Modal States
    const [selectedSummaryRow, setSelectedSummaryRow] = useState(null);
    const [detailTransactions, setDetailTransactions] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Expand states for Master Products
    const [expandedMasters, setExpandedMasters] = useState({});
    
    const toggleMasterExpand = (id) => {
        setExpandedMasters(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    // Fetch Reference Data (Godowns, Products, Master Products)
    const fetchMetadata = async () => {
        try {
            const [godownsRes, productsRes, masterProductsRes] = await Promise.all([
                supabase.from('godowns').select('godown_id, name, is_active').order('name'),
                supabase.from('products').select('id, product_id, name, godown_id, master_product_id, mux, is_active'),
                supabase.from('master_product').select('id, name, is_active').order('name')
            ]);
            
            if (godownsRes.error) throw godownsRes.error;
            if (productsRes.error) throw productsRes.error;
            if (masterProductsRes.error) throw masterProductsRes.error;
            
            setGodowns(godownsRes.data || []);
            setProducts(productsRes.data || []);
            setMasterProducts(masterProductsRes.data || []);
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
            // 1. Fetch all stock movements (transfers, receipts, dispatches)
            let transfersQuery = supabase
                .from('stock_management')
                .select('*')
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });
                
            if (startDate) transfersQuery = transfersQuery.gte('date', startDate);
            if (endDate) transfersQuery = transfersQuery.lte('date', endDate);
            
            // 2. Fetch daily stock summary
            let summariesQuery = supabase
                .from('daily_stock_summary')
                .select('*')
                .order('date', { ascending: false })
                .limit(5000); // safety cap
                
            if (startDate) summariesQuery = summariesQuery.gte('date', startDate);
            if (endDate) summariesQuery = summariesQuery.lte('date', endDate);
            
            const [transfersRes, summariesRes] = await Promise.all([
                transfersQuery,
                summariesQuery
            ]);
            
            if (transfersRes.error) throw transfersRes.error;
            if (summariesRes.error) throw summariesRes.error;
            
            setTransfers(transfersRes.data || []);
            setSummaries(summariesRes.data || []);
            
            if (isRefresh) {
                toast.success('Data synchronized successfully');
            }
        } catch (error) {
            console.error('Error fetching movement data:', error);
            toast.error('Failed to load stock ledger records');
        } finally {
            setLoadingData(false);
            setRefreshing(false);
        }
    }, [startDate, endDate]);

    // Initial and Dependency Load
    useEffect(() => {
        const loadAll = async () => {
            await fetchMetadata();
            await fetchMovementData();
        };
        loadAll();
    }, [fetchMovementData]);

    // Reset pagination on filter or tab change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSourceGodown, filterDestGodown, filterGodown, filterMasterProduct, activeTab]);

    // Lookup Helper Maps
    const godownMap = useMemo(() => {
        const map = {};
        godowns.forEach(g => { map[g.godown_id] = g.name; });
        return map;
    }, [godowns]);

    // Single unified product lookup dictionary keyed by text-based SKU (product_id)
    const productMap = useMemo(() => {
        const map = {};
        products.forEach(p => { map[p.product_id] = p; });
        return map;
    }, [products]);

    const masterProductMap = useMemo(() => {
        const map = {};
        masterProducts.forEach(mp => { map[mp.id] = mp.name; });
        return map;
    }, [masterProducts]);

    // Dynamically enrich summary snapshot list to ensure every active product is visible
    const enrichedSummaries = useMemo(() => {
        if (products.length === 0) return summaries;
        
        // Group existing database summaries by date, godown, and product
        const existingKeys = new Set(summaries.map(s => `${s.date}_${s.godown_id}_${s.product_id}`));
        const list = [...summaries];
        
        // Find unique dates from summaries, or use today as a fallback
        const uniqueDates = Array.from(new Set(summaries.map(s => s.date)));
        if (uniqueDates.length === 0) {
            uniqueDates.push(new Date().toISOString().split('T')[0]);
        }
        
        // Find unique godowns from summaries, or fall back to all active godowns
        let uniqueGodowns = Array.from(new Set(summaries.map(s => s.godown_id)));
        if (uniqueGodowns.length === 0 && godowns.length > 0) {
            uniqueGodowns = godowns.map(g => g.godown_id);
        }
        
        // Generate placeholder summary rows for missing products to ensure a complete sheet
        uniqueDates.forEach(d => {
            uniqueGodowns.forEach(gId => {
                products.forEach(p => {
                    if (p.is_active === false) return; // skip inactive products
                    
                    const key = `${d}_${gId}_${p.product_id}`;
                    if (!existingKeys.has(key)) {
                        list.push({
                            id: `placeholder-${key}`,
                            date: d,
                            godown_id: gId,
                            product_id: p.product_id,
                            opening_stock: 0,
                            in_stock: 0,
                            out_stock: 0,
                            closing_stock: 0,
                            is_placeholder: true
                        });
                        existingKeys.add(key);
                    }
                });
            });
        });
        
        // Sort descending by date, then by godown name, then by product SKU
        return list.sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            const godownCompare = a.godown_id.localeCompare(b.godown_id);
            if (godownCompare !== 0) return godownCompare;
            return a.product_id.localeCompare(b.product_id);
        });
    }, [summaries, products, godowns]);

    // Filtered Transfers Log
    const filteredTransfers = useMemo(() => {
        return transfers.filter(t => {
            // Must be an inter-godown transfer
            if (!t.from_location || !t.godown_id) return false;

            // Source godown filter
            if (filterSourceGodown !== 'all' && t.from_location !== filterSourceGodown) return false;
            
            // Destination godown filter
            if (filterDestGodown !== 'all' && t.godown_id !== filterDestGodown) return false;
            
            // Product mapping using text SKU
            const product = productMap[t.product_id];
            
            // Master Product filter
            if (filterMasterProduct !== 'all' && (!product || product.master_product_id !== filterMasterProduct)) return false;
            
            // Search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const entryMatch = t.entry_id?.toLowerCase().includes(term);
                const notesMatch = t.notes?.toLowerCase().includes(term);
                const refMatch = t.reference_number?.toLowerCase().includes(term);
                const prodNameMatch = product?.name?.toLowerCase().includes(term);
                const prodIdMatch = t.product_id?.toLowerCase().includes(term);
                
                if (!entryMatch && !notesMatch && !refMatch && !prodNameMatch && !prodIdMatch) return false;
            }
            
            return true;
        });
    }, [transfers, filterSourceGodown, filterDestGodown, filterMasterProduct, searchTerm, productMap]);

    // Filtered Daily Summary Log using enriched products list
    const filteredSummaries = useMemo(() => {
        return enrichedSummaries.filter(s => {
            // Godown filter
            if (filterGodown !== 'all' && s.godown_id !== filterGodown) return false;
            
            // Product mapping using text SKU
            const product = productMap[s.product_id];
            
            // Master Product filter
            if (filterMasterProduct !== 'all' && (!product || product.master_product_id !== filterMasterProduct)) return false;
            
            // Search filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const prodNameMatch = product?.name?.toLowerCase().includes(term);
                const prodIdMatch = s.product_id?.toLowerCase().includes(term);
                
                if (!prodNameMatch && !prodIdMatch) return false;
            }
            
            return true;
        });
    }, [enrichedSummaries, filterGodown, filterMasterProduct, searchTerm, productMap]);

    // Filtered Master Products
    const filteredMasterProducts = useMemo(() => {
        if (!searchTerm) return masterProducts;
        const term = searchTerm.toLowerCase();
        return masterProducts.filter(mp => mp.name?.toLowerCase().includes(term));
    }, [masterProducts, searchTerm]);

    // Compute total movement volumes for each variant product and master product in the selected date range
    const movementAnalytics = useMemo(() => {
        const productStats = {}; // product_id -> { in: 0, out: 0 }
        const masterStats = {};  // master_product_id -> { in: 0, out: 0 }
        
        // Initialize maps
        products.forEach(p => {
            productStats[p.product_id] = { in: 0, out: 0 };
            if (p.master_product_id) {
                masterStats[p.master_product_id] = { in: 0, out: 0 };
            }
        });
        
        // Loop through all movements (transfers + receipts + dispatches)
        transfers.forEach(t => {
            const qty = parseFloat(t.quantity || 0);
            
            // Check if from_location is set (means it moved OUT of that location)
            if (t.from_location) {
                if (filterGodown === 'all' || t.from_location === filterGodown) {
                    if (!productStats[t.product_id]) productStats[t.product_id] = { in: 0, out: 0 };
                    productStats[t.product_id].out += qty;
                }
            }
            
            // Check if godown_id is set (means it moved IN to that location)
            if (t.godown_id) {
                if (filterGodown === 'all' || t.godown_id === filterGodown) {
                    if (!productStats[t.product_id]) productStats[t.product_id] = { in: 0, out: 0 };
                    productStats[t.product_id].in += qty;
                }
            }
            
            // Standard non-transfer receipts/dispatches
            if (!t.from_location) {
                if (t.transaction_type === 'in') {
                    if (filterGodown === 'all' || t.godown_id === filterGodown) {
                        if (!productStats[t.product_id]) productStats[t.product_id] = { in: 0, out: 0 };
                        productStats[t.product_id].in += qty;
                    }
                } else if (t.transaction_type === 'out') {
                    if (filterGodown === 'all' || t.godown_id === filterGodown) {
                        if (!productStats[t.product_id]) productStats[t.product_id] = { in: 0, out: 0 };
                        productStats[t.product_id].out += qty;
                    }
                }
            }
        });
        
        // Roll up to Master Product stats
        products.forEach(p => {
            const stats = productStats[p.product_id];
            if (stats && p.master_product_id) {
                if (!masterStats[p.master_product_id]) {
                    masterStats[p.master_product_id] = { in: 0, out: 0 };
                }
                masterStats[p.master_product_id].in += stats.in;
                masterStats[p.master_product_id].out += stats.out;
            }
        });
        
        return {
            productStats,
            masterStats
        };
    }, [transfers, products, filterGodown]);

    // Stat Computations for selected range
    const stats = useMemo(() => {
        if (activeTab === 'transfers') {
            const totalTransfers = filteredTransfers.length;
            const totalVolume = filteredTransfers.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
            
            const uniqueProducts = new Set(filteredTransfers.map(t => t.product_id)).size;
            const activeGodownsSet = new Set();
            filteredTransfers.forEach(t => {
                if (t.from_location) activeGodownsSet.add(t.from_location);
                if (t.godown_id) activeGodownsSet.add(t.godown_id);
            });
            
            return {
                card1Label: 'Total Movements',
                card1Value: totalTransfers,
                card2Label: 'Volume Moved',
                card2Value: totalVolume.toLocaleString() + ' Bags',
                card3Label: 'Products Moved',
                card3Value: uniqueProducts,
                card4Label: 'Active Godowns',
                card4Value: activeGodownsSet.size
            };
        } else if (activeTab === 'summaries') {
            const totalRecords = filteredSummaries.length;
            const totalIn = filteredSummaries.reduce((sum, s) => sum + (parseFloat(s.in_stock) || 0), 0);
            const totalOut = filteredSummaries.reduce((sum, s) => sum + (parseFloat(s.out_stock) || 0), 0);
            const netChange = totalIn - totalOut;
            
            return {
                card1Label: 'Summary Records',
                card1Value: totalRecords,
                card2Label: 'Total Inflow (Stock In)',
                card2Value: totalIn.toLocaleString() + ' Bags',
                card3Label: 'Total Outflow (Stock Out)',
                card3Value: totalOut.toLocaleString() + ' Bags',
                card4Label: 'Net Inventory Change',
                card4Value: (netChange >= 0 ? '+' : '') + netChange.toLocaleString() + ' Bags',
                netChangePositive: netChange >= 0
            };
        } else {
            const totalMasters = masterProducts.length;
            const totalVariants = products.filter(p => p.is_active !== false).length;
            
            let totalIn = 0;
            let totalOut = 0;
            Object.values(movementAnalytics.masterStats).forEach(stat => {
                totalIn += stat.in;
                totalOut += stat.out;
            });
            const netChange = totalIn - totalOut;
            
            return {
                card1Label: 'Master Catalog Size',
                card1Value: totalMasters + ' Categories',
                card2Label: 'Total Stock In',
                card2Value: totalIn.toLocaleString() + ' Bags',
                card3Label: 'Total Stock Out',
                card3Value: totalOut.toLocaleString() + ' Bags',
                card4Label: 'Net Catalog Change',
                card4Value: (netChange >= 0 ? '+' : '') + netChange.toLocaleString() + ' Bags',
                netChangePositive: netChange >= 0
            };
        }
    }, [activeTab, filteredTransfers, filteredSummaries, masterProducts, products, movementAnalytics]);

    // Pagination Computations
    const activeList = activeTab === 'transfers' ? filteredTransfers : filteredSummaries;
    const totalPages = Math.ceil(activeList.length / ITEMS_PER_PAGE);
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return activeList.slice(start, start + ITEMS_PER_PAGE);
    }, [activeList, currentPage]);

    // Drilldown Row Click Handler (Queries all-time inventory flow)
    const handleOpenDrilldown = async (row) => {
        setSelectedSummaryRow(row);
        setIsDetailModalOpen(true);
        setLoadingDetails(true);
        setDetailTransactions([]);

        try {
            // Fetch chronological transactions of this product for ALL TIME
            let query = supabase
                .from('stock_management')
                .select('*')
                .eq('product_id', row.product_id);
                
            if (row.godown_id && row.godown_id !== 'all') {
                query = query.or(`godown_id.eq.${row.godown_id},from_location.eq.${row.godown_id}`);
            }
            
            const { data, error } = await query
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setDetailTransactions(data || []);
        } catch (error) {
            console.error('Error fetching drilldown details:', error);
            toast.error('Failed to load transaction history');
        } finally {
            setLoadingDetails(false);
        }
    };

    // Excel Export Flow
    const handleExportExcel = () => {
        try {
            let dataToExport = [];
            let filename = '';
            
            if (activeTab === 'transfers') {
                filename = `Stock_Transfers_Report_${startDate}_to_${endDate}.xlsx`;
                dataToExport = filteredTransfers.map(t => {
                    const product = productMap[t.product_id];
                    return {
                        'Date': t.date,
                        'Entry ID': t.entry_id,
                        'Product ID': t.product_id,
                        'Product Name': product ? product.name : 'Unknown',
                        'From Godown': godownMap[t.from_location] || t.from_location,
                        'To Godown': godownMap[t.godown_id] || t.godown_id,
                        'Quantity (Bags)': parseFloat(t.quantity) || 0,
                        'Mux (Weight Factor)': product ? parseFloat(product.mux) || 1 : 1,
                        'Total Weight (KG)': product ? (parseFloat(t.quantity) || 0) * (parseFloat(product.mux) || 0) : 0,
                        'LR Number': t.lr_number || '—',
                        'Reference Number': t.reference_number || '—',
                        'Created By': t.created_by || '—',
                        'Notes': t.notes || ''
                    };
                });
            } else {
                filename = `Daily_Stock_Summary_Report_${startDate}_to_${endDate}.xlsx`;
                dataToExport = filteredSummaries.map(s => {
                    const product = productMap[s.product_id];
                    return {
                        'Date': s.date,
                        'Godown': godownMap[s.godown_id] || s.godown_id,
                        'Product ID': s.product_id,
                        'Product Name': product ? product.name : 'Unknown',
                        'Opening Stock (Bags)': parseFloat(s.opening_stock) || 0,
                        'Stock In (Bags)': parseFloat(s.in_stock) || 0,
                        'Stock Out (Bags)': parseFloat(s.out_stock) || 0,
                        'Closing Stock (Bags)': parseFloat(s.closing_stock) || 0,
                        'Mux': product ? parseFloat(product.mux) || 1 : 1,
                        'Closing Weight (KG)': product ? (parseFloat(s.closing_stock) || 0) * (parseFloat(product.mux) || 0) : 0
                    };
                });
            }

            if (dataToExport.length === 0) {
                toast.error('No records available to export');
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
            
            const wscols = Object.keys(dataToExport[0]).map(key => ({ wch: Math.max(key.length + 3, 14) }));
            worksheet['!cols'] = wscols;
            
            XLSX.writeFile(workbook, filename);
            toast.success('Report exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export to Excel');
        }
    };

    // Modal Specific Excel Export (Formats ledger with clear inward/outward layout)
    const handleExportModalExcel = () => {
        if (!selectedSummaryRow) return;
        try {
            const product = productMap[selectedSummaryRow.product_id];
            const godownName = godownMap[selectedSummaryRow.godown_id] || selectedSummaryRow.godown_id;
            const filename = `All_Time_Ledger_Card_${product?.name || selectedSummaryRow.product_id}_at_${godownName}.xlsx`;
            
            const dataToExport = detailTransactions.map(t => {
                const isOutflow = t.from_location === selectedSummaryRow.godown_id || (t.transaction_type === 'out' && !t.from_location);
                const typeLabel = t.from_location && t.godown_id 
                    ? (isOutflow ? 'Transfer OUT' : 'Transfer IN')
                    : (t.transaction_type === 'in' ? 'Stock Receipt' : 'Stock Dispatch');

                const qtyVal = parseFloat(t.quantity) || 0;

                return {
                    'Date': t.date,
                    'Transaction ID': t.entry_id,
                    'Transaction Type': typeLabel,
                    'Partner Location': isOutflow 
                        ? (godownMap[t.godown_id] || t.godown_id) 
                        : (godownMap[t.from_location] || t.from_location || 'External Partner'),
                    'Stock In (+)': !isOutflow ? qtyVal : 0,
                    'Stock Out (-)': isOutflow ? qtyVal : 0,
                    'Running Balance (Bags)': parseFloat(t.closing_stock) || 0,
                    'LR Number': t.lr_number || '—',
                    'Notes': t.notes || ''
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger Card');
            
            const wscols = Object.keys(dataToExport[0]).map(key => ({ wch: Math.max(key.length + 3, 14) }));
            worksheet['!cols'] = wscols;
            
            XLSX.writeFile(workbook, filename);
            toast.success('Specific ledger card exported');
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Failed to export ledger details');
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#f8fafc]">
            {/* Fullscreen Premium Header */}
            <div className="min-h-16 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 pl-14 lg:pl-6 shrink-0 z-20 shadow-sm sticky top-0 gap-3">
                <div className="flex items-start gap-3 w-full sm:w-auto">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 shrink-0 mt-0.5"
                        title="Go Back"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2 flex-wrap">
                            <ArrowRightLeft className="text-primary animate-pulse shrink-0" size={18} />
                            <span>STOCK MOVEMENT & LEDGER LOGS</span>
                        </h1>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                            Inter-Godown Transfers & Daily Snapshots
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-start sm:justify-end pl-10 sm:pl-0 mt-1 sm:mt-0">
                    <button 
                        onClick={() => fetchMovementData(true)} 
                        disabled={refreshing || loadingData}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-[11px] sm:text-xs font-bold hover:bg-slate-100 border border-slate-200 transition-all disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                        Sync Data
                    </button>
                    <button 
                        onClick={handleExportExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-[11px] sm:text-xs font-black shadow-md shadow-primary/20 hover:bg-primary/95 transition-all shrink-0"
                    >
                        <Download size={12} />
                        Export Excel
                    </button>
                </div>
            </div>

            {/* Filter and Content Frame - Natural scrolling height */}
            <div className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto">
                
                {/* Custom Sub Tabs */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white p-2 rounded-2xl border border-slate-200/80 shadow-sm shrink-0 gap-3">
                    <div className="flex gap-2 w-full overflow-x-auto whitespace-nowrap custom-scrollbar pb-1 sm:pb-0">
                        <button 
                            onClick={() => { setActiveTab('transfers'); setCurrentPage(1); }} 
                            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all border ${activeTab === 'transfers' ? 'bg-primary text-white border-primary shadow-md shadow-primary/25' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-50'}`}
                        >
                            <Move size={15} /> 
                            <span>Inter-Godown Movements</span>
                        </button>
                        <button 
                            onClick={() => { setActiveTab('summaries'); setCurrentPage(1); }} 
                            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all border ${activeTab === 'summaries' ? 'bg-primary text-white border-primary shadow-md shadow-primary/25' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-50'}`}
                        >
                            <FileText size={15} /> 
                            <span>Daily Balance Summaries</span>
                        </button>
                        <button 
                            onClick={() => { setActiveTab('master-products'); setCurrentPage(1); }} 
                            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all border ${activeTab === 'master-products' ? 'bg-primary text-white border-primary shadow-md shadow-primary/25' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-50'}`}
                        >
                            <Package size={15} /> 
                            <span>Master Product Summary</span>
                        </button>
                    </div>

                    <div className="hidden lg:flex items-center gap-3 pr-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
                            <Activity size={14} className="text-primary" />
                            <span>System Status: Active</span>
                        </div>
                    </div>
                </div>

                {/* Dashboard Stats Panel */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stats.card1Label}</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">{stats.card1Value}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stats.card2Label}</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">{stats.card2Value}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stats.card3Label}</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tight mt-1">{stats.card3Value}</p>
                    </div>
                    <div className={cn(
                        "bg-white p-5 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200",
                        activeTab === 'summaries' ? (stats.netChangePositive ? "border-emerald-100 bg-emerald-50/20" : "border-amber-100 bg-amber-50/20") : "border-slate-200/80"
                    )}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            {stats.card4Label}
                            {activeTab === 'summaries' && (
                                stats.netChangePositive ? <TrendingUp size={12} className="text-emerald-500" /> : <TrendingDown size={12} className="text-amber-500" />
                            )}
                        </p>
                        <p className={cn(
                            "text-3xl font-black tracking-tight mt-1",
                            activeTab === 'summaries' ? (stats.netChangePositive ? "text-emerald-700" : "text-amber-700") : "text-slate-800"
                        )}>{stats.card4Value}</p>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0 flex flex-col gap-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <SlidersHorizontal size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Parameters & Filters</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {/* Date Range Picker */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">From Date</label>
                            <DatePicker
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">To Date</label>
                            <DatePicker
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>

                        {/* Source / Destination filters (Tab 1 specific) */}
                        {activeTab === 'transfers' ? (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Source Godown</label>
                                    <select
                                        value={filterSourceGodown}
                                        onChange={(e) => setFilterSourceGodown(e.target.value)}
                                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-bold focus:border-primary focus:outline-none bg-white text-slate-600"
                                    >
                                        <option value="all">All Source Godowns</option>
                                        {godowns.map(g => (
                                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dest. Godown</label>
                                    <select
                                        value={filterDestGodown}
                                        onChange={(e) => setFilterDestGodown(e.target.value)}
                                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-bold focus:border-primary focus:outline-none bg-white text-slate-600"
                                    >
                                        <option value="all">All Dest. Godowns</option>
                                        {godowns.map(g => (
                                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            /* Godown filter (Tab 2 specific) */
                            <div className="space-y-1 sm:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Godown Location</label>
                                <select
                                    value={filterGodown}
                                    onChange={(e) => setFilterGodown(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-bold focus:border-primary focus:outline-none bg-white text-slate-600"
                                >
                                    <option value="all">All Godowns</option>
                                    {godowns.map(g => (
                                        <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Master Product Filter (Shared) */}
                        {activeTab !== 'master-products' && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Master Product</label>
                                <select
                                    value={filterMasterProduct}
                                    onChange={(e) => setFilterMasterProduct(e.target.value)}
                                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-bold focus:border-primary focus:outline-none bg-white text-slate-600"
                                >
                                    <option value="all">All Products</option>
                                    {masterProducts.map(mp => (
                                        <option key={mp.id} value={mp.id}>{mp.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Search Field */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            type="text"
                            placeholder={activeTab === 'transfers' ? "Search by transaction ID, notes, product name..." : activeTab === 'summaries' ? "Search by product ID or name..." : "Search master categories..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>

                {/* Primary Data Display Table - Big, Premium & Spacious with full row height */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto custom-scrollbar">
                        {loadingData ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-3">
                                <RefreshCw className="animate-spin text-primary" size={36} />
                                <p className="text-sm font-bold text-slate-500">Retrieving ledger log entries...</p>
                            </div>
                        ) : (activeList.length === 0 && activeTab !== 'master-products') ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-2">
                                <Package className="text-slate-300" size={48} />
                                <p className="text-sm font-bold text-slate-500">No matching movement entries found</p>
                                <p className="text-xs text-slate-400">Try adjusting your filters or date range parameters.</p>
                            </div>
                        ) : activeTab === 'transfers' ? (
                            /* RESPONSIVE TRANSFERS VIEW */
                            <div className="w-full">
                                {/* Desktop Table View */}
                                <div className="hidden lg:block">
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-black text-slate-400">
                                                <th className="px-6 py-5 w-32">Date</th>
                                                <th className="px-6 py-5 w-44">Entry ID</th>
                                                <th className="px-6 py-5 w-96 min-w-[320px]">Product Details</th>
                                                <th className="px-6 py-5 w-72 text-center">Movement Flow</th>
                                                <th className="px-6 py-5 text-right w-36">Quantity</th>
                                                <th className="px-6 py-5 w-36">LR Number</th>
                                                <th className="px-6 py-5 text-center w-32">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            {paginatedItems.map((t, index) => {
                                                const product = productMap[t.product_id];
                                                return (
                                                    <tr 
                                                        key={t.entry_id || index} 
                                                        className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                                                        onClick={() => handleOpenDrilldown(t)}
                                                    >
                                                        <td className="px-6 py-5 font-bold text-slate-500 whitespace-nowrap">
                                                            {t.date}
                                                        </td>
                                                        <td className="px-6 py-5 font-mono text-xs font-bold text-slate-500 whitespace-nowrap">
                                                            {t.entry_id}
                                                        </td>
                                                        <td className="px-6 py-5 w-96 min-w-[320px]">
                                                            <div className="font-bold text-slate-700 leading-normal group-hover:text-primary transition-colors text-[13px]">
                                                                {product ? product.name : 'Unknown Product'}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                {t.product_id}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <div className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-black rounded-lg truncate max-w-[140px]" title={godownMap[t.from_location] || t.from_location}>
                                                                    {godownMap[t.from_location] || t.from_location}
                                                                </div>
                                                                <ArrowRight size={14} className="text-slate-400 shrink-0" />
                                                                <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-black rounded-lg truncate max-w-[140px]" title={godownMap[t.godown_id] || t.godown_id}>
                                                                    {godownMap[t.godown_id] || t.godown_id}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-black text-slate-800 text-base whitespace-nowrap">
                                                            {t.quantity} <span className="text-xs text-slate-400 font-bold uppercase ml-0.5">Bags</span>
                                                        </td>
                                                        <td className="px-6 py-5 whitespace-nowrap">
                                                            {t.lr_number ? (
                                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded font-mono text-xs font-bold border border-slate-200">
                                                                    {t.lr_number}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-300 italic text-xs">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-primary transition-colors">
                                                                <Eye size={13} />
                                                                View History
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile/Tablet Card View */}
                                <div className="block lg:hidden divide-y divide-slate-100">
                                    {paginatedItems.map((t, index) => {
                                        const product = productMap[t.product_id];
                                        return (
                                            <div 
                                                key={t.entry_id || index} 
                                                onClick={() => handleOpenDrilldown(t)}
                                                className="p-4 bg-white hover:bg-slate-50/50 transition-colors cursor-pointer space-y-3"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-0.5">
                                                        <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                            {t.entry_id}
                                                        </span>
                                                        <p className="text-xs text-slate-400 font-bold">{t.date}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-black text-slate-800 text-sm">
                                                            {t.quantity} <span className="text-[10px] text-slate-400 font-bold uppercase">Bags</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <h4 className="font-extrabold text-slate-800 text-xs leading-normal">
                                                        {product ? product.name : 'Unknown Product'}
                                                    </h4>
                                                    <p className="text-[9px] text-slate-400 font-mono">SKU: {t.product_id}</p>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1">
                                                    <span className="px-2 py-1 bg-amber-50 border border-amber-100 text-amber-700 font-black rounded truncate max-w-[120px]">
                                                        {godownMap[t.from_location] || t.from_location}
                                                    </span>
                                                    <ArrowRight size={11} className="text-slate-400 shrink-0" />
                                                    <span className="px-2 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 font-black rounded truncate max-w-[120px]">
                                                        {godownMap[t.godown_id] || t.godown_id}
                                                    </span>
                                                </div>

                                                {t.lr_number && (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase">LR No:</span>
                                                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono text-[10px] font-bold border border-slate-200">
                                                            {t.lr_number}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : activeTab === 'summaries' ? (
                            /* RESPONSIVE SUMMARIES VIEW */
                            <div className="w-full">
                                {/* Desktop Table View */}
                                <div className="hidden lg:block">
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-black text-slate-400">
                                                <th className="px-6 py-5 w-32">Date</th>
                                                <th className="px-6 py-5 w-52">Godown Location</th>
                                                <th className="px-6 py-5 w-96 min-w-[320px]">Product Details</th>
                                                <th className="px-6 py-5 text-right w-36">Opening Stock</th>
                                                <th className="px-6 py-5 text-right w-36">Stock In (+)</th>
                                                <th className="px-6 py-5 text-right w-36">Stock Out (-)</th>
                                                <th className="px-6 py-5 text-right w-36">Closing Stock</th>
                                                <th className="px-6 py-5 text-center w-32">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            {paginatedItems.map((s, index) => {
                                                const product = productMap[s.product_id];
                                                return (
                                                    <tr 
                                                        key={s.id || index} 
                                                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                                        onClick={() => handleOpenDrilldown(s)}
                                                    >
                                                        <td className="px-6 py-5 font-bold text-slate-500 whitespace-nowrap">
                                                            {s.date}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center gap-1.5 text-slate-700 font-extrabold text-sm">
                                                                <MapPin size={14} className="text-slate-400 shrink-0" />
                                                                <span>{godownMap[s.godown_id] || s.godown_id}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 w-96 min-w-[320px]">
                                                            <div className="font-bold text-slate-700 leading-normal group-hover:text-primary transition-colors text-[13px]">
                                                                {product ? product.name : 'Unknown Product'}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                {s.product_id}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-bold text-slate-500 text-sm whitespace-nowrap">
                                                            {parseFloat(s.opening_stock || 0) > 0 ? (
                                                                <>
                                                                    {parseFloat(s.opening_stock).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">Bags</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-slate-400 font-medium">0 <span className="text-[10px] text-slate-300 font-normal">Bags</span></span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-black text-emerald-600 text-base whitespace-nowrap">
                                                            {parseFloat(s.in_stock || 0) > 0 ? (
                                                                <>
                                                                    +{parseFloat(s.in_stock).toLocaleString()} <span className="text-[10px] text-emerald-400 font-bold">Bags</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-slate-400 font-medium">0 <span className="text-[10px] text-slate-300 font-normal">Bags</span></span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-black text-amber-600 text-base whitespace-nowrap">
                                                            {parseFloat(s.out_stock || 0) > 0 ? (
                                                                <>
                                                                    -{parseFloat(s.out_stock).toLocaleString()} <span className="text-[10px] text-amber-400 font-bold">Bags</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-slate-400 font-medium">0 <span className="text-[10px] text-slate-300 font-normal">Bags</span></span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-black text-primary text-base whitespace-nowrap bg-primary/5">
                                                            {parseFloat(s.closing_stock || 0) > 0 ? (
                                                                <>
                                                                    {parseFloat(s.closing_stock).toLocaleString()} <span className="text-[10px] text-primary/70 font-bold">Bags</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-slate-400 font-medium">0 <span className="text-[10px] text-slate-300 font-normal">Bags</span></span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-primary transition-colors">
                                                                <Eye size={13} />
                                                                Ledger Card
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile/Tablet Card View */}
                                <div className="block lg:hidden divide-y divide-slate-100">
                                    {paginatedItems.map((s, index) => {
                                        const product = productMap[s.product_id];
                                        return (
                                            <div 
                                                key={s.id || index} 
                                                onClick={() => handleOpenDrilldown(s)}
                                                className="p-4 bg-white hover:bg-slate-50/50 transition-colors cursor-pointer space-y-3"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-0.5">
                                                        <span className="text-xs text-slate-400 font-bold">{s.date}</span>
                                                        <div className="flex items-center gap-1 text-[11px] font-extrabold text-slate-600">
                                                            <MapPin size={12} className="text-slate-400 shrink-0" />
                                                            <span>{godownMap[s.godown_id] || s.godown_id}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-primary bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
                                                            <Eye size={11} />
                                                            Ledger Card
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <h4 className="font-extrabold text-slate-800 text-xs leading-normal">
                                                        {product ? product.name : 'Unknown Product'}
                                                    </h4>
                                                    <p className="text-[9px] text-slate-400 font-mono">SKU: {s.product_id}</p>
                                                </div>

                                                {/* Compact Grid of Stock Metrics */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                                                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-wide">Opening</span>
                                                        <span className="block text-xs font-bold text-slate-700 mt-0.5">
                                                            {parseFloat(s.opening_stock || 0).toLocaleString()} <span className="text-[9px] text-slate-400 font-normal">Bags</span>
                                                        </span>
                                                    </div>
                                                    <div className="p-2 bg-emerald-50/40 border border-emerald-100/50 rounded-lg">
                                                        <span className="block text-[8px] font-black text-emerald-600/80 uppercase tracking-wide">Inflow (+)</span>
                                                        <span className="block text-xs font-black text-emerald-600 mt-0.5">
                                                            +{parseFloat(s.in_stock || 0).toLocaleString()} <span className="text-[9px] text-emerald-400 font-bold">Bags</span>
                                                        </span>
                                                    </div>
                                                    <div className="p-2 bg-amber-50/40 border border-amber-100/50 rounded-lg">
                                                        <span className="block text-[8px] font-black text-amber-600/80 uppercase tracking-wide">Outflow (-)</span>
                                                        <span className="block text-xs font-black text-amber-600 mt-0.5">
                                                            -{parseFloat(s.out_stock || 0).toLocaleString()} <span className="text-[9px] text-amber-400 font-bold">Bags</span>
                                                        </span>
                                                    </div>
                                                    <div className="p-2 bg-primary/5 border border-primary/10 rounded-lg">
                                                        <span className="block text-[8px] font-black text-primary/80 uppercase tracking-wide">Closing</span>
                                                        <span className="block text-xs font-black text-primary mt-0.5">
                                                            {parseFloat(s.closing_stock || 0).toLocaleString()} <span className="text-[9px] text-primary/70 font-bold">Bags</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            /* RESPONSIVE MASTER PRODUCTS VIEW */
                            <div className="w-full">
                                {/* Desktop Table View */}
                                <div className="hidden lg:block">
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-black text-slate-400">
                                                <th className="px-6 py-5 w-12"></th>
                                                <th className="px-6 py-5">Master Category Name</th>
                                                <th className="px-6 py-5 text-center w-40">Active Types</th>
                                                <th className="px-6 py-5 text-right w-44">Total Stock In (+)</th>
                                                <th className="px-6 py-5 text-right w-44">Total Stock Out (-)</th>
                                                <th className="px-6 py-5 text-right w-44">Net Movement</th>
                                                <th className="px-6 py-5 text-center w-40">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            {filteredMasterProducts.map((mp, index) => {
                                                const stats = movementAnalytics.masterStats[mp.id] || { in: 0, out: 0 };
                                                const isExpanded = !!expandedMasters[mp.id];
                                                const net = stats.in - stats.out;
                                                const childProducts = products.filter(p => p.master_product_id === mp.id && p.is_active !== false);

                                                return (
                                                    <React.Fragment key={mp.id || index}>
                                                        <tr 
                                                            className="hover:bg-slate-50/50 transition-colors cursor-pointer group font-semibold"
                                                            onClick={() => toggleMasterExpand(mp.id)}
                                                        >
                                                            <td className="px-6 py-5 text-center">
                                                                <div className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 group-hover:text-primary transition-colors">
                                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5">
                                                                <div className="font-extrabold text-slate-800 text-base leading-tight group-hover:text-primary transition-colors">
                                                                     {mp.name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                    ID: {mp.id}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5 text-center">
                                                                <span className="px-3 py-1 bg-slate-100 border border-slate-200/80 text-slate-600 font-black text-xs rounded-full">
                                                                     {childProducts.length} Variants
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-5 text-right font-black text-emerald-600 text-base whitespace-nowrap">
                                                                {stats.in > 0 ? `+${stats.in.toLocaleString()} Bags` : <span className="text-slate-400 font-medium">0 Bags</span>}
                                                            </td>
                                                            <td className="px-6 py-5 text-right font-black text-amber-600 text-base whitespace-nowrap">
                                                                {stats.out > 0 ? `-${stats.out.toLocaleString()} Bags` : <span className="text-slate-400 font-medium">0 Bags</span>}
                                                            </td>
                                                            <td className={cn(
                                                                "px-6 py-5 text-right font-black text-base whitespace-nowrap",
                                                                net > 0 ? "text-emerald-700" : net < 0 ? "text-amber-700" : "text-slate-500"
                                                            )}>
                                                                {net > 0 ? `+${net.toLocaleString()} Bags` : net < 0 ? `${net.toLocaleString()} Bags` : "0 Bags"}
                                                            </td>
                                                            <td className="px-6 py-5 text-center">
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-primary transition-colors">
                                                                    {isExpanded ? "Close" : "View Variants"}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr>
                                                                <td className="bg-slate-50/50 border-y border-slate-100"></td>
                                                                <td colSpan="6" className="bg-slate-50/50 p-6 pl-0 border-y border-slate-100">
                                                                    <div className="space-y-4 pr-6">
                                                                        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Specific Product Variants under {mp.name}</h4>
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">Click a variant to view its transaction history</span>
                                                                        </div>
                                                                        {childProducts.length === 0 ? (
                                                                            <p className="text-xs text-slate-400 font-bold italic py-4">No variant products found under this category.</p>
                                                                        ) : (
                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                {childProducts.map(cp => {
                                                                                    const cpStats = movementAnalytics.productStats[cp.product_id] || { in: 0, out: 0 };
                                                                                    return (
                                                                                        <div 
                                                                                            key={cp.product_id}
                                                                                            onClick={() => handleOpenDrilldown({ product_id: cp.product_id, godown_id: filterGodown })}
                                                                                            className="bg-white p-4 rounded-xl border border-slate-200 hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer flex justify-between items-center group/item animate-fadeIn"
                                                                                        >
                                                                                            <div className="space-y-1">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <p className="text-xs font-bold text-slate-800 group-hover/item:text-primary transition-colors">{cp.name}</p>
                                                                                                    {cp.product_type && (
                                                                                                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 font-extrabold text-[9px] rounded uppercase shrink-0">
                                                                                                            {cp.product_type}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <p className="text-[9px] text-slate-400 font-mono">SKU: {cp.product_id}</p>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-4 text-right">
                                                                                                <div className="space-y-0.5">
                                                                                                    <p className="text-[10px] font-black text-emerald-600">In: +{cpStats.in.toLocaleString()}</p>
                                                                                                    <p className="text-[10px] font-black text-amber-600">Out: -{cpStats.out.toLocaleString()}</p>
                                                                                                </div>
                                                                                                <ArrowRight size={14} className="text-slate-300 group-hover/item:translate-x-1 group-hover/item:text-primary transition-all shrink-0" />
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile/Tablet Card View */}
                                <div className="block lg:hidden divide-y divide-slate-100">
                                    {filteredMasterProducts.map((mp, index) => {
                                        const stats = movementAnalytics.masterStats[mp.id] || { in: 0, out: 0 };
                                        const isExpanded = !!expandedMasters[mp.id];
                                        const net = stats.in - stats.out;
                                        const childProducts = products.filter(p => p.master_product_id === mp.id && p.is_active !== false);

                                        return (
                                            <div key={mp.id || index} className="p-4 bg-white hover:bg-slate-50/30 transition-colors">
                                                <div 
                                                    className="flex items-start justify-between cursor-pointer gap-4"
                                                    onClick={() => toggleMasterExpand(mp.id)}
                                                >
                                                    <div className="space-y-1 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-extrabold text-slate-800 text-sm leading-tight break-words">
                                                                {mp.name}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 font-black text-[9px] rounded-full shrink-0">
                                                                {childProducts.length} Var
                                                            </span>
                                                        </div>
                                                        <p className="text-[9px] text-slate-400 font-mono">ID: {mp.id}</p>
                                                        
                                                        {/* Compact Metrics */}
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px]">
                                                            <span className="font-bold text-emerald-600">In: +{stats.in.toLocaleString()}</span>
                                                            <span className="font-bold text-amber-600">Out: -{stats.out.toLocaleString()}</span>
                                                            <span className={cn(
                                                                "font-black",
                                                                net > 0 ? "text-emerald-700" : net < 0 ? "text-amber-700" : "text-slate-500"
                                                            )}>
                                                                Net: {net > 0 ? `+${net.toLocaleString()}` : net < 0 ? `${net.toLocaleString()}` : '0'} Bags
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="p-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-slate-400 group-hover:text-primary transition-colors shrink-0">
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </div>
                                                </div>

                                                {/* Expanded Mobile Child Products Cards */}
                                                {isExpanded && (
                                                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                                                        <div className="flex flex-col gap-1">
                                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Variants</h4>
                                                        </div>
                                                        {childProducts.length === 0 ? (
                                                            <p className="text-[11px] text-slate-400 font-bold italic py-2">No variant products found.</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {childProducts.map(cp => {
                                                                    const cpStats = movementAnalytics.productStats[cp.product_id] || { in: 0, out: 0 };
                                                                    return (
                                                                        <div 
                                                                            key={cp.product_id}
                                                                            onClick={() => handleOpenDrilldown({ product_id: cp.product_id, godown_id: filterGodown })}
                                                                            className="bg-slate-50/50 p-3 rounded-xl border border-slate-200 hover:border-primary transition-all duration-200 cursor-pointer flex justify-between items-center gap-3 group/item"
                                                                        >
                                                                            <div className="space-y-0.5 flex-1 min-w-0">
                                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                                    <p className="text-xs font-bold text-slate-800 break-words">{cp.name}</p>
                                                                                    {cp.product_type && (
                                                                                        <span className="px-1 py-0.5 bg-white border border-slate-200 text-slate-500 font-black text-[8px] rounded uppercase shrink-0">
                                                                                            {cp.product_type}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-[8px] text-slate-400 font-mono">SKU: {cp.product_id}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-3 text-right shrink-0">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[9px] font-black text-emerald-600">In: +{cpStats.in.toLocaleString()}</p>
                                                                                    <p className="text-[9px] font-black text-amber-600">Out: -{cpStats.out.toLocaleString()}</p>
                                                                                </div>
                                                                                <ArrowRight size={12} className="text-slate-300 group-hover/item:translate-x-0.5 group-hover/item:text-primary transition-all shrink-0" />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pagination Footer */}
                    {!loadingData && activeList.length > 0 && activeTab !== 'master-products' && (
                        <div className="min-h-16 border-t border-slate-200 px-6 py-4 shrink-0 flex flex-col sm:flex-row items-center justify-between bg-slate-50 gap-3 text-xs">
                            <span className="font-bold text-slate-400 uppercase tracking-wider text-center sm:text-left">
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, activeList.length)} of {activeList.length} items
                            </span>
                            
                            <div className="flex gap-1.5 flex-wrap justify-center">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-9 px-4 rounded-lg border-slate-200"
                                >
                                    Previous
                                </Button>
                                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                    let pageNum = i + 1;
                                    if (currentPage > 3 && totalPages > 5) {
                                        pageNum = currentPage - 3 + i;
                                        if (pageNum + (4 - i) > totalPages) {
                                            pageNum = totalPages - 4 + i;
                                        }
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={cn(
                                                "w-9 h-9 rounded-lg font-bold border transition-all text-xs",
                                                currentPage === pageNum
                                                    ? "bg-primary text-white border-primary shadow-sm"
                                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                            )}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-9 px-4 rounded-lg border-slate-200"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Drilldown Product Summary ledger Modal */}
            {isDetailModalOpen && selectedSummaryRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div 
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" 
                        onClick={() => setIsDetailModalOpen(false)}
                    />
                    
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 animate-out fade-out-50">
                        {/* Modal Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl shrink-0 gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-900 leading-tight">
                                        Product Ledger Card
                                    </h2>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        Chronological Inventory Flow & Transactions
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={handleExportModalExcel}
                                    disabled={loadingDetails || detailTransactions.length === 0}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 h-8 border-slate-200 font-bold text-xs"
                                >
                                    <Download size={13} />
                                    Export Card
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setIsDetailModalOpen(false)}
                                    className="rounded-full w-8 h-8 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X size={18} />
                                </Button>
                            </div>
                        </div>

                        {/* Product Detail Banner */}
                        <div className="px-6 py-4 bg-white border-b border-slate-100 shrink-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Product</span>
                                    <span className="block text-sm font-black text-slate-800 mt-0.5 truncate">
                                        {productMap[selectedSummaryRow.product_id]?.name || 'Unknown Product'}
                                    </span>
                                    <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                                        {selectedSummaryRow.product_id}
                                    </span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Godown Location</span>
                                    <span className="block text-sm font-black text-slate-800 mt-0.5">
                                        {godownMap[selectedSummaryRow.godown_id] || selectedSummaryRow.godown_id}
                                    </span>
                                    <span className="block text-[10px] text-slate-400 font-bold mt-0.5">
                                        Mapped ID: {selectedSummaryRow.godown_id}
                                    </span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">Ledger Range</span>
                                    <span className="block text-xs font-black text-primary mt-0.5">
                                        All-Time History
                                    </span>
                                    <span className="block text-[10px] text-slate-400 font-bold mt-0.5">
                                        Base Unit: Bags / Weight: {productMap[selectedSummaryRow.product_id]?.mux || 0} KG/Bag
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body / Transactions Table */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                            {loadingDetails ? (
                                <div className="h-48 flex flex-col items-center justify-center gap-3">
                                    <RefreshCw className="animate-spin text-primary" size={24} />
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Assembling ledger records...</span>
                                </div>
                            ) : detailTransactions.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center gap-2">
                                    <History className="text-slate-300" size={32} />
                                    <span className="text-sm font-bold text-slate-500">No transactions found for this product</span>
                                    <p className="text-xs text-slate-400">There are no matching 'in', 'out' or transfer records in database.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Desktop View Table */}
                                    <div className="hidden lg:block border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse min-w-[800px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500">
                                                    <th className="px-5 py-3 w-28">Date</th>
                                                    <th className="px-5 py-3 w-36">Transaction ID</th>
                                                    <th className="px-5 py-3 w-32 text-center">Type</th>
                                                    <th className="px-5 py-3">Flow Details</th>
                                                    <th className="px-5 py-3 text-right w-28 text-emerald-600">Stock In (+)</th>
                                                    <th className="px-5 py-3 text-right w-28 text-amber-600">Stock Out (-)</th>
                                                    <th className="px-5 py-3 text-right w-32 text-primary bg-slate-50/50">Running Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                                                {detailTransactions.map((t, idx) => {
                                                    const isOutflow = t.from_location === selectedSummaryRow.godown_id || (t.transaction_type === 'out' && !t.from_location);
                                                    const isTransfer = t.from_location && t.godown_id;
                                                    
                                                    let typeLabel = '';
                                                    let badgeClass = '';
                                                    if (isTransfer) {
                                                        typeLabel = isOutflow ? 'Transfer OUT' : 'Transfer IN';
                                                        badgeClass = isOutflow 
                                                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                                    } else {
                                                        typeLabel = t.transaction_type === 'in' ? 'Receipt (IN)' : 'Dispatch (OUT)';
                                                        badgeClass = t.transaction_type === 'in'
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                            : 'bg-rose-50 text-rose-700 border-rose-100';
                                                    }

                                                    let partnerLocation = '';
                                                    if (isTransfer) {
                                                        partnerLocation = isOutflow 
                                                            ? `To: ${godownMap[t.godown_id] || t.godown_id}`
                                                            : `From: ${godownMap[t.from_location] || t.from_location}`;
                                                    } else {
                                                        partnerLocation = t.from_location 
                                                            ? `Source: ${godownMap[t.from_location] || t.from_location}`
                                                            : (t.notes || 'External Depot');
                                                    }

                                                    const qtyVal = parseFloat(t.quantity || 0);

                                                    return (
                                                        <tr key={t.entry_id || idx} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-5 py-3.5 font-bold text-slate-500">
                                                                {t.date}
                                                            </td>
                                                            <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500">
                                                                {t.entry_id}
                                                                {t.lr_number && (
                                                                    <span className="block text-[9px] text-slate-400 font-sans mt-0.5">
                                                                        LR: {t.lr_number}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-center">
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border whitespace-nowrap",
                                                                    badgeClass
                                                                )}>
                                                                    {typeLabel}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3.5 font-bold text-slate-600 max-w-[200px] truncate" title={partnerLocation}>
                                                                {partnerLocation}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right font-black text-emerald-600 whitespace-nowrap">
                                                                {!isOutflow ? `+${qtyVal.toLocaleString()}` : <span className="text-slate-300 font-normal">—</span>}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right font-black text-amber-600 whitespace-nowrap">
                                                                {isOutflow ? `-${qtyVal.toLocaleString()}` : <span className="text-slate-300 font-normal">—</span>}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right font-mono font-bold text-primary bg-primary/5 whitespace-nowrap">
                                                                {parseFloat(t.closing_stock || 0).toLocaleString()} <span className="text-[9px] text-slate-400 font-sans font-bold uppercase ml-0.5">Bags</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile/Tablet Card View */}
                                    <div className="block lg:hidden divide-y divide-slate-100">
                                        {detailTransactions.map((t, idx) => {
                                            const isOutflow = t.from_location === selectedSummaryRow.godown_id || (t.transaction_type === 'out' && !t.from_location);
                                            const isTransfer = t.from_location && t.godown_id;
                                            
                                            let typeLabel = '';
                                            let badgeClass = '';
                                            if (isTransfer) {
                                                typeLabel = isOutflow ? 'Transfer OUT' : 'Transfer IN';
                                                badgeClass = isOutflow 
                                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                            } else {
                                                typeLabel = t.transaction_type === 'in' ? 'Receipt (IN)' : 'Dispatch (OUT)';
                                                badgeClass = t.transaction_type === 'in'
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                    : 'bg-rose-50 text-rose-700 border-rose-100';
                                            }

                                            let partnerLocation = '';
                                            if (isTransfer) {
                                                partnerLocation = isOutflow 
                                                    ? `To: ${godownMap[t.godown_id] || t.godown_id}`
                                                    : `From: ${godownMap[t.from_location] || t.from_location}`;
                                            } else {
                                                partnerLocation = t.from_location 
                                                    ? `Source: ${godownMap[t.from_location] || t.from_location}`
                                                    : (t.notes || 'External Depot');
                                            }

                                            const qtyVal = parseFloat(t.quantity || 0);

                                            return (
                                                <div key={t.entry_id || idx} className="py-3.5 space-y-2.5">
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-0.5">
                                                            <span className="text-[11px] font-bold text-slate-400">{t.date}</span>
                                                            <p className="font-mono text-[9px] text-slate-400">ID: {t.entry_id}</p>
                                                        </div>
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border whitespace-nowrap",
                                                            badgeClass
                                                        )}>
                                                            {typeLabel}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between text-xs pt-0.5">
                                                        <span className="text-slate-500 font-bold">Details:</span>
                                                        <span className="font-bold text-slate-700">{partnerLocation}</span>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                                                        <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                                                            <span className="block text-[8px] font-black text-slate-400 uppercase">Flow Qty</span>
                                                            <span className={cn(
                                                                "block text-xs font-black mt-0.5",
                                                                isOutflow ? "text-amber-600" : "text-emerald-600"
                                                            )}>
                                                                {isOutflow ? `-${qtyVal.toLocaleString()}` : `+${qtyVal.toLocaleString()}`}
                                                            </span>
                                                        </div>
                                                        <div className="p-1.5 bg-primary/5 border border-primary/10 rounded-lg col-span-2">
                                                            <span className="block text-[8px] font-black text-primary/80 uppercase">Running Balance</span>
                                                            <span className="block text-xs font-black text-primary mt-0.5">
                                                                {parseFloat(t.closing_stock || 0).toLocaleString()} <span className="text-[9px] text-primary/70 font-bold">Bags</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0 rounded-b-3xl">
                            <Button 
                                onClick={() => setIsDetailModalOpen(false)} 
                                className="px-6 rounded-xl"
                            >
                                Close Card
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockMovement;
