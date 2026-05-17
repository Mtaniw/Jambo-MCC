import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(val: number | string | undefined | null, decimals: number = 2, forceDecimals: boolean = false) {
  if (val === undefined || val === null || val === '') return '0';
  
  let num: number;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '');
    num = parseFloat(cleaned);
  } else {
    num = val;
  }

  if (isNaN(num)) return '0';
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: forceDecimals ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Returns a number formatted as a string suitable for <input type="number">
 * (No commas, fixed decimals if requested)
 */
export function formatNumberInput(val: number | string | undefined | null, decimals: number = 2) {
  if (val === undefined || val === null || val === '') return '';
  
  let num: number;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '');
    num = parseFloat(cleaned);
  } else {
    num = val;
  }

  if (isNaN(num)) return '';
  
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}
