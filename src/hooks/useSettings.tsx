import { useState, useEffect } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export type DairyProductCategory =
  | 'UHT Long-Life Milk'
  | 'Fresh Yogurts'
  | 'Traditional Cultured';

export type HomepageSectionId =
  | 'hero'
  | 'farmers'
  | 'staff'
  | 'products'
  | 'wholesale'
  | 'impact';

export interface HomepageSectionConfig {
  id: HomepageSectionId;
  label: string;
  description: string;
  enabled: boolean;
}

export interface FarmerStepItem {
  id: string;
  stepNumber: string;
  metaText: string;
  accentTone: 'red' | 'green' | 'gold';
  title: string;
  description: string;
}

import { PUBLIC_STATS_CACHE_KEY, PublicStatsSnapshot } from '../lib/syncPublicStats';

export type StaffStandardIcon =
  | 'thermometer'
  | 'flask'
  | 'truck'
  | 'shield'
  | 'clock'
  | 'check';

export interface StaffStandardItem {
  id: string;
  icon: StaffStandardIcon;
  title: string;
  metricLabel: string;
  metricColor: 'red' | 'green' | 'dark' | 'gold';
  description: string;
}

export interface StaffSlideItem {
  id: string;
  header: string;
  highlightLabel: string;
  highlightColor: 'red' | 'green' | 'dark' | 'gold';
  icon: StaffStandardIcon;
  summary: string;
  imageUrl: string;
}

export interface HomepageContentConfig {
  nav: {
    farmersLabel: string;
    staffLabel: string;
    productsLabel: string;
    locationsLabel: string;
    staffLoginLabel: string;
    staffPortalLabel: string;
    ratesButtonLabel: string;
  };
  hero: {
    badgeText: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
    rateLabel: string;
    qualityLabel: string;
    qualityValue: string;
    imageUrl: string;
    imageCaptionEyebrow: string;
    imageCaptionText: string;
  };
  farmers: {
    eyebrow: string;
    headline: string;
    trustBadge: string;
    steps: FarmerStepItem[];
    locatorEyebrow: string;
    locatorHeadline: string;
    locatorSubheadline: string;
  };
  staff: {
    eyebrow: string;
    headline: string;
    description: string;
    imageUrl: string;
    imageCaptionTitle: string;
    imageCaptionText: string;
    slideIntervalMs: number;
    slides: StaffSlideItem[];
    standards: StaffStandardItem[];
    portalCtaLoggedOut: string;
    portalCtaLoggedIn: string;
  };
  products: {
    slideIntervalMs: number;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
  };
  wholesale: {
    eyebrow: string;
    headline: string;
    description: string;
    footerNote: string;
    submitButtonLabel: string;
  };
  impact: {
    farmersLabel: string;
    farmersDesc: string;
    mccsLabel: string;
    mccsDesc: string;
    litersLabel: string;
    litersDesc: string;
  };
  footer: {
    wholesaleCtaLabel: string;
    supportDeskPrefix: string;
  };
}

export interface DairyProductConfig {
  id: string;
  name: string;
  category: DairyProductCategory;
  accentLabel: string;
  accentHex: string;
  tagline: string;
  packSizes: string;
  shelfLife: string;
  storageType: string;
  imageUrl?: string;
  active: boolean;
}

export interface ImpactMetricsConfig {
  activeFarmers: number;
  activeMccs: number;
  dailyLitersHq: number;
  showActiveFarmers?: boolean;
  showActiveMccs?: boolean;
  showDailyLitersHq?: boolean;
}

export interface PublicMccItem {
  id: string;
  name: string;
  region: string;
  district: string;
  location: string;
  hours: string;
  phone: string;
  status: string;
}

export interface GlobalSettings {
  milkPrice: number;
  systemName: string;
  companyName: string;
  companyAddress: string;
  supportEmail: string;
  supportPhone: string;
  wholesaleEmail: string;
  dropOffCutoffHours: string;
  payoutSchedule: string;
  heroHeadline: string;
  heroSubheadline: string;
  logoUrl: string;
  logoRed: string;
  logoWhite: string;
  favicon: string;
  loginBgUrl: string;
  impactMetrics: ImpactMetricsConfig;
  homepageSections: HomepageSectionConfig[];
  homepageContent: HomepageContentConfig;
  products: DairyProductConfig[];
}

export const PRODUCT_IMAGE_PRESETS = [
  { label: 'Default Category Photo (Auto)', value: '' },
  { label: 'Jambo Long Life Milk (Milkika)', value: './assets/aistudio/images_a44354cc.jpg' },
  { label: 'Jambo UHT Chocolate Swirl', value: './assets/aistudio/images__2__4206e0fe.jpg' },
  { label: 'Jambo Fresh Yoghurts Trio', value: './assets/aistudio/images__5__49e66576.jpg' },
  { label: 'Jambo Chocolate Yoghurt Cup', value: './assets/aistudio/images__4__5f649f38.jpg' },
  { label: 'Jambo Chocolate Yoghurt Promo', value: './assets/aistudio/images__3__a4dd341c.jpg' },
];

export const STAFF_IMAGE_PRESETS = [
  { label: 'Cold-Chain Cooling Tanks (Slide 1)', value: 'preset:cooling-tanks' },
  { label: 'Chilling Temp Verification ≤ 4.0 °C (Slide 2)', value: 'preset:chilling-temp' },
  { label: 'Tank Sanitation & CIP Wash (Slide 3)', value: 'preset:tank-sanitation' },
  { label: 'Sealed Bulk Milk Tanker Transport (Slide 4)', value: 'preset:bulk-tanker' },
];

export const DEFAULT_STAFF_SLIDES: StaffSlideItem[] = [
  {
    id: 'slide-cold-chain-portal',
    header: 'Cold-Chain Hygiene & Direct Operational Portal',
    highlightLabel: 'Gate Reception to HQ Factory Intake',
    highlightColor: 'green',
    icon: 'shield',
    summary:
      'Collection center staff, quality controllers, and cashiers follow strict dairy preservation standards from gate reception to HQ factory intake.',
    imageUrl: 'preset:cooling-tanks',
  },
  {
    id: 'slide-chilling-temp',
    header: 'Chilling Temp',
    highlightLabel: '≤ 4.0 °C Target',
    highlightColor: 'red',
    icon: 'thermometer',
    summary:
      'Rapidly chill raw intake within 2 hours to preserve freshness and low bacterial count.',
    imageUrl: 'preset:chilling-temp',
  },
  {
    id: 'slide-tank-sanitation',
    header: 'Tank Sanitation',
    highlightLabel: 'CIP Every Dispatch',
    highlightColor: 'green',
    icon: 'flask',
    summary:
      'Full alkaline & acid clean-in-place cycle logged on every stainless tank and milk can.',
    imageUrl: 'preset:tank-sanitation',
  },
  {
    id: 'slide-transport',
    header: 'Transport',
    highlightLabel: 'Sealed Bulk Tankers',
    highlightColor: 'dark',
    icon: 'truck',
    summary:
      'Scheduled insulated tankers dispatch verified batches with digital seal & QA logs.',
    imageUrl: 'preset:bulk-tanker',
  },
];

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionConfig[] = [
  {
    id: 'hero',
    label: 'Hero Banner & Drop-Off Rate',
    description: 'Top navigation bar, main headline, farmer & staff buttons, drop-off rate strip, and gate reception photo.',
    enabled: true,
  },
  {
    id: 'farmers',
    label: 'For Dairy Farmers & MCC Locator',
    description: 'Drop-off step cards and interactive Collection Center locator by region & district.',
    enabled: true,
  },
  {
    id: 'staff',
    label: 'MCC Staff Operations & Standards',
    description: 'Cold-chain hygiene benchmarks, stainless cooling tanks visual, and direct operations portal links.',
    enabled: true,
  },
  {
    id: 'products',
    label: 'Product Showcase Catalog Slider',
    description: 'Auto-sliding full-bleed showcase featuring Jamukaya UHT, Fresh Yogurts, and Mtindi products.',
    enabled: true,
  },
  {
    id: 'wholesale',
    label: 'Wholesale & Distributor Inquiries',
    description: 'Trade distributor quote request form synced with the Admin Inquiries inbox.',
    enabled: true,
  },
  {
    id: 'impact',
    label: 'Impact Strip & Footer Contacts',
    description: 'Bold Red strip showcasing key figures, quick actions, and official HQ contact details.',
    enabled: true,
  },
];

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContentConfig = {
  nav: {
    farmersLabel: 'For Farmers',
    staffLabel: 'MCC Staff',
    productsLabel: 'Our Products',
    locationsLabel: 'Locations',
    staffLoginLabel: 'Staff Login',
    staffPortalLabel: 'Staff Portal',
    ratesButtonLabel: 'Drop-Off Rates',
  },
  hero: {
    badgeText: 'Tested & Fresh Cold-Chain',
    primaryCtaLabel: 'Find Nearest Collection Center',
    secondaryCtaLabel: 'MCC Staff Portal',
    rateLabel: 'Current Drop-Off Rate',
    qualityLabel: 'Quality Verification',
    qualityValue: '100% Gate Tested',
    imageUrl: '',
    imageCaptionEyebrow: 'Morning Milk Reception · {{dropOffHours}}',
    imageCaptionText:
      'Digital weight logging, lactometer density checks, and instant stainless-steel chilling at every MCC gate.',
  },
  farmers: {
    eyebrow: 'For Dairy Farmers',
    headline: 'Simple Morning Drop-Off, Verified Quality, Predictable Payouts',
    trustBadge: 'Direct Farm-to-Chiller Accountability',
    steps: [
      {
        id: 'step-delivery',
        stepNumber: '01.',
        metaText: '{{dropOffHours}}',
        accentTone: 'red',
        title: 'Morning Delivery',
        description:
          'Bring fresh raw milk in food-grade stainless cans to any local Jamukaya MCC before morning or evening cut-off hours.',
      },
      {
        id: 'step-quality',
        stepNumber: '02.',
        metaText: 'Tested & Fresh',
        accentTone: 'green',
        title: 'Instant Quality Check',
        description:
          'Transparent lactometer density, alcohol stability, and temperature verification performed openly right at the collection gate.',
      },
      {
        id: 'step-payouts',
        stepNumber: '03.',
        metaText: 'TSh {{milkPrice}} / L',
        accentTone: 'gold',
        title: 'Fast, Reliable Payouts',
        description:
          'Every liter is recorded against your farmer index with clear per-liter rates and {{payoutSchedule}}.',
      },
    ],
    locatorEyebrow: 'Locations · Live MCC Directory',
    locatorHeadline: 'Interactive MCC Locator',
    locatorSubheadline:
      'Filter Milk Collection Centers by region or district for intake hours and gate contacts.',
  },
  staff: {
    eyebrow: 'For MCC Staff · Operations & Standards',
    headline: 'Cold-Chain Hygiene & Direct Operational Portal',
    description:
      'Collection center staff, quality controllers, and cashiers follow strict dairy preservation standards from gate reception to HQ factory intake.',
    imageUrl: '',
    imageCaptionTitle: 'Cold-Chain Discipline',
    imageCaptionText:
      'Bulk cooling tanks sanitized after every dispatch and sealed for HQ tanker intake.',
    slideIntervalMs: 3800,
    slides: DEFAULT_STAFF_SLIDES,
    standards: [
      {
        id: 'std-chilling',
        icon: 'thermometer',
        title: 'Chilling Temp',
        metricLabel: '≤ 4.0 °C Target',
        metricColor: 'red',
        description:
          'Rapidly chill raw intake within 2 hours to preserve freshness and low bacterial count.',
      },
      {
        id: 'std-sanitation',
        icon: 'flask',
        title: 'Tank Sanitation',
        metricLabel: 'CIP Every Dispatch',
        metricColor: 'green',
        description:
          'Full alkaline & acid clean-in-place cycle logged on every stainless tank and milk can.',
      },
      {
        id: 'std-transport',
        icon: 'truck',
        title: 'HQ Transport',
        metricLabel: 'Sealed Bulk Tankers',
        metricColor: 'dark',
        description:
          'Scheduled insulated tankers dispatch verified batches with digital seal & QA logs.',
      },
    ],
    portalCtaLoggedOut: 'Staff Portal Sign In',
    portalCtaLoggedIn: 'Open Operations Workspace',
  },
  products: {
    slideIntervalMs: 3500,
    primaryCtaLabel: 'Learn more',
    secondaryCtaLabel: 'Order Wholesale',
  },
  wholesale: {
    eyebrow: 'Wholesale & Distributor Inquiries',
    headline: 'Stock Jamukaya Dairy Across Schools, Retailers & Regional Depots',
    description:
      'Submit a trade inquiry directly to our headquarters database for wholesale case pricing, chilled delivery schedules, or UHT carton allocations.',
    footerNote: 'Direct factory dispatch & cold-chain delivery scheduling.',
    submitButtonLabel: 'Request Wholesale Quote',
  },
  impact: {
    farmersLabel: 'Active Farmers',
    farmersDesc: 'Partner dairy farmers registered across the collection network.',
    mccsLabel: 'Collection Centers',
    mccsDesc: 'Operational MCC chilling hubs verified with gate quality testing.',
    litersLabel: 'Liters Processed Daily at HQ',
    litersDesc: 'Raw cold-chain intake processed into UHT, Yogurt, and Mtindi at HQ.',
  },
  footer: {
    wholesaleCtaLabel: 'Wholesale/Distributor Inquiries',
    supportDeskPrefix: 'MCC Support Desk',
  },
};

