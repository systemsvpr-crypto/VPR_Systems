import React, { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, MapPin, Truck, Shield, Package, Users, Building2 } from 'lucide-react';
import Products from './Products';
import Godowns from './Godowns';
import Transporters from './Transporters';
import Customers from './Customers';
import Vendors from './Vendors';
import MasterProduct from './MasterProduct';
import useAuthStore from '../store/authStore';
import { cn } from '@/lib/utils';

const Master = () => {
    const { user } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || '';

    // Filter tabs based on user access
    const allowedTabs = useMemo(() => {
        const tabs = [];
        const pageAccess = user?.page_access || [];
        const roleUpper = (user?.role || '').toUpperCase();
        const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN';

        if (isSuperAdmin || pageAccess.includes('products')) {
            tabs.push({ id: 'products', label: 'Products', icon: LayoutGrid });
        }
        if (isSuperAdmin || pageAccess.includes('product-type')) {
            tabs.push({ id: 'product-type', label: 'Master Product', icon: Package });
        }
        if (isSuperAdmin || pageAccess.includes('godowns')) {
            tabs.push({ id: 'godowns', label: 'Godowns', icon: MapPin });
        }
        if (isSuperAdmin || pageAccess.includes('transporters')) {
            tabs.push({ id: 'transporters', label: 'Transporters', icon: Truck });
        }
        if (isSuperAdmin || pageAccess.includes('customers')) {
            tabs.push({ id: 'customers', label: 'Customers', icon: Users });
        }
        if (isSuperAdmin || pageAccess.includes('vendors')) {
            tabs.push({ id: 'vendors', label: 'Purchase Vendor', icon: Building2 });
        }
        return tabs;
    }, [user]);

    // Set initial active tab if default is not allowed
    useEffect(() => {
        if (allowedTabs.length > 0 && (!activeTab || !allowedTabs.find(t => t.id === activeTab))) {
            setSearchParams({ tab: allowedTabs[0].id }, { replace: true });
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
        <div className="flex flex-col gap-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                        Master <span className="text-primary">Configuration</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Manage your organization's core data assets and resources.</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl border border-slate-200/60 w-fit">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-200">
                        <Shield size={14} className="text-primary" />
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{user?.role || 'User'} Access</span>
                    </div>
                </div>
            </div>

            {/* Premium Tabs */}
            <div className="relative group">
                <div className="flex items-center gap-1 bg-slate-100/40 p-1.5 rounded-2xl border border-slate-200/50 overflow-x-auto no-scrollbar backdrop-blur-sm">
                    {allowedTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSearchParams({ tab: tab.id })}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 relative whitespace-nowrap",
                                activeTab === tab.id
                                    ? 'bg-white text-primary shadow-md shadow-slate-200/50 scale-[1.02]'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                            )}
                        >
                            <tab.icon size={16} className={cn("transition-transform duration-300", activeTab === tab.id ? "scale-110" : "opacity-70")} />
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-full animate-in zoom-in-50 duration-300" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {activeTab === 'products' && <Products />}
                {activeTab === 'product-type' && <MasterProduct />}
                {activeTab === 'godowns' && <Godowns />}
                {activeTab === 'transporters' && <Transporters />}
                {activeTab === 'customers' && <Customers />}
                {activeTab === 'vendors' && <Vendors />}
            </div>
        </div>
    );
};

export default Master;
