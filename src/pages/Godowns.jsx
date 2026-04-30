import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, MapPin, Phone, Mail, Trash2, Tag } from 'lucide-react';
import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import DeleteModal from '@/components/ui/DeleteModal';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 6;

const DEFAULT_FORM_DATA = {
    godown_id: '',
    name: '',
    address: '',
    contact_person: '',
    contact_number: '',
    is_active: true,
};

const Godowns = ({ isTab = false }) => {
    const { user } = useAuthStore();
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGodown, setEditingGodown] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchGodowns();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const fetchGodowns = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('godowns')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setGodowns(data || []);
        } catch (error) {
            console.error('Error fetching godowns:', error);
            toast.error('Failed to fetch godowns');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingGodown(null);
        setErrors({});
    };

    const handleOpenModal = (godown = null) => {
        if (godown) {
            setEditingGodown(godown);
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...godown,
                contact_number: godown.contact_number || '',
            });
        } else {
            generateGodownId();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const generateGodownId = async () => {
        try {
            const { data, error } = await supabase.rpc('generate_godown_id');
            if (error) throw error;
            setFormData(prev => ({ ...prev, godown_id: data }));
        } catch (error) {
            const count = godowns.length + 1;
            setFormData(prev => ({ ...prev, godown_id: `GODOWN-${count.toString().padStart(4, '0')}` }));
        }
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
        if (!data.name) newErrors.name = 'Name is required';
        if (!data.godown_id) newErrors.godown_id = 'Godown ID is required';
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
            if (editingGodown) {
                const { error } = await supabase
                    .from('godowns')
                    .update({ ...formData, updated_at: new Date().toISOString() })
                    .eq('godown_id', editingGodown.godown_id);
                if (error) throw error;
                toast.success('Godown updated successfully');
            } else {
                const { error } = await supabase
                    .from('godowns')
                    .insert([formData]);
                if (error) throw error;
                toast.success('Godown created successfully');
            }
            handleCloseModal();
            fetchGodowns();
        } catch (error) {
            console.error('Error saving godown:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (godown) => {
        setItemToDelete(godown);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('godowns')
                .delete()
                .eq('godown_id', itemToDelete.godown_id);
            if (error) throw error;
            toast.success('Godown deleted successfully');
            fetchGodowns();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting godown:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredGodowns = useMemo(() => {
        return godowns.filter(godown =>
            godown.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            godown.godown_id?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [godowns, searchTerm]);

    const totalPages = Math.ceil(filteredGodowns.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredGodowns.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredGodowns, currentPage]);

    return (
        <div className="flex flex-col gap-4 pb-6">
            {!isTab && (
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Godowns</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage godown locations and their details.</p>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                    <div className="relative w-full md:w-72 order-2 md:order-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                        <Input
                            type="text"
                            placeholder="Search godowns..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-4 order-1 md:order-2">
                        <div className="hidden xl:flex items-center gap-6">
                            <StatItem label="Total Godowns" value={godowns.length} />
                            <div className="w-px h-8 bg-slate-200"></div>
                            <StatItem
                                label="Active"
                                value={godowns.filter(g => g.is_active).length}
                            />
                        </div>

                        {!loading && (
                            <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium">
                                <Plus size={20} />
                                <span>Add Godown</span>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : currentItems.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">No godowns found.</div>
                    ) : (
                        currentItems.map((godown) => (
                            <MobileGodownCard
                                key={godown.godown_id}
                                godown={godown}
                                user={user}
                                onEdit={() => handleOpenModal(godown)}
                                onDelete={() => handleDelete(godown)}
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
                                    <HeaderCell>Godown Details</HeaderCell>
                                    <HeaderCell>Location</HeaderCell>
                                    <HeaderCell>Contact</HeaderCell>
                                    <HeaderCell align="center">Status</HeaderCell>
                                    <HeaderCell align="right">Actions</HeaderCell>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <EmptyRow message="Loading..." />
                                ) : currentItems.length === 0 ? (
                                    <EmptyRow message="No godowns found." />
                                ) : (
                                    currentItems.map((godown) => (
                                        <GodownRow
                                            key={godown.godown_id}
                                            godown={godown}
                                            user={user}
                                            onEdit={() => handleOpenModal(godown)}
                                            onDelete={() => handleDelete(godown)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="5" className="h-16"></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filteredGodowns.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredGodowns.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredGodowns.length)}
                            onPageChange={setCurrentPage}
                            className="border-t border-slate-100"
                        />
                    )}
                </div>

                {/* Mobile Pagination */}
                {!loading && filteredGodowns.length > 0 && (
                    <div className="md:hidden shrink-0 mt-auto">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredGodowns.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredGodowns.length)}
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
                                {editingGodown ? 'Edit Godown' : 'Add New Godown'}
                            </h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Godown ID
                                    </label>
                                    <div className="inline-flex items-center px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 font-mono text-sm font-bold shadow-sm mb-2">
                                        <Tag size={14} className="mr-2" />
                                        {formData.godown_id || 'AUTO-GENERATING...'}
                                    </div>
                                </div>

                                <FormField
                                    label="Name" name="name" value={formData.name}
                                    onChange={handleInputChange} required error={errors.name}
                                    icon={MapPin} placeholder="Godown name"
                                />

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <textarea
                                        name="address" value={formData.address} onChange={handleInputChange}
                                        rows="2" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="Enter address"
                                    ></textarea>
                                </div>

                                <FormField
                                    label="Contact Person" name="contact_person" value={formData.contact_person}
                                    onChange={handleInputChange} placeholder="Contact person name"
                                />

                                <FormField
                                    label="Contact Number" name="contact_number" value={formData.contact_number}
                                    onChange={handleInputChange} icon={Phone} placeholder="10 digit number"
                                />

                                <div className="md:col-span-2 mt-2">
                                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" name="is_active" checked={formData.is_active} onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </div>
                                        <div>
                                            <span className="block text-sm font-medium text-slate-900">Active Godown</span>
                                            <span className="block text-xs text-slate-500">Allow stock operations</span>
                                        </div>
                                    </label>
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                            <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                {editingGodown ? 'Save Changes' : 'Create Godown'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Godown"
                description="Are you sure you want to delete this godown? This action will remove all recorded location details."
                itemLabel={itemToDelete?.name}
                loading={isDeleting}
            />
        </div>
    );
};

export default Godowns;

// Sub-components
const StatItem = ({ label, value }) => (
    <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
);

const FormField = ({ label, icon: Icon, className = "", ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">{label} {props.required && <span className="text-red-500">*</span>}</label>
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
    <th className={`erp-table-th text-${align}`}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="5" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const GodownRow = ({ godown, user, onEdit, onDelete }) => (
    <tr className="erp-table-tr group">
        <td className="erp-table-td">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <MapPin size={18} />
                </div>
                <div>
                    <div className="font-bold text-slate-900 text-sm">{godown.name}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{godown.godown_id}</div>
                </div>
            </div>
        </td>
        <td className="erp-table-td">
            <div className="text-sm text-slate-500 font-medium line-clamp-1 max-w-[250px]" title={godown.address}>{godown.address || '-'}</div>
        </td>
        <td className="erp-table-td">
            <div className="text-sm text-slate-900 font-bold">{godown.contact_person || '-'}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{godown.contact_number || '-'}</div>
        </td>
        <td className="erp-table-td text-center">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${godown.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${godown.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                {godown.is_active ? 'Active' : 'Inactive'}
            </span>
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

const MobileGodownCard = ({ godown, user, onEdit, onDelete }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                <MapPin size={18} />
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{godown.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{godown.address || 'No address'}</span>
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