export const DEFAULT_IMPACT_METRICS: ImpactMetricsConfig = {
  activeFarmers: 2400,
  activeMccs: 6,
  dailyLitersHq: 45000,
  showActiveFarmers: true,
  showActiveMccs: true,
  showDailyLitersHq: true,
};

export const DEFAULT_PRODUCTS: DairyProductConfig[] = [
  {
    id: 'plain-uht',
    name: 'Plain UHT',
    category: 'UHT Long-Life Milk',
    accentLabel: 'Clean white & red pack accent',
    accentHex: '#D9232E',
    tagline: 'Pure everyday nutrition, no refrigeration needed before opening.',
    packSizes: '250 ml · 500 ml · 1 L',
    shelfLife: '6 Months Ambient',
    storageType: 'No Refrigeration Needed Unopened',
    imageUrl: './assets/aistudio/images_a44354cc.jpg',
    active: true,
  },
  {
    id: 'uht-strawberry',
    name: 'UHT Strawberry',
    category: 'UHT Long-Life Milk',
    accentLabel: 'Red berry badge',
    accentHex: '#D9232E',
    tagline: 'Sweet, fruity refreshment for kids and on-the-go.',
    packSizes: '200 ml · 250 ml · 500 ml',
    shelfLife: '6 Months Ambient',
    storageType: 'Ready-to-Pack Lunchbox Carton',
    active: true,
  },
  {
    id: 'uht-chocolate',
    name: 'UHT Chocolate',
    category: 'UHT Long-Life Milk',
    accentLabel: 'Deep cocoa & red accent',
    accentHex: '#5C3A21',
    tagline: 'Rich chocolate taste packed with dairy goodness.',
    packSizes: '200 ml · 250 ml · 500 ml',
    shelfLife: '6 Months Ambient',
    storageType: 'Shelf-Stable Pantry Pack',
    imageUrl: './assets/aistudio/images__2__4206e0fe.jpg',
    active: true,
  },
  {
    id: 'uht-vanilla',
    name: 'UHT Vanilla',
    category: 'UHT Long-Life Milk',
    accentLabel: 'Warm yellow accent',
    accentHex: '#F4B400',
    tagline: 'Smooth, aromatic vanilla flavor.',
    packSizes: '200 ml · 250 ml · 500 ml',
    shelfLife: '6 Months Ambient',
    storageType: 'Shelf-Stable Pantry Pack',
    active: true,
  },
  {
    id: 'strawberry-yogurt',
    name: 'Strawberry Yogurt',
    category: 'Fresh Yogurts',
    accentLabel: 'Bold red fruit tag',
    accentHex: '#D9232E',
    tagline: 'Thick, creamy cultured yogurt blended with strawberry flavor.',
    packSizes: '150 ml · 250 g · 500 g',
    shelfLife: '21 Days Chilled',
    storageType: 'Keep Refrigerated 2–4 °C',
    imageUrl: './assets/aistudio/images__5__49e66576.jpg',
    active: true,
  },
  {
    id: 'vanilla-yogurt',
    name: 'Vanilla Yogurt',
    category: 'Fresh Yogurts',
    accentLabel: 'Warm yellow tag',
    accentHex: '#F4B400',
    tagline: 'Velvety classic vanilla yogurt for any time of day.',
    packSizes: '150 ml · 250 g · 500 g',
    shelfLife: '21 Days Chilled',
    storageType: 'Keep Refrigerated 2–4 °C',
    imageUrl: './assets/aistudio/images__5__49e66576.jpg',
    active: true,
  },
  {
    id: 'chocolate-yogurt',
    name: 'Chocolate Yogurt',
    category: 'Fresh Yogurts',
    accentLabel: 'Rich cocoa & yellow tag',
    accentHex: '#5C3A21',
    tagline: 'Indulgent, smooth chocolate yogurt treat.',
    packSizes: '150 ml · 250 g · 500 g',
    shelfLife: '21 Days Chilled',
    storageType: 'Keep Refrigerated 2–4 °C',
    imageUrl: './assets/aistudio/images__4__5f649f38.jpg',
    active: true,
  },
  {
    id: 'mtindi',
    name: 'Mtindi',
    category: 'Traditional Cultured',
    accentLabel: 'Fresh green heritage seal',
    accentHex: '#1E7E34',
    tagline: 'Authentic, tangy fermented milk crafted for daily meals.',
    packSizes: '500 ml · 1 L',
    shelfLife: '14 Days Chilled',
    storageType: 'Keep Refrigerated 2–4 °C',
    active: true,
  },
];

