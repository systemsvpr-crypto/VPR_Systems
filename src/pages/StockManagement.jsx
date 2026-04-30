import React, { useState, useEffect, useMemo } from 'react';
import {
    MapPin,
    LayoutGrid,
    Truck,
    Package,
    ArrowDown,
    ArrowUp,
    Search,
    Plus,
    X,
    Edit2,
    Trash2,
    Shield
} from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DeleteModal from '@/components/ui/DeleteModal';
import { cn } from '@/lib/utils';
import Products from './Products';
import Godowns from './Godowns';
import Transporters from './Transporters';
import useAuthStore from '../store/authStore';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM_DATA = {
    entry_id: '',
    godown_id: '',
    transaction_type: 'in',
    reference_number: '',
    date: new Date().toISOString().split('T')[0],
    transporter_id: '',
    lr_number: '',
    from_location: '',
    freight_amount: '',
    productItems: [],
};

const StockManagement = () => {
    const [entries, setEntries] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterGodown, setFilterGodown] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedQty, setSelectedQty] = useState(1);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('stocks');

    const allowedTabs = useMemo(() => {
        const tabs = [];
        const pageAccess = user?.page_access || [];
        const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.Admin === 'Yes';

        if (isAdmin || pageAccess.includes('stock-management')) {
            tabs.push({ id: 'stocks', label: 'Stocks', icon: Package });
        }
        return tabs;
    }, [user]);

    // Set initial active tab if default is not allowed
    useEffect(() => {
        if (allowedTabs.length > 0 && (!activeTab || !allowedTabs.find(t => t.id === activeTab))) {
            setActiveTab(allowedTabs[0].id);
        }
    }, [allowedTabs, activeTab]);

    if (allowedTabs.length === 0 && !loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Shield className="text-slate-300 w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500 mt-2 text-center max-w-xs">
                    You don't have permission to access any modules in this section.
                </p>
            </div>
        );
    }

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, filterGodown]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [entriesRes, godownsRes, productsRes, transportersRes] = await Promise.all([
                supabase.from('stock_management').select('*').order('created_at', { ascending: false }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('transporters').select('*').eq('is_active', true).order('name', { ascending: true })
            ]);
            if (entriesRes.error) throw entriesRes.error;
            setEntries(entriesRes.data || []);
            setGodowns(godownsRes.data || []);
            setProducts(productsRes.data || []);
            setTransporters(transportersRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingEntry(null);
        setErrors({});
        setSelectedProduct('');
        setSelectedQty(1);
    };

    const handleOpenModal = (entry = null) => {
        if (entry) {
            setEditingEntry(entry);
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...entry,
                productItems: [{ product_id: entry.product_id, quantity: entry.quantity }],
            });
        } else {
            generateEntryId();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const generateEntryId = async () => {
        try {
            const { data, error } = await supabase.rpc('generate_stock_entry_id');
            if (error) throw error;
            setFormData(prev => ({ ...prev, entry_id: data }));
        } catch (error) {
            const count = entries.length + 1;
            const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
            setFormData(prev => ({ ...prev, entry_id: `STK-${date}-${count.toString().padStart(4, '0')}` }));
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (date) => {
        setFormData(prev => ({ ...prev, date: date }));
    };

    const addProductItem = () => {
        if (!selectedProduct) {
            toast.error('Please select a product');
            return;
        }
        if (!selectedQty || selectedQty <= 0) {
            toast.error('Please enter a valid quantity');
            return;
        }

        const selectedProdData = products.find(p => p.product_id === selectedProduct);
        if (!selectedProdData) return;

        // Stock Validation
        let sourceGodownId = null;
        if (formData.transaction_type === 'out') {
            sourceGodownId = formData.godown_id;
        } else if (formData.transaction_type === 'in' && formData.from_location) {
            // Check if from_location is a godown
            const isGodown = godowns.some(g => g.godown_id === formData.from_location);
            if (isGodown) sourceGodownId = formData.from_location;
        }

        if (sourceGodownId) {
            // Find the stock of this product in the source godown
            // We match by name since product_id is unique per godown
            const sourceStock = products.find(p => p.name === selectedProdData.name && p.godown_id === sourceGodownId);
            const availableQty = parseFloat(sourceStock?.closing_quantity) || 0;
            
            if (availableQty < selectedQty) {
                toast.error(`Insufficient stock in ${godowns.find(g => g.godown_id === sourceGodownId)?.name || 'source godown'}. Available: ${availableQty}`);
                return;
            }
        }

        if (formData.productItems.some(item => item.product_id === selectedProduct)) {
            toast.error('Product already added');
            return;
        }
        setFormData(prev => ({
            ...prev,
            productItems: [...prev.productItems, { product_id: selectedProduct, quantity: parseInt(selectedQty) }]
        }));
        setSelectedProduct('');
        setSelectedQty(1);
    };

    const removeProductItem = (productId) => {
        setFormData(prev => ({
            ...prev,
            productItems: prev.productItems.filter(item => item.product_id !== productId)
        }));
    };

    const updateProductQty = (productId, qty) => {
        const qtyNum = parseInt(qty) || 0;
        const selectedProdData = products.find(p => p.product_id === productId);
        
        // Stock Validation
        let sourceGodownId = null;
        if (formData.transaction_type === 'out') {
            sourceGodownId = formData.godown_id;
        } else if (formData.transaction_type === 'in' && formData.from_location) {
            const isGodown = godowns.some(g => g.godown_id === formData.from_location);
            if (isGodown) sourceGodownId = formData.from_location;
        }

        if (sourceGodownId && selectedProdData) {
            const sourceStock = products.find(p => p.name === selectedProdData.name && p.godown_id === sourceGodownId);
            const availableQty = parseFloat(sourceStock?.closing_quantity) || 0;
            
            if (availableQty < qtyNum) {
                toast.error(`Insufficient stock. Available: ${availableQty}`);
                return;
            }
        }

        setFormData(prev => ({
            ...prev,
            productItems: prev.productItems.map(item =>
                item.product_id === productId ? { ...item, quantity: qtyNum } : item
            )
        }));
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.godown_id) newErrors.godown_id = 'Godown is required';
        if (!data.productItems || data.productItems.length === 0) {
            newErrors.productItems = 'At least one product is required';
        }
        if (data.transaction_type === 'in') {
            if (!data.from_location) newErrors.from_location = 'From Location is required';
            if (data.godown_id && data.from_location && data.godown_id === data.from_location) {
                newErrors.from_location = 'From Location cannot be same as Godown';
            }
        }
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formErrors = validateForm(formData);
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            toast.error('Please fill required fields');
            return;
        }

        try {
            if (editingEntry) {
                const singleItem = formData.productItems[0];
                const { data: productData } = await supabase
                    .from('products')
                    .select('closing_quantity, mux')
                    .eq('product_id', singleItem.product_id)
                    .single();

                const currentStock = parseFloat(productData?.closing_quantity) || 0;
                const mux = parseFloat(productData?.mux) || 0;
                const qty = singleItem.quantity;
                let newStock;

                if (formData.transaction_type === 'in') {
                    newStock = currentStock + qty;
                } else {
                    if (currentStock < qty) {
                        toast.error('Insufficient stock');
                        return;
                    }
                    newStock = currentStock - qty;
                }

                const { productItems, ...formDataWithoutItems } = formData;
                const entryData = {
                    ...formDataWithoutItems,
                    product_id: singleItem.product_id,
                    quantity: qty,
                    opening_stock: currentStock,
                    closing_stock: newStock,
                    transporter_id: formData.transaction_type === 'in' ? (formData.transporter_id || null) : null,
                    lr_number: formData.transaction_type === 'in' ? (formData.lr_number || null) : null,
                    from_location: formData.transaction_type === 'in' ? (formData.from_location || null) : null,
                };

                const { error } = await supabase
                    .from('stock_management')
                    .update({ ...entryData, updated_at: new Date().toISOString() })
                    .eq('entry_id', editingEntry.entry_id);
                if (error) throw error;

                // Update products table directly
                await supabase
                    .from('products')
                    .update({ 
                        closing_quantity: newStock, 
                        quantity: (newStock * mux).toFixed(3),
                        updated_at: new Date().toISOString() 
                    })
                    .eq('product_id', singleItem.product_id);

                toast.success('Entry updated successfully');
            } else {
                const baseEntryId = formData.entry_id;

                for (let i = 0; i < formData.productItems.length; i++) {
                    const item = formData.productItems[i];
                    const entryIdSuffix = formData.productItems.length > 1 ? `-${i + 1}` : '';
                    const entryId = baseEntryId + entryIdSuffix;

                    const { data: productData } = await supabase
                        .from('products')
                        .select('closing_quantity, mux')
                        .eq('product_id', item.product_id)
                        .single();

                    const currentStock = parseFloat(productData?.closing_quantity) || 0;
                    const mux = parseFloat(productData?.mux) || 0;
                    const qty = item.quantity;
                    let newStock, openingStock, closingStock;

                    if (formData.transaction_type === 'in') {
                        newStock = currentStock + qty;
                        openingStock = currentStock;
                        closingStock = newStock;
                    } else {
                        if (currentStock < qty) {
                            toast.error(`Insufficient stock for ${getProductName(item.product_id)}`);
                            return;
                        }
                        newStock = currentStock - qty;
                        openingStock = currentStock;
                        closingStock = newStock;
                    }

                    const entryData = {
                        entry_id: entryId,
                        godown_id: formData.godown_id,
                        product_id: item.product_id,
                        transaction_type: formData.transaction_type,
                        quantity: qty,
                        opening_stock: openingStock,
                        closing_stock: closingStock,
                        reference_number: formData.reference_number,
                        date: formData.date,
                        notes: formData.notes,
                        transporter_id: formData.transaction_type === 'in' ? (formData.transporter_id || null) : null,
                        lr_number: formData.transaction_type === 'in' ? (formData.lr_number || null) : null,
                        from_location: formData.transaction_type === 'in' ? (formData.from_location || null) : null,
                        freight_amount: formData.transaction_type === 'in' && formData.freight_amount ? parseFloat(formData.freight_amount) : null,
                    };

                    const { error } = await supabase
                        .from('stock_management')
                        .insert([entryData]);
                    if (error) throw error;

                    // Update products table directly
                    await supabase
                        .from('products')
                        .update({ 
                            closing_quantity: newStock, 
                            quantity: (newStock * mux).toFixed(3),
                            updated_at: new Date().toISOString() 
                        })
                        .eq('product_id', item.product_id);

                    await supabase.from('stock_notifications').insert([{
                        notification_type: formData.transaction_type === 'in' ? 'stock_in' : 'stock_out',
                        title: `Stock ${formData.transaction_type === 'in' ? 'IN' : 'OUT'}`,
                        message: `${qty} units ${formData.transaction_type === 'in' ? 'received' : 'dispatched'} at ${godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id}`,
                        product_id: item.product_id,
                        godown_id: formData.godown_id,
                        related_id: entryId
                    }]);
                }

                toast.success(`${formData.productItems.length} entries created successfully`);
            }

            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error saving entry:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (entry) => {
        setItemToDelete(entry);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('stock_management')
                .delete()
                .eq('entry_id', itemToDelete.entry_id);
            if (error) throw error;
            toast.success('Entry deleted successfully');
            fetchData();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting entry:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;

    const filteredEntries = useMemo(() => {
        return entries.filter(e => {
            const matchesSearch = e.entry_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                e.product_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === 'all' || e.transaction_type === filterType;
            const matchesGodown = filterGodown === 'all' || e.godown_id === filterGodown;
            return matchesSearch && matchesType && matchesGodown;
        });
    }, [entries, searchTerm, filterType, filterGodown]);

    const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredEntries, currentPage]);

    const availableProducts = useMemo(() => {
        // Return all products not already added to the form
        return products.filter(p => 
            !formData.productItems.some(item => item.product_id === p.product_id)
        );
    }, [products, formData.productItems]);

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    Stock <span className="text-primary font-black">Management</span>
                </h1>
                <p className="text-slate-500 mt-1 text-sm font-medium">Manage and track inventory transactions efficiently.</p>
            </div>

            <div className="flex flex-col gap-4 mt-2">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
                        <div className="hidden xl:flex items-center gap-6">
                            <StatItem label="Total Entries" value={entries.length} />
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                                <Input
                                    type="text"
                                    placeholder="Search entries..."
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="w-[150px] h-10">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Type</SelectLabel>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="in">Stock In</SelectItem>
                                        <SelectItem value="out">Stock Out</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>

                            <Select value={filterGodown} onValueChange={setFilterGodown}>
                                <SelectTrigger className="w-[160px] h-10">
                                    <SelectValue placeholder="Godown" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">All Godowns</SelectItem>
                                        {godowns.map(g => (
                                            <SelectItem key={g.godown_id} value={g.godown_id}>{g.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>

                            {!loading && (
                                <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium">
                                    <Plus size={20} />
                                    <span>New Entry</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-slate-500">Loading...</div>
                        ) : currentItems.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">No entries found.</div>
                        ) : (
                            currentItems.map((e) => (
                                <MobileEntryCard
                                    key={e.entry_id}
                                    entry={e}
                                    user={user}
                                    getGodownName={getGodownName}
                                    getProductName={getProductName}
                                    onEdit={() => handleOpenModal(e)}
                                    onDelete={() => handleDelete(e)}
                                />
                            ))
                        )}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:flex erp-table-container flex-col">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="erp-table">
                                <thead className="erp-table-thead">
                                    <tr className="erp-table-tr">
                                        <HeaderCell>Transaction & ID</HeaderCell>
                                        <HeaderCell>Product</HeaderCell>
                                        <HeaderCell>Location</HeaderCell>
                                        <HeaderCell align="center">Quantity</HeaderCell>
                                        <HeaderCell align="center">Stock Change</HeaderCell>
                                        <HeaderCell align="right">Actions</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <EmptyRow message="Loading..." />
                                    ) : currentItems.length === 0 ? (
                                        <EmptyRow message="No entries found." />
                                    ) : (
                                        currentItems.map((e) => (
                                            <EntryRow
                                                key={e.entry_id}
                                                entry={e}
                                                user={user}
                                                getGodownName={getGodownName}
                                                getProductName={getProductName}
                                                onEdit={() => handleOpenModal(e)}
                                                onDelete={() => handleDelete(e)}
                                            />
                                        ))
                                    )}
                                    {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`}><td colSpan="8" className="h-16"></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!loading && filteredEntries.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredEntries.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)}
                                onPageChange={setCurrentPage}
                                className="border-t border-slate-100"
                            />
                        )}
                    </div>

                    {!loading && filteredEntries.length > 0 && (
                        <div className="md:hidden shrink-0 mt-auto">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredEntries.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)}
                                onPageChange={setCurrentPage}
                                className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
                            />
                        </div>
                    )}
                    {/* Modal */}
                    {isModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                            <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                                    <h2 className="text-xl font-bold text-slate-800">
                                        {editingEntry ? 'Edit Entry' : 'New Stock Entry'}
                                    </h2>
                                    <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                        <X size={20} />
                                    </Button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-semibold text-slate-700">Transaction Type <span className="text-red-500">*</span></label>
                                            <div className="flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'in' }))}
                                                    className={cn(
                                                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                        formData.transaction_type === 'in'
                                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100'
                                                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200 hover:text-slate-500'
                                                    )}
                                                >
                                                    <ArrowDown size={18} strokeWidth={2.5} />
                                                    Stock In
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'out' }))}
                                                    className={cn(
                                                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                        formData.transaction_type === 'out'
                                                            ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100'
                                                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200 hover:text-slate-500'
                                                    )}
                                                >
                                                    <ArrowUp size={18} strokeWidth={2.5} />
                                                    Stock Out
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700">Date <span className="text-red-500">*</span></label>
                                            <DatePicker
                                                value={formData.date}
                                                onChange={handleDateChange}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700">Godown <span className="text-red-500">*</span></label>
                                            <SearchableSelect
                                                options={godowns.map(g => ({ value: g.godown_id, label: g.name }))}
                                                value={formData.godown_id}
                                                onChange={(val) => setFormData(prev => ({ ...prev, godown_id: val }))}
                                                placeholder="Select Godown"
                                                searchPlaceholder="Search godowns..."
                                                error={errors.godown_id}
                                            />
                                        </div>

                                        {formData.transaction_type === 'in' && (
                                            <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                    <Truck size={16} />
                                                    Transporter Details
                                                </h3>

                                                <div className="space-y-1.5">
                                                    <label className="block text-sm font-medium text-slate-700">Transporter Name</label>
                                                    <SearchableSelect
                                                        options={transporters.map(t => ({ value: t.transporter_id, label: t.name }))}
                                                        value={formData.transporter_id}
                                                        onChange={(val) => setFormData(prev => ({ ...prev, transporter_id: val }))}
                                                        placeholder="Select Transporter"
                                                        searchPlaceholder="Search transporters..."
                                                        error={errors.transporter_id}
                                                    />
                                                </div>

                                                <FormField
                                                    label="LR Number" name="lr_number" value={formData.lr_number}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter LR Number"
                                                    error={errors.lr_number}
                                                />

                                                <div className="space-y-1.5">
                                                    <label className="block text-sm font-medium text-slate-700">From Location <span className="text-red-500">*</span></label>
                                                    <SearchableSelect
                                                        options={godowns.map(g => ({ value: g.godown_id, label: g.name }))}
                                                        value={formData.from_location}
                                                        onChange={(val) => setFormData(prev => ({ ...prev, from_location: val }))}
                                                        placeholder="Select Location"
                                                        searchPlaceholder="Search locations..."
                                                        error={errors.from_location}
                                                    />
                                                </div>

                                                <FormField
                                                    label="Freight Amount" name="freight_amount" type="number" value={formData.freight_amount}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter freight amount"
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-sm font-medium text-slate-700">
                                                    Products <span className="text-red-500">*</span>
                                                </label>
                                                {formData.productItems.length > 0 && !editingEntry && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setFormData(prev => ({ ...prev, productItems: [] }))}
                                                        className="h-auto p-0 text-xs text-slate-500 hover:text-red-500"
                                                    >
                                                        Clear All
                                                    </Button>
                                                )}
                                            </div>
                                            {errors.productItems && (
                                                <p className="text-red-500 text-xs">{errors.productItems}</p>
                                            )}

                                            {!editingEntry && (
                                                <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 hover:border-primary/50 transition-colors">
                                                    <div className="flex-1">
                                                        <SearchableSelect
                                                            options={availableProducts.map(p => ({ 
                                                                value: p.product_id, 
                                                                label: p.name,
                                                                stock: p.closing_quantity || 0
                                                            }))}
                                                            renderOption={(option) => (
                                                                <div className="flex items-center justify-between w-full gap-4">
                                                                    <span className="truncate">{option.label}</span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Stock:</span>
                                                                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 min-w-[2.5rem] text-center">
                                                                            {parseFloat(option.stock).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            value={selectedProduct}
                                                            onChange={(val) => setSelectedProduct(val)}
                                                            placeholder="Search and select product..."
                                                            searchPlaceholder="Search products..."
                                                        />
                                                    </div>
                                                    <div className="w-28">
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={selectedQty}
                                                            onChange={(e) => setSelectedQty(e.target.value)}
                                                            placeholder="Qty"
                                                            className="h-10 text-center font-medium"
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        onClick={addProductItem}
                                                        className="h-10 px-4"
                                                        disabled={!selectedProduct || !selectedQty}
                                                    >
                                                        <Plus size={18} />
                                                        <span className="ml-1">Add</span>
                                                    </Button>
                                                </div>
                                            )}

                                            {formData.productItems.length === 0 ? (
                                                <div className="text-center py-8 px-4 bg-slate-50 rounded-lg border border-slate-200">
                                                    <Package className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                                                    <p className="text-sm text-slate-500">No products added yet</p>
                                                    <p className="text-xs text-slate-400 mt-1">Select products above to add them</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between px-1">
                                                        <span className="text-xs text-slate-500">{formData.productItems.length} product(s) selected</span>
                                                        <span className="text-xs text-slate-500 font-medium">
                                                            Total Qty: {formData.productItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)}
                                                        </span>
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                        {formData.productItems.map((item) => {
                                                            const product = products.find(p => p.product_id === item.product_id);
                                                            return (
                                                                <div
                                                                    key={item.product_id}
                                                                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group"
                                                                >
                                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                                        <Package size={14} className="text-primary" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium text-slate-900 truncate">
                                                                            {getProductName(item.product_id)}
                                                                        </p>
                                                                        {/* SKU removed */}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateProductQty(item.product_id, Math.max(1, (parseInt(item.quantity) || 1) - 1))}
                                                                                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                                                                            >
                                                                                <span className="text-sm font-medium">−</span>
                                                                            </button>
                                                                            <Input
                                                                                type="number"
                                                                                min="1"
                                                                                value={item.quantity}
                                                                                onChange={(e) => updateProductQty(item.product_id, e.target.value)}
                                                                                className="w-16 h-8 text-center font-medium text-sm"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateProductQty(item.product_id, (parseInt(item.quantity) || 1) + 1)}
                                                                                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                                                                            >
                                                                                <span className="text-sm font-medium">+</span>
                                                                            </button>
                                                                        </div>
                                                                        {!editingEntry && (
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                onClick={() => removeProductItem(item.product_id)}
                                                                                className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                            >
                                                                                <X size={14} />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </form>
                                </div>

                                <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                                    <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                                    <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                        {editingEntry ? 'Save Changes' : 'Create Entry'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Stock Entry"
                description="Are you sure you want to delete this stock entry? This will permanently remove the record from history."
                itemLabel={itemToDelete?.entry_id}
                loading={isDeleting}
            />
        </div>
    );
};

export default StockManagement;

const StatItem = ({ label, value }) => (
    <div className="flex flex-col">
        <h3 className="text-2xl font-bold text-slate-900 leading-none tracking-tight">{value}</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{label}</p>
    </div>
);

const FormField = ({ label, className = "", ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">{label} {props.required && <span className="text-red-500">*</span>}</label>
        <Input className={`h-10 w-full ${className}`} {...props} />
        {props.error && <p className="text-red-500 text-xs mt-1">{props.error}</p>}
    </div>
);

const HeaderCell = ({ children, align = "left" }) => (
    <th className={cn(`erp-table-th`, align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="8" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const EntryRow = ({ entry, user, getGodownName, getProductName, onEdit, onDelete }) => (
    <tr className="erp-table-tr group">
        <td className="erp-table-td">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase
                        ${entry.transaction_type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {entry.transaction_type === 'in' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                        {entry.transaction_type}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                        {new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {entry.entry_id}
                </span>
            </div>
        </td>
        <td className="erp-table-td">
            <div className="flex flex-col">
                <span className="font-bold text-slate-900 text-sm leading-tight">{getProductName(entry.product_id)}</span>
                {entry.reference_number && (
                    <span className="text-[10px] font-medium text-slate-400 mt-0.5">Ref: {entry.reference_number}</span>
                )}
            </div>
        </td>
        <td className="erp-table-td">
            <div className="flex items-center gap-1.5">
                <MapPin size={12} className="text-slate-400" />
                <span className="text-sm text-slate-600 font-semibold">{getGodownName(entry.godown_id)}</span>
            </div>
        </td>
        <td className="erp-table-td text-center">
            <span className="text-sm font-bold text-slate-900">{entry.quantity}</span>
        </td>
        <td className="erp-table-td text-center">
            <div className="flex items-center justify-center gap-2">
                <span className="text-[11px] font-medium text-slate-400">{entry.opening_stock}</span>
                <div className="w-4 h-[1px] bg-slate-200"></div>
                <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                    {entry.closing_stock}
                </span>
            </div>
        </td>
        <td className="erp-table-td text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <Button variant="ghost" size="icon" type="button" onClick={onEdit} className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg" title="Edit">
                    <Edit2 size={14} />
                </Button>
                {(user?.role === 'SUPER ADMIN' || user?.Admin === 'Yes') && (
                    <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded-lg" title="Delete">
                        <Trash2 size={14} />
                    </Button>
                )}
            </div>
        </td>
    </tr>
);

const MobileEntryCard = ({ entry, user, getGodownName, getProductName, onEdit, onDelete }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                ${entry.transaction_type === 'in' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {entry.transaction_type === 'in' ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{entry.entry_id}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{getProductName(entry.product_id)}</span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500">{entry.quantity} qty</span>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors">
                <Edit2 size={18} />
            </Button>
            {user?.role === 'SUPER ADMIN' && (
                <Button variant="ghost" size="icon" onClick={onDelete} className="text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded-full transition-colors">
                    <Trash2 size={18} />
                </Button>
            )}
        </div>
    </div>
);

const Pagination = ({ currentPage, totalPages, totalItems, startIndex, endIndex, onPageChange, className }) => (
    <div className={`flex flex-col sm:flex-row items-center justify-between p-4 gap-4 ${className}`}>
        <p className="text-sm text-slate-500">
            Showing <span className="font-medium text-slate-900">{startIndex}</span> to <span className="font-medium text-slate-900">{endIndex}</span> of <span className="font-medium text-slate-900">{totalItems}</span> results
        </p>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="h-9 w-9 border-slate-200">
                <span className="text-slate-600">‹</span>
            </Button>
            <span className="text-sm font-medium">{currentPage} / {totalPages}</span>
            <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-9 w-9 border-slate-200">
                <span className="text-slate-600">›</span>
            </Button>
        </div>
    </div>
);
