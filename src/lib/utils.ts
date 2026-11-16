import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseDecimal(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  const cleanedVal = val.trim();
  if (cleanedVal === '') return 0;

  // If there are both commas and a dot (e.g. "1,000.25"), remove commas and parse
  if (cleanedVal.includes(',') && cleanedVal.includes('.')) {
    return parseFloat(cleanedVal.replace(/,/g, ''));
  }

  // If there is only commas (e.g. "1,000,25" or "10,5")
  if (cleanedVal.includes(',')) {
    const parts = cleanedVal.split(',');
    if (parts.length === 2) {
      // Single comma, e.g. "10,5" or "100,75" - treat as decimal point
      return parseFloat(cleanedVal.replace(',', '.'));
    } else {
      // Multiple commas, e.g. "1,000,25" - the last comma is the decimal point, others are thousands grouping
      const lastCommaIndex = cleanedVal.lastIndexOf(',');
      const beforeLast = cleanedVal.substring(0, lastCommaIndex).replace(/,/g, '');
      const afterLast = cleanedVal.substring(lastCommaIndex + 1);
      return parseFloat(`${beforeLast}.${afterLast}`);
    }
  }

  return parseFloat(cleanedVal);
}

export function formatNumber(val: number | string | undefined | null, decimals: number = 2, forceDecimals: boolean = false, useGrouping: boolean = false) {
  if (val === undefined || val === null || val === '') return '0';
  
  const num = parseDecimal(val);

  if (isNaN(num)) return '0';
  
  const fixed = num.toFixed(decimals);
  const parts = fixed.split('.');
  const intPart = parts[0];
  const fracPart = parts[1] || '';
  
  // Only add thousands separator if explicitly requested
  const formattedInt = useGrouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  
  if (decimals === 0) {
    return formattedInt;
  }

  if (forceDecimals) {
    return `${formattedInt}.${fracPart}`;
  } else {
    const result = `${formattedInt}.${fracPart}`;
    const trimmed = result.replace(/\.?0+$/, '');
    return trimmed === '' ? '0' : trimmed;
  }
}

/**
 * Returns a number formatted as a string suitable for <input type="number">
 * (No commas, fixed decimals if requested)
 */
export function formatNumberInput(val: number | string | undefined | null, decimals: number = 2) {
  if (val === undefined || val === null || val === '') return '';
  
  const num = parseDecimal(val);

  if (isNaN(num)) return '';
  
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}
