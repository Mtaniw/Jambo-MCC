import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface TypeAheadProps<T> {
  items: T[];
  onSelect: (item: T) => void;
  labelExtractor: (item: T) => string;
  subLabelExtractor?: (item: T) => string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  defaultValue?: string;
  onClear?: () => void;
  disabled?: boolean;
}

export function TypeAhead<T>({
  items,
  onSelect,
  labelExtractor,
  subLabelExtractor,
  placeholder = "Search...",
  className,
  required = false,
  defaultValue = "",
  onClear,
  disabled = false
}: TypeAheadProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(defaultValue);
  const [filteredItems, setFilteredItems] = useState<T[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredItems([]);
      return;
    }

    const filtered = items.filter(item => 
      labelExtractor(item).toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 10);
    
    setFilteredItems(filtered);
  }, [searchTerm, items, labelExtractor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: T) => {
    setSearchTerm(labelExtractor(item));
    onSelect(item);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearchTerm("");
    if (onClear) onClear();
    setIsOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (!e.target.value && onClear) onClear();
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={cn(
            "w-full bg-surface-container-low border-none rounded-lg text-sm pl-9 pr-9 py-2 focus:ring-2 focus:ring-primary/20 transition-all",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50" size={16} />
        {searchTerm && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-error transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && filteredItems.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-outline-variant/20 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          {filteredItems.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-outline-variant/5 last:border-none"
            >
              <p className="font-bold text-sm text-on-surface">{labelExtractor(item)}</p>
              {subLabelExtractor && (
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium mt-0.5">
                  {subLabelExtractor(item)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && searchTerm && filteredItems.length === 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-outline-variant/20 rounded-lg shadow-xl p-4 text-center animate-in fade-in zoom-in-95 duration-100">
          <p className="text-xs text-on-surface-variant italic">No matches found</p>
        </div>
      )}
    </div>
  );
}
