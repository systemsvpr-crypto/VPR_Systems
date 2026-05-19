import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
  const location = useLocation();
  const isLiveStock = location.pathname === '/live-stock';
  const isStockMovement = location.pathname === '/stock-movement';
  const isFixedPage = false; // location.pathname.includes('settings');

  if (isLiveStock) {
    return (
      <div className="flex h-screen bg-white font-sans text-slate-900 selection:bg-primary/20 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Outlet />
        </main>
      </div>
    );
  }

  const hideGlobalHeader = isStockMovement;

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-slate-900 selection:bg-primary/20">
      <Sidebar />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {!hideGlobalHeader && <Header />}

        {/* Scrollable content area */}
        <main className={`flex-1 flex flex-col custom-scrollbar ${isFixedPage ? 'overflow-hidden' : 'overflow-y-auto'} ${hideGlobalHeader ? 'p-0' : 'p-4 sm:p-6 lg:p-8'}`}>
          <div className={`flex-1 w-full flex flex-col ${hideGlobalHeader ? 'max-w-none' : 'max-w-7xl mx-auto'}`}>
            <Outlet />
          </div>
        </main>

        <footer className="py-3 px-6 border-t border-slate-100 w-full bg-white shrink-0 z-10">
          <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 items-center gap-2 md:gap-0">
            <div className="hidden md:block"></div>

            <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500">
              <span>Powered by</span>
              <a
                href="https://www.botivate.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold tracking-tight"
              >
                Botivate
              </a>
            </div>

            <div className="text-center md:text-right text-xs text-slate-400 font-medium opacity-80">
              &copy; 2025 Botivate Services LLP. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;