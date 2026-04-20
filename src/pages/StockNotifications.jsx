import React, { useState, useEffect, useMemo } from 'react';
import { Search, Bell, Check, Trash2, Eye, Package, ArrowDown, ArrowUp, X } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

const StockNotifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [products, setProducts] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [viewNotification, setViewNotification] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [notifRes, productsRes, godownsRes] = await Promise.all([
                supabase.from('stock_notifications').select('*').order('created_at', { ascending: false }),
                supabase.from('products').select('*').order('name', { ascending: true }),
                supabase.from('godowns').select('*').order('name', { ascending: true })
            ]);
            if (notifRes.error) throw notifRes.error;
            setNotifications(notifRes.data || []);
            setProducts(productsRes.data || []);
            setGodowns(godownsRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch notifications');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (id) => {
        try {
            const { error } = await supabase
                .from('stock_notifications')
                .update({ is_read: true })
                .eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (error) {
            console.error('Error marking as read:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            const { error } = await supabase
                .from('stock_notifications')
                .update({ is_read: true })
                .eq('is_read', false);
            if (error) throw error;
            toast.success('All notifications marked as read');
            fetchData();
        } catch (error) {
            console.error('Error marking all as read:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this notification?')) return;
        try {
            const { error } = await supabase
                .from('stock_notifications')
                .delete()
                .eq('id', id);
            if (error) throw error;
            toast.success('Notification deleted');
            fetchData();
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;
    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;

    const getTypeIcon = (type) => {
        switch (type) {
            case 'stock_in': return <ArrowDown size={16} className="text-green-500" />;
            case 'stock_out': return <ArrowUp size={16} className="text-red-500" />;
            case 'low_stock': return <Package size={16} className="text-orange-500" />;
            default: return <Bell size={16} className="text-slate-500" />;
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'stock_in': return 'Stock In';
            case 'stock_out': return 'Stock Out';
            case 'low_stock': return 'Low Stock';
            default: return type;
        }
    };

    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => {
            const matchesSearch = n.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                n.message?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === 'all' || n.notification_type === filterType;
            return matchesSearch && matchesType;
        });
    }, [notifications, searchTerm, filterType]);

    const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredNotifications, currentPage]);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Stock Notifications</h1>
                <p className="text-slate-500 mt-1 text-sm">View transaction alerts and stock updates.</p>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
                    <div className="hidden xl:flex items-center gap-6">
                        <StatItem label="Unread" value={unreadCount} />
                        <div className="w-px h-8 bg-slate-200"></div>
                        <StatItem label="Total" value={notifications.length} />
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
                            <Input
                                type="text"
                                placeholder="Search notifications..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="w-[180px] h-10">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Notification Type</SelectLabel>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="stock_in">Stock In</SelectItem>
                                    <SelectItem value="stock_out">Stock Out</SelectItem>
                                    <SelectItem value="low_stock">Low Stock</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>

                        {!loading && unreadCount > 0 && (
                            <Button onClick={handleMarkAllAsRead} variant="outline" className="gap-2 px-4 shadow-sm font-medium bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
                                <Check size={16} />
                                <span>Mark All Read</span>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : currentItems.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">No notifications.</div>
                    ) : (
                        currentItems.map((n) => (
                            <MobileNotificationCard
                                key={n.id}
                                notification={n}
                                getTypeIcon={getTypeIcon}
                                getTypeLabel={getTypeLabel}
                                getProductName={getProductName}
                                getGodownName={getGodownName}
                                onMarkAsRead={() => handleMarkAsRead(n.id)}
                                onDelete={() => handleDelete(n.id)}
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
                                    <HeaderCell>Notification</HeaderCell>
                                    <HeaderCell>Type</HeaderCell>
                                    <HeaderCell>Related</HeaderCell>
                                    <HeaderCell>Date</HeaderCell>
                                    <HeaderCell>Status</HeaderCell>
                                    <HeaderCell align="right">Actions</HeaderCell>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <EmptyRow message="Loading..." />
                                ) : currentItems.length === 0 ? (
                                    <EmptyRow message="No notifications." />
                                ) : (
                                    currentItems.map((n) => (
                                        <NotificationRow
                                            key={n.id}
                                            notification={n}
                                            getTypeIcon={getTypeIcon}
                                            getTypeLabel={getTypeLabel}
                                            getProductName={getProductName}
                                            getGodownName={getGodownName}
                                            onMarkAsRead={() => handleMarkAsRead(n.id)}
                                            onDelete={() => handleDelete(n.id)}
                                        />
                                    ))
                                )}
                                {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`}><td colSpan="6" className="h-16"></td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filteredNotifications.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredNotifications.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)}
                            onPageChange={setCurrentPage}
                            className="border-t border-slate-100"
                        />
                    )}
                </div>

                {!loading && filteredNotifications.length > 0 && (
                    <div className="md:hidden shrink-0 mt-auto">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredNotifications.length}
                            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)}
                            onPageChange={setCurrentPage}
                            className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default StockNotifications;

const StatItem = ({ label, value }) => (
    <div>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
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

const NotificationRow = ({ notification, getTypeIcon, getTypeLabel, getProductName, getGodownName, onMarkAsRead, onDelete }) => (
    <tr className={`hover:bg-slate-50/80 transition-colors group ${!notification.is_read ? 'bg-blue-50/30' : ''}`}>
        <td className="px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    {getTypeIcon(notification.notification_type)}
                </div>
                <div>
                    <div className="font-medium text-sm text-slate-900">{notification.title}</div>
                    <div className="text-xs text-slate-500 line-clamp-1">{notification.message}</div>
                </div>
            </div>
        </td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                ${notification.notification_type === 'stock_in' ? 'bg-green-50 text-green-700' :
                  notification.notification_type === 'stock_out' ? 'bg-red-50 text-red-700' :
                  'bg-orange-50 text-orange-700'}`}>
                {getTypeLabel(notification.notification_type)}
            </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
            {notification.product_id && <div>{getProductName(notification.product_id)}</div>}
            {notification.godown_id && <div className="text-xs">{getGodownName(notification.godown_id)}</div>}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
            {new Date(notification.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                ${notification.is_read ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {!notification.is_read && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>}
                {notification.is_read ? 'Read' : 'Unread'}
            </span>
        </td>
        <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!notification.is_read && (
                    <Button variant="ghost" size="icon" type="button" onClick={onMarkAsRead} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-all" title="Mark as Read">
                        <Check size={16} />
                    </Button>
                )}
                <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="p-1.5 text-slate-400 hover:text-destructive hover:bg-destructive/5 rounded transition-all" title="Delete">
                    <Trash2 size={16} />
                </Button>
            </div>
        </td>
    </tr>
);

const MobileNotificationCard = ({ notification, getTypeIcon, getTypeLabel, getProductName, getGodownName, onMarkAsRead, onDelete }) => (
    <div className={`bg-white p-4 rounded-xl border shadow-sm flex items-start justify-between ${!notification.is_read ? 'border-blue-200 bg-blue-50/20' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                {getTypeIcon(notification.notification_type)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-sm truncate">{notification.title}</h3>
                    {!notification.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>}
                </div>
                <p className="text-xs text-slate-500 truncate">{notification.message}</p>
            </div>
        </div>
        <div className="flex items-center gap-1">
            {!notification.is_read && (
                <Button variant="ghost" size="icon" onClick={onMarkAsRead} className="text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors">
                    <Check size={18} />
                </Button>
            )}
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