export const DEFAULT_PUBLIC_MCCS: PublicMccItem[] = [
  {
    id: 'nyamagana-mcc',
    name: 'Nyamagana Central MCC',
    region: 'Mwanza',
    district: 'Nyamagana',
    location: 'Nyamagana, Mwanza',
    hours: '06:00 – 10:30 · 16:00 – 18:00',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
  {
    id: 'sengerema-mcc',
    name: 'Sengerema Pasture MCC',
    region: 'Mwanza',
    district: 'Sengerema',
    location: 'Sengerema, Mwanza',
    hours: '05:45 – 10:00 · 15:30 – 17:30',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
  {
    id: 'musoma-mcc',
    name: 'Musoma Lakefront MCC',
    region: 'Mara',
    district: 'Musoma Rural',
    location: 'Musoma Rural, Mara',
    hours: '06:00 – 10:30 · 16:00 – 18:00',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
  {
    id: 'tarime-mcc',
    name: 'Tarime Highland MCC',
    region: 'Mara',
    district: 'Tarime',
    location: 'Tarime, Mara',
    hours: '05:30 – 10:00 · 15:30 – 17:30',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
  {
    id: 'bariadi-mcc',
    name: 'Bariadi Dairy Hub',
    region: 'Simiyu',
    district: 'Bariadi',
    location: 'Bariadi, Simiyu',
    hours: '06:00 – 10:15 · 16:00 – 18:00',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
  {
    id: 'kahama-mcc',
    name: 'Kahama West MCC',
    region: 'Shinyanga',
    district: 'Kahama',
    location: 'Kahama, Shinyanga',
    hours: '06:00 – 10:30 · 16:00 – 18:00',
    phone: '+255 [0] 622 666 692',
    status: 'Active',
  },
];

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  milkPrice: 1200,
  systemName: 'Jambo MCC Management System',
  companyName: 'Jambo Food Products Limited',
  companyAddress: 'P.O Box 71. Ibadakuli, Mwanza Road, Shinyanya - Tanzania',
  supportEmail: 'info@jambogrouptz.net',
  supportPhone: '+255 [0] 622 666 692',
  wholesaleEmail: 'info@jambogrouptz.net',
  dropOffCutoffHours: '06:00 – 10:30 EAT · 16:00 – 18:00 EAT',
  payoutSchedule: 'Bi-Weekly & Direct Mobile/Bank Settlement',
  heroHeadline: 'Jamukaya.',
  heroSubheadline:
    'Connecting Tanzanian dairy farmers, modern Milk Collection Centers (MCCs), and pure dairy products.',
  logoUrl:
    'https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw',
  logoRed: '',
  logoWhite: '',
  favicon: '',
  loginBgUrl: '',
  impactMetrics: DEFAULT_IMPACT_METRICS,
  homepageSections: DEFAULT_HOMEPAGE_SECTIONS,
  homepageContent: DEFAULT_HOMEPAGE_CONTENT,
  products: DEFAULT_PRODUCTS,
};

const SETTINGS_CACHE_KEY = 'jambo_global_settings_v5';
const DIRECTORY_CACHE_KEY = 'jambo_public_directory_v2';

export function sanitizeFirestoreValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreValue(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, val]) => {
      if (val !== undefined) {
        out[key] = sanitizeFirestoreValue(val);
      }
    });
    return out as T;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 0 as unknown as T;
  }
  return value;
}

