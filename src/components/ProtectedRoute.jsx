import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { pathname } = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin Bypass: Admins usually have full access. 
  // 'page_access' check for non-admins
  if (user.role !== 'admin' && user.role !== 'Admin' && user.Admin !== 'Yes') {
    const allowedPages = user.page_access || [];

    // Normalize location to match page IDs (remove leading slash)
    let currentPath = pathname.substring(1);

    // Handle root path explicitly
    if (pathname === '/') currentPath = '/';

    // Check if the current path is allowed
    // We check exact match or if it's a sub-route of an allowed page
    const isAllowed =
      allowedPages.includes(currentPath) ||
      (currentPath === '/' && allowedPages.includes('/')) ||
      allowedPages.some(page =>
        page !== '/' && (currentPath === page || currentPath.startsWith(`${page}/`))
      );

    if (!isAllowed) {
      // Logic to find fallback
      // If they have access to some pages, send them to the first one.
      // If no pages allowed, send to login.
      const fallback = allowedPages.length > 0 ? allowedPages[0] : null;

      if (!fallback) {
        return <Navigate to="/login" replace />;
      }

      const redirectPath = fallback === '/' ? '/' : `/${fallback}`;

      // Prevent infinite loop if they are already at the redirect target
      if (pathname !== redirectPath) {
        return <Navigate to={redirectPath} replace />;
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;