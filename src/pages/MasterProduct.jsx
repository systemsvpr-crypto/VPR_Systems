import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Edit2, X, Package, Layers, Check, Eye, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import DeleteModal from '@/components/ui/DeleteModal';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM_DATA = {
    name: '',
    description: '',
};

const MasterProduct = () => {
    const { user } = useAuthStore();
    const [items, setItems] = useState([]);
    const [variantCounts, setVariantCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [variantModal, setVariantModal] = useState(null);
    const [allProducts, setAllProducts] = useState([]);
    const [variantLoading, setVariantLoading] = useState(false);
    const [selectedVariantIds, setSelectedVariantIds] = useState(new Set());
    const [variantSearch, setVariantSearch] = useState('');
    const [savingVariants, setSavingVariants] = useState(false);

    const [viewModal, setViewModal] = useState(null);
    const [viewVariants, setViewVariants] = useState([]);
    const [viewLoading, setViewLoading] = useState(false);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('master_product')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setItems(data || []);

            const { data: products, error: prodError } = await supabase
                .from('products')
                .select('master_product_id')
                .limit(10000);
            if (prodError) throw prodError;

            const counts = {};
            (products || []).forEach(p => {
                if (p.master_product_id) {
                    counts[p.master_product_id] = (counts[p.master_product_id] || 0) + 1;
                }
            });
            setVariantCounts(counts);
        } catch (error) {
            console.error('Error fetching product types:', error);
            toast.error('Failed to fetch product types');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingItem(null);
        setErrors({});
    };

    const handleOpenModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setFormData({ name: item.name || '', description: item.description || '' });
        } else {
            resetForm();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const validateForm = (data) => {
        const errs = {};
        if (!data.name?.trim()) errs.name = 'Product type name is required';
        return errs;
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
            if (editingItem) {
                const { error } = await supabase
                    .from('master_product')
                    .update({ ...formData, updated_at: new Date().toISOString() })
                    .eq('id', editingItem.id);
                if (error) throw error;
                toast.success('Product type updated');
            } else {
                const { error } = await supabase
                    .from('master_product')
                    .insert([formData]);
                if (error) throw error;
                toast.success('Product type created');
            }
            handleCloseModal();
            fetchItems();
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (item) => {
        setItemToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            // Check if there are any products linked to this master product
            const { count, error: countError } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true })
                .eq('master_product_id', itemToDelete.id);
            
            if (countError) throw countError;
            
            if (count > 0) {
                toast.error(`Cannot delete: ${count} product(s) are linked to this type. Unlink them first.`);
                setIsDeleteModalOpen(false);
                return;
            }

            const { error } = await supabase
                .from('master_product')
                .delete()
                .eq('id', itemToDelete.id);
            if (error) throw error;
            toast.success('Product type deleted');
            fetchItems();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleOpenVariants = async (item) => {
        setVariantModal(item);
        setVariantLoading(true);
        setVariantSearch('');
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, name, product_id, unit, master_product_id')
                .order('name', { ascending: true })
                .limit(10000);
            if (error) throw error;
            setAllProducts(data || []);
            setSelectedVariantIds(new Set(
                (data || []).filter(p => p.master_product_id === item.id).map(p => p.id)
            ));
        } catch (error) {
            toast.error('Failed to load products');
        } finally {
            setVariantLoading(false);
        }
    };

    const handleCloseVariants = () => {
        setVariantModal(null);
        setAllProducts([]);
        setSelectedVariantIds(new Set());
    };

    const toggleVariant = (productId) => {
        setSelectedVariantIds(prev => {
            const next = new Set(prev);
            next.has(productId) ? next.delete(productId) : next.add(productId);
            return next;
        });
    };

    const handleSelectAll = () => {
        const allVisibleIds = filteredProducts.map(p => p.id);
        const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedVariantIds.has(id));
        
        setSelectedVariantIds(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                allVisibleIds.forEach(id => next.delete(id));
            } else {
                allVisibleIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const handleSaveVariants = async () => {
        if (!variantModal) return;
        setSavingVariants(true);
        try {
            const { error: unlinkError } = await supabase
                .from('products')
                .update({ master_product_id: null })
                .eq('master_product_id', variantModal.id);
            if (unlinkError) throw unlinkError;

            if (selectedVariantIds.size > 0) {
                const { error: linkError } = await supabase
                    .from('products')
                    .update({ master_product_id: variantModal.id })
                    .in('id', Array.from(selectedVariantIds));
                if (linkError) throw linkError;
            }

            toast.success('Variants updated');
            handleCloseVariants();
            fetchItems();
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setSavingVariants(false);
        }
    };

    const handleOpenView = async (item) => {
        setViewModal(item);
        setViewLoading(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('name, product_id, unit, description')
                .eq('master_product_id', item.id)
                .order('name', { ascending: true })
                .limit(1000); // Individual master product variants likely won't exceed 1000
            if (error) throw error;
            setViewVariants(data || []);
        } catch (error) {
            toast.error('Failed to load variants');
        } finally {
            setViewLoading(false);
        }
    };

    const handleCloseView = () => {
        setViewModal(null);
        setViewVariants([]);
    };

    const filteredItems = useMemo(() => {
        return items.filter(item =>
            item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [items, searchTerm]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const filteredProducts = useMemo(() => {
        if (!variantModal) return [];
        
        // Filter out products assigned to OTHER master products
        let result = allProducts.filter(p => 
            !p.master_product_id || p.master_product_id === variantModal.id
        );

        if (variantSearch) {
            result = result.filter(p =>
                p.name?.toLowerCase().includes(variantSearch.toLowerCase()) ||
                p.product_id?.toLowerCase().includes(variantSearch.toLowerCase())
            );
        }
        
        // Sort: Selected first, then by name
        return result.sort((a, b) => {
            const aSelected = selectedVariantIds.has(a.id);
            const bSelected = selectedVariantIds.has(b.id);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [allProducts, variantSearch, selectedVariantIds, variantModal]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                <div className="relative w-full md:w-72 order-2 md:order-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                    <Input
                        type="text"
                        placeholder="Search product types..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium order-1 md:order-2">
                    <Plus size={20} />
                    <span>Add Product Type</span>
                </Button>
            </div>

            <div className="erp-table-container flex-col overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="erp-table">
                        <thead className="erp-table-thead">
                            <tr className="erp-table-tr">
                                <th className="erp-table-th">Product Type</th>
                                <th className="erp-table-th">Description</th>
                                <th className="erp-table-th">Variants</th>
                                <th className="erp-table-th text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500 text-sm">Loading...</td></tr>
                            ) : currentItems.length === 0 ? (
                                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500 text-sm">No product types found.</td></tr>
                            ) : (
                                currentItems.map((item) => (
                                    <tr key={item.id} className="erp-table-tr group">
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 shrink-0 group-hover:bg-violet-600 group-hover:text-white transition-all duration-300">
                                                    <Package size={18} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="text-sm text-slate-500 italic truncate max-w-[200px]" title={item.description}>
                                                {item.description || '\u2014'}
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-1.5">
                                                <Layers size={14} className="text-slate-400" />
                                                <span className="text-sm font-bold text-slate-700">
                                                    {variantCounts[item.id] || 0}
                                                </span>
                                                <span className="text-xs text-slate-400">variants</span>
                                            </div>
                                        </td>
                                        <td className="erp-table-td text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => handleOpenView(item)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                                    title="View Variants"
                                                >
                                                    <Eye size={16} />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => handleOpenVariants(item)}
                                                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-all"
                                                    title="Manage Variants"
                                                >
                                                    <Layers size={16} />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => handleOpenModal(item)}
                                                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all"
                                                >
                                                    <Edit2 size={16} />
                                                </Button>
                                                {user?.role === 'SUPER ADMIN' && (
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        onClick={() => handleDelete(item)}
                                                        className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-slate-100">
                        <p className="text-sm text-slate-500">
                            Page <span className="font-medium text-slate-900">{currentPage}</span> of <span className="font-medium text-slate-900">{totalPages}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingItem ? 'Edit Product Type' : 'Add Product Type'}
                            </h2>
                            <Button variant="ghost" size="icon" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Product Type Name *</label>
                                    <div className="relative">
                                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <Input name="name" value={formData.name} onChange={handleInputChange} className="pl-10" placeholder="Enter product type name" />
                                    </div>
                                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Description</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleInputChange}
                                        className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                                        placeholder="Optional description"
                                        rows={3}
                                    />
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                            <Button onClick={handleSubmit}>{editingItem ? 'Save Changes' : 'Create Product Type'}</Button>
                        </div>
                    </div>
                </div>
            )}

            {variantModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseVariants}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Package size={20} className="text-violet-500" />
                                Variants for <span className="text-primary">{variantModal.name}</span>
                            </h2>
                            <Button variant="ghost" size="icon" onClick={handleCloseVariants} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Panel: Search and List */}
                            <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/30">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                                            <Input
                                                type="text"
                                                placeholder="Search products..."
                                                className="pl-9 h-10"
                                                value={variantSearch}
                                                onChange={(e) => setVariantSearch(e.target.value)}
                                            />
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={handleSelectAll}
                                            className="h-10 px-3 font-bold text-[10px] uppercase tracking-wider shrink-0 border-slate-200 hover:bg-slate-50"
                                            disabled={filteredProducts.length === 0}
                                        >
                                            {filteredProducts.length > 0 && filteredProducts.every(p => selectedVariantIds.has(p.id)) 
                                                ? 'Deselect All' 
                                                : 'Select All'
                                            }
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    {variantLoading ? (
                                        <div className="text-center py-8 text-slate-500 text-sm">Loading products...</div>
                                    ) : filteredProducts.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500 text-sm">No products found.</div>
                                    ) : (
                                        <div className="space-y-1">
                                            {filteredProducts.map((product) => {
                                                const isSelected = selectedVariantIds.has(product.id);
                                                return (
                                                    <div
                                                        key={product.id}
                                                        onClick={() => toggleVariant(product.id)}
                                                        className={cn(
                                                            "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                                                            isSelected
                                                                ? "bg-primary/5 border-primary/20"
                                                                : "hover:bg-slate-50 border-transparent"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                                                            isSelected
                                                                ? "bg-primary border-primary"
                                                                : "border-slate-300"
                                                        )}>
                                                            {isSelected && <Check size={12} className="text-white" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-bold text-slate-900 truncate">{product.name}</div>
                                                            <div className="text-[11px] text-slate-400 font-medium">
                                                                {product.product_id}{product.unit ? ` \u00b7 ${product.unit}` : ''}
                                                            </div>
                                                        </div>
                                                        {isSelected && (
                                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                                                                Variant
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Panel: Selected Sidetab */}
                            <div className="w-[300px] bg-slate-50/50 flex flex-col shrink-0">
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Check size={14} className="text-primary" />
                                        Selected Variants
                                    </h3>
                                    <span className="bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                                        {selectedVariantIds.size}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    {selectedVariantIds.size === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                                            <Layers size={32} className="text-slate-300 mb-2" />
                                            <p className="text-xs font-bold text-slate-400 uppercase">No products selected</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {Array.from(selectedVariantIds).map(id => {
                                                const p = allProducts.find(x => x.id === id);
                                                if (!p) return null;
                                                return (
                                                    <div key={id} className="group flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm animate-in slide-in-from-right-2 duration-200">
                                                        <div className="min-w-0">
                                                            <p className="text-[11px] font-bold text-slate-800 truncate">{p.name}</p>
                                                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{p.product_id}</p>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleVariant(id);
                                                            }}
                                                            className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl flex items-center justify-between shrink-0">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                                {selectedVariantIds.size} variants selected for assignment
                            </span>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={handleCloseVariants}>Cancel</Button>
                                <Button onClick={handleSaveVariants} disabled={savingVariants}>
                                    {savingVariants ? 'Saving...' : 'Save Variants'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseView}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Eye size={20} className="text-blue-500" />
                                Variants of <span className="text-primary">{viewModal.name}</span>
                            </h2>
                            <Button variant="ghost" size="icon" onClick={handleCloseView} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {viewLoading ? (
                                <div className="text-center py-8 text-slate-500 text-sm">Loading variants...</div>
                            ) : viewVariants.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Package size={40} className="text-slate-200 mb-3" />
                                    <p className="text-slate-500 text-sm font-medium">No variants assigned yet</p>
                                    <p className="text-slate-400 text-xs mt-1">Use the Manage button to assign products as variants.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {viewVariants.map((product, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-900">{product.name}</div>
                                                <div className="text-[11px] text-slate-400 font-medium">
                                                    {product.product_id}{product.unit ? ` \u00b7 ${product.unit}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
                            <Button onClick={handleCloseView}>Close</Button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Product Type"
                description="Are you sure you want to delete this product type? This action cannot be undone."
                itemLabel={itemToDelete?.name}
                loading={isDeleting}
            />

        </div>
    );
};

export default MasterProduct;
