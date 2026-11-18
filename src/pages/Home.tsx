import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Truck,
  Milk,
  FileText,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  Activity,
  Users,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  collection,
  query,
  onSnapshot,
  limit,
  orderBy,
  getAggregateFromServer,
  getCountFromServer,
  sum,
  where,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { Logo } from '../components/Logo';
import { cn, formatNumber } from '../lib/utils';
import { safeFormat } from '../lib/dateUtils';

export default function Home() {
  const { profile, effectiveRole } = useAuth();

  const [todayStats, setTodayStats] = useState({
    litres: 0,
    sellers: 0,
    sentLitres: 0,
    receivedLitres: 0,
    differenceLitres: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    let active = true;

    async function loadSummaryStats() {
      try {
        const [
          registerAgg,
          sellersCountSnap,
          sentAgg,
          receivedAgg
        ] = await Promise.all([
          getAggregateFromServer(collection(db, 'daily_register'), {
            totalLitres: sum('quantity')
          }),
          getCountFromServer(collection(db, 'sellers')),
          getAggregateFromServer(collection(db, 'truck_qa'), {
            totalSent: sum('litresLoaded')
          }),
          getAggregateFromServer(
            query(collection(db, 'truck_qa'), where('factoryStatus', '==', 'Received')),
            { totalReceived: sum('qtyReceived') }
          )
        ]);

        if (!active) return;

        const litres = Number(registerAgg.data().totalLitres) || 0;
        const sellersCount = sellersCountSnap.data().count || 0;
        const sent = Number(sentAgg.data().totalSent) || 0;
        const received = Number(receivedAgg.data().totalReceived) || 0;

        setTodayStats({
          litres,
          sellers: sellersCount,
          sentLitres: sent,
          receivedLitres: received,
          differenceLitres: received - sent
        });
      } catch (err) {
        console.warn('Home summary aggregate fallback:', err);
      }
    }

    loadSummaryStats();

    // Lightweight real-time listener for only the 5 most recent entries
    const unsubRecent = onSnapshot(
      query(collection(db, 'daily_register'), orderBy('createdAt', 'desc'), limit(5)),
      async (snap) => {
        if (!active) return;

        const rawItems = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        // Resolve only missing seller names for these 5 items
        const missingSellerIds = Array.from(
          new Set(
            rawItems
              .filter((item) => !item.resolvedSellerName && !item.sellerName && !item.manualSellerName && item.sellerId)
              .map((item) => String(item.sellerId))
          )
        );

        const sellerNameMap = new Map<string, string>();
        if (missingSellerIds.length > 0) {
          await Promise.all(
            missingSellerIds.map(async (sid) => {
              try {
                const sSnap = await getDoc(doc(db, 'sellers', sid));
                if (sSnap.exists()) {
                  sellerNameMap.set(sid, (sSnap.data() as any).name || '');
                }
              } catch {
                // Ignore individual lookup errors
              }
            })
          );
        }

        if (!active) return;

        const activities = rawItems.map((data) => {
          const sellerName =
            data.resolvedSellerName ||
            data.manualSellerName ||
            data.sellerName ||
            sellerNameMap.get(String(data.sellerId)) ||
            'Unknown Seller';

          const parsedCreatedAt = data.createdAt ? new Date(data.createdAt) : new Date();
          const validTime = isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;

          return {
            ...data,
            type: 'Collection',
            title: safeFormat(data.date, 'dd/MM/yyyy') || 'Collection Recorded',
            subtitle: `${formatNumber(Number(data.quantity) || 0, 2)}L from ${sellerName}`,
            time: validTime,
            icon: ClipboardList,
            color: 'text-primary'
          };
        });

        setRecentActivities(activities);
      },
      (err) => {
        console.error('Recent activity listener error:', err);
      }
    );

    return () => {
      active = false;
      unsubRecent();
    };
  }, []);

  const isPrimaryAdmin = profile?.email?.toLowerCase() === 'mtaniwambura@gmail.com';
  const roleLabel = effectiveRole || profile?.role || 'Member';
  const firstName = (profile?.fullName || profile?.username || 'User').trim().split(' ')[0];

  const quickActions = [
    { name: 'Daily Register', path: '/daily-register', icon: ClipboardList, desc: 'Record milk from sellers', roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer'] },
    { name: 'Truck & QA', path: '/truck-qa', icon: Truck, desc: 'Quality control & dispatch', roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Cashier', 'Factory Clerk', 'Manager', 'Director', 'Viewer'] },
    { name: 'Milk Cans', path: '/milk-cans', icon: Milk, desc: 'Manage container inventory', roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer'] },
    { name: 'Admin Control', path: '/admin', icon: Settings, desc: 'System configuration & users', roles: ['Super User', 'Admin'] },
    { name: 'Reports', path: '/reports', icon: FileText, desc: 'View analytics & summaries', roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk'] },
  ].filter(item => {
    return isPrimaryAdmin || !item.roles || item.roles.includes(effectiveRole as string);
  });

  const stats = [
    { label: 'Total Volume', value: `${formatNumber(todayStats.litres, 2)} L`, icon: Milk, color: 'text-primary', bg: 'bg-primary/5' },
    { label: 'Total Sellers', value: `${todayStats.sellers} Registered`, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Quality Status', value: 'Verified', icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Sent (Dispatched)', value: `${formatNumber(todayStats.sentLitres, 2)} L`, icon: Truck, color: 'text-primary', bg: 'bg-primary/5' },
    { label: 'Received (Actual)', value: `${formatNumber(todayStats.receivedLitres, 2)} L`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    {
      label: 'Difference',
      value: `${todayStats.differenceLitres > 0 ? '+' : ''}${formatNumber(todayStats.differenceLitres, 2)} L`,
      icon: Activity,
      color: todayStats.differenceLitres >= 0 ? 'text-green-600' : 'text-error',
      bg: todayStats.differenceLitres >= 0 ? 'bg-green-50' : 'bg-error/5'
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 max-w-[1600px] mx-auto pb-8 sm:pb-10">
      {/* Welcome Banner */}
      <div className="relative p-5 sm:p-8 lg:p-10 rounded-3xl sm:rounded-[2rem] bg-primary overflow-hidden shadow-xl">
        <div className="absolute -top-10 -right-10 opacity-5 pointer-events-none hidden sm:block">
          <Logo variant="white" className="h-[340px] lg:h-[400px] scale-150 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-10 text-white">
          <div className="space-y-3 sm:space-y-4 min-w-0">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/20">
              <Clock size={14} className="text-secondary-container shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                {format(new Date(), 'dd/MM/yyyy')}
              </span>
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-black tracking-tight break-words">
                {greeting}, <br />
                <span className="text-secondary-container underline decoration-white/20 decoration-4 underline-offset-8">
                  {firstName}
                </span>
              </h1>
            </div>
            <p className="text-sm sm:text-base lg:text-lg opacity-85 max-w-xl leading-relaxed font-medium">
              Welcome back to Jambo MCC Management. You have full oversight of collection cycles, quality metrics, and logistics today.
            </p>
          </div>

          <div className="flex-shrink-0 self-start md:self-auto">
            <div className="bg-white/10 backdrop-blur-md p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/20 flex md:flex-col items-center gap-4 md:gap-3 text-left md:text-center">
              <div className="h-12 w-12 sm:h-16 sm:w-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg text-primary md:-rotate-3 shrink-0">
                <Logo variant="red" className="h-8 sm:h-10" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Session Role</p>
                <p className="font-black text-base sm:text-xl leading-tight uppercase text-secondary-container">{roleLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left Column: Quick Portal & Summary */}
        <div className="lg:col-span-2 space-y-6 sm:space-y-8 min-w-0">
          {/* Quick Actions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1 sm:px-2">
              <h2 className="text-lg sm:text-xl font-black text-on-surface">Mission Critical</h2>
              <Link to="/reports" className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                Explore All Apps <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {quickActions.map((action) => (
                <Link
                  key={action.path}
                  to={action.path}
                  className="group flex items-start gap-4 p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-200"
                >
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-200 shadow-inner shrink-0">
                    <action.icon size={24} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="font-black text-base sm:text-lg text-on-surface group-hover:text-primary transition-colors">{action.name}</h3>
                    <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                      {action.desc}
                    </p>
                    <div className="pt-1 sm:pt-2 flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      Launch Service <ChevronRight size={12} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Activity summary */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-black text-on-surface px-1 sm:px-2">Operational Pulse</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {stats.map((stat, idx) => (
                <div key={idx} className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm min-w-0">
                  <div className={cn('inline-flex p-2.5 sm:p-3 rounded-xl sm:rounded-2xl mb-3 sm:mb-4', stat.bg)}>
                    <stat.icon size={20} className={stat.color} />
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight break-words">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Live Feed & Profile Summary */}
        <div className="space-y-6 sm:space-y-8 min-w-0">
          {/* Dashboard Shortcut Card */}
          <Link
            to="/dashboard"
            className="block relative p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary to-primary-container text-white shadow-lg hover:shadow-xl transition-all group overflow-hidden"
          >
            <div className="relative z-10 space-y-3 sm:space-y-4">
              <div className="h-10 w-10 flex items-center justify-center bg-white/20 rounded-xl">
                <LayoutDashboard size={20} />
              </div>
              <h3 className="text-xl sm:text-2xl font-black leading-tight">Insight<br />Dashboard</h3>
              <p className="text-xs sm:text-sm opacity-90">Full analytical breakdown of volume, financials and quality trends.</p>
              <div className="flex items-center gap-2 text-xs font-bold bg-white/20 w-fit px-4 py-2 rounded-full group-hover:bg-white group-hover:text-primary transition-colors">
                Open Dashboard <ChevronRight size={14} />
              </div>
            </div>
            <div className="absolute bottom-4 right-4 opacity-10 group-hover:scale-110 transition-transform pointer-events-none">
              <LayoutDashboard size={80} />
            </div>
          </Link>

          {/* Recent Activity */}
          <section className="bg-white rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-black text-on-surface">Recent Activity</h3>
              <Activity size={16} className="text-primary" />
            </div>
            <div className="p-2">
              {recentActivities.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => setSelectedActivity(activity)}
                  className="w-full flex text-left gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-surface-container-low rounded-2xl transition-all group active:scale-[0.99] cursor-pointer"
                >
                  <div className={cn('h-10 w-10 rounded-xl bg-surface flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform', activity.color)}>
                    <activity.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{activity.title}</p>
                    <p className="text-xs text-on-surface-variant truncate">{activity.subtitle}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-on-surface-variant font-medium opacity-60">
                      <Clock size={10} />
                      {format(activity.time, 'HH:mm')}
                    </div>
                  </div>
                </button>
              ))}
              {recentActivities.length === 0 && (
                <div className="py-10 text-center text-on-surface-variant italic text-sm">
                  Waiting for activity...
                </div>
              )}
            </div>
            <div className="p-3 sm:p-4 bg-surface-container-low/50">
              <Link to="/daily-register" className="block w-full py-2 text-xs font-bold text-primary hover:bg-white rounded-xl transition-colors text-center">
                View Full Logs
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedActivity(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto border border-outline-variant/10"
          >
            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
              <div className="flex items-center justify-between">
                <div className={cn('inline-flex p-3 sm:p-4 rounded-2xl', selectedActivity.bg || 'bg-primary/5')}>
                  <selectedActivity.icon size={24} className={selectedActivity.color} />
                </div>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-black text-on-surface">{selectedActivity.title}</h3>
                <p className="text-sm sm:text-base text-on-surface-variant font-bold break-words">{selectedActivity.subtitle}</p>
              </div>

              <div className="bg-surface-container-low rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Quantity</p>
                    <p className="text-base sm:text-lg font-black">{selectedActivity.quantity} Liters</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Unit Price</p>
                    <p className="text-base sm:text-lg font-black">{selectedActivity.pricePerUnit} TZS</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total Amount</p>
                    <p className="text-base sm:text-lg font-black text-primary">{formatNumber(selectedActivity.amount || 0, 0)} TZS</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Status</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase">
                      <CheckCircle2 size={12} /> {selectedActivity.status || 'RECORDED'}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant/10 space-y-3">
                  <div className="flex items-center gap-3 text-xs sm:text-sm">
                    <Clock size={16} className="text-on-surface-variant shrink-0" />
                    <span className="text-on-surface-variant">Recorded at {format(selectedActivity.time, "HH:mm 'on' dd/MM/yyyy")}</span>
                  </div>
                  {selectedActivity.remarks && (
                    <div className="flex items-start gap-3 text-xs sm:text-sm italic py-3 px-4 bg-white/50 rounded-xl">
                      <Activity size={16} className="text-primary mt-0.5 shrink-0" />
                      <p>"{selectedActivity.remarks}"</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/daily-register"
                  className="flex-1 bg-primary text-white py-3.5 sm:py-4 rounded-2xl font-black text-center shadow-lg shadow-primary/20 hover:opacity-95 transition-all"
                >
                  View full history
                </Link>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="flex-1 bg-surface-container text-on-surface py-3.5 sm:py-4 rounded-2xl font-black hover:bg-surface-container-high transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
