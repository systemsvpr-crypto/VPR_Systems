import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UserPlus, Shield, X, Trash2, Pencil, RefreshCw, Loader, Save, Eye, EyeOff, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../supabase';
import Pagination from '@/components/ui/Pagination';

const ITEMS_PER_PAGE = 10;

// --- Skeleton Components ---
const TableSkeleton = () => (
  <>
    {[...Array(5)].map((_, i) => (
      <tr key={i} className="border-b border-gray-100">
        {[...Array(4)].map((_, j) => (
          <td key={j} className="px-6 py-5">
            <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            {j === 0 && (
              <div className="h-3 w-12 bg-gray-50 rounded-lg mt-2 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            )}
          </td>
        ))}
      </tr>
    ))}
  </>
);

const MobileSkeleton = () => (
  <div className="md:hidden mt-4 space-y-3">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-white p-4 rounded shadow-sm border border-gray-100 space-y-3">
        <div className="flex justify-between items-start">
          <div className="space-y-2 w-1/2">
            <div className="h-4 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-3 w-14 bg-gray-50 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-8 w-8 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {[...Array(3)].map((_, j) => (
            <div key={j} className="h-5 w-16 bg-gray-50 rounded relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const OtdSettings = () => {
    const [users, setUsers] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', id: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const allPages = [
        "Dashboard",
        "Order",
        "Dispatch Planning",
        "Inform to Party Before Dispatch",
        "Dispatch Completed",
        "Inform to Party After Dispatch",
        "Godown",
        "PC Report",
        "Skip Delivered",
        "Settings"
    ];

    // Fetch Users
    const fetchAllUsers = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('*');

            if (error) throw error;

            if (data) {
                const mapped = data.map((item) => ({
                    originalIndex: item.serial_number,
                    name: item.user_name || '-',
                    id: item.user_id || '-',
                    password: item.password || '-',
                    role: item.role || 'user',
                    pageAccess: item.page_access || []
                }));
                setUsers(mapped);
            }
        } catch (error) {
            console.error('fetchAllUsers error:', error);
            toast.error('Failed to load users: ' + error.message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Auto-fetch on mount
    useEffect(() => {
        fetchAllUsers();
    }, [fetchAllUsers]);

    useEffect(() => { setCurrentPage(1); }, [userSearchTerm]);

    const filteredUsers = useMemo(() => {
        return users.filter(user =>
            Object.values(user).some(val =>
                String(val).toLowerCase().includes(userSearchTerm.toLowerCase().trim())
            )
        );
    }, [users, userSearchTerm]);

    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentItems = filteredUsers.slice(startIndex, endIndex);
    const paginationStart = filteredUsers.length === 0 ? 0 : startIndex + 1;
    const paginationEnd = Math.min(endIndex, filteredUsers.length);

    const handleAddUser = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const payload = {
                user_name: newUser.name,
                user_id: newUser.id,
                password: newUser.password,
                role: newUser.role,
                page_access: newUser.pageAccess
            };

            let error;
            if (editingUser !== null) {
                const { error: updateError } = await supabase
                    .from('app_users')
                    .update(payload)
                    .eq('user_id', editingUser);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('app_users')
                    .insert([payload]);
                error = insertError;
            }

            if (error) throw error;

            toast.success(editingUser ? "User updated successfully" : "User added successfully");
            await fetchAllUsers(true);
            setIsModalOpen(false);
            setEditingUser(null);
            setShowPassword(false);
            setNewUser({ id: '', name: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
        } catch (error) {
            console.error('Error saving user:', error);
            toast.error("Failed to save user: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user.id);
        setNewUser({ ...user });
        setIsModalOpen(true);
    };

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Are you sure you want to delete user ${user.name}?`)) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('app_users')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;

            toast.success("User removed");
            await fetchAllUsers(true);
        } catch (error) {
            console.error('Error deleting user:', error);
            toast.error("Failed to delete: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleAccess = (page) => {
        const current = [...newUser.pageAccess];
        if (current.includes(page)) {
            setNewUser({ ...newUser, pageAccess: current.filter(p => p !== page) });
        } else {
            setNewUser({ ...newUser, pageAccess: [...current, page] });
        }
    };

    const handleToggleAll = (select) => {
        setNewUser({ ...newUser, pageAccess: select ? [...allPages] : [] });
    };

    return (
        <div className="">
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-4 rounded shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded text-primary"><Shield size={20} /></div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">User Settings</h1>
                        <p className="text-gray-500 text-xs">Manage authentication & permissions</p>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchAllUsers(true)}
                        disabled={isRefreshing}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-xs font-bold border border-gray-200 disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                            className="w-40 lg:w-56 h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
                        />
                    </div>
                    <button
                        onClick={() => {
                            setEditingUser(null);
                            setNewUser({ id: '', name: '', password: '', role: 'user', pageAccess: ['Dashboard'] });
                            setShowPassword(false);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover transition-all font-bold text-sm shadow-md active:scale-95"
                    >
                        <UserPlus size={16} />
                        Add User
                    </button>
                </div>
            </div>

            <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0 z-10 shadow-sm">
                                <th className="px-6 py-4">User Info</th>
                                <th className="px-6 py-4">Credentials</th>
                                <th className="px-6 py-4">Page Access</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {isLoading ? (
                                <TableSkeleton />
                            ) : currentItems.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-gray-400 italic font-bold text-sm">No users found. Try searching or refresh data.</td>
                                </tr>
                            ) : null}
                            {!isLoading && currentItems.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{u.name}</div>
                                        <div className="text-[10px] text-primary font-bold uppercase tracking-wider bg-green-50 px-1.5 py-0.5 rounded inline-block mt-1">{u.role}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs font-mono text-gray-500">ID: <span className="text-gray-900 font-bold">{u.id}</span></div>
                                            <div className="text-xs font-mono text-gray-500">PW: <span className="text-gray-400">••••••••</span></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {u.pageAccess.map(p => (
                                                <span key={p} className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded text-[10px] font-medium">
                                                    {p}
                                                </span>
                                            ))}
                                            {u.pageAccess.length === 0 && <span className="text-gray-400 italic text-[10px]">No access</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleEditUser(u)}
                                                className="p-2 text-gray-400 hover:text-primary hover:bg-green-50 rounded transition-all"
                                                title="Edit User"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                                title="Delete User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                <tr key={`empty-${i}`}><td colSpan="4" className="h-16"></td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!isLoading && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredUsers.length}
                        startIndex={paginationStart}
                        endIndex={paginationEnd}
                        onPageChange={setCurrentPage}
                        className="border-t border-gray-200"
                    />
                )}
            </div>

            {/* Mobile View */}
            {isLoading ? <MobileSkeleton /> : (
              <div className="md:hidden mt-4 space-y-3">
                {filteredUsers.map(u => (
                    <div key={u.id} className="bg-white p-4 rounded shadow-sm border border-gray-100 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-gray-900">{u.name}</h4>
                                <span className="text-[9px] font-bold text-primary uppercase bg-green-50 px-1.5 py-0.5 rounded">{u.role}</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEditUser(u)} className="p-2 text-primary bg-green-50 rounded"><Pencil size={16} /></button>
                                <button onClick={() => handleDeleteUser(u)} className="p-2 text-red-600 bg-red-50 rounded"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded text-xs font-mono space-y-1">
                            <div>ID: {u.id}</div>
                            <div>PW: ••••••••</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {u.pageAccess.map(p => (
                                <span key={p} className="px-1.5 py-0.5 bg-white border border-gray-100 rounded text-[9px] text-gray-600">{p}</span>
                            ))}
                        </div>
                    </div>
                ))}
              </div>
            )}

            {/* Saving overlay */}
            {isSaving && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-md">
                    <div className="bg-white/80 p-10 rounded-3xl shadow-xl flex flex-col items-center gap-4 border border-white/50">
                        <Loader className="w-10 h-10 animate-spin text-primary" />
                        <p className="text-sm font-black text-gray-700 uppercase tracking-widest">Updating Profile...</p>
                    </div>
                </div>
            )}

            {/* Refresh progress bar */}
            {isRefreshing && (
                <div className="fixed top-0 left-0 right-0 h-1 z-[101] bg-gray-100 overflow-hidden">
                    <div className="h-full bg-primary animate-shimmer-fast" style={{ width: '40%' }}></div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-6 bg-primary text-white flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingUser ? 'Update User' : 'Add System User'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleAddUser} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto scrollbar-thin">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User Name</label>
                                    <input type="text" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded focus:ring-primary focus:border-primary outline-none text-sm" placeholder="User Name" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">User ID / Username</label>
                                    <input type="text" required value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded focus:ring-primary focus:border-primary outline-none text-sm font-mono" placeholder="User ID" disabled={editingUser !== null} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Account Password</label>
                                    <div className="relative group">
                                        <input 
                                            type={showPassword ? "text" : "password"} 
                                            required 
                                            value={newUser.password} 
                                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} 
                                            className="w-full pl-4 pr-10 py-2 border border-gray-200 rounded focus:ring-primary focus:border-primary outline-none text-sm font-mono" 
                                            placeholder="••••••••" 
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors focus:outline-none"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">System Role</label>
                                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded focus:ring-primary focus:border-primary outline-none text-sm">
                                        <option value="user">User</option>
                                        <option value="manager">Admin</option>

                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Module Permissions</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleAll(true)}
                                            className="text-[10px] font-bold text-primary hover:text-primary-hover bg-green-50 px-2 py-1 rounded transition-colors"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleAll(false)}
                                            className="text-[10px] font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-1 rounded transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded border border-gray-100">
                                    {allPages.map(page => (
                                        <label key={page} className={`flex items-center gap-2 text-[11px] p-2 border rounded cursor-pointer transition-all ${newUser.pageAccess.includes(page) ? 'bg-green-50 border-green-200 text-primary font-bold' : 'bg-white border-gray-200 text-gray-600'}`}>
                                            <input type="checkbox" checked={newUser.pageAccess.includes(page)} onChange={() => handleToggleAccess(page)} className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" />
                                            {page}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-600 font-bold text-sm hover:underline">Cancel</button>
                                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-8 py-2.5 bg-primary text-white rounded hover:bg-primary-hover shadow-lg font-bold text-sm active:scale-95 transition-all">
                                    {isSaving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                                    {isSaving ? 'Processing...' : (editingUser ? 'Update Profile' : 'Create Account')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OtdSettings;