export function getFirestorePayloadBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}

export function mergeSettings(raw?: Partial<GlobalSettings> | null): GlobalSettings {
  if (!raw) return DEFAULT_GLOBAL_SETTINGS;

  // Migrate legacy initial contact placeholders if companyAddress has not been explicitly configured yet
  const isLegacySeed = !raw.companyAddress;
  const resolvedSupportEmail =
    isLegacySeed && (!raw.supportEmail || raw.supportEmail === 'mtaniwambura@gmail.com')
      ? DEFAULT_GLOBAL_SETTINGS.supportEmail
      : raw.supportEmail || DEFAULT_GLOBAL_SETTINGS.supportEmail;
  const resolvedWholesaleEmail =
    isLegacySeed && (!raw.wholesaleEmail || raw.wholesaleEmail === 'mtaniwambura@gmail.com')
      ? DEFAULT_GLOBAL_SETTINGS.wholesaleEmail
      : raw.wholesaleEmail || DEFAULT_GLOBAL_SETTINGS.wholesaleEmail;
  const resolvedSupportPhone =
    isLegacySeed && (!raw.supportPhone || raw.supportPhone === '+255 754 210 100')
      ? DEFAULT_GLOBAL_SETTINGS.supportPhone
      : raw.supportPhone || DEFAULT_GLOBAL_SETTINGS.supportPhone;

  const mergedProducts = Array.isArray(raw.products)
    ? raw.products.map((p) => {
        const fallback = DEFAULT_PRODUCTS.find((dp) => dp.id === p.id);
        return {
          ...(fallback || {}),
          ...p,
          imageUrl: p.imageUrl ?? fallback?.imageUrl ?? '',
          storageType: p.storageType ?? fallback?.storageType ?? '',
          active: p.active !== false,
        } as DairyProductConfig;
      })
    : DEFAULT_PRODUCTS.map((dp) => ({
        ...dp,
        imageUrl: dp.imageUrl ?? '',
      }));

  let mergedSections: HomepageSectionConfig[] = DEFAULT_HOMEPAGE_SECTIONS;
  if (Array.isArray(raw.homepageSections) && raw.homepageSections.length > 0) {
    const validIds = new Set(DEFAULT_HOMEPAGE_SECTIONS.map((s) => s.id));
    const savedValid = raw.homepageSections
      .filter((s) => s && validIds.has(s.id))
      .map((s) => {
        const def = DEFAULT_HOMEPAGE_SECTIONS.find((d) => d.id === s.id)!;
        return {
          ...def,
          ...s,
          enabled: s.enabled !== false,
        };
      });
    const presentIds = new Set(savedValid.map((s) => s.id));
    const missing = DEFAULT_HOMEPAGE_SECTIONS.filter((d) => !presentIds.has(d.id));
    mergedSections = [...savedValid, ...missing];
  }

  const rawContent: Partial<HomepageContentConfig> = raw.homepageContent || {};
  const mergedContent: HomepageContentConfig = {
    nav: {
      ...DEFAULT_HOMEPAGE_CONTENT.nav,
      ...(rawContent.nav || {}),
    },
    hero: {
      ...DEFAULT_HOMEPAGE_CONTENT.hero,
      ...(rawContent.hero || {}),
    },
    farmers: {
      ...DEFAULT_HOMEPAGE_CONTENT.farmers,
      ...(rawContent.farmers || {}),
      steps: Array.isArray(rawContent.farmers?.steps)
        ? rawContent.farmers.steps.map((st, idx) => ({
            id: st?.id || `step-${idx + 1}`,
            stepNumber: st?.stepNumber ?? `0${idx + 1}.`,
            metaText: st?.metaText ?? '',
            accentTone: st?.accentTone || 'red',
            title: st?.title ?? '',
            description: st?.description ?? '',
          }))
        : DEFAULT_HOMEPAGE_CONTENT.farmers.steps,
    },
    staff: {
      ...DEFAULT_HOMEPAGE_CONTENT.staff,
      ...(rawContent.staff || {}),
      slideIntervalMs: Math.max(
        1500,
        Number(rawContent.staff?.slideIntervalMs ?? DEFAULT_HOMEPAGE_CONTENT.staff.slideIntervalMs) || 3800
      ),
      slides:
        Array.isArray(rawContent.staff?.slides) && rawContent.staff.slides.length > 0
          ? rawContent.staff.slides.map((sl, idx) => {
              const fallback = DEFAULT_STAFF_SLIDES[idx % DEFAULT_STAFF_SLIDES.length];
              return {
                id: sl?.id || `staff-slide-${idx + 1}`,
                header: sl?.header ?? fallback.header,
                highlightLabel: sl?.highlightLabel ?? fallback.highlightLabel,
                highlightColor: sl?.highlightColor || fallback.highlightColor,
                icon: sl?.icon || fallback.icon,
                summary: sl?.summary ?? fallback.summary,
                imageUrl: sl?.imageUrl || fallback.imageUrl,
              };
            })
          : DEFAULT_STAFF_SLIDES,
      standards: Array.isArray(rawContent.staff?.standards)
        ? rawContent.staff.standards.map((std, idx) => ({
            id: std?.id || `std-${idx + 1}`,
            icon: std?.icon || 'shield',
            title: std?.title ?? '',
            metricLabel: std?.metricLabel ?? '',
            metricColor: std?.metricColor || 'green',
            description: std?.description ?? '',
          }))
        : DEFAULT_HOMEPAGE_CONTENT.staff.standards,
    },
    products: {
      ...DEFAULT_HOMEPAGE_CONTENT.products,
      ...(rawContent.products || {}),
      slideIntervalMs: Math.max(
        1500,
        Number(rawContent.products?.slideIntervalMs ?? DEFAULT_HOMEPAGE_CONTENT.products.slideIntervalMs) || 3500
      ),
    },
    wholesale: {
      ...DEFAULT_HOMEPAGE_CONTENT.wholesale,
      ...(rawContent.wholesale || {}),
    },
    impact: {
      ...DEFAULT_HOMEPAGE_CONTENT.impact,
      ...(rawContent.impact || {}),
    },
    footer: {
      ...DEFAULT_HOMEPAGE_CONTENT.footer,
      ...(rawContent.footer || {}),
    },
  };

  return sanitizeFirestoreValue({
    ...DEFAULT_GLOBAL_SETTINGS,
    ...raw,
    supportEmail: resolvedSupportEmail,
    wholesaleEmail: resolvedWholesaleEmail,
    supportPhone: resolvedSupportPhone,
    companyAddress: raw.companyAddress || DEFAULT_GLOBAL_SETTINGS.companyAddress,
    impactMetrics: {
      ...DEFAULT_IMPACT_METRICS,
      ...(raw.impactMetrics || {}),
      activeFarmers: Number(raw.impactMetrics?.activeFarmers ?? DEFAULT_IMPACT_METRICS.activeFarmers) || 0,
      activeMccs: Number(raw.impactMetrics?.activeMccs ?? DEFAULT_IMPACT_METRICS.activeMccs) || 0,
      dailyLitersHq: Number(raw.impactMetrics?.dailyLitersHq ?? DEFAULT_IMPACT_METRICS.dailyLitersHq) || 0,
      showActiveFarmers: raw.impactMetrics?.showActiveFarmers !== false,
      showActiveMccs: raw.impactMetrics?.showActiveMccs !== false,
      showDailyLitersHq: raw.impactMetrics?.showDailyLitersHq !== false,
    },
    homepageSections: mergedSections,
    homepageContent: mergedContent,
    products: mergedProducts,
  });
}

function readCachedSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      return mergeSettings(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_GLOBAL_SETTINGS;
}

function readCachedDirectory(): PublicMccItem[] {
  try {
    const raw = localStorage.getItem(DIRECTORY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_PUBLIC_MCCS;
}

let sharedSettings: GlobalSettings = readCachedSettings();
let sharedLoaded = false;
let subscriberCount = 0;
let unsubscribeFirestore: (() => void) | null = null;
const listeners = new Set<(s: GlobalSettings, loaded: boolean) => void>();

function applySettingsSnapshot(data: Partial<GlobalSettings>) {
  sharedSettings = mergeSettings(data);
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(sharedSettings));
  } catch {
    // Ignore storage quota errors
  }
  sharedLoaded = true;
  listeners.forEach((fn) => fn(sharedSettings, true));
}

function ensureSettingsSubscription() {
  if (unsubscribeFirestore) return;
  const configRef = doc(db, 'settings', 'global_config');

  // Force an immediate server read alongside realtime onSnapshot so public visitors always receive latest Firestore data
  getDocFromServer(configRef)
    .then((snap) => {
      if (snap.exists()) {
        applySettingsSnapshot(snap.data() as Partial<GlobalSettings>);
      }
    })
    .catch(() => {
      // Realtime listener handles fallback/offline state
    });

  unsubscribeFirestore = onSnapshot(
    configRef,
    (snapshot) => {
      if (snapshot.exists()) {
        applySettingsSnapshot(snapshot.data() as Partial<GlobalSettings>);
      } else {
        sharedLoaded = true;
        listeners.forEach((fn) => fn(sharedSettings, true));
      }
    },
    (error) => {
      console.error('Error fetching settings:', error);
      sharedLoaded = true;
      listeners.forEach((fn) => fn(sharedSettings, true));
    }
  );
}

