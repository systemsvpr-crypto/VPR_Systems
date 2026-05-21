import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SearchableSelect = ({
    options = [],
    value,
    onChange,
    placeholder = 'Select an option',
    searchPlaceholder = 'Search...',
    disabled = false,
    className = '',
    error = null,
    renderOption = null,
    popperPlacement = 'auto',
    dropdownWidth = null,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [placement, setPlacement] = useState('bottom');
    const [dropdownStyle, setDropdownStyle] = useState({});
    const containerRef = useRef(null);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        opt.label?.toLowerCase().includes(search.toLowerCase()) ||
        opt.name?.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                containerRef.current && 
                !containerRef.current.contains(event.target) &&
                (!dropdownRef.current || !dropdownRef.current.contains(event.target))
            ) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const updatePosition = () => {
                const rect = containerRef.current.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const dropdownHeight = 280;
                const spaceBelow = viewportHeight - rect.bottom;
                const spaceAbove = rect.top;

                let currentPlacement = 'bottom';
                if (popperPlacement === 'auto') {
                    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                        currentPlacement = 'top';
                    }
                } else {
                    currentPlacement = popperPlacement;
                }
                setPlacement(currentPlacement);

                let width = rect.width;
                let left = rect.left;
                if (dropdownWidth) {
                    const parsedWidth = typeof dropdownWidth === 'number' ? dropdownWidth : parseInt(dropdownWidth) || 350;
                    width = Math.max(rect.width, parsedWidth);
                    left = Math.min(rect.left, window.innerWidth - width - 16);
                    left = Math.max(16, left);
                }

                setDropdownStyle({
                    position: 'fixed',
                    left: left,
                    width: width,
                    zIndex: 99999,
                    ...(currentPlacement === 'top' 
                        ? { bottom: viewportHeight - rect.top + 4 }
                        : { top: rect.bottom + 4 }
                    )
                });
            };

            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isOpen, popperPlacement]);

    const handleSelect = (option) => {
        onChange(option.value);
        setIsOpen(false);
        setSearch('');
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange('');
    };

    return (
        <div ref={containerRef} className={cn('relative w-full', className)}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    'flex items-center justify-between w-full h-10 px-3 py-2 text-sm rounded-lg border bg-white transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                    isOpen && 'border-primary ring-2 ring-primary/20',
                    error ? 'border-red-300 focus:border-red-500' : 'border-slate-300',
                    disabled && 'bg-slate-50 cursor-not-allowed opacity-50'
                )}
            >
                <span className={cn('truncate', !selectedOption && 'text-slate-400')}>
                    {selectedOption?.label || selectedOption?.name || placeholder}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    {selectedOption && !disabled && (
                        <X
                            size={14}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            onClick={handleClear}
                        />
                    )}
                    <ChevronDown
                        size={14}
                        className={cn(
                            'text-slate-400 transition-transform',
                            isOpen && 'rotate-180'
                        )}
                    />
                </div>
            </button>

            {isOpen && createPortal(
                <div 
                    ref={dropdownRef}
                    className={cn(
                        'bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100',
                        placement === 'top' && 'origin-bottom'
                    )}
                    style={dropdownStyle}
                >
                    <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-6 text-center text-sm text-slate-400">
                                No options found
                            </div>
                        ) : (
                            filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option)}
                                    className={cn(
                                        'flex items-center justify-between w-full px-3 py-2 text-sm text-left transition-colors',
                                        'hover:bg-slate-50',
                                        value === option.value && 'bg-primary/5 text-primary'
                                    )}
                                >
                                    {renderOption ? renderOption(option) : (
                                        <span className="truncate">
                                            {option.label || option.name}
                                        </span>
                                    )}
                                    {value === option.value && (
                                        <Check size={14} className="shrink-0 text-primary" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>,
                document.body
            )}

            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
    );
};

export default SearchableSelect;
