import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, ArrowRightLeft, Eye, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';

const ITEMS_PER_PAGE = 6;

const DEFAULT_FORM_DATA = {
    transaction_id: '',
    from_godown_id: '',
    to_godown_id: '',
    product_id: '',
    quantity: 1,
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
};

const InternalTransactions = ({ isTab = false }) => {
    const [transactions, setTransactions] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewTransaction, setViewTransaction] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [transRes, godownsRes, productsRes] = await Promise.all([
                supabase.from('internal_transactions').select('*').order('created_at', { ascending: false }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true })
            ]);
            if (transRes.error) throw transRes.error;
            setTransactions(transRes.data || []);
            setGodowns(godownsRes.data || []);
            setProducts(productsRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch transactions');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setErrors({});
    };

    const handleOpenModal = () => {
        generateTransactionId();
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const handleViewTransaction = (transaction) => {
        setViewTransaction(transaction);
        setViewModalOpen(true);
    };

    const handleCloseViewModal = () => {
        setViewModalOpen(false);
        setViewTransaction(null);
    };

    const generateTransactionId = async () => {
        try {
            const { data, error } = await supabase.rpc('generate_transaction_id');
            if (error) throw error;
            setFormData(prev => ({ ...prev, transaction_id: data }));
        } catch (error) {
            const count = transactions.length + 1;
            const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
            setFormData(prev => ({ ...prev, transaction_id: `TRF-${date}-${count.toString().padStart(4, '0')}` }));
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
        setFormData(prev => ({ ...prev, transfer_date: date }));
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.from_godown_id) newErrors.from_godown_id = 'Source godown is required';
        if (!data.to_godown_id) newErrors.to_godown_id = 'Destination godown is required';
        if (!data.product_id) newErrors.product_id = 'Product is required';
        if (!data.quantity || data.quantity <= 0) newErrors.quantity = 'Valid quantity is required';
        if (data.from_godown_id === data.to_godown_id) newErrors.to_godown_id = 'Cannot transfer to same godown';
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
            // Check stock availability
            const { data: stockData, error: stockError } = await supabase
                .from('product_godown_stock')
                .select('current_stock')
                .eq('product_id', formData.product_id)
                .eq('godown_id', formData.from_godown_id)
                .single();

            if (!stockData || (parseFloat(stockData.current_stock) || 0) < parseFloat(formData.quantity)) {
                toast.error('Insufficient stock in source godown');
                return;
            }

            // Create transaction
            const { error } = await supabase
                .from('internal_transactions')
                .insert([{
                    ...formData,
                    quantity: parseFloat(formData.quantity),
                    status: 'completed',
                    created_at: new Date().toISOString()
                }]);
            if (error) throw error;

            // Update stock - remove from source
            const currentStock = parseFloat(stockData.current_stock) || 0;
            const newFromStock = currentStock - parseFloat(formData.quantity);
            
            await supabase
                .from('product_godown_stock')
                .update({ current_stock: newFromStock, updated_at: new Date().toISOString() })
                .eq('product_id', formData.product_id)
                .eq('godown_id', formData.from_godown_id);

            // Add to destination
            const { data: destStock } = await supabase
                .from('product_godown_stock')
                .select('current_stock')
                .eq('product_id', formData.product_id)
                .eq('godown_id', formData.to_godown_id)
                .single();

            if (destStock) {
                const newDestStock = (parseFloat(destStock.current_stock) || 0) + parseFloat(formData.quantity);
                await supabase
                    .from('product_godown_stock')
                    .update({ current_stock: newDestStock, updated_at: new Date().toISOString() })
                    .eq('product_id', formData.product_id)
                    .eq('godown_id', formData.to_godown_id);
            } else {
                await supabase
                    .from('product_godown_stock')
                    .insert([{
                        product_id: formData.product_id,
                        godown_id: formData.to_godown_id,
                        current_stock: parseFloat(formData.quantity)
                    }]);
            }

            // Create notification
            await supabase.from('stock_notifications').insert([{
                notification_type: 'transfer',
                title: 'Internal Transfer Completed',
                message: `${formData.quantity} units transferred from ${godowns.find(g => g.godown_id === formData.from_godown_id)?.name || formData.from_godown_id} to ${godowns.find(g => g.godown_id === formData.to_godown_id)?.name || formData.to_godown_id}`,
                product_id: formData.product_id,
                related_id: formData.transaction_id
            }]);

            toast.success('Transfer completed successfully');
            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error creating transfer:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = async (transaction) => {
        if (!confirm('Are you sure you want to delete this transfer?')) return;
        try {
            const { error } = await supabase
                .from('internal_transactions')
                .delete()
                .eq('transaction_id', transaction.transaction_id);
            if (error) throw error;
            toast.success('Transfer deleted successfully');
            fetchData();
        } catch (error) {
            console.error('Error deleting transfer:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => 
            t.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.product_id?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [transactions, searchTerm]);

    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredTransactions, currentPage]);

    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;

    return (
        <div className="flex flex-col gap-4 pb-6">
            {!isTab && (
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Internal Transactions</h1>
                    <p className="text-slate-500 mt-1 text-sm">Transfer products between godowns.</p>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                    <div className="relative w-full md:w-72 order-2 md:order-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                        <Input
                            type="text"
                            placeholder="Search transfers..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-4 order-1 md:order-2">
                        <div className="hidden xl:flex items-center gap-6">
                            <StatItem label="Total Transfers" value={transactions.length} />
                        </div>

                        {!loading && (
                            <Button onClick={handleOpenModal} className="gap-2 px-4 shadow-sm font-medium">
                                <Plus size={20} />
                                <span>New Transfer</span>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : currentItems.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">No transfers found.</div>
                    ) : (
                        currentItems.map((t) => (
                            <MobileTransactionCard
                                key={t.transaction_id}
                                transaction={t}
                                getGodownName={getGodownName}
                                getProductName={getProductName}
                                onView={() => handleViewTransaction(t)}
                                onDelete={() => handleDelete(t)}
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
                                    <HeaderCell>Transfer ID</HeaderCell>
                                    <HeaderCell>From → To</HeaderCell>
                                    <HeaderCell>Product</HeaderCell>
                                    <HeaderCell>Qty</HeaderCell>
                                    <HeaderCell>Date</HeaderCell>
                                    <HeaderCell align="right">Actions</HeaderCell>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <EmptyRow message="Loading..." />
                                ) : currentItems.length === 0 ? (
                                    <EmptyRow message="No transfers found." />
                                ) : (
                                    currentItems.map((t) => (
                                        <TransactionRow
                                            key={t.transaction_id}
                                            transaction={t}
                                            getGodownName={getGodownName}
                                            getProductName={getProductName}
                                            onView={() => handleViewTransaction(t)}
                                            onDelete={() => handleDelete(t)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="6" className="h-16"></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filteredTransactions.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredTransactions.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)}
                            onPageChange={setCurrentPage}
                            className="border-t border-slate-100"
                        />
                    )}
                </div>

                {!loading && filteredTransactions.length > 0 && (
                    <div className="md:hidden shrink-0 mt-auto">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredTransactions.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)}
                            onPageChange={setCurrentPage}
                            className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
                        />
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">New Transfer</h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <FormField
                                    label="Transfer ID" value={formData.transaction_id}
                                    disabled placeholder="Auto-generated"
                                />

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">From Godown <span className="text-red-500">*</span></label>
                                    <select
                                        name="from_godown_id" value={formData.from_godown_id} onChange={handleInputChange}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none"
                                    >
                                        <option value="">Select Source Godown</option>
                                        {godowns.map(g => (
                                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                        ))}
                                    </select>
                                    {errors.from_godown_id && <p className="text-red-500 text-xs">{errors.from_godown_id}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">To Godown <span className="text-red-500">*</span></label>
                                    <select
                                        name="to_godown_id" value={formData.to_godown_id} onChange={handleInputChange}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none"
                                    >
                                        <option value="">Select Destination Godown</option>
                                        {godowns.filter(g => g.godown_id !== formData.from_godown_id).map(g => (
                                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                                        ))}
                                    </select>
                                    {errors.to_godown_id && <p className="text-red-500 text-xs">{errors.to_godown_id}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Product <span className="text-red-500">*</span></label>
                                    <select
                                        name="product_id" value={formData.product_id} onChange={handleInputChange}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-primary focus:outline-none"
                                    >
                                        <option value="">Select Product</option>
                                        {products.map(p => (
                                            <option key={p.product_id} value={p.product_id}>{p.name}</option>
                                        ))}
                                    </select>
                                    {errors.product_id && <p className="text-red-500 text-xs">{errors.product_id}</p>}
                                </div>

                                <FormField
                                    label="Quantity" name="quantity" type="number" value={formData.quantity}
                                    onChange={handleInputChange} required error={errors.quantity}
                                    placeholder="Enter quantity"
                                />

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Transfer Date</label>
                                    <DatePicker
                                        value={formData.transfer_date}
                                        onChange={handleDateChange}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                    <textarea
                                        name="notes" value={formData.notes} onChange={handleInputChange}
                                        rows="2" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="Optional notes"
                                    ></textarea>
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                            <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                Transfer Stock
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Modal */}
            {viewModalOpen && viewTransaction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseViewModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">Transfer Details</h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseViewModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="space-y-4">
                                <DetailItem label="Transfer ID" value={viewTransaction.transaction_id} />
                                <DetailItem label="From" value={getGodownName(viewTransaction.from_godown_id)} />
                                <DetailItem label="To" value={getGodownName(viewTransaction.to_godown_id)} />
                                <DetailItem label="Product" value={getProductName(viewTransaction.product_id)} />
                                <DetailItem label="Quantity" value={viewTransaction.quantity} />
                                <DetailItem label="Date" value={viewTransaction.transfer_date} />
                                <DetailItem label="Status" value={viewTransaction.status} />
                                {viewTransaction.notes && <DetailItem label="Notes" value={viewTransaction.notes} />}
                            </div>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <Button onClick={handleCloseViewModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InternalTransactions;

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

const DetailItem = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-slate-100">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="text-sm font-medium text-slate-900">{value || '-'}</span>
    </div>
);

const HeaderCell = ({ children, align = "left" }) => (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="6" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const TransactionRow = ({ transaction, getGodownName, getProductName, onView, onDelete }) => (
    <tr className="hover:bg-slate-50/80 transition-colors group">
        <td className="px-4 py-3 text-sm text-slate-900">{transaction.transaction_id}</td>
        <td className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-900">{getGodownName(transaction.from_godown_id)}</span>
                <ArrowRightLeft size={14} className="text-slate-400" />
                <span className="text-slate-900">{getGodownName(transaction.to_godown_id)}</span>
            </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-900">{getProductName(transaction.product_id)}</td>
        <td className="px-4 py-3 text-sm text-slate-900">{transaction.quantity}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{transaction.transfer_date}</td>
        <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" type="button" onClick={onView} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all" title="View">
                    <Eye size={16} />
                </Button>
                <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all" title="Delete">
                    <Trash2 size={16} />
                </Button>
            </div>
        </td>
    </tr>
);

const MobileTransactionCard = ({ transaction, getGodownName, getProductName, onView, onDelete }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <ArrowRightLeft size={18} />
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{transaction.transaction_id}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{getProductName(transaction.product_id)}</span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500">{transaction.quantity} qty</span>
                </div>
            </div>
        </div>
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onView} className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors">
                <Eye size={18} />
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