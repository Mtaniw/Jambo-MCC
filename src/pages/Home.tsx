import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Headphones,
  Mail,
  MapPin,
  Menu,
  Milk,
  PackageCheck,
  Phone,
  ShieldCheck,
  ThermometerSnowflake,
  Truck,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STAFF_SLIDES,
  DairyProductConfig,
  HomepageSectionId,
  PublicMccItem,
  StaffSlideItem,
  StaffStandardIcon,
  usePublicDirectory,
  usePublicStats,
  useSettings,
} from '../hooks/useSettings';
import { Logo } from '../components/Logo';
import { cn, formatNumber } from '../lib/utils';
import { syncPublicStatsToFirestore } from '../lib/syncPublicStats';

import heroDropoffImg from '../assets/images/hero_milk_dropoff_1795078323173.jpg';
import coolingTanksImg from '../assets/images/mcc_cooling_tanks_1795078323678.jpg';
import chillingTempImg from '../assets/images/mcc_chilling_temp_check_1795097823145.jpg';
import tankSanitationImg from '../assets/images/mcc_tank_sanitation_cip_1795097821790.jpg';
import bulkTankerImg from '../assets/images/mcc_bulk_milk_tanker_1795097822727.jpg';
import uhtLineupImg from '../assets/images/uht_milk_lineup_1795078325249.jpg';
import yogurtMtindiImg from '../assets/images/yogurt_mtindi_lineup_1795078323906.jpg';

function toTelHref(phone: string): string {
  return `tel:${(phone || '').replace(/\[0\]/g, '').replace(/\s+/g, '')}`;
}

function resolveProductImage(product: DairyProductConfig): string {
  if (product.imageUrl) return product.imageUrl;
  if (product.category === 'UHT Long-Life Milk') return uhtLineupImg;
  return yogurtMtindiImg;
}

function resolveStaffSlideImage(imageUrl?: string): string {
  switch (imageUrl) {
    case 'preset:cooling-tanks':
    case '':
    case undefined:
      return coolingTanksImg;
    case 'preset:chilling-temp':
      return chillingTempImg;
    case 'preset:tank-sanitation':
      return tankSanitationImg;
    case 'preset:bulk-tanker':
      return bulkTankerImg;
    default:
      return imageUrl;
  }
}

function renderStandardIcon(icon?: StaffStandardIcon) {
  switch (icon) {
    case 'thermometer':
      return <ThermometerSnowflake size={18} className="text-[#D9232E]" aria-hidden="true" />;
    case 'flask':
      return <FlaskConical size={18} className="text-[#1E7E34]" aria-hidden="true" />;
    case 'truck':
      return <Truck size={18} className="text-[#171717]" aria-hidden="true" />;
    case 'clock':
      return <Clock size={18} className="text-[#D9232E]" aria-hidden="true" />;
    case 'check':
      return <CheckCircle2 size={18} className="text-[#1E7E34]" aria-hidden="true" />;
    default:
      return <ShieldCheck size={18} className="text-[#1E7E34]" aria-hidden="true" />;
  }
}

