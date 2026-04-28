import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Package, Trash2, ToggleLeft, ToggleRight, Layers, Tag, Weight, FileText, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import DeleteModal from '@/components/ui/DeleteModal';
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
    mux: '',
    godown_id: '',
    quantity: 0,
    opening_quantity: 0,
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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [stats, setStats] = useState({ total: 0, active: 0 });
    const [totalFiltered, setTotalFiltered] = useState(0);

    useEffect(() => {
        fetchStats();
        const fetchGodowns = async () => {
            const { data } = await supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true });
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
            const [totalRes, activeRes] = await Promise.all([
                supabase.from('products').select('product_id', { count: 'exact', head: true }),
                supabase.from('products').select('product_id', { count: 'exact', head: true }).eq('is_active', true)
            ]);
            setStats({ total: totalRes.count || 0, active: activeRes.count || 0 });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            let query = supabase.from('products').select('*', { count: 'exact' });
            
            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`);
            }
            if (filterStatus === 'active') {
                query = query.eq('is_active', true);
            } else if (filterStatus === 'inactive') {
                query = query.eq('is_active', false);
            }

            const from = (currentPage - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
            if (error) throw error;

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
            // Get the most recent product ID from the database
            const { data, error } = await supabase
                .from('products')
                .select('product_id')
                .order('product_id', { ascending: false })
                .limit(1);

            if (error) throw error;

            let nextCount = 1;
            if (data && data.length > 0 && data[0].product_id) {
                const lastId = data[0].product_id;
                // Extract the numeric part at the end (e.g. from PROD-0001)
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
            // Fallback to absolute total + 1 if query fails
            const count = stats.total + 1;
            setFormData(prev => ({ ...prev, product_id: `PROD-${count.toString().padStart(4, '0')}` }));
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    useEffect(() => {
        const mux = parseFloat(formData.mux) || 0;
        const opening = parseFloat(formData.opening_quantity) || 0;
        const calculatedQty = (mux * opening).toFixed(3);
        
        if (formData.quantity !== parseFloat(calculatedQty)) {
            setFormData(prev => ({ ...prev, quantity: parseFloat(calculatedQty) }));
        }
    }, [formData.mux, formData.opening_quantity]);


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
            if (editingProduct) {
                // Fetch all transactions for this product to correctly compute the new closing_quantity
                const { data: txns, error: txnError } = await supabase
                    .from('stock_management')
                    .select('transaction_type, quantity, godown_id, from_location')
                    .eq('product_id', editingProduct.product_id);

                if (txnError) throw txnError;

                let in_stock = 0;
                let out_stock = 0;
                const targetGodown = formData.godown_id;

                txns.forEach(t => {
                    if (t.godown_id === targetGodown && t.transaction_type === 'in') {
                        in_stock += parseFloat(t.quantity) || 0;
                    }
                    if (t.godown_id === targetGodown && t.transaction_type === 'out') {
                        out_stock += parseFloat(t.quantity) || 0;
                    }
                    if (t.from_location === targetGodown) {
                        out_stock += parseFloat(t.quantity) || 0;
                    }
                });

                const opening = parseFloat(formData.opening_quantity) || 0;
                const mux = parseFloat(formData.mux) || 0;
                const newClosing = opening + in_stock - out_stock;
                const newQuantity = (newClosing * mux).toFixed(3);

                const { error } = await supabase
                    .from('products')
                    .update({ 
                        ...formData, 
                        closing_quantity: newClosing,
                        quantity: newQuantity,
                        updated_at: new Date().toISOString() 
                    })
                    .eq('product_id', editingProduct.product_id);
                    
                if (error) throw error;
                toast.success('Product updated successfully');
            } else {
                // Initialize closing_quantity and quantity for new products
                const opening = parseFloat(formData.opening_quantity) || 0;
                const mux = parseFloat(formData.mux) || 0;
                const newProductData = {
                    ...formData,
                    closing_quantity: opening,
                    quantity: (opening * mux)
                };
                const { error } = await supabase
                    .from('products')
                    .insert([newProductData]);
                if (error) throw error;
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

    const handleDelete = (product) => {
        setItemToDelete(product);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('product_id', itemToDelete.product_id);
            if (error) throw error;
            toast.success('Product deleted successfully');
            fetchProducts();
            fetchStats();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting product:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleActive = async () => {
        if (!confirmDisable) return;
        const product = confirmDisable;
        try {
            const { error } = await supabase
                .from('products')
                .update({ is_active: !product.is_active, updated_at: new Date().toISOString() })
                .eq('product_id', product.product_id);
            if (error) throw error;
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

                    <div className="flex items-center gap-3">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                            <Input
                                type="text"
                                placeholder="Search products..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>


                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-[140px] h-10">
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

                        {!loading && (
                            <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium">
                                <Plus size={20} />
                                <span>Add Product</span>
                            </Button>
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
                                onDelete={() => handleDelete(product)}
                                onToggle={() => setConfirmDisable(product)}
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
                                    <HeaderCell>Product Details</HeaderCell>
                                    <HeaderCell>MUX</HeaderCell>
                                    <HeaderCell>Godown</HeaderCell>
                                    <HeaderCell>Unit</HeaderCell>
                                    <HeaderCell>Qty</HeaderCell>
                                    <HeaderCell>Opening Qty</HeaderCell>
                                    <HeaderCell>Closing Qty</HeaderCell>
                                    <HeaderCell>Status</HeaderCell>
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
                                            onDelete={() => handleDelete(product)}
                                            onToggle={() => setConfirmDisable(product)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - products.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="9" className="h-16"></td></tr>
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
                                                    label="Opening Quantity" name="opening_quantity" type="number" value={formData.opening_quantity}
                                                    onChange={handleInputChange}
                                                    placeholder="0"
                                                    icon={Package}
                                                    className="bg-white w-full"
                                                />
                                                <FormField
                                                    label="Total Weight (KG)" name="quantity" type="number" value={formData.quantity}
                                                    placeholder="0"
                                                    icon={Weight}
                                                    className="bg-white font-bold text-primary"
                                                    readOnly
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

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Product"
                description="Are you sure you want to delete this product? This will remove all associated inventory data."
                itemLabel={itemToDelete?.name}
                loading={isDeleting}
            />
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
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="9" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const ProductRow = ({ product, godowns, user, onEdit, onDelete, onToggle }) => (
    <tr className="hover:bg-slate-50/80 transition-colors group">
        <td className="px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <Package size={18} />
                </div>
                <div>
                    <div className="font-medium text-slate-900 text-sm">{product.name}</div>
                    <div className="text-xs text-slate-500">{product.product_id}</div>
                </div>
            </div>
        </td>
        <td className="px-4 py-3">
            <div className="text-sm text-slate-900">{product.mux || '-'}</div>
        </td>
        <td className="px-4 py-3">
            <span className="text-sm text-slate-900">
                {godowns.find(g => g.godown_id === product.godown_id)?.name || product.godown_id || '-'}
            </span>
        </td>
        <td className="px-4 py-3">
            <span className="text-sm text-slate-900">{product.unit || '-'}</span>
        </td>
        <td className="px-4 py-3">
            <span className="text-sm font-medium text-slate-900">{product.quantity || 0}</span>
        </td>
        <td className="px-4 py-3">
            <span className="text-sm font-medium text-slate-900">{product.opening_quantity || 0}</span>
        </td>
        <td className="px-4 py-3">
            <span className="text-sm font-bold text-slate-900">{product.closing_quantity || 0}</span>
        </td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${product.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
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
                {user?.role === 'SUPER ADMIN' && (
                    <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all" title="Delete">
                        <Trash2 size={16} />
                    </Button>
                )}
            </div>
        </td>
    </tr>
);

const MobileProductCard = ({ product, godowns, user, onEdit, onDelete, onToggle }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                <Package size={18} />
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{product.name}</h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{product.mux || 'No MUX'}</span>
                    <span className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {godowns.find(g => g.godown_id === product.godown_id)?.name || 'No Godown'}
                    </span>
                    <span className={`text-[11px] font-medium ${product.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {product.is_active ? 'Active' : 'Disabled'}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase">Qty</span>
                        <span className="text-xs font-semibold text-slate-700">{product.quantity || 0} KG</span>
                    </div>
                    <div className="w-px h-4 bg-slate-200"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase">Opening</span>
                        <span className="text-xs font-medium text-slate-600">{product.opening_quantity || 0}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-200"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase">Closing</span>
                        <span className="text-xs font-bold text-slate-700">{product.closing_quantity || 0}</span>
                    </div>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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