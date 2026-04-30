import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import logo from '../assets/logo1.png';
import {
  LogOut as LogOutIcon,
  X,
  User,
  Menu,
  ChevronDown,
  ChevronUp,
  Settings,
  ShoppingCart,
  Users,
  LayoutDashboard,
  Briefcase,
  FileText,
  UserPlus,
  DollarSign,
  MapPin,
  Package,
  ArrowRightLeft,
  Bell,
  TrendingUp,
  Truck,
  ShoppingBag,
  HardHat,
  BadgeDollarSign,
  Mail,
} from 'lucide-react';

const Sidebar = ({ onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user?.user_id) return;

    const channel = supabase
      .channel('user-permission-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `user_id=eq.${user.user_id}`,
        },
        (payload) => {
          const newData = payload.new;
          if (newData) {
            // Get latest state from store to avoid stale closure
            const currentUser = useAuthStore.getState().user;

            // Handle Postgres array string format from Realtime {item1,item2}
            let newPageAccess = newData.page_access;
            if (typeof newPageAccess === 'string') {
              // Convert "{a,b}" to ["a","b"]
              newPageAccess = newPageAccess.replace(/^\{|\}$/g, '').split(',');
              // Handle empty array case "{}" which split returns [""]
              if (newPageAccess.length === 1 && newPageAccess[0] === "") {
                newPageAccess = [];
              }
            }

            // Merge new data while maintaining compatibility fields
            const updatedUser = {
              ...currentUser,
              ...newData,
              page_access: newPageAccess || newData.page_access || currentUser.page_access,
              Name: newData.full_name || currentUser?.Name,
              Admin: (newData.role?.toUpperCase() === 'ADMIN' || newData.role?.toUpperCase() === 'SUPER ADMIN') ? 'Yes' : 'No',
            };

            // Sync with localStorage for components that don't use the store (e.g., ProtectedRoute)
            localStorage.setItem('user', JSON.stringify(updatedUser));

            // Update the store immediately
            useAuthStore.getState().login(updatedUser);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.user_id]);

  const handleLogout = () => {
    useAuthStore.getState().logout();
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  /* Combined Master Menu List for Permission Checking */
  const MENU_ITEMS = [
    { path: '/live-stock-dashboard', icon: LayoutDashboard, label: 'Live Stock Dashboard', id: 'live-stock-dashboard' },
    { path: '/stock-management', icon: TrendingUp, label: 'Stock', id: 'stock-management' },
    { path: '/sell', icon: BadgeDollarSign, label: 'Sales', id: 'sell' },
    { path: '/purchase', icon: ShoppingCart, label: 'Purchase', id: 'purchase-dashboard' },
    { type: 'separator', label: 'SETTINGS' },
    { path: '/master', icon: LayoutDashboard, label: 'Master Config', id: 'master' },
    { path: '/settings', icon: Settings, label: 'Settings', id: 'settings' },
    { path: '/whatsapp-history', icon: Mail, label: 'WhatsApp Logs', id: 'whatsapp-history' },
    { path: '/my-profile', icon: User, label: 'My Profile', id: 'my-profile' },
  ];

  // Helper: Check if user has access to a specific page ID
  const roleUpper = (user?.role || '').toUpperCase();
  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN';

  const hasAccess = (pageId) => {
    // SUPER ADMIN always has access
    if (isSuperAdmin) return true;

    // Core pages accessible to everyone logged in
    if (pageId === 'my-profile') return true;

    // For everything else, check explicit permission
    const allowedPages = Array.isArray(user?.page_access) ? user.page_access : [];
    return allowedPages.includes(pageId);
  };

  // Filter the menu items
  const baseMenuItems = MENU_ITEMS.reduce((acc, item) => {
    // Handle separators - always show them
    if (item.type === 'separator') {
      acc.push(item);
      return acc;
    }

    // Handle Dropdowns specially
    if (item.type === 'dropdown') {
      const accessibleChildren = item.items.filter(child => hasAccess(child.id));
      if (accessibleChildren.length > 0) {
        acc.push({ ...item, items: accessibleChildren });
      }
      return acc;
    }

    // Normal Item
    if (hasAccess(item.id)) {
      acc.push(item);
    } else if (item.id === 'stock-management') {
      // Show Stocks if user has access to stock-management
      if (hasAccess('stock-management')) {
        acc.push(item);
      }
    } else if (item.id === 'master') {
      // Show Master Config if user has access to any master tabs
      const MASTER_TABS = ['products', 'godowns', 'transporters', 'customers', 'vendors'];
      if (MASTER_TABS.some(tabId => hasAccess(tabId))) {
        acc.push(item);
      }
    } else if (item.id === 'sell') {
      // Show Sell if user has any related page access
      const SELL_TABS = ['Dashboard', 'Order', 'Dispatch Planning', 'Inform to Party Before Dispatch', 'Dispatch Completed', 'Inform to Party After Dispatch', 'Godown', 'PC Report', 'Skip Delivered', 'sell'];
      if (user?.page_access?.some(p => SELL_TABS.includes(p))) {
        acc.push(item);
      }
    } else if (item.id === 'purchase-dashboard') {
      const PURCHASE_TABS = [
        'purchase-dashboard',
        'purchase-indent',
        'purchase-vendor-selection',
        'purchase-vendor-approve',
        'purchase-delivery',
        'purchase-arrival',
        'purchase-cancelled',
        'purchase-pc-report'
      ];
      if (user?.page_access?.some(p => PURCHASE_TABS.includes(p))) {
        acc.push(item);
      }
    }
    return acc;
  }, []);

const menuItems = baseMenuItems;


return (
  <>
    {/* Mobile menu button */}
    <button
      className={`md:hidden fixed top-4 left-4 z-50 p-2 text-slate-500 hover:text-slate-700 transition-all duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      onClick={() => setIsOpen(true)}
    >
      <Menu className="w-6 h-6" />
    </button>

    {/* Tablet menu button */}
    <button
      className={`hidden md:block lg:hidden fixed top-4 left-4 z-50 p-2 text-slate-500 hover:text-slate-700 transition-all duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      onClick={() => setIsOpen(true)}
    >
      <Menu className="w-6 h-6" />
    </button>

    {/* Desktop Sidebar - Static Flow (Flex Item) */}
    <div className="hidden lg:flex h-screen sticky top-0 bg-white border-r border-slate-100 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <SidebarContent
        menuItems={menuItems}
        user={user}
        handleLogout={handleLogout}
      />
    </div>

    {/* Tablet Sidebar - collapsible */}
    <div className={`hidden md:block lg:hidden fixed inset-0 z-50 transition-all duration-500 ease-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500"
        onClick={() => setIsOpen(false)}
      />
      <div className={`fixed left-0 top-0 h-full z-50 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1)`}>
        <SidebarContent
          menuItems={menuItems}
          onClose={() => setIsOpen(false)}
          user={user}
          handleLogout={handleLogout}
          isMobile={true}
        />
      </div>
    </div>

    {/* Mobile Sidebar - collapsible */}
    <div className={`md:hidden fixed inset-0 z-50 transition-all duration-500 ease-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500"
        onClick={() => setIsOpen(false)}
      />
      <div className={`fixed left-0 top-0 h-full z-50 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1)`}>
        <SidebarContent
          menuItems={menuItems}
          onClose={() => setIsOpen(false)}
          user={user}
          handleLogout={handleLogout}
          isMobile={true}
        />
      </div>
    </div>
  </>
);
};

// Extracted SidebarContent to prevent re-renders
const SidebarContent = ({ menuItems, onClose, isCollapsed = false, user, handleLogout, isMobile = false }) => (
  <div className={`flex flex-col h-full ${isCollapsed ? 'w-20' : 'w-[85vw] max-w-[280px] lg:w-72'} bg-sidebar text-sidebar-foreground transition-all duration-300 ${!isMobile ? 'border-r border-sidebar-border' : ''} ${isMobile ? 'shadow-2xl' : ''}`}>

    {/* Header */}
    <div className={`flex items-center justify-between px-6 py-8 ${isCollapsed ? 'justify-center' : ''}`}>
      {!isCollapsed && (
        <div className="flex items-center gap-3 w-full group cursor-pointer" onClick={() => navigate('/live-stock-dashboard')}>
          <div className="p-1 transition-all duration-300">
            <img src={logo} alt="VPR" className="w-12 h-12 object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter text-slate-900 leading-tight">
              VPR <span className="text-primary">SYSTEMS</span>
            </h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] -mt-0.5">Enterprise Suite</p>
          </div>
        </div>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-auto"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>

    {/* Menu */}
    <nav className="flex-1 px-4 space-y-2 overflow-y-auto scrollbar-hide py-2">
      {menuItems.map((item) => {
        if (item.type === 'separator') {
          return (
            <div key={item.label} className="pt-6 pb-2">
              <div className="flex items-center gap-2 px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</span>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>
            </div>
          );
        }

        if (item.type === 'dropdown') {
          return (
            <div key={item.label} className="mb-1">
              <button
                onClick={item.toggle}
                className={`flex items-center justify-between w-full py-2.5 px-3 rounded-md transition-all duration-200 group ${item.isOpen
                  ? 'bg-slate-50 text-primary font-bold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`transition-colors ${item.isOpen ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} size={18} />
                  {!isCollapsed && <span className="font-semibold text-sm">{item.label}</span>}
                </div>
                {!isCollapsed && (item.isOpen ? <ChevronUp size={14} className="text-primary" /> : <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600" />)}
              </button>

              {
                item.isOpen && !isCollapsed && (
                  <div className="ml-5 mt-1 space-y-1 pl-4 border-l border-slate-100">
                    {item.items.map((subItem) => (
                      <NavLink
                        key={subItem.path}
                        to={subItem.path}
                        className={({ isActive }) =>
                          `flex items-center py-2 px-3 rounded-md transition-all duration-200 text-sm ${isActive
                            ? 'text-primary font-bold bg-white shadow-sm border border-slate-100'
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`
                        }
                        onClick={() => {
                          onClose?.();
                        }}
                      >
                        <span className="font-semibold">{subItem.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )
              }
            </div>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center py-2.5 px-3 rounded-md transition-all duration-200 mb-1 group ${isActive
                ? 'bg-primary text-white font-bold shadow-md shadow-primary/20'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
            onClick={() => {
              onClose?.();
            }}
          >
            {({ isActive }) => (
              <>
                <item.icon className={`transition-colors ${isCollapsed ? 'mx-auto' : 'mr-3'} ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} size={18} />
                {!isCollapsed && <span className="font-semibold text-sm">{item.label}</span>}
              </>
            )}
          </NavLink>
        );
      })}
    </nav >

    {/* Footer - Always visible */}
    <div className="p-4 mt-auto">
      <div className={`flex items-center gap-3 p-3 rounded-2xl ${isCollapsed ? 'justify-center' : 'bg-sidebar-accent/30 border border-sidebar-border/50'}`}>
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-sidebar-border text-sidebar-primary shadow-sm overflow-hidden">
          {user?.profile_picture ? (
            <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User size={20} />
          )}
        </div>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.full_name || user?.Name || user?.username || 'Guest'}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role || user?.designation || 'User'}</p>
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={() => {
              handleLogout();
              onClose?.();
            }}
            className="p-2 rounded-lg text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Logout"
          >
            <LogOutIcon size={18} />
          </button>
        )}
      </div>
    </div >
  </div >
);

export default Sidebar;