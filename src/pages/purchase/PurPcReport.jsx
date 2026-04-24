import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const TS = () => <>{[...Array(6)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const STEPS = [
  { key: 'indent', label: 'Indent (Not Yet in Vendor Selection)', color: 'bg-orange-400' },
  { key: 'vendor_selection', label: 'Vendor Selection (Pending Approval)', color: 'bg-blue-400' },
  { key: 'vendor_approval', label: 'Vendor Approval (Pending Delivery)', color: 'bg-yellow-400' },
  { key: 'delivery', label: 'Delivery Pending', color: 'bg-red-400' },
  { key: 'completed', label: 'Completed', color: 'bg-green-500' },
];

const PurPcReport = () => {
  const [indents, setIndents] = useState([]);
  const [vendorSelections, setVendorSelections] = useState([]);
  const [vendorApprovals, setVendorApprovals] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stepFilter, setStepFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'indent_number', direction: 'asc' });

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, vsRes, vaRes, delRes] = await Promise.all([
        supabase.from('purchase_indents').select('*').neq('status', 'Canceled'),
        supabase.from('purchase_vendor_selections').select('indent_id, vendor_name, rate, actual_date'),
        supabase.from('purchase_vendor_approvals').select('indent_id, approved_status, approved_vendor, approved_rate, actual_date'),
        supabase.from('purchase_deliveries').select('indent_id, delivery_qty, actual_date'),
      ]);
      if (indRes.error) throw indRes.error;
      setIndents(indRes.data || []);
      setVendorSelections(vsRes.data || []);
      setVendorApprovals(vaRes.data || []);
      setDeliveries(delRes.data || []);
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Build pipeline report rows
  const reportRows = useMemo(() => {
    const vsMap = {};
    vendorSelections.forEach(v => { if (!vsMap[v.indent_id]) vsMap[v.indent_id] = v; });
    const vaMap = {};
    vendorApprovals.forEach(v => { if (!vaMap[v.indent_id]) vaMap[v.indent_id] = v; });
    const delMap = {};
    deliveries.forEach(d => { if (!delMap[d.indent_id]) delMap[d.indent_id] = d; });

    return indents.map(ind => {
      const vs = vsMap[ind.id];
      const va = vaMap[ind.id];
      const del = delMap[ind.id];

      let step, stepLabel, stepColor;

      if (del?.actual_date) {
        step = 'completed'; stepLabel = 'Completed'; stepColor = 'bg-green-100 text-green-700';
      } else if (va?.approved_status === 'Approved') {
        step = 'delivery'; stepLabel = 'Delivery Pending'; stepColor = 'bg-red-100 text-red-600';
      } else if (vs) {
        step = 'vendor_approval'; stepLabel = 'Vendor Approval Pending'; stepColor = 'bg-yellow-100 text-yellow-700';
      } else {
        step = 'indent'; stepLabel = 'Vendor Selection Pending'; stepColor = 'bg-orange-100 text-orange-600';
      }

      return {
        id: ind.id,
        indent_number: ind.indent_number,
        product_name: ind.product_name,
        qty: ind.qty,
        delivered_qty: ind.delivered_qty || 0,
        pending_qty: (ind.qty || 0) - (ind.delivered_qty || 0),
        vendor_name: vs?.vendor_name || va?.approved_vendor || '—',
        rate: va?.approved_rate || vs?.rate || '—',
        vs_date: vs?.actual_date || '—',
        va_date: va?.actual_date || '—',
        del_date: del?.actual_date || '—',
        step,
        stepLabel,
        stepColor,
        status: ind.status,
      };
    });
  }, [indents, vendorSelections, vendorApprovals, deliveries]);

  const filtered = useMemo(() => {
    let r = reportRows.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!stepFilter || row.step === stepFilter)
    );
    if (sortConfig.key) {
      r = [...r].sort((a, b) => {
        const av = a[sortConfig.key] ?? '', bv = b[sortConfig.key] ?? '';
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return sortConfig.direction === 'asc' ? an - bn : bn - an;
        return sortConfig.direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return r;
  }, [reportRows, searchTerm, stepFilter, sortConfig]);

  const stepCounts = useMemo(() => {
    const counts = {};
    reportRows.forEach(r => { counts[r.step] = (counts[r.step] || 0) + 1; });
    return counts;
  }, [reportRows]);

  const reqSort = (k) => setSortConfig(p => ({ key: k, direction: p.key === k && p.direction === 'asc' ? 'desc' : 'asc' }));
  const SI = ({ k }) => <span className="flex flex-col ml-1"><ChevronUp size={9} className={sortConfig.key === k && sortConfig.direction === 'asc' ? 'text-orange-500' : 'text-gray-300'} /><ChevronDown size={9} className={sortConfig.key === k && sortConfig.direction === 'desc' ? 'text-orange-500' : 'text-gray-300'} /></span>;

  const COLS = [
    { key: 'indent_number', label: 'Indent No' },
    { key: 'product_name', label: 'Product' },
    { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'delivered_qty', label: 'Delivered', align: 'right' },
    { key: 'pending_qty', label: 'Pending', align: 'right' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'rate', label: 'Rate', align: 'right' },
    { key: 'vs_date', label: 'VS Date', align: 'center' },
    { key: 'va_date', label: 'VA Date', align: 'center' },
    { key: 'del_date', label: 'Del. Date', align: 'center' },
    { key: 'stepLabel', label: 'Current Stage', align: 'center' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Pipeline Summary Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setStepFilter('')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-all ${!stepFilter ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          All <span className="text-xs font-black px-1.5 py-0.5 bg-white/20 rounded">{reportRows.length}</span>
        </button>
        {STEPS.map(s => (
          <button key={s.key} onClick={() => setStepFilter(stepFilter === s.key ? '' : s.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-all ${stepFilter === s.key ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label.split('(')[0].trim()} <span className="text-xs font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{stepCounts[s.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">PC Report — Purchase Pipeline</h2>
          <div className="flex items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-200"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {COLS.map(col => (
                  <th key={col.key} className={`px-4 py-3.5 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`} onClick={() => reqSort(col.key)}>
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}<SI k={col.key} /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS /> : filtered.length === 0 ? (
                <tr><td colSpan={COLS.length} className="py-16 text-center">
                  <AlertCircle size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400 font-semibold">No pipeline data found.</p>
                </td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-orange-50/20 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-900">{row.indent_number}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{row.product_name}</td>
                  <td className="px-4 py-3 text-right font-bold text-orange-600">{row.qty}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">{row.delivered_qty}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${row.pending_qty > 0 ? 'text-red-500' : 'text-green-500'}`}>{row.pending_qty}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{row.vendor_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.rate !== '—' ? `₹${row.rate}` : '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{row.vs_date}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{row.va_date}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{row.del_date}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${row.stepColor}`}>{row.stepLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400 font-semibold">
          Showing {filtered.length} of {reportRows.length} indents
        </div>
      </div>
    </div>
  );
};

export default PurPcReport;
