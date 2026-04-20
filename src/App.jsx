import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import MyProfile from './pages/MyProfile';
import ProtectedRoute from './components/ProtectedRoute';
import Settings from './pages/Settings';
import Godowns from './pages/Godowns';
import Products from './pages/Products';
import StockNotifications from './pages/StockNotifications';
import StockManagement from './pages/StockManagement';
import LiveStockDashboard from './pages/LiveStockDashboard';
import Transporters from './pages/Transporters';

function App() {
  return (
    <div className="gradient-bg min-h-screen">
      <Router>
        <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/my-profile" replace />} />
            <Route path="my-profile" element={<MyProfile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="godowns" element={<Godowns />} />
            <Route path="transporters" element={<Transporters />} />
            <Route path="products" element={<Products />} />
            <Route path="stock-notifications" element={<StockNotifications />} />
            <Route path="stock-management" element={<StockManagement />} />
            <Route path="live-stock-dashboard" element={<LiveStockDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </div >
  );
}

export default App;