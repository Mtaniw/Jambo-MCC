import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, sum, doc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { 
  Milk, 
  TrendingUp, 
  Users, 
  Wallet, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  BarChart3,
  Calendar,
  Loader2,
  Truck
} from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfDay, subDays, startOfWeek, startOfMonth, eachDayOfInterval, isSameDay, isSameWeek, isSameMonth } from 'date-fns';
import { safeFormat, getTanzaniaTodayStr, getTanzaniaDate } from '../lib/dateUtils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from 'recharts';

interface Stats {
  totalLitres: number;
  totalPaid: number;
  totalUnpaid: number;
  totalExpenses: number;
  uniqueSellers: number;
  netBalance: number;
}

const MCC_COLORS = [
  '#0066CC', // Blue
  '#22C55E', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#10B981', // Emerald
];

export default function Dashboard() {
  const { profile, effectiveRole, permissions } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalLitres: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    totalExpenses: 0,
    uniqueSellers: 0,
    netBalance: 0
  });
  const [milkCanStats, setMilkCanStats] = useState({
    issued: 0,
    returned: 0
  });
  const [rejectStats, setRejectStats] = useState({
    totalLitres: 0,
    count: 0
  });
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [recentTankers, setRecentTankers] = useState<any[]>([]);
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'all' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(getTanzaniaTodayStr());
  const [loading, setLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  const todayStr = getTanzaniaTodayStr();

  const todayStats = useMemo(() => {
    const todayEntries = allEntries.filter(e => e.date === todayStr);
    let litres = 0;
    let paid = 0;
    let unpaid = 0;
    
    todayEntries.forEach(e => {
      const qty = Number(e.quantity) || 0;
      const price = Number(e.pricePerUnit) || 0;
      const amount = Number(e.amount) || (qty * price);
      litres += qty;
      if (e.status === 'PAID') paid += amount;
      else unpaid += amount;
    });
    
    return { litres, paid, unpaid };
  }, [allEntries, todayStr]);

  const filteredStatsByTimeframe = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (timeframe === 'daily') start = startOfDay(now);
    else if (timeframe === 'weekly') {
      start = startOfWeek(now, { weekStartsOn: 1 }); 
    }
    else if (timeframe === 'monthly') start = startOfMonth(now);
    else if (timeframe === 'custom') {
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
    }
    else start = null;

    const filtered = allEntries.filter(e => {
      const itemDate = new Date(e.date);
      let matches = true;
      if (start) matches = matches && itemDate >= start;
      if (end) matches = matches && itemDate <= end;
      return matches;
    });
    
    let litres = 0;
    let paid = 0;
    let unpaid = 0;
    
    filtered.forEach(e => {
      const qty = Number(e.quantity) || 0;
      const price = Number(e.pricePerUnit) || 0;
      const amount = Number(e.amount) || (qty * price);
      litres += qty;
      if (e.status === 'PAID') paid += amount;
      else unpaid += amount;
    });
    
    return { litres, paid, unpaid };
  }, [allEntries, timeframe, startDate, endDate]);

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) setGlobalSettings(snap.data());
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global_config'));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile) return;

    // Fetch MCCs for filtering
    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    return () => {
      unsubscribeMccs();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || mccs.length === 0) return;

    const mccIds = profile.mccIds;
    let canQuery = true;
    if (!isGlobalViewer && mccIds.length === 0) {
      canQuery = false;
      setLoading(false);
    }

    // Fetch Sellers for names and count
    let sellersQuery = query(collection(db, 'sellers'));
    if (!isGlobalViewer) {
      if (canQuery) {
        sellersQuery = query(collection(db, 'sellers'), where('mccId', 'in', mccIds));
      }
    } else if (selectedMccId !== 'all') {
      sellersQuery = query(collection(db, 'sellers'), where('mccId', '==', selectedMccId));
    }

    const unsubscribeSellers = onSnapshot(sellersQuery, (snapshot) => {
      const sellersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSellers(sellersData);
      const activeCount = sellersData.filter((s: any) => s.active !== false).length;
      setStats(prev => ({ ...prev, uniqueSellers: activeCount }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    // Fetch Recent Tankers
    let tankerQuery = query(collection(db, 'truck_qa'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
    if (!isGlobalViewer) {
      if (canQuery) {
        tankerQuery = query(collection(db, 'truck_qa'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
      }
    } else if (selectedMccId !== 'all') {
      tankerQuery = query(collection(db, 'truck_qa'), where('mccId', '==', selectedMccId), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
    }

    const unsubscribeTankers = onSnapshot(tankerQuery, (snapshot) => {
      setRecentTankers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'truck_qa'));

    // Daily Register Query (Merged for Stats and Balance)
    let registerQuery = query(collection(db, 'daily_register'), where('date', '>=', startDate), where('date', '<=', endDate));
    if (!isGlobalViewer) {
      if (canQuery) {
        registerQuery = query(collection(db, 'daily_register'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      }
    } else if (selectedMccId !== 'all') {
      registerQuery = query(collection(db, 'daily_register'), where('mccId', '==', selectedMccId), where('date', '>=', startDate), where('date', '<=', endDate));
    }

    let unsubscribeRegister = () => {};
    let totalMilkPurchases = 0;
    let totalReceived = 0;
    let totalExpenses = 0;

    const updateNetBalance = () => {
      setStats(prev => ({
        ...prev,
        totalExpenses,
        netBalance: totalReceived - (totalExpenses + totalMilkPurchases)
      }));
    };

    if (canQuery) {
      unsubscribeRegister = onSnapshot(registerQuery, (snapshot) => {
        let litres = 0;
        let paid = 0;
        let unpaid = 0;
        let milkPurchases = 0;
        const entries: any[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          const qty = Number(data.quantity) || 0;
          const price = Number(data.pricePerUnit) || 0;
          const entryAmount = Number(data.amount) || (qty * price);
          
          litres += qty;
          if (data.status === 'PAID') paid += entryAmount;
          else unpaid += entryAmount;
          
          milkPurchases += entryAmount;
          entries.push({ id: doc.id, ...data });
        });

        totalMilkPurchases = milkPurchases;
        setAllEntries(entries);
        setStats(prev => ({
          ...prev,
          totalLitres: litres,
          totalPaid: paid,
          totalUnpaid: unpaid
        }));
        updateNetBalance();
        setRecentEntries(entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'daily_register'));
    }

    // Money Received and Expenses
    let moneyQuery = query(collection(db, 'money_received'), where('date', '>=', startDate), where('date', '<=', endDate));
    let expensesQuery = query(collection(db, 'expenses'), where('date', '>=', startDate), where('date', '<=', endDate));
    
    if (!isGlobalViewer) {
      if (canQuery) {
        moneyQuery = query(collection(db, 'money_received'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
        expensesQuery = query(collection(db, 'expenses'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      }
    } else if (selectedMccId !== 'all') {
      moneyQuery = query(collection(db, 'money_received'), where('mccId', '==', selectedMccId), where('date', '>=', startDate), where('date', '<=', endDate));
      expensesQuery = query(collection(db, 'expenses'), where('mccId', '==', selectedMccId), where('date', '>=', startDate), where('date', '<=', endDate));
    }

    let unsubscribeMoney = () => {};
    let unsubscribeExpenses = () => {};

    if (canQuery) {
      unsubscribeMoney = onSnapshot(moneyQuery, (snapshot) => {
        totalReceived = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amountReceived || 0), 0);
        updateNetBalance();
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'money_received'));

      unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
        totalExpenses = snapshot.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);
        updateNetBalance();
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'expenses'));
    }

    // Milk Cans Query
    let cansQuery = query(collection(db, 'milk_cans'), where('dateIssued', '>=', startDate), where('dateIssued', '<=', endDate));
    if (!isGlobalViewer) {
      if (canQuery) {
        cansQuery = query(collection(db, 'milk_cans'), where('mccId', 'in', mccIds), where('dateIssued', '>=', startDate), where('dateIssued', '<=', endDate));
      }
    } else if (selectedMccId !== 'all') {
      cansQuery = query(collection(db, 'milk_cans'), where('mccId', '==', selectedMccId), where('dateIssued', '>=', startDate), where('dateIssued', '<=', endDate));
    }

    let unsubscribeCans = () => {};
    if (canQuery) {
      unsubscribeCans = onSnapshot(cansQuery, (snapshot) => {
        let issued = 0;
        let returned = 0;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.status === 'Taken') issued += data.quantity;
          else returned += data.quantity;
        });
        setMilkCanStats({ issued, returned });
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'milk_cans'));
    }

    // Rejects Query
    let rejectsQuery = query(collection(db, 'rejects'), where('date', '>=', startDate), where('date', '<=', endDate));
    if (!isGlobalViewer) {
      if (canQuery) {
        const mccNames = mccIds.map(id => mccs.find(m => m.id === id)?.name).filter(Boolean);
        const queryIds = [...mccIds, ...mccNames];
        rejectsQuery = query(collection(db, 'rejects'), where('mccId', 'in', queryIds.slice(0, 10)), where('date', '>=', startDate), where('date', '<=', endDate));
      }
    } else if (selectedMccId !== 'all') {
      const mccName = mccs.find(m => m.id === selectedMccId)?.name;
      const queryIds = [selectedMccId];
      if (mccName) queryIds.push(mccName);
      rejectsQuery = query(collection(db, 'rejects'), where('mccId', 'in', queryIds), where('date', '>=', startDate), where('date', '<=', endDate));
    }

    let unsubscribeRejects = () => {};
    if (canQuery) {
      unsubscribeRejects = onSnapshot(rejectsQuery, (snapshot) => {
        let totalLitres = 0;
        const today = getTanzaniaTodayStr();
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Fallback for mccId matching (check ID or Name)
          const mccMatch = selectedMccId === 'all' || 
                           data.mccId === selectedMccId || 
                           mccs.find(m => m.id === selectedMccId)?.name === data.mccId;
          
          if (mccMatch) {
            totalLitres += data.litersRejected || 0;
          }
        });
        setRejectStats({ totalLitres, count: snapshot.size });
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));
    }

    return () => {
      unsubscribeSellers();
      unsubscribeTankers();
      unsubscribeRegister();
      unsubscribeMoney();
      unsubscribeExpenses();
      unsubscribeCans();
      unsubscribeRejects();
    };
  }, [profile, selectedMccId, mccs, isGlobalViewer]);

  const chartData = useMemo(() => {
    if (allEntries.length === 0) return [];

    const now = new Date();
    let data: any[] = [];

    const getMccDataForEntries = (entries: any[]) => {
      const mccData: any = {};
      mccs.forEach(mcc => {
        mccData[mcc.name] = entries
          .filter(e => e.mccId === mcc.id || e.mccId === mcc.name)
          .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      });
      return mccData;
    };

    if (timeframe === 'daily' || timeframe === 'custom') {
      let start = subDays(now, 6);
      let end = now;

      if (timeframe === 'custom') {
        if (startDate) start = new Date(startDate);
        if (endDate) end = new Date(endDate);
      }

      const days = eachDayOfInterval({
        start: startOfDay(start),
        end: startOfDay(end)
      });

      // Limit to 31 days to avoid chart clutter
      const chartDays = days.slice(-31);

      data = chartDays.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayEntries = allEntries.filter(e => e.date === dayStr);
        
        return {
          name: timeframe === 'custom' && days.length > 10 ? format(day, 'dd/MM') : format(day, 'EEE'),
          ...getMccDataForEntries(dayEntries),
          total: dayEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
          fullDate: format(day, 'dd/MM/yyyy')
        };
      });
    } else if (timeframe === 'weekly') {
      for (let i = 3; i >= 0; i--) {
        const weekStart = startOfWeek(subDays(now, i * 7));
        const weekEntries = allEntries.filter(e => isSameWeek(new Date(e.date), weekStart));
        
        data.push({
          name: `Wk ${4-i}`,
          ...getMccDataForEntries(weekEntries),
          total: weekEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
          fullDate: `Week of ${format(weekStart, 'MMM dd')}`
        });
      }
    } else if (timeframe === 'monthly' || timeframe === 'all') {
      const monthsToShow = timeframe === 'all' ? 12 : 6;
      for (let i = monthsToShow - 1; i >= 0; i--) {
        const monthStart = startOfMonth(subDays(now, i * 30));
        const monthEntries = allEntries.filter(e => isSameMonth(new Date(e.date), monthStart));
        
        data.push({
          name: format(monthStart, 'MMM'),
          ...getMccDataForEntries(monthEntries),
          total: monthEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
          fullDate: format(monthStart, 'MMMM yyyy')
        });
      }
    }

    return data;
  }, [allEntries, timeframe, mccs]);


  const checkWidgetPerm = (name: string) => {
    if (profile?.role === 'Admin') return true;
    
    // Check custom user permissions first
    if (profile?.customPermissions?.dashboard) {
      const hasCustomPerm = profile.customPermissions.dashboard[name];
      if (hasCustomPerm !== undefined) return hasCustomPerm;
    }

    // Check granular role-based permissions if they exist
    if (permissions && effectiveRole && permissions[effectiveRole]) {
      const hasPerm = permissions[effectiveRole].dashboard?.[name];
      if (hasPerm !== undefined) return hasPerm;
    }
    return true; // Default to true if no permission defined
  };

  const statCards = [
    { name: timeframe === 'all' ? 'Total Litres (Lifetime)' : timeframe === 'custom' ? 'Litres (Custom Range)' : `Litres (${timeframe})`, value: `${formatNumber(filteredStatsByTimeframe.litres, 1)} L`, icon: Milk, color: 'text-green-600', bg: 'bg-green-50', hide: !checkWidgetPerm('Total Litres') },
    { name: timeframe === 'all' ? 'Total Paid (Lifetime)' : timeframe === 'custom' ? 'Paid (Custom Range)' : `Paid (${timeframe})`, value: `TSh ${formatNumber(filteredStatsByTimeframe.paid, 0)}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', hide: !checkWidgetPerm('Total Paid') },
    { name: timeframe === 'all' ? 'Total Unpaid (Lifetime)' : timeframe === 'custom' ? 'Unpaid (Custom Range)' : `Unpaid (${timeframe})`, value: `TSh ${formatNumber(filteredStatsByTimeframe.unpaid, 0)}`, icon: AlertCircle, color: filteredStatsByTimeframe.unpaid > 0 ? 'text-amber-600' : 'text-on-surface-variant', bg: 'bg-amber-50', hide: !checkWidgetPerm('Total Unpaid') },
    { name: 'Station Expenses', value: `TSh ${formatNumber(stats.totalExpenses, 0)}`, icon: Receipt, color: 'text-red-600', bg: 'bg-red-50', hide: !checkWidgetPerm('Station Expenses') },
    { 
      name: 'Net Balance', 
      value: `TSh ${formatNumber(stats.netBalance, 0)}`, 
      icon: Wallet, 
      color: stats.netBalance >= 0 ? 'text-green-600' : 'text-red-600', 
      bg: stats.netBalance >= 0 ? 'bg-green-50' : 'bg-red-50', 
      hide: !checkWidgetPerm('Net Balance')
    },
    { name: 'Cans Issued', value: (milkCanStats.issued - milkCanStats.returned).toString(), icon: Milk, color: 'text-orange-600', bg: 'bg-orange-50', hide: !checkWidgetPerm('Cans Issued') },
    { name: "Total Rejects", value: `${formatNumber(rejectStats.totalLitres, 1)} L`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', hide: !checkWidgetPerm('Today\'s Rejects') },
    { name: 'Active Sellers', value: stats.uniqueSellers, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50', hide: !checkWidgetPerm('Active Sellers') },
  ];

  return (
    <div className={cn("space-y-8", loading && "opacity-60")}>
      {loading && allEntries.length === 0 && (
        <div className="flex justify-center p-20">
          <Loader2 className="animate-spin h-10 w-10 text-primary" />
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Dashboard Overview</h1>
          <p className="text-on-surface-variant text-sm">{globalSettings?.systemName || 'Real-time performance metrics for Jambo MCC'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isGlobalViewer && (
            <select 
              value={selectedMccId} 
              onChange={e => setSelectedMccId(e.target.value)}
              className="bg-white border border-outline-variant/20 rounded-lg px-4 py-2 text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary/20 outline-none h-10"
            >
              <option value="all">All MCCs</option>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          )}
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
              {(['daily', 'weekly', 'monthly', 'all', 'custom'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTimeframe(t);
                    if (t === 'daily') {
                       setStartDate(getTanzaniaTodayStr());
                       setEndDate(getTanzaniaTodayStr());
                    } else if (t === 'weekly') {
                       setStartDate(format(startOfWeek(getTanzaniaDate()), 'yyyy-MM-dd'));
                       setEndDate(getTanzaniaTodayStr());
                    } else if (t === 'monthly') {
                       setStartDate(format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
                       setEndDate(getTanzaniaTodayStr());
                    }
                  }}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-bold rounded-md transition-all capitalize",
                    timeframe === t ? "bg-white text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {t === 'all' ? 'All Time' : t}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg border border-outline-variant/30">
              <div className="flex items-center gap-1 px-2 border-r border-outline-variant/30">
                <Calendar size={12} className="text-primary" />
                <span className="text-[10px] font-bold uppercase opacity-60">From</span>
              </div>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => {
                  setStartDate(e.target.value);
                  setTimeframe('custom');
                }}
                className="bg-transparent border-none text-[10px] font-bold p-1 outline-none"
              />
              <div className="flex items-center gap-1 px-2 border-l border-r border-outline-variant/30">
                <span className="text-[10px] font-bold uppercase opacity-60">To</span>
              </div>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => {
                  setEndDate(e.target.value);
                  setTimeframe('custom');
                }}
                className="bg-transparent border-none text-[10px] font-bold p-1 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-secondary-container/10 rounded-lg text-secondary">
            <Calendar size={20} />
          </div>
          <div>
            <h3 className="font-bold text-on-surface">
              {timeframe === 'daily' ? 'Daily Sales Overview' : 
               timeframe === 'weekly' ? 'Weekly Sales Overview' : 
               timeframe === 'monthly' ? 'Monthly Sales Overview' : 
               timeframe === 'custom' ? 'Custom Period Overview' : 'All-Time Sales Overview'}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {timeframe === 'daily' ? `Today's collection summary (${safeFormat(todayStr)})` : 
               timeframe === 'custom' ? `Performance from ${safeFormat(startDate) || '?'} to ${safeFormat(endDate) || '?'}` :
               `Performance summary for ${timeframe}`}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Total Liters</span>
            <span className="text-3xl font-extrabold text-primary">{formatNumber(filteredStatsByTimeframe.litres, 1)} L</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Total Paid</span>
            <span className="text-3xl font-extrabold text-green-600">TSh {formatNumber(filteredStatsByTimeframe.paid, 0)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Total Pending</span>
            <span className="text-3xl font-extrabold text-amber-600">TSh {formatNumber(filteredStatsByTimeframe.unpaid, 0)}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.filter(stat => !stat.hide).map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg", stat.bg)}>
                <stat.icon className={stat.color} size={20} />
              </div>
              <ArrowUpRight size={16} className="text-on-surface-variant opacity-40" />
            </div>
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">{stat.name}</p>
            <p className={cn("text-xl font-bold mt-1", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Performance Chart */}
      {checkWidgetPerm('MCC Performance') && (
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-on-surface">MCC Performance</h3>
                <p className="text-xs text-on-surface-variant">Milk collection trends across the network</p>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {mccs.map((mcc, index) => (
                    <linearGradient key={mcc.id} id={`color-${mcc.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={MCC_COLORS[index % MCC_COLORS.length]} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={MCC_COLORS[index % MCC_COLORS.length]} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6B7280" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6B7280" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 500 }}
                  tickFormatter={(value) => `${value}L`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFFFF', 
                    borderRadius: '12px', 
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    padding: '8px 12px'
                  }}
                  formatter={(value: any, name: string) => [`${formatNumber(value, 1)} Liters`, name]}
                  labelFormatter={(label, payload) => {
                    const data = payload[0]?.payload;
                    return data?.fullDate || label;
                  }}
                  cursor={{ stroke: '#6B7280', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                {selectedMccId === 'all' ? (
                  mccs.map((mcc, index) => (
                    <Area 
                      key={mcc.id}
                      type="monotone" 
                      dataKey={mcc.name} 
                      stroke={MCC_COLORS[index % MCC_COLORS.length]} 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill={`url(#color-${mcc.id})`} 
                      stackId="1"
                      animationDuration={1500}
                    />
                  ))
                ) : (
                  <Area 
                    type="monotone" 
                    dataKey={mccs.find(m => m.id === selectedMccId)?.name || 'litres'} 
                    stroke="#0066CC" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                    animationDuration={1500}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        {checkWidgetPerm('Recent Milk Intake') && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="font-bold text-on-surface">Recent Milk Intake</h3>
              <button 
                onClick={() => navigate(`/daily-register?mccId=${selectedMccId}`)}
                className="text-xs font-bold text-primary hover:underline"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Seller Name</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4 text-sm">{safeFormat(entry.date, 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 text-sm font-medium">
                        {entry.manualSellerName || sellers.find(s => s.id === entry.sellerId)?.name || entry.sellerId}
                      </td>
                      <td className="px-6 py-4 text-sm">{entry.quantity} {entry.unit}</td>
                      <td className="px-6 py-4 text-sm font-bold">TSh {formatNumber(entry.quantity * entry.pricePerUnit, 0)}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                          entry.status === 'PAID' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recentEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-on-surface-variant italic">No recent entries found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MCC Status */}
        {checkWidgetPerm('MCC Network Status') && (
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-on-surface">Recent Tanker Movements</h3>
              <button 
                onClick={() => navigate('/factory-intake')}
                className="text-[10px] font-bold text-primary hover:underline bg-primary/5 px-2 py-1 rounded-full"
              >
                View All dispatches
              </button>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {recentTankers.map((tanker) => (
                <div key={tanker.id} className="flex flex-col gap-2 p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high/50 transition-all border border-transparent hover:border-outline-variant/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Truck size={14} className="text-secondary" />
                       <span className="text-sm font-black">{tanker.truckReg}</span>
                    </div>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                      tanker.factoryStatus === 'Received' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {tanker.factoryStatus || 'In Transit'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-medium">
                    <span>{mccs.find(m => m.id === tanker.mccId)?.name || 'Unknown MCC'}</span>
                    <span className="font-bold">{formatNumber(tanker.litresLoaded, 0)} L</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] opacity-60">
                    <span>Dispatched: {safeFormat(tanker.date)}</span>
                    {tanker.receivedAt && (
                      <span className="text-green-600 font-bold">Received: {safeFormat(tanker.receivedAt)}</span>
                    )}
                  </div>
                </div>
              ))}
              {recentTankers.length === 0 && (
                <div className="text-center py-10 opacity-40 italic text-sm">No recent movements</div>
              )}
            </div>
            
            <div className="mt-8 pt-6 border-t border-outline-variant/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-on-surface">MCC Network Status</h3>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">{mccs.length} Total</span>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {mccs.map((mcc) => (
                  <div key={mcc.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-low/80 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        mcc.status === 'Active' ? 'bg-green-500' : 
                        mcc.status === 'Closed' ? 'bg-red-500' :
                        mcc.status === 'Coming Soon' ? 'bg-amber-500' : 'bg-blue-500'
                      )}></div>
                      <span className="text-sm font-medium">{mcc.name}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase opacity-60">{mcc.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
