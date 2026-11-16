import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ClipboardList, 
  Truck, 
  Milk, 
  AlertTriangle, 
  FileText, 
  LayoutDashboard,
  Settings,
  ChevronRight,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  Activity,
  Users,
  Search,
  X,
  FileSearch
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { Logo } from '../components/Logo';
import { cn, formatNumber } from '../lib/utils';

export default function Home() {
  const { profile, effectiveRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Automatically redirect Super Users/Admins to Admin panel if they land on Home
    const isPrimaryAdmin = profile?.email?.toLowerCase() === 'mtaniwambura@gmail.com';
    if (effectiveRole === 'Super User' || effectiveRole === 'Admin' || isPrimaryAdmin) {
      navigate('/admin');
    }
  }, [effectiveRole, profile, navigate]);

  const [todayStats, setTodayStats] = useState({
    litres: 0,
    rejects: 0,
    intakes: 0,
    sellers: 0,
    sentLitres: 0,
    receivedLitres: 0,
    differenceLitres: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [greeting, setGreeting] = useState('');

  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Sellers Listener for name resolution
    const unsubSellers = onSnapshot(collection(db, 'sellers'), (snap) => {
      setSellers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Stats Listener - All time
    const unsubStats = onSnapshot(
      query(collection(db, 'daily_register')),
      (snap) => {
        let total = 0;
        const uniqueSellers = new Set();
        snap.forEach(doc => {
          const data = doc.data();
          total += (Number(data.quantity) || 0);
          uniqueSellers.add(data.sellerId || data.sellerName);
        });
        setTodayStats(prev => ({ ...prev, litres: total, sellers: uniqueSellers.size }));
      }
    );

    // Truck QA Stats Listener
    const unsubFactoryStats = onSnapshot(
      query(collection(db, 'truck_qa')),
      (snap) => {
        let sent = 0;
        let received = 0;
        snap.forEach(doc => {
          const data = doc.data();
          sent += (Number(data.litresLoaded) || 0);
          if (data.factoryStatus === 'Received') {
            received += (Number(data.qtyReceived) || 0);
          }
        });
        setTodayStats(prev => ({ 
          ...prev, 
          sentLitres: sent, 
          receivedLitres: received,
          differenceLitres: received - sent
        }));
      }
    );

    return () => {
      unsubSellers();
      unsubStats();
      unsubFactoryStats();
    };
  }, []);

  useEffect(() => {
    // Recent Activity Listener
    const unsubRecent = onSnapshot(
      query(collection(db, 'daily_register'), orderBy('createdAt', 'desc'), limit(5)),
      (snap) => {
        const activities = snap.docs.map(doc => {
          const data = doc.data();
          const seller = sellers.find(s => s.id === data.sellerId);
          return {
            id: doc.id,
            ...data,
            type: 'Collection',
            title: data.date ? format(new Date(data.date), 'dd/MM/yyyy') : 'Collection Recorded',
            subtitle: `${data.quantity}L from ${data.resolvedSellerName || data.sellerName || seller?.name || 'Unknown Seller'}`,
            time: data.createdAt ? new Date(data.createdAt) : new Date(),
            icon: ClipboardList,
            color: 'text-primary'
          };
        });
        setRecentActivities(activities);
      }
    );

    return () => unsubRecent();
  }, [sellers]);

  const quickActions = [
    { name: 'Daily Register', path: '/daily-register', icon: ClipboardList, desc: 'Record milk from sellers', roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor'] },
    { name: 'Truck & QA', path: '/truck-qa', icon: Truck, desc: 'Quality control & dispatch', roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor'] },
    { name: 'Milk Cans', path: '/milk-cans', icon: Milk, desc: 'Manage container inventory', roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller'] },
    { name: 'Admin Control', path: '/admin', icon: Settings, desc: 'System configuration & users', roles: ['Super User', 'Admin'] },
    { name: 'Reports', path: '/reports', icon: FileText, desc: 'View analytics & summaries', roles: ['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director'] },
  ].filter(item => {
    const isPrimaryAdmin = profile?.email?.toLowerCase() === 'mtaniwambura@gmail.com';
    return isPrimaryAdmin || !item.roles || item.roles.includes(effectiveRole as string);
  });

  const stats = [
    { label: "Total Volume", value: `${formatNumber(todayStats.litres, 2)} L`, icon: Milk, color: "text-primary", bg: "bg-primary/5" },
    { label: "Total Active Sellers", value: `${todayStats.sellers} Active`, icon: Users, color: "text-secondary", bg: "bg-secondary/5" },
    { label: "Quality Status", value: "Verified", icon: Activity, color: "text-green-600", bg: "bg-green-50" },
    { label: "Sent (Dispatched)", value: `${formatNumber(todayStats.sentLitres, 2)} L`, icon: Truck, color: "text-primary", bg: "bg-primary/5" },
    { label: "Received (Actual)", value: `${formatNumber(todayStats.receivedLitres, 2)} L`, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { 
      label: "Difference", 
      value: `${todayStats.differenceLitres > 0 ? '+' : ''}${formatNumber(todayStats.differenceLitres, 2)} L`, 
      icon: Activity, 
      color: todayStats.differenceLitres >= 0 ? "text-green-600" : "text-error", 
      bg: todayStats.differenceLitres >= 0 ? "bg-green-50" : "bg-error/5" 
    },
  ];

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-10">
      {/* Welcome Banner */}
      <div className="relative p-8 md:p-12 rounded-[2rem] bg-primary overflow-hidden shadow-xl">
        <div className="absolute -top-10 -right-10 opacity-5">
          <Logo variant="white" className="h-[400px] scale-150 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10 text-white">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/20"
            >
              <Clock size={14} className="text-secondary-container" />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">{format(new Date(), 'dd/MM/yyyy')}</span>
            </motion.div>
            <div className="space-y-1">
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-6xl font-black tracking-tight"
              >
                {greeting}, <br />
                <span className="text-secondary-container underline decoration-white/20 decoration-4 underline-offset-8">
                  {profile?.fullName.split(' ')[0]}
                </span>
              </motion.h1>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg opacity-80 max-w-lg leading-relaxed font-medium"
            >
              Welcome back to Jambo MCC Management. You have full oversight of collection cycles, quality metrics, and logistics today.
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex-shrink-0"
          >
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 flex flex-col items-center text-center space-y-3">
              <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center shadow-lg text-primary transform -rotate-3">
                <Logo variant="red" className="h-10" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Session Role</p>
                <p className="font-black text-xl leading-tight uppercase text-secondary-container">{effectiveRole}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Quick Portal & Summary */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick Actions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-black text-on-surface">Mission Critical</h2>
              <Link to="/reports" className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                Explore All Apps <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quickActions.map((action, idx) => (
                <motion.div
                  key={action.path}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * idx }}
                >
                  <Link 
                    to={action.path}
                    className="group flex items-start gap-4 p-6 bg-white rounded-3xl border border-outline-variant/10 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300"
                  >
                    <div className="h-14 w-14 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shadow-inner">
                      <action.icon size={28} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h3 className="font-black text-lg text-on-surface group-hover:text-primary transition-colors">{action.name}</h3>
                      <p className="text-sm text-on-surface-variant leading-relaxed">
                        {action.desc}
                      </p>
                      <div className="pt-2 flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                        Launch Service <ChevronRight size={12} />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Activity summary */}
          <section className="space-y-4">
            <h2 className="text-xl font-black text-on-surface px-2">Operational Pulse</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.map((stat, idx) => (
                <div key={idx} className="bg-white p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
                  <div className={cn("inline-flex p-3 rounded-2xl mb-4", stat.bg)}>
                    <stat.icon size={20} className={stat.color} />
                  </div>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">{stat.label}</p>
                  <p className="text-3xl font-black text-on-surface tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Live Feed & Profile Summary */}
        <div className="space-y-8">
          {/* Dashboard Shortcut Card */}
          <Link to="/dashboard" className="block relative p-6 rounded-3xl bg-secondary text-on-secondary shadow-lg hover:rotate-1 transition-transform group">
            <div className="space-y-4">
              <div className="h-10 w-10 flex items-center justify-center bg-white/20 rounded-xl">
                <LayoutDashboard size={20} />
              </div>
              <h3 className="text-2xl font-black leading-tight">Insight<br />Dashboard</h3>
              <p className="text-sm opacity-80">Full analytical breakdown of volume, financials and quality trends.</p>
              <div className="flex items-center gap-2 text-xs font-bold bg-white/20 w-fit px-4 py-2 rounded-full">
                Open Dashboard <ChevronRight size={14} />
              </div>
            </div>
            <div className="absolute bottom-4 right-4 opacity-10 group-hover:scale-110 transition-transform">
              <LayoutDashboard size={80} />
            </div>
          </Link>

          {/* Recent Activity */}
          <section className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-black text-on-surface">Recent Activity</h3>
              <Activity size={16} className="text-primary" />
            </div>
            <div className="p-2">
              {recentActivities.map((activity, idx) => (
                <button 
                  key={activity.id} 
                  onClick={() => setSelectedActivity(activity)}
                  className="w-full flex text-left gap-4 p-4 hover:bg-surface-container-low rounded-2xl transition-all group active:scale-95 cursor-pointer"
                >
                  <div className={cn("h-10 w-10 rounded-xl bg-surface flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform", activity.color)}>
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
                <div className="py-12 text-center text-on-surface-variant italic text-sm">
                  Waiting for activity...
                </div>
              )}
            </div>
            <div className="p-4 bg-surface-container-low/50">
              <Link to="/daily-register" className="block w-full py-2 text-xs font-bold text-primary hover:bg-white rounded-xl transition-colors text-center">
                View Full Logs
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-outline-variant/10"
          >
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className={cn("inline-flex p-4 rounded-2xl", selectedActivity.bg || 'bg-primary/5')}>
                  <selectedActivity.icon size={24} className={selectedActivity.color} />
                </div>
                <button 
                  onClick={() => setSelectedActivity(null)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-black text-on-surface">{selectedActivity.title}</h3>
                <p className="text-on-surface-variant font-bold">{selectedActivity.subtitle}</p>
              </div>

              <div className="bg-surface-container-low rounded-[1.5rem] p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Quantity</p>
                    <p className="text-lg font-black">{selectedActivity.quantity} Liters</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Unit Price</p>
                    <p className="text-lg font-black">{selectedActivity.pricePerUnit} TZS</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total Amount</p>
                    <p className="text-lg font-black text-primary">{formatNumber(selectedActivity.amount || 0, 0)} TZS</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Status</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase">
                      <CheckCircle2 size={12} /> {selectedActivity.status}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant/10 space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Clock size={16} className="text-on-surface-variant" />
                    <span className="text-on-surface-variant">Recorded at {format(selectedActivity.time, "HH:mm 'on' dd/MM/yyyy")}</span>
                  </div>
                  {selectedActivity.remarks && (
                    <div className="flex items-start gap-3 text-sm italic py-3 px-4 bg-white/50 rounded-xl">
                      <Activity size={16} className="text-primary mt-0.5" />
                      <p>"{selectedActivity.remarks}"</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Link 
                  to="/daily-register" 
                  className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-center shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  View full history
                </Link>
                <button 
                  onClick={() => setSelectedActivity(null)}
                  className="flex-1 bg-surface-container text-on-surface py-4 rounded-2xl font-black hover:bg-surface-container-high transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}


