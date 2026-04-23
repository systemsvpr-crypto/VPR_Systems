import React, { useState, lazy, Suspense } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  BellRing,
  CheckCircle,
  Mail,
  PackageX,
  Warehouse,
  FileText,
  Settings as SettingsIcon,
} from 'lucide-react';

// Lazy load all OTD sub-pages
const OtdDashboard    = lazy(() => import('./sell/OtdDashboard'));
const OtdOrder        = lazy(() => import('./sell/OtdOrder'));
const OtdDispatchPlan = lazy(() => import('./sell/OtdDispatchPlan'));
const OtdInformBefore = lazy(() => import('./sell/OtdInformBefore'));
const OtdDispatchDone = lazy(() => import('./sell/OtdDispatchDone'));
const OtdInformAfter  = lazy(() => import('./sell/OtdInformAfter'));
const OtdSkip         = lazy(() => import('./sell/OtdSkip'));
const OtdGodown       = lazy(() => import('./sell/OtdGodown'));
const OtdPcReport     = lazy(() => import('./sell/OtdPcReport'));

const TABS = [
  { id: 'dashboard',     label: 'Dashboard',              icon: LayoutDashboard, component: OtdDashboard,    accessKey: 'Dashboard' },
  { id: 'order',         label: 'Orders',                 icon: ClipboardList,   component: OtdOrder,        accessKey: 'Order' },
  { id: 'dispatch-plan', label: 'Dispatch Planning',      icon: Truck,           component: OtdDispatchPlan, accessKey: 'Dispatch Planning' },
  { id: 'inform-before', label: 'Inform Before Dispatch', icon: BellRing,        component: OtdInformBefore, accessKey: 'Inform to Party Before Dispatch' },
  { id: 'dispatch-done', label: 'Dispatch Completed',     icon: CheckCircle,     component: OtdDispatchDone, accessKey: 'Dispatch Completed' },
  { id: 'inform-after',  label: 'Inform After Dispatch',  icon: Mail,            component: OtdInformAfter,  accessKey: 'Inform to Party After Dispatch' },
  { id: 'skip',          label: 'Skip Delivered',         icon: PackageX,        component: OtdSkip,         accessKey: 'Skip Delivered' },
  { id: 'godown',        label: 'Godown',                 icon: Warehouse,       component: OtdGodown,       accessKey: 'Godown' },
  { id: 'pc-report',     label: 'PC Report',              icon: FileText,        component: OtdPcReport,     accessKey: 'PC Report' },
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

import useAuthStore from '../store/authStore';

const Sell = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPER ADMIN' || user?.Admin === 'Yes';
  
  const allowedTabs = TABS.filter(t => isAdmin || (user?.page_access || []).includes(t.accessKey) || (user?.page_access || []).includes('sell'));
  
  const [activeTab, setActiveTab] = useState(allowedTabs[0]?.id || 'dashboard');
  const ActiveComponent = allowedTabs.find(t => t.id === activeTab)?.component ?? (allowedTabs[0]?.component || OtdDashboard);

  return (
    <div className="flex flex-col min-h-screen -m-4 sm:-m-6 lg:-m-8 bg-[#F5F5F5]">

      {/* ── Module Header ── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 pt-5 pb-0 shadow-sm">
        <div className="mb-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Module</p>
          <h1 className="text-xl font-extrabold tracking-tight leading-none mt-0.5">
            <span className="text-blue-600">Sell</span>
            <span className="text-gray-400 mx-1.5">/</span>
            <span className="text-gray-700">Dispatch</span>
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
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                <tab.icon
                  size={15}
                  className={`flex-shrink-0 transition-colors ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`}
                />
                <span>{tab.label}</span>

                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
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

export default Sell;
