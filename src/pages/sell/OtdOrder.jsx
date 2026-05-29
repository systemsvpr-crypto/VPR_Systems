import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, X, Save, ChevronUp, ChevronDown, RefreshCw, Search, CheckCircle, Trash2, XCircle, MapPin, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import SearchableDropdown from '../../components/SearchableDropdown';
import { supabase } from '../../supabase';
import { whatsappService } from '../../services/whatsappService';
import { cn } from '../../lib/utils';
import Pagination from '@/components/ui/Pagination';

const ITEMS_PER_PAGE = 10;

const OtdOrder = () => {
  const calculateNextOrderNo = (existingOrders) => {
    const allNumbers = (existingOrders || [])
      .map(o => o.orderNumber || o.order_number)
      .filter(no => no && String(no).startsWith('VPR/OR-'))
      .map(no => parseInt(String(no).split('-')[1], 10))
      .filter(n => !isNaN(n));

    const maxNo = allNumbers.length > 0 ? Math.max(...allNumbers) : 100;
    return `VPR/OR-${maxNo + 1}`;
  };

  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    clientName: '',
    items: [{ itemName: '', rate: '', qty: '', godownName: '' }],
    orderNo: ''
  });

  const [itemNames, setItemNames] = useState([]);
  const [clients, setClients] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [customerPhoneMap, setCustomerPhoneMap] = useState({});
  const [whatsAppModal, setWhatsAppModal] = useState({ isOpen: false, status: 'sending', clientName: '', phoneNumber: '' });
  const [sendWhatsApp, setSendWhatsApp] = useState(false);

  // --- External Sheets Data ---
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingIntransit, setLoadingIntransit] = useState(false);
  const [stockDataMap, setStockDataMap] = useState({});
  const [intransitDataMap, setIntransitDataMap] = useState({});
  const [productGodownMap, setProductGodownMap] = useState({});

  const abortControllerRef = useRef(null);

  const normalize = useCallback((str) =>
    String(str || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9*]/g, ''),
    []);

  const fetchAllRows = useCallback(async (table, columns, orderCol) => {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .order(orderCol)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      allData = allData.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allData;
  }, []);

  const fetchStockData = useCallback(async () => {
    setLoadingStock(true);
    try {
      const [allStock, godownsData] = await Promise.all([
        fetchAllRows('products', 'name, godown_id, current_stock', 'name'),
        fetchAllRows('godowns', 'name, godown_id', 'name')
      ]);

      const godownMap = {};
      godownsData.forEach(g => {
        godownMap[g.godown_id] = g.name;
      });

      const sMap = {};
      allStock.forEach(row => {
        const itemKey = normalize(row.name);
        const godownId = String(row.godown_id || "").trim();
        const godownName = godownMap[godownId] || godownId;
        const stock = Number(row.current_stock) || 0;

        if (!sMap[itemKey]) sMap[itemKey] = [];
        sMap[itemKey].push({
          godown: godownName,
          stock: stock
        });
      });
      setStockDataMap(sMap);
    } catch (err) {
      console.error("Supabase stock fetch error:", err);
    } finally {
      setLoadingStock(false);
    }
  }, [fetchAllRows, normalize]);

  const fetchOrdersData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshingOrders(true);
    else setIsLoadingOrders(true);

    try {
      const [ordersRes, cancelRes] = await Promise.all([
        supabase.from('app_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('dispatch_plans').select('order_id, planned_qty').eq('status', 'Canceled')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (cancelRes.error) throw cancelRes.error;

      const cancelMap = {};
      cancelRes.data.forEach(c => {
        if (c.order_id) {
          cancelMap[c.order_id] = (cancelMap[c.order_id] || 0) + (parseFloat(c.planned_qty) || 0);
        }
      });

      const mappedOrders = (ordersRes.data || []).map((item) => {
        return {
          id: item.id,
          orderNumber: item.order_number || '-',
          clientName: item.client_name || '-',
          orderDate: item.order_date || '-',
          godownName: item.godown_name || '-',
          itemName: item.item_name || '-',
          rate: item.rate || '0',
          qty: item.qty || '0',
          canceledQty: cancelMap[item.id] || 0,
          planning: '0',
          remaining: item.qty || '0',
          createdBy: item.submittedby || '-'
        };
      });

      setOrders(mappedOrders);

      fetchStockData();

      setFormData(prev => ({
        ...prev,
        orderNo: calculateNextOrderNo(mappedOrders)
      }));
    } catch (error) {
      console.error('fetchOrdersData error:', error);
      toast.error('Failed to load orders: ' + error.message);
    } finally {
      setIsLoadingOrders(false);
      setIsRefreshingOrders(false);
      setInitialLoading(false);
    }
  }, [fetchStockData]);

  const fetchMasterData = useCallback(async () => {
    try {
      const [productsData, customersData, godownsData] = await Promise.all([
        fetchAllRows('products', 'name, godown_id', 'name'),
        fetchAllRows('master_customers', 'customer_name, customer_number', 'customer_name'),
        fetchAllRows('godowns', 'name, godown_id', 'name'),
      ]);

      const phoneMap = {};
      customersData.forEach(c => {
        if (c.customer_name) phoneMap[c.customer_name] = c.customer_number || '-';
      });
      setCustomerPhoneMap(phoneMap);

      const mapping = {};
      productsData.forEach(p => {
        const godown = godownsData.find(g => g.godown_id === p.godown_id);
        if (p.name && godown) mapping[p.name] = godown.name;
      });
      setProductGodownMap(mapping);

      setItemNames([...new Set(productsData.map(p => p.name).filter(Boolean))]);
      setClients(customersData.map(c => c.customer_name).filter(Boolean));
      setGodowns(godownsData.map(g => g.name));
    } catch (error) {
      console.error('fetchMasterData error:', error);
      toast.error('Failed to load master data: ' + error.message);
    }
  }, [fetchAllRows]);

  useEffect(() => {
    fetchOrdersData();
    fetchMasterData();
  }, [fetchOrdersData, fetchMasterData]);

  const handleRefresh = useCallback(() => {
    fetchOrdersData(true);
    fetchMasterData();
  }, [fetchOrdersData, fetchMasterData]);

  const formatDisplayDate = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const day = date.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateStr;
    }
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  useEffect(() => { setCurrentPage(1); }, [searchTerm, clientFilter, godownFilter]);

  const getSortedItems = useCallback((itemsToSort) => {
    if (!sortConfig.key) return itemsToSort;

    return [...itemsToSort].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ''));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (sortConfig.key === 'orderDate') {
        const aDate = new Date(aVal);
        const bDate = new Date(bVal);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
        }
      }

      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  const filterClients = useMemo(() => [...new Set(orders?.map(o => o.clientName) || [])].filter(Boolean).sort(), [orders]);
  const filterGodowns = useMemo(() => [...new Set(orders?.map(o => o.godownName) || [])].filter(Boolean).sort(), [orders]);

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];
    const filtered = orders.map(order => {
      const itemKey = normalize(order.itemName);

      let stockValues = stockDataMap[itemKey];
      if (!stockValues) {
        const stockEntry = Object.keys(stockDataMap).find(key =>
          itemKey.includes(key) || key.includes(itemKey)
        );
        if (stockEntry) stockValues = stockDataMap[stockEntry];
      }

      const allStockInfo = stockValues ? stockValues.map(s => s.godown).join(', ') : '-';

      return {
        ...order,
        currentStock: allStockInfo,
        intransitQty: intransitDataMap[`${itemKey}|${String(order.godownName || "").trim().toLowerCase()}`] !== undefined ? intransitDataMap[`${itemKey}|${String(order.godownName || "").trim().toLowerCase()}`] : '0'
      };
    }).filter(order => {
      const matchesSearch = Object.values(order).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesClient = !clientFilter || order.clientName === clientFilter;
      const matchesGodown = !godownFilter || order.godownName === godownFilter;
      return matchesSearch && matchesClient && matchesGodown;
    });
    return getSortedItems(filtered);
  }, [orders, searchTerm, clientFilter, godownFilter, stockDataMap, intransitDataMap, getSortedItems]);

  const totalPages = Math.ceil(filteredAndSortedOrders.length / ITEMS_PER_PAGE);
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageEndIndex = pageStartIndex + ITEMS_PER_PAGE;
  const currentItems = filteredAndSortedOrders.slice(pageStartIndex, pageEndIndex);
  const paginationStart = filteredAndSortedOrders.length === 0 ? 0 : pageStartIndex + 1;
  const paginationEnd = Math.min(pageEndIndex, filteredAndSortedOrders.length);

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { itemName: '', rate: '', qty: '', godownName: '' }]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      let filteredValue = value;
      if (field === 'qty' && typeof value === 'string') {
        filteredValue = value.replace(/-/g, '');
      }
      newItems[index][field] = filteredValue;

      if (field === 'itemName' && value && productGodownMap[value]) {
        newItems[index].godownName = productGodownMap[value];
      }

      return { ...prev, items: newItems };
    });
  };

  const handleCancelOrder = async (order) => {
    const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for Order ${order.orderNumber} (Max: ${order.qty}):`, order.qty);
    if (cancelQtyStr === null) return;

    const qtyToCancel = parseFloat(cancelQtyStr);
    if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (qtyToCancel > parseFloat(order.qty) + 0.001) {
      toast.error('Cannot cancel more than the remaining order quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const { data: plans } = await supabase.from('dispatch_plans').select('dispatch_number');
      const maxNo = (plans || []).reduce((max, p) => {
        const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 1000);

      const newDNo = `DN-${maxNo + 1}-CXL`;

      const { error: insErr } = await supabase.from('dispatch_plans').insert({
        order_id: order.id,
        dispatch_number: newDNo,
        planned_qty: qtyToCancel,
        planned_date: now.split('T')[0],
        godown_name: order.godownName || '-',
        status: 'Canceled',
        dispatch_completed: true,
        informed_before_dispatch: true,
        informed_after_dispatch: true
      });

      if (insErr) throw insErr;

      const newOrderTotal = (parseFloat(order.qty) || 0) - qtyToCancel;
      const { error: ordErr } = await supabase
        .from('app_orders')
        .update({ qty: newOrderTotal })
        .eq('id', order.id);

      if (ordErr) {
        throw ordErr;
      }

      toast.success('Order quantity canceled and record created successfully');
      await fetchOrdersData(true);
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.clientName) {
      toast.error('Client Name is required');
      setIsSubmitting(false);
      return;
    }

    const missingGodown = formData.items.some(item => !item.godownName);
    if (missingGodown) {
      toast.error('Godown is required for all items');
      setIsSubmitting(false);
      return;
    }

    const hasInvalidQty = formData.items.some(item => !item.qty || parseFloat(item.qty) <= 0);
    if (hasInvalidQty) {
      toast.error('Quantity must be greater than zero for all items');
      setIsSubmitting(false);
      return;
    }



    const hasDuplicateErrors = formData.items.some((item, index) => {
      if (!item.itemName || !item.godownName) return false;
      return formData.items.some((otherItem, otherIndex) => 
        otherIndex !== index && 
        normalize(otherItem.itemName) === normalize(item.itemName) && 
        normalize(otherItem.godownName) === normalize(item.godownName)
      );
    });

    if (hasDuplicateErrors) {
      toast.error('Duplicate items found. You cannot select the same product from the same godown multiple times.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const rowsToInsert = formData.items.map(item => ({
        order_date: formData.orderDate,
        client_name: formData.clientName,
        godown_name: item.godownName || '-',
        order_number: formData.orderNo,
        item_name: item.itemName,
        rate: parseFloat(item.rate) || 0,
        qty: parseInt(item.qty, 10) || 0,
        submittedby: user?.name || user?.full_name || user?.username || user?.id || 'Unknown'
      }));

      const { error } = await supabase
        .from('app_orders')
        .insert(rowsToInsert);

      if (error) throw error;

      // Send WhatsApp Notification only if sendWhatsApp is enabled
      if (sendWhatsApp) {
        // Show WhatsApp Sending Dialog
        const clientPhone = customerPhoneMap[formData.clientName] || '';
        setWhatsAppModal({
          isOpen: true,
          status: 'sending',
          clientName: formData.clientName,
          phoneNumber: clientPhone
        });

        // Send WhatsApp Notification
        try {
          await whatsappService.sendOrderCreationNotification(clientPhone || '9691207533', {
            customerName: formData.clientName,
            orderNo: formData.orderNo,
            items: formData.items,
            orderDate: formData.orderDate
          });
          setWhatsAppModal(prev => ({ ...prev, status: 'success' }));
        } catch (wsError) {
          console.error('WhatsApp failed:', wsError);
          setWhatsAppModal(prev => ({ ...prev, status: 'error', error: wsError.message }));
          toast.error(`WhatsApp notification failed: ${wsError.message}`);
        }
      }

      toast.success('Order created successfully!');
      setFormData(prev => ({
        orderDate: new Date().toISOString().split('T')[0],
        clientName: '',
        items: [{ itemName: '', rate: '', qty: '', godownName: '' }],
        orderNo: calculateNextOrderNo(orders)
      }));
      setIsModalOpen(false);

      await fetchOrdersData(true);
    } catch (error) {
      console.error('Submit error details:', error);
      let errorMsg = error.message || 'Unknown error';
      if (error.code === '23505') {
        errorMsg = `Duplicate Order Number: The number "${formData.orderNo}" is already in use. Please use a different number.`;
      }
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const TableSkeleton = () => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-100 last:border-0 relative overflow-hidden">
          {[...Array(14)].map((_, colIdx) => (
            <td key={colIdx} className="px-6 py-4">
              <div className="h-4 w-full max-w-[100px] bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  const MobileSkeleton = () => (
    <div className="md:hidden divide-y divide-gray-100">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="p-6 space-y-4 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-5 w-40 bg-gray-100 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
            <div className="h-4 w-16 bg-primary/5 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-24 bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-20 bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <div className="h-2 w-10 bg-gray-50 rounded"></div>
              <div className="h-4 w-full bg-gray-100 rounded-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col gap-6 bg-white p-6 rounded-lg shadow-sm border border-slate-200 max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Orders</h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Manage Sales & Dispatch Orders</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshingOrders}
              className="erp-btn-secondary h-[42px]"
            >
              <RefreshCw size={16} className={isRefreshingOrders ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              onClick={() => { setSendWhatsApp(false); setIsModalOpen(true); }}
              className="erp-btn-primary h-[42px] px-6 shadow-md shadow-primary/10"
            >
              <Plus size={18} className="stroke-[3]" />
              New Order
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative group">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
            />
          </div>
            <div className="h-[42px]">
              <SearchableDropdown
                value={clientFilter}
                onChange={setClientFilter}
                options={filterClients}
                allLabel="All Clients"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
            <div className="h-[42px]">
              <SearchableDropdown
                value={godownFilter}
                onChange={setGodownFilter}
                options={filterGodowns}
                allLabel="All Godowns"
                className="w-full h-full"
                focusColor="primary"
              />
            </div>
        </div>
      </div>

      {(isLoadingOrders || isRefreshingOrders) && !initialLoading && (
        <div className="fixed top-0 left-0 w-full h-1 z-[101] bg-gray-100 overflow-hidden">
          <div className="h-full bg-primary animate-progress-loading shadow-[0_0_10px_rgba(88,204,2,0.5)]"></div>
        </div>
      )}

      <div className="erp-table-container max-w-[1200px] mx-auto">
        <div className="hidden md:block overflow-x-auto custom-scrollbar">
          <table className="erp-table">
            <thead className="erp-table-thead">
              <tr>
                <th className="erp-table-th">Order No</th>
                <th className="erp-table-th">Client Name</th>
                <th className="erp-table-th">Item Name</th>
                <th className="erp-table-th">Godown</th>
                <th className="erp-table-th text-center">Order Qty</th>
                <th className="erp-table-th text-center">Current Stock</th>
                <th className="erp-table-th text-center">Order Date</th>
                <th className="erp-table-th text-center">Rate</th>
                <th className="erp-table-th text-center">Canceled Qty</th>
                <th className="erp-table-th text-center">Intransit</th>
                <th className="erp-table-th text-center">Submitted By</th>
                <th className="erp-table-th text-center">Total Order Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(isLoadingOrders || isRefreshingOrders) ? (
                <TableSkeleton />
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-5 bg-slate-50 rounded-full text-slate-300">
                        <Package size={40} strokeWidth={1.5} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No orders found</p>
                        <p className="text-xs text-slate-300">Try adjusting your filters or search term</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                currentItems.map((order, idx) => (
                  <tr key={idx} className="erp-table-tr group">
                    <td className="erp-table-td font-bold text-primary whitespace-nowrap">
                      {order.orderNumber}
                    </td>
                    <td className="erp-table-td font-bold text-slate-900 max-w-[200px] truncate" title={order.clientName}>{order.clientName}</td>
                    <td className="erp-table-td font-semibold text-slate-700 max-w-[250px] whitespace-normal leading-tight" title={order.itemName}>{order.itemName}</td>
                    <td className="erp-table-td text-slate-600 italic text-[11px] font-black uppercase opacity-60 whitespace-nowrap">{order.godownName}</td>

                    {/* Remaining Qty — what's left after cancellations */}
                    <td className="erp-table-td text-center">
                      <span className="inline-flex flex-col items-center">
                        <span className="font-black text-primary text-base leading-tight">{order.qty}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Remaining</span>
                      </span>
                    </td>

                    <td className="erp-table-td text-center bg-slate-50/30">
                      {loadingStock ? (
                        <RefreshCw size={12} className="animate-spin inline text-primary/40" />
                      ) : (
                        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 max-w-[150px] mx-auto">
                          {(() => {
                            const itemStocks = stockDataMap[normalize(order.itemName)] || [];
                            return itemStocks.map((st, sIdx) => {
                              const isSelected = normalize(st.godown) === normalize(order.godownName);
                              return (
                                <div 
                                  key={sIdx} 
                                  className={cn(
                                    "text-[9px] font-bold uppercase whitespace-nowrap",
                                    isSelected ? "text-primary font-black scale-110" : "text-slate-400"
                                  )}
                                >
                                  {st.godown}{sIdx < itemStocks.length - 1 ? ',' : ''}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </td>

                    <td className="erp-table-td text-gray-500 text-[11px] font-black uppercase text-center whitespace-nowrap">{formatDisplayDate(order.orderDate)}</td>
                    <td className="erp-table-td font-black text-center text-slate-800 whitespace-nowrap">₹{order.rate}</td>

                    {/* Cancelled Qty */}
                    <td className="erp-table-td text-center">
                      <span className="inline-flex flex-col items-center">
                        <span className="font-black text-red-500 text-sm leading-tight">{order.canceledQty > 0 ? order.canceledQty : '—'}</span>
                        <span className="text-[9px] font-bold text-red-300 uppercase tracking-widest leading-none">Cancelled</span>
                      </span>
                    </td>

                    <td className="erp-table-td text-gray-500 text-[11px] font-bold text-center whitespace-nowrap">
                      {loadingIntransit ? (
                        <RefreshCw size={12} className="animate-spin inline text-primary/40" />
                      ) : (
                        <span className="font-black text-slate-700">{order.intransitQty}</span>
                      )}
                    </td>
                    <td className="erp-table-td text-[10px] text-center text-gray-400 font-bold uppercase tracking-tighter italic whitespace-nowrap">{order.createdBy}</td>

                    {/* Total (Original) Qty = Remaining + Cancelled */}
                    <td className="erp-table-td text-center bg-gray-50/50">
                      <span className="inline-flex flex-col items-center">
                        <span className="font-black text-gray-700 text-base leading-tight">{(parseFloat(order.qty) || 0) + (parseFloat(order.canceledQty) || 0)}</span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Original</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
              {!(isLoadingOrders || isRefreshingOrders) && Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                <tr key={`empty-${i}`}><td colSpan="14" className="h-16"></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(isLoadingOrders || isRefreshingOrders) && (
          <div className="hidden md:block">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAndSortedOrders.length}
              startIndex={paginationStart}
              endIndex={paginationEnd}
              onPageChange={setCurrentPage}
              className="border-t border-slate-100"
            />
          </div>
        )}

        <div className="md:hidden divide-y divide-gray-200">
          {(isLoadingOrders || isRefreshingOrders) ? (
            <MobileSkeleton />
          ) : currentItems.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="p-4 bg-gray-50 rounded-full">
                <Search size={32} className="text-gray-200" />
              </div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No records matching your filters</p>
            </div>
          ) : (
            currentItems.map((order, idx) => (
              <div key={idx} className="p-6 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-gray-900 text-lg leading-tight">{order.clientName}</h4>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{order.godownName}</p>
                  </div>
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-tighter">
                    #{order.orderNumber}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="col-span-2">
                    <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1 leading-none">Ordered Item</p>
                    <p className="font-bold text-gray-800 text-sm">{order.itemName}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1 leading-none">Rate</p>
                    <p className="font-black text-gray-700">₹{order.rate}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1">Order Qty</p>
                    <p className="font-black text-primary text-lg">{order.qty}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-red-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Rejected</p>
                    <p className="font-black text-red-500 text-lg">{order.canceledQty > 0 ? `${order.canceledQty}` : '0'}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Stock</p>
                    <p className="font-black text-gray-700 text-lg">
                      {loadingStock ? <RefreshCw size={14} className="animate-spin text-primary/40" /> : (order.currentStock || '-')}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col items-center">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-tighter mb-1 leading-none">Intransit</p>
                    <p className="font-black text-gray-700 text-lg">
                      {loadingIntransit ? <RefreshCw size={14} className="animate-spin text-primary/40" /> : (order.intransitQty || '0')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-gray-500 uppercase">
                      {order.createdBy.charAt(0)}
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">{order.createdBy}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDisplayDate(order.orderDate)}</span>
                </div>
              </div>
            ))
          )}
          {!(isLoadingOrders || isRefreshingOrders) && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAndSortedOrders.length}
              startIndex={paginationStart}
              endIndex={paginationEnd}
              onPageChange={setCurrentPage}
              className="bg-white border-t border-slate-200 rounded-t-xl shadow-sm"
            />
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 transition-all duration-300">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />
          <div className="relative bg-white sm:rounded-xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl lg:max-w-5xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  <Plus size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">New Order</h2>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Fill in the order details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 transition-colors bg-gray-50 hover:bg-gray-100 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 custom-scrollbar bg-gray-50/30">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Order Date</label>
                    <input
                      type="date"
                      required
                      value={formData.orderDate}
                      onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Order Number</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VPR/OR-484"
                      value={formData.orderNo}
                      onChange={(e) => setFormData({ ...formData, orderNo: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm font-bold text-primary"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Client Selection <span className="text-red-500">*</span></label>
                    <SearchableDropdown
                      value={formData.clientName}
                      onChange={(val) => setFormData({ ...formData, clientName: val })}
                      options={clients}
                      placeholder="Choose Client"
                      showAll={false}
                    />
                  </div>
                  <div className="flex flex-col justify-between pb-1 space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">WhatsApp Alert</label>
                    <div className="flex items-center gap-3 h-[38px]">
                      <button
                        type="button"
                        onClick={() => setSendWhatsApp(!sendWhatsApp)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                          sendWhatsApp ? "bg-primary" : "bg-slate-200"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            sendWhatsApp ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                      <span className="text-xs font-semibold text-slate-600">
                        {sendWhatsApp ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      Line Items
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] ml-1">{formData.items.length}</span>
                    </h3>
                    <div className="h-[1px] flex-1 bg-gray-200"></div>
                  </div>

                  <div className="space-y-4">
                    {formData.items.map((item, index) => {
                      const itemKey = item.itemName ? normalize(item.itemName) : null;
                      const godownKey = item.godownName ? normalize(item.godownName) : null;
                      const stockArr = itemKey ? (stockDataMap[itemKey] || []) : [];
                      const stockObj = godownKey ? stockArr.find(st => normalize(st.godown) === godownKey) : null;
                      const availableStock = stockObj ? stockObj.stock : 0;
                      const hasStockError = false;
                      
                      const usedGodownsForThisItem = formData.items
                        .map((otherItem, otherIndex) => (otherIndex !== index && otherItem.itemName && normalize(otherItem.itemName) === itemKey) ? normalize(otherItem.godownName) : null)
                        .filter(Boolean);
                      const hasDuplicateError = Boolean(itemKey && godownKey && usedGodownsForThisItem.includes(godownKey));
                      const hasError = hasStockError || hasDuplicateError;

                      return (
                      <div
                        key={index}
                        className={cn("relative flex flex-col gap-4 p-5 bg-white border rounded shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-4 ease-out", hasError ? "border-red-300" : "border-gray-200 hover:border-primary/30")}
                        style={{ animationDuration: '400ms' }}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                          <div className="sm:col-span-4 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Product / Item Name</label>
                            <SearchableDropdown
                              value={item.itemName}
                              onChange={(val) => handleItemChange(index, 'itemName', val)}
                              options={itemNames}
                              placeholder="Select Product"
                              showAll={false}
                            />
                            {item.itemName && stockDataMap[normalize(item.itemName)] && (
                              <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                  <Package size={10} />
                                  Current Availability
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {stockDataMap[normalize(item.itemName)].map((st, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className={cn(
                                        "flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold transition-all",
                                        normalize(st.godown) === normalize(item.godownName)
                                          ? "bg-primary/10 border-primary/20 text-primary shadow-sm"
                                          : "bg-white border-slate-200 text-slate-500"
                                      )}
                                    >
                                      <MapPin size={10} className={normalize(st.godown) === normalize(item.godownName) ? "text-primary" : "text-slate-300"} />
                                      <span>{st.godown}</span>
                                      <span className="w-px h-2.5 bg-slate-200"></span>
                                      <span className={st.stock > 0 ? "text-slate-900" : "text-slate-400"}>{st.stock}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                           <div className="sm:col-span-3 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Location / Godown <span className="text-red-500">*</span></label>
                            <SearchableDropdown
                              value={item.godownName}
                              onChange={(val) => handleItemChange(index, 'godownName', val)}
                              options={itemKey ? stockArr.filter(st => !usedGodownsForThisItem.includes(normalize(st.godown))).map(st => st.godown) : godowns}
                              placeholder="Select Godown"
                              showAll={false}
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Unit Price (₹)</label>
                            <input
                              type="number"
                              required
                              placeholder="0.00"
                              value={item.rate}
                              onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm transition-all shadow-sm"
                            />
                          </div>
                          <div className="sm:col-span-3 flex gap-3 items-start">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                required
                                placeholder="0"
                                value={item.qty}
                                onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                className={cn("w-full px-3 py-2 bg-white border rounded outline-none text-sm font-bold transition-all shadow-sm", hasError ? "border-red-400 text-red-600 focus:ring-2 focus:ring-red-400 focus:border-transparent" : "border-gray-200 text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent")}
                              />
                              {hasStockError && !hasDuplicateError && (
                                <p className="text-[10px] text-red-500 font-bold leading-tight mt-1.5 bg-red-50 p-1.5 rounded border border-red-100">
                                  This stock has availability of {availableStock} in this godown so this order cannot be created like this.
                                </p>
                              )}
                              {hasDuplicateError && (
                                <p className="text-[10px] text-red-500 font-bold leading-tight mt-1.5 bg-red-50 p-1.5 rounded border border-red-100">
                                  Duplicate selection! You have already selected this product from this godown.
                                </p>
                              )}
                              {!hasError && item.godownName && item.qty && Number(item.qty) > 0 && (
                                <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                                  <span>Stock Preview ({item.godownName}):</span>
                                  <span className="font-medium text-slate-700">
                                    {availableStock} → {availableStock - Number(item.qty)}
                                  </span>
                                </div>
                              )}
                            </div>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="shrink-0 p-2.5 mt-[22px] text-red-500 hover:text-white hover:bg-red-500 transition-colors bg-red-50 rounded border border-red-100"
                                title="Remove Item"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-dashed border-gray-300 text-gray-600 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all rounded font-bold text-xs uppercase tracking-widest shadow-sm"
                    >
                      <Plus size={16} />
                      Add Another Item
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex sm:flex-row justify-end items-center gap-3 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => !isSubmitting && setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors font-bold text-xs uppercase tracking-widest shadow-sm"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-w-[160px] flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white rounded hover:bg-primary-hover transition-colors font-bold text-xs uppercase tracking-widest shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {isSubmitting ? 'Saving...' : 'Submit Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Status Modal */}
      {whatsAppModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            {whatsAppModal.status === 'sending' ? (
              <>
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
                   <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                   <RefreshCw size={32} className="text-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Sending WhatsApp Notification</h3>
                <p className="text-slate-500 mb-6">
                  Notifying <span className="font-bold text-slate-900">{whatsAppModal.clientName}</span> at <span className="font-bold text-primary">{whatsAppModal.phoneNumber || 'N/A'}</span>
                </p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-primary animate-progress-loading" />
                </div>
              </>
            ) : whatsAppModal.status === 'success' ? (
              <>
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                   <CheckCircle size={40} className="text-green-600 animate-bounce" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Notification Sent!</h3>
                <p className="text-slate-500 mb-8">
                  WhatsApp message successfully sent to <span className="font-bold text-slate-900">{whatsAppModal.clientName}</span>
                </p>
                <button
                  onClick={() => setWhatsAppModal({ ...whatsAppModal, isOpen: false })}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                >
                  Great, Thanks!
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                   <XCircle size={40} className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Sending Failed</h3>
                <p className="text-slate-500 mb-8">
                  {whatsAppModal.error || "Could not send notification."}
                </p>
                <button
                  onClick={() => setWhatsAppModal({ ...whatsAppModal, isOpen: false })}
                  className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        @keyframes progress-loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress-loading {
          animation: progress-loading 1.5s infinite linear;
          width: 50%;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default OtdOrder;
