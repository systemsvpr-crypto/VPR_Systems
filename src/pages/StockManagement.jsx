import React, { useState, useEffect, useMemo } from 'react';
import {
    Truck,
    Package,
    ArrowDown,
    ArrowUp,
    ArrowRight,
    Search,
    Plus,
    X,
    Edit2,
    Trash2,
    Shield,
    RefreshCw,
    ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { stockManagementService } from '../services/stockManagementService';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DeleteModal from '@/components/ui/DeleteModal';
import { cn } from '@/lib/utils';
import Products from './Products';
import Godowns from './Godowns';
import Transporters from './Transporters';
import useAuthStore from '../store/authStore';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';

const ITEMS_PER_PAGE = 10;

const isEditableDate = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return dateStr === today || dateStr === yesterday;
};

const DEFAULT_FORM_DATA = {
    entry_id: '',
    godown_id: '',
    transaction_type: 'in',
    reference_number: '',
    date: new Date().toISOString().split('T')[0],
    transporter_id: '',
    lr_number: '',
    from_location: '',
    freight_amount: '',
    productItems: [],
};

const StockManagement = () => {
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);
    const [godowns, setGodowns] = useState([]);
    const [products, setProducts] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterGodown, setFilterGodown] = useState('all');
    const [filterDate, setFilterDate] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const [errors, setErrors] = useState({});
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedQty, setSelectedQty] = useState(1);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('stocks');

    const allowedTabs = useMemo(() => {
        const tabs = [];
        const pageAccess = user?.page_access || [];
        const roleUpper = (user?.role || '').toUpperCase();
        const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN';

        if (isSuperAdmin || pageAccess.includes('stock-management')) {
            tabs.push({ id: 'stocks', label: 'Stocks', icon: Package });
        }
        return tabs;
    }, [user]);

    // Set initial active tab if default is not allowed
    useEffect(() => {
        if (allowedTabs.length > 0 && (!activeTab || !allowedTabs.find(t => t.id === activeTab))) {
            setActiveTab(allowedTabs[0].id);
        }
    }, [allowedTabs, activeTab]);

    if (allowedTabs.length === 0 && !loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Shield className="text-slate-300 w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500 mt-2 text-center max-w-xs">
                    You don't have permission to access any modules in this section.
                </p>
            </div>
        );
    }

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, filterGodown, filterDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [entries, godownsData, transportersData, allProducts] = await Promise.all([
                stockManagementService.getAll(),
                stockManagementService.getActiveGodowns(),
                stockManagementService.getActiveTransporters(),
                stockManagementService.fetchAllProducts()
            ]);
            setEntries(entries || []);
            setGodowns(godownsData || []);
            setProducts(allProducts || []);
            setTransporters(transportersData || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(DEFAULT_FORM_DATA);
        setEditingEntry(null);
        setErrors({});
        setSelectedProduct('');
        setSelectedQty(1);
    };

    const handleOpenModal = (entry = null) => {
        if (entry) {
            const entryDate = entry.date || '';
            if (!isEditableDate(entryDate)) {
                toast.error('You can only edit entries from today or yesterday');
                return;
            }
            const entryId = entry.entry_id || '';
            const baseId = entryId.endsWith('-SRC') ? entryId.slice(0, -4) : entryId;
            if (baseId.startsWith('STK-SAL-') || baseId.startsWith('ARR-')) {
                toast.error('Cannot edit entries created by sales or purchase');
                return;
            }
            if (entryId.endsWith('-SRC')) {
                toast.error('Transfer entries cannot be edited independently');
                return;
            }
            setEditingEntry(entry);
            // If this was a Stock-In with no from_location (null/empty) it was created as
            // "New Stock (From System)". Restore the sentinel value so the form pre-selects it.
            const resolvedFromLocation =
                entry.transaction_type === 'in' && !entry.from_location
                    ? 'NEW_STOCK'
                    : (entry.from_location || '');
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...entry,
                from_location: resolvedFromLocation,
                productItems: [{ product_id: entry.product_id, quantity: entry.quantity }],
            });
        } else {
            generateEntryId();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetForm();
    };

    const generateEntryId = () => {
        const count = entries.length + 1;
        const date = formData.date.replace(/-/g, '');
        setFormData(prev => ({ ...prev, entry_id: `STK-${date}-${count.toString().padStart(4, '0')}` }));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (e) => {
        const selectedDate = e.target.value;
        if (selectedDate && !isEditableDate(selectedDate)) {
            toast.error('You can only select today or yesterday');
            return;
        }
        setFormData(prev => ({
            ...prev,
            date: selectedDate,
            entry_id: editingEntry
                ? prev.entry_id
                : `STK-${selectedDate.replace(/-/g, '')}-${(entries.length + 1).toString().padStart(4, '0')}`
        }));
    };

    const addProductItem = () => {
        if (!selectedProduct) {
            toast.error('Please select a product');
            return;
        }
        if (!selectedQty || selectedQty <= 0) {
            toast.error('Please enter a valid quantity');
            return;
        }

        const selectedProdData = products.find(p => p.product_id === selectedProduct);
        if (!selectedProdData) return;

        // Stock Validation
        let sourceGodownId = null;
        if (formData.transaction_type === 'out') {
            sourceGodownId = formData.godown_id;
        } else if (formData.transaction_type === 'in' && formData.from_location) {
            const isGodown = godowns.some(g => g.godown_id === formData.from_location);
            if (isGodown) sourceGodownId = formData.from_location;
        }

        if (sourceGodownId) {
            const sourceStock = products.find(p => p.name === selectedProdData.name && p.godown_id === sourceGodownId);
            const availableQty = parseFloat(sourceStock?.current_stock) || 0;
            
            if (availableQty < selectedQty) {
                toast.error(`Insufficient stock. Maximum available is ${availableQty}`);
                return;
            }
        }

        if (formData.productItems.some(item => item.product_id === selectedProduct)) {
            toast.error('Product already added');
            return;
        }
        setFormData(prev => ({
            ...prev,
            productItems: [...prev.productItems, { product_id: selectedProduct, quantity: parseInt(selectedQty) }]
        }));
        setSelectedProduct('');
        setSelectedQty(1);
    };

    const removeProductItem = (productId) => {
        setFormData(prev => ({
            ...prev,
            productItems: prev.productItems.filter(item => item.product_id !== productId)
        }));
    };

    const updateProductQty = (productId, qty) => {
        let qtyNum = qty === '' ? '' : parseInt(qty) || 0;
        if (qtyNum !== '' && qtyNum < 0) qtyNum = 0;

        const selectedProdData = products.find(p => p.product_id === productId);
        
        let sourceGodownId = null;
        if (formData.transaction_type === 'out') {
            sourceGodownId = formData.godown_id;
        } else if (formData.transaction_type === 'in' && formData.from_location) {
            const isGodown = godowns.some(g => g.godown_id === formData.from_location);
            if (isGodown) sourceGodownId = formData.from_location;
        }

        if (sourceGodownId && selectedProdData && qtyNum !== '') {
            const sourceStock = products.find(p => p.name === selectedProdData.name && p.godown_id === sourceGodownId);
            let availableQty = parseFloat(sourceStock?.current_stock) || 0;
            
            if (editingEntry && editingEntry.product_id === productId) {
                const wasTransfer = editingEntry.transaction_type === 'in' && editingEntry.from_location && editingEntry.from_location !== 'NEW_STOCK';
                if (editingEntry.transaction_type === 'out' && sourceGodownId === editingEntry.godown_id) {
                    availableQty += editingEntry.quantity;
                } else if (wasTransfer && sourceGodownId === editingEntry.from_location) {
                    availableQty += editingEntry.quantity;
                }
            }
            
            if (qtyNum > availableQty) {
                qtyNum = availableQty;
                toast.error(`Maximum available stock is ${availableQty}`);
            }
        }

        setFormData(prev => ({
            ...prev,
            productItems: prev.productItems.map(item =>
                item.product_id === productId ? { ...item, quantity: qtyNum } : item
            )
        }));
    };

    const validateForm = (data) => {
        const newErrors = {};
        if (!data.godown_id) newErrors.godown_id = 'Godown is required';
        if (!data.productItems || data.productItems.length === 0) {
            newErrors.productItems = 'At least one product is required';
        }
        if (data.transaction_type === 'in') {
            // 'NEW_STOCK' is a valid sentinel — only error if truly empty
            if (!data.from_location) newErrors.from_location = 'From Location is required';
            if (data.godown_id && data.from_location && data.from_location !== 'NEW_STOCK' && data.godown_id === data.from_location) {
                newErrors.from_location = 'From Location cannot be same as Godown';
            }
        }
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formErrors = validateForm(formData);
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            toast.error('Please fill required fields');
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        try {
            if (editingEntry) {
                // We will collect all products we need to recalculate later
                const affectedProducts = new Set();
                affectedProducts.add(editingEntry.product_id);

                let nextCount = 1;
                const lastProductId = await stockManagementService.getLastProductId();
                if (lastProductId) {
                    const match = lastProductId.match(/\d+$/);
                    if (match) {
                        nextCount = parseInt(match[0], 10) + 1;
                    }
                }

                // 1. Process the first product item (updates the existing editingEntry row)
                const singleItem = formData.productItems[0];
                const qty = singleItem.quantity;
                let targetProductId = singleItem.product_id;
                affectedProducts.add(targetProductId);

                const submittedProduct = products.find(p => p.product_id === targetProductId);

                if (formData.transaction_type === 'in' && submittedProduct) {
                    if (submittedProduct.godown_id !== formData.godown_id) {
                        const destProduct = products.find(p => p.name === submittedProduct.name && p.godown_id === formData.godown_id);
                        if (destProduct) {
                            targetProductId = destProduct.product_id;
                            affectedProducts.add(targetProductId);
                        } else {
                            const newProductId = `PROD-${nextCount.toString().padStart(4, '0')}`;
                            nextCount++;

                            const newProd = await stockManagementService.createProduct({
                                product_id: newProductId,
                                godown_id: formData.godown_id,
                                godown_name: godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id,
                                name: submittedProduct.name,
                                description: submittedProduct.description || null,
                                unit: submittedProduct.unit || 'units',
                                mux: submittedProduct.mux || 1,
                                current_stock: 0,
                                master_product_id: submittedProduct.master_product_id ?? null,
                                product_type: submittedProduct.product_type ?? null
                            });
                            targetProductId = newProd.product_id;
                            affectedProducts.add(targetProductId);
                        }
                    }
                }

                const isSameProduct = editingEntry.product_id === targetProductId && editingEntry.godown_id === formData.godown_id;
                const productStock = await stockManagementService.getProductClosingQuantity(targetProductId);
                const currentStock = productStock.current_stock;

                let baseStock = currentStock;
                if (isSameProduct) {
                    if (editingEntry.transaction_type === 'in') {
                        baseStock = currentStock - editingEntry.quantity;
                    } else {
                        baseStock = currentStock + editingEntry.quantity;
                    }
                }

                const displayClosing = formData.transaction_type === 'in'
                    ? baseStock + qty : Math.max(0, baseStock - qty);

                const { productItems, ...formDataWithoutItems } = formData;
                const entryData = {
                    ...formDataWithoutItems,
                    product_id: targetProductId,
                    quantity: qty,
                    balance_after_transaction: displayClosing,
                    transporter_id: formData.transaction_type === 'in' ? (formData.transporter_id || null) : null,
                    lr_number: formData.transaction_type === 'in' ? (formData.lr_number || null) : null,
                    from_location:
                        formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK'
                            ? formData.from_location
                            : null,
                    freight_amount: formData.transaction_type === 'in' && formData.freight_amount ? parseFloat(formData.freight_amount) : null,
                };

                await stockManagementService.update(editingEntry.entry_id, entryData);

                // Handle source-out row for transfers
                const wasTransfer =
                    editingEntry.transaction_type === 'in' &&
                    editingEntry.from_location &&
                    editingEntry.from_location !== 'NEW_STOCK';
                const isTransfer = formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK';

                const oldSourceEntryId = editingEntry.entry_id + '-SRC';

                // Add old source product to affected if it was transfer
                if (wasTransfer) {
                    const oldSourceProduct = products.find(p => p.product_id === editingEntry.product_id);
                    const oldSourceProductInstance = oldSourceProduct ? products.find(p => p.name === oldSourceProduct.name && p.godown_id === editingEntry.from_location) : null;
                    if (oldSourceProductInstance) {
                        affectedProducts.add(oldSourceProductInstance.product_id);
                    }
                }

                if (wasTransfer && !isTransfer) {
                    // Delete the old source-out row
                    await stockManagementService.delete(oldSourceEntryId);
                } else if (isTransfer) {
                    const destProduct = products.find(p => p.product_id === targetProductId);
                    const sourceProduct = destProduct ? products.find(p => p.name === destProduct.name && p.godown_id === formData.from_location) : null;
                    if (sourceProduct) {
                        affectedProducts.add(sourceProduct.product_id);

                        const srcStock = await stockManagementService.getProductClosingQuantity(sourceProduct.product_id);
                        const srcCurrentStock = srcStock.current_stock;

                        let srcBaseStock = srcCurrentStock;
                        const oldSourceProduct = products.find(p => p.product_id === editingEntry.product_id);
                        const oldSourceProductInstance = oldSourceProduct ? products.find(p => p.name === oldSourceProduct.name && p.godown_id === editingEntry.from_location) : null;
                        if (wasTransfer && oldSourceProductInstance && oldSourceProductInstance.product_id === sourceProduct.product_id) {
                            srcBaseStock = srcCurrentStock + editingEntry.quantity;
                        }
                        const srcNewStock = Math.max(0, srcBaseStock - qty);

                        const srcDataObj = {
                            entry_id: oldSourceEntryId,
                            godown_id: formData.from_location,
                            product_id: sourceProduct.product_id,
                            transaction_type: 'out',
                            quantity: qty,
                            balance_after_transaction: srcNewStock,
                            reference_number: formData.reference_number,
                            date: formData.date,
                            notes: `Transfer out to ${godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id}`,
                            transporter_id: formData.transporter_id || null,
                            lr_number: formData.lr_number || null,
                        };

                        if (wasTransfer) {
                            await stockManagementService.update(oldSourceEntryId, srcDataObj);
                        } else {
                            await stockManagementService.create(srcDataObj);
                        }
                    }
                }

                // 2. Process any additional product items (inserts new rows)
                for (let i = 1; i < formData.productItems.length; i++) {
                    const item = formData.productItems[i];
                    // Generate a new unique entry_id linked to the editing entry
                    const entryId = `${editingEntry.entry_id}-ADD-${i}-${Math.floor(Math.random() * 10000)}`;

                    let targetAddProductId = item.product_id;
                    affectedProducts.add(targetAddProductId);

                    const submittedAddProduct = products.find(p => p.product_id === targetAddProductId);

                    if (formData.transaction_type === 'in' && submittedAddProduct) {
                        if (submittedAddProduct.godown_id !== formData.godown_id) {
                            const destProduct = products.find(p => p.name === submittedAddProduct.name && p.godown_id === formData.godown_id);
                            if (destProduct) {
                                targetAddProductId = destProduct.product_id;
                                affectedProducts.add(targetAddProductId);
                            } else {
                                const newProductId = `PROD-${nextCount.toString().padStart(4, '0')}`;
                                nextCount++;

                                const newProd = await stockManagementService.createProduct({
                                    product_id: newProductId,
                                    godown_id: formData.godown_id,
                                    godown_name: godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id,
                                    name: submittedAddProduct.name,
                                    description: submittedAddProduct.description || null,
                                    unit: submittedAddProduct.unit || 'units',
                                    mux: submittedAddProduct.mux || 1,
                                    current_stock: 0,
                                    master_product_id: submittedAddProduct.master_product_id ?? null,
                                    product_type: submittedAddProduct.product_type ?? null
                                });
                                targetAddProductId = newProd.product_id;
                                affectedProducts.add(targetAddProductId);
                            }
                        }
                    }

                    const addProductStock = await stockManagementService.getProductClosingQuantity(targetAddProductId);
                    const currentAddStock = addProductStock.current_stock;
                    const addQty = item.quantity;
                    let addOpeningStock = currentAddStock;
                    let addClosingStock = formData.transaction_type === 'in'
                        ? currentAddStock + addQty : Math.max(0, currentAddStock - addQty);

                    const entryAddData = {
                        entry_id: entryId,
                        godown_id: formData.godown_id,
                        product_id: targetAddProductId,
                        transaction_type: formData.transaction_type,
                        quantity: addQty,
                        balance_after_transaction: addClosingStock,
                        reference_number: formData.reference_number,
                        date: formData.date,
                        notes: formData.notes,
                        transporter_id: formData.transaction_type === 'in' ? (formData.transporter_id || null) : null,
                        lr_number: formData.transaction_type === 'in' ? (formData.lr_number || null) : null,
                        from_location:
                            formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK'
                                ? formData.from_location
                                : null,
                        freight_amount: formData.transaction_type === 'in' && formData.freight_amount ? parseFloat(formData.freight_amount) : null,
                    };

                    await stockManagementService.create(entryAddData);

                    // If it is a transfer, also insert the source-out row for this additional product
                    if (isTransfer) {
                        const destProduct = products.find(p => p.product_id === targetAddProductId);
                        const sourceProduct = destProduct ? products.find(p => p.name === destProduct.name && p.godown_id === formData.from_location) : null;
                        if (sourceProduct) {
                            affectedProducts.add(sourceProduct.product_id);

                            const srcStockData = await stockManagementService.getProductClosingQuantity(sourceProduct.product_id);
                            const srcCurrentStock = srcStockData.current_stock;
                            const srcNewStock = Math.max(0, srcCurrentStock - addQty);

                            const sourceEntryId = entryId + '-SRC';
                            await stockManagementService.create({
                                entry_id: sourceEntryId,
                                godown_id: formData.from_location,
                                product_id: sourceProduct.product_id,
                                transaction_type: 'out',
                                quantity: addQty,
                                balance_after_transaction: srcNewStock,
                                reference_number: formData.reference_number,
                                date: formData.date,
                                notes: `Transfer out to ${godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id}`,
                                transporter_id: formData.transporter_id || null,
                                lr_number: formData.lr_number || null,
                            });
                        }
                    }
                }

                // 3. Recalculate stock for all affected products
                for (const pid of affectedProducts) {
                    await stockManagementService.recalculateProductStock(pid);
                }

                // 4. Regenerate daily_stock_summary for previous dates so the cascade flows forward
                const editDate = formData.date || editingEntry.date;
                if (editDate && editDate !== today) {
                    await stockManagementService.regenerateDailySummary(editDate);
                }

                toast.success('Entry updated successfully');
            } else {
                const baseEntryId = formData.entry_id;

                let nextCount = 1;
                const lastProductId = await stockManagementService.getLastProductId();
                if (lastProductId) {
                    const match = lastProductId.match(/\d+$/);
                    if (match) {
                        nextCount = parseInt(match[0], 10) + 1;
                    }
                }

                for (let i = 0; i < formData.productItems.length; i++) {
                    const item = formData.productItems[i];
                    const entryIdSuffix = formData.productItems.length > 1 ? `-${i + 1}` : '';
                    const entryId = baseEntryId + entryIdSuffix;

                    let targetProductId = item.product_id;
                    const submittedProduct = products.find(p => p.product_id === targetProductId);

                    if (formData.transaction_type === 'in' && submittedProduct) {
                        if (submittedProduct.godown_id !== formData.godown_id) {
                            const destProduct = products.find(p => p.name === submittedProduct.name && p.godown_id === formData.godown_id);
                            if (destProduct) {
                                targetProductId = destProduct.product_id;
                            } else {
                                const newProductId = `PROD-${nextCount.toString().padStart(4, '0')}`;
                                nextCount++;

                                const newProd = await stockManagementService.createProduct({
                                    product_id: newProductId,
                                    godown_id: formData.godown_id,
                                    godown_name: godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id,
                                    name: submittedProduct.name,
                                    description: submittedProduct.description || null,
                                    unit: submittedProduct.unit || 'units',
                                    mux: submittedProduct.mux || 1,
                                    current_stock: 0,
                                    master_product_id: submittedProduct.master_product_id ?? null,
                                    product_type: submittedProduct.product_type ?? null
                                });
                                targetProductId = newProd.product_id;
                            }
                        }
                    }

                    const { current_stock: currentStock, mux } = await stockManagementService.getProductClosingQuantity(targetProductId);
                    const qty = item.quantity;
                    let newStock, openingStock, closingStock;

                    if (formData.transaction_type === 'in') {
                        newStock = currentStock + qty;
                        openingStock = currentStock;
                        closingStock = newStock;
                    } else {
                        if (currentStock < qty) {
                            toast.error(`Insufficient stock for ${getProductName(targetProductId)}`);
                            return;
                        }
                        newStock = currentStock - qty;
                        openingStock = currentStock;
                        closingStock = newStock;
                    }

                    const entryData = {
                        entry_id: entryId,
                        godown_id: formData.godown_id,
                        product_id: targetProductId,
                        transaction_type: formData.transaction_type,
                        quantity: qty,
                        balance_after_transaction: closingStock,
                        reference_number: formData.reference_number,
                        date: formData.date,
                        notes: formData.notes,
                        transporter_id: formData.transaction_type === 'in' ? (formData.transporter_id || null) : null,
                        lr_number: formData.transaction_type === 'in' ? (formData.lr_number || null) : null,
                        // 'NEW_STOCK' is a UI-only sentinel; store null in DB (FK constraint on godowns table)
                        from_location:
                            formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK'
                                ? formData.from_location
                                : null,
                        freight_amount: formData.transaction_type === 'in' && formData.freight_amount ? parseFloat(formData.freight_amount) : null,
                    };

                    await stockManagementService.create(entryData);

                    // Update products table directly
                    await stockManagementService.updateProductStock(targetProductId, newStock);

                    await stockManagementService.createNotification({
                        notification_type: formData.transaction_type === 'in' ? 'stock_in' : 'stock_out',
                        title: `Stock ${formData.transaction_type === 'in' ? 'IN' : 'OUT'}`,
                        message: `${qty} units ${formData.transaction_type === 'in' ? 'received' : 'dispatched'} at ${godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id}`,
                        product_id: targetProductId,
                        godown_id: formData.godown_id,
                        related_id: entryId
                    });

                    // If this is a transfer (stock in from another godown), also decrement source godown stock
                    if (formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK') {
                        const destProduct = products.find(p => p.product_id === targetProductId);
                        if (destProduct || targetProductId) {
                            const productName = destProduct ? destProduct.name : submittedProduct?.name;
                            const sourceProduct = products.find(p => p.name === productName && p.godown_id === formData.from_location);
                            if (sourceProduct) {
                                const { current_stock: srcCurrentStock } = await stockManagementService.getProductClosingQuantity(sourceProduct.product_id);
                                const srcNewStock = Math.max(0, srcCurrentStock - qty);
                                const sourceEntryId = entryId + '-SRC';

                                // Create source-out entry
                                await stockManagementService.create({
                                    entry_id: sourceEntryId,
                                    godown_id: formData.from_location,
                                    product_id: sourceProduct.product_id,
                                    transaction_type: 'out',
                                    quantity: qty,
                                    balance_after_transaction: srcNewStock,
                                    reference_number: formData.reference_number,
                                    date: formData.date,
                                    notes: `Transfer out to ${godowns.find(g => g.godown_id === formData.godown_id)?.name || formData.godown_id}`,
                                    transporter_id: formData.transporter_id || null,
                                    lr_number: formData.lr_number || null,
                                });

                                // Update source product stock
                                await stockManagementService.updateProductStock(sourceProduct.product_id, srcNewStock);
                            }
                        }
                    }
                }

                if (formData.date && formData.date !== today) {
                    await stockManagementService.regenerateDailySummary(formData.date);
                }

                toast.success(`${formData.productItems.length} entries created successfully`);
            }

            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error saving entry:', error);
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDelete = (entry) => {
        setItemToDelete(entry);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        if (!isEditableDate(itemToDelete.date || '')) {
            toast.error('You can only delete entries from today or yesterday');
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
            return;
        }
        const delEntryId = itemToDelete.entry_id || '';
        const delBaseId = delEntryId.endsWith('-SRC') ? delEntryId.slice(0, -4) : delEntryId;
        if (delBaseId.startsWith('STK-SAL-') || delBaseId.startsWith('ARR-')) {
            toast.error('Cannot delete entries created by sales or purchase');
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
            return;
        }
        if (delEntryId.endsWith('-SRC')) {
            toast.error('Transfer entries cannot be deleted independently');
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
            return;
        }

        setIsDeleting(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const entry = itemToDelete;
            const wasTransfer = entry.from_location && entry.transaction_type === 'in';

            const affectedProducts = new Set();
            affectedProducts.add(entry.product_id);

            // If this was a transfer, delete the -SRC entry too
            if (wasTransfer) {
                const sourceEntryId = entry.entry_id + '-SRC';
                const srcRow = await stockManagementService.getSourceEntry(sourceEntryId);
                if (srcRow) {
                    affectedProducts.add(srcRow.product_id);
                    await stockManagementService.delete(sourceEntryId);
                }
            }

            // Delete the main entry
            await stockManagementService.delete(entry.entry_id);

            // Recalculate stock for all affected products from transactions
            for (const pid of affectedProducts) {
                await stockManagementService.recalculateProductStock(pid);
            }

            if (entry.date && entry.date !== today) {
                await stockManagementService.regenerateDailySummary(entry.date);
            }

            toast.success('Entry deleted successfully');
            fetchData();
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Error deleting entry:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const getGodownName = (id) => godowns.find(g => g.godown_id === id)?.name || id;
    const getProductName = (id) => products.find(p => p.product_id === id)?.name || id;

    const filteredEntries = useMemo(() => {
        return entries.filter(e => {
            const term = searchTerm.toLowerCase().trim();
            const matchesSearch = !term || [
                e.entry_id,
                e.product_id,
                getProductName(e.product_id),
                getGodownName(e.godown_id),
                e.date,
                e.reference_number,
                e.lr_number,
                e.notes,
            ].some(field => field?.toLowerCase().includes(term));
            const matchesType = filterType === 'all' || e.transaction_type === filterType;
            const matchesGodown = filterGodown === 'all' || e.godown_id === filterGodown;
            const entryDate = e.date ? e.date.split('T')[0] : '';
            const matchesDate = !filterDate || entryDate === filterDate;
            return matchesSearch && matchesType && matchesGodown && matchesDate;
        });
    }, [entries, searchTerm, filterType, filterGodown, filterDate, getProductName, getGodownName]);

    const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredEntries, currentPage]);

    const availableProducts = useMemo(() => {
        const isTransfer = formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK';
        const targetGodownId = isTransfer ? formData.from_location : formData.godown_id;
        
        const uniqueProducts = [];
        const seenNames = new Set();
        
        for (const p of products) {
            if (!seenNames.has(p.name)) {
                seenNames.add(p.name);
                
                // Find the instance of this product in the target godown (for stock lookup)
                const targetProductInstance = targetGodownId 
                    ? products.find(dp => dp.name === p.name && dp.godown_id === targetGodownId)
                    : null;
                
                // Find the destination product instance (in To Godown) to map the destination product_id
                const destProductInstance = formData.godown_id
                    ? products.find(dp => dp.name === p.name && dp.godown_id === formData.godown_id)
                    : null;

                const prodToUse = targetProductInstance || destProductInstance || p;
                
                uniqueProducts.push({
                    ...prodToUse,
                    // If target instance doesn't exist, current stock in target godown is 0
                    current_stock: targetProductInstance ? (parseFloat(targetProductInstance.current_stock) || 0) : 0,
                    // If target instance doesn't exist, godown_id is targetGodownId
                    godown_id: targetGodownId || prodToUse.godown_id,
                    // The destination product ID is destProductInstance.product_id if it exists,
                    // otherwise we fall back to the selected product_id.
                    _destProductId: destProductInstance ? destProductInstance.product_id : prodToUse.product_id
                });
            }
        }
        
        // Filter out products already added to the form
        return uniqueProducts.filter(p => {
            const destProductId = p._destProductId || p.product_id;
            return !formData.productItems.some(item => item.product_id === destProductId);
        });
    }, [products, formData.productItems, formData.godown_id, formData.transaction_type, formData.from_location]);

    const maxQtyForSelected = useMemo(() => {
        if (!selectedProduct) return null;
        const destProduct = products.find(p => p.product_id === selectedProduct);
        if (!destProduct) return null;

        if (formData.transaction_type === 'out') {
            return parseFloat(destProduct.current_stock) || 0;
        } else if (formData.transaction_type === 'in' && formData.from_location) {
            if (formData.from_location === 'NEW_STOCK') return null;
            const sourceProduct = products.find(p => p.name === destProduct.name && p.godown_id === formData.from_location);
            return parseFloat(sourceProduct?.current_stock) || 0;
        }
        return null;
    }, [selectedProduct, formData.transaction_type, formData.from_location, products]);

    return (
        <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all text-slate-600"
                        title="Go Back"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-primary" size={20} />
                            Stock Management
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            Manage product entries and godown stock
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button 
                        onClick={() => fetchData()} 
                        disabled={loading}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border border-slate-200 transition-all disabled:opacity-50 shadow-sm"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
                        Refresh
                    </button>
                    <button 
                        onClick={() => handleOpenModal()}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-primary/95 transition-all"
                    >
                        <Plus size={14} />
                        New Entry
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto pb-24">
                {/* Simple Row Filter Bar */}
                <div className="flex items-end gap-4 flex-wrap w-full mb-4">
                    <div className="space-y-1 flex-[2] min-w-[250px] lg:max-w-[400px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Search Records</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Search by product, godown, date, LR, ref..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 bg-white border-slate-200 rounded-lg focus-visible:ring-primary text-sm font-medium w-full"
                            />
                        </div>
                    </div>

                    <div className="space-y-1 flex-1 min-w-[180px] lg:max-w-[200px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Type</label>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
                        >
                            <option value="all">All Types</option>
                            <option value="in">Stock In</option>
                            <option value="out">Stock Out</option>
                        </select>
                    </div>

                    <div className="space-y-1 flex-1 min-w-[180px] lg:max-w-[200px]">
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

                    <div className="space-y-1 min-w-[180px] lg:max-w-[220px]">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date</label>
                        <div className="flex items-center gap-1.5">
                            <DatePicker
                                value={filterDate}
                                onChange={(e) => setFilterDate(e.target.value)}
                                placeholder="Filter by date"
                                className="flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium"
                            />
                            {filterDate && (
                                <button
                                    onClick={() => setFilterDate('')}
                                    className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all flex-shrink-0"
                                    title="Clear date filter"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Standard Table View */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="overflow-x-auto custom-scrollbar min-h-[500px]">
                        {loading ? (
                            <div className="py-24 flex flex-col items-center justify-center gap-3">
                                <RefreshCw className="animate-spin text-primary" size={28} />
                                <p className="text-sm font-semibold text-slate-500">Loading entries...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse min-w-[1200px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-500">
                                    <th className="px-6 py-4 whitespace-nowrap">Date / Entry ID</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Product</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Stock Reduced From</th>
                                    <th className="px-6 py-4 whitespace-nowrap">Stock Added To</th>
                                    <th className="px-6 py-4 whitespace-nowrap text-right">Quantity</th>
                                    <th className="px-6 py-4 whitespace-nowrap text-right">Stock Impact</th>
                                    <th className="px-6 py-4 whitespace-nowrap text-center">Actions</th>
                                </tr>
                            </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {currentItems.length === 0 ? (
                                        <tr className="h-[73px]">
                                            <td colSpan="7">
                                                <div className="py-24 flex flex-col items-center justify-center gap-3">
                                                    <p className="text-sm font-semibold text-slate-500">No entries found.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        currentItems.map((e) => (
                                            <EntryRow
                                                key={e.entry_id}
                                                entry={e}
                                                user={user}
                                                getGodownName={getGodownName}
                                                getProductName={getProductName}
                                                onEdit={() => handleOpenModal(e)}
                                                onDelete={() => handleDelete(e)}
                                            />
                                        ))
                                    )}
                                    {Array.from({ length: Math.max(0, ITEMS_PER_PAGE - currentItems.length) }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="h-[73px]"><td colSpan="7"></td></tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {!loading && filteredEntries.length > 0 && (
                        <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                            <span className="text-sm font-medium text-slate-500">
                                Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)}</span> of <span className="font-semibold text-slate-700">{filteredEntries.length}</span> records
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                                >
                                    Previous
                                </button>
                                <div className="flex items-center gap-1 px-2">
                                    {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                        let pageNum = currentPage;
                                        if (totalPages <= 5) pageNum = i + 1;
                                        else if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg text-sm font-bold transition-all",
                                                    currentPage === pageNum
                                                        ? "bg-primary text-white"
                                                        : "bg-white text-slate-600 hover:bg-slate-50 hover:text-primary"
                                                )}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleCloseModal}></div>
                    <div className="relative bg-white rounded-2xl shadow-xl w-full sm:max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingEntry ? 'Edit Entry' : 'New Stock Entry'}
                            </h2>
                            <Button variant="ghost" size="icon" type="button" onClick={handleCloseModal} className="rounded-full text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-8">
                                <div className="w-full md:w-[350px] space-y-5 shrink-0">
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-slate-700">Transaction Type <span className="text-red-500">*</span></label>
                                            <div className="flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'in' }))}
                                                    className={cn(
                                                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                        formData.transaction_type === 'in'
                                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100'
                                                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200 hover:text-slate-500'
                                                    )}
                                                >
                                                    <ArrowDown size={18} strokeWidth={2.5} />
                                                    Stock In
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'out' }))}
                                                    className={cn(
                                                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                                                        formData.transaction_type === 'out'
                                                            ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100'
                                                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200 hover:text-slate-500'
                                                    )}
                                                >
                                                    <ArrowUp size={18} strokeWidth={2.5} />
                                                    Stock Out
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700">Date <span className="text-red-500">*</span></label>
                                            <DatePicker
                                                value={formData.date}
                                                onChange={handleDateChange}
                                                disabled={(date) => {
                                                    const today = new Date();
                                                    const yesterday = new Date(Date.now() - 86400000);
                                                    const normalize = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                                    return normalize(date) !== normalize(today) && normalize(date) !== normalize(yesterday);
                                                }}
                                            />
                                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">You can add entries for today or yesterday</p>
                                        </div>

                                        {formData.transaction_type === 'in' && (
                                            <div className="space-y-1.5">
                                                <label className="block text-sm font-medium text-slate-700">From Location <span className="text-red-500">*</span></label>
                                                <SearchableSelect
                                                    options={[
                                                        { value: 'NEW_STOCK', label: '✨ New Stock (From System)' },
                                                        ...godowns.filter(g => g.godown_id !== formData.godown_id).map(g => ({ value: g.godown_id, label: g.name }))
                                                    ]}
                                                    value={formData.from_location}
                                                    onChange={(val) => setFormData(prev => ({ 
                                                        ...prev, 
                                                        from_location: val, 
                                                        // Only reset products when creating a new entry
                                                        productItems: editingEntry ? prev.productItems : [] 
                                                    }))}
                                                    placeholder="Select Location"
                                                    searchPlaceholder="Search locations..."
                                                    error={errors.from_location}
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label className="block text-sm font-medium text-slate-700">
                                                {formData.transaction_type === 'in' ? 'To Godown' : 'From Godown'} <span className="text-red-500">*</span>
                                            </label>
                                            <SearchableSelect
                                                options={godowns.filter(g => g.godown_id !== formData.from_location).map(g => ({ value: g.godown_id, label: g.name }))}
                                                value={formData.godown_id}
                                                onChange={(val) => {
                                                    setFormData(prev => {
                                                        // In edit mode keep products; only clear when creating new entry
                                                        const shouldClear = !editingEntry && (
                                                            prev.transaction_type === 'out' ||
                                                            (prev.transaction_type === 'in' && !prev.from_location)
                                                        );
                                                        return { 
                                                            ...prev, 
                                                            godown_id: val, 
                                                            productItems: shouldClear ? [] : prev.productItems 
                                                        };
                                                    });
                                                    if (!editingEntry) setSelectedProduct('');
                                                }}
                                                placeholder={`Select ${formData.transaction_type === 'in' ? 'To Godown' : 'From Godown'}`}
                                                searchPlaceholder="Search godowns..."
                                                error={errors.godown_id}
                                            />
                                        </div>

                                        {formData.transaction_type === 'in' && (
                                            <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                    <Truck size={16} />
                                                    Transporter Details
                                                </h3>

                                                <div className="space-y-1.5">
                                                    <label className="block text-sm font-medium text-slate-700">Transporter Name</label>
                                                    <SearchableSelect
                                                        options={transporters.map(t => ({ value: t.transporter_id, label: t.name }))}
                                                        value={formData.transporter_id}
                                                        onChange={(val) => setFormData(prev => ({ ...prev, transporter_id: val }))}
                                                        placeholder="Select Transporter"
                                                        searchPlaceholder="Search transporters..."
                                                        error={errors.transporter_id}
                                                    />
                                                </div>

                                                <FormField
                                                    label="LR Number" name="lr_number" value={formData.lr_number}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter LR Number"
                                                    error={errors.lr_number}
                                                />

                                                <FormField
                                                    label="Freight Amount" name="freight_amount" type="number" value={formData.freight_amount}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter freight amount"
                                                />
                                            </div>
                                        )}
                                </div>
                                <div className="flex-1 space-y-3 flex flex-col min-w-0">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-sm font-medium text-slate-700">
                                                    Products <span className="text-red-500">*</span>
                                                </label>
                                                {formData.productItems.length > 0 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setFormData(prev => ({ ...prev, productItems: [] }))}
                                                        className="h-auto p-0 text-xs text-slate-500 hover:text-red-500"
                                                    >
                                                        Clear All
                                                    </Button>
                                                )}
                                            </div>
                                            {errors.productItems && (
                                                <p className="text-red-500 text-xs">{errors.productItems}</p>
                                            )}

                                            <div className="flex flex-col gap-3 p-3 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 hover:border-primary/50 transition-colors">
                                                {((formData.transaction_type === 'in' && !formData.from_location && !formData.godown_id) || (formData.transaction_type === 'out' && !formData.godown_id)) && (
                                                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 flex items-center gap-2">
                                                        <span>Please select a location above to add products.</span>
                                                    </div>
                                                )}
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <SearchableSelect
                                                            dropdownWidth={450}
                                                            options={availableProducts.map(p => {
                                                                return {
                                                                    value: p._destProductId || p.product_id, 
                                                                    label: p.name,
                                                                    stock: p.current_stock || 0,
                                                                    godownId: p.godown_id
                                                                };
                                                            })}
                                                            renderOption={(option) => {
                                                                const godownName = godowns.find(g => g.godown_id === option.godownId)?.name || 'Unknown Godown';
                                                                return (
                                                                    <div className="flex items-center justify-between w-full gap-4">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <span className="text-sm font-medium truncate text-slate-800">{option.label}</span>
                                                                            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                                                In: {godownName}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Stock:</span>
                                                                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 min-w-[2.5rem] text-center">
                                                                                {parseFloat(option.stock).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }}
                                                            value={selectedProduct}
                                                            onChange={(val) => setSelectedProduct(val)}
                                                            placeholder="Search and select product..."
                                                            searchPlaceholder="Search products..."
                                                            disabled={(formData.transaction_type === 'in' && !formData.from_location && !formData.godown_id) || (formData.transaction_type === 'out' && !formData.godown_id)}
                                                        />
                                                    </div>
                                                    <div className="w-28">
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={selectedQty}
                                                            onChange={(e) => {
                                                                let val = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                                                                if (val !== '' && maxQtyForSelected !== null && val > maxQtyForSelected) {
                                                                    val = maxQtyForSelected;
                                                                    toast.error(`Maximum available stock is ${maxQtyForSelected}`);
                                                                }
                                                                setSelectedQty(val);
                                                            }}
                                                            placeholder="Qty"
                                                            className="h-10 text-center font-medium"
                                                            disabled={(formData.transaction_type === 'in' && !formData.from_location && !formData.godown_id) || (formData.transaction_type === 'out' && !formData.godown_id)}
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        onClick={addProductItem}
                                                        className="h-10 px-4"
                                                        disabled={!selectedProduct || !selectedQty || ((formData.transaction_type === 'in' && !formData.from_location && !formData.godown_id) || (formData.transaction_type === 'out' && !formData.godown_id))}
                                                    >
                                                        <Plus size={18} />
                                                        <span className="ml-1">Add</span>
                                                    </Button>
                                                </div>
                                                {selectedProduct && (
                                                    <div className="flex gap-4 px-3 py-2 bg-white rounded-md border border-slate-200 text-xs shadow-sm">
                                                        {(() => {
                                                            const destProduct = products.find(p => p.product_id === selectedProduct);
                                                            const qty = parseInt(selectedQty) || 0;
                                                            let destCurrentStock = parseFloat(destProduct?.current_stock) || 0;
                                                            let destNewStock = formData.transaction_type === 'in' ? destCurrentStock + qty : destCurrentStock - qty;

                                                            let sourceProduct = null;
                                                            let sourceCurrentStock = 0;
                                                            let sourceNewStock = 0;
                                                            if (formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK') {
                                                                    sourceProduct = products.find(p => p.name === destProduct?.name && p.godown_id === formData.from_location);
                                                                    sourceCurrentStock = parseFloat(sourceProduct?.current_stock) || 0;
                                                                    sourceNewStock = sourceCurrentStock - qty;
                                                            }

                                                            return (
                                                                <div className="flex flex-col gap-1.5 w-full">
                                                                    <div className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider">Live Stock Preview</div>
                                                                    {formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK' && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-rose-600 font-medium">From {getGodownName(formData.from_location)}:</span>
                                                                            <span className="flex items-center gap-2 font-medium">
                                                                                <span className="text-slate-500">{sourceCurrentStock}</span>
                                                                                <ArrowRight size={12} className="text-slate-400" />
                                                                                <span className={sourceNewStock < 0 ? "text-red-500" : "text-slate-800"}>{sourceNewStock}</span>
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center justify-between">
                                                                        <span className={formData.transaction_type === 'in' ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                                                                            {formData.transaction_type === 'in' ? `To ${getGodownName(formData.godown_id)}:` : `From ${getGodownName(formData.godown_id)}:`}
                                                                        </span>
                                                                        <span className="flex items-center gap-2 font-medium">
                                                                            <span className="text-slate-500">{destCurrentStock}</span>
                                                                            <ArrowRight size={12} className="text-slate-400" />
                                                                            <span className={destNewStock < 0 ? "text-red-500" : "text-slate-800"}>{destNewStock}</span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>

                                            {formData.productItems.length === 0 ? (
                                                <div className="text-center py-8 px-4 bg-slate-50 rounded-lg border border-slate-200">
                                                    <Package className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                                                    <p className="text-sm text-slate-500">No products added yet</p>
                                                    <p className="text-xs text-slate-400 mt-1">Select products above to add them</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between px-1">
                                                        <span className="text-xs text-slate-500">{formData.productItems.length} product(s) selected</span>
                                                        <span className="text-xs text-slate-500 font-medium">
                                                            Total Qty: {formData.productItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)}
                                                        </span>
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                        {formData.productItems.map((item) => {
                                                            const product = products.find(p => p.product_id === item.product_id);
                                                            return (
                                                                <div
                                                                    key={item.product_id}
                                                                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group"
                                                                >
                                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                                        <Package size={14} className="text-primary" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium text-slate-900 truncate">
                                                                            {getProductName(item.product_id)}
                                                                        </p>
                                                                        <div className="mt-1 space-y-1">
                                                                            {(() => {
                                                                                const destProduct = products.find(p => p.product_id === item.product_id);
                                                                                const qty = parseInt(item.quantity) || 0;
                                                                                let destCurrentStock = parseFloat(destProduct?.current_stock) || 0;
                                                                                
                                                                                let baseDestStock = destCurrentStock;
                                                                                if (editingEntry) {
                                                                                    if (editingEntry.transaction_type === 'in') {
                                                                                        baseDestStock = destCurrentStock - editingEntry.quantity;
                                                                                    } else {
                                                                                        baseDestStock = destCurrentStock + editingEntry.quantity;
                                                                                    }
                                                                                }
                                                                                let destNewStock = formData.transaction_type === 'in' ? baseDestStock + qty : baseDestStock - qty;
                                                                    
                                                                                let sourceProduct = null;
                                                                                let sourceCurrentStock = 0;
                                                                                let baseSourceStock = 0;
                                                                                let sourceNewStock = 0;
                                                                                if (formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK') {
                                                                                    sourceProduct = products.find(p => p.name === destProduct?.name && p.godown_id === formData.from_location);
                                                                                    sourceCurrentStock = parseFloat(sourceProduct?.current_stock) || 0;
                                                                                    
                                                                                    baseSourceStock = sourceCurrentStock;
                                                                                    if (editingEntry && editingEntry.from_location === formData.from_location) {
                                                                                        baseSourceStock = sourceCurrentStock + editingEntry.quantity;
                                                                                    }
                                                                                    sourceNewStock = baseSourceStock - qty;
                                                                                }
                                                                    
                                                                                return (
                                                                                    <>
                                                                                        {formData.transaction_type === 'in' && formData.from_location && formData.from_location !== 'NEW_STOCK' && (
                                                                                            <div className="text-[11px] flex items-center justify-between max-w-[200px]">
                                                                                                <span className="text-rose-600 font-medium">From {getGodownName(formData.from_location)}:</span>
                                                                                                <span className="flex items-center gap-1.5 font-medium">
                                                                                                    <span className="text-slate-500">{baseSourceStock}</span>
                                                                                                    <ArrowRight size={10} className="text-slate-400" />
                                                                                                    <span className={sourceNewStock < 0 ? "text-red-500" : "text-slate-700"}>{sourceNewStock}</span>
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="text-[11px] flex items-center justify-between max-w-[200px]">
                                                                                            <span className={formData.transaction_type === 'in' ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                                                                                                {formData.transaction_type === 'in' ? `To ${getGodownName(formData.godown_id)}:` : `From ${getGodownName(formData.godown_id)}:`}
                                                                                            </span>
                                                                                            <span className="flex items-center gap-1.5 font-medium">
                                                                                                <span className="text-slate-500">{baseDestStock}</span>
                                                                                                <ArrowRight size={10} className="text-slate-400" />
                                                                                                <span className={destNewStock < 0 ? "text-red-500" : "text-slate-700"}>{destNewStock}</span>
                                                                                            </span>
                                                                                        </div>
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateProductQty(item.product_id, Math.max(1, (parseInt(item.quantity) || 1) - 1))}
                                                                                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                                                                            >
                                                                                <span className="text-sm font-medium">−</span>
                                                                            </button>
                                                                            <Input
                                                                                type="number"
                                                                                min="1"
                                                                                value={item.quantity}
                                                                                onChange={(e) => updateProductQty(item.product_id, e.target.value)}
                                                                                className="w-16 h-8 text-center font-medium text-sm"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateProductQty(item.product_id, (parseInt(item.quantity) || 1) + 1)}
                                                                                className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                                                                            >
                                                                                <span className="text-sm font-medium">+</span>
                                                                            </button>
                                                                        </div>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => removeProductItem(item.product_id)}
                                                                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                                                        >
                                                                            <X size={14} />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                            </form>
                                </div>

                                <div className="p-4 sm:px-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                                    <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors text-sm sm:text-base">Cancel</Button>
                                    <Button onClick={handleSubmit} className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors shadow-sm text-sm sm:text-base">
                                        {editingEntry ? 'Save Changes' : 'Create Entry'}
                                    </Button>
                                </div>
                    </div>
                </div>
            )}
                <DeleteModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="Delete Stock Entry"
                    description="Are you sure you want to delete this stock entry? This will permanently remove the record from history."
                    itemLabel={itemToDelete?.entry_id}
                    loading={isDeleting}
                />
        </div>
    );
};

export default StockManagement;

const FormField = ({ label, className = "", ...props }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">{label} {props.required && <span className="text-red-500">*</span>}</label>
        <Input className={`h-10 w-full ${className}`} {...props} />
        {props.error && <p className="text-red-500 text-xs mt-1">{props.error}</p>}
    </div>
);

const EntryRow = ({ entry, user, getGodownName, getProductName, onEdit, onDelete }) => {
    // A "transfer" is a Stock-In that came from a real godown (not NEW_STOCK and not null)
    const isTransfer = entry.transaction_type === 'in' && entry.from_location && entry.from_location !== 'NEW_STOCK';
    const isOut = entry.transaction_type === 'out';

    // Guard: only today/yesterday entries that are direct stock entries can be edited/deleted
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const entryDate = entry.date || '';
    const isEditable = entryDate === today || entryDate === yesterday;
    const entryId = entry.entry_id || '';
    const isSRC = entryId.endsWith('-SRC');
    const baseId = isSRC ? entryId.slice(0, -4) : entryId;
    const isFromSellOrPurchase = baseId.startsWith('STK-SAL-') || baseId.startsWith('ARR-');
    const canEditDelete = !isSRC && !isFromSellOrPurchase && isEditable;

    return (
        <tr className={cn(
            "transition-colors h-[73px]",
            canEditDelete ? "hover:bg-slate-50 group" : "opacity-50"
        )}>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        isTransfer ? "bg-blue-50 text-blue-600" : (entry.transaction_type === 'in' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")
                    )}>
                        {isTransfer ? <ArrowRight size={10} /> : (entry.transaction_type === 'in' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                        {isTransfer ? 'Transfer' : entry.transaction_type}
                    </span>
                </div>
                <div className="font-medium text-slate-700 mt-1 text-sm">{entry.date}</div>
                <div className="font-mono text-[10px] text-slate-400 mt-0.5">{entry.entry_id}</div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <span className="font-semibold text-slate-800">{getProductName(entry.product_id)}</span>
                {entry.reference_number && (
                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">Ref: {entry.reference_number}</div>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                {isTransfer ? (
                    <span className="text-sm text-slate-700">
                        <span className="font-semibold">{getGodownName(entry.from_location)}</span>
                        <span className="text-slate-400 mx-1.5">—</span>
                            <span className="text-slate-500">{(parseFloat(entry.balance_after_transaction || 0) + parseFloat(entry.quantity || 0)).toLocaleString()} → -{parseFloat(entry.quantity || 0).toLocaleString()} = {parseFloat(entry.balance_after_transaction || 0).toLocaleString()}</span>
                        </span>
                    ) : isOut ? (
                        <span className="text-sm text-slate-700">
                            <span className="font-semibold">{getGodownName(entry.godown_id)}</span>
                            <span className="text-slate-400 mx-1.5">—</span>
                            <span className="text-slate-500">{(parseFloat(entry.balance_after_transaction || 0) + parseFloat(entry.quantity || 0)).toLocaleString()} → -{parseFloat(entry.quantity || 0).toLocaleString()} = {parseFloat(entry.balance_after_transaction || 0).toLocaleString()}</span>
                    </span>
                ) : entry.transaction_type === 'in' && entry.from_location === 'NEW_STOCK' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">✨ New Stock (From System)</span>
                ) : (
                    <span className="text-sm text-slate-400 italic">External / Purchase</span>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                {isTransfer || entry.transaction_type === 'in' ? (
                    <span className="text-sm text-slate-700">
                        <span className="font-semibold">{getGodownName(entry.godown_id)}</span>
                        <span className="text-slate-400 mx-1.5">—</span>
                            <span className="text-slate-500">{(parseFloat(entry.balance_after_transaction || 0) - parseFloat(entry.quantity || 0)).toLocaleString()} → +{parseFloat(entry.quantity || 0).toLocaleString()} = {parseFloat(entry.balance_after_transaction || 0).toLocaleString()}</span>
                    </span>
                ) : (
                    <span className="text-sm text-slate-400 italic">Dispatch / Out</span>
                )}
            </td>
            <td className="px-6 py-4 text-right whitespace-nowrap">
                <span className="font-bold text-slate-700">{parseFloat(entry.quantity).toLocaleString()}</span>
                <span className="text-xs text-slate-400 font-normal ml-1">Bags</span>
            </td>
            <td className="px-6 py-4 text-right whitespace-nowrap">
                {entry.transaction_type === 'in' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-sm">
                        <ArrowDown size={14} strokeWidth={2.5} />
                        +{entry.quantity}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-sm">
                        <ArrowUp size={14} strokeWidth={2.5} />
                        -{entry.quantity}
                    </span>
                )}
            </td>
            <td className="px-6 py-4 text-center whitespace-nowrap">
                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {canEditDelete && (
                        <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Edit">
                            <Edit2 size={16} />
                        </button>
                    )}
                    {canEditDelete && (user?.role === 'SUPER ADMIN' || user?.Admin === 'Yes') && (
                        <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};


