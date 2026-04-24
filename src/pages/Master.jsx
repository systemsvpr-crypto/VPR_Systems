import React, { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, MapPin, Truck, Shield } from 'lucide-react';
import Products from './Products';
import Godowns from './Godowns';
import Transporters from './Transporters';
import Customers from './Customers';
import Vendors from './Vendors';
import useAuthStore from '../store/authStore';
import { cn } from '@/lib/utils';
import { Users, Building2 } from 'lucide-react';

const Master = () => {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('');

    // Filter tabs based on user access
    const allowedTabs = useMemo(() => {
        const tabs = [];
        const pageAccess = user?.page_access || [];
        const isAdmin = user?.role?.toLowerCase() === 'admin' || user?.Admin === 'Yes';

        if (isAdmin || pageAccess.includes('products')) {
            tabs.push({ id: 'products', label: 'Products', icon: LayoutGrid });
        }
        if (isAdmin || pageAccess.includes('godowns')) {
            tabs.push({ id: 'godowns', label: 'Godowns', icon: MapPin });
        }
        if (isAdmin || pageAccess.includes('transporters')) {
            tabs.push({ id: 'transporters', label: 'Transporters', icon: Truck });
        }
        if (isAdmin || pageAccess.includes('customers')) {
            tabs.push({ id: 'customers', label: 'Customers', icon: Users });
        }
        if (isAdmin || pageAccess.includes('vendors')) {
            tabs.push({ id: 'vendors', label: 'Purchase Vendor', icon: Building2 });
        }
        return tabs;
    }, [user]);

    // Set initial active tab if default is not allowed
    useEffect(() => {
        if (allowedTabs.length > 0 && (!activeTab || !allowedTabs.find(t => t.id === activeTab))) {
            setActiveTab(allowedTabs[0].id);
        }
    }, [allowedTabs, activeTab]);

    if (allowedTabs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Shield className="text-slate-300 w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500 mt-2 text-center max-w-xs">
                    You don't have permission to access any modules in this section.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 pb-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Master Configuration</h1>
                <p className="text-slate-500 mt-1 text-sm">Manage products, godowns, and transporters.</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 overflow-x-auto overflow-y-hidden custom-scrollbar">
                {allowedTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex-1 min-w-[120px] pb-3 text-xs sm:text-sm font-medium transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap relative",
                            activeTab === tab.id
                                ? 'text-primary'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary animate-in fade-in slide-in-from-bottom-1" />
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'products' && <Products />}
            {activeTab === 'godowns' && <Godowns />}
            {activeTab === 'transporters' && <Transporters />}
            {activeTab === 'customers' && <Customers />}
            {activeTab === 'vendors' && <Vendors />}
        </div>
    );
};

export default Master;