export function useSettings() {
  const [settings, setSettings] = useState<GlobalSettings>(sharedSettings);
  const [loading, setLoading] = useState(!sharedLoaded);

  useEffect(() => {
    const listener = (next: GlobalSettings, loaded: boolean) => {
      setSettings(next);
      setLoading(!loaded);
    };

    listeners.add(listener);
    subscriberCount += 1;
    ensureSettingsSubscription();

    setSettings(sharedSettings);
    if (sharedLoaded) setLoading(false);

    return () => {
      listeners.delete(listener);
      subscriberCount -= 1;
      if (subscriberCount <= 0 && unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
        subscriberCount = 0;
      }
    };
  }, []);

  return { settings, loading };
}

let sharedDirectory: PublicMccItem[] = readCachedDirectory();
let sharedDirectoryFromDb = false;
let dirSubscriberCount = 0;
let unsubscribeDirectory: (() => void) | null = null;
const dirListeners = new Set<(mccs: PublicMccItem[], fromDb: boolean) => void>();

function applyDirectorySnapshot(data: { mccs?: PublicMccItem[] }) {
  if (Array.isArray(data.mccs)) {
    sharedDirectory = data.mccs;
    sharedDirectoryFromDb = true;
    try {
      localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify(sharedDirectory));
    } catch {
      // Ignore storage quota errors
    }
  }
  dirListeners.forEach((fn) => fn(sharedDirectory, sharedDirectoryFromDb));
}

