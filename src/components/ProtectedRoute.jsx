import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { pathname } = useLocation();

  // Read from both possible storage locations
  const userRaw = localStorage.getItem('user');
  const zustandRaw = localStorage.getItem('vpr'); // Zustand persisted key

  let user = null;
  try {
    if (userRaw) {
      user = JSON.parse(userRaw);
    } else if (zustandRaw) {
      const zustandState = JSON.parse(zustandRaw);
      user = zustandState?.state?.user || null;
    }
  } catch {
    user = null;
  }

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

  // Admins bypass ALL permission checks — full access to everything
  if (isAdmin) {
    return <>{children}</>;
  }

  // Non-admins: check page_access array
  const allowedPages = Array.isArray(user.page_access) ? user.page_access : [];

  // Normalize current path (strip leading slash)
  const currentPath = pathname === '/' ? '/' : pathname.substring(1);

  const isAllowed =
    currentPath === '/' ||
    allowedPages.includes(currentPath) ||
    // stock-management visible if user has any sub-tab access
    (currentPath === 'stock-management' &&
      ['products', 'godowns', 'transporters'].some(p => allowedPages.includes(p))) ||
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
