import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Package, Save, CheckSquare, History, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import SearchableDropdown from '../../components/SearchableDropdown';

const TS = ({ cols = 8 }) => <>{[...Array(4)].map((_, i) => (
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

const STATUS_OPTS = ['In Transit', 'AT TPT GDN', 'Arrived'];

const PurArrival = () => {
  const { user } = useAuthStore();
  const [deliveries, setDeliveries] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [activeTab, setActiveTab] = useState('active'); // active | history

  // Filters state
  const [filterLiftNo, setFilterLiftNo] = useState('');
  const [filterProd, setFilterProd] = useState('');
  const [filterTrans, setFilterTrans] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Editable rows state
  const [editData, setEditData] = useState({});
  const [products, setProducts] = useState([]);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [delRes, godRes, prodRes] = await Promise.all([
        supabase.from('purchase_delivery').select('*, purchase_indent(qty_kg)').order('created_at', { ascending: false }),
        supabase.from('godowns').select('id, godown_id, name').eq('is_active', true).order('name'),
        supabase.from('products').select('name, mux')
      ]);
      
      if (delRes.error) throw delRes.error;
      setDeliveries(delRes.data || []);
      setGodowns(godRes.data || []);
      setProducts(prodRes.data || []);

      const initialEdit = {};
      delRes.data?.forEach(d => {
        initialEdit[d.id] = {
          checked: false,
          vehicle_number: d.vehicle_number || '',
          delivery_date: d.delivery_date || '',
          received_qty_kg: d.received_qty_kg || '',
          received_qty_bags: d.received_qty_bags || '',
          godown_name: d.godown_name || '',
          remarks: d.remarks || '', 
          arrival_status: d.arrival_status || 'In Transit',
          driver_phone: d.driver_phone || '',
          lr_number: d.lr_number || ''
        };
      });
      setEditData(initialEdit);

    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const displayDeliveries = useMemo(() => {
    if (activeTab === 'active') {
      return deliveries.filter(d => d.arrival_status !== 'Arrived');
    } else {
      return deliveries.filter(d => d.arrival_status === 'Arrived');
    }
  }, [deliveries, activeTab]);

  const filteredDeliveries = useMemo(() => {
    return displayDeliveries.filter(d => {
      const matchSearch = Object.values(d).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchLift = !filterLiftNo || d.delivery_number === filterLiftNo;
      const matchProd = !filterProd || d.product_name === filterProd;
      const matchTrans = !filterTrans || d.transporter_name === filterTrans;
      const matchDate = !filterDate || d.delivery_date === filterDate;
      return matchSearch && matchLift && matchProd && matchTrans && matchDate;
    });
  }, [displayDeliveries, searchTerm, filterLiftNo, filterProd, filterTrans, filterDate]);

  const updateEditRow = (id, field, value) => {
    setEditData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleBagsChange = (id, bags) => {
    const delivery = deliveries.find(d => d.id == id);
    const product = products.find(p => p.name === delivery?.product_name);
    const mux = parseFloat(product?.mux) || 0;
    const kg = bags * mux;
    setEditData(prev => ({
      ...prev,
      [id]: { 
        ...prev[id], 
        received_qty_bags: bags,
        received_qty_kg: kg > 0 ? kg.toFixed(2) : ''
      }
    }));
  };

  const handleKgChange = (id, kg) => {
    const delivery = deliveries.find(d => d.id == id);
    const product = products.find(p => p.name === delivery?.product_name);
    const mux = parseFloat(product?.mux) || 0;
    const bags = mux > 0 ? Math.round(kg / mux) : 0;
    setEditData(prev => ({
      ...prev,
      [id]: { 
        ...prev[id], 
        received_qty_kg: kg,
        received_qty_bags: bags > 0 ? bags : ''
      }
    }));
  };

  const handleBulkSubmit = async () => {
    const selectedIds = Object.keys(editData).filter(id => editData[id].checked);
    if (selectedIds.length === 0) {
      toast.error('Select at least one record to submit');
      return;
    }

    setSaving(true);
    try {
      for (const id of selectedIds) {
        const row = editData[id];
        const original = deliveries.find(d => d.id == id);
        
        // STOCK SYNCHRONIZATION LOGIC
        if (row.arrival_status === 'Arrived' && original.arrival_status !== 'Arrived') {
          const targetGodown = godowns.find(g => g.name === row.godown_name);
          if (!targetGodown) {
            toast.error(`Godown ${row.godown_name} not found for delivery ${original.delivery_number}`);
            continue;
          }

          // 1. Try to find product in target godown
          let { data: product, error: prodError } = await supabase
            .from('products')
            .select('*')
            .eq('name', original.product_name)
            .eq('godown_id', targetGodown.godown_id)
            .maybeSingle();

          // 2. Fallback: Search global products to auto-create entry
          if (!product || prodError) {
            const { data: globalProd } = await supabase
              .from('products')
              .select('*')
              .eq('name', original.product_name)
              .limit(1)
              .maybeSingle();
            
            if (globalProd) {
              // Generate a new unique product_id for this godown entry
              let newId;
              try {
                const { data: rpcId } = await supabase.rpc('generate_product_id');
                newId = rpcId;
              } catch (e) {
                newId = `PROD-${Date.now().toString().slice(-6)}`;
              }

              // Auto-create product entry for target godown
              const { data: newProd, error: createError } = await supabase
                .from('products')
                .insert([{
                  product_id: newId,
                  name: globalProd.name,
                  description: globalProd.description,
                  unit: globalProd.unit,
                  mux: globalProd.mux,
                  godown_id: targetGodown.godown_id,
                  opening_quantity: 0,
                  closing_quantity: 0,
                  quantity: 0,
                  is_active: true
                }])
                .select().single();
              
              if (!createError) product = newProd;
              else console.error('Product creation failed', createError);
            }
          }

          if (product) {
            const addBags = parseInt(row.received_qty_bags) || 0;
            const addWeight = parseFloat(row.received_qty_kg) || 0;
            const currentStockBags = parseFloat(product.closing_quantity) || 0;
            const currentWeightKg = parseFloat(product.quantity) || 0;
            const newClosingQty = currentStockBags + addBags;
            const newTotalWeight = currentWeightKg + addWeight;

            // Generate unique entry ID
            const entryId = `ARR-${original.delivery_number}`;

            // CHECK FOR EXISTING RECORD TO AVOID 409 CONFLICT
            const { data: existing } = await supabase.from('stock_management').select('id').eq('entry_id', entryId).maybeSingle();
            if (existing) {
              console.log('Stock record already exists for', entryId);
              // If it exists, we just proceed to update the delivery status
            } else {
              // 3. Update Product Master (Live Stock)
              const { error: stockUpError } = await supabase.from('products').update({
                closing_quantity: newClosingQty,
                quantity: newTotalWeight,
                updated_at: new Date().toISOString()
              }).eq('id', product.id);
              if (stockUpError) throw new Error(`Stock Update Failed: ${stockUpError.message}`);

              // 4. Insert Stock Management Record
              const { error: smError } = await supabase.from('stock_management').insert({
                entry_id: entryId,
                product_id: product.product_id,
                godown_id: targetGodown.godown_id,
                transaction_type: 'in',
                quantity: addBags,
                opening_stock: currentStockBags,
                closing_stock: newClosingQty,
                date: new Date().toISOString().split('T')[0],
                reference_number: original.delivery_number,
                notes: `Purchase Arrival: ${original.indent_number} via ${original.transporter_name}`,
                created_by: user?.email,
                from_location: null, // Schema foreign key requires valid godown_id, VENDOR is not one.
                lr_number: row.lr_number
              });
              if (smError) throw new Error(`Stock Management Insert Failed: ${smError.message}`);

              // 5. Add Notification
              await supabase.from('stock_notifications').insert([{
                notification_type: 'stock_in',
                title: 'Purchase Arrival',
                message: `${addBags} units of ${product.name} arrived at ${targetGodown.name}`,
                product_id: product.product_id,
                godown_id: targetGodown.godown_id,
                related_id: entryId
              }]);
            }
          } else {
            throw new Error(`Product ${original.product_name} not found in master list.`);
          }
        }

        // 6. FINALLY UPDATE DELIVERY STATUS (Only if we reached here)
        const { error: updateError } = await supabase.from('purchase_delivery').update({
          vehicle_number: row.vehicle_number,
          delivery_date: row.delivery_date,
          received_qty_kg: parseFloat(row.received_qty_kg) || 0,
          received_qty_bags: parseInt(row.received_qty_bags) || 0,
          godown_name: row.godown_name,
          remarks: row.remarks,
          arrival_status: row.arrival_status,
          driver_phone: row.driver_phone,
          lr_number: row.lr_number
        }).eq('id', parseInt(id));

        if (updateError) throw updateError;
      }

      toast.success('Logistics & Stock synchronized successfully!');
      fetchAll(true);
    } catch (e) {
      toast.error('Sync failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const uniqueLiftNos = useMemo(() => [...new Set(deliveries.map(d => d.delivery_number))].sort(), [deliveries]);
  const uniqueProducts = useMemo(() => [...new Set(deliveries.map(d => d.product_name))].sort(), [deliveries]);
  const uniqueTransporters = useMemo(() => [...new Set(deliveries.map(d => d.transporter_name))].filter(Boolean).sort(), [deliveries]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* ── Sub Tabs ── */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('active')} className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all border ${activeTab === 'active' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <Clock size={16} /> <span className="whitespace-nowrap">Active Aawak</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all border ${activeTab === 'history' ? 'bg-orange-600 text-white border-orange-600 shadow-lg shadow-orange-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>
          <History size={16} /> <span className="whitespace-nowrap">Arrival History</span>
        </button>
      </div>

      {/* ── Header & Filters ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-800 tracking-tight">{activeTab === 'active' ? 'Aawak Details' : 'Arrival History'}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Logistics Tracking & Material Receiving</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search entries..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 transition-all" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs sm:text-sm font-bold hover:bg-gray-100 border border-gray-200 transition-all">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            {activeTab === 'active' && (
              <button onClick={handleBulkSubmit} disabled={saving} className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-orange-600 text-white rounded-lg text-xs sm:text-sm font-black shadow-md shadow-orange-200 hover:bg-orange-700 transition-all disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                <span className="whitespace-nowrap">{saving ? 'Syncing...' : 'Sync with Stock'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-50">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Lifting No</label>
            <SearchableDropdown 
              options={uniqueLiftNos} 
              value={filterLiftNo} 
              onChange={setFilterLiftNo} 
              placeholder="All Lifting Nos" 
              showAll={true} 
              allLabel="All Lifting Nos"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Product</label>
            <SearchableDropdown 
              options={uniqueProducts} 
              value={filterProd} 
              onChange={setFilterProd} 
              placeholder="All Products" 
              showAll={true} 
              allLabel="All Products"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Transporter</label>
            <SearchableDropdown 
              options={uniqueTransporters} 
              value={filterTrans} 
              onChange={setFilterTrans} 
              placeholder="All Transporters" 
              showAll={true} 
              allLabel="All Transporters"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Del. Date</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-orange-500/20 outline-none" />
          </div>
        </div>
      </div>

      {/* ── Main Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
          <table className="w-full text-left border-collapse min-w-[1600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-20">
                {activeTab === 'active' && (
                  <th className="px-4 py-4 text-center w-12">
                    <input type="checkbox" className="w-4 h-4 accent-orange-600 rounded cursor-pointer" 
                      onChange={e => {
                        const checked = e.target.checked;
                        const next = { ...editData };
                        filteredDeliveries.forEach(d => { if (next[d.id]) next[d.id].checked = checked; });
                        setEditData(next);
                      }} />
                  </th>
                )}
                <th className="px-4 py-4">Lifting No</th>
                <th className="px-4 py-4">Indent No</th>
                <th className="px-4 py-4">Product</th>
                <th className="px-4 py-4 text-right">Indent Kg</th>
                <th className="px-4 py-4">Transport</th>
                <th className="px-2 py-4">LR Number</th>
                <th className="px-2 py-4">Driver Number</th>
                <th className="px-2 py-4">Vehicle Number</th>
                <th className="px-2 py-4">Expected Date</th>
                <th className="px-1 py-4 text-right">Recv. Kg</th>
                <th className="px-1 py-4 text-right">Recv. Bags</th>
                <th className="px-2 py-4">Arrival Godown</th>
                <th className="px-2 py-4">Review/Remarks</th>
                <th className="px-4 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={activeTab === 'active' ? 15 : 14} /> : filteredDeliveries.length === 0 ? (
                <tr><td colSpan={15} className="py-24 text-center text-gray-400 font-bold tracking-tight italic">No arrival records found matching your filters.</td></tr>
              ) : filteredDeliveries.map(d => {
                const row = editData[d.id] || {};
                const isSelected = row.checked;
                const isEditable = activeTab === 'active' && isSelected;
                const isDisabled = !isEditable;

                return (
                  <tr key={d.id} className={`hover:bg-orange-50/10 transition-colors ${isSelected ? 'bg-orange-50/40' : ''} group`}>
                    {activeTab === 'active' && (
                      <td className="px-4 py-4 text-center">
                        <input type="checkbox" checked={isSelected} onChange={e => updateEditRow(d.id, 'checked', e.target.checked)} className="w-4 h-4 accent-orange-600 rounded cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-4 font-black text-orange-600 tracking-tighter text-sm">{d.delivery_number}</td>
                    <td className="px-4 py-4 font-black text-gray-400 text-xs">{d.indent_number}</td>
                    <td className="px-4 py-4 font-bold text-gray-800 leading-tight">{d.product_name}</td>
                    <td className="px-4 py-4 text-right font-black text-gray-400 italic">
                      {d.purchase_indent?.qty_kg?.toLocaleString() || '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black text-gray-600 leading-tight">{d.transporter_name || '—'}</div>
                    </td>
                    
                    {/* Editable Fields */}
                    <td className="px-1 py-4">
                      <input type="text" value={row.lr_number || ''} onChange={e => updateEditRow(d.id, 'lr_number', e.target.value)} disabled={isDisabled}
                        className={`w-24 px-2 py-1.5 border border-gray-200 rounded font-bold text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-300 uppercase ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white'}`} placeholder="LR #" />
                    </td>
                    <td className="px-1 py-4">
                      <input type="text" value={row.driver_phone || ''} onChange={e => updateEditRow(d.id, 'driver_phone', e.target.value)} disabled={isDisabled}
                        className={`w-24 px-2 py-1.5 border border-gray-200 rounded font-bold text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-300 ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white'}`} placeholder="Driver #" />
                    </td>
                    <td className="px-1 py-4">
                      <input type="text" value={row.vehicle_number || ''} onChange={e => updateEditRow(d.id, 'vehicle_number', e.target.value)} disabled={isDisabled}
                        className={`w-24 px-2 py-1.5 border border-gray-200 rounded font-bold text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-300 ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white'}`} placeholder="Vehicle #" />
                    </td>
                    <td className="px-1 py-4">
                      <input type="date" value={row.delivery_date || ''} onChange={e => updateEditRow(d.id, 'delivery_date', e.target.value)} disabled={isDisabled}
                        className={`w-[120px] px-2 py-1.5 border border-gray-200 rounded font-bold text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white'}`} />
                    </td>
                    <td className="px-1 py-4 text-right">
                      <input type="number" step="0.01" value={row.received_qty_kg || ''} onChange={e => handleKgChange(d.id, e.target.value)} disabled={isDisabled}
                        className={`w-24 px-2 py-1.5 border border-gray-200 rounded font-black text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-right ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white text-green-600'}`} placeholder="0.00" />
                    </td>
                    <td className="px-1 py-4 text-right">
                      <input type="number" value={row.received_qty_bags || ''} onChange={e => handleBagsChange(d.id, e.target.value)} disabled={isDisabled}
                        className={`w-20 px-2 py-1.5 border border-gray-200 rounded font-black text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-right ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white text-green-600'}`} placeholder="0" />
                    </td>
                    <td className="px-1 py-4">
                      <SearchableDropdown 
                        options={godowns.map(g => g.name)} 
                        value={row.godown_name || ''} 
                        onChange={v => updateEditRow(d.id, 'godown_name', v)} 
                        placeholder="Select Godown" 
                        showAll={false}
                        className={isDisabled ? 'opacity-60 pointer-events-none' : ''}
                      />
                    </td>
                    <td className="px-1 py-4">
                      <input type="text" value={row.remarks || ''} onChange={e => updateEditRow(d.id, 'remarks', e.target.value)} disabled={isDisabled}
                        className={`w-full px-2 py-1.5 border border-gray-200 rounded font-bold text-gray-700 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-300 ${isDisabled ? 'bg-gray-50 border-transparent opacity-60' : 'bg-white'}`} placeholder="Review notes..." />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <select value={row.arrival_status || 'In Transit'} onChange={e => updateEditRow(d.id, 'arrival_status', e.target.value)} disabled={isDisabled}
                        className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border transition-all cursor-pointer ${
                          row.arrival_status === 'Arrived' ? 'bg-green-100 text-green-700 border-green-200' : 
                          row.arrival_status === 'AT TPT GDN' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                          'bg-orange-100 text-orange-700 border-orange-200'
                        } ${isDisabled ? 'opacity-60 grayscale' : ''}`}>
                        {STATUS_OPTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
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

export default PurArrival;
