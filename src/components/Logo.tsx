import React from 'react';
import { useSettings } from '../hooks/useSettings';
import { cn } from '../lib/utils';

interface LogoProps {
  variant?: 'red' | 'white';
  className?: string;
}

export function Logo({ variant = 'red', className }: LogoProps) {
  const { settings } = useSettings();

  const primaryLogo = settings.logoUrl;
  const logoRed = settings.logoRed || primaryLogo;
  const logoWhite = settings.logoWhite || primaryLogo;

  const src = variant === 'red' ? logoRed : logoWhite;

  return (
    <img 
      src={src} 
      alt={settings.companyName || "JAMBO GROUP"} 
      className={cn("h-16 w-auto object-contain", className)}
      referrerPolicy="no-referrer"
    />
  );
}
