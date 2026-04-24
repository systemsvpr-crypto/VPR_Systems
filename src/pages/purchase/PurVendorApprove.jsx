import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Save, Trash2, Search, ChevronUp, ChevronDown, FileSpreadsheet, Upload, X, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const TS = ({ cols = 8 }) => <>{[...Array(5)].map((_, i) => <tr key={i} className="border-b border-gray-50">{[...Array(cols)].map((_, j) => <td key={j} className="px-4 py-4"><div className="h-4 bg-gray-100 rounded relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" /></div></td>)}</tr>)}</>;

const EXCEL_MAP = { 'Indent Number': 'indent_number', 'Planned Date': 'planned_date', 'Actual Date': 'actual_date', 'Approved Status': 'approved_status', 'Approved Vendor': 'approved_vendor', 'Approved Rate': 'approved_rate', 'Remarks': 'remarks' };
const EMPTY = { indent_id: '', indent_number: '', planned_date: '', actual_date: '', approved_status: 'Pending', approved_vendor: '', approved_rate: '', remarks: '' };
const STATUS_OPTS = ['Pending', 'Approved', 'Rejected'];

const PurVendorApprove = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState([]);
  const [indents, setIndents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [importRows, setImportRows] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef(null);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [recRes, indRes] = await Promise.all([
        supabase.from('purchase_vendor_approvals').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_indents').select('id, indent_number, product_name, status'),
      ]);
      if (recRes.error) throw recRes.error;
      setRecords(recRes.data || []);
      setIndents((indRes.data || []).filter(i => i.status !== 'Canceled'));
    } catch (err) { toast.error('Load failed: ' + err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let r = records.filter(i =>
      Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!statusFilter || i.approved_status === statusFilter)
    );
    if (sortConfig.key) r = [...r].sort((a, b) => {
      const av = a[sortConfig.key] ?? '', bv = b[sortConfig.key] ?? '';
      return sortConfig.direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return r;
  }, [records, searchTerm, statusFilter, sortConfig]);

  const reqSort = (k) => setSortConfig(p => ({ key: k, direction: p.key === k && p.direction === 'asc' ? 'desc' : 'asc' }));
  const SI = ({ k }) => <span className="flex flex-col ml-1"><ChevronUp size={9} className={sortConfig.key === k && sortConfig.direction === 'asc' ? 'text-orange-500' : 'text-gray-300'} /><ChevronDown size={9} className={sortConfig.key === k && sortConfig.direction === 'desc' ? 'text-orange-500' : 'text-gray-300'} /></span>;

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({ indent_id: r.indent_id, indent_number: r.indent_number, planned_date: r.planned_date || '', actual_date: r.actual_date || '', approved_status: r.approved_status || 'Pending', approved_vendor: r.approved_vendor || '', approved_rate: r.approved_rate ?? '', remarks: r.remarks || '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.indent_id) { toast.error('Indent is required'); return; }
    setIsSaving(true);
    try {
      const payload = { indent_id: form.indent_id, indent_number: form.indent_number, planned_date: form.planned_date || null, actual_date: form.actual_date || null, approved_status: form.approved_status, approved_vendor: form.approved_vendor || null, approved_rate: parseFloat(form.approved_rate) || null, remarks: form.remarks || null };
      const { error } = editingId
        ? await supabase.from('purchase_vendor_approvals').update(payload).eq('id', editingId)
        : await supabase.from('purchase_vendor_approvals').insert(payload);
      if (error) throw error;
      toast.success(editingId ? 'Updated!' : 'Saved!');
      setIsModalOpen(false); fetchAll(true);
    } catch (err) { toast.error(err.message); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return;
    const { error } = await supabase.from('purchase_vendor_approvals').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted'); fetchAll(true);
  };

  // Quick-approve directly from table
  const quickApprove = async (r, status) => {
    const { error } = await supabase.from('purchase_vendor_approvals').update({ approved_status: status, actual_date: new Date().toISOString().split('T')[0] }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`); fetchAll(true);
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
      const { data: indData } = await supabase.from('purchase_indents').select('id, indent_number').in('indent_number', nums);
      const idMap = Object.fromEntries((indData || []).map(i => [i.indent_number, i.id]));
      const payload = importRows.map(r => ({ indent_id: idMap[r.indent_number] || null, indent_number: String(r.indent_number), planned_date: r.planned_date || null, actual_date: r.actual_date || null, approved_status: r.approved_status || 'Pending', approved_vendor: r.approved_vendor || null, approved_rate: parseFloat(r.approved_rate) || null, remarks: r.remarks || null })).filter(r => r.indent_id);
      if (!payload.length) { toast.error('No matching indents found'); return; }
      const { error } = await supabase.from('purchase_vendor_approvals').insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} rows imported!`);
      setImportRows(null); fetchAll(true);
    } catch (err) { toast.error('Import failed: ' + err.message); }
    finally { setIsImporting(false); }
  };

  const statusBadge = (s) => {
    if (s === 'Approved') return 'bg-green-100 text-green-700';
    if (s === 'Rejected') return 'bg-red-100 text-red-500';
    return 'bg-yellow-100 text-yellow-700';
  };

  const COLS = [{ key: 'indent_number', label: 'Indent No' }, { key: 'approved_vendor', label: 'Approved Vendor' }, { key: 'approved_rate', label: 'Rate', align: 'right' }, { key: 'approved_status', label: 'Status', align: 'center' }, { key: 'planned_date', label: 'Planned', align: 'center' }, { key: 'actual_date', label: 'Actual', align: 'center' }, { key: 'remarks', label: 'Remarks' }];

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">Vendor Approval</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none">
              <option value="">All Status</option>{STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-200"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-bold hover:bg-emerald-100"><FileSpreadsheet size={14} /> Import Excel</button>
            <button onClick={() => { setEditingId(null); setForm(EMPTY); setIsModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 shadow-md shadow-orange-200"><Plus size={14} /> Add</button>
          </div>
        </div>
      </div>

      {importRows && (
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-emerald-700 flex items-center gap-2"><Upload size={16} /> {importRows.length} rows to import</p>
            <div className="flex gap-2">
              <button onClick={() => setImportRows(null)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg font-bold text-gray-500">Cancel</button>
              <button onClick={confirmImport} disabled={isImporting} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold">{isImporting ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{isImporting ? 'Importing...' : 'Confirm'}</button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-40 border border-gray-100 rounded-lg"><table className="w-full text-xs"><thead className="bg-gray-50 sticky top-0"><tr>{Object.keys(importRows[0] || {}).map(k => <th key={k} className="px-3 py-2 font-black text-gray-500">{k}</th>)}</tr></thead><tbody>{importRows.slice(0, 10).map((row, i) => <tr key={i} className="border-t border-gray-50">{Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{String(v)}</td>)}</tr>)}</tbody></table></div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
              {COLS.map(col => <th key={col.key} className={`px-4 py-3.5 cursor-pointer hover:bg-gray-100 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`} onClick={() => reqSort(col.key)}><div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>{col.label}<SI k={col.key} /></div></th>)}
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={COLS.length + 1} /> : filtered.length === 0 ? (
                <tr><td colSpan={COLS.length + 1} className="py-16 text-center"><AlertCircle size={28} className="mx-auto text-gray-200 mb-2" /><p className="text-sm text-gray-400 font-semibold">No approval records yet.</p></td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-orange-50/20 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-gray-900">{r.indent_number}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-700">{r.approved_vendor || '—'}</td>
                  <td className="px-4 py-3.5 text-right text-orange-600 font-bold">{r.approved_rate ? `₹${r.approved_rate}` : '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusBadge(r.approved_status)}`}>{r.approved_status || 'Pending'}</span>
                      {r.approved_status !== 'Approved' && <button onClick={() => quickApprove(r, 'Approved')} title="Quick Approve" className="text-[10px] font-black px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 ml-1">✓</button>}
                      {r.approved_status !== 'Rejected' && <button onClick={() => quickApprove(r, 'Rejected')} title="Quick Reject" className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-500 hover:bg-red-200">✗</button>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-500 text-xs">{r.planned_date || '—'}</td>
                  <td className="px-4 py-3.5 text-center text-gray-500 text-xs">{r.actual_date || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs truncate max-w-[150px]">{r.remarks || '—'}</td>
                  <td className="px-4 py-3.5 text-right"><div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"><Save size={14} /></button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-black text-gray-800">{editingId ? 'Edit' : 'New'} Vendor Approval</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Indent *</label>
                <select required value={form.indent_id} onChange={e => { const ind = indents.find(i => i.id === e.target.value); setForm(p => ({ ...p, indent_id: ind?.id || '', indent_number: ind?.indent_number || '' })); }} disabled={!!editingId} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-gray-50">
                  <option value="">— Select Indent —</option>{indents.map(i => <option key={i.id} value={i.id}>{i.indent_number} — {i.product_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Approved Vendor</label><input type="text" value={form.approved_vendor} onChange={e => setForm(p => ({ ...p, approved_vendor: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
                <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Approved Rate (₹)</label><input type="number" value={form.approved_rate} onChange={e => setForm(p => ({ ...p, approved_rate: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
                <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Status</label>
                  <select value={form.approved_status} onChange={e => setForm(p => ({ ...p, approved_status: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                    {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Actual Date</label><input type="date" value={form.actual_date} onChange={e => setForm(p => ({ ...p, actual_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
                <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Planned Date</label><input type="date" value={form.planned_date} onChange={e => setForm(p => ({ ...p, planned_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
              </div>
              <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Remarks</label><input type="text" value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:underline">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600 shadow-md">{isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{isSaving ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurVendorApprove;
