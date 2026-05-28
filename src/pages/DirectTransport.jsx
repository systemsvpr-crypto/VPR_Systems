import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Trash2, Truck, Package, User, CalendarDays, FileText } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { directTransportService } from '../services/directTransportService';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { DatePicker } from '@/components/ui/date-picker';
import DeleteModal from '@/components/ui/DeleteModal';
import Pagination from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM_DATA = {
    product_name: '',
    transporter_id: '',
    customer_name: '',
    quantity: '',
    delivery_date: '',
    notes: '',
};

const DirectTransport = () => {
    const { user } = useAuthStore();
    const [entries, setEntries] = useState([]);
    const [products, setProducts] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [entries, products, transporters, customers] = await Promise.all([
                directTransportService.getAll(),
                directTransportService.getProducts(),
                directTransportService.getTransporters(),
                directTransportService.getCustomers(),
            ]);
            setEntries(entries);
            setProducts(products);
            setTransporters(transporters);
            setCustomers(customers);
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
    };

    const handleOpenModal = (entry = null) => {
        if (entry) {
            setEditingEntry(entry);
            setFormData({
                product_name: entry.product_name || '',
                transporter_id: entry.transporter_id || '',
                customer_name: entry.customer_name || '',
                quantity: entry.quantity || '',
                delivery_date: entry.delivery_date || '',
                notes: entry.notes || '',
            });
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
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.product_name) newErrors.product_name = 'Product is required';
        if (!data.transporter_id) newErrors.transporter_id = 'Transporter is required';
        if (!data.quantity || parseFloat(data.quantity) <= 0) newErrors.quantity = 'Valid quantity is required';
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

        const payload = {
            ...formData,
            quantity: parseFloat(formData.quantity),
            created_by: user?.full_name || user?.Name || user?.username || null,
        };

        try {
            if (editingEntry) {
                await directTransportService.update(editingEntry.id, payload);
                toast.success('Entry updated successfully');
            } else {
                await directTransportService.create(payload);
                toast.success('Entry created successfully');
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
            await directTransportService.delete(itemToDelete.id);
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

    const filteredEntries = useMemo(() => {
        return entries.filter(entry =>
            entry.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transporters.find(t => t.transporter_id === entry.transporter_id)?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [entries, searchTerm, transporters]);

    const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredEntries, currentPage]);

    const getTransporterName = (id) => transporters.find(t => t.transporter_id === id)?.name || id;

    const productOptions = useMemo(() => {
        const seen = new Set();
        return products.filter(p => {
            if (seen.has(p.name)) return false;
            seen.add(p.name);
            return true;
        }).map(p => ({ value: p.name, label: p.name }));
    }, [products]);

    const transporterOptions = useMemo(() =>
        transporters.map(t => ({ value: t.transporter_id, label: t.name })),
        [transporters]
    );

    const customerOptions = useMemo(() =>
        customers.map(c => ({ value: c.customer_name, label: c.customer_name })),
        [customers]
    );

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Direct Transport</h1>
                <p className="text-slate-500 mt-1 text-sm">Track deliveries to customers via transporters. No stock impact.</p>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                    <div className="relative w-full md:w-72 order-2 md:order-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                        <Input
                            type="text"
                            placeholder="Search by product, transporter, customer..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-4 order-1 md:order-2">
                        <div className="hidden xl:flex items-center gap-6">
                            <StatItem label="Total Entries" value={entries.length} />
                        </div>

                        {!loading && (
                            <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium">
                                <Plus size={20} />
                                <span>Add Entry</span>
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
                        currentItems.map((entry) => (
                            <MobileEntryCard
                                key={entry.id}
                                entry={entry}
                                user={user}
                                getTransporterName={getTransporterName}
                                onEdit={() => handleOpenModal(entry)}
                                onDelete={() => handleDelete(entry)}
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
                                    <HeaderCell>Product Name</HeaderCell>
                                    <HeaderCell>Transporter</HeaderCell>
                                    <HeaderCell>Customer Name</HeaderCell>
                                    <HeaderCell align="center">Quantity</HeaderCell>
                                    <HeaderCell>Delivery Date</HeaderCell>
                                    <HeaderCell>Notes</HeaderCell>
                                    <HeaderCell align="right">Actions</HeaderCell>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <EmptyRow message="Loading..." />
                                ) : currentItems.length === 0 ? (
                                    <EmptyRow message="No entries found." />
                                ) : (
                                    currentItems.map((entry) => (
                                        <EntryRow
                                            key={entry.id}
                                            entry={entry}
                                            user={user}
                                            getTransporterName={getTransporterName}
                                            onEdit={() => handleOpenModal(entry)}
                                            onDelete={() => handleDelete(entry)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="7" className="h-16"></td></tr>
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

                {/* Mobile Pagination */}
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
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingEntry ? 'Edit Entry' : 'Add New Entry'}
                            </h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">
                                        Product Name <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={productOptions}
                                        value={formData.product_name}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, product_name: value }));
                                            if (errors.product_name) setErrors(prev => ({ ...prev, product_name: '' }));
                                        }}
                                        placeholder="Select product..."
                                        searchPlaceholder="Search products..."
                                        error={errors.product_name}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">
                                        Transporter <span className="text-red-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={transporterOptions}
                                        value={formData.transporter_id}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, transporter_id: value }));
                                            if (errors.transporter_id) setErrors(prev => ({ ...prev, transporter_id: '' }));
                                        }}
                                        placeholder="Select transporter..."
                                        searchPlaceholder="Search transporters..."
                                        error={errors.transporter_id}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">
                                        Customer Name
                                    </label>
                                    <SearchableSelect
                                        options={customerOptions}
                                        value={formData.customer_name}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, customer_name: value }));
                                        }}
                                        placeholder="Select customer..."
                                        searchPlaceholder="Search customers..."
                                    />
                                </div>

                                <FormField
                                    label="Quantity Delivered"
                                    name="quantity"
                                    value={formData.quantity}
                                    onChange={handleInputChange}
                                    required
                                    error={errors.quantity}
                                    icon={Package}
                                    placeholder="Enter quantity"
                                    type="number"
                                    min="0"
                                    step="any"
                                />

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Delivery Date</label>
                                    <DatePicker
                                        name="delivery_date"
                                        value={formData.delivery_date}
                                        onChange={handleInputChange}
                                        placeholder="Select delivery date"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Notes</label>
                                    <div className="relative">
                                        <textarea
                                            name="notes"
                                            value={formData.notes}
                                            onChange={handleInputChange}
                                            placeholder="Any additional notes..."
                                            rows={3}
                                            className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                                        />
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">
                                Cancel
                            </Button>
                            <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                {editingEntry ? 'Save Changes' : 'Create Entry'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Entry"
                description="Are you sure you want to delete this direct transport entry?"
                itemLabel={`${itemToDelete?.product_name || ''} - ${itemToDelete?.customer_name || ''}`}
                loading={isDeleting}
            />
        </div>
    );
};

