import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Save, Trash2, Search, RefreshCw, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown';

const TS = () => <>{[...Array(5)].map((_, i) => (
  <tr key={i} className="border-b border-gray-50">
    {[...Array(9)].map((_, j) => (
      <td key={j} className="px-4 py-4">
        <div className="h-4 bg-gray-100 rounded relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
        </div>
      </td>
    ))}
  </tr>
))}</>;

const EMPTY_ITEM = { product_name: '', qty_kg: '', qty_bags: '', rate: '' };
const EMPTY_HEADER = { indent_type: 'Direct', indent_date: new Date().toISOString().split('T')[0], vendor_name: '', godown_name: '', vendor_approval: false, remarks: '' };

const genIndentNo = async () => {
  const { data } = await supabase
    .from('purchase_indent')
    .select('indent_number')
    .order('created_at', { ascending: false })
    .limit(10); // Check recent few to find a matching pattern

  const recent = data || [];
  const lastMatch = recent.find(i => {
    const num = i.indent_number.replace('IND-', '');
    return i.indent_number.startsWith('IND-') && num.length <= 4 && !isNaN(parseInt(num));
  });

  if (!lastMatch) return 'IND-001';
  
  const lastNum = parseInt(lastMatch.indent_number.replace('IND-', ''), 10);
  const nextNum = (lastNum + 1).toString().padStart(3, '0');
  return `IND-${nextNum}`;
};

