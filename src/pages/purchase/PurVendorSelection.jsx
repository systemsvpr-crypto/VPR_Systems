import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Save, Search, FileSpreadsheet, Upload, X, Plus, AlertCircle, Clock, History } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown';
import * as XLSX from 'xlsx';

const TableSkeleton = ({ cols = 8 }) => (
  <>{[...Array(5)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(cols)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>
);

const EXCEL_MAP = { 'Indent Number': 'indent_number', 'Planned Date': 'planned_date', 'Actual Date': 'actual_date', 'Vendor Name': 'vendor_name', 'Rate': 'rate', 'Qty (kg)': 'qty_kg', 'Qty (Bags)': 'qty_bags', 'Remarks': 'remarks' };

const PurVendorSelection = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [inlineData, setInlineData] = useState({});
  const [multiSaving, setMultiSaving] = useState(false);
  const [importRows, setImportRows] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('pending'); // pending | history

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, venRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').order('created_at', { ascending: false }),
        supabase.from('master_vendors').select('vendor_name').order('vendor_name')
      ]);
      if (indRes.error) throw indRes.error;
      
      const allIndents = indRes.data || [];
      setRecords(allIndents);
      setVendors(venRes.data?.map(v => v.vendor_name) || []);

      const initialInline = {};
      allIndents.forEach(r => {
        initialInline[r.id] = {
          checked: false,
          vendor_name: '',
          rate: '',
          qty_kg: r.qty_kg || '',
          qty_bags: r.qty_bags || '',
          indent_date: new Date().toISOString().split('T')[0],
          remarks: ''
        };
      });
      setInlineData(initialInline);
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayRecords = useMemo(() => {
    if (activeTab === 'pending') {
      return records.filter(i => i.indent_type === 'Process' && !i.vendor_name);
    } else {
      return records.filter(i => i.indent_type === 'Process' && i.vendor_name);
    }
  }, [records, activeTab]);

  const filtered = useMemo(() => {
    let r = displayRecords.filter(i => Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())));
    if (sortConfig.key) r = [...r].sort((a, b) => {
      const av = a[sortConfig.key] ?? '', bv = b[sortConfig.key] ?? '';
      return sortConfig.direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return r;
  }, [displayRecords, searchTerm, sortConfig]);

  const updateInline = (id, field, value) => {
    setInlineData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleMultiSubmit = async () => {
    const selectedIds = Object.keys(inlineData).filter(id => inlineData[id].checked);
    if (!selectedIds.length) { toast.error('Select at least one indent'); return; }
    
    for (const id of selectedIds) {
      if (!inlineData[id].vendor_name) { toast.error(`Vendor required for ${records.find(r => r.id == id)?.indent_number}`); return; }
    }

    setMultiSaving(true);
    try {
      const promises = selectedIds.map(id => {
        const d = inlineData[id];
        return supabase.from('purchase_indent').update({
          vendor_name: d.vendor_name,
          rate: parseFloat(d.rate) || null,
          qty_kg: parseFloat(d.qty_kg) || null,
          qty_bags: parseInt(d.qty_bags) || null,
          indent_date: d.indent_date,
          remarks: d.remarks || null
        }).eq('id', id);
      });

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length) throw errors[0].error;

      toast.success('Vendor selections saved!');
      fetchAll(true);
    } catch (err) {
      toast.error('Submission failed: ' + err.message);
    } finally {
      setMultiSaving(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const mapped = raw.map(row => { const o = {}; Object.entries(EXCEL_MAP).forEach(([col, field]) => { if (row[col] !== undefined) o[field] = row[col]; }); return o; }).filter(r => r.indent_number);
        if (!mapped.length) { toast.error('No valid rows'); return; }
        setImportRows(mapped);
      } catch (err) { toast.error('Parse error: ' + err.message); }
    };
    reader.readAsBinaryString(file); e.target.value = '';
  };

  const confirmImport = async () => {
    setIsImporting(true);
    try {
      const nums = [...new Set(importRows.map(r => r.indent_number))];
      const { data: indData } = await supabase.from('purchase_indent').select('id, indent_number').in('indent_number', nums);
      const idMap = Object.fromEntries((indData || []).map(i => [i.indent_number, i.id]));
      const payload = importRows.map(r => ({ indent_id: idMap[r.indent_number] || null, indent_number: String(r.indent_number), vendor_name: r.vendor_name || null, rate: parseFloat(r.rate) || null, qty_kg: parseFloat(r.qty_kg) || null, qty_bags: parseInt(r.qty_bags) || null, remarks: r.remarks || null })).filter(r => r.indent_id);
      
      const { error } = await supabase.from('purchase_indent').upsert(payload);
      if (error) throw error;
      toast.success(`${payload.length} rows imported!`);
      setImportRows(null); fetchAll(true);
    } catch (err) { toast.error('Import failed: ' + err.message); }
    finally { setIsImporting(false); }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* ── Tabs ── */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'pending' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <Clock size={16} /> Pending Selection
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'history' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <History size={16} /> Selection History
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">{activeTab === 'pending' ? 'Vendor Selection' : 'Selection History'}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
               {activeTab === 'pending' ? 'Assign vendors and rates to indents' : 'Review indents with assigned vendors'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-64 transition-all" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-colors">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            {activeTab === 'pending' && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors">
                  <FileSpreadsheet size={14} /> Import
                </button>
                <button onClick={handleMultiSubmit} disabled={multiSaving} className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700 shadow-md shadow-orange-200 disabled:opacity-50 transition-all">
                  {multiSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} 
                  {multiSaving ? 'Saving...' : 'Submit Selections'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {importRows && (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 mb-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-emerald-700 flex items-center gap-2"><Upload size={16} /> {importRows.length} rows to import</p>
            <div className="flex gap-2">
              <button onClick={() => setImportRows(null)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmImport} disabled={isImporting} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm">{isImporting ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{isImporting ? 'Importing...' : 'Confirm'}</button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-40 border border-gray-100 rounded-lg"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr>{Object.keys(importRows[0] || {}).map(k => <th key={k} className="px-3 py-2 font-black text-gray-500">{k}</th>)}</tr></thead><tbody>{importRows.slice(0, 10).map((row, i) => <tr key={i} className="border-t border-gray-50">{Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{String(v)}</td>)}</tr>)}</tbody></table></div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {activeTab === 'pending' && <th className="px-4 py-3.5 text-center w-10">
                  <input type="checkbox" className="accent-orange-500 w-4 h-4 cursor-pointer" 
                    onChange={e => {
                      const checked = e.target.checked;
                      const next = { ...inlineData };
                      filtered.forEach(r => { if (next[r.id]) next[r.id].checked = checked; });
                      setInlineData(next);
                    }} />
                </th>}
                <th className="px-4 py-3.5">Indent No</th>
                <th className="px-4 py-3.5">Product & Godown</th>
                <th className="px-4 py-3.5">Vendor</th>
                <th className="px-4 py-3.5 text-right">Rate</th>
                <th className="px-4 py-3.5 text-right">Qty (kg)</th>
                <th className="px-4 py-3.5 text-right">Bags</th>
                <th className="px-4 py-3.5 text-center">Plan Date</th>
                <th className="px-4 py-3.5">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TableSkeleton cols={activeTab === 'pending' ? 9 : 8} /> : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-24 text-center"><AlertCircle size={32} className="mx-auto text-gray-200 mb-2" /><p className="text-sm text-gray-400 font-bold italic tracking-tight">No records found.</p></td></tr>
              ) : filtered.map(r => {
                const d = inlineData[r.id] || {};
                return (
                  <tr key={r.id} className={`hover:bg-orange-50/10 transition-colors ${d.checked ? 'bg-orange-50/40' : ''}`}>
                    {activeTab === 'pending' && <td className="px-4 py-3.5 text-center">
                      <input type="checkbox" checked={d.checked || false} 
                        onChange={e => updateInline(r.id, 'checked', e.target.checked)}
                        className="accent-orange-500 w-4 h-4 cursor-pointer" />
                    </td>}
                    <td className="px-4 py-3.5 font-black text-gray-900 leading-tight">{r.indent_number}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-gray-800 leading-tight">{r.product_name}</div>
                      <div className="text-[10px] font-black text-blue-600 uppercase mt-0.5 tracking-wider">@ {r.godown_name}</div>
                    </td>
                    
                    {activeTab === 'pending' ? (
                      d.checked ? (
                        <>
                          <td className="px-2 py-3.5">
                            <SearchableDropdown 
                              options={vendors} 
                              value={d.vendor_name || ''} 
                              onChange={v => updateInline(r.id, 'vendor_name', v)} 
                              placeholder="Select Vendor" 
                              showAll={false}
                            />
                          </td>
                          <td className="px-2 py-3.5">
                            <input type="number" step="0.01" value={d.rate || ''} onChange={e => updateInline(r.id, 'rate', e.target.value)}
                              className="w-24 px-2 py-1.5 border border-orange-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-300 outline-none text-right" placeholder="0.00" />
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-gray-700">{r.qty_kg || '—'}</td>
                          <td className="px-4 py-3.5 text-right font-bold text-gray-500">{r.qty_bags || '—'}</td>
                          <td className="px-2 py-3.5">
                            <input type="date" value={d.indent_date || ''} onChange={e => updateInline(r.id, 'indent_date', e.target.value)}
                              className="px-2 py-1.5 border border-orange-200 rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-orange-300 outline-none w-full" />
                          </td>
                          <td className="px-2 py-3.5">
                            <input type="text" value={d.remarks || ''} onChange={e => updateInline(r.id, 'remarks', e.target.value)}
                              className="w-full px-2 py-1.5 border border-orange-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-300 outline-none" placeholder="..." />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-gray-300 italic text-[10px] font-medium tracking-wide">Select row to enter...</td>
                          <td className="px-4 py-3.5 text-right text-gray-300">—</td>
                          <td className="px-4 py-3.5 text-right text-gray-700 font-black tracking-tight">{r.qty_kg?.toLocaleString() || '—'}</td>
                          <td className="px-4 py-3.5 text-right text-gray-500 font-bold">{r.qty_bags || '—'}</td>
                          <td className="px-4 py-3.5 text-center text-gray-400 text-[10px] font-black uppercase">{r.indent_date || '—'}</td>
                          <td className="px-4 py-3.5 text-gray-300 italic text-xs">—</td>
                        </>
                      )
                    ) : (
                      <>
                        <td className="px-4 py-3.5 font-black text-blue-600">{r.vendor_name}</td>
                        <td className="px-4 py-3.5 text-right font-black text-orange-600 text-base">₹{parseFloat(r.rate || 0).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-black text-gray-700">{r.qty_kg?.toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-gray-500">{r.qty_bags}</td>
                        <td className="px-4 py-3.5 text-center text-gray-400 font-bold text-xs">{r.indent_date}</td>
                        <td className="px-4 py-3.5 text-gray-500 italic text-xs truncate max-w-[150px]">{r.remarks || '—'}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurVendorSelection;
