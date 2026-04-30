import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Trash2, User, Phone, MapPin, Mail, Hash, Calendar } from 'lucide-react';
import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import DeleteModal from '@/components/ui/DeleteModal';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM_DATA = {
    customer_name: '',
    location: '',
    customer_number: '',
    gst_number: '',
    crm_follow_up: '',
    email_id: '',
};

const Customers = () => {
    const { user } = useAuthStore();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('master_customers')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
            toast.error('Failed to fetch customers');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingCustomer(null);
        setErrors({});
    };

    const handleOpenModal = (customer = null) => {
        if (customer) {
            setEditingCustomer(customer);
            setFormData({
                customer_name: customer.customer_name || '',
                location: customer.location || '',
                customer_number: customer.customer_number || '',
                gst_number: customer.gst_number || '',
                crm_follow_up: customer.crm_follow_up || '',
                email_id: customer.email_id || '',
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
        if (!data.customer_name) newErrors.customer_name = 'Customer Name is required';
        if (!data.customer_number) newErrors.customer_number = 'Customer Number is required';
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
            if (editingCustomer) {
                const { error } = await supabase
                    .from('master_customers')
                    .update(formData)
                    .eq('id', editingCustomer.id);
                if (error) throw error;
                toast.success('Customer updated successfully');
            } else {
                const { error } = await supabase
                    .from('master_customers')
                    .insert([formData]);
                if (error) throw error;
                toast.success('Customer created successfully');
            }
            handleCloseModal();
            fetchCustomers();
        } catch (error) {
            console.error('Error saving customer:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (customer) => {
        setItemToDelete(customer);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('master_customers')
                .delete()
                .eq('id', itemToDelete.id);
            if (error) throw error;
            toast.success('Customer deleted successfully');
            fetchCustomers();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting customer:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredCustomers = useMemo(() => {
        return customers.filter(customer =>
            customer.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.customer_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.gst_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [customers, searchTerm]);

    const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredCustomers, currentPage]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                <div className="relative w-full md:w-72 order-2 md:order-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                    <Input
                        type="text"
                        placeholder="Search customers..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium order-1 md:order-2">
                    <Plus size={20} />
                    <span>Add Customer</span>
                </Button>
            </div>

            <div className="erp-table-container flex-col overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="erp-table">
                        <thead className="erp-table-thead">
                            <tr className="erp-table-tr">
                                <th className="erp-table-th">Customer Details</th>
                                <th className="erp-table-th">Contact Info</th>
                                <th className="erp-table-th">GST Number</th>
                                <th className="erp-table-th">CRM Follow Up</th>
                                <th className="erp-table-th text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500 text-sm">Loading...</td></tr>
                            ) : currentItems.length === 0 ? (
                                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500 text-sm">No customers found.</td></tr>
                            ) : (
                                currentItems.map((customer) => (
                                    <tr key={customer.id} className="erp-table-tr group">
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                                                    <User size={18} />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{customer.customer_name}</div>
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                        <MapPin size={10} className="text-primary" /> {customer.location || 'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-sm text-slate-700 font-bold">
                                                    <Phone size={14} className="text-slate-400" />
                                                    {customer.customer_number || 'N/A'}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                                    <Mail size={14} className="text-slate-400" />
                                                    {customer.email_id || 'N/A'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="text-sm font-black text-slate-400 bg-slate-50 px-2 py-1 rounded inline-block">{customer.gst_number || 'N/A'}</div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="text-[11px] font-medium text-slate-500 italic truncate max-w-[150px]" title={customer.crm_follow_up}>{customer.crm_follow_up || 'No follow up'}</div>
                                        </td>
                                        <td className="erp-table-td text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenModal(customer)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                                                    <Edit2 size={16} />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(customer)} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all">
                                                    <Trash2 size={16} />
                                                </Button>
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
                                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                            </h2>
                            <Button variant="ghost" size="icon" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Customer Name *</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <Input name="customer_name" value={formData.customer_name} onChange={handleInputChange} className="pl-10" placeholder="Enter customer name" />
                                    </div>
                                    {errors.customer_name && <p className="text-red-500 text-xs mt-1">{errors.customer_name}</p>}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Customer Number *</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <Input name="customer_number" value={formData.customer_number} onChange={handleInputChange} className="pl-10" placeholder="Phone number" />
                                        </div>
                                        {errors.customer_number && <p className="text-red-500 text-xs mt-1">{errors.customer_number}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Email ID</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <Input name="email_id" value={formData.email_id} onChange={handleInputChange} className="pl-10" placeholder="Email address" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Location</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <Input name="location" value={formData.location} onChange={handleInputChange} className="pl-10" placeholder="City or area" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">GST Number</label>
                                    <div className="relative">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <Input name="gst_number" value={formData.gst_number} onChange={handleInputChange} className="pl-10" placeholder="GSTIN" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">CRM Follow Up</label>
                                    <Input name="crm_follow_up" value={formData.crm_follow_up} onChange={handleInputChange} placeholder="CRM details" />
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                            <Button onClick={handleSubmit}>{editingCustomer ? 'Save Changes' : 'Create Customer'}</Button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Customer"
                description="Are you sure you want to delete this customer? This action cannot be undone."
                itemLabel={itemToDelete?.customer_name}
                loading={isDeleting}
            />
        </div>
    );
};

export default Customers;
