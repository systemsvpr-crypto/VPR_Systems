import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Search, RefreshCw, ArrowLeft, ArrowDownCircle, ArrowUpCircle,
  Package, MapPin, FileText, AlertTriangle, CheckCircle, X, Clock, History,
  Layers, Save, ClipboardList, Eye
} from 'lucide-react';
import { stockCorrectionService } from '../services/stockCorrectionService';
import { stockManagementService } from '../services/stockManagementService';
import toast from 'react-hot-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useAuthStore from '../store/authStore';

const TODAY = new Date().toISOString().split('T')[0];

const DailyLedger = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [activeTab, setActiveTab] = useState('summary');

  const [snapshots, setSnapshots] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [products, setProducts] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [filterGodown, setFilterGodown] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  const [correctionPreview, setCorrectionPreview] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [snaps, txns, gds, prods, adjs] = await Promise.all([
        stockCorrectionService.getDailySnapshots(selectedDate),
        stockCorrectionService.getDailyTransactions(selectedDate),
        stockCorrectionService.getGodowns(),
        stockCorrectionService.getProductsByGodown(),
        stockCorrectionService.getAdjustments({ startDate: selectedDate, endDate: selectedDate }),
      ]);
      setSnapshots(snaps);
      setTransactions(txns);
      setGodowns(gds);
      setProducts(prods);
      setAdjustments(adjs);
    } catch (err) {
      console.error('Error fetching daily ledger:', err);
      toast.error('Failed to load daily data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const godownMap = useMemo(() => {
    const m = {};
    godowns.forEach(g => { m[g.godown_id] = g.name; });
    return m;
  }, [godowns]);

  const productMap = useMemo(() => {
    const m = {};
    products.forEach(p => { m[p.product_id] = p; });
    return m;
  }, [products]);

  const filteredSnapshots = useMemo(() => {
    let result = [...snapshots];
    if (filterGodown !== 'all') result = result.filter(s => s.godown_id === filterGodown);
    if (filterProduct !== 'all') result = result.filter(s => s.product_id === filterProduct);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => {
        const prod = productMap[s.product_id];
        return (
          s.product_id?.toLowerCase().includes(term) ||
          prod?.name?.toLowerCase().includes(term)
        );
      });
    }
    return result;
  }, [snapshots, filterGodown, filterProduct, searchTerm, productMap]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];
    if (filterGodown !== 'all') result = result.filter(t => t.godown_id === filterGodown || t.from_location === filterGodown);
    if (filterProduct !== 'all') result = result.filter(t => t.product_id === filterProduct);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t => {
        const prod = productMap[t.product_id];
        return (
          t.entry_id?.toLowerCase().includes(term) ||
          t.product_id?.toLowerCase().includes(term) ||
          prod?.name?.toLowerCase().includes(term) ||
          t.notes?.toLowerCase().includes(term) ||
          t.reference_number?.toLowerCase().includes(term)
        );
      });
    }
    return result;
  }, [transactions, filterGodown, filterProduct, searchTerm, productMap]);

  const summaryTotals = useMemo(() => {
    return {
      opening: snapshots.reduce((s, x) => s + (parseFloat(x.opening_stock) || 0), 0),
      inward: snapshots.reduce((s, x) => s + (parseFloat(x.in_stock) || 0), 0),
      outward: snapshots.reduce((s, x) => s + (parseFloat(x.out_stock) || 0), 0),
      closing: snapshots.reduce((s, x) => s + (parseFloat(x.closing_stock) || 0), 0),
    };
  }, [snapshots]);

  const handleOpenCorrection = (snapshot) => {
    setCorrectionModal(snapshot);
    setCorrectionInput(String(snapshot.closing_stock ?? ''));
    setCorrectionReason('');
    setCorrectionPreview(null);
  };

  const handlePreviewCorrection = () => {
    if (!correctionModal) return;
    const current = parseFloat(correctionModal.closing_stock) || 0;
    const proposed = parseFloat(correctionInput);
    if (isNaN(proposed) || proposed < 0) {
      toast.error('Enter a valid non-negative quantity');
      return;
    }
    const diff = proposed - current;
    setCorrectionPreview({
      current,
      proposed,
      diff,
      productName: productMap[correctionModal.product_id]?.name || correctionModal.product_id,
      godownName: godownMap[correctionModal.godown_id] || correctionModal.godown_id,
    });
  };

  const handleSaveCorrection = async () => {
    if (!correctionModal || !correctionReason.trim()) {
      toast.error('Please provide a reason for the correction');
      return;
    }
    const proposed = parseFloat(correctionInput);
    if (isNaN(proposed) || proposed < 0) {
      toast.error('Enter a valid non-negative quantity');
      return;
    }

    setSavingCorrection(true);
    try {
      await stockCorrectionService.correctStock(
        correctionModal.date,
        correctionModal.product_id,
        correctionModal.godown_id,
        proposed,
        correctionReason.trim(),
        user?.full_name || user?.username || 'system'
      );

      toast.success('Stock corrected successfully! All subsequent days have been updated.');
      setCorrectionModal(null);
      setCorrectionPreview(null);
      fetchData();
    } catch (err) {
      console.error('Correction failed:', err);
      toast.error(`Correction failed: ${err.message}`);
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all text-slate-600" title="Go Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="text-primary" size={20} />
              Daily Stock Ledger
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-0.5">
              View transactions, summaries, and correct past stock
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border border-slate-200 transition-all disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto pb-24">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date</label>
              <DatePicker
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-[180px]"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Godown</label>
              <select
                value={filterGodown}
                onChange={(e) => setFilterGodown(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
              >
                <option value="all">All Godowns</option>
                {godowns.map(g => (
                  <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Product</label>
              <select
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
              >
                <option value="all">All Products</option>
                {products.map(p => (
                  <option key={p.product_id} value={p.product_id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex-[2] min-w-[200px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search product, ID, notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 bg-white border-slate-200 rounded-lg text-sm font-medium w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-primary" size={28} />
            <p className="text-sm font-semibold text-slate-500">Loading ledger data...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Opening Stock" value={summaryTotals.opening} color="blue" />
              <SummaryCard label="Stock In (Today)" value={summaryTotals.inward} color="emerald" />
              <SummaryCard label="Stock Out (Today)" value={summaryTotals.outward} color="rose" />
              <SummaryCard label="Closing Stock" value={summaryTotals.closing} color="slate" />
            </div>

            <div className="flex items-center gap-2 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 w-fit">
              {[
                { id: 'summary', label: 'Daily Summary', icon: Layers },
                { id: 'transactions', label: 'Transactions', icon: FileText },
                { id: 'corrections', label: 'Corrections', icon: History },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-2",
                    activeTab === tab.id
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                  )}
                >
                  <tab.icon size={14} />
                  {tab.label}
                  {tab.id === 'corrections' && adjustments.length > 0 && (
                    <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{adjustments.length}</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'summary' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                        <th className="px-4 py-3 whitespace-nowrap">Product</th>
                        <th className="px-4 py-3 whitespace-nowrap">Godown</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Opening</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">In</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Out</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Closing</th>
                        <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredSnapshots.length === 0 ? (
                        <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-400">No summary data for this date.</td></tr>
                      ) : (
                        filteredSnapshots.map((s, i) => {
                          const prod = productMap[s.product_id];
                          return (
                            <tr key={s.id || i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <span className="font-semibold text-slate-800">{prod?.name || s.product_id}</span>
                                <span className="text-[10px] text-slate-400 font-mono ml-2">({s.product_id})</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-slate-600">{godownMap[s.godown_id] || s.godown_id}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">{parseFloat(s.opening_stock).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">+{parseFloat(s.in_stock).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono text-rose-600 font-semibold">-{parseFloat(s.out_stock).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{parseFloat(s.closing_stock).toLocaleString()}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleOpenCorrection(s)}
                                  className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 transition-all"
                                  title="Correct this entry"
                                >
                                  Correct
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                      {filteredSnapshots.length > 0 && (
                        <tr className="bg-slate-100 font-bold text-sm">
                          <td colSpan="2" className="px-4 py-3 text-slate-700">TOTAL</td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {filteredSnapshots.reduce((s, x) => s + (parseFloat(x.opening_stock) || 0), 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700">
                            +{filteredSnapshots.reduce((s, x) => s + (parseFloat(x.in_stock) || 0), 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-rose-700">
                            -{filteredSnapshots.reduce((s, x) => s + (parseFloat(x.out_stock) || 0), 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-900">
                            {filteredSnapshots.reduce((s, x) => s + (parseFloat(x.closing_stock) || 0), 0).toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                        <th className="px-4 py-3 whitespace-nowrap">Entry ID</th>
                        <th className="px-4 py-3 whitespace-nowrap">Product</th>
                        <th className="px-4 py-3 whitespace-nowrap">Type</th>
                        <th className="px-4 py-3 whitespace-nowrap">From / To</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Quantity</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Opening</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Closing</th>
                        <th className="px-4 py-3 whitespace-nowrap">Reference / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredTransactions.length === 0 ? (
                        <tr><td colSpan="8" className="px-4 py-12 text-center text-slate-400">No transactions for this date.</td></tr>
                      ) : (
                        filteredTransactions.map((t, i) => {
                          const prod = productMap[t.product_id];
                          const isTransfer = t.from_location && t.transaction_type === 'in';
                          const isSrcEntry = t.entry_id?.endsWith('-SRC');
                          const isAdjustment = t.entry_id?.startsWith('ADJ-');
                          return (
                            <tr key={t.entry_id || i} className={cn(
                              "hover:bg-slate-50 transition-colors",
                              isSrcEntry && "opacity-60 bg-slate-50/50",
                              isAdjustment && "bg-amber-50/50"
                            )}>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.entry_id}</td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-slate-800">{prod?.name || t.product_id}</span>
                              </td>
                              <td className="px-4 py-3">
                                {isAdjustment ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-100 text-amber-700 border border-amber-200">
                                    Adjustment
                                  </span>
                                ) : isSrcEntry ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-slate-100 text-slate-500">
                                    Transfer Out
                                  </span>
                                ) : t.transaction_type === 'in' ? (
                                  <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                    <ArrowDownCircle size={14} /> Stock In
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                                    <ArrowUpCircle size={14} /> Stock Out
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {isTransfer ? (
                                  <span>{godownMap[t.from_location] || t.from_location} → {godownMap[t.godown_id] || t.godown_id}</span>
                                ) : t.transaction_type === 'out' ? (
                                  <span className="text-slate-500">{godownMap[t.godown_id] || t.godown_id}</span>
                                ) : (
                                  <span className="text-slate-500">{godownMap[t.godown_id] || t.godown_id}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold">
                                <span className={t.transaction_type === 'in' ? 'text-emerald-600' : 'text-rose-600'}>
                                  {parseFloat(t.quantity).toLocaleString()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-500">{parseFloat(t.opening_stock || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{parseFloat(t.closing_stock || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={t.notes}>
                                {t.notes || t.reference_number || t.lr_number || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'corrections' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                        <th className="px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 whitespace-nowrap">Product</th>
                        <th className="px-4 py-3 whitespace-nowrap">Godown</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Old Closing</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">New Closing</th>
                        <th className="px-4 py-3 whitespace-nowrap text-right">Diff</th>
                        <th className="px-4 py-3 whitespace-nowrap">Reason</th>
                        <th className="px-4 py-3 whitespace-nowrap">By</th>
                        <th className="px-4 py-3 whitespace-nowrap">At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {adjustments.length === 0 ? (
                        <tr><td colSpan="9" className="px-4 py-12 text-center text-slate-400">No corrections for this date.</td></tr>
                      ) : (
                        adjustments.map((a, i) => {
                          const prod = productMap[a.product_id];
                          const diff = parseFloat(a.difference);
                          return (
                            <tr key={a.id || i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-mono text-sm">{a.date}</td>
                              <td className="px-4 py-3">
                                <span className="font-semibold text-slate-800">{prod?.name || a.product_id}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{godownMap[a.godown_id] || a.godown_id}</td>
                              <td className="px-4 py-3 text-right font-mono">{parseFloat(a.old_closing).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold">{parseFloat(a.new_closing).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold">
                                <span className={diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                  {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-4 py-3 max-w-[200px] truncate text-slate-500" title={a.reason}>{a.reason || '-'}</td>
                              <td className="px-4 py-3 text-slate-500">{a.created_by || '-'}</td>
                              <td className="px-4 py-3 text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {correctionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" />
                Correct Stock Entry
              </h2>
              <button onClick={() => { setCorrectionModal(null); setCorrectionPreview(null); }} className="rounded-full text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Product</span>
                  <span className="font-bold text-slate-800">{productMap[correctionModal.product_id]?.name || correctionModal.product_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Godown</span>
                  <span className="font-bold text-slate-800">{godownMap[correctionModal.godown_id] || correctionModal.godown_id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date</span>
                  <span className="font-bold text-slate-800">{correctionModal.date}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-2">
                  <span className="text-slate-500">Current Closing (in system)</span>
                  <span className="font-bold text-slate-900">{parseFloat(correctionModal.closing_stock).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Correct Closing Quantity
                </label>
                <Input
                  type="number"
                  min="0"
                  value={correctionInput}
                  onChange={(e) => { setCorrectionInput(e.target.value); setCorrectionPreview(null); }}
                  placeholder="Enter correct closing quantity"
                  className="h-12 text-lg font-bold text-center"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Reason for Correction *</label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g., Found 200 extra bags during physical count, data entry error on previous day..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none"
                />
              </div>

              {!correctionPreview ? (
                <Button
                  onClick={handlePreviewCorrection}
                  className="w-full gap-2"
                  variant="outline"
                  disabled={!correctionInput}
                >
                  <Eye size={16} />
                  Preview Impact
                </Button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                    <FileText size={16} />
                    Correction Impact Preview
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-600">Old Closing ({correctionModal.date})</span>
                      <span className="font-bold text-slate-800">{correctionPreview.current.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">New Closing ({correctionModal.date})</span>
                      <span className="font-bold text-slate-800">{correctionPreview.proposed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-200 pt-2">
                      <span className="text-blue-600 font-semibold">Difference</span>
                      <span className={cn(
                        "font-bold text-lg",
                        correctionPreview.diff >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {correctionPreview.diff >= 0 ? '+' : ''}{correctionPreview.diff.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2 bg-blue-100/50 p-2 rounded-lg">
                    This will insert an adjustment entry for {correctionModal.date}, recalculate current stock,
                    and regenerate daily summaries from {correctionModal.date} to today.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setCorrectionModal(null); setCorrectionPreview(null); }}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveCorrection}
                disabled={savingCorrection || !correctionPreview || !correctionReason.trim()}
                className="gap-2 bg-amber-600 hover:bg-amber-700"
              >
                <Save size={16} />
                {savingCorrection ? 'Applying...' : 'Apply Correction'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, color }) => {
  const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-4`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${c.text}`}>{label}</p>
      <p className="text-2xl font-black text-slate-900 mt-1">{value.toLocaleString()}</p>
    </div>
  );
};

export default DailyLedger;
