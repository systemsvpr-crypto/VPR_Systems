import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Pagination = ({ currentPage, totalPages, totalItems, startIndex, endIndex, onPageChange, className }) => {
    return (
        <div className={cn("flex flex-col sm:flex-row items-center justify-between p-4 gap-4", className)}>
            <p className="text-sm text-slate-500">
                {totalItems === 0 ? (
                    <span className="font-medium text-slate-900">No results</span>
                ) : (
                    <>Showing <span className="font-medium text-slate-900">{startIndex}</span> to{' '}
                    <span className="font-medium text-slate-900">{endIndex}</span> of{' '}
                    <span className="font-medium text-slate-900">{totalItems}</span> results</>
                )}
            </p>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="h-9 w-9 border-slate-200"
                >
                    <span className="text-slate-600">‹</span>
                </Button>
                <span className="text-sm font-medium">{currentPage} / {Math.max(totalPages, 1)}</span>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || totalPages === 0}
                    className="h-9 w-9 border-slate-200"
                >
                    <span className="text-slate-600">›</span>
                </Button>
            </div>
        </div>
    );
};

export default Pagination;
