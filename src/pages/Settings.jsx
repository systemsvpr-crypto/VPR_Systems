import React, { useState, useEffect, useMemo } from 'react';
import {
    Search,
    Plus,
    Edit2,
    X,
    Shield,
    Mail,
    Phone,
    User,
    Camera,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';



import { USER_ROLES, GENDERS, PAGES, DEFAULT_USER_PAGES } from '../constants';

const ITEMS_PER_PAGE = 6;

const DEFAULT_FORM_DATA = {
    user_id: '',
    full_name: '',
    email: '',
    password: '',
    role: '',
    designation: '',
    page_access: DEFAULT_USER_PAGES,
    phone_number: '',
    date_of_birth: '',
    gender: '',
    current_address: '',
    username: '',
    is_active: true,
    profile_picture: ''
};

const Settings = () => {
    const { user: currentUser } = useAuthStore();

    // State Management
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [uploading, setUploading] = useState(false);

    // Pagination & Filter
    const [currentPage, setCurrentPage] = useState(1);

    // Form & Errors
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [activeTab, setActiveTab] = useState('Manage Users');

    // Fetch Users on Mount
    useEffect(() => {
        fetchUsers();
    }, []);

    // Reset pagination when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);



    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
            toast.error('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };



    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingUser(null);
        setErrors({});
    };



    const handleOpenModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                ...DEFAULT_FORM_DATA, // ensure structure
                ...user,
                password: user.password || '',
                role: user.role || '',
                page_access: user.page_access || DEFAULT_USER_PAGES,
                profile_picture: user.profile_picture || '',
                // Ensure nulls are empty strings for inputs
                designation: user.designation || '',
                phone_number: user.phone_number || '',
                date_of_birth: user.date_of_birth || '',
                gender: user.gender || '',
                current_address: user.current_address || '',
                username: user.username || ''
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

    const validateField = (name, value) => {
        if (name === 'phone_number') {
            return value.replace(/[^0-9]/g, '').slice(0, 10);
        }

        return value;
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;

        // Clear specific error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }

        let newValue = type === 'checkbox' ? checked : value;

        // Specific validations/transformations
        if (name === 'phone_number') {
            newValue = validateField(name, value);
        }

        setFormData(prev => {
            const newState = { ...prev, [name]: newValue };

            // Auto-set admin pages
            if (name === 'role' && (newValue === 'admin' || newValue === 'Admin')) {
                newState.page_access = PAGES.map(p => p.id);
            }
            return newState;
        });



        // Real-time duplicate check for username
        if (name === 'username') {
            const duplicate = users.find(u => u.username === newValue);
            const isConflict = duplicate && (!editingUser || duplicate.user_id !== editingUser.user_id);
            setErrors(prev => ({
                ...prev,
                username: isConflict ? 'This username is already taken' : ''
            }));
        }
    };

    const scrollToField = (fieldName) => {
        requestAnimationFrame(() => {
            const element = document.getElementsByName(fieldName)[0];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.focus();
            }
        });
    };

    const handlePageAccessToggle = (pageId) => {
        setFormData(prev => {
            const currentAccess = prev.page_access || [];
            if (currentAccess.includes(pageId)) {
                return { ...prev, page_access: currentAccess.filter(id => id !== pageId) };
            }
            return { ...prev, page_access: [...currentAccess, pageId] };
        });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `profile-pictures/${Math.random()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('images')
                .getPublicUrl(fileName);

            setFormData(prev => ({ ...prev, profile_picture: data.publicUrl }));
            toast.success('Image uploaded successfully');
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error('Error uploading image: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const validateForm = (data) => {
        const newErrors = {};

        // For new users, it will be generated by the database as a UUID


        if (!data.username) newErrors.username = 'Username is required';
        else if (/\s/.test(data.username)) newErrors.username = 'Username cannot contain spaces';

        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) newErrors.email = 'Invalid email address';

        if (!data.full_name) newErrors.full_name = 'Full Name is required';

        if (!data.role) newErrors.role = 'Role is required';

        // Password required only for new users
        if (!editingUser && !data.password) newErrors.password = 'Password is required';

        if (data.phone_number && data.phone_number.length !== 10) {
            newErrors.phone_number = 'Phone number must be exactly 10 digits';
        }

        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanedData = {
            ...formData,
            username: formData.username?.trim(),
            email: formData.email?.trim(),
            full_name: formData.full_name?.trim()
        };

        const formErrors = validateForm(cleanedData);
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            scrollToField(Object.keys(formErrors)[0]);
            toast.error('Please Fill the required fields');
            return;
        }

        // Local duplicate check for manual fields if any


        try {
            // DB Duplicate Checks
            const checks = [
                supabase.from('users').select('user_id').eq('username', cleanedData.username)
            ];

            const [usernameCheck] = await Promise.all(checks);

            if (usernameCheck.error) throw usernameCheck.error;

            const conflictErrors = {};
            const existingNameUser = usernameCheck.data?.[0];
            if (existingNameUser && (!editingUser || existingNameUser.user_id !== editingUser.user_id)) {
                conflictErrors.username = 'This Username is already taken';
            }

            if (Object.keys(conflictErrors).length > 0) {
                setErrors(prev => ({ ...prev, ...conflictErrors }));
                scrollToField('username');
                toast.error('Duplicate entry found');
                return;
            }

            // Prepare payload
            const userData = { ...cleanedData };
            delete userData.user_id; // user_id is PK and should not be in the update/insert payload
            if (!userData.date_of_birth) userData.date_of_birth = null;
            if (editingUser && !userData.password) delete userData.password;

            if (editingUser) {

                const { error } = await supabase
                    .from('users')
                    .update(userData)
                    .eq('user_id', editingUser.user_id);

                if (error) throw error;
                toast.success('User updated successfully');

                // Update local session if needed
                if (currentUser && currentUser.user_id === editingUser.user_id) {
                    const updatedUserCompat = {
                        ...currentUser,
                        ...userData,
                        Name: userData.full_name,
                        Admin: (userData.role?.toLowerCase() === 'admin') ? 'Yes' : 'No'
                    };
                    useAuthStore.getState().login(updatedUserCompat);
                    localStorage.setItem('user', JSON.stringify(updatedUserCompat));
                }
            } else {
                const { error } = await supabase.from('users').insert([userData]);
                if (error) throw error;
                toast.success('User created successfully');
            }

            handleCloseModal();
            fetchUsers();

        } catch (error) {
            console.error('Error saving user:', error);
            if (error.message?.includes('invalid input syntax for type date')) {
                setErrors(prev => ({ ...prev, date_of_birth: 'Invalid date format' }));
                toast.error('Please check the date fields');
            } else {
                toast.error(`Error: ${error.message}`);
            }
        }
    };

    // Filter Logic
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = (
                user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.designation?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            return matchesSearch;
        });
    }, [users, searchTerm]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredUsers, currentPage]);

    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) setCurrentPage(page);
    };

    return (
        <div className="flex flex-col gap-4 pb-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage system users, teams, and access permissions.</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                <button
                    onClick={() => setActiveTab('Manage Users')}
                    className={`pb-3 text-sm font-medium transition-all ${activeTab === 'Manage Users' ? 'text-primary border-b-2 border-primary translate-y-[1px]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Manage Users
                </button>
            </div>

            {activeTab === 'Manage Users' && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 mb-2">
                        {/* Search Bar */}
                        <div className="relative w-full md:w-72 order-2 md:order-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                            <Input
                                type="text"
                                placeholder="Search users..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 order-1 md:order-2">
                            <div className="hidden xl:flex items-center gap-6">
                                <StatItem label="Total Users" value={users.length} />
                                <div className="w-px h-8 bg-slate-200"></div>
                                <StatItem
                                    label="Admins"
                                    value={users.filter(u => u.role?.toLowerCase() === 'admin').length}
                                />
                            </div>

                            {!loading && (
                                <Button
                                    onClick={() => handleOpenModal()}
                                    className="gap-2 px-4 shadow-sm font-medium"
                                >
                                    <Plus size={20} />
                                    <span>Add User</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Mobile View (Cards) */}
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-slate-500">Loading users...</div>
                        ) : currentItems.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">No users found matching your search.</div>
                        ) : (
                            currentItems.map((user) => (
                                <MobileUserCard
                                    key={user.user_id}
                                    user={user}
                                    onEdit={() => handleOpenModal(user)}
                                />
                            ))
                        )}
                    </div>

                    {/* Desktop View (Table) */}
                    <div className="hidden md:flex bg-white rounded-2xl shadow-sm border border-slate-200/60 flex-col">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-md">
                                        <HeaderCell>User Details</HeaderCell>
                                        <HeaderCell>Role & Designation</HeaderCell>
                                        <HeaderCell>Status</HeaderCell>
                                        <HeaderCell align="right">Actions</HeaderCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <EmptyRow message="Loading users..." />
                                    ) : currentItems.length === 0 ? (
                                        <EmptyRow message="No users found matching your search." />
                                    ) : (
                                        currentItems.map((user) => (
                                            <UserRow
                                                key={user.user_id}
                                                user={user}
                                                onEdit={() => handleOpenModal(user)}
                                            />
                                        ))
                                    )}
                                    {/* Spacer rows */}
                                    {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`}><td colSpan="4" className="h-16"></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Desktop Pagination - Integrated in Card */}
                        {!loading && filteredUsers.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredUsers.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
                                onPageChange={handlePageChange}
                                className="border-t border-slate-100"
                            />
                        )}
                    </div>

                    {/* Pagination */}
                    {/* Mobile Pagination */}
                    {!loading && filteredUsers.length > 0 && (
                        <div className="md:hidden shrink-0 mt-auto">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredUsers.length}
                                startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                                endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}
                                onPageChange={handlePageChange}
                                className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
                            />
                        </div>
                    )}

                    {/* Modal */}
                    {isModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                            <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                                    <h2 className="text-xl font-bold text-slate-800">
                                        {editingUser ? 'Edit User' : 'Add New User'}
                                    </h2>
                                    <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                        <X size={20} />
                                    </Button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                                        {/* Profile Picture */}
                                        <div className="col-span-1 md:col-span-2 flex flex-col items-center mb-4">
                                            <div className="relative group">
                                                <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-100 flex items-center justify-center shadow-sm">
                                                    {formData.profile_picture ? (
                                                        <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User size={40} className="text-slate-400" />
                                                    )}
                                                </div>
                                                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-md transform translate-x-1/4 translate-y-1/4">
                                                    {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Camera size={16} />}
                                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                                                </label>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">Allowed *.jpeg, *.jpg, *.png, *.gif</p>
                                        </div>

                                        {/* Form Fields */}
                                        <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2 mt-2">
                                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Account Information</h3>
                                        </div>

                                        <FormField
                                            label="Username" name="username" value={formData.username}
                                            onChange={handleInputChange} required error={errors.username}
                                            icon={User} placeholder="jdoe"
                                            className="italic"
                                        />
                                        <FormField
                                            label="Email" name="email" type="email" value={formData.email}
                                            onChange={handleInputChange} error={errors.email}
                                            icon={Mail} placeholder="john@example.com"
                                        />
                                        <FormField
                                            label="Password" name="password" type="text" value={formData.password}
                                            onChange={handleInputChange} required={!editingUser} error={errors.password}
                                            icon={Shield} placeholder={editingUser ? "Leave empty to keep current" : "Enter password"}
                                        />

                                        <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2 mt-2">
                                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Personal Details</h3>
                                        </div>

                                        <FormField
                                            label="Full Name" name="full_name" value={formData.full_name}
                                            onChange={handleInputChange} required error={errors.full_name}
                                            icon={User} placeholder="John Doe"
                                        />
                                        <FormField
                                            label="Phone Number" name="phone_number" value={formData.phone_number}
                                            onChange={handleInputChange} error={errors.phone_number}
                                            icon={Phone} placeholder="10 digit number"
                                        />

                                        <SelectField
                                            label="Gender" name="gender" value={formData.gender}
                                            onChange={handleInputChange} options={GENDERS}
                                        />
                                        <DateField
                                            label="Date of Birth" name="date_of_birth" value={formData.date_of_birth}
                                            onChange={handleInputChange} error={errors.date_of_birth}
                                        />

                                        <div className="col-span-1 md:col-span-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Current Address</label>
                                            <textarea
                                                name="current_address" value={formData.current_address} onChange={handleInputChange}
                                                rows="2" className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                placeholder="Enter address"
                                            ></textarea>
                                        </div>


                                        <div className="col-span-1 md:col-span-2 border-b pb-2 mb-2 mt-2">
                                            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Role & Permissions</h3>
                                        </div>

                                        <SelectField
                                            label="Role" name="role" value={formData.role}
                                            onChange={handleInputChange} options={USER_ROLES}
                                            required
                                        />
                                        <FormField
                                            label="Designation" name="designation" value={formData.designation}
                                            onChange={handleInputChange} icon={Shield} placeholder="Eg: Accountant"
                                        />

                                        <div className="col-span-1 md:col-span-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <label className="block text-sm font-medium text-slate-700">Page Access</label>
                                                <div className="flex gap-2 text-xs">
                                                    <Button variant="link" size="sm" type="button" onClick={() => setFormData(prev => ({ ...prev, page_access: PAGES.map(p => p.id) }))} className="text-primary h-auto p-0">Select All</Button>
                                                    <span className="text-slate-300">|</span>
                                                    <Button variant="link" size="sm" type="button" onClick={() => setFormData(prev => ({ ...prev, page_access: [] }))} className="text-slate-500 h-auto p-0">None</Button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                {PAGES.map(page => (
                                                    <label key={page.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.page_access?.includes(page.id) || false}
                                                            onChange={() => handlePageAccessToggle(page.id)}
                                                            className="rounded text-primary focus:ring-primary"
                                                        />
                                                        <span className="text-sm text-slate-700">{page.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="col-span-1 md:col-span-2 mt-2">
                                            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
                                                <div className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} className="sr-only peer" />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                </div>
                                                <div>
                                                    <span className="block text-sm font-medium text-slate-900">Active Account</span>
                                                    <span className="block text-xs text-slate-500">Allow this user to log in</span>
                                                </div>
                                            </label>
                                        </div>
                                    </form>
                                </div>

                                <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                                    <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                                    <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                        {editingUser ? 'Save Changes' : 'Create User'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}






        </div>
    );
};

export default Settings;

// ----------------------------------------------------------------------
// Sub-components (Internal)
// ----------------------------------------------------------------------

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

const SelectField = ({ label, options, name, value, onChange, placeholder, required, ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</label>
        <Select name={name} value={value} onValueChange={(val) => onChange({ target: { name, value: val } })} {...props}>
            <SelectTrigger className="w-full h-10">
                <SelectValue placeholder={placeholder || `Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectLabel>{label}</SelectLabel>
                    {options.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    </div>
);

const HeaderCell = ({ children, align = "left" }) => (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-${align}`}>
        {children}
    </th>
);

const EmptyRow = ({ message }) => (
    <tr>
        <td colSpan="4" className="px-4 py-8 text-center text-slate-500 text-sm">
            {message}
        </td>
    </tr>
);

const UserRow = ({ user, onEdit }) => (
    <tr className="hover:bg-slate-50/80 transition-colors group">
        <td className="px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs border border-slate-200 overflow-hidden shrink-0">
                    {user.profile_picture ? (
                        <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                        user.full_name?.charAt(0).toUpperCase()
                    )}
                </div>
                <div>
                    <div className="font-medium text-slate-900 text-sm">{user.full_name}</div>
                </div>
            </div>
        </td>
        <td className="px-4 py-3">
            <div className="flex flex-col">
                <span className="text-sm text-slate-900">{user.role || '-'}</span>
                <span className="text-xs text-slate-500">{user.designation || '-'}</span>
            </div>
        </td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {user.is_active ? 'Active' : 'Inactive'}
            </span>
        </td>
        <td className="px-4 py-3 text-right">
            <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={onEdit}
                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all opacity-0 group-hover:opacity-100"
                title="Edit User"
            >
                <Edit2 size={16} />
            </Button>
        </td>
    </tr>
);

const MobileUserCard = ({ user, onEdit }) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm border border-slate-200 overflow-hidden shrink-0">
                {user.profile_picture ? (
                    <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                    user.full_name?.charAt(0).toUpperCase()
                )}
            </div>
            <div>
                <h3 className="font-semibold text-slate-900 text-sm">{user.full_name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-sidebar-foreground/60">{user.role}</span>
                </div>
            </div>
        </div>
        <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onEdit}
            className="text-slate-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors"
        >
            <Edit2 size={18} />
        </Button>
    </div>
);

const DateField = ({ label, name, value, onChange, required, ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</label>
        <DatePicker
            name={name}
            value={value}
            onChange={onChange}
            {...props}
        />
        {props.error && <p className="text-red-500 text-xs mt-1">{props.error}</p>}
    </div>
);

const Pagination = ({ currentPage, totalPages, totalItems, startIndex, endIndex, onPageChange, className }) => (
    <div className={`flex flex-col sm:flex-row items-center justify-between p-4 gap-4 ${className}`}>
        <p className="text-sm text-slate-500">
            Showing <span className="font-medium text-slate-900">{startIndex}</span> to <span className="font-medium text-slate-900">{endIndex}</span> of <span className="font-medium text-slate-900">{totalItems}</span> results
        </p>
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-9 w-9 border-slate-200"
            >
                <ChevronLeft size={16} className="text-slate-600" />
            </Button>
            <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;

                    return (
                        <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "ghost"}
                            size="icon"
                            onClick={() => onPageChange(pageNum)}
                            className={`w-9 h-9 text-sm font-medium ${currentPage === pageNum ? 'shadow-sm' : 'text-slate-600'}`}
                        >
                            {pageNum}
                        </Button>
                    );
                })}
            </div>
            <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-9 w-9 border-slate-200"
            >
                <ChevronRight size={16} className="text-slate-600" />
            </Button>
        </div>
    </div>
);
