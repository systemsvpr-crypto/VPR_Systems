import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, Users, CheckSquare, Truck, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, icon: Icon, color, bg, sub }) => (
  <div className={`bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-start gap-4`}>
    <div className={`${bg} ${color} p-3 rounded-xl flex-shrink-0`}>
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest truncate">{title}</p>
      <p className="text-3xl font-black text-gray-900 leading-tight mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const PipelineRow = ({ label, count, color }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </div>
    <span className={`text-sm font-black ${count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{count}</span>
  </div>
);

const PurDashboard = () => {
  const [indents, setIndents] = useState([]);
  const [vendorSelections, setVendorSelections] = useState([]);
  const [vendorApprovals, setVendorApprovals] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [indentsRes, vsRes, vaRes, delRes] = await Promise.all([
        supabase.from('purchase_indents').select('*'),
        supabase.from('purchase_vendor_selections').select('*'),
        supabase.from('purchase_vendor_approvals').select('*'),
        supabase.from('purchase_deliveries').select('*'),
      ]);
      if (indentsRes.error) throw indentsRes.error;
      setIndents(indentsRes.data || []);
      setVendorSelections(vsRes.data || []);
      setVendorApprovals(vaRes.data || []);
      setDeliveries(delRes.data || []);
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
    const activeIndents = indents.filter(i => i.status !== 'Canceled');

    // Items not yet in vendor selection
    const vsIndentIds = new Set(vendorSelections.map(v => v.indent_id));
    const pendingVendorSelection = activeIndents.filter(i => !vsIndentIds.has(i.id)).length;

    // Items in vendor selection but not approved
    const vaIndentIds = new Set(vendorApprovals.map(v => v.indent_id));
    const pendingApproval = activeIndents.filter(i => vsIndentIds.has(i.id) && !vaIndentIds.has(i.id)).length;

    // Items approved but not delivered
    const approvedIndentIds = new Set(vendorApprovals.filter(v => v.approved_status === 'Approved').map(v => v.indent_id));
    const delIndentIds = new Set(deliveries.map(d => d.indent_id));
    const pendingDelivery = activeIndents.filter(i => approvedIndentIds.has(i.id) && !delIndentIds.has(i.id)).length;

    const completedThisMonth = indents.filter(i => {
      const d = deliveries.find(del => del.indent_id === i.id);
      if (!d?.actual_date) return false;
      const now = new Date();
      const da = new Date(d.actual_date);
      return da.getMonth() === now.getMonth() && da.getFullYear() === now.getFullYear();
    }).length;

    return { total, pendingVendorSelection, pendingApproval, pendingDelivery, completedThisMonth };
  }, [indents, vendorSelections, vendorApprovals, deliveries]);

  const recentIndents = useMemo(() =>
    [...indents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
    [indents]
  );

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-800">Purchase Dashboard</h2>
          <p className="text-xs text-gray-400 font-semibold">Procurement pipeline overview</p>
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 border border-orange-100 rounded-lg text-sm font-bold hover:bg-orange-100 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Indents" value={stats.total} icon={ClipboardList} color="text-orange-600" bg="bg-orange-50" />
        <StatCard title="Pending Vendor Selection" value={stats.pendingVendorSelection} icon={Users} color="text-blue-600" bg="bg-blue-50" />
        <StatCard title="Pending Approval" value={stats.pendingApproval} icon={CheckSquare} color="text-yellow-600" bg="bg-yellow-50" />
        <StatCard title="Pending Delivery" value={stats.pendingDelivery} icon={Truck} color="text-green-600" bg="bg-green-50" />
      </div>

      {/* Pipeline + Recent Indents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-orange-500" />
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-widest">Pipeline Status</h3>
          </div>
          <PipelineRow label="Indent Raised" count={indents.length} color="bg-orange-400" />
          <PipelineRow label="Vendor Selected" count={vendorSelections.length} color="bg-blue-400" />
          <PipelineRow label="Approved" count={vendorApprovals.filter(v => v.approved_status === 'Approved').length} color="bg-yellow-400" />
          <PipelineRow label="Delivered" count={deliveries.length} color="bg-green-400" />
          <PipelineRow label="Completed This Month" count={stats.completedThisMonth} color="bg-emerald-500" />
        </div>

        {/* Recent Indents */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={18} className="text-orange-500" />
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-widest">Recent Indents</h3>
          </div>
          {recentIndents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300">
              <AlertCircle size={28} />
              <p className="text-sm font-semibold mt-2">No indents yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentIndents.map(i => (
                <div key={i.id} className="flex items-center justify-between p-2.5 bg-gray-50/60 rounded-lg">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{i.indent_number}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[180px]">{i.product_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-orange-600">Qty: {i.qty}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      i.status === 'Completed' ? 'bg-green-100 text-green-600' :
                      i.status === 'Canceled' ? 'bg-red-100 text-red-500' :
                      'bg-orange-100 text-orange-600'
                    }`}>{i.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurDashboard;
