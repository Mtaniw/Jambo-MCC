import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { safeFormat } from '../lib/dateUtils';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export function DateInput({ value, onChange, label, className }: DateInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative flex flex-col gap-0.5 min-w-[120px]", className)}>
      {label && (
        <label className="text-[9px] font-bold uppercase tracking-tight opacity-50 px-1 select-none">
          {label}
        </label>
      )}
      <div 
        className="relative group h-9 flex items-center"
        onClick={() => inputRef.current?.showPicker?.()}
      >
        {/* The UI Layer: Styled to look like the rest of the app */}
        <div className="flex items-center gap-2 bg-white/40 px-3 h-full w-full rounded-lg border border-black/5 group-hover:border-primary/20 transition-all pointer-events-none">
          <Calendar size={14} className="text-primary flex-shrink-0" />
          <span className="text-xs font-bold text-on-surface whitespace-nowrap">
            {value ? safeFormat(value, 'dd/MM/yyyy') : 'Select'}
          </span>
        </div>
        
        {/* The Native Layer: High z-index but invisible, handles the interaction */}
        <input 
          ref={inputRef}
          type="date" 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
          style={{ appearance: 'none', WebkitAppearance: 'none' }}
        />
      </div>
    </div>
  );
}