const PurIndent = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [indentNo, setIndentNo] = useState('');
  
  const [header, setHeader] = useState({ ...EMPTY_HEADER });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [godowns, setGodowns] = useState([]);

  const fetchRecords = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase.from('purchase_indent').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRecords(data || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchMasters = useCallback(async () => {
    try {
      const [p, v, g] = await Promise.all([
        supabase.from('products').select('name, mux').eq('is_active', true).order('name'),
        supabase.from('master_vendors').select('vendor_name').order('vendor_name'),
        supabase.from('godowns').select('godown_id, name').eq('is_active', true).order('name'),
      ]);
      
      if (p.error) throw p.error;
      if (v.error) throw v.error;
      if (g.error) throw g.error;

      const rawProds = p.data || [];
      const unique = [];
      const seen = new Set();
      rawProds.forEach(item => {
        if (item.name && !seen.has(item.name)) {
          seen.add(item.name);
          unique.push(item);
        }
      });
      setProducts(unique);
      setVendors(v.data?.map(i => i.vendor_name) || []);
      setGodowns(g.data || []);
    } catch (err) {
      console.error('fetchMasters error:', err);
      toast.error('Failed to load products/vendors: ' + err.message);
    }
  }, []);

  useEffect(() => { fetchRecords(); fetchMasters(); }, [fetchRecords, fetchMasters]);

  const filtered = useMemo(() => {
    let r = records.filter(i => Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())));
    if (sort.key) r = [...r].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return r;
  }, [records, searchTerm, sort]);

  const reqSort = k => setSort(p => ({ key: k, dir: p.key === k && p.dir === 'asc' ? 'desc' : 'asc' }));
  const SI = ({ k }) => <span className="flex flex-col ml-1">
    <ChevronUp size={9} className={sort.key === k && sort.dir === 'asc' ? 'text-orange-500' : 'text-gray-300'} />
    <ChevronDown size={9} className={sort.key === k && sort.dir === 'desc' ? 'text-orange-500' : 'text-gray-300'} />
  </span>;

  const updateItem = (i, f, v) => { 
    const n = [...items]; 
    n[i] = { ...n[i], [f]: v }; 
    if (f === 'qty_bags' || f === 'product_name') {
      const p = products.find(prod => prod.name === n[i].product_name);
      const mux = parseFloat(p?.mux) || 0;
      const bags = parseFloat(n[i].qty_bags) || 0;
      if (mux > 0 && bags > 0) {
        n[i].qty_kg = (bags * mux).toFixed(2);
      }
    }
    setItems(n); 
  };

  const openAdd = async () => { 
    setEditId(null); 
    setIndentNo(await genIndentNo()); 
    setHeader({ ...EMPTY_HEADER });
    setItems([{ ...EMPTY_ITEM }]); 
    setIsOpen(true); 
  };

  const openEdit = r => {
    setEditId(r.id);
    setIndentNo(r.indent_number);
    setHeader({
      indent_type: r.indent_type || 'Direct',
      indent_date: r.indent_date || new Date().toISOString().split('T')[0],
      vendor_name: r.vendor_name || '',
      godown_name: r.godown_name || '',
      vendor_approval: r.vendor_approval || false,
      remarks: r.remarks || ''
    });
    setItems([{ 
      product_name: r.product_name || '', 
      qty_kg: r.qty_kg ?? '', 
      qty_bags: r.qty_bags ?? '', 
      rate: r.rate ?? '' 
    }]);
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    const valid = items.filter(i => i.product_name);
    if (!valid.length) { toast.error('Add at least one product'); return; }
    setSaving(true);
    try {
      if (editId) {
        const i = valid[0];
        const { error } = await supabase.from('purchase_indent').update({
          indent_number: indentNo, 
          indent_type: header.indent_type,
          indent_date: header.indent_date || null,
          vendor_name: header.indent_type === 'Process' ? null : (header.vendor_name || null),
          vendor_approval: header.indent_type === 'Direct',
          remarks: header.indent_type === 'Process' ? null : (header.remarks || null),
          product_name: i.product_name, 
          qty_kg: parseFloat(i.qty_kg) || null, 
          qty_bags: parseInt(i.qty_bags) || null,
          rate: header.indent_type === 'Process' ? null : (parseFloat(i.rate) || null),
        }).eq('id', editId);
        if (error) throw error;
      } else {
        const payload = valid.map(i => ({
          indent_number: indentNo, 
          indent_type: header.indent_type,
          indent_date: header.indent_date || null,
          vendor_name: header.indent_type === 'Process' ? null : (header.vendor_name || null),
          godown_name: header.godown_name || null,
          vendor_approval: header.indent_type === 'Direct',
          remarks: header.indent_type === 'Process' ? null : (header.remarks || null),
          product_name: i.product_name, 
          qty_kg: parseFloat(i.qty_kg) || null, 
          qty_bags: parseInt(i.qty_bags) || null,
          rate: header.indent_type === 'Process' ? null : (parseFloat(i.rate) || null), 
          created_by: user?.name || user?.full_name || 'System',
        }));
        const { error } = await supabase.from('purchase_indent').insert(payload);
        if (error) throw error;
      }
      toast.success(editId ? 'Updated!' : `${valid.length} indent(s) saved!`);
      setIsOpen(false); fetchRecords(true);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this record?')) return;
    const { error } = await supabase.from('purchase_indent').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted'); fetchRecords(true);
  };

  const COLS = [
    { key: 'indent_number', label: 'Indent No' },
    { key: 'indent_type', label: 'Type' },
    { key: 'indent_date', label: 'Date', align: 'center' },
    { key: 'product_name', label: 'Product' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'qty_kg', label: 'Qty (kg)', align: 'right' },
    { key: 'qty_bags', label: 'Bags', align: 'right' },
    { key: 'rate', label: 'Rate', align: 'right' },
    { key: 'vendor_approval', label: 'Approved', align: 'center' },
    { key: 'created_by', label: 'By' },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">Purchase Indent</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <button onClick={() => fetchRecords(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-200">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 shadow-md shadow-orange-200">
              <Plus size={14} /> New Indent
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                {COLS.map(col => (
                  <th key={col.key} onClick={() => reqSort(col.key)}
                    className={`px-4 py-3.5 cursor-pointer hover:bg-gray-100 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}>
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      {col.label}<SI k={col.key} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS /> : filtered.length === 0 ? (
                <tr><td colSpan={COLS.length + 1} className="py-16 text-center">
                  <AlertCircle size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400 font-semibold">No indent records yet.</p>
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-orange-50/20 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-gray-900">{r.indent_number}</td>
                  <td className="px-4 py-3.5 text-gray-700 font-semibold">{r.indent_type || 'Direct'}</td>
                  <td className="px-4 py-3.5 text-center text-gray-500 text-xs">{r.indent_date || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-700">{r.product_name}</td>
                  <td className="px-4 py-3.5 font-semibold text-gray-700">{r.vendor_name || '—'}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-orange-600">{r.qty_kg ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right text-gray-600">{r.qty_bags ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right text-gray-600">{r.rate ? `₹${r.rate}` : '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    {r.vendor_approval
                      ? <span className="text-[10px] font-black px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Yes</span>
                      : <span className="text-[10px] font-black px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">No</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs">{r.created_by || '—'}</td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"><Save size={14} /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-black text-gray-800">{editId ? 'Edit' : 'New'} Purchase Indent</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Indent No: <span className="font-bold text-orange-600">{indentNo}</span>
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Header Details */}
              <div className="p-4 border border-gray-100 rounded-xl bg-gray-50/40">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Indent Info</h4>
                  <div className="flex bg-gray-200/50 p-1 rounded-lg">
                    <button type="button" onClick={() => setHeader({ ...header, indent_type: 'Direct' })} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${header.indent_type === 'Direct' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Direct</button>
                    <button type="button" onClick={() => setHeader({ ...header, indent_type: 'Process' })} className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${header.indent_type === 'Process' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Process</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Indent Date *</label>
                    <input type="date" value={header.indent_date} onChange={e => setHeader({...header, indent_date: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Godown Name *</label>
                    <SearchableDropdown options={godowns.map(g => g.name)} value={header.godown_name}
                      onChange={v => setHeader({...header, godown_name: v})} placeholder="Select godown..." showAll={false} />
                  </div>
                  {header.indent_type === 'Direct' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Vendor Name</label>
                      <SearchableDropdown options={vendors} value={header.vendor_name}
                        onChange={v => setHeader({...header, vendor_name: v})} placeholder="Select vendor..." showAll={false} />
                    </div>
                  ) : (
                    <div className="hidden md:block" /> // Empty space for balance
                  )}
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Remarks</label>
                    <input type="text" value={header.remarks} onChange={e => setHeader({...header, remarks: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="Optional remarks..." />
                  </div>
                </div>
              </div>

              {/* Items Section */}

              {/* Product Details */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Details</h4>
                {items.map((item, idx) => {
                  const availableProducts = products.filter(p => 
                    !items.some((it, i) => i !== idx && it.product_name === p.name)
                  );
                  return (
                  <div key={idx} className="p-4 border border-gray-100 rounded-xl bg-gray-50/40 relative">
                    {items.length > 1 && !editId && (
                      <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 rounded bg-white border border-gray-200 shadow-sm">
                        <X size={14} />
                      </button>
                    )}
                    <div className={`grid grid-cols-1 ${header.indent_type === 'Direct' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
                      {/* Product */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Product Name *</label>
                        <SearchableDropdown options={availableProducts.map(p => p.name)} value={item.product_name}
                          onChange={v => updateItem(idx, 'product_name', v)} placeholder="Search product..." showAll={false} />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Bags *</label>
                        <input type="number" step="1" value={item.qty_bags}
                          onChange={e => updateItem(idx, 'qty_bags', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 shadow-sm"
                          placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Weight (kg) *</label>
                        <input type="number" step="0.01" value={item.qty_kg}
                          onChange={e => updateItem(idx, 'qty_kg', e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 shadow-sm bg-gray-50/50"
                          placeholder="0.00" />
                      </div>

                      {header.indent_type === 'Direct' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Rate (₹)</label>
                          <input type="number" step="0.01" value={item.rate}
                            onChange={e => updateItem(idx, 'rate', e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-orange-50/20"
                            placeholder="0.00" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

                {!editId && (
                  <button onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])} type="button"
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-orange-500 hover:border-orange-300 hover:bg-orange-50/30 transition-all text-xs font-bold uppercase tracking-widest">
                    <Plus size={15} /> Add Another Product
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:underline">Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600 shadow-md disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : editId ? 'Update' : 'Save Indent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurIndent;
