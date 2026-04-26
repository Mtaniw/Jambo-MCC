import React from 'react';
import { getResazurinGrade } from '../lib/qualityConstants';
import { cn } from '../lib/utils';
import { Beaker } from 'lucide-react';

interface ResazurinBadgeProps {
  value: string | number;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ResazurinBadge({ value, showDetails = true, size = 'md', className }: ResazurinBadgeProps) {
  const grade = getResazurinGrade(value);
  if (!value) return <span className="text-on-surface-variant/30 italic text-xs">Pending</span>;

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[8px] gap-1",
    md: "px-2.5 py-1 text-[10px] gap-1.5",
    lg: "px-4 py-2 text-xs gap-2"
  };

  const dotSizes = {
    sm: "h-1.5 w-1.5",
    md: "h-2.5 w-2.5",
    lg: "h-4 w-4"
  };

  return (
    <div className={cn(
      "inline-flex items-center rounded-full font-black uppercase tracking-wider border shadow-sm transition-all",
      "bg-white", // Solid white background for contrast
      grade.color, // text color
      grade.color.replace('text-', 'border-').split('-')[0] + '-' + grade.color.replace('text-', 'border-').split('-')[1] + '/30', // border color with opacity
      sizeClasses[size],
      className
    )}>
      <div 
        className={cn("rounded-full shadow-inner", dotSizes[size])}
        style={{ backgroundColor: grade.dotColor }}
      />
      <span>Grade {grade.value}</span>
      {showDetails && (
        <>
          <span className="opacity-40">|</span>
          <span>{grade.description}</span>
        </>
      )}
    </div>
  );
}
