import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
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
  HardHat
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
              Admin: (newData.role?.toLowerCase() === 'admin' || newData.role === 'Admin') ? 'Yes' : 'No',
            };

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
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  /* Combined Master Menu List for Permission Checking */
  const MASTER_MENU_ITEMS = [
    { path: '/live-stock-dashboard', icon: LayoutDashboard, label: 'Live Stock', id: 'live-stock-dashboard' },
    { path: '/stock-management', icon: TrendingUp, label: 'Stock Management', id: 'stock-management' },
    { path: '/stock-notifications', icon: Bell, label: 'Notifications', id: 'stock-notifications' },
    { type: 'separator', label: 'SETTINGS' },
    { path: '/settings', icon: Settings, label: 'Settings', id: 'settings' },
    { path: '/my-profile', icon: User, label: 'My Profile', id: 'my-profile' },
  ];

  // Helper: Check if user has access to a specific page ID
  const hasAccess = (pageId) => {
    // If no page_access defined (legacy users), fallback to basic employee pages
    if (!user?.page_access || !Array.isArray(user?.page_access)) {
      const DEFAULT_ACCESS = ['my-profile'];
      return DEFAULT_ACCESS.includes(pageId);
    }

    return user.page_access.includes(pageId);
  };

  // Filter the menu items
  const baseMenuItems = MASTER_MENU_ITEMS.reduce((acc, item) => {
    // Handle separators - always show them
    if (item.type === 'separator') {
      acc.push(item);
      return acc;
    }

    // Handle Dropdowns specially
    if (item.type === 'dropdown') {
      // Check if any child is accessible
      const accessibleChildren = item.items.filter(child => hasAccess(child.id));
      if (accessibleChildren.length > 0) {
        acc.push({ ...item, items: accessibleChildren });
      }
    } else {
      // Normal Item
      if (hasAccess(item.id)) {
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
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center justify-center w-12 h-12">
            <img src="/logo.png" alt="VPR System" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight leading-none">
              VPR System
            </span>
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
            <div key={item.label} className="pt-4 pb-2">
              <div className="flex items-center gap-2 px-3">
                <div className="h-px flex-1 bg-slate-200"></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</span>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>
            </div>
          );
        }

        if (item.type === 'dropdown') {
          return (
            <div key={item.label} className="mb-1">
              <button
                onClick={item.toggle}
                className={`flex items-center justify-between w-full py-3 px-3 rounded-xl transition-all duration-200 group ${item.isOpen
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`transition-colors ${item.isOpen ? 'text-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'}`} size={20} />
                  {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
                </div>
                {!isCollapsed && (item.isOpen ? <ChevronUp size={14} className="text-primary" /> : <ChevronDown size={14} className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground" />)}
              </button>

              {
                item.isOpen && !isCollapsed && (
                  <div className="ml-5 mt-1 space-y-1 pl-4 border-l border-slate-100">
                    {item.items.map((subItem) => (
                      <NavLink
                        key={subItem.path}
                        to={subItem.path}
                        className={({ isActive }) =>
                          `flex items-center py-2.5 px-3 rounded-lg transition-all duration-200 text-sm ${isActive
                            ? 'text-primary font-semibold bg-primary/10'
                            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                          }`
                        }
                        onClick={() => {
                          onClose?.();
                        }}
                      >
                        <span className="font-medium">{subItem.label}</span>
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
              `flex items-center py-3 px-3 rounded-xl transition-all duration-200 mb-1 group ${isActive
                ? 'bg-primary/10 text-primary font-semibold shadow-sm shadow-primary/10'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`
            }
            onClick={() => {
              onClose?.();
            }}
          >
            {({ isActive }) => (
              <>
                <item.icon className={`transition-colors ${isCollapsed ? 'mx-auto' : 'mr-3'} ${isActive ? 'text-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'}`} size={20} />
                {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
              </>
            )}
          </NavLink>
        );
      })}
    </nav >

    {/* Footer - Always visible */}
    <div className="p-4 mt-auto">
      <div className={`flex items-center gap-3 p-3 rounded-2xl ${isCollapsed ? 'justify-center' : 'bg-sidebar-accent/30 border border-sidebar-border/50'}`}>
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-sidebar-border text-sidebar-primary shadow-sm">
          <User size={20} />
        </div>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user?.Name || user?.full_name || user?.Username || 'Guest'}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role || 'User'}</p>
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