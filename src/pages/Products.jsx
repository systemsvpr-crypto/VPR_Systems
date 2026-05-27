import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Package, ToggleLeft, ToggleRight, Layers, Tag, Weight, FileText, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { productService } from '../services/productService';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/Pagination';
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
    product_id: '',
    name: '',
    description: '',
    unit: 'KG',
    product_type: '',
    mux: '',
    godown_id: '',
    current_stock: 0,
    is_active: true,
};

const UNITS = ['KG'];

const Products = ({ isTab = false }) => {
    const { user } = useAuthStore();
    const [products, setProducts] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [confirmDisable, setConfirmDisable] = useState(null);
    const [stats, setStats] = useState({ total: 0, active: 0 });
    const [totalFiltered, setTotalFiltered] = useState(0);

    // Bulk Edit Opening Balances States
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [allProductsForBulk, setAllProductsForBulk] = useState([]);
    const [bulkOpenings, setBulkOpenings] = useState({});
    const [bulkGodownFilter, setBulkGodownFilter] = useState('all');
    const [loadingBulkProducts, setLoadingBulkProducts] = useState(false);
    const [bulkSearch, setBulkSearch] = useState('');
    const [savingBulk, setSavingBulk] = useState(false);
    const [bulkPage, setBulkPage] = useState(1);
    const [hasMoreBulk, setHasMoreBulk] = useState(true);
    const [totalBulkCount, setTotalBulkCount] = useState(0);

    const [bulkGodowns, setBulkGodowns] = useState({});

    const fetchBulkProductsChunk = async (page = 1, isReset = false, search = '') => {
        if (page === 1 && !isReset) return;
        setLoadingBulkProducts(true);
        try {
            const data = await productService.getAllBatched(search);
            setTotalBulkCount(data.totalCount || 0);
            setAllProductsForBulk(data);
            
            setBulkOpenings(prevOpenings => {
                const nextOpenings = { ...prevOpenings };
                data.forEach(p => {
                    if (nextOpenings[p.product_id] === undefined) {
                        nextOpenings[p.product_id] = p.current_stock || 0;
                    }
                });
                return nextOpenings;
            });

            setBulkGodowns(prevGodowns => {
                const nextGodowns = { ...prevGodowns };
                data.forEach(p => {
                    if (nextGodowns[p.product_id] === undefined) {
                        nextGodowns[p.product_id] = p.godown_id || '';
                    }
                });
                return nextGodowns;
            });
            
            setHasMoreBulk(false);
            setBulkPage(1);
        } catch (err) {
            console.error('Failed to load bulk chunk:', err);
            toast.error('Failed to load more products');
        } finally {
            setLoadingBulkProducts(false);
        }
    };

    const handleBulkScroll = (e) => {
        if (loadingBulkProducts || !hasMoreBulk) return;
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 120) {
            fetchBulkProductsChunk(bulkPage + 1, false, bulkSearch);
        }
    };

    const handleOpenBulkModal = () => {
        setAllProductsForBulk([]);
        setBulkOpenings({});
        setBulkSearch('');
        setBulkGodownFilter('all');
        setBulkPage(1);
        setHasMoreBulk(true);
        setIsBulkModalOpen(true);
        fetchBulkProductsChunk(1, true, '');
    };

    const handleBulkSaveOpenings = async () => {
        setSavingBulk(true);
        try {
            const changedList = Object.keys(bulkOpenings).map(productId => {
                const prod = allProductsForBulk.find(p => p.product_id === productId);
                const newClosing = parseFloat(bulkOpenings[productId]) || 0;
                const newGodownId = bulkGodowns[productId] || prod?.godown_id;
                return { prod, newClosing, newGodownId };
            }).filter(item => item.prod && (item.prod.current_stock !== item.newClosing || item.prod.godown_id !== item.newGodownId));

            if (changedList.length === 0) {
                toast.success('No changes to save');
                setIsBulkModalOpen(false);
                return;
            }

            for (const item of changedList) {
                const { prod, newClosing, newGodownId } = item;

                if (newGodownId !== prod.godown_id) {
                    const existingInTarget = await productService.findByNameAndGodown(
                        prod.name, newGodownId, prod.product_id
                    );

                    if (existingInTarget) {
                        await productService.updateProductBulk(existingInTarget.product_id, {
                            current_stock: (parseFloat(existingInTarget.current_stock) || 0) + newClosing,
                        });
                        await productService.updateProductBulk(prod.product_id, {
                            current_stock: 0,
                        });
                    } else {
                        await productService.updateProductBulk(prod.product_id, {
                            current_stock: newClosing,
                            godown_id: newGodownId,
                        });
                    }
                } else {
                    await productService.updateProductBulk(prod.product_id, {
                        current_stock: newClosing,
                    });
                }
            }

            toast.success('All stock updated successfully!');
            setIsBulkModalOpen(false);
            fetchProducts();
            fetchStats();
        } catch (err) {
            console.error('Error saving bulk stock:', err);
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setSavingBulk(false);
        }
    };


    const filteredBulkProducts = useMemo(() => {
        let result = allProductsForBulk;
        
        if (bulkGodownFilter && bulkGodownFilter !== 'all') {
            result = result.filter(p => p.godown_id === bulkGodownFilter);
        }

        if (bulkSearch) {
            const term = bulkSearch.toLowerCase();
            result = result.filter(p => 
                p.name?.toLowerCase().includes(term) ||
                p.product_id?.toLowerCase().includes(term)
            );
        }
        
        return result;
    }, [allProductsForBulk, bulkSearch, bulkGodownFilter]);

    useEffect(() => {
        if (!isBulkModalOpen) return;
        const timer = setTimeout(() => {
            fetchBulkProductsChunk(1, true, bulkSearch);
        }, 350);
        return () => clearTimeout(timer);
    }, [bulkSearch]);

    useEffect(() => {
        fetchStats();
        const fetchGodowns = async () => {
            const data = await productService.getActiveGodowns();
            setGodowns(data || []);
        };
        fetchGodowns();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 300);
        return () => clearTimeout(timer);
    }, [currentPage, searchTerm, filterStatus]);

    const fetchStats = async () => {
        try {
            const stats = await productService.getStats();
            setStats(stats);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const { data, count } = await productService.getFilteredPaginated({
                searchTerm,
                filterStatus,
                page: currentPage,
                pageSize: ITEMS_PER_PAGE,
            });

            setProducts(data || []);
            setTotalFiltered(count || 0);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch products');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingProduct(null);
        setErrors({});
    };

    const handleOpenModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                ...product,
            });
        } else {
            generateProductId();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const generateProductId = async () => {
        try {
            const lastId = await productService.getLastProductId();

            let nextCount = 1;
            if (lastId) {
                const match = lastId.match(/\d+$/);
                if (match) {
                    nextCount = parseInt(match[0], 10) + 1;
                } else {
                    nextCount = stats.total + 1;
                }
            }
            
            setFormData(prev => ({ ...prev, product_id: `PROD-${nextCount.toString().padStart(4, '0')}` }));
        } catch (error) {
            console.error('Error generating product ID:', error);
            const count = stats.total + 1;
            setFormData(prev => ({ ...prev, product_id: `PROD-${count.toString().padStart(4, '0')}` }));
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        const transformed = name === 'product_type' ? value.toUpperCase().replace(/\s/g, '') : value;
        setFormData(prev => ({ ...prev, [name]: transformed }));
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.name) newErrors.name = 'Product name is required';
        if (!data.product_id) newErrors.product_id = 'Product ID is required';
        if (!data.godown_id) newErrors.godown_id = 'Default Godown is required';
        if (!data.mux) newErrors.mux = 'MUX Value is required';
        if (!data.unit) newErrors.unit = 'Base Unit is required';
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
            const selectedGodown = godowns.find(g => g.godown_id === formData.godown_id);
            const godown_name = selectedGodown?.name || '';
            const dataToSave = { ...formData, godown_name };

            if (editingProduct) {
                if (formData.godown_id !== editingProduct.godown_id) {
                    const existing = await productService.findByNameAndGodown(
                        formData.name, formData.godown_id, formData.product_id
                    );
                    if (existing) {
                        await productService.updateProductBulk(existing.product_id, {
                            current_stock: (parseFloat(existing.current_stock) || 0) + (parseFloat(formData.current_stock) || 0),
                        });
                        dataToSave.current_stock = 0;
                        dataToSave.godown_id = editingProduct.godown_id;
                    }
                }
                await productService.update(editingProduct.product_id, dataToSave);
                toast.success('Product updated successfully');
            } else {
                const existing = await productService.findByNameAndGodown(
                    formData.name, formData.godown_id
                );
                if (existing) {
                    await productService.updateProductBulk(existing.product_id, {
                        current_stock: (parseFloat(existing.current_stock) || 0) + (parseFloat(formData.current_stock) || 0),
                    });
                    toast.success('Stock added to existing product in this godown');
                    handleCloseModal();
                    fetchProducts();
                    fetchStats();
                    return;
                }
                await productService.create(dataToSave);
                toast.success('Product created successfully');
            }
            handleCloseModal();
            fetchProducts();
            fetchStats();
        } catch (error) {
            console.error('Error saving product:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleToggleActive = async () => {
        if (!confirmDisable) return;
        const product = confirmDisable;
        try {
            await productService.toggleActive(product.product_id, product.is_active);
            toast.success(`Product ${!product.is_active ? 'enabled' : 'disabled'} successfully`);
            fetchProducts();
            fetchStats();
            setConfirmDisable(null);
        } catch (error) {
            console.error('Error toggling product:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const totalPages = Math.ceil(totalFiltered / ITEMS_PER_PAGE);

    return (
        <div className="flex flex-col gap-4 pb-6">
            {!isTab && (
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Products</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage product inventory and details.</p>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
                    <div className="hidden xl:flex items-center gap-6">
                        <StatItem label="Total Products" value={stats.total} />
                        <div className="w-px h-8 bg-slate-200"></div>
                        <StatItem
                            label="Active"
                            value={stats.active}
                        />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center gap-3 w-full lg:w-auto">
                        <div className="flex flex-col sm:flex-row gap-2 w-full">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                                <Input
                                    type="text"
                                    placeholder="Search products..."
                                    className="pl-9 w-full bg-white"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="w-full sm:w-[140px] h-10 bg-white">
                                    <SelectValue placeholder="All Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Status</SelectLabel>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        {!loading && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:flex gap-2 w-full sm:w-auto shrink-0">
                                <Button 
                                    onClick={handleOpenBulkModal} 
                                    variant="outline" 
                                    className="w-full md:w-auto gap-2 px-4 shadow-sm font-medium border-slate-200 hover:bg-slate-50 h-10"
                                >
                                    <Layers size={18} className="text-primary" />
                                    <span>Bulk Stock Update</span>
                                </Button>
                                <Button onClick={() => handleOpenModal()} className="w-full md:w-auto gap-2 px-4 shadow-sm font-medium h-10">
                                    <Plus size={20} />
                                    <span>Add Product</span>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">No products found.</div>
                    ) : (
                        products.map((product) => (
                            <MobileProductCard
                                key={product.product_id}
                                product={product}
                                godowns={godowns}
                                user={user}
                                onEdit={() => handleOpenModal(product)}
                                onToggle={() => setConfirmDisable(product)}
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
                                    <HeaderCell>Product Details</HeaderCell>
                                    <HeaderCell>MUX</HeaderCell>
                                    <HeaderCell>Godown</HeaderCell>
                                    <HeaderCell>Unit</HeaderCell>
                                    <HeaderCell>Product Type</HeaderCell>
                                    <HeaderCell align="center">Current Stock</HeaderCell>
                                    <HeaderCell align="center">Status</HeaderCell>
                                    <HeaderCell align="right">Actions</HeaderCell>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <EmptyRow message="Loading..." />
                                ) : products.length === 0 ? (
                                    <EmptyRow message="No products found." />
                                ) : (
                                    products.map((product) => (
                                        <ProductRow
                                            key={product.product_id}
                                            product={product}
                                            godowns={godowns}
                                            user={user}
                                            onEdit={() => handleOpenModal(product)}
                                            onToggle={() => setConfirmDisable(product)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - products.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="8" className="h-16"></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!loading && totalFiltered > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalFiltered}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, totalFiltered)}
                            onPageChange={setCurrentPage}
                            className="border-t border-slate-100"
                        />
                    )}
                </div>

                {/* Mobile Pagination */}
                {!loading && totalFiltered > 0 && (
                    <div className="md:hidden shrink-0 mt-auto">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalFiltered}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, totalFiltered)}
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
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <Package size={22} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">
                                        {editingProduct ? 'Edit Product' : 'Add New Product'}
                                    </h2>
                                    <p className="text-xs text-slate-500">Configure product specifications and inventory settings.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                                {/* Left Side: Static Details */}
                                <div className="flex-1 p-6 sm:p-8 space-y-6 bg-slate-50/30">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                                        <Info className="text-slate-500" size={18} />
                                        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Product Information</h3>
                                    </div>
                                    
                                    <div className="space-y-5">
                                        <FormField
                                            label="Product Name" name="name" value={formData.name}
                                            onChange={handleInputChange} required error={errors.name}
                                            icon={Package} placeholder="e.g. Copper Wire 2.5mm"
                                        />
                                        
                                        <div className="flex flex-col gap-1.5">
                                            <label className="block text-sm font-medium text-slate-700">
                                                Product ID
                                            </label>
                                            <div className="inline-flex items-center px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 font-mono text-sm font-bold shadow-sm w-fit">
                                                <Tag size={14} className="mr-2" />
                                                {formData.product_id || 'AUTO-GEN'}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <FormSelect
                                                label="Base Unit" name="unit" value={formData.unit}
                                                onChange={handleInputChange} options={UNITS}
                                                icon={Weight} required error={errors.unit}
                                            />
                                            <FormField
                                                label="Product Type" name="product_type" value={formData.product_type}
                                                onChange={handleInputChange} placeholder="10 X 12"
                                                icon={Tag}
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700">Detailed Description</label>
                                            <textarea
                                                name="description" value={formData.description} onChange={handleInputChange}
                                                rows="4" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-200 text-sm resize-none"
                                                placeholder="Enter technical specifications or product notes..."
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Semi-Dynamic Details */}
                                <div className="flex-1 p-6 sm:p-8 space-y-6">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                                        <Weight className="text-primary" size={18} />
                                        <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Stock & Configuration</h3>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <FormField
                                                label="MUX Value" name="mux" value={formData.mux}
                                                onChange={handleInputChange} placeholder="Value"
                                                icon={Layers} required error={errors.mux}
                                            />
                                            <FormSelect
                                                label="Default Godown" name="godown_id" value={formData.godown_id}
                                                onChange={handleInputChange} required error={errors.godown_id}
                                                options={godowns.map(g => ({ label: g.name, value: g.godown_id }))}
                                                icon={Package}
                                            />
                                        </div>

                                        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                                <FormField
                                                    label="Current Stock" name="current_stock" type="number" value={formData.current_stock}
                                                    onChange={handleInputChange}
                                                    placeholder="0"
                                                    icon={Package}
                                                    className="bg-white w-full"
                                                />
                                            </div>

                                        <div className="space-y-4 pt-2">
                                            <label className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/50 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm",
                                                        formData.is_active ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"
                                                    )}>
                                                        <CheckCircle2 size={18} />
                                                    </div>
                                                    <div>
                                                        <span className="block text-sm font-bold text-slate-900">Active Status</span>
                                                        <span className="block text-[11px] text-slate-500">Visible in dashboards</span>
                                                    </div>
                                                </div>
                                                <div className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" name="is_active" checked={formData.is_active} onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} className="sr-only peer" />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                            <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                {editingProduct ? 'Save Changes' : 'Create Product'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Disable Modal */}
            {confirmDisable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setConfirmDisable(null)}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-sm p-6 animate-in zoom-in-95 duration-200">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                                <ToggleRight size={24} className="text-red-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                {confirmDisable.is_active ? 'Disable Product' : 'Enable Product'}
                            </h3>
                            <p className="text-sm text-slate-500 mb-6">
                                Are you sure you want to {confirmDisable.is_active ? 'disable' : 'enable'} "{confirmDisable.name}"?
                                {confirmDisable.is_active && ' This product will no longer appear in stock entries.'}
                            </p>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={() => setConfirmDisable(null)} className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={handleToggleActive} className="flex-1 bg-red-600 hover:bg-red-700">
                                    {confirmDisable.is_active ? 'Disable' : 'Enable'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isBulkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsBulkModalOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50/50 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <Layers size={22} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Bulk Stock Update</h2>
                                    <p className="text-xs text-slate-500">Update closing quantities and godowns for multiple products simultaneously.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" type="button" onClick={() => setIsBulkModalOpen(false)} className="rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="p-4 border-b border-slate-100 bg-white shrink-0 flex flex-col sm:flex-row gap-3 items-center">
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                                <Input
                                    type="text"
                                    placeholder="Search products..."
                                    className="pl-9 h-10"
                                    value={bulkSearch}
                                    onChange={(e) => setBulkSearch(e.target.value)}
                                />
                            </div>
                            <Select value={bulkGodownFilter} onValueChange={setBulkGodownFilter}>
                                <SelectTrigger className="w-full sm:w-48 h-10 bg-white">
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
                            <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full sm:ml-auto shrink-0 border border-slate-200 uppercase tracking-wider">
                                Loaded {allProductsForBulk.length} of {totalBulkCount} total products
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" onScroll={handleBulkScroll}>
                            {allProductsForBulk.length === 0 && loadingBulkProducts ? (
                                <div className="py-24 flex flex-col items-center justify-center gap-3">
                                    <RefreshCw className="animate-spin text-primary" size={28} />
                                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Loading products...</span>
                                </div>
                            ) : filteredBulkProducts.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 text-sm font-bold">No products found.</div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Desktop View */}
                                    <div className="hidden md:block erp-table-container">
                                        <div className="overflow-x-auto custom-scrollbar">
                                            <table className="erp-table">
                                                <thead className="erp-table-thead">
                                                    <tr className="erp-table-tr">
                                                        <th className="erp-table-th">Product Details</th>
                                                        <th className="erp-table-th">Godown</th>
                                                        <th className="erp-table-th">MUX</th>
                                                        <th className="erp-table-th align-center text-center">Current Stock</th>
                                                        <th className="erp-table-th align-right text-right">Computed Qty</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {filteredBulkProducts.map((product) => {
                                                        const currentVal = bulkOpenings[product.product_id] ?? 0;
                                                        const muxVal = parseFloat(product.mux) || 0;
                                                        const computedWeight = (currentVal * muxVal).toFixed(3);

                                                        return (
                                                            <tr key={product.product_id} className="erp-table-tr">
                                                                <td className="erp-table-td">
                                                                    <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{product.product_id}</div>
                                                                </td>
                                                                <td className="erp-table-td text-[11px] font-bold text-slate-500 uppercase">
                                                                    <select
                                                                        value={bulkGodowns[product.product_id] || product.godown_id || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setBulkGodowns(prev => ({
                                                                                ...prev,
                                                                                [product.product_id]: val
                                                                            }));
                                                                        }}
                                                                        className="w-full bg-transparent border-none outline-none font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
                                                                    >
                                                                        <option value="">Select Godown</option>
                                                                        {godowns.map(g => (
                                                                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                                <td className="erp-table-td text-slate-500 font-mono text-sm">
                                                                    {product.mux || '0'}
                                                                </td>
                                                                <td className="erp-table-td text-center">
                                                                    <Input
                                                                        type="number"
                                                                        value={currentVal}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setBulkOpenings(prev => ({
                                                                                ...prev,
                                                                                [product.product_id]: val === '' ? '' : parseFloat(val)
                                                                            }));
                                                                        }}
                                                                        className="w-32 h-10 border-slate-200 focus:bg-white text-center font-bold mx-auto"
                                                                        placeholder="0"
                                                                    />
                                                                </td>
                                                                <td className="erp-table-td align-right text-right font-black text-primary">
                                                                    {computedWeight} KG
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Mobile View */}
                                    <div className="space-y-3 md:hidden">
                                        {filteredBulkProducts.map((product) => {
                                            const currentVal = bulkOpenings[product.product_id] ?? 0;
                                            const muxVal = parseFloat(product.mux) || 0;
                                            const computedWeight = (currentVal * muxVal).toFixed(3);

                                            return (
                                                <div key={product.product_id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                                                    <div>
                                                        <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{product.product_id}</div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div>
                                                            <span className="block text-slate-400 font-bold uppercase tracking-wider text-[9px]">Godown</span>
                                                            <select
                                                                value={bulkGodowns[product.product_id] || product.godown_id || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setBulkGodowns(prev => ({
                                                                        ...prev,
                                                                        [product.product_id]: val
                                                                    }));
                                                                }}
                                                                className="w-full bg-slate-100 border-none outline-none text-[10px] font-bold uppercase tracking-wider text-slate-700 cursor-pointer rounded px-1 py-0.5 mt-1"
                                                            >
                                                                <option value="">Select</option>
                                                                {godowns.map(g => (
                                                                    <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <span className="block text-slate-400 font-bold uppercase tracking-wider text-[9px]">MUX</span>
                                                            <span className="font-bold text-slate-700 font-mono">
                                                                {product.mux || '0'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200">
                                                        <div className="flex-1 max-w-[140px]">
                                                            <span className="block text-slate-400 font-bold uppercase tracking-wider text-[9px] mb-1">Current Stock</span>
                                                            <Input
                                                                type="number"
                                                                value={currentVal}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setBulkOpenings(prev => ({
                                                                        ...prev,
                                                                        [product.product_id]: val === '' ? '' : parseFloat(val)
                                                                    }));
                                                                }}
                                                                className="w-full h-10 border-slate-200 focus:bg-white text-center font-bold bg-white"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-slate-400 font-bold uppercase tracking-wider text-[9px]">Computed Qty</span>
                                                            <span className="font-black text-primary text-sm">{computedWeight} KG</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {loadingBulkProducts && (
                                        <div className="py-4 flex items-center justify-center gap-2 bg-slate-50/50 border border-slate-100 rounded-xl animate-fadeIn">
                                            <RefreshCw className="animate-spin text-primary" size={16} />
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fetching more products...</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
                            <Button type="button" variant="outline" onClick={() => setIsBulkModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleBulkSaveOpenings} disabled={savingBulk || loadingBulkProducts}>
                                {savingBulk ? 'Saving changes...' : 'Save Bulk Stock'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Products;

// Sub-components
const StatItem = ({ label, value }) => (
    <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
);

const FormSection = ({ title, children, icon: Icon }) => (
    <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            {Icon && <Icon className="text-primary" size={18} />}
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {children}
        </div>
    </div>
);

const FormField = ({ label, icon: Icon, className = "", ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">
            {label} {props.required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative group">
            {Icon && (
                <Icon 
                    className={cn(
                        "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 transition-colors group-focus-within:text-primary",
                        props.error && "text-red-400"
                    )} 
                    size={18} 
                />
            )}
            <Input
                className={cn(
                    "transition-all duration-200",
                    Icon ? 'pl-10' : 'pl-4', 
                    "pr-4 h-10 w-full bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-primary/20",
                    props.error && "border-red-300 focus:ring-red-100 bg-red-50/30",
                    className
                )}
                {...props}
            />
        </div>
        {props.error && <p className="text-red-500 text-[11px] mt-1 flex items-center gap-1 animate-in slide-in-from-top-1"><Info size={12} /> {props.error}</p>}
    </div>
);

const FormSelect = ({ label, icon: Icon, options, ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">
            {label} {props.required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative group">
            {Icon && (
                <Icon 
                    className={cn(
                        "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 transition-colors group-focus-within:text-primary",
                        props.error && "text-red-400"
                    )} 
                    size={18} 
                />
            )}
            <select
                className={cn(
                    "w-full h-10 rounded-lg border border-slate-200 bg-slate-50 text-sm outline-none transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer",
                    Icon ? 'pl-10' : 'pl-4',
                    "pr-10",
                    props.error && "border-red-300 focus:ring-red-100 bg-red-50/30",
                )}
                {...props}
            >
                <option value="">Select {label}</option>
                {options.map(opt => (
                    <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                        {typeof opt === 'string' ? opt : opt.label}
                    </option>
                ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
        {props.error && <p className="text-red-500 text-[11px] mt-1 flex items-center gap-1 animate-in slide-in-from-top-1"><Info size={12} /> {props.error}</p>}
    </div>
);

const HeaderCell = ({ children, align = "left" }) => (
    <th className={`erp-table-th text-${align}`}>
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

const ProductRow = ({ product, godowns, user, onEdit, onToggle }) => (
    <tr className="erp-table-tr group">
        <td className="erp-table-td">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Package size={18} />
                </div>
                <div>
                                    <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{product.product_id}</div>
                                        {product.product_type && (
                                            <>
                                                <span className="text-slate-200">|</span>
                                                <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider bg-violet-50 px-1.5 py-0.5 rounded">{product.product_type}</div>
                                            </>
                                        )}
                                    </div>
                </div>
            </div>
        </td>
        <td className="erp-table-td font-medium text-slate-600 italic">
            {product.mux || ''}
        </td>
        <td className="erp-table-td text-slate-500 font-bold text-[11px] uppercase">
            {godowns.find(g => g.godown_id === product.godown_id)?.name || product.godown_id || ''}
        </td>
        <td className="erp-table-td">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-black">{product.unit || ''}</span>
        </td>
        <td className="erp-table-td">
            {product.product_type ? (
                <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider bg-violet-50 px-1.5 py-0.5 rounded">{product.product_type}</span>
            ) : (
                <span className="text-[10px] text-slate-300"></span>
            )}
        </td>
        <td className="erp-table-td text-center">
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg font-black">{product.current_stock || 0}</span>
        </td>
        <td className="erp-table-td text-center">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${product.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {product.is_active ? 'Active' : 'Disabled'}
            </span>
        </td>
        <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" type="button" onClick={onEdit} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all" title="Edit">
                    <Edit2 size={16} />
                </Button>
                <Button variant="ghost" size="icon" type="button" onClick={onToggle} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-all" title={product.is_active ? 'Disable' : 'Enable'}>
                    {product.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </Button>
            </div>
        </td>
    </tr>
);

const MobileProductCard = ({ product, godowns, user, onEdit, onToggle }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                <Package size={18} />
            </div>
            <div>
                                    <h3 className="font-semibold text-slate-900 text-sm">{product.name}</h3>
                                    {product.product_type && (
                                        <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider bg-violet-50 px-1.5 py-0.5 rounded w-fit mt-1">{product.product_type}</div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                        <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{product.mux || ''}</span>
                    <span className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {godowns.find(g => g.godown_id === product.godown_id)?.name || ''}
                    </span>
                    <span className={`text-[11px] font-medium ${product.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {product.is_active ? 'Active' : 'Disabled'}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase">Stock</span>
                        <span className="text-xs font-bold text-slate-700">{product.current_stock || 0}</span>
                    </div>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={onEdit} className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors">
                <Edit2 size={18} />
            </Button>
        </div>
    </div>
);

