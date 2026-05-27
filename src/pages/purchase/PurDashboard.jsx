import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, Users, CheckSquare, Truck, TrendingUp, RefreshCw, AlertCircle, Ban, PackageCheck, Box, History, ShoppingCart } from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, icon: Icon, color, bg, sub }) => (
  <div className={`bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-start gap-4 transition-all hover:shadow-md`}>
    <div className={`${bg} ${color} p-3 rounded-xl flex-shrink-0 shadow-inner`}>
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{title}</p>
      <p className="text-3xl font-black text-gray-900 leading-tight mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 font-medium">{sub}</p>}
    </div>
  </div>
);

const PipelineRow = ({ label, count, color, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="py-3 group">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-xs font-black text-gray-900">{count}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-1000 ease-out`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
};

const PurDashboard = () => {
  const [indents, setIndents] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [products, setProducts] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [indentsRes, delRes, canRes, prodRes, godRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_delivery').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_indent_cancellations').select('*'),
        supabase.from('products').select('*'),
        supabase.from('godowns').select('id, name')
      ]);
      if (indentsRes.error) throw indentsRes.error;
      setIndents(indentsRes.data || []);
      setDeliveries(delRes.data || []);
      setCancellations(canRes.data || []);
      setProducts(prodRes.data || []);
      setGodowns(godRes.data || []);
    } catch (err) {
      toast.error('Failed to load dashboard: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const stats = useMemo(() => {
    const total = indents.length;
    
    const pendingSelection = indents.filter(i => i.indent_type === 'Process' && !i.vendor_name).length;
    const pendingApproval = indents.filter(i => i.indent_type === 'Process' && i.vendor_name && !i.vendor_approval).length;
    const approved = indents.filter(i => i.vendor_approval === true).length;
    const arrivedCount = deliveries.filter(d => d.arrival_status === 'Arrived').length;

    const cancelledCount = cancellations.length;
    const cancelledQty = cancellations.reduce((acc, c) => acc + (parseFloat(c.cancelled_qty_kg) || 0), 0);

    const liveStockQty = products.reduce((acc, p) => acc + (parseFloat(p.current_stock) || 0), 0);

    return { total, pendingSelection, pendingApproval, approved, arrivedCount, cancelledCount, cancelledQty, liveStockQty };
  }, [indents, deliveries, cancellations, products]);

  const recentArrivals = useMemo(() => {
    return deliveries
      .filter(d => d.arrival_status === 'Arrived')
      .slice(0, 5);
  }, [deliveries]);

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (parseFloat(b.current_stock) || 0) - (parseFloat(a.current_stock) || 0))
      .slice(0, 5);
  }, [products]);

  const godownMap = useMemo(() => {
    return Object.fromEntries(godowns.map(g => [g.id, g.name]));
  }, [godowns]);

  if (loading) return (
    <div className="space-y-4 animate-pulse p-4 sm:p-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-gray-50 rounded-xl" />)}
      </div>
      <div className="h-48 bg-gray-50 rounded-xl" />
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Purchase Dashboard</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex h-2 w-2 rounded-full bg-orange-500"></span>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Live Procurement Intelligence</p>
          </div>
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-100 transition-all"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Total Indents" value={stats.total} icon={ClipboardList} color="text-gray-600" bg="bg-gray-50" />
        <StatCard title="Pending Select" value={stats.pendingSelection} icon={Users} color="text-blue-600" bg="bg-blue-50" />
        <StatCard title="Pending Approve" value={stats.pendingApproval} icon={CheckSquare} color="text-yellow-600" bg="bg-yellow-50" />
        <StatCard title="Approved" value={stats.approved} icon={Truck} color="text-green-600" bg="bg-green-50" />
        <StatCard title="Completed" value={stats.arrivedCount} icon={PackageCheck} color="text-emerald-600" bg="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Progress */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-50 rounded-lg"><TrendingUp size={18} className="text-orange-500" /></div>
              <h3 className="font-black text-gray-800 text-xs uppercase tracking-widest">Process Health</h3>
            </div>
          </div>
          <div className="space-y-4">
            <PipelineRow label="Procurement Target" count={stats.total} color="bg-gray-400" total={stats.total} />
            <PipelineRow label="Market Selection" count={stats.pendingSelection} color="bg-blue-400" total={stats.total} />
            <PipelineRow label="Approved Contracts" count={stats.approved} color="bg-green-400" total={stats.total} />
            <PipelineRow label="Loss / Cancelled" count={stats.cancelledCount} color="bg-red-400" total={stats.total + stats.cancelledCount} />
          </div>
          <div className="mt-8 pt-6 border-t border-dashed border-gray-100 grid grid-cols-2 gap-4">
              <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg text-red-500"><Ban size={18} /></div>
                      <div>
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Cancelled Qty</p>
                          <p className="text-lg font-black text-red-700">{stats.cancelledQty.toLocaleString()} <span className="text-[10px]">KG</span></p>
                      </div>
                  </div>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg text-indigo-500"><Box size={18} /></div>
                      <div>
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Live Inventory</p>
                          <p className="text-lg font-black text-indigo-700">{stats.liveStockQty.toLocaleString()} <span className="text-[10px]">BAGS</span></p>
                      </div>
                  </div>
              </div>
          </div>
        </div>

        {/* Recent Arrivals */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-emerald-50 rounded-lg"><ShoppingCart size={18} className="text-emerald-500" /></div>
            <h3 className="font-black text-gray-800 text-xs uppercase tracking-widest">Recent Purchases</h3>
          </div>
          <div className="space-y-4">
              {recentArrivals.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs font-bold text-gray-400 uppercase italic">No recent purchases found</p>
                </div>
              ) : recentArrivals.map(d => (
                <div key={d.id} className="group relative pl-4 border-l-2 border-emerald-100 hover:border-emerald-500 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-gray-900 uppercase truncate">{d.product_name}</p>
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-tighter">Arrived</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] font-bold text-gray-400 italic">{d.delivery_number}</p>
                    <p className="text-[10px] font-black text-gray-600">{parseFloat(d.received_qty_kg || 0).toLocaleString()} Kg</p>
                  </div>
                  <div className="mt-1 text-[9px] font-black text-gray-300 uppercase tracking-widest">{d.delivery_date}</div>
                </div>
              ))}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-50">
             <button className="w-full py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-orange-500 transition-colors">View All History</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurDashboard;