function ensureDirectorySubscription() {
  if (unsubscribeDirectory) return;
  const dirRef = doc(db, 'settings', 'public_directory');

  getDocFromServer(dirRef)
    .then((snap) => {
      if (snap.exists()) {
        applyDirectorySnapshot(snap.data() as { mccs?: PublicMccItem[] });
      }
    })
    .catch(() => {
      // Realtime listener handles fallback/offline state
    });

  unsubscribeDirectory = onSnapshot(
    dirRef,
    (snapshot) => {
      if (snapshot.exists()) {
        applyDirectorySnapshot(snapshot.data() as { mccs?: PublicMccItem[] });
      } else {
        dirListeners.forEach((fn) => fn(sharedDirectory, sharedDirectoryFromDb));
      }
    },
    (error) => {
      console.warn('Public directory fallback active:', error);
      dirListeners.forEach((fn) => fn(sharedDirectory, sharedDirectoryFromDb));
    }
  );
}

export function usePublicDirectory() {
  const [directory, setDirectory] = useState<PublicMccItem[]>(sharedDirectory);
  const [fromDb, setFromDb] = useState(sharedDirectoryFromDb);

  useEffect(() => {
    const listener = (next: PublicMccItem[], isDb: boolean) => {
      setDirectory(next);
      setFromDb(isDb);
    };

    dirListeners.add(listener);
    dirSubscriberCount += 1;
    ensureDirectorySubscription();

    setDirectory(sharedDirectory);
    setFromDb(sharedDirectoryFromDb);

    return () => {
      dirListeners.delete(listener);
      dirSubscriberCount -= 1;
      if (dirSubscriberCount <= 0 && unsubscribeDirectory) {
        unsubscribeDirectory();
        unsubscribeDirectory = null;
        dirSubscriberCount = 0;
      }
    };
  }, []);

  return { directory, fromDb };
}

function readCachedPublicStats(): PublicStatsSnapshot | null {
  try {
    const raw = localStorage.getItem(PUBLIC_STATS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.activeFarmers === 'number') {
        return parsed as PublicStatsSnapshot;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

let sharedPublicStats: PublicStatsSnapshot | null = readCachedPublicStats();
let sharedPublicStatsFromDb = false;
let publicStatsSubscriberCount = 0;
let unsubscribePublicStats: (() => void) | null = null;
const publicStatsListeners = new Set<(stats: PublicStatsSnapshot | null, fromDb: boolean) => void>();

function applyPublicStatsSnapshot(data: Partial<PublicStatsSnapshot>) {
  if (typeof data.activeFarmers !== 'number' && typeof data.activeMccs !== 'number' && typeof data.dailyLitersHq !== 'number') {
    return;
  }
  sharedPublicStats = {
    activeFarmers: Number(data.activeFarmers ?? 0),
    activeMccs: Number(data.activeMccs ?? 0),
    dailyLitersHq: Number(data.dailyLitersHq ?? 0),
    updatedAt: String(data.updatedAt || new Date().toISOString()),
  };
  sharedPublicStatsFromDb = true;
  try {
    localStorage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(sharedPublicStats));
  } catch {
    // Ignore storage quota errors
  }
  publicStatsListeners.forEach((fn) => fn(sharedPublicStats, true));
}

function ensurePublicStatsSubscription() {
  if (unsubscribePublicStats) return;
  const statsRef = doc(db, 'settings', 'public_stats');

  getDocFromServer(statsRef)
    .then((snap) => {
      if (snap.exists()) {
        applyPublicStatsSnapshot(snap.data() as Partial<PublicStatsSnapshot>);
      }
    })
    .catch(() => {
      // Realtime listener handles offline fallback
    });

  unsubscribePublicStats = onSnapshot(
    statsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        applyPublicStatsSnapshot(snapshot.data() as Partial<PublicStatsSnapshot>);
      } else {
        publicStatsListeners.forEach((fn) => fn(sharedPublicStats, sharedPublicStatsFromDb));
      }
    },
    (error) => {
      console.warn('Public stats listener fallback active:', error);
      publicStatsListeners.forEach((fn) => fn(sharedPublicStats, sharedPublicStatsFromDb));
    }
  );
}

export function usePublicStats() {
  const [stats, setStats] = useState<PublicStatsSnapshot | null>(sharedPublicStats);
  const [fromDb, setFromDb] = useState(sharedPublicStatsFromDb);

  useEffect(() => {
    const listener = (next: PublicStatsSnapshot | null, isDb: boolean) => {
      setStats(next);
      setFromDb(isDb);
    };

    publicStatsListeners.add(listener);
    publicStatsSubscriberCount += 1;
    ensurePublicStatsSubscription();

    setStats(sharedPublicStats);
    setFromDb(sharedPublicStatsFromDb);

    return () => {
      publicStatsListeners.delete(listener);
      publicStatsSubscriberCount -= 1;
      if (publicStatsSubscriberCount <= 0 && unsubscribePublicStats) {
        unsubscribePublicStats();
        unsubscribePublicStats = null;
        publicStatsSubscriberCount = 0;
      }
    };
  }, []);

  return { stats, fromDb };
}

