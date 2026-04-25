import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Package } from 'lucide-react';
import { supabase } from '../../supabase';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

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

const PurArrival = () => {
  const { user } = useAuthStore();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_delivery')
        .select('*')
        .eq('delivery_status', 'Received')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDeliveries(data || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter(d =>
      Object.values(d).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [deliveries, searchTerm]);

  const toggleArrival = async (d) => {
    const newStatus = d.arrival_status === 'Arrived' ? 'Not Arrived' : 'Arrived';
    try {
      await supabase.from('purchase_delivery').update({ arrival_status: newStatus }).eq('id', d.id);
      fetchAll(true);
      toast.success(`Marked as ${newStatus}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const arrivalBadge = (s) => s === 'Arrived'
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">Material Arrival</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search deliveries..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-200">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase font-black text-gray-500 sticky top-0 z-10">
                <th className="px-4 py-3.5">Delivery No</th>
                <th className="px-4 py-3.5">Indent No</th>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-4 py-3.5">Vendor</th>
                <th className="px-4 py-3.5 text-right">Received (kg)</th>
                <th className="px-4 py-3.5 text-right">Bags</th>
                <th className="px-4 py-3.5 text-center">Delivery Date</th>
                <th className="px-4 py-3.5 text-center">Arrival Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? <TS cols={8} /> : filteredDeliveries.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center">
                  <Package size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400 font-semibold">No received deliveries to show.</p>
                </td></tr>
              ) : filteredDeliveries.map(d => (
                <tr key={d.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-orange-600">{d.delivery_number}</td>
                  <td className="px-4 py-3.5 font-bold text-gray-900">{d.indent_number}</td>
                  <td className="px-4 py-3.5 text-gray-700">{d.product_name}</td>
                  <td className="px-4 py-3.5 text-gray-500">{d.vendor_name || '—'}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-gray-800">{d.received_qty_kg ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right text-gray-500">{d.received_qty_bags ?? '—'}</td>
                  <td className="px-4 py-3.5 text-center text-gray-500 text-xs">{d.delivery_date || '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => toggleArrival(d)}
                      className={`text-[10px] font-black px-3 py-1 rounded-full cursor-pointer border shadow-sm transition-colors ${arrivalBadge(d.arrival_status)}`}>
                      {d.arrival_status}
                    </button>
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

export default PurArrival;