function MediaWithFallback({
  src,
  alt,
  fallbackTitle,
  className,
}: {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-[#FAFAFA] border border-neutral-200 text-neutral-700 p-6 text-center',
          className
        )}
      >
        <Milk className="w-8 h-8 text-[#D9232E] mb-2" />
        <p className="text-sm font-bold text-neutral-900">{fallbackTitle}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export default function Home() {
  const { user, effectiveRole } = useAuth();
  const { settings } = useSettings();
  const { directory: publicDirectory, fromDb: directoryFromDb } = usePublicDirectory();
  const { stats: livePublicStats } = usePublicStats();
  const navigate = useNavigate();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mccs, setMccs] = useState<PublicMccItem[]>(publicDirectory);
  const [selectedRegion, setSelectedRegion] = useState<string>('All Regions');
  const [districtFilter, setDistrictFilter] = useState<string>('');
  const [highlightRates, setHighlightRates] = useState(false);

  // Auto-sliding product carousel state
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isSliderHovered, setIsSliderHovered] = useState(false);

  // Auto-sliding MCC Staff operations showcase state
  const [currentStaffSlideIndex, setCurrentStaffSlideIndex] = useState(0);
  const [isStaffSliderHovered, setIsStaffSliderHovered] = useState(false);

  const [inquiryForm, setInquiryForm] = useState({
    businessName: '',
    contactName: '',
    phoneOrEmail: '',
    productFocus: 'Full Jamukaya Product Lineup',
    region: '',
  });
  const [inquiryError, setInquiryError] = useState('');
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  const regionSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setMccs(publicDirectory);
  }, [publicDirectory]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function hydrateAuthenticatedDirectory() {
      try {
        const mccsSnap = await getDocs(collection(db, 'mccs'));
        if (!active) return;

        const liveMccs: PublicMccItem[] = mccsSnap.docs.map((d) => {
          const data = d.data() as Record<string, any>;
          const loc = String(data.location || 'Tanzania').trim();
          const locParts = loc
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
          return {
            id: d.id,
            name: data.name || 'Jamukaya MCC',
            region: data.region || locParts[locParts.length - 1] || 'Lake Zone',
            district: data.district || locParts[0] || loc,
            location: loc,
            hours: data.hours || settings.dropOffCutoffHours || '06:00 – 10:30 · 16:00 – 18:00',
            phone:
              data.phone || data.contactPhone || settings.supportPhone || '+255 [0] 622 666 692',
            status: data.status || 'Active',
          };
        });

        if (liveMccs.length > 0) {
          setMccs(liveMccs);
        }
      } catch (err) {
        console.warn('Public directory fallback active:', err);
      }
    }

    hydrateAuthenticatedDirectory();
    syncPublicStatsToFirestore();
    return () => {
      active = false;
    };
  }, [user, settings.dropOffCutoffHours, settings.supportPhone]);

  const activeProducts = useMemo(() => {
    return (settings.products || []).filter((p) => p.active !== false);
  }, [settings.products]);

  const enabledSections = useMemo(() => {
    return (settings.homepageSections || DEFAULT_HOMEPAGE_SECTIONS).filter((s) => s.enabled !== false);
  }, [settings.homepageSections]);

  const isSectionEnabled = (id: HomepageSectionId) => enabledSections.some((s) => s.id === id);

  useEffect(() => {
    if (currentSlideIndex >= activeProducts.length && activeProducts.length > 0) {
      setCurrentSlideIndex(0);
    }
  }, [activeProducts.length, currentSlideIndex]);

  const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
  const slideIntervalMs = Math.max(1500, Number(hc.products?.slideIntervalMs) || 3500);

  // Auto-advance product slides at configurable interval unless hovered
  useEffect(() => {
    if (isSliderHovered || activeProducts.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % activeProducts.length);
    }, slideIntervalMs);
    return () => window.clearInterval(timer);
  }, [isSliderHovered, activeProducts.length, slideIntervalMs]);

  const currentProduct = activeProducts[currentSlideIndex] || activeProducts[0];

  const staffSlides: StaffSlideItem[] = useMemo(() => {
    const configured = hc.staff?.slides;
    return Array.isArray(configured) && configured.length > 0 ? configured : DEFAULT_STAFF_SLIDES;
  }, [hc.staff?.slides]);
  const staffSlideIntervalMs = Math.max(1500, Number(hc.staff?.slideIntervalMs) || 3800);

  useEffect(() => {
    if (currentStaffSlideIndex >= staffSlides.length && staffSlides.length > 0) {
      setCurrentStaffSlideIndex(0);
    }
  }, [staffSlides.length, currentStaffSlideIndex]);

  useEffect(() => {
    if (isStaffSliderHovered || staffSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentStaffSlideIndex((prev) => (prev + 1) % staffSlides.length);
    }, staffSlideIntervalMs);
    return () => window.clearInterval(timer);
  }, [isStaffSliderHovered, staffSlides.length, staffSlideIntervalMs]);

  const currentStaffSlide = staffSlides[currentStaffSlideIndex] || staffSlides[0];

  const handleStepStaffSlide = (dir: 'prev' | 'next') => {
    if (staffSlides.length === 0) return;
    setCurrentStaffSlideIndex((prev) =>
      dir === 'next'
        ? (prev + 1) % staffSlides.length
        : (prev - 1 + staffSlides.length) % staffSlides.length
    );
  };

  const impactStats = useMemo(() => {
    const cfgStats = settings.impactMetrics || {
      activeFarmers: 2400,
      activeMccs: 6,
      dailyLitersHq: 45000,
      showActiveFarmers: true,
      showActiveMccs: true,
      showDailyLitersHq: true,
    };

    const fallbackMccs = directoryFromDb && mccs.length > 0
      ? mccs.filter((m) => m.status === 'Active').length || mccs.length
      : Number(cfgStats.activeMccs ?? 6);

    return {
      activeFarmers: livePublicStats ? livePublicStats.activeFarmers : Number(cfgStats.activeFarmers ?? 2400),
      activeMccs: livePublicStats ? livePublicStats.activeMccs : fallbackMccs,
      dailyLitersHq: livePublicStats ? livePublicStats.dailyLitersHq : Number(cfgStats.dailyLitersHq ?? 45000),
      showActiveFarmers: cfgStats.showActiveFarmers !== false,
      showActiveMccs: cfgStats.showActiveMccs !== false,
      showDailyLitersHq: cfgStats.showDailyLitersHq !== false,
    };
  }, [livePublicStats, settings.impactMetrics, directoryFromDb, mccs]);

  const regions = useMemo(() => {
    const unique = Array.from(new Set(mccs.map((m) => m.region).filter(Boolean))).sort();
    return ['All Regions', ...unique];
  }, [mccs]);

  const filteredMccs = useMemo(() => {
    return mccs.filter((mcc) => {
      const matchesRegion = selectedRegion === 'All Regions' || mcc.region === selectedRegion;
      const q = districtFilter.trim().toLowerCase();
      const matchesDistrict =
        !q ||
        (mcc.district || '').toLowerCase().includes(q) ||
        (mcc.name || '').toLowerCase().includes(q) ||
        (mcc.region || '').toLowerCase().includes(q) ||
        (mcc.location || '').toLowerCase().includes(q);
      return matchesRegion && matchesDistrict;
    });
  }, [mccs, selectedRegion, districtFilter]);

  const scrollToSection = (id: string) => {
    setMobileNavOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleFindNearestMcc = () => {
    scrollToSection('locations');
    setTimeout(() => {
      regionSelectRef.current?.focus();
    }, 350);
  };

  const handleDropOffRatesClick = () => {
    setHighlightRates(true);
    scrollToSection('dropoff-rates');
    setTimeout(() => setHighlightRates(false), 2600);
  };

  const handleStaffPortalClick = () => {
    if (user) {
      const target =
        effectiveRole === 'Admin' || effectiveRole === 'Super User' ? '/admin' : '/dashboard';
      navigate(target);
    } else {
      navigate('/login');
    }
  };

  const handleStepSlide = (dir: 'prev' | 'next') => {
    if (activeProducts.length === 0) return;
    setCurrentSlideIndex((prev) =>
      dir === 'next'
        ? (prev + 1) % activeProducts.length
        : (prev - 1 + activeProducts.length) % activeProducts.length
    );
  };

  const handleSelectProductInquiry = (productName: string) => {
    setInquirySubmitted(false);
    setInquiryError('');
    setInquiryForm((prev) => ({ ...prev, productFocus: productName }));
    scrollToSection('wholesale');
  };

  const handleWholesaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError('');

    const businessName = inquiryForm.businessName.trim();
    const contactName = inquiryForm.contactName.trim();
    const phoneOrEmail = inquiryForm.phoneOrEmail.trim();
    const region = inquiryForm.region.trim();

    if (businessName.length < 2 || contactName.length < 2) {
      setInquiryError('Please provide your business name and contact person.');
      return;
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneOrEmail);
    const isValidPhone = /^[+\d\s()[\]-]{7,24}$/.test(phoneOrEmail);

    if (!isValidEmail && !isValidPhone) {
      setInquiryError('Please enter a valid Tanzanian phone number or email address.');
      return;
    }

    setInquirySubmitting(true);
    try {
      await addDoc(collection(db, 'wholesale_inquiries'), {
        businessName: businessName.slice(0, 150),
        contactName: contactName.slice(0, 120),
        phoneOrEmail: phoneOrEmail.slice(0, 150),
        productFocus: (inquiryForm.productFocus || 'Full Jamukaya Product Lineup').slice(0, 120),
        region: region.slice(0, 120),
        status: 'New',
        createdAt: new Date().toISOString(),
      });
      setInquirySubmitted(true);
    } catch (err) {
      console.error('Failed to submit wholesale inquiry:', err);
      setInquiryError(
        `Could not submit right now. Please contact ${settings.wholesaleEmail || settings.supportEmail} directly.`
      );
    } finally {
      setInquirySubmitting(false);
    }
  };

  const milkPricePerLiter = Number(settings.milkPrice) || 1200;
  const supportPhone = settings.supportPhone || '+255 [0] 622 666 692';
  const supportEmail = settings.supportEmail || 'info@jambogrouptz.net';
  const wholesaleEmail = settings.wholesaleEmail || supportEmail;
  const companyAddress =
    settings.companyAddress || 'P.O Box 71. Ibadakuli, Mwanza Road, Shinyanya - Tanzania';
  const dropOffHours = settings.dropOffCutoffHours || '06:00 – 10:30 EAT · 16:00 – 18:00 EAT';
  const payoutSchedule = settings.payoutSchedule || 'Bi-Weekly & Direct Mobile/Bank Settlement';

  const interpolate = (text?: string) =>
    (text || '')
      .replace(/\{\{dropOffHours\}\}/g, dropOffHours)
      .replace(/\{\{milkPrice\}\}/g, formatNumber(milkPricePerLiter, 0))
      .replace(/\{\{payoutSchedule\}\}/g, payoutSchedule);

  const navCopy = hc.nav || DEFAULT_HOMEPAGE_CONTENT.nav;
  const heroCopy = hc.hero || DEFAULT_HOMEPAGE_CONTENT.hero;
  const farmersCopy = hc.farmers || DEFAULT_HOMEPAGE_CONTENT.farmers;
  const staffCopy = hc.staff || DEFAULT_HOMEPAGE_CONTENT.staff;
  const productsCopy = hc.products || DEFAULT_HOMEPAGE_CONTENT.products;
  const wholesaleCopy = hc.wholesale || DEFAULT_HOMEPAGE_CONTENT.wholesale;
  const impactCopy = hc.impact || DEFAULT_HOMEPAGE_CONTENT.impact;
  const footerCopy = hc.footer || DEFAULT_HOMEPAGE_CONTENT.footer;

  return (
    <div className="min-h-dvh bg-[#FFFFFF] text-[#171717] font-sans selection:bg-[#D9232E]/15 selection:text-[#D9232E]">
      {/* Top Navigation Bar (White Background) */}
      <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Company Logo */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9232E]/40 rounded"
            aria-label="Jamukaya Home"
          >
            {settings.logoRed || settings.logoUrl ? (
              <Logo variant="red" className="h-9 sm:h-10 w-auto" />
            ) : (
              <span className="text-xl font-black tracking-tight text-[#D9232E] whitespace-nowrap">
                Jamukaya
              </span>
            )}
          </button>

          {/* Center: For Farmers | MCC Staff | Our Products | Locations */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-4 text-sm font-semibold text-neutral-700"
          >
            {isSectionEnabled('farmers') && (
              <button
                type="button"
                onClick={() => scrollToSection('farmers')}
                className="hover:text-[#D9232E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {navCopy.farmersLabel || 'For Farmers'}
              </button>
            )}
            {isSectionEnabled('farmers') && isSectionEnabled('staff') && (
              <span aria-hidden="true" className="text-neutral-300 select-none">
                |
              </span>
            )}
            {isSectionEnabled('staff') && (
              <button
                type="button"
                onClick={() => scrollToSection('staff')}
                className="hover:text-[#D9232E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {navCopy.staffLabel || 'MCC Staff'}
              </button>
            )}
            {(isSectionEnabled('farmers') || isSectionEnabled('staff')) && isSectionEnabled('products') && (
              <span aria-hidden="true" className="text-neutral-300 select-none">
                |
              </span>
            )}
            {isSectionEnabled('products') && (
              <button
                type="button"
                onClick={() => scrollToSection('products')}
                className="hover:text-[#D9232E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {navCopy.productsLabel || 'Our Products'}
              </button>
            )}
            {isSectionEnabled('farmers') && (
              <>
                <span aria-hidden="true" className="text-neutral-300 select-none">
                  |
                </span>
                <button
                  type="button"
                  onClick={() => scrollToSection('locations')}
                  className="hover:text-[#D9232E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {navCopy.locationsLabel || 'Locations'}
                </button>
              </>
            )}
          </nav>

          {/* Right: Staff Login (Outlined Yellow) + Drop-Off Rates (Solid Red) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleStaffPortalClick}
              className="px-3.5 sm:px-4 py-2 text-xs font-bold text-[#171717] bg-[#FFFFFF] border-2 border-[#F4B400] hover:bg-[#F4B400]/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B400]"
            >
              {user ? navCopy.staffPortalLabel || 'Staff Portal' : navCopy.staffLoginLabel || 'Staff Login'}
            </button>

            {isSectionEnabled('hero') && (
              <button
                type="button"
                onClick={handleDropOffRatesClick}
                className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-[#D9232E] hover:bg-[#B81C26] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9232E]/40"
              >
                {navCopy.ratesButtonLabel || 'Drop-Off Rates'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              className="lg:hidden p-2 text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-[#FFFFFF] px-4 py-3 flex flex-wrap items-center gap-2">
            {isSectionEnabled('farmers') && (
              <button
                type="button"
                onClick={() => scrollToSection('farmers')}
                className="px-3 py-2 text-xs font-bold text-neutral-800 hover:text-[#D9232E] whitespace-nowrap"
              >
                {navCopy.farmersLabel || 'For Farmers'}
              </button>
            )}
            {isSectionEnabled('staff') && (
              <button
                type="button"
                onClick={() => scrollToSection('staff')}
                className="px-3 py-2 text-xs font-bold text-neutral-800 hover:text-[#D9232E] whitespace-nowrap"
              >
                {navCopy.staffLabel || 'MCC Staff'}
              </button>
            )}
            {isSectionEnabled('products') && (
              <button
                type="button"
                onClick={() => scrollToSection('products')}
                className="px-3 py-2 text-xs font-bold text-neutral-800 hover:text-[#D9232E] whitespace-nowrap"
              >
                {navCopy.productsLabel || 'Our Products'}
              </button>
            )}
            {isSectionEnabled('farmers') && (
              <button
                type="button"
                onClick={() => scrollToSection('locations')}
                className="px-3 py-2 text-xs font-bold text-neutral-800 hover:text-[#D9232E] whitespace-nowrap"
              >
                {navCopy.locationsLabel || 'Locations'}
              </button>
            )}
            {isSectionEnabled('hero') && (
              <button
                type="button"
                onClick={handleDropOffRatesClick}
                className="sm:hidden ml-auto px-3 py-2 text-xs font-bold text-white bg-[#D9232E] rounded-lg whitespace-nowrap"
              >
                {navCopy.ratesButtonLabel || 'Drop-Off Rates'}
              </button>
            )}
          </div>
        )}
      </header>

      <main>
        {enabledSections.map((sec, idx) => {
          const isLast = idx === enabledSections.length - 1;
          switch (sec.id) {
            case 'hero':
              return (
                <section key="hero" id="hero" className="bg-[#FFFFFF] border-b border-neutral-200">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                  <span className="inline-flex items-center gap-1.5 text-[#1E7E34] font-bold">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {heroCopy.badgeText || 'Tested & Fresh Cold-Chain'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{settings.companyName || 'Jambo Food Products Limited'}</span>
                </div>

                <h1 className="text-[clamp(2.75rem,5.5vw,4.5rem)] font-black tracking-tight leading-[1.02] text-[#D9232E] text-balance">
                  {settings.heroHeadline || 'Jamukaya.'}
                </h1>

                <p className="text-base sm:text-lg text-neutral-700 leading-relaxed max-w-[54ch] font-medium">
                  {settings.heroSubheadline ||
                    'Connecting Tanzanian dairy farmers, modern Milk Collection Centers (MCCs), and pure dairy products.'}
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleFindNearestMcc}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-[#D9232E] hover:bg-[#B81C26] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9232E]/40"
                  >
                    {heroCopy.primaryCtaLabel || 'Find Nearest Collection Center'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={handleStaffPortalClick}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-[#171717] bg-[#FFFFFF] border-2 border-[#171717] hover:border-[#F4B400] hover:bg-[#F4B400]/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B400]"
                  >
                    {heroCopy.secondaryCtaLabel || 'MCC Staff Portal'}
                  </button>
                </div>

                <div
                  id="dropoff-rates"
                  className={cn(
                    'pt-4 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl transition-all duration-300 scroll-mt-24',
                    highlightRates && 'bg-[#FFFBEB] p-4 ring-2 ring-[#F4B400]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2.5 h-10 rounded-full bg-[#F4B400] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-bold text-neutral-500">
                        {heroCopy.rateLabel || 'Current Drop-Off Rate'}
                      </p>
                      <p className="text-lg font-black text-neutral-900 tabular-nums">
                        TSh {formatNumber(milkPricePerLiter, 0)} / Liter
                      </p>
                      <p className="text-[11px] font-medium text-neutral-600">{payoutSchedule}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2.5 h-10 rounded-full bg-[#1E7E34] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-bold text-neutral-500">
                        {heroCopy.qualityLabel || 'Quality Verification'}
                      </p>
                      <p className="text-lg font-black text-[#1E7E34]">
                        {heroCopy.qualityValue || '100% Gate Tested'}
                      </p>
                      <p className="text-[11px] font-medium text-neutral-600 tabular-nums">
                        Intake: {dropOffHours}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 flex">
                <div className="relative w-full rounded-2xl overflow-hidden border border-neutral-200 bg-[#FAFAFA] min-h-[260px] sm:min-h-[360px]">
                  <MediaWithFallback
                    src={heroCopy.imageUrl || heroDropoffImg}
                    alt={settings.heroHeadline || 'Jamukaya Morning Milk Drop-Off'}
                    fallbackTitle="Jamukaya Morning Milk Drop-Off"
                    className="w-full h-full object-cover aspect-video lg:aspect-auto"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5 sm:p-6 text-white">
                    <p className="text-xs font-bold text-[#F4B400] tabular-nums">
                      {interpolate(heroCopy.imageCaptionEyebrow || 'Morning Milk Reception · {{dropOffHours}}')}
                    </p>
                    <p className="text-sm sm:text-base font-bold leading-snug mt-1">
                      {interpolate(heroCopy.imageCaptionText)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
              );

            case 'farmers':
              return (
                <section key="farmers" id="farmers" className="bg-[#FAFAFA] border-b border-neutral-200 scroll-mt-16">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs font-bold text-[#D9232E]">
                  {farmersCopy.eyebrow || 'For Dairy Farmers'}
                </p>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-neutral-900 text-balance">
                  {farmersCopy.headline || 'Simple Morning Drop-Off, Verified Quality, Predictable Payouts'}
                </h2>
              </div>
              {farmersCopy.trustBadge && (
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#1E7E34]">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>{farmersCopy.trustBadge}</span>
                </div>
              )}
            </div>

            {Array.isArray(farmersCopy.steps) && farmersCopy.steps.length > 0 && (
              <div
                className={cn(
                  'grid grid-cols-1 gap-6',
                  farmersCopy.steps.length === 1
                    ? 'md:grid-cols-1'
                    : farmersCopy.steps.length === 2
                    ? 'md:grid-cols-2'
                    : 'md:grid-cols-3'
                )}
              >
                {farmersCopy.steps.map((step, sIdx) => {
                  const toneColor =
                    step.accentTone === 'green'
                      ? 'text-[#1E7E34]'
                      : step.accentTone === 'gold'
                      ? 'text-[#D49B1A]'
                      : 'text-[#D9232E]';
                  const resolvedMeta = interpolate(step.metaText);
                  return (
                    <div key={step.id || sIdx} className="bg-[#FFFFFF] border border-neutral-200 rounded-xl p-6 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
                        <span className={cn('font-black text-sm tabular-nums', toneColor)}>
                          {step.stepNumber || `0${sIdx + 1}.`}
                        </span>
                        {resolvedMeta && (
                          <span
                            className={cn(
                              'tabular-nums inline-flex items-center gap-1',
                              step.accentTone === 'green'
                                ? 'text-[#1E7E34]'
                                : step.accentTone === 'gold'
                                ? 'text-neutral-900 font-bold'
                                : ''
                            )}
                          >
                            {step.accentTone === 'green' && <CheckCircle2 size={13} aria-hidden="true" />}
                            {resolvedMeta}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-black text-neutral-900">{step.title}</h3>
                      <p className="text-sm text-neutral-700 leading-relaxed">
                        {interpolate(step.description)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Interactive MCC Locator (#locations) */}
            <div
              id="locations"
              className="bg-[#FFFFFF] border border-neutral-200 rounded-2xl p-5 sm:p-8 space-y-6 scroll-mt-20"
            >
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-neutral-200">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[#D9232E]">
                    {farmersCopy.locatorEyebrow || 'Locations · Live MCC Directory'}
                  </p>
                  <h3 className="text-xl font-black text-neutral-900">
                    {farmersCopy.locatorHeadline || 'Interactive MCC Locator'}
                  </h3>
                  <p className="text-sm text-neutral-600">
                    {farmersCopy.locatorSubheadline ||
                      'Filter Milk Collection Centers by region or district for intake hours and gate contacts.'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <div className="flex flex-col gap-1 min-w-[170px]">
                    <label htmlFor="mcc-region-filter" className="text-xs font-bold text-neutral-600">
                      Region
                    </label>
                    <select
                      ref={regionSelectRef}
                      id="mcc-region-filter"
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="h-10 px-3 bg-[#FAFAFA] border border-neutral-300 rounded-lg text-sm font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                    >
                      {regions.map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 min-w-[200px]">
                    <label
                      htmlFor="mcc-district-filter"
                      className="text-xs font-bold text-neutral-600"
                    >
                      District or Center
                    </label>
                    <input
                      id="mcc-district-filter"
                      type="text"
                      value={districtFilter}
                      onChange={(e) => setDistrictFilter(e.target.value)}
                      placeholder="e.g. Nyamagana, Tarime..."
                      className="h-10 px-3 bg-[#FAFAFA] border border-neutral-300 rounded-lg text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                    />
                  </div>
                </div>
              </div>

              {filteredMccs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMccs.map((mcc) => {
                    const isOpen = mcc.status === 'Active';
                    const mccPhone = mcc.phone || supportPhone;
                    return (
                      <div
                        key={mcc.id}
                        className="p-4 sm:p-5 rounded-xl bg-[#FAFAFA] border border-neutral-200 flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-base font-black text-neutral-900 leading-snug">
                              {mcc.name}
                            </h4>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap shrink-0',
                                isOpen ? 'text-[#1E7E34]' : 'text-neutral-600'
                              )}
                            >
                              <CheckCircle2 size={13} aria-hidden="true" />
                              {mcc.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-medium">
                            <MapPin size={13} className="text-[#D9232E] shrink-0" aria-hidden="true" />
                            <span>
                              {mcc.district} · {mcc.region}
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-neutral-200 space-y-2 text-xs">
                          <div className="flex items-center gap-2 text-neutral-700 font-medium tabular-nums">
                            <Clock size={13} className="text-neutral-500 shrink-0" aria-hidden="true" />
                            <span>{mcc.hours || dropOffHours}</span>
                          </div>
                          <a
                            href={toTelHref(mccPhone)}
                            className="inline-flex items-center gap-2 font-bold text-[#D9232E] hover:underline tabular-nums"
                          >
                            <Phone size={13} aria-hidden="true" />
                            <span>{mccPhone}</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center space-y-3">
                  <p className="text-sm font-semibold text-neutral-700">
                    No collection centers matched that filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRegion('All Regions');
                      setDistrictFilter('');
                    }}
                    className="px-4 py-2 text-xs font-bold text-[#D9232E] border border-[#D9232E] rounded-lg hover:bg-[#D9232E]/5 transition-colors cursor-pointer"
                  >
                    Reset Filter
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
              );

            case 'staff': {
              const highlightTone =
                currentStaffSlide?.highlightColor === 'red'
                  ? 'text-[#D9232E]'
                  : currentStaffSlide?.highlightColor === 'green'
                  ? 'text-[#1E7E34]'
                  : currentStaffSlide?.highlightColor === 'gold'
                  ? 'text-[#D49B1A]'
                  : 'text-neutral-900';

              return (
                <section key="staff" id="staff" className="bg-[#FFFFFF] border-b border-neutral-200 scroll-mt-16">
          <div
            className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16"
            onMouseEnter={() => setIsStaffSliderHovered(true)}
            onMouseLeave={() => setIsStaffSliderHovered(false)}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              {/* Left: Auto-Sliding MCC Operations Photo Frame */}
              <div className="lg:col-span-5 flex">
                <div className="relative w-full rounded-2xl overflow-hidden border border-neutral-200 bg-[#FAFAFA] min-h-[280px] sm:min-h-[340px]">
                  <div key={currentStaffSlide.id} className="w-full h-full animate-in fade-in duration-700">
                    <MediaWithFallback
                      src={resolveStaffSlideImage(currentStaffSlide.imageUrl)}
                      alt={currentStaffSlide.header}
                      fallbackTitle={currentStaffSlide.header}
                      className="w-full h-full object-cover aspect-video lg:aspect-auto"
                    />
                  </div>

                  {staffSlides.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStepStaffSlide('prev')}
                        aria-label="Previous operations standard slide"
                        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-black/45 hover:bg-black/75 text-white backdrop-blur-sm transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepStaffSlide('next')}
                        aria-label="Next operations standard slide"
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-black/45 hover:bg-black/75 text-white backdrop-blur-sm transition-colors cursor-pointer"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 text-white">
                    <p className="text-xs font-bold text-[#F4B400] tabular-nums">
                      {String(currentStaffSlideIndex + 1).padStart(2, '0')} / {String(staffSlides.length).padStart(2, '0')}
                      {currentStaffSlide.highlightLabel ? ` · ${currentStaffSlide.highlightLabel}` : ''}
                    </p>
                    <p className="text-sm font-bold mt-0.5 leading-snug">
                      {currentStaffSlide.header}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Clean Editorial Content + Slide Controls + Direct Operational Portal */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-bold text-[#1E7E34]">
                    {staffCopy.eyebrow || 'For MCC Staff · Operations & Standards'}
                  </p>

                  <div key={currentStaffSlide.id} className="space-y-3 animate-in fade-in duration-500">
                    {currentStaffSlide.highlightLabel && (
                      <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                        {renderStandardIcon(currentStaffSlide.icon)}
                        <span className={cn('tabular-nums', highlightTone)}>
                          {currentStaffSlide.highlightLabel}
                        </span>
                      </div>
                    )}

                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-neutral-900 text-balance">
                      {currentStaffSlide.header}
                    </h2>

                    <p className="text-sm sm:text-base text-neutral-700 leading-relaxed max-w-[60ch]">
                      {currentStaffSlide.summary}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200 flex items-center justify-between gap-4">
                  {staffSlides.length > 1 ? (
                    <div className="flex items-center gap-2" aria-label="Operations slide indicator">
                      {staffSlides.map((slide, sIdx) => {
                        const isActive = sIdx === currentStaffSlideIndex;
                        return (
                          <button
                            key={slide.id}
                            type="button"
                            onClick={() => setCurrentStaffSlideIndex(sIdx)}
                            aria-label={`View slide ${sIdx + 1}: ${slide.header}`}
                            aria-current={isActive ? 'true' : undefined}
                            className={cn(
                              'h-2 rounded-full transition-all duration-300 cursor-pointer',
                              isActive ? 'w-7 bg-[#1E7E34]' : 'w-2 bg-neutral-300 hover:bg-neutral-400'
                            )}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div />
                  )}

                  <button
                    type="button"
                    onClick={handleStaffPortalClick}
                    className="px-5 py-2.5 text-xs font-bold text-[#171717] bg-[#F4B400] hover:bg-[#E0A500] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B400]"
                  >
                    {user
                      ? staffCopy.portalCtaLoggedIn || 'Open Operations Workspace'
                      : staffCopy.portalCtaLoggedOut || 'Staff Portal Sign In'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
              );
            }

            case 'products':
              return (
                <section key="products" id="products" className="bg-[#FFFFFF] border-b border-neutral-200 scroll-mt-16">
          {/* Auto-Sliding Product Spotlight */}
          {currentProduct && (
            <div
              onMouseEnter={() => setIsSliderHovered(true)}
              onMouseLeave={() => setIsSliderHovered(false)}
              className="relative w-full min-h-[540px] sm:min-h-[620px] lg:min-h-[680px] overflow-hidden bg-[#111111] flex flex-col justify-between"
            >
              {/* Full-Bleed Background Image Layer */}
              <div key={currentProduct.id} className="absolute inset-0 animate-in fade-in duration-700">
                <MediaWithFallback
                  src={resolveProductImage(currentProduct)}
                  alt={`${currentProduct.name} — ${currentProduct.tagline}`}
                  fallbackTitle={currentProduct.name}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/30 to-black/80"
                  aria-hidden="true"
                />
              </div>

              {/* Prev / Next Subtle Edge Controls */}
              <button
                type="button"
                onClick={() => handleStepSlide('prev')}
                aria-label="Previous product slide"
                className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-colors cursor-pointer"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => handleStepSlide('next')}
                aria-label="Next product slide"
                className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 h-11 w-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white backdrop-blur-sm transition-colors cursor-pointer"
              >
                <ChevronRight size={22} />
              </button>

              {/* Centered Apple-Style Top Content Stack */}
              <div className="relative z-10 max-w-3xl mx-auto px-6 pt-12 sm:pt-16 text-center space-y-4">
                <p className="text-xs sm:text-sm font-bold tracking-wide text-white/95 tabular-nums">
                  {[currentProduct.packSizes, currentProduct.shelfLife, currentProduct.storageType]
                    .filter(Boolean)
                    .join('  ·  ')}
                </p>
                <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-black tracking-tight leading-[1.03] text-white text-balance">
                  {currentProduct.name}
                </h2>
                <p className="text-lg sm:text-2xl font-medium text-white/95 leading-snug max-w-2xl mx-auto">
                  {currentProduct.tagline}
                </p>

                {/* Centered Apple-Style CTAs */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => handleSelectProductInquiry(currentProduct.name)}
                    className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-[#D9232E] hover:bg-[#B81C26] transition-colors cursor-pointer"
                  >
                    {productsCopy.primaryCtaLabel || 'Learn more'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectProductInquiry(currentProduct.name)}
                    className="px-6 py-2.5 rounded-full text-sm font-bold text-white border border-white/80 hover:bg-white hover:text-[#171717] transition-colors cursor-pointer"
                  >
                    {productsCopy.secondaryCtaLabel || 'Order Wholesale'}
                  </button>
                </div>
              </div>

              {/* Clean Slide Indicators */}
              <div className="relative z-10 max-w-3xl mx-auto w-full px-6 pb-8 sm:pb-10 text-center">

                <div
                  className="flex items-center justify-center gap-2"
                  role="tablist"
                  aria-label="Product slides"
                >
                  {activeProducts.map((prod, idx) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => setCurrentSlideIndex(idx)}
                      aria-label={`Show ${prod.name}`}
                      aria-selected={idx === currentSlideIndex}
                      className={cn(
                        'h-2 rounded-full transition-all duration-300 cursor-pointer',
                        idx === currentSlideIndex
                          ? 'w-8'
                          : 'w-2 bg-white/45 hover:bg-white/80'
                      )}
                      style={
                        idx === currentSlideIndex
                          ? { backgroundColor: prod.accentHex || '#F4B400' }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
              );

            case 'wholesale':
              return (
                <section key="wholesale" id="wholesale" className="bg-[#FFFFFF] border-b border-neutral-200 scroll-mt-16">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 space-y-4">
                <p className="text-xs font-bold text-[#D9232E]">
                  {wholesaleCopy.eyebrow || 'Wholesale & Distributor Inquiries'}
                </p>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 text-balance">
                  {wholesaleCopy.headline || 'Stock Jamukaya Dairy Across Schools, Retailers & Regional Depots'}
                </h2>
                <p className="text-sm text-neutral-700 leading-relaxed">
                  {wholesaleCopy.description ||
                    'Submit a trade inquiry directly to our headquarters database for wholesale case pricing, chilled delivery schedules, or UHT carton allocations.'}
                </p>
                <div className="pt-2 space-y-2.5 text-xs font-semibold text-neutral-700">
                  <p className="flex items-center gap-2 tabular-nums">
                    <Phone size={14} className="text-[#D9232E] shrink-0" aria-hidden="true" />
                    <a href={toTelHref(supportPhone)} className="hover:text-[#D9232E] font-bold">
                      {supportPhone}
                    </a>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail size={14} className="text-[#D9232E] shrink-0" aria-hidden="true" />
                    <a href={`mailto:${wholesaleEmail}`} className="hover:text-[#D9232E] font-bold">
                      {wholesaleEmail}
                    </a>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin size={14} className="text-[#D9232E] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{companyAddress}</span>
                  </p>
                </div>
              </div>

              <div className="lg:col-span-7 bg-[#FAFAFA] border border-neutral-200 rounded-2xl p-6 sm:p-8">
                {inquirySubmitted ? (
                  <div className="space-y-4 py-4">
                    <div className="inline-flex items-center gap-2 text-sm font-black text-[#1E7E34]">
                      <CheckCircle2 size={18} aria-hidden="true" />
                      Wholesale Inquiry Saved to HQ Queue
                    </div>
                    <p className="text-sm text-neutral-700 leading-relaxed">
                      Thank you, <span className="font-bold">{inquiryForm.contactName}</span>. Your
                      request for <span className="font-bold">{inquiryForm.productFocus}</span> (
                      {inquiryForm.businessName}) has been recorded for our HQ distribution desk and
                      we will contact <span className="font-bold">{inquiryForm.phoneOrEmail}</span>{' '}
                      shortly.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setInquirySubmitted(false);
                        setInquiryForm({
                          businessName: '',
                          contactName: '',
                          phoneOrEmail: '',
                          productFocus: 'Full Jamukaya Product Lineup',
                          region: '',
                        });
                      }}
                      className="px-4 py-2 text-xs font-bold text-[#171717] bg-[#FFFFFF] border border-neutral-300 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                    >
                      Submit Another Inquiry
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleWholesaleSubmit} className="space-y-4" noValidate>
                    {inquiryError && (
                      <p className="text-xs font-bold text-[#D9232E] bg-[#FFF5F5] border border-[#D9232E]/20 rounded-lg px-3 py-2">
                        {inquiryError}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label
                          htmlFor="wholesale-business"
                          className="text-xs font-bold text-neutral-700"
                        >
                          Shop / Distributor Name
                        </label>
                        <input
                          id="wholesale-business"
                          type="text"
                          required
                          value={inquiryForm.businessName}
                          onChange={(e) =>
                            setInquiryForm({ ...inquiryForm, businessName: e.target.value })
                          }
                          placeholder="e.g. Mwanza Mart Distributors"
                          className="w-full h-10 px-3 bg-[#FFFFFF] border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="wholesale-contact"
                          className="text-xs font-bold text-neutral-700"
                        >
                          Contact Person
                        </label>
                        <input
                          id="wholesale-contact"
                          type="text"
                          required
                          value={inquiryForm.contactName}
                          onChange={(e) =>
                            setInquiryForm({ ...inquiryForm, contactName: e.target.value })
                          }
                          placeholder="Full name"
                          className="w-full h-10 px-3 bg-[#FFFFFF] border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label
                          htmlFor="wholesale-phone-email"
                          className="text-xs font-bold text-neutral-700"
                        >
                          Phone or Email
                        </label>
                        <input
                          id="wholesale-phone-email"
                          type="text"
                          required
                          value={inquiryForm.phoneOrEmail}
                          onChange={(e) =>
                            setInquiryForm({ ...inquiryForm, phoneOrEmail: e.target.value })
                          }
                          placeholder="+255 6XX XXX XXX"
                          className="w-full h-10 px-3 bg-[#FFFFFF] border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="wholesale-region"
                          className="text-xs font-bold text-neutral-700"
                        >
                          Delivery Region
                        </label>
                        <input
                          id="wholesale-region"
                          type="text"
                          value={inquiryForm.region}
                          onChange={(e) =>
                            setInquiryForm({ ...inquiryForm, region: e.target.value })
                          }
                          placeholder="e.g. Shinyanga / Mwanza"
                          className="w-full h-10 px-3 bg-[#FFFFFF] border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="wholesale-product"
                          className="text-xs font-bold text-neutral-700"
                        >
                          Product Lineup
                        </label>
                        <select
                          id="wholesale-product"
                          value={inquiryForm.productFocus}
                          onChange={(e) =>
                            setInquiryForm({ ...inquiryForm, productFocus: e.target.value })
                          }
                          className="w-full h-10 px-3 bg-[#FFFFFF] border border-neutral-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D9232E]/30"
                        >
                          <option value="Full Jamukaya Product Lineup">
                            Full Jamukaya Product Lineup
                          </option>
                          {(settings.products || []).map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name} ({p.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <span className="text-xs text-neutral-500">
                        {wholesaleCopy.footerNote || 'Direct factory dispatch & cold-chain delivery scheduling.'}
                      </span>
                      <button
                        type="submit"
                        disabled={inquirySubmitting}
                        className="px-6 py-2.5 text-xs font-bold text-white bg-[#D9232E] hover:bg-[#B81C26] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                      >
                        {inquirySubmitting
                          ? 'Submitting Inquiry...'
                          : wholesaleCopy.submitButtonLabel || 'Request Wholesale Quote'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
              );

            case 'impact': {
              const visibleImpactItems = [
                impactStats.showActiveFarmers && {
                  key: 'farmers',
                  label: impactCopy.farmersLabel || 'Active Farmers',
                  value: `${formatNumber(impactStats.activeFarmers, 0)}+`,
                  desc:
                    impactCopy.farmersDesc ||
                    'Partner dairy farmers registered across the collection network.',
                },
                impactStats.showActiveMccs && {
                  key: 'mccs',
                  label: impactCopy.mccsLabel || 'Collection Centers',
                  value: formatNumber(impactStats.activeMccs, 0),
                  desc:
                    impactCopy.mccsDesc ||
                    'Operational MCC chilling hubs verified with gate quality testing.',
                },
                impactStats.showDailyLitersHq && {
                  key: 'liters',
                  label: impactCopy.litersLabel || 'Liters Processed Daily at HQ',
                  value: `${formatNumber(impactStats.dailyLitersHq, 0)}+ L`,
                  desc:
                    impactCopy.litersDesc ||
                    'Raw cold-chain intake processed into UHT, Yogurt, and Mtindi at HQ.',
                },
              ].filter(Boolean) as { key: string; label: string; value: string; desc: string }[];

              if (visibleImpactItems.length === 0) return null;

              return (
                <section
                  key="impact"
                  id="impact"
                  className={cn(
                    'bg-[#D9232E] text-white scroll-mt-16',
                    isLast && 'border-b border-white/20'
                  )}
                >
                  <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
                    <div
                      className={cn(
                        'grid grid-cols-1 gap-8',
                        visibleImpactItems.length === 2
                          ? 'md:grid-cols-2'
                          : visibleImpactItems.length >= 3
                          ? 'md:grid-cols-3'
                          : 'md:grid-cols-1'
                      )}
                    >
                      {visibleImpactItems.map((item, i) => (
                        <div
                          key={item.key}
                          className={cn(
                            'space-y-1',
                            i > 0 && 'md:border-l md:border-white/20 md:pl-8'
                          )}
                        >
                          <p className="text-xs font-bold uppercase tracking-wider text-white/80">
                            {item.label}
                          </p>
                          <p className="text-3xl sm:text-4xl font-black text-[#F4B400] tabular-nums">
                            {item.value}
                          </p>
                          <p className="text-xs text-white/85">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            }

            default:
              return null;
          }
        })}
      </main>

      {/* Footer (Bold Red #D9232E, Quick Actions & Contacts) */}
      <footer className="bg-[#D9232E] text-white">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 space-y-10">
          {/* Quick Actions & Branding + Address/Phone */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-3">
                {settings.logoWhite || settings.logoUrl ? (
                  <Logo variant="white" className="h-10 w-auto" />
                ) : (
                  <span className="text-2xl font-black tracking-tight text-white">Jamukaya</span>
                )}
              </div>
              <p className="text-sm font-bold text-white">
                {settings.companyName || 'Jambo Food Products Limited'}
              </p>
              <div className="space-y-1.5 text-xs text-white/90">
                <p className="flex items-start gap-2">
                  <MapPin size={14} className="text-[#F4B400] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{companyAddress}</span>
                </p>
                <p className="flex items-center gap-2 tabular-nums">
                  <Phone size={14} className="text-[#F4B400] shrink-0" aria-hidden="true" />
                  <a href={toTelHref(supportPhone)} className="hover:text-[#F4B400] font-semibold">
                    {supportPhone}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <Mail size={14} className="text-[#F4B400] shrink-0" aria-hidden="true" />
                  <a href={`mailto:${supportEmail}`} className="hover:text-[#F4B400] font-semibold">
                    {supportEmail}
                  </a>
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col sm:flex-row sm:items-center lg:justify-end gap-3">
              {isSectionEnabled('wholesale') ? (
                <button
                  type="button"
                  onClick={() => scrollToSection('wholesale')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-black text-[#171717] bg-[#F4B400] hover:bg-[#E0A500] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <PackageCheck size={16} aria-hidden="true" />
                  {footerCopy.wholesaleCtaLabel || 'Wholesale/Distributor Inquiries'}
                </button>
              ) : (
                <a
                  href={`mailto:${wholesaleEmail}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-black text-[#171717] bg-[#F4B400] hover:bg-[#E0A500] rounded-lg transition-colors whitespace-nowrap"
                >
                  <PackageCheck size={16} aria-hidden="true" />
                  {footerCopy.wholesaleCtaLabel || 'Wholesale/Distributor Inquiries'}
                </a>
              )}

              <a
                href={toTelHref(supportPhone)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg transition-colors whitespace-nowrap"
              >
                <Headphones size={16} aria-hidden="true" />
                {footerCopy.supportDeskPrefix || 'MCC Support Desk'} · {supportPhone}
              </a>

              <Link
                to={user ? '/dashboard' : '/login'}
                className="inline-flex items-center justify-center px-4 py-3 text-xs font-bold text-white border border-white/40 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                {user ? 'Operations Portal' : navCopy.staffLoginLabel || 'Staff Login'}
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-white/75">
            <p>
              © {new Date().getFullYear()} {settings.companyName || 'Jambo Food Products Limited'}
            </p>
            <div className="flex flex-wrap items-center gap-5 font-semibold">
              {isSectionEnabled('farmers') && (
                <button
                  type="button"
                  onClick={() => scrollToSection('farmers')}
                  className="hover:text-white cursor-pointer"
                >
                  {navCopy.farmersLabel || 'For Farmers'}
                </button>
              )}
              {isSectionEnabled('staff') && (
                <button
                  type="button"
                  onClick={() => scrollToSection('staff')}
                  className="hover:text-white cursor-pointer"
                >
                  {navCopy.staffLabel || 'MCC Staff'}
                </button>
              )}
              {isSectionEnabled('products') && (
                <button
                  type="button"
                  onClick={() => scrollToSection('products')}
                  className="hover:text-white cursor-pointer"
                >
                  {navCopy.productsLabel || 'Our Products'}
                </button>
              )}
              {isSectionEnabled('farmers') && (
                <button
                  type="button"
                  onClick={() => scrollToSection('locations')}
                  className="hover:text-white cursor-pointer"
                >
                  {navCopy.locationsLabel || 'Locations'}
                </button>
              )}
              <a href={`mailto:${supportEmail}`} className="hover:text-[#F4B400]">
                {supportEmail}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
