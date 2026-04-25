import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ChevronUp, ChevronDown, CheckCircle, XCircle, AlertCircle, Package, History as HistoryIcon, Clock } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const TS = ({ cols = 8 }) => <>{[...Array(5)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(cols)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const PurVendorApprove = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [activeTab, setActiveTab] = useState('pending'); // pending | history

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Fetch all indents with vendors
      const { data, error } = await supabase
        .from('purchase_indent')
        .select('*')
        .not('vendor_name', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRecords(data || []);
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayRecords = useMemo(() => {
    if (activeTab === 'pending') {
      return records.filter(r => r.indent_type === 'Process' && r.vendor_approval === false);
    } else {
      return records.filter(r => r.vendor_approval === true || r.indent_type === 'Rejected');
    }
  }, [records, activeTab]);

  const filtered = useMemo(() => {
    let r = displayRecords.filter(i =>
      Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
    if (sortConfig.key) r = [...r].sort((a, b) => {
      const av = a[sortConfig.key] ?? '', bv = b[sortConfig.key] ?? '';
      return sortConfig.direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return r;
  }, [displayRecords, searchTerm, sortConfig]);

  const reqSort = (k) => setSortConfig(p => ({ key: k, direction: p.key === k && p.direction === 'asc' ? 'desc' : 'asc' }));
  const SI = ({ k }) => <span className="flex flex-col ml-1"><ChevronUp size={9} className={sortConfig.key === k && sortConfig.direction === 'asc' ? 'text-orange-500' : 'text-gray-300'} /><ChevronDown size={9} className={sortConfig.key === k && sortConfig.direction === 'desc' ? 'text-orange-500' : 'text-gray-300'} /></span>;

  const handleAction = async (r, status) => {
    try {
      let updateData = {};
      if (status === 'Approved') {
        updateData = { vendor_approval: true };
      } else {
        updateData = { indent_type: 'Rejected' };
      }

      const { error } = await supabase.from('purchase_indent').update(updateData).eq('id', r.id);
      if (error) throw error;

      toast.success(`Indent ${status} successfully`);
      fetchAll(true);
    } catch (err) {
      toast.error('Operation failed: ' + err.message);
    }
  };

  const COLS = [
    { key: 'indent_number', label: 'Indent No' }, 
    { key: 'product_name', label: 'Product' },
    { key: 'godown_name', label: 'Godown' },
    { key: 'vendor_name', label: 'Vendor' }, 
    { key: 'rate', label: 'Rate', align: 'right' }, 
    { key: 'qty_kg', label: 'Qty (kg)', align: 'right' }, 
    { key: 'qty_bags', label: 'Qty (Bags)', align: 'right' }
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* ── Sub Tabs ── */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'pending' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <Clock size={16} /> Pending Approvals
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'history' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <HistoryIcon size={16} /> Approval History
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">{activeTab === 'pending' ? 'Vendor Approval' : 'Approval History'}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              {activeTab === 'pending' ? 'Review and authorize purchase indents' : 'Track past approval and rejection decisions'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-64 transition-all" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} 
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-all">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {COLS.map(col => (
                  <th key={col.key} className={`px-4 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`} onClick={() => reqSort(col.key)}>
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}<SI k={col.key} /></div>
                  </th>
                ))}
                <th className="px-4 py-4 text-center">{activeTab === 'pending' ? 'Decision' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={COLS.length + 1} /> : filtered.length === 0 ? (
                <tr><td colSpan={COLS.length + 1} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package size={32} className="text-gray-200" />
                    <p className="text-sm text-gray-400 font-bold tracking-tight">No records found.</p>
                  </div>
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-orange-50/20 transition-colors group">
                  <td className="px-4 py-4 font-black text-gray-900 leading-tight">{r.indent_number}</td>
                  <td className="px-4 py-4 font-bold text-gray-700">{r.product_name}</td>
                  <td className="px-4 py-4 text-gray-500 font-bold text-xs">{r.godown_name}</td>
                  <td className="px-4 py-4">
                    <div className="font-black text-blue-600 leading-tight">{r.vendor_name || '—'}</div>
                  </td>
                  <td className="px-4 py-4 text-right text-orange-600 font-black text-base">₹{parseFloat(r.rate || 0).toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-black text-gray-700">{r.qty_kg?.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-bold text-gray-500">{r.qty_bags}</td>
                  <td className="px-4 py-4">
                    {activeTab === 'pending' ? (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleAction(r, 'Approved')} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-tighter hover:bg-green-100 border border-green-100 transition-all shadow-sm">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button onClick={() => handleAction(r, 'Rejected')} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-[10px] font-black uppercase tracking-tighter hover:bg-red-100 border border-red-100 transition-all shadow-sm">
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full border shadow-sm ${r.vendor_approval ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                          {r.vendor_approval ? 'APPROVED' : 'REJECTED'}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurVendorApprove;
