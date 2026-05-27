import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ChevronUp, ChevronDown, AlertCircle, Package } from 'lucide-react';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

const TS = () => <>{[...Array(6)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(13)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const STEPS = [
  { key: 'indent', label: 'Indent (Pending VS)', color: 'bg-orange-400' },
  { key: 'vendor_selection', label: 'Vendor Selection (Pending Approval)', color: 'bg-blue-400' },
  { key: 'vendor_approval', label: 'Approved (Pending Delivery)', color: 'bg-yellow-400' },
  { key: 'delivery', label: 'Delivery (In Transit)', color: 'bg-red-400' },
  { key: 'completed', label: 'Arrived (Completed)', color: 'bg-green-500' },
  { key: 'cancelled', label: 'Cancelled', color: 'bg-gray-500' },
];

const PurPcReport = () => {
  const [indents, setIndents] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stepFilter, setStepFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'indent_number', direction: 'asc' });

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, delRes, canRes] = await Promise.all([
        supabase.from('purchase_indent').select('*'),
        supabase.from('purchase_delivery').select('*'),
        supabase.from('purchase_indent_cancellations').select('*'),
      ]);
      if (indRes.error) throw indRes.error;
      setIndents(indRes.data || []);
      setDeliveries(delRes.data || []);
      setCancellations(canRes.data || []);
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Build pipeline report rows
  const reportRows = useMemo(() => {
    const delMap = {};
    deliveries.forEach(d => {
      if (!delMap[d.indent_id]) {
        delMap[d.indent_id] = { kg: 0, bags: 0, last_no: d.delivery_number, last_trans: d.transporter_name, last_godown: d.godown_name, last_status: d.arrival_status, last_date: d.delivery_date || d.created_at, created_at: d.created_at };
      }
      delMap[d.indent_id].kg += parseFloat(d.received_qty_kg) || 0;
      delMap[d.indent_id].bags += parseInt(d.received_qty_bags) || 0;
      if (d.created_at > (delMap[d.indent_id].created_at || '')) {
        delMap[d.indent_id].last_no = d.delivery_number;
        delMap[d.indent_id].last_trans = d.transporter_name;
        delMap[d.indent_id].last_godown = d.godown_name;
        delMap[d.indent_id].last_status = d.arrival_status;
        delMap[d.indent_id].last_date = d.delivery_date || d.created_at;
        delMap[d.indent_id].created_at = d.created_at;
      }
    });

    const canMap = {};
    cancellations.forEach(c => {
      if (!canMap[c.indent_number]) canMap[c.indent_number] = { kg: 0, bags: 0 };
      canMap[c.indent_number].kg += parseFloat(c.cancelled_qty_kg) || 0;
      canMap[c.indent_number].bags += parseInt(c.cancelled_qty_bags) || 0;
    });

    return indents.map(ind => {
      const del = delMap[ind.id];
      const can = canMap[ind.indent_number];

      const delKg = del ? del.kg : 0;
      const delBags = del ? del.bags : 0;
      const canKg = can ? can.kg : 0;
      const canBags = can ? can.bags : 0;

      const totalKg = parseFloat(ind.qty_kg) || 0;
      const totalBags = parseInt(ind.qty_bags) || 0;
      const remKg = Math.max(0, totalKg - delKg - canKg);
      const remBags = Math.max(0, totalBags - delBags - canBags);

      let step, stepLabel, stepColor;

      if (ind.indent_type === 'Rejected') {
        step = 'rejected'; stepLabel = 'Rejected'; stepColor = 'bg-gray-100 text-gray-500';
      } else if (canBags >= totalBags && totalBags > 0) {
        step = 'cancelled'; stepLabel = 'Cancelled'; stepColor = 'bg-gray-200 text-gray-700';
      } else if (del?.last_status === 'Arrived' && remKg <= 0 && remBags <= 0) {
        step = 'completed'; stepLabel = 'Arrived (Completed)'; stepColor = 'bg-green-100 text-green-700';
      } else if (delKg > 0 || delBags > 0) {
        step = 'delivery'; stepLabel = del.last_status || 'In Transit'; stepColor = 'bg-blue-100 text-blue-700';
      } else if (ind.vendor_approval === true || ind.indent_type === 'Direct') {
        step = 'vendor_approval'; stepLabel = 'Approved (Pending DLV)'; stepColor = 'bg-yellow-100 text-yellow-700';
      } else if (ind.vendor_name) {
        step = 'vendor_selection'; stepLabel = 'VS Done (Pending App)'; stepColor = 'bg-indigo-100 text-indigo-700';
      } else {
        step = 'indent'; stepLabel = 'Indent Pending'; stepColor = 'bg-orange-100 text-orange-600';
      }

      return {
        id: ind.id,
        indent_number: ind.indent_number,
        product_name: ind.product_name,
        qty_bags: totalBags,
        qty_kg: totalKg,
        del_bags: delBags,
        del_kg: delKg,
        can_bags: canBags,
        rem_bags: remBags,
        rem_kg: remKg,
        vendor_name: ind.vendor_name || '—',
        rate: ind.rate || '—',
        lifting_no: del?.last_no || '—',
        transporter: del?.last_trans || '—',
        godown: del?.last_godown || ind.godown_name || '—',
        del_date: del?.last_date ? new Date(del.last_date).toLocaleDateString() : '—',
        step,
        stepLabel,
        stepColor,
      };
    });
  }, [indents, deliveries, cancellations]);

  const filtered = useMemo(() => {
    let r = reportRows.filter(row => {
      // Don't show rejected indents in any tab
      if (row.step === 'rejected') return false; 
      
      const matchSearch = Object.values(row).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStep = !stepFilter || row.step === stepFilter;
      return matchSearch && matchStep;
    });

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
    { key: 'qty_bags', label: 'Qty (Bags)', align: 'right' },
    { key: 'del_bags', label: 'Recv (Bags)', align: 'right' },
    { key: 'can_bags', label: 'Cancel (Bags)', align: 'right' },
    { key: 'rem_bags', label: 'Rem (Bags)', align: 'right' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'rate', label: 'Rate', align: 'right' },
    { key: 'lifting_no', label: 'Lifting No' },
    { key: 'transporter', label: 'Transporter' },
    { key: 'godown', label: 'Godown' },
    { key: 'del_date', label: 'Last Activity', align: 'center' },
    { key: 'stepLabel', label: 'Status', align: 'center' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Pipeline Summary Pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStepFilter('')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${!stepFilter ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50 shadow-sm'}`}>
          All Records <span className="text-xs font-black px-2 py-0.5 bg-white/20 rounded-full ml-1">{reportRows.length}</span>
        </button>
        {STEPS.map(s => (
          <button key={s.key} onClick={() => setStepFilter(stepFilter === s.key ? '' : s.key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${stepFilter === s.key ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50 shadow-sm'}`}>
            <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label.split('(')[0].trim()} <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-1">{stepCounts[s.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight text-orange-600">PC Report</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">End-to-End Purchase Analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search pipeline..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 transition-all w-64" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-all">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1500px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {COLS.map(col => (
                  <th key={col.key} className={`px-4 py-4 cursor-pointer hover:bg-gray-100 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`} onClick={() => reqSort(col.key)}>
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}<SI k={col.key} /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS /> : filtered.length === 0 ? (
                <tr><td colSpan={COLS.length} className="py-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle size={32} className="text-gray-200" />
                    <p className="text-sm text-gray-400 font-bold">No matching purchase records found.</p>
                  </div>
                </td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-orange-50/20 transition-colors group">
                  <td className="px-4 py-4 font-black text-gray-900 leading-tight">{row.indent_number}</td>
                  <td className="px-4 py-4">
                    <div className="font-bold text-gray-800 leading-tight">{row.product_name}</div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="font-black text-gray-700">{row.qty_bags?.toLocaleString()}</span>
                    <div className="text-[9px] text-gray-400 font-bold">{row.qty_kg?.toLocaleString()} kg</div>
                  </td>
                  <td className="px-4 py-4 text-right text-green-600 font-black">{row.del_bags?.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right text-red-500 font-black">{row.can_bags?.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-black ${row.rem_bags > 0 ? 'text-red-500' : 'text-green-500'}`}>{row.rem_bags?.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-bold text-gray-600 leading-tight truncate max-w-[150px]">{row.vendor_name}</div>
                  </td>
                  <td className="px-4 py-4 text-right text-gray-700 font-bold">{row.rate !== '—' ? `₹${row.rate}` : '—'}</td>
                  <td className="px-4 py-4">
                    <div className={`text-[11px] font-black tracking-tighter ${row.lifting_no !== '—' ? 'text-orange-600' : 'text-gray-300'}`}>{row.lifting_no}</div>
                  </td>
                  <td className="px-4 py-4 text-gray-500 font-semibold truncate max-w-[120px]">{row.transporter}</td>
                  <td className="px-4 py-4 text-gray-500 font-semibold">{row.godown}</td>
                  <td className="px-4 py-4 text-center text-gray-500 font-bold text-xs">{row.del_date}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full border shadow-sm ${row.stepColor}`}>
                      {row.stepLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
            Showing {filtered.length} of {reportRows.length} Total Indents
          </div>
          <div className="flex items-center gap-4">
             {STEPS.map(s => (
               <div key={s.key} className="flex items-center gap-1.5">
                 <div className={`w-2 h-2 rounded-full ${s.color}`} />
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{s.label.split('(')[0]}</span>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurPcReport;
