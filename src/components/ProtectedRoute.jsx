import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const ProtectedRoute = ({ children }) => {
  const { pathname } = useLocation();
  const { user } = useAuthStore();

  // Not logged in → go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Normalize role to uppercase for comparison — handles 'admin', 'Admin', 'ADMIN', 'SUPER ADMIN'
  const roleUpper = (user.role || '').toUpperCase().trim();
  const isAdmin =
    roleUpper === 'ADMIN' ||
    roleUpper === 'SUPER ADMIN' ||
    roleUpper === 'SUPER_ADMIN' ||
    user.Admin === 'Yes';

  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN';

  // Normalize current path (strip leading slash)
  const currentPath = pathname === '/' ? '/' : pathname.substring(1);

  // The settings page is restricted to Admin or Super Admin only
  const isSettingsPath = currentPath === 'settings' || currentPath.startsWith('settings/');

  if (isSettingsPath) {
    if (isAdmin || isSuperAdmin) {
      return <>{children}</>;
    } else {
      return <Navigate to="/my-profile" replace />;
    }
  }

  // SUPER ADMIN bypasses ALL permission checks — full access to everything
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Non-admins and Admins check page_access array for other pages
  const allowedPages = Array.isArray(user.page_access) ? user.page_access : [];

  const isAllowed =
    currentPath === '/' ||
    allowedPages.includes(currentPath) ||
    currentPath === 'my-profile' ||
    // stock-management visible if user has any sub-tab access
    (currentPath === 'stock-management' &&
      ['products', 'godowns', 'transporters'].some(p => allowedPages.includes(p))) ||
    // master visible if user has any sub-tab access
    (currentPath === 'master' &&
      ['products', 'product-type', 'godowns', 'transporters', 'customers', 'vendors'].some(p => allowedPages.includes(p))) ||
    // purchase visible if any purchase sub-tab access
    (currentPath === 'purchase' &&
      ['purchase-dashboard', 'purchase-indent', 'purchase-vendor-selection', 'purchase-vendor-approve', 'purchase-delivery', 'purchase-arrival', 'purchase-cancelled', 'purchase-pc-report'].some(p => allowedPages.includes(p))) ||
    // sell visible if explicitly granted OR if they have any of the OTD pages
    (currentPath === 'sell' && (
      allowedPages.includes('sell') || 
      allowedPages.some(p => ['Dashboard', 'Order', 'Dispatch Planning', 'Inform to Party Before Dispatch', 'Dispatch Completed', 'Inform to Party After Dispatch', 'Godown', 'PC Report', 'Skip Delivered', 'Settings'].includes(p))
    )) ||
    // generic sub-route match
    allowedPages.some(
      page => page !== '/' && (currentPath === page || currentPath.startsWith(`${page}/`))
    );

  if (!isAllowed) {
    const fallback = allowedPages[0] ?? null;
    if (!fallback) return <Navigate to="/login" replace />;
    const redirectPath = fallback === '/' ? '/' : `/${fallback}`;
    if (pathname !== redirectPath) return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
