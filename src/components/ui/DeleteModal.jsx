import React from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

const DeleteModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title = "Delete Item", 
    description = "Are you sure you want to delete this item? This action cannot be undone.",
    itemLabel = "",
    loading = false 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" 
                onClick={onClose}
            ></div>
            
            {/* Modal Content */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex items-start justify-between mb-5">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                            <Trash2 size={24} />
                        </div>
                        <button 
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            {description}
                            {itemLabel && (
                                <span className="block mt-2 font-semibold text-slate-700 italic">
                                    "{itemLabel}"
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="mt-6 flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                        <p className="text-[11px] text-amber-700 font-medium">
                            Warning: This operation is permanent and data cannot be recovered.
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        disabled={loading}
                        className="w-full sm:flex-1 bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={onConfirm}
                        disabled={loading}
                        className="w-full sm:flex-1 bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-200 transition-all active:scale-[0.98]"
                    >
                        {loading ? 'Deleting...' : 'Confirm Delete'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DeleteModal;
