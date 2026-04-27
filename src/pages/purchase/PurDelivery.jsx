import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, ChevronUp, ChevronDown, CheckCircle, Truck, AlertCircle, XCircle, Plus, Save, X, Clock, History, Ban, Weight, Package } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const TS = ({ cols = 6 }) => <>{[...Array(4)].map((_, i) => (
  <tr key={i} className="border-b border-gray-50">
    {[...Array(cols)].map((_, j) => (
      <td key={j} className="px-4 py-4">
        <div className="h-4 bg-gray-100 rounded relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
        </div>
      </td>
    ))}
  </tr>
))}</>;

const genDeliveryNo = async (indent_number) => {
  const { data } = await supabase
    .from('purchase_delivery')
    .select('delivery_number')
    .eq('indent_number', indent_number)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = data?.[0]?.delivery_number;
  const lastNum = last ? parseInt(last.split('-').pop()) : 0;
  return `LN-${String(lastNum + 1).padStart(3, '0')}`;
};

const PurDelivery = () => {
  const { user } = useAuthStore();
  const [indents, setIndents] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [activeTab, setActiveTab] = useState('indents'); // indents | history
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [transporters, setTransporters] = useState([]);

  // Cancel state
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellingIndent, setCancellingIndent] = useState(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelForm, setCancelForm] = useState({ cancelled_qty_kg: '', cancelled_qty_bags: '', reason: '' });

  // Inline forms state
  const [inlineData, setInlineData] = useState({});

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, delRes, prodRes, transRes, canRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_delivery').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('name, mux').eq('is_active', true),
        supabase.from('transporters').select('name').eq('is_active', true).order('name'),
        supabase.from('purchase_indent_cancellations').select('*')
      ]);
      
      if (indRes.error) throw indRes.error;

      const validIndents = (indRes.data || []).filter(i => 
        i.indent_type !== 'Rejected' && (i.vendor_approval === true || i.indent_type === 'Direct')
      );

      setIndents(validIndents);
      setDeliveries(delRes.data || []);
      setProducts(prodRes.data || []);
      setTransporters(transRes.data || []);
      setCancellations(canRes.data || []);

      const initialInline = {};
      validIndents.forEach(ind => {
        // Calculate remaining
        const del = (delRes.data || []).filter(d => d.indent_id === ind.id)
          .reduce((acc, d) => ({ 
            kg: acc.kg + (parseFloat(d.received_qty_kg) || 0), 
            bags: acc.bags + (parseInt(d.received_qty_bags) || 0) 
          }), { kg: 0, bags: 0 });
        
        const can = (canRes.data || []).filter(c => c.indent_number === ind.indent_number)
          .reduce((acc, c) => ({ 
            kg: acc.kg + (parseFloat(c.cancelled_qty_kg) || 0), 
            bags: acc.bags + (parseInt(c.cancelled_qty_bags) || 0) 
          }), { kg: 0, bags: 0 });

        const remKg = Math.max(0, (parseFloat(ind.qty_kg) || 0) - del.kg - can.kg);
        const remBags = Math.max(0, (parseInt(ind.qty_bags) || 0) - del.bags - can.bags);

        initialInline[ind.id] = {
          checked: false,
          received_qty_kg: remKg > 0 ? remKg.toFixed(2) : '',
          received_qty_bags: remBags > 0 ? remBags : '',
          transporter_name: '',
          delivery_date: new Date().toISOString().split('T')[0],
          lr_number: '',
          vehicle_number: '',
          remarks: ''
        };
      });
      setInlineData(initialInline);
      
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deliveredMap = useMemo(() => {
    const map = {};
    deliveries.forEach(d => {
      if (!map[d.indent_id]) map[d.indent_id] = { kg: 0, bags: 0 };
      map[d.indent_id].kg += (parseFloat(d.received_qty_kg) || 0);
      map[d.indent_id].bags += (parseInt(d.received_qty_bags) || 0);
    });
    return map;
  }, [deliveries]);

  const cancelledMap = useMemo(() => {
    const map = {};
    cancellations.forEach(c => {
      if (!map[c.indent_number]) map[c.indent_number] = { kg: 0, bags: 0 };
      map[c.indent_number].kg += (parseFloat(c.cancelled_qty_kg) || 0);
      map[c.indent_number].bags += (parseInt(c.cancelled_qty_bags) || 0);
    });
    return map;
  }, [cancellations]);

  const updateInline = (id, field, value) => {
    setInlineData(prev => {
      const newData = { ...prev[id], [field]: value };
      
      const ind = indents.find(i => i.id == id);
      const product = products.find(p => p.name === ind?.product_name);
      const mux = parseFloat(product?.mux) || 0;

      // Sync KG and Bags
      if (field === 'received_qty_bags') {
        const bags = parseFloat(value) || 0;
        newData.received_qty_kg = bags * mux > 0 ? (bags * mux).toFixed(2) : '';
      } else if (field === 'received_qty_kg') {
        const kg = parseFloat(value) || 0;
        newData.received_qty_bags = mux > 0 ? Math.round(kg / mux) : '';
      }
      
      return { ...prev, [id]: newData };
    });
  };

  const handleBulkSubmit = async () => {
    const selectedIds = Object.keys(inlineData).filter(id => inlineData[id].checked);
    if (selectedIds.length === 0) { toast.error('Select at least one record'); return; }

    for (const id of selectedIds) {
      const d = inlineData[id];
      if (!d.received_qty_kg || !d.transporter_name) {
        toast.error('Qty and Transporter are required for selected rows');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = await Promise.all(selectedIds.map(async id => {
        const ind = indents.find(i => i.id == id);
        const d = inlineData[id];
        const delNo = await genDeliveryNo(ind.indent_number);
        return {
          indent_id: id,
          indent_number: ind.indent_number,
          delivery_number: delNo,
          product_name: ind.product_name,
          godown_name: d.godown_name || ind.godown_name,
          transporter_name: d.transporter_name,
          received_qty_kg: parseFloat(d.received_qty_kg),
          received_qty_bags: parseInt(d.received_qty_bags) || 0,
          delivery_date: d.delivery_date,
          lr_number: d.lr_number,
          vehicle_number: d.vehicle_number,
          remarks: d.remarks,
          arrival_status: 'In Transit'
        };
      }));

      const { error } = await supabase.from('purchase_delivery').insert(payload);
      if (error) throw error;

      toast.success('Deliveries generated successfully!');
      fetchAll(true);
    } catch (e) {
      toast.error('Generation failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBagsChange = (bags) => {
    const product = products.find(p => p.name === cancellingIndent?.product_name);
    const mux = product?.mux || 0;
    const kg = bags * mux;
    setCancelForm(prev => ({
      ...prev,
      cancelled_qty_bags: bags,
      cancelled_qty_kg: kg > 0 ? kg.toFixed(2) : ''
    }));
  };

  const handleCancelKgChange = (kg) => {
    const product = products.find(p => p.name === cancellingIndent?.product_name);
    const mux = product?.mux || 0;
    const bags = mux > 0 ? Math.round(kg / mux) : 0;
    setCancelForm(prev => ({
      ...prev,
      cancelled_qty_kg: kg,
      cancelled_qty_bags: bags > 0 ? bags : ''
    }));
  };

  const handleCancel = async () => {
    if (!cancellingIndent || !cancelForm.cancelled_qty_kg) return;
    setCancelSaving(true);
    try {
      const { error } = await supabase.from('purchase_indent_cancellations').insert({
        indent_number: cancellingIndent.indent_number,
        product_name: cancellingIndent.product_name,
        vendor_name: cancellingIndent.vendor_name,
        original_qty_kg: parseFloat(cancellingIndent.qty_kg),
        original_qty_bags: parseInt(cancellingIndent.qty_bags),
        cancelled_qty_kg: parseFloat(cancelForm.cancelled_qty_kg),
        cancelled_qty_bags: parseInt(cancelForm.cancelled_qty_bags || 0),
        rate: cancellingIndent.rate,
        vendor_approval: cancellingIndent.vendor_approval,
        reason: cancelForm.reason,
        created_by: user?.email,
        cancelled_by: user?.email
      });

      if (error) throw error;
      toast.success('Quantity cancelled successfully');
      setIsCancelOpen(false);
      setCancellingIndent(null);
      setCancelForm({ cancelled_qty_kg: '', cancelled_qty_bags: '', reason: '' });
      fetchAll(true);
    } catch (err) { toast.error('Cancel failed: ' + err.message); }
    finally { setCancelSaving(false); }
  };

  const filteredIndents = useMemo(() => {
    return indents.filter(i => {
      const matchSearch = Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      const del = deliveredMap[i.id] || { kg: 0, bags: 0 };
      const can = cancelledMap[i.indent_number] || { kg: 0, bags: 0 };
      const isDone = (del.kg + can.kg) >= (parseFloat(i.qty_kg) || 0);
      return matchSearch && !isDone;
    });
  }, [indents, searchTerm, deliveredMap, cancelledMap]);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d => 
      Object.values(d).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [deliveries, searchTerm]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* ── Tabs ── */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('indents')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'indents' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <Clock size={16} /> Pending Delivery
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all border ${activeTab === 'history' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <History size={16} /> Delivery History
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">{activeTab === 'indents' ? 'Delivery Planning' : 'Delivery History'}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Manage shipments and transporter assignments</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-64 transition-all" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-all">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            {activeTab === 'indents' && (
              <button onClick={handleBulkSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg text-sm font-black shadow-md shadow-orange-200 hover:bg-orange-700 transition-all disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Create Deliveries' : 'Submit Selected'}
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'indents' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
            <table className="w-full text-left border-collapse min-w-[2400px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                  <th className="px-4 py-4 text-center w-12">
                    <input type="checkbox" className="w-4 h-4 accent-orange-600 rounded cursor-pointer" 
                      onChange={e => {
                        const checked = e.target.checked;
                        const next = { ...inlineData };
                        filteredIndents.forEach(r => { if (next[r.id]) next[r.id].checked = checked; });
                        setInlineData(next);
                      }} />
                  </th>
                  <th className="px-4 py-4">Indent No</th>
                  <th className="px-4 py-4">Product</th>
                  <th className="px-4 py-4">Godown</th>
                  <th className="px-4 py-4">Vendor</th>
                  <th className="px-4 py-4 text-right">Indent KG</th>
                  <th className="px-4 py-4 text-right">Indent Bags</th>
                  <th className="px-4 py-4 text-right text-green-600">Delivered Bags</th>
                  <th className="px-4 py-4 text-right text-red-500">Cancelled Bags</th>
                  <th className="px-4 py-4 text-right text-orange-600">Remaining KG</th>
                  <th className="px-4 py-4 text-right text-orange-600">Remaining Bags</th>
                  <th className="px-2 py-4">Lifting Qty (kg)</th>
                  <th className="px-2 py-4">Lifting Bags</th>
                  <th className="px-2 py-4">Transporter</th>
                  <th className="px-2 py-4">LR Number</th>
                  <th className="px-2 py-4">Vehicle Number</th>
                  <th className="px-2 py-4">Date</th>
                  <th className="px-4 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm font-bold">
                {loading ? <TS cols={18} /> : filteredIndents.length === 0 ? (
                  <tr><td colSpan={18} className="py-24 text-center text-gray-400 font-bold">No pending deliveries found.</td></tr>
                ) : filteredIndents.map(r => {
                  const del = deliveredMap[r.id] || { kg: 0, bags: 0 };
                  const can = cancelledMap[r.indent_number] || { kg: 0, bags: 0 };
                  const row = inlineData[r.id] || { checked: false };
                  const remKg = Math.max(0, (parseFloat(r.qty_kg) || 0) - del.kg - can.kg);
                  const remBags = Math.max(0, (parseInt(r.qty_bags) || 0) - del.bags - can.bags);
                  return (
                    <tr key={r.id} className={`hover:bg-orange-50/10 transition-colors ${row.checked ? 'bg-orange-50/40' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        <input type="checkbox" checked={!!row.checked} onChange={e => setInlineData(prev => ({ ...prev, [r.id]: { ...prev[r.id], checked: e.target.checked } }))} className="w-4 h-4 accent-orange-600 rounded cursor-pointer" />
                      </td>
                      <td className="px-4 py-4 font-black text-gray-800">{r.indent_number}</td>
                      <td className="px-4 py-4 font-black text-gray-700">{r.product_name}</td>
                      <td className="px-4 py-4 text-[10px] text-blue-600 font-black uppercase">{r.godown_name}</td>
                      <td className="px-4 py-4 text-gray-600 text-xs">{r.vendor_name || '—'}</td>
                      <td className="px-4 py-4 text-right font-black text-gray-400">{r.qty_kg?.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-bold text-gray-300">{r.qty_bags}</td>
                      <td className="px-4 py-4 text-right font-bold text-green-400">{del.bags}</td>
                      <td className="px-4 py-4 text-right font-bold text-red-300">{can.bags}</td>
                      <td className="px-4 py-4 text-right font-black text-orange-600">{remKg.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-bold text-orange-400">{remBags}</td>
                      
                      <td className="px-1 py-4">
                        <input type="number" step="0.01" value={row.received_qty_kg || ''} readOnly
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs font-black text-blue-600 bg-gray-50 outline-none text-right" placeholder="0.00" />
                      </td>
                      <td className="px-1 py-4">
                        <input type="number" value={row.received_qty_bags || ''} onChange={e => updateInline(r.id, 'received_qty_bags', e.target.value)} disabled={!row.checked}
                          className="w-16 px-2 py-1.5 border border-gray-200 rounded text-xs font-black text-orange-600 focus:ring-2 focus:ring-orange-300 outline-none text-right disabled:bg-gray-50" placeholder="0" />
                      </td>
                      <td className="px-1 py-4">
                        <select value={row.transporter_name || ''} onChange={e => updateInline(r.id, 'transporter_name', e.target.value)} disabled={!row.checked}
                          className="w-32 px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-2 focus:ring-orange-300 outline-none disabled:bg-gray-50">
                          <option value="">Select TPT</option>
                          {transporters.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-4">
                        <input type="text" value={row.lr_number || ''} onChange={e => updateInline(r.id, 'lr_number', e.target.value)} disabled={!row.checked}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-[10px] focus:ring-2 focus:ring-orange-300 outline-none disabled:bg-gray-50 uppercase font-bold" placeholder="LR #" />
                      </td>
                      <td className="px-1 py-4">
                        <input type="text" value={row.vehicle_number || ''} onChange={e => updateInline(r.id, 'vehicle_number', e.target.value)} disabled={!row.checked}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-[10px] focus:ring-2 focus:ring-orange-300 outline-none disabled:bg-gray-50 font-bold" placeholder="Veh #" />
                      </td>
                      <td className="px-1 py-4">
                        <input type="date" value={row.delivery_date || ''} onChange={e => updateInline(r.id, 'delivery_date', e.target.value)} disabled={!row.checked}
                          className="w-[120px] px-2 py-1.5 border border-gray-200 rounded text-[10px] focus:ring-2 focus:ring-orange-300 outline-none disabled:bg-gray-50" />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button onClick={() => { setCancellingIndent(r); setIsCancelOpen(true); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Cancel Remaining">
                          <Ban size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                  <th className="px-4 py-4">Lifting No</th>
                  <th className="px-4 py-4">Indent No</th>
                  <th className="px-4 py-4">Product</th>
                  <th className="px-4 py-4">Godown</th>
                  <th className="px-4 py-4">Transporter</th>
                  <th className="px-4 py-4 text-right">Qty (kg)</th>
                  <th className="px-4 py-4 text-right">Bags</th>
                  <th className="px-4 py-4">Date</th>
                  <th className="px-4 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm font-bold">
                {loading ? <TS cols={9} /> : filteredDeliveries.length === 0 ? (
                  <tr><td colSpan={9} className="py-24 text-center text-gray-400 font-bold">No delivery history found.</td></tr>
                ) : filteredDeliveries.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4 font-black text-orange-600">{d.delivery_number}</td>
                    <td className="px-4 py-4 font-black text-gray-400 text-xs">{d.indent_number}</td>
                    <td className="px-4 py-4 font-bold text-gray-800">{d.product_name}</td>
                    <td className="px-4 py-4 text-[10px] text-blue-600 font-black uppercase">{d.godown_name}</td>
                    <td className="px-4 py-4 text-gray-600">{d.transporter_name}</td>
                    <td className="px-4 py-4 text-right font-black text-gray-700">{d.received_qty_kg?.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-500">{d.received_qty_bags}</td>
                    <td className="px-4 py-4 text-gray-400 text-xs uppercase font-black">{d.delivery_date}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border shadow-sm ${
                        d.arrival_status === 'Arrived' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                      }`}>
                        {d.arrival_status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {isCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 border border-red-50">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Ban size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight">Quantity Cancellation</h3>
                  <p className="text-red-100 text-[10px] font-bold uppercase tracking-widest">Audit Ref: {cancellingIndent?.indent_number}</p>
                </div>
              </div>
              <button onClick={() => setIsCancelOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors group">
                <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6">
              {/* Product Info Banner */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><Package size={20} /></div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Product</p>
                    <p className="text-sm font-black text-gray-800">{cancellingIndent?.product_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Original Qty</p>
                  <p className="text-sm font-black text-orange-600">{cancellingIndent?.qty_kg?.toLocaleString()} KG</p>
                </div>
              </div>

              {/* Input Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase ml-1">
                    <Package size={14} className="text-red-400" /> Cancel Bags
                  </label>
                  <div className="relative group">
                    <input 
                      type="number" 
                      value={cancelForm.cancelled_qty_bags} 
                      onChange={e => handleCancelBagsChange(e.target.value)}
                      className="w-full pl-5 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-lg font-black text-red-700 focus:ring-4 focus:ring-red-500/10 focus:border-red-400 outline-none transition-all placeholder:text-gray-300" 
                      placeholder="0" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase ml-1">
                    <Weight size={14} className="text-red-400" /> Auto-Calc (Kg)
                  </label>
                  <div className="relative group">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={cancelForm.cancelled_qty_kg} 
                      onChange={e => handleCancelKgChange(e.target.value)}
                      className="w-full pl-5 pr-4 py-4 bg-red-50/50 border border-red-100 rounded-2xl text-lg font-black text-red-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-400 outline-none transition-all" 
                      placeholder="0.00" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-red-300 uppercase bg-white px-2 py-1 rounded-md border border-red-50 shadow-sm">KG</div>
                  </div>
                </div>
              </div>

              {/* Reason Field */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-500 uppercase ml-1">Reason for Cancellation</label>
                <textarea 
                  value={cancelForm.reason} 
                  onChange={e => setCancelForm(p => ({ ...p, reason: e.target.value }))} 
                  rows={3}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-red-500/10 focus:border-red-400 outline-none resize-none transition-all" 
                  placeholder="Provide a detailed reason for audit purposes..." 
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsCancelOpen(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl text-sm font-black hover:bg-gray-200 transition-all">
                  Dismiss
                </button>
                <button 
                  onClick={handleCancel} 
                  disabled={cancelSaving || !cancelForm.cancelled_qty_kg}
                  className="flex-[2] py-4 bg-red-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-red-200 hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:translate-y-0"
                >
                  {cancelSaving ? <RefreshCw size={20} className="animate-spin mx-auto" /> : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurDelivery;
