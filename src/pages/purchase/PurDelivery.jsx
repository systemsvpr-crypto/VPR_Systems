import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Save, RefreshCw, AlertCircle, ChevronUp, ChevronDown, Search, Truck, XCircle } from 'lucide-react';
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

const EMPTY_FORM = {
  received_qty_kg: '',
  received_qty_bags: '',
  delivery_date: new Date().toISOString().split('T')[0],
  lr_number: '',
  vehicle_number: '',
  remarks: '',
};

const genDeliveryNo = async (indent_number) => {
  const { data } = await supabase
    .from('purchase_delivery')
    .select('delivery_number')
    .eq('indent_number', indent_number)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = data?.[0]?.delivery_number;
  const lastNum = last ? parseInt(last.split('-').pop()) : 0;
  return `DLV-${String(lastNum + 1).padStart(3, '0')}`;
};

const PurDelivery = () => {
  const { user } = useAuthStore();
  const [indents, setIndents] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState('indents'); // 'indents' | 'deliveries'

  // Cancel state
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellingIndent, setCancellingIndent] = useState(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelForm, setCancelForm] = useState({ cancelled_qty_kg: '', cancelled_qty_bags: '', reason: '' });

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [indRes, delRes] = await Promise.all([
        supabase.from('purchase_indent').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_delivery').select('*').order('created_at', { ascending: false }),
      ]);
      if (indRes.error) throw indRes.error;
      setIndents(indRes.data || []);
      setDeliveries(delRes.data || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const reqSort = k => setSort(p => ({ key: k, dir: p.key === k && p.dir === 'asc' ? 'desc' : 'asc' }));
  const SI = ({ k }) => <span className="flex flex-col ml-1">
    <ChevronUp size={9} className={sort.key === k && sort.dir === 'asc' ? 'text-orange-500' : 'text-gray-300'} />
    <ChevronDown size={9} className={sort.key === k && sort.dir === 'desc' ? 'text-orange-500' : 'text-gray-300'} />
  </span>;

  // Compute delivered qty per indent
  const deliveredMap = useMemo(() => {
    const map = {};
    deliveries.forEach(d => {
      if (d.delivery_status !== 'Cancelled') {
        map[d.indent_id] = (map[d.indent_id] || 0) + (parseFloat(d.received_qty_kg) || 0);
      }
    });
    return map;
  }, [deliveries]);

  const filteredIndents = useMemo(() => {
    let r = indents.filter(i =>
      Object.values(i).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
    if (sort.key) r = [...r].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return r;
  }, [indents, searchTerm, sort]);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d =>
      Object.values(d).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [deliveries, searchTerm]);

  const openDelivery = (indent) => {
    setSelectedIndent(indent);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.received_qty_kg && !form.received_qty_bags) {
      toast.error('Enter received quantity'); return;
    }
    setSaving(true);
    try {
      const deliveryNo = await genDeliveryNo(selectedIndent.indent_number);
      const totalQty = parseFloat(selectedIndent.qty_kg) || 0;
      const alreadyDelivered = deliveredMap[selectedIndent.id] || 0;
      const receivedNow = parseFloat(form.received_qty_kg) || 0;
      const remaining = totalQty - alreadyDelivered - receivedNow;

      // Insert this delivery
      const { error } = await supabase.from('purchase_delivery').insert({
        indent_id: selectedIndent.id,
        indent_number: selectedIndent.indent_number,
        delivery_number: deliveryNo,
        product_name: selectedIndent.product_name,
        vendor_name: selectedIndent.vendor_name,
        planned_qty_kg: totalQty - alreadyDelivered,
        received_qty_kg: receivedNow,
        received_qty_bags: parseInt(form.received_qty_bags) || null,
        delivery_date: form.delivery_date || null,
        lr_number: form.lr_number || null,
        vehicle_number: form.vehicle_number || null,
        remarks: form.remarks || null,
        delivery_status: 'Received',
        arrival_status: 'Not Arrived',
        created_by: user?.name || user?.full_name || 'System',
      });
      if (error) throw error;

      // If remaining qty > 0, auto-create a pending split
      if (remaining > 0) {
        const nextNo = `DLV-${String(parseInt(deliveryNo.split('-').pop()) + 1).padStart(3, '0')}`;
        await supabase.from('purchase_delivery').insert({
          indent_id: selectedIndent.id,
          indent_number: selectedIndent.indent_number,
          delivery_number: nextNo,
          product_name: selectedIndent.product_name,
          vendor_name: selectedIndent.vendor_name,
          planned_qty_kg: remaining,
          received_qty_kg: 0,
          delivery_status: 'Pending',
          arrival_status: 'Not Arrived',
          created_by: user?.name || user?.full_name || 'System',
        });
        toast.success(`Delivery saved! Pending split created for ${remaining} kg remaining.`);
      } else {
        toast.success('Delivery fully recorded!');
      }

      setIsOpen(false);
      fetchAll(true);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const cancelDelivery = async (del) => {
    if (!window.confirm('Cancel this delivery record?')) return;
    try {
      await supabase.from('purchase_delivery').update({ delivery_status: 'Cancelled' }).eq('id', del.id);
      const remaining = parseFloat(del.received_qty_kg) || 0;
      if (remaining > 0) {
        const nextNo = await genDeliveryNo(del.indent_number);
        await supabase.from('purchase_delivery').insert({
          indent_id: del.indent_id,
          indent_number: del.indent_number,
          delivery_number: nextNo,
          product_name: del.product_name,
          vendor_name: del.vendor_name,
          planned_qty_kg: remaining,
          received_qty_kg: 0,
          delivery_status: 'Pending',
          arrival_status: 'Not Arrived',
          created_by: user?.name || user?.full_name || 'System',
        });
        toast.success(`Cancelled. New pending split created for ${remaining} kg.`);
      } else {
        toast.success('Cancelled.');
      }
      fetchAll(true);
    } catch (e) { toast.error(e.message); }
  };

  // ── INDENT CANCEL ──────────────────────────────────────────────
  const openCancel = (indent) => {
    setCancellingIndent(indent);
    const delivered = deliveredMap[indent.id] || 0;
    const remaining = (parseFloat(indent.qty_kg) || 0) - delivered;
    setCancelForm({
      cancelled_qty_kg: remaining > 0 ? String(remaining) : String(indent.qty_kg || ''),
      cancelled_qty_bags: indent.qty_bags || '',
      reason: '',
    });
    setIsCancelOpen(true);
  };

  const handleCancelSubmit = async () => {
    if (!cancelForm.reason.trim()) { toast.error('Please enter a reason'); return; }
    if (!cancelForm.cancelled_qty_kg) { toast.error('Enter cancelled quantity'); return; }
    setCancelSaving(true);
    try {
      const { error } = await supabase.from('purchase_indent_cancellations').insert({
        indent_number: cancellingIndent.indent_number,
        product_name: cancellingIndent.product_name,
        vendor_name: cancellingIndent.vendor_name || null,
        original_qty_kg: parseFloat(cancellingIndent.qty_kg) || null,
        original_qty_bags: parseInt(cancellingIndent.qty_bags) || null,
        cancelled_qty_kg: parseFloat(cancelForm.cancelled_qty_kg) || 0,
        cancelled_qty_bags: parseInt(cancelForm.cancelled_qty_bags) || 0,
        rate: parseFloat(cancellingIndent.rate) || null,
        vendor_approval: cancellingIndent.vendor_approval || false,
        reason: cancelForm.reason,
        created_by: cancellingIndent.created_by || null,
        created_at: cancellingIndent.created_at || null,
        cancelled_by: user?.name || user?.full_name || 'System',
        cancelled_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Cancellation recorded!');
      setIsCancelOpen(false);
      fetchAll(true);
    } catch (e) { toast.error(e.message); }
    finally { setCancelSaving(false); }
  };

  const statusBadge = (s) => {
    if (s === 'Received') return 'bg-green-100 text-green-700';
    if (s === 'Cancelled') return 'bg-red-100 text-red-500';
    return 'bg-yellow-100 text-yellow-700';
  };

  const arrivalBadge = (s) => s === 'Arrived'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-500';

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">Delivery</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-200">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Sub Tabs */}
        <div className="flex gap-0 mt-4 border-b border-gray-100 -mb-4">
          {[{ id: 'indents', label: 'Indents' }, { id: 'deliveries', label: 'Delivery Records' }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${activeTab === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* INDENTS TAB */}
      {activeTab === 'indents' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                  {[
                    { k: 'indent_number', l: 'Indent No' },
                    { k: 'product_name', l: 'Product' },
                    { k: 'vendor_name', l: 'Vendor' },
                    { k: 'qty_kg', l: 'Total Qty (kg)', a: 'right' },
                    { k: 'qty_bags', l: 'Bags', a: 'right' },
                    { k: 'rate', l: 'Rate', a: 'right' },
                    { k: 'vendor_approval', l: 'V.Approved', a: 'center' },
                  ].map(col => (
                    <th key={col.k} onClick={() => reqSort(col.k)}
                      className={`px-4 py-3.5 cursor-pointer hover:bg-gray-100 ${col.a === 'right' ? 'text-right' : col.a === 'center' ? 'text-center' : ''}`}>
                      <div className={`flex items-center gap-1 ${col.a === 'right' ? 'justify-end' : col.a === 'center' ? 'justify-center' : ''}`}>
                        {col.l}<SI k={col.k} />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3.5 text-right">Delivered (kg)</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {loading ? <TS cols={9} /> : filteredIndents.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <AlertCircle size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400 font-semibold">No indents found.</p>
                  </td></tr>
                ) : filteredIndents.map(r => {
                  const delivered = deliveredMap[r.id] || 0;
                  const remaining = (parseFloat(r.qty_kg) || 0) - delivered;
                  const isDone = remaining <= 0;
                  return (
                    <tr key={r.id} className="hover:bg-orange-50/20 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-gray-900">{r.indent_number}</td>
                      <td className="px-4 py-3.5 text-gray-700">{r.product_name}</td>
                      <td className="px-4 py-3.5 text-gray-500">{r.vendor_name || '—'}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-800">{r.qty_kg ?? '—'}</td>
                      <td className="px-4 py-3.5 text-right text-gray-500">{r.qty_bags ?? '—'}</td>
                      <td className="px-4 py-3.5 text-right text-gray-500">{r.rate ? `₹${r.rate}` : '—'}</td>
                      <td className="px-4 py-3.5 text-center">
                        {r.vendor_approval
                          ? <span className="text-[10px] font-black px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Yes</span>
                          : <span className="text-[10px] font-black px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">No</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`text-xs font-bold ${isDone ? 'text-green-600' : 'text-orange-600'}`}>
                          {delivered} {!isDone && <span className="text-gray-400 font-normal">/ {remaining} rem</span>}
                          {isDone && ' ✓'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isDone ? (
                            <button onClick={() => openDelivery(r)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 shadow-sm">
                              <Truck size={12} /> Deliver
                            </button>
                          ) : (
                            <span className="text-[10px] font-black px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Done</span>
                          )}
                          <button onClick={() => openCancel(r)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 border border-red-100">
                            <XCircle size={12} /> Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DELIVERY RECORDS TAB */}
      {activeTab === 'deliveries' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                  <th className="px-4 py-3.5">Indent No</th>
                  <th className="px-4 py-3.5">Delivery No</th>
                  <th className="px-4 py-3.5">Product</th>
                  <th className="px-4 py-3.5 text-right">Planned (kg)</th>
                  <th className="px-4 py-3.5 text-right">Received (kg)</th>
                  <th className="px-4 py-3.5 text-right">Bags</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">LR No</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-center">Arrival</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {loading ? <TS cols={11} /> : filteredDeliveries.length === 0 ? (
                  <tr><td colSpan={11} className="py-16 text-center">
                    <AlertCircle size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400 font-semibold">No delivery records yet.</p>
                  </td></tr>
                ) : filteredDeliveries.map(d => (
                  <tr key={d.id} className="hover:bg-orange-50/20 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900">{d.indent_number}</td>
                    <td className="px-4 py-3.5 font-bold text-orange-600">{d.delivery_number}</td>
                    <td className="px-4 py-3.5 text-gray-700">{d.product_name}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500">{d.planned_qty_kg ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-gray-800">{d.received_qty_kg ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500">{d.received_qty_bags ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{d.delivery_date || '—'}</td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">{d.lr_number || '—'}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusBadge(d.delivery_status)}`}>
                        {d.delivery_status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={async () => {
                          const newStatus = d.arrival_status === 'Arrived' ? 'Not Arrived' : 'Arrived';
                          await supabase.from('purchase_delivery').update({ arrival_status: newStatus }).eq('id', d.id);
                          fetchAll(true);
                        }}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full cursor-pointer border ${arrivalBadge(d.arrival_status)}`}>
                        {d.arrival_status}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {d.delivery_status !== 'Cancelled' && (
                        <button onClick={() => cancelDelivery(d)}
                          className="text-[10px] font-black px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-100">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DELIVERY MODAL */}
      {isOpen && selectedIndent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-black text-gray-800">Record Delivery</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="font-bold text-orange-600">{selectedIndent.indent_number}</span>
                  {' · '}{selectedIndent.product_name}
                  {selectedIndent.vendor_name && ` · ${selectedIndent.vendor_name}`}
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Indent summary */}
            <div className="mx-5 mt-4 p-3 bg-orange-50 rounded-lg border border-orange-100 grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p className="text-gray-400 font-bold uppercase">Total Qty</p>
                <p className="font-black text-gray-800 text-base">{selectedIndent.qty_kg ?? 0} kg</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Delivered</p>
                <p className="font-black text-green-600 text-base">{deliveredMap[selectedIndent.id] || 0} kg</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Remaining</p>
                <p className="font-black text-orange-600 text-base">
                  {((parseFloat(selectedIndent.qty_kg) || 0) - (deliveredMap[selectedIndent.id] || 0)).toFixed(2)} kg
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Received Qty (kg) *</label>
                  <input type="number" step="0.01" value={form.received_qty_kg}
                    onChange={e => setForm(p => ({ ...p, received_qty_kg: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Received Bags</label>
                  <input type="number" step="1" value={form.received_qty_bags}
                    onChange={e => setForm(p => ({ ...p, received_qty_bags: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="0" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Delivery Date</label>
                  <input type="date" value={form.delivery_date}
                    onChange={e => setForm(p => ({ ...p, delivery_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">LR Number</label>
                  <input type="text" value={form.lr_number}
                    onChange={e => setForm(p => ({ ...p, lr_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="LR-..." />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Vehicle No</label>
                  <input type="text" value={form.vehicle_number}
                    onChange={e => setForm(p => ({ ...p, vehicle_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="GJ-01..." />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Remarks</label>
                  <input type="text" value={form.remarks}
                    onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="Optional..." />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:underline">Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg font-bold text-sm hover:bg-orange-600 shadow-md disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Record Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCEL MODAL ── */}
      {isCancelOpen && cancellingIndent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-black text-red-600">Cancel Indent</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="font-bold text-orange-600">{cancellingIndent.indent_number}</span>
                  {' · '}{cancellingIndent.product_name}
                </p>
              </div>
              <button onClick={() => setIsCancelOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            <div className="mx-5 mt-4 p-3 bg-red-50 rounded-lg border border-red-100 grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p className="text-gray-400 font-bold uppercase">Original Qty</p>
                <p className="font-black text-gray-800 text-base">{cancellingIndent.qty_kg ?? 0} kg</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Delivered</p>
                <p className="font-black text-green-600 text-base">{deliveredMap[cancellingIndent.id] || 0} kg</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Remaining</p>
                <p className="font-black text-red-500 text-base">
                  {((parseFloat(cancellingIndent.qty_kg) || 0) - (deliveredMap[cancellingIndent.id] || 0)).toFixed(2)} kg
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Cancelled Qty (kg) *</label>
                  <input type="number" step="0.01" value={cancelForm.cancelled_qty_kg}
                    onChange={e => setCancelForm(p => ({ ...p, cancelled_qty_kg: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Cancelled Bags</label>
                  <input type="number" step="1" value={cancelForm.cancelled_qty_bags}
                    onChange={e => setCancelForm(p => ({ ...p, cancelled_qty_bags: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    placeholder="0" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase">Reason *</label>
                <textarea value={cancelForm.reason}
                  onChange={e => setCancelForm(p => ({ ...p, reason: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                  placeholder="Enter reason for cancellation..." />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setIsCancelOpen(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:underline">Back</button>
              <button onClick={handleCancelSubmit} disabled={cancelSaving}
                className="flex items-center gap-2 px-6 py-2 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600 shadow-md disabled:opacity-50">
                {cancelSaving ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                {cancelSaving ? 'Saving...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurDelivery;