export default DirectTransport;

const StatItem = ({ label, value }) => (
    <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
);

const FormField = ({ label, icon: Icon, className = "", ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">
            {label} {props.required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />}
            <Input
                className={cn(`${Icon ? 'pl-10' : 'pl-4'} pr-4 h-10 w-full`, className)}
                {...props}
            />
        </div>
        {props.error && <p className="text-red-500 text-xs mt-1 animate-in slide-in-from-top-1">{props.error}</p>}
    </div>
);

const HeaderCell = ({ children, align = "left" }) => (
    <th className={cn('erp-table-th', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="7" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const EntryRow = ({ entry, user, getTransporterName, onEdit, onDelete }) => (
    <tr className="erp-table-tr group">
        <td className="erp-table-td">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Package size={16} />
                </div>
                <span className="font-medium text-slate-900 text-sm">{entry.product_name}</span>
            </div>
        </td>
        <td className="erp-table-td">
            <div className="flex items-center gap-2">
                <Truck size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700">{getTransporterName(entry.transporter_id)}</span>
            </div>
        </td>
        <td className="erp-table-td">
            <div className="flex items-center gap-2">
                <User size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700">{entry.customer_name || '-'}</span>
            </div>
        </td>
        <td className="erp-table-td text-center">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                {entry.quantity}
            </span>
        </td>
        <td className="erp-table-td">
            <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-600">
                    {entry.delivery_date ? new Date(entry.delivery_date + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                </span>
            </div>
        </td>
        <td className="erp-table-td">
            <div className="flex items-center gap-2 max-w-[200px]">
                <FileText size={14} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-500 truncate">{entry.notes || '-'}</span>
            </div>
        </td>
        <td className="erp-table-td text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                <Button variant="ghost" size="icon" type="button" onClick={onEdit} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all" title="Edit">
                    <Edit2 size={16} />
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

const MobileEntryCard = ({ entry, user, getTransporterName, onEdit, onDelete }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <Package size={18} />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{entry.product_name}</h3>
                    <p className="text-xs text-slate-500">{getTransporterName(entry.transporter_id)}</p>
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
        <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
                <User size={12} />
                <span>{entry.customer_name || '-'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
                <Package size={12} />
                <span>Qty: <strong>{entry.quantity}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
                <CalendarDays size={12} />
                <span>{entry.delivery_date ? new Date(entry.delivery_date + 'T00:00:00').toLocaleDateString('en-IN') : '-'}</span>
            </div>
            {entry.notes && (
                <div className="col-span-2 flex items-center gap-1.5 text-slate-500 mt-1 pt-2 border-t border-slate-100">
                    <FileText size={12} />
                    <span className="italic">{entry.notes}</span>
                </div>
            )}
        </div>
    </div>
);
