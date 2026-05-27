import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Trash2, Building, Phone, MapPin, Mail, Hash } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { vendorService } from '../services/vendorService';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import DeleteModal from '@/components/ui/DeleteModal';
import Pagination from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const DEFAULT_FORM_DATA = {
    vendor_name: '',
    location: '',
    email_id: '',
    gst_number: '',
    vendor_number: '',
};

const Vendors = () => {
    const { user } = useAuthStore();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const data = await vendorService.getAll();
            setVendors(data);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            toast.error('Failed to fetch vendors');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingVendor(null);
        setErrors({});
    };

    const handleOpenModal = (vendor = null) => {
        if (vendor) {
            setEditingVendor(vendor);
            setFormData({
                vendor_name: vendor.vendor_name || '',
                location: vendor.location || '',
                email_id: vendor.email_id || '',
                gst_number: vendor.gst_number || '',
                vendor_number: vendor.vendor_number || '',
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
        if (!data.vendor_name) newErrors.vendor_name = 'Vendor Name is required';
        if (!data.vendor_number) newErrors.vendor_number = 'Vendor Number is required';
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
            if (editingVendor) {
                await vendorService.update(editingVendor.id, formData);
                toast.success('Vendor updated successfully');
            } else {
                await vendorService.create(formData);
                toast.success('Vendor created successfully');
            }
            handleCloseModal();
            fetchVendors();
        } catch (error) {
            console.error('Error saving vendor:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (vendor) => {
        setItemToDelete(vendor);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            await vendorService.delete(itemToDelete.id);
            toast.success('Vendor deleted successfully');
            fetchVendors();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting vendor:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredVendors = useMemo(() => {
        return vendors.filter(vendor =>
            vendor.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vendor.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vendor.vendor_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vendor.gst_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [vendors, searchTerm]);

    const totalPages = Math.ceil(filteredVendors.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredVendors.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredVendors, currentPage]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                <div className="relative w-full md:w-72 order-2 md:order-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                    <Input
                        type="text"
                        placeholder="Search vendors..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium order-1 md:order-2">
                    <Plus size={20} />
                    <span>Add Purchase Vendor</span>
                </Button>
            </div>

            <div className="erp-table-container flex-col overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="erp-table">
                        <thead className="erp-table-thead">
                            <tr className="erp-table-tr">
                                <th className="erp-table-th">Vendor Name</th>
                                <th className="erp-table-th">Location</th>
                                <th className="erp-table-th">Phone</th>
                                <th className="erp-table-th">Email</th>
                                <th className="erp-table-th">GST Number</th>
                                <th className="erp-table-th text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500 text-sm">Loading...</td></tr>
                            ) : currentItems.length === 0 ? (
                                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500 text-sm">No vendors found.</td></tr>
                            ) : (
                                currentItems.map((vendor) => (
                                    <tr key={vendor.id} className="erp-table-tr group">
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-all duration-300">
                                                    <Building size={18} />
                                                </div>
                                                <div className="font-bold text-slate-900 text-sm">{vendor.vendor_name}</div>
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-1 text-sm text-slate-500">
                                                <MapPin size={14} className="text-slate-400 shrink-0" />
                                                {vendor.location || ''}
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-700 font-bold">
                                                <Phone size={14} className="text-slate-400 shrink-0" />
                                                {vendor.vendor_number || ''}
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-500">
                                                <Mail size={14} className="text-slate-400 shrink-0" />
                                                {vendor.email_id || ''}
                                            </div>
                                        </td>
                                        <td className="erp-table-td">
                                            <span className="text-sm font-black text-slate-400 bg-slate-50 px-2 py-1 rounded inline-block">{vendor.gst_number || ''}</span>
                                        </td>
                                        <td className="erp-table-td text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenModal(vendor)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                                                    <Edit2 size={16} />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(vendor)} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all">
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                            {!loading && Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                <tr key={`empty-${i}`}><td colSpan="6" className="h-16"></td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!loading && filteredVendors.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredVendors.length}
                        startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                        endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredVendors.length)}
                        onPageChange={setCurrentPage}
                        className="border-t border-slate-100"
                    />
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingVendor ? 'Edit Purchase Vendor' : 'Add New Purchase Vendor'}
                            </h2>
                            <Button variant="ghost" size="icon" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Purchase Vendor Name *</label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <Input name="vendor_name" value={formData.vendor_name} onChange={handleInputChange} className="pl-10" placeholder="Enter vendor name" />
                                    </div>
                                    {errors.vendor_name && <p className="text-red-500 text-xs mt-1">{errors.vendor_name}</p>}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Vendor Number *</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <Input name="vendor_number" value={formData.vendor_number} onChange={handleInputChange} className="pl-10" placeholder="Phone number" />
                                        </div>
                                        {errors.vendor_number && <p className="text-red-500 text-xs mt-1">{errors.vendor_number}</p>}
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
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                            <Button onClick={handleSubmit}>{editingVendor ? 'Save Changes' : 'Create Purchase Vendor'}</Button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Purchase Vendor"
                description="Are you sure you want to delete this purchase vendor? This action cannot be undone."
                itemLabel={itemToDelete?.vendor_name}
                loading={isDeleting}
            />
        </div>
    );
};

export default Vendors;
