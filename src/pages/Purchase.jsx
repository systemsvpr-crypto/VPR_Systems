import React, { useState, lazy, Suspense } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  CheckSquare,
  Truck,
  FileText,
} from 'lucide-react';
import useAuthStore from '../store/authStore';

// Lazy load all purchase sub-pages
const PurDashboard        = lazy(() => import('./purchase/PurDashboard'));
const PurIndent           = lazy(() => import('./purchase/PurIndent'));
const PurVendorSelection  = lazy(() => import('./purchase/PurVendorSelection'));
const PurVendorApprove    = lazy(() => import('./purchase/PurVendorApprove'));
const PurDelivery         = lazy(() => import('./purchase/PurDelivery'));
const PurPcReport         = lazy(() => import('./purchase/PurPcReport'));

const TABS = [
  { id: 'pur-dashboard',         label: 'Dashboard',         icon: LayoutDashboard, component: PurDashboard,       accessKey: 'purchase-dashboard' },
  { id: 'pur-indent',            label: 'Indent',            icon: ClipboardList,   component: PurIndent,          accessKey: 'purchase-indent' },
  { id: 'pur-vendor-selection',  label: 'Vendor Selection',  icon: Users,           component: PurVendorSelection,  accessKey: 'purchase-vendor-selection' },
  { id: 'pur-vendor-approve',    label: 'Vendor Approval',   icon: CheckSquare,     component: PurVendorApprove,    accessKey: 'purchase-vendor-approve' },
  { id: 'pur-delivery',          label: 'Delivery',          icon: Truck,           component: PurDelivery,         accessKey: 'purchase-delivery' },
  { id: 'pur-pc-report',         label: 'PC Report',         icon: FileText,        component: PurPcReport,         accessKey: 'purchase-pc-report' },
];

const TabSkeleton = () => (
  <div className="p-6 space-y-5 animate-pulse">
    <div className="h-8 w-56 bg-gray-100 rounded-lg" />
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
    <div className="h-64 bg-gray-100 rounded-xl" />
  </div>
);

const Purchase = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPER ADMIN' || user?.Admin === 'Yes';

  const allowedTabs = TABS.filter(t =>
    isAdmin ||
    (user?.page_access || []).includes(t.accessKey) ||
    (user?.page_access || []).includes('purchase-dashboard')
  );

  const [activeTab, setActiveTab] = useState(allowedTabs[0]?.id || 'pur-dashboard');
  const ActiveComponent = allowedTabs.find(t => t.id === activeTab)?.component ?? (allowedTabs[0]?.component || PurDashboard);

  return (
    <div className="flex flex-col min-h-screen -m-4 sm:-m-6 lg:-m-8 bg-[#F5F5F5]">

      {/* ── Module Header ── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 pt-5 pb-0 shadow-sm">
        <div className="mb-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Module</p>
          <h1 className="text-xl font-extrabold tracking-tight leading-none mt-0.5">
            <span className="text-orange-600">Purchase</span>
            <span className="text-gray-400 mx-1.5">/</span>
            <span className="text-gray-700">Procurement</span>
          </h1>
        </div>

        {/* ── Horizontal Tab Bar ── */}
        <div className="flex items-end overflow-x-auto scrollbar-hide gap-0 -mb-px">
          {allowedTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group relative flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap
                  border-b-2 transition-all duration-200 flex-shrink-0 outline-none
                  ${isActive
                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                <tab.icon
                  size={15}
                  className={`flex-shrink-0 transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400 group-hover:text-gray-600'}`}
                />
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 p-4 sm:p-6">
        <Suspense fallback={<TabSkeleton />}>
          <ActiveComponent />
        </Suspense>
      </div>
    </div>
  );
};

export default Purchase;
