import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Edit2, X, Trash2, Truck, Phone, Package, ArrowDown } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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

const ITEMS_PER_PAGE = 6;

const DEFAULT_FORM_DATA = {
    name: '',
    vehicle_number: '',
    driver_phone: '',
    is_active: true,
};

const Transporters = () => {
    const [transporters, setTransporters] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [historyDateFilter, setHistoryDateFilter] = useState('');
    const [historyTransporterFilter, setHistoryTransporterFilter] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTransporter, setEditingTransporter] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        setHistoryPage(1);
    }, [historySearchTerm, historyDateFilter, historyTransporterFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [transportersRes, godownsRes, productsRes] = await Promise.all([
                supabase.from('transporters').select('*').order('created_at', { ascending: false }),
                supabase.from('godowns').select('*').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true })
            ]);
            if (transportersRes.error) throw transportersRes.error;
            setTransporters(transportersRes.data || []);
            setGodowns(godownsRes.data || []);
            setProducts(productsRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistoryEntries = async () => {
        try {
            const { data, error } = await supabase
                .from('stock_management')
                .select('*, godowns!stock_management_from_location_fkey(name), transporters!stock_management_transporter_id_fkey(name)')
                .eq('transaction_type', 'in')
                .not('transporter_id', 'is', null)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching history:', error);
            return [];
        }
    };

    const [historyEntries, setHistoryEntries] = useState([]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistoryEntries().then(setHistoryEntries);
        }
    }, [activeTab]);

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingTransporter(null);
        setErrors({});
    };

    const handleOpenModal = (transporter = null) => {
        if (transporter) {
            setEditingTransporter(transporter);
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...transporter,
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
        if (!data.name) newErrors.name = 'Transporter Name is required';
        if (!data.vehicle_number) newErrors.vehicle_number = 'Vehicle Number is required';
        if (!data.driver_phone) newErrors.driver_phone = 'Driver Phone No. is required';
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
            if (editingTransporter) {
                const { error } = await supabase
                    .from('transporters')
                    .update({ ...formData, updated_at: new Date().toISOString() })
                    .eq('transporter_id', editingTransporter.transporter_id);
                if (error) throw error;
                toast.success('Transporter updated successfully');
            } else {
                const { error } = await supabase
                    .from('transporters')
                    .insert([formData]);
                if (error) throw error;
                toast.success('Transporter created successfully');
            }
            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error saving transporter:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = async (transporter) => {
        if (!confirm(`Are you sure you want to delete "${transporter.name}"?`)) return;
        try {
            const { error } = await supabase
                .from('transporters')
                .delete()
                .eq('transporter_id', transporter.transporter_id);
            if (error) throw error;
            toast.success('Transporter deleted successfully');
            fetchData();
        } catch (error) {
            console.error('Error deleting transporter:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const filteredTransporters = useMemo(() => {
        return transporters.filter(transporter =>
            transporter.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transporter.vehicle_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transporter.driver_phone?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [transporters, searchTerm]);

    const filteredHistory = useMemo(() => {
        return historyEntries.filter(entry => {
            const transporter = transporters.find(t => t.transporter_id === entry.transporter_id);
            const transporterName = transporter?.name?.toLowerCase() || '';
            const matchesSearch = transporterName.includes(historySearchTerm.toLowerCase()) ||
                entry.lr_number?.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                entry.entry_id?.toLowerCase().includes(historySearchTerm.toLowerCase());
            const matchesDate = !historyDateFilter || entry.date === historyDateFilter;
            const matchesTransporter = historyTransporterFilter === 'all' || entry.transporter_id === historyTransporterFilter;
            return matchesSearch && matchesDate && matchesTransporter;
        });
    }, [historyEntries, historySearchTerm, historyDateFilter, historyTransporterFilter, transporters]);

    const totalPages = Math.ceil(filteredTransporters.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransporters.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredTransporters, currentPage]);

    const historyTotalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const currentHistoryItems = useMemo(() => {
        const start = (historyPage - 1) * ITEMS_PER_PAGE;
        return filteredHistory.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredHistory, historyPage]);

    const totalFreightAmount = filteredHistory.reduce((sum, e) => sum + (parseFloat(e.freight_amount) || 0), 0);

    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;
    const getTransporterName = (id) => transporters.find(t => t.transporter_id === id)?.name || '-';

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Transporters</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage transporter details and freight history.</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('list')}
                    className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'list' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Truck size={16} />
                    Transporters List
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-3 text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'history' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Package size={16} />
                    Freight History
                </button>
            </div>

            {activeTab === 'list' && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                        <div className="relative w-full md:w-72 order-2 md:order-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                            <Input
                                type="text"
                                placeholder="Search transporters..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-4 order-1 md:order-2">
                            <div className="hidden xl:flex items-center gap-6">
                                <StatItem label="Total Transporters" value={transporters.length} />
                                <div className="w-px h-8 bg-slate-200"></div>
                                <StatItem
                                    label="Active"
                                    value={transporters.filter(t => t.is_active).length}
                                />
                            </div>

                            {!loading && (
                                <Button onClick={() => handleOpenModal()} className="gap-2 px-4 shadow-sm font-medium">
                                    <Plus size={20} />
                                    <span>Add Transporter</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-slate-500">Loading...</div>
                        ) : currentItems.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">No transporters found.</div>
                        ) : (
                            currentItems.map((transporter) => (
                                <MobileTransporterCard
                                    key={transporter.transporter_id}
                                    transporter={transporter}
                                    onEdit={() => handleOpenModal(transporter)}
                                    onDelete={() => handleDelete(transporter)}
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
                                        <HeaderCell>Transporter Details</HeaderCell>
                                        <HeaderCell>Vehicle Number</HeaderCell>
                                        <HeaderCell>Driver Phone</HeaderCell>
                                        <HeaderCell>Status</HeaderCell>
                                        <HeaderCell align="right">Actions</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <EmptyRow message="Loading..." />
                                    ) : currentItems.length === 0 ? (
                                        <EmptyRow message="No transporters found." />
                                    ) : (
                                        currentItems.map((transporter) => (
                                            <TransporterRow
                                                key={transporter.transporter_id}
                                                transporter={transporter}
                                                onEdit={() => handleOpenModal(transporter)}
                                                onDelete={() => handleDelete(transporter)}
                                            />
                                        ))
                                    )}
                                    {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`}><td colSpan="5" className="h-16"></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!loading && filteredTransporters.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredTransporters.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredTransporters.length)}
                                onPageChange={setCurrentPage}
                                className="border-t border-slate-100"
                            />
                        )}
                    </div>

                    {/* Mobile Pagination */}
                    {!loading && filteredTransporters.length > 0 && (
                        <div className="md:hidden shrink-0 mt-auto">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredTransporters.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredTransporters.length)}
                                onPageChange={setCurrentPage}
                                className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
                            />
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="flex flex-col gap-4">
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                            <div className="relative w-full sm:w-56">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                                <Input
                                    type="text"
                                    placeholder="Search by transporter, LR..."
                                    className="pl-9"
                                    value={historySearchTerm}
                                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                                />
                            </div>
                            <Select value={historyTransporterFilter} onValueChange={setHistoryTransporterFilter}>
                                <SelectTrigger className="w-full sm:w-[180px] h-10">
                                    <SelectValue placeholder="All Transporters" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Transporters</SelectLabel>
                                        <SelectItem value="all">All Transporters</SelectItem>
                                        {transporters.map(t => (
                                            <SelectItem key={t.transporter_id} value={t.transporter_id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <div className="w-full sm:w-44">
                                <DatePicker
                                    value={historyDateFilter}
                                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                                    placeholder="Filter by date"
                                />
                            </div>
                            {(historyDateFilter || historyTransporterFilter !== 'all') && (
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setHistoryDateFilter('');
                                        setHistoryTransporterFilter('all');
                                    }}
                                    className="h-10 px-3 text-red-500 hover:text-red-600 hover:bg-red-50"
                                >
                                    <X size={16} />
                                    Clear
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-lg border border-orange-200">
                                <Truck size={16} className="text-orange-500" />
                                <span className="text-sm text-slate-600">Total Freight:</span>
                                <span className="text-sm font-bold text-orange-600">
                                    ₹{totalFreightAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-20 text-slate-500">Loading...</div>
                    ) : filteredHistory.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                            <ArrowDown className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">No freight history found</p>
                            <p className="text-slate-400 text-sm mt-1">Stock In entries with transporters will appear here</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-md">
                                            <HeaderCell>Entry ID</HeaderCell>
                                            <HeaderCell>Transporter</HeaderCell>
                                            <HeaderCell>Date</HeaderCell>
                                            <HeaderCell>LR Number</HeaderCell>
                                            <HeaderCell>From Location</HeaderCell>
                                            <HeaderCell>To (Godown)</HeaderCell>
                                            <HeaderCell>Products</HeaderCell>
                                            <HeaderCell align="right">Freight Amount</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentHistoryItems.map((entry) => {
                                            const transporter = transporters.find(t => t.transporter_id === entry.transporter_id);
                                            return (
                                                <tr key={entry.entry_id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm font-mono text-slate-700">{entry.entry_id}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                                                                <Truck size={12} className="text-slate-500" />
                                                            </div>
                                                            <span className="text-sm font-medium text-slate-900">
                                                                {transporter?.name || getTransporterName(entry.transporter_id)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-slate-600">{entry.date}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm font-mono text-slate-700">{entry.lr_number || '-'}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-slate-600">{getGodownName(entry.from_location)}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-sm text-slate-600">{getGodownName(entry.godown_id)}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <Package size={14} className="text-slate-400" />
                                                            <span className="text-sm text-slate-700">{getProductName(entry.product_id)}</span>
                                                            <span className="text-xs text-slate-400">(x{entry.quantity})</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-sm font-bold text-orange-600">
                                                            ₹{parseFloat(entry.freight_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Summary */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <span>{filteredHistory.length} entries</span>
                                    <span>|</span>
                                    <span>Page {historyPage} of {historyTotalPages || 1}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600 font-medium">Total:</span>
                                    <span className="text-lg font-bold text-orange-600">
                                        ₹{totalFreightAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <Pagination
                                currentPage={historyPage}
                                totalPages={historyTotalPages}
                                totalItems={filteredHistory.length}
                                startIndex={(historyPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(historyPage * ITEMS_PER_PAGE, filteredHistory.length)}
                                onPageChange={setHistoryPage}
                                className="border-t border-slate-100"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingTransporter ? 'Edit Transporter' : 'Add New Transporter'}
                            </h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <FormField
                                    label="Transporter Name" name="name" value={formData.name}
                                    onChange={handleInputChange} required error={errors.name}
                                    icon={Truck} placeholder="Enter transporter name"
                                />

                                <FormField
                                    label="Vehicle Number" name="vehicle_number" value={formData.vehicle_number}
                                    onChange={handleInputChange} required error={errors.vehicle_number}
                                    icon={Truck} placeholder="e.g., MH12AB1234"
                                />

                                <FormField
                                    label="Driver Phone No." name="driver_phone" value={formData.driver_phone}
                                    onChange={handleInputChange} required error={errors.driver_phone}
                                    icon={Phone} placeholder="10 digit phone number"
                                    type="tel"
                                />

                                <div className="mt-2">
                                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" name="is_active" checked={formData.is_active} onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </div>
                                        <div>
                                            <span className="block text-sm font-medium text-slate-900">Active Transporter</span>
                                            <span className="block text-xs text-slate-500">Available for stock operations</span>
                                        </div>
                                    </label>
                                </div>
                            </form>
                        </div>

                        <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                            <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                {editingTransporter ? 'Save Changes' : 'Create Transporter'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transporters;

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
    <th className={cn(`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider`, align === 'right' ? 'text-right' : 'text-left')}>
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

const TransporterRow = ({ transporter, onEdit, onDelete }) => (
    <tr className="hover:bg-slate-50/80 transition-colors group">
        <td className="px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <Truck size={18} />
                </div>
                <div>
                    <div className="font-medium text-slate-900 text-sm">{transporter.name}</div>
                    <div className="text-xs text-slate-500">{new Date(transporter.created_at).toLocaleDateString()}</div>
                </div>
            </div>
        </td>
        <td className="px-4 py-3">
            <div className="text-sm text-slate-900 font-mono">{transporter.vehicle_number}</div>
        </td>
        <td className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-900">
                <Phone size={14} className="text-slate-400" />
                {transporter.driver_phone}
            </div>
        </td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${transporter.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${transporter.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {transporter.is_active ? 'Active' : 'Inactive'}
            </span>
        </td>
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

const MobileTransporterCard = ({ transporter, onEdit, onDelete }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                <Truck size={18} />
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{transporter.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 font-mono">{transporter.vehicle_number}</span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500">{transporter.driver_phone}</span>
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
    <div className={cn(`flex flex-col sm:flex-row items-center justify-between p-4 gap-4`, className)}>
        <p className="text-sm text-slate-500">
            Showing <span className="font-medium text-slate-900">{startIndex}</span> to <span className="font-medium text-slate-900">{endIndex}</span> of <span className="font-medium text-slate-900">{totalItems}</span> results
        </p>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="h-9 w-9 border-slate-200">
                <span className="text-slate-600">‹</span>
            </Button>
            <span className="text-sm font-medium">{currentPage} / {totalPages || 1}</span>
            <Button variant="outline" size="icon" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages} className="h-9 w-9 border-slate-200">
                <span className="text-slate-600">›</span>
            </Button>
        </div>
    </div>
);
