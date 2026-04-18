import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Package, ArrowDown, ArrowUp, Edit2, Trash2, Truck } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { cn } from '@/lib/utils';
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
        setFormData(prev => ({
            ...prev,
            productItems: prev.productItems.map(item =>
                item.product_id === productId ? { ...item, quantity: parseInt(qty) } : item
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
            if (!data.transporter_id) newErrors.transporter_id = 'Transporter is required';
            if (!data.from_location) newErrors.from_location = 'From Location is required';
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
                const { data: stockData } = await supabase
                    .from('product_godown_stock')
                    .select('current_stock')
                    .eq('product_id', singleItem.product_id)
                    .eq('godown_id', formData.godown_id)
                    .single();

                const currentStock = parseFloat(stockData?.current_stock) || 0;
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
                    transporter_id: formData.transaction_type === 'in' ? formData.transporter_id : null,
                    lr_number: formData.transaction_type === 'in' ? formData.lr_number : null,
                    from_location: formData.transaction_type === 'in' ? formData.from_location : null,
                };

                const { error } = await supabase
                    .from('stock_management')
                    .update({ ...entryData, updated_at: new Date().toISOString() })
                    .eq('entry_id', editingEntry.entry_id);
                if (error) throw error;

                await supabase
                    .from('product_godown_stock')
                    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                    .eq('product_id', singleItem.product_id)
                    .eq('godown_id', formData.godown_id);

                toast.success('Entry updated successfully');
            } else {
                const baseEntryId = formData.entry_id;

                for (let i = 0; i < formData.productItems.length; i++) {
                    const item = formData.productItems[i];
                    const entryIdSuffix = formData.productItems.length > 1 ? `-${i + 1}` : '';
                    const entryId = baseEntryId + entryIdSuffix;

                    const { data: stockData } = await supabase
                        .from('product_godown_stock')
                        .select('current_stock')
                        .eq('product_id', item.product_id)
                        .eq('godown_id', formData.godown_id)
                        .single();

                    const currentStock = parseFloat(stockData?.current_stock) || 0;
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
                        transporter_id: formData.transaction_type === 'in' ? formData.transporter_id : null,
                        lr_number: formData.transaction_type === 'in' ? formData.lr_number : null,
                        from_location: formData.transaction_type === 'in' ? formData.from_location : null,
                        freight_amount: formData.transaction_type === 'in' && formData.freight_amount ? parseFloat(formData.freight_amount) : null,
                    };

                    const { error } = await supabase
                        .from('stock_management')
                        .insert([entryData]);
                    if (error) throw error;

                    if (stockData) {
                        await supabase
                            .from('product_godown_stock')
                            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                            .eq('product_id', item.product_id)
                            .eq('godown_id', formData.godown_id);
                    } else {
                        await supabase
                            .from('product_godown_stock')
                            .insert([{
                                product_id: item.product_id,
                                godown_id: formData.godown_id,
                                current_stock: newStock
                            }]);
                    }

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

    const handleDelete = async (entry) => {
        if (!confirm('Are you sure you want to delete this entry?')) return;
        try {
            const { error } = await supabase
                .from('stock_management')
                .delete()
                .eq('entry_id', entry.entry_id);
            if (error) throw error;
            toast.success('Entry deleted successfully');
            fetchData();
        } catch (error) {
            console.error('Error deleting entry:', error);
            toast.error(`Error: ${error.message}`);
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

    const availableProducts = products.filter(p => !formData.productItems.some(item => item.product_id === p.product_id));

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Stock Management</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage in/out stock entries.</p>
            </div>

            <div className="flex flex-col gap-4">
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
                            <SelectTrigger className="w-[180px] h-10">
                                <SelectValue placeholder="All Godowns" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Godown</SelectLabel>
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
                                getGodownName={getGodownName}
                                getProductName={getProductName}
                                onEdit={() => handleOpenModal(e)}
                                onDelete={() => handleDelete(e)}
                            />
                        ))
                    )}
                </div>

                {/* Desktop View */}
                <div className="hidden md:flex bg-white rounded-2xl shadow-sm border border-slate-200/60 flex-col">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-md">
                                    <HeaderCell>Entry ID</HeaderCell>
                                    <HeaderCell>Type</HeaderCell>
                                    <HeaderCell>Product</HeaderCell>
                                    <HeaderCell>Godown</HeaderCell>
                                    <HeaderCell>Qty</HeaderCell>
                                    <HeaderCell>Opening</HeaderCell>
                                    <HeaderCell>Closing</HeaderCell>
                                    <HeaderCell>Date</HeaderCell>
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
            </div>

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
                                    <label className="block text-sm font-medium text-slate-700">Type <span className="text-red-500">*</span></label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'in' }))}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                                                formData.transaction_type === 'in'
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                            )}
                                        >
                                            <ArrowDown size={16} />
                                            Stock In
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'out' }))}
                                            className={cn(
                                                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                                                formData.transaction_type === 'out'
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                            )}
                                        >
                                            <ArrowUp size={16} />
                                            Stock Out
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Date</label>
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
                                            <label className="block text-sm font-medium text-slate-700">Transporter Name <span className="text-red-500">*</span></label>
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
                                                    options={availableProducts.map(p => ({ value: p.product_id, label: p.name }))}
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
                                                                {product?.sku && (
                                                                    <p className="text-xs text-slate-400">SKU: {product.sku}</p>
                                                                )}
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
        </div>
    );
};

export default StockManagement;

const StatItem = ({ label, value }) => (
    <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
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
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
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

const EntryRow = ({ entry, getGodownName, getProductName, onEdit, onDelete }) => (
    <tr className="hover:bg-slate-50/80 transition-colors group">
        <td className="px-4 py-3 text-sm text-slate-900">{entry.entry_id}</td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                ${entry.transaction_type === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {entry.transaction_type === 'in' && <ArrowDown size={12} />}
                {entry.transaction_type === 'out' && <ArrowUp size={12} />}
                {entry.transaction_type.toUpperCase()}
            </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-900">{getProductName(entry.product_id)}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{getGodownName(entry.godown_id)}</td>
        <td className="px-4 py-3 text-sm text-slate-900 font-medium">{entry.quantity}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{entry.opening_stock}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{entry.closing_stock}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{entry.date}</td>
        <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" type="button" onClick={onEdit} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all" title="Edit">
                    <Edit2 size={16} />
                </Button>
                <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all" title="Delete">
                    <Trash2 size={16} />
                </Button>
            </div>
        </td>
    </tr>
);

const MobileEntryCard = ({ entry, getGodownName, getProductName, onEdit, onDelete }) => (
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
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded-full transition-colors">
                <Trash2 size={18} />
            </Button>
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
