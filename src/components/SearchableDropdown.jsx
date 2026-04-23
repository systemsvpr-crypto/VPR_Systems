import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const SearchableDropdown = ({
    value,
    onChange,
    options,
    placeholder = "Select...",
    allLabel = "All",
    className = "",
    focusColor = "primary",
    showAll = true
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setFocusedIndex(-1);
        }
    }, [isOpen]);

    useEffect(() => {
        setFocusedIndex(-1);
    }, [searchTerm]);

    const filteredOptions = options.filter(opt =>
        String(opt).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const allItems = showAll ? ['', ...filteredOptions] : filteredOptions;

    const handleSelect = (opt) => {
        onChange(opt);
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < allItems.length) {
                    handleSelect(allItems[focusedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    useEffect(() => {
        if (focusedIndex >= 0 && listRef.current) {
            const focusedElement = listRef.current.children[focusedIndex];
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [focusedIndex]);

    const displayValue = value || (showAll ? allLabel : placeholder);

    return (
        <div ref={dropdownRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded text-sm font-medium text-gray-700 hover:border-gray-300 transition-all focus:ring-2 focus:ring-primary outline-none shadow-sm shadow-black/5`}
            >
                <span className={`truncate ${!value && !showAll ? 'text-gray-400' : 'text-gray-700'}`}>
                    {displayValue}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 ease-out origin-top font-sans">
                    <div className="p-2 border-b border-gray-50 bg-gray-50/30">
                        <div className="relative group">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search..."
                                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-100 rounded-lg focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 p-1 transition-all"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div
                        ref={listRef}
                        className="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-0.5 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                    >
                        {allItems.map((opt, idx) => {
                            const isAllOption = showAll && idx === 0 && opt === '';
                            const label = isAllOption ? allLabel : opt;
                            const isSelected = value === opt;
                            const isFocused = focusedIndex === idx;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelect(opt)}
                                    className={`w-full text-left px-3.5 py-2.5 text-sm rounded-lg transition-all whitespace-normal ${
                                        isFocused ? `bg-primary/10 text-primary shadow-sm` :
                                        isSelected ? `bg-primary/5 text-primary font-bold border-l-2 border-primary` :
                                        'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                        {allItems.length === 0 && (
                            <div className="px-4 py-6 text-center">
                                <Search size={20} className="mx-auto text-gray-200 mb-2" />
                                <p className="text-[11px] text-gray-400 font-medium italic">No results found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
