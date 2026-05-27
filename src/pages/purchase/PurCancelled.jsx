import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, XCircle, AlertCircle, Package, History, Clock } from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const TS = ({ cols = 8 }) => <>{[...Array(5)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(cols)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const PurCancelled = () => {
  const [rejections, setRejections] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('rejections'); // rejections | cancellations

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [rejRes, canRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').eq('indent_type', 'Rejected').order('created_at', { ascending: false }),
        supabase.from('purchase_indent_cancellations').select('*').order('cancelled_at', { ascending: false })
      ]);
      
      if (rejRes.error) throw rejRes.error;
      if (canRes.error) throw canRes.error;

      setRejections(rejRes.data || []);
      setCancellations(canRes.data || []);
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayRecords = useMemo(() => {
    return activeTab === 'rejections' ? rejections : cancellations;
  }, [activeTab, rejections, cancellations]);

  const filtered = useMemo(() => {
    return displayRecords.filter(i =>
      Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [displayRecords, searchTerm]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* ── Sub Tabs ── */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('rejections')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'rejections' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <XCircle size={16} /> Rejected (Approval)
        </button>
        <button onClick={() => setActiveTab('cancellations')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'cancellations' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <Package size={16} /> Cancelled (Delivery)
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
              {activeTab === 'rejections' ? 'Rejected Indents' : 'Cancelled Quantities'}
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              {activeTab === 'rejections' ? 'Indents rejected during vendor approval' : 'Quantities cancelled during delivery planning'}
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
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                <th className="px-4 py-4">Indent No</th>
                <th className="px-4 py-4">Product</th>
                <th className="px-4 py-4">Vendor</th>
                {activeTab === 'cancellations' ? (
                  <>
                    <th className="px-4 py-4 text-right">Original Bags</th>
                    <th className="px-4 py-4 text-right text-red-600">Cancelled Bags</th>
                  </>
                ) : (
                  <th className="px-4 py-4 text-right">Qty (kg)</th>
                )}
                <th className="px-4 py-4">{activeTab === 'rejections' ? 'Rejection Date' : 'Cancellation Date'}</th>
                <th className="px-4 py-4">Reason / Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={activeTab === 'cancellations' ? 7 : 6} /> : filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package size={32} className="text-gray-200" />
                    <p className="text-sm text-gray-400 font-bold tracking-tight">No records found.</p>
                  </div>
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-red-50/10 transition-colors group text-gray-500 font-bold">
                  <td className="px-4 py-4 font-black text-gray-900">{r.indent_number}</td>
                  <td className="px-4 py-4 font-bold text-gray-800">{r.product_name}</td>
                  <td className="px-4 py-4 font-bold">{r.vendor_name || '—'}</td>
                  
                  {activeTab === 'cancellations' ? (
                    <>
                      <td className="px-4 py-4 text-right">{parseInt(r.original_qty_bags || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-red-600 font-black">{parseInt(r.cancelled_qty_bags || 0).toLocaleString()}</td>
                    </>
                  ) : (
                    <td className="px-4 py-4 text-right font-black">{parseFloat(r.qty_kg || 0).toLocaleString()}</td>
                  )}

                  <td className="px-4 py-4 text-[10px] font-black uppercase text-gray-400">
                    {activeTab === 'rejections' 
                      ? (r.created_at ? new Date(r.created_at).toLocaleDateString() : '—')
                      : (r.cancelled_at ? new Date(r.cancelled_at).toLocaleDateString() : '—')
                    }
                  </td>
                  <td className="px-4 py-4 italic text-xs truncate max-w-[250px]">
                    {activeTab === 'rejections' ? (r.remarks || 'No remarks') : (r.reason || 'No reason provided')}
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

export default PurCancelled;
