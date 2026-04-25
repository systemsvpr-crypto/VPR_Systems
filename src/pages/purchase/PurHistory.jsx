import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  History, 
  Search, 
  RefreshCw, 
  ClipboardList, 
  CheckSquare, 
  PackageCheck, 
  ChevronUp, 
  ChevronDown,
  XCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const TS = ({ cols = 8 }) => <>{[...Array(5)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(cols)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const PurHistory = () => {
  const [activeSubTab, setActiveSubTab] = useState('indents');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [indents, setIndents] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [arrivals, setArrivals] = useState([]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, appRes, arrRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_vendor_approvals').select('*, purchase_indent(indent_number, product_name, godown_name)').order('created_at', { ascending: false }),
        supabase.from('purchase_delivery').select('*').eq('arrival_status', 'Arrived').order('updated_at', { ascending: false })
      ]);

      if (indRes.error) throw indRes.error;
      setIndents(indRes.data || []);
      setApprovals(appRes.data || []);
      setArrivals(arrRes.data || []);

    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredData = useMemo(() => {
    let data = [];
    if (activeSubTab === 'indents') data = indents;
    else if (activeSubTab === 'approvals') data = approvals;
    else if (activeSubTab === 'arrivals') data = arrivals;

    return data.filter(item => 
      Object.values(item).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [activeSubTab, indents, approvals, arrivals, searchTerm]);

  const SUB_TABS = [
    { id: 'indents', label: 'Indent History', icon: ClipboardList },
    { id: 'approvals', label: 'Approval/Rejection History', icon: CheckSquare },
    { id: 'arrivals', label: 'Completion History', icon: PackageCheck }
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* ── Sub-Tab Navigation ── */}
      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all border ${
              activeSubTab === tab.id 
                ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' 
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
              <History size={20} className="text-orange-600" />
              Purchase History
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              Auditing {activeSubTab} logs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search history..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-64 transition-all" 
              />
            </div>
            <button 
              onClick={() => fetchData(true)} 
              disabled={refreshing} 
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-all"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── History Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {activeSubTab === 'indents' && (
                  <>
                    <th className="px-4 py-4">Indent No</th>
                    <th className="px-4 py-4">Product</th>
                    <th className="px-4 py-4">Godown</th>
                    <th className="px-4 py-4 text-right">Qty (kg)</th>
                    <th className="px-4 py-4">Created Date</th>
                    <th className="px-4 py-4 text-center">Status</th>
                  </>
                )}
                {activeSubTab === 'approvals' && (
                  <>
                    <th className="px-4 py-4">Indent No</th>
                    <th className="px-4 py-4">Product</th>
                    <th className="px-4 py-4">Vendor</th>
                    <th className="px-4 py-4 text-right">Rate</th>
                    <th className="px-4 py-4">Decided Date</th>
                    <th className="px-4 py-4 text-center">Decision</th>
                  </>
                )}
                {activeSubTab === 'arrivals' && (
                  <>
                    <th className="px-4 py-4">Lifting No</th>
                    <th className="px-4 py-4">Product</th>
                    <th className="px-4 py-4">Godown</th>
                    <th className="px-4 py-4 text-right">Recv. Qty</th>
                    <th className="px-4 py-4">Arrival Date</th>
                    <th className="px-4 py-4 text-center">Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={6} /> : filteredData.length === 0 ? (
                <tr><td colSpan={6} className="py-24 text-center text-gray-400 font-bold">No history records found.</td></tr>
              ) : filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  {activeSubTab === 'indents' && (
                    <>
                      <td className="px-4 py-4 font-black text-gray-900">{row.indent_number}</td>
                      <td className="px-4 py-4 font-bold text-gray-700">{row.product_name}</td>
                      <td className="px-4 py-4 text-gray-500 font-bold text-xs">{row.godown_name}</td>
                      <td className="px-4 py-4 text-right font-black text-gray-700">{row.qty_kg?.toLocaleString()}</td>
                      <td className="px-4 py-4 text-gray-400 font-bold text-xs">{new Date(row.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${row.vendor_approval ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {row.vendor_approval ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                    </>
                  )}
                  {activeSubTab === 'approvals' && (
                    <>
                      <td className="px-4 py-4 font-black text-gray-900">{row.purchase_indent?.indent_number}</td>
                      <td className="px-4 py-4 font-bold text-gray-700">{row.purchase_indent?.product_name}</td>
                      <td className="px-4 py-4 font-black text-blue-600">{row.approved_vendor}</td>
                      <td className="px-4 py-4 text-right font-black text-orange-600">₹{row.approved_rate}</td>
                      <td className="px-4 py-4 text-gray-400 font-bold text-xs">{row.actual_date}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`flex items-center justify-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${
                          row.approved_status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {row.approved_status === 'Approved' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {row.approved_status}
                        </span>
                      </td>
                    </>
                  )}
                  {activeSubTab === 'arrivals' && (
                    <>
                      <td className="px-4 py-4 font-black text-orange-600">{row.delivery_number}</td>
                      <td className="px-4 py-4 font-bold text-gray-700">{row.product_name}</td>
                      <td className="px-4 py-4 text-gray-500 font-bold text-xs">{row.godown_name}</td>
                      <td className="px-4 py-4 text-right font-black text-green-600">{row.received_qty_kg?.toLocaleString()} kg</td>
                      <td className="px-4 py-4 text-gray-400 font-bold text-xs">{row.delivery_date}</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-green-100 text-green-700 uppercase tracking-tighter shadow-sm border border-green-200">
                          {row.arrival_status}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurHistory;
