import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs, 
  doc, 
  orderBy, 
  limit,
  getAggregateFromServer,
  sum,
  count
} from 'firebase/firestore';
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
  Truck,
  CheckCircle2
} from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfDay, subDays, subMonths, startOfWeek, startOfMonth, eachDayOfInterval, isSameDay, isSameWeek, isSameMonth } from 'date-fns';
import { safeFormat, getTanzaniaTodayStr, getTanzaniaDate, getSystemStartDate, parseTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
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
  totalSent: number;
  totalReceived: number;
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
    netBalance: 0,
    totalSent: 0,
    totalReceived: 0
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
        sellersQuery = query(collection(db, 'sellers'), where('mccIds', 'array-contains-any', mccIds));
      }
    } else if (selectedMccId !== 'all') {
      sellersQuery = query(collection(db, 'sellers'), where('mccIds', 'array-contains', selectedMccId));
    }

    const unsubscribeSellers = onSnapshot(sellersQuery, (snapshot) => {
      const sellersData = snapshot.docs.map(doc => {
        const data = doc.data();
        const smccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds: smccIds };
      });
      setSellers(sellersData);
      const activeCount = sellersData.filter((s: any) => s.active !== false).length;
      setStats(prev => ({ ...prev, uniqueSellers: activeCount }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    const mccNames = mccIds.map(id => mccs.find(m => m.id === id)?.name).filter(Boolean);
    const queryIds = [...mccIds, ...mccNames];
    let allTankersQuery = query(collection(db, 'truck_qa'), where('date', '>=', startDate), where('date', '<=', endDate));
    if (!isGlobalViewer) {
      if (canQuery) {
        allTankersQuery = query(collection(db, 'truck_qa'), where('mccId', 'in', queryIds.slice(0, 10)), where('date', '>=', startDate), where('date', '<=', endDate));
      }
    } else if (selectedMccId !== 'all') {
      const mccName = mccs.find(m => m.id === selectedMccId)?.name;
      const qIds = [selectedMccId];
      if (mccName) qIds.push(mccName);
      allTankersQuery = query(collection(db, 'truck_qa'), where('mccId', 'in', qIds), where('date', '>=', startDate), where('date', '<=', endDate));
    }

    const unsubscribeAllTankers = onSnapshot(allTankersQuery, (snapshot) => {
      let sent = 0;
      let received = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        sent += (Number(data.litresLoaded) || 0);
        if (data.factoryStatus === 'Received') {
          received += (Number(data.qtyReceived) || 0);
        }
      });
      setStats(prev => ({
        ...prev,
        totalSent: sent,
        totalReceived: received
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'truck_qa'));

    // Recent Tankers Query
    let tankerQuery = query(collection(db, 'truck_qa'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
    if (!isGlobalViewer) {
      if (canQuery) {
        tankerQuery = query(collection(db, 'truck_qa'), where('mccId', 'in', queryIds.slice(0, 10)), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
      }
    } else if (selectedMccId !== 'all') {
      const mccName = mccs.find(m => m.id === selectedMccId)?.name;
      const qIds = [selectedMccId];
      if (mccName) qIds.push(mccName);
      tankerQuery = query(collection(db, 'truck_qa'), where('mccId', 'in', qIds), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'desc'), limit(5));
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
        setStats(prev => ({
          ...prev,
          totalLitres: litres,
          totalPaid: paid,
          totalUnpaid: unpaid
        }));
        setAllEntries(entries);
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
        totalReceived = snapshot.docs.reduce((sum, doc) => sum + (Number(doc.data().amountReceived) || 0), 0);
        updateNetBalance();
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'money_received'));

      unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
        totalExpenses = snapshot.docs.reduce((sum, doc) => sum + (Number(doc.data().total) || 0), 0);
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
          if (data.status === 'Taken') issued += (Number(data.quantity) || 0);
          else returned += (Number(data.quantity) || 0);
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
        snapshot.forEach((doc) => {
          totalLitres += (Number(doc.data().litersRejected) || 0);
        });
        setRejectStats({ totalLitres, count: snapshot.size });
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));
    }

    return () => {
      unsubscribeSellers();
      unsubscribeAllTankers();
      unsubscribeTankers();
      unsubscribeRegister();
      unsubscribeMoney();
      unsubscribeExpenses();
      unsubscribeCans();
      unsubscribeRejects();
    };
  }, [profile, selectedMccId, mccs, isGlobalViewer, startDate, endDate]);

  const chartData = useMemo(() => {
    if (allEntries.length === 0) return [];

    const now = new Date();
    let data: any[] = [];

    // Pre-process entries into a map for faster lookup: [date][mccId]
    const entriesByDateAndMcc = new Map<string, Map<string, number>>();
    allEntries.forEach(e => {
      if (!entriesByDateAndMcc.has(e.date)) {
        entriesByDateAndMcc.set(e.date, new Map());
      }
      const mccMap = entriesByDateAndMcc.get(e.date)!;
      const mccKey = e.mccId;
      mccMap.set(mccKey, (mccMap.get(mccKey) || 0) + (Number(e.quantity) || 0));
    });

    const getMccDataForDate = (dateStr: string) => {
      const mccData: any = {};
      const mccMap = entriesByDateAndMcc.get(dateStr);
      let total = 0;
      
      mccs.forEach(mcc => {
        // Check for both ID and Name to be safe (historical reasons)
        const val = (mccMap?.get(mcc.id) || 0) + (mccMap?.get(mcc.name) || 0);
        mccData[mcc.name] = val;
        total += val;
      });
      return { mccData, total };
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

      const chartDays = days.slice(-31);

      data = chartDays.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const { mccData, total } = getMccDataForDate(dayStr);
        
        return {
          name: timeframe === 'custom' && days.length > 10 ? format(day, 'dd/MM') : format(day, 'EEE'),
          ...mccData,
          total,
          fullDate: format(day, 'dd/MM/yyyy')
        };
      });
    } else if (timeframe === 'weekly') {
      // Weekly grouping
      for (let i = 3; i >= 0; i--) {
        const weekStart = startOfWeek(subDays(now, i * 7));
        const weekEnd = startOfDay(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000));
        
        let weekTotal = 0;
        const weekMccData: any = {};
        mccs.forEach(mcc => weekMccData[mcc.name] = 0);

        // Iterate through entries in this week
        allEntries.forEach(e => {
          const eDate = new Date(e.date);
          if (eDate >= weekStart && eDate <= weekEnd) {
            const qty = Number(e.quantity) || 0;
            weekTotal += qty;
            const mcc = mccs.find(m => m.id === e.mccId || m.name === e.mccId);
            if (mcc) {
              weekMccData[mcc.name] += qty;
            }
          }
        });

        data.push({
          name: `Wk ${4-i}`,
          ...weekMccData,
          total: weekTotal,
          fullDate: `Week of ${format(weekStart, 'dd/MM/yyyy')}`
        });
      }
    } else if (timeframe === 'monthly' || timeframe === 'all') {
      const systemStart = startOfMonth(parseTanzaniaDate(getSystemStartDate()));
      const monthsToShow = timeframe === 'all' ? 12 : 6;
      for (let i = monthsToShow - 1; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        if (monthStart < systemStart) continue; // Don't show months prior to system development (March this year)
        
        let monthTotal = 0;
        const monthMccData: any = {};
        mccs.forEach(mcc => monthMccData[mcc.name] = 0);

        allEntries.forEach(e => {
          if (isSameMonth(new Date(e.date), monthStart)) {
            const qty = Number(e.quantity) || 0;
            monthTotal += qty;
            const mcc = mccs.find(m => m.id === e.mccId || m.name === e.mccId);
            if (mcc) {
              monthMccData[mcc.name] += qty;
            }
          }
        });
        
        // Only push if there's data or within the last 6 months to keep chart meaningful
        if (monthTotal > 0 || i < 6) {
          data.push({
            name: format(monthStart, 'MMM'),
            ...monthMccData,
            total: monthTotal,
            fullDate: format(monthStart, 'MMMM yyyy')
          });
        }
      }
    }

    return data;
  }, [allEntries, timeframe, mccs, startDate, endDate]);


  const checkWidgetPerm = (name: string) => {
    if (profile?.role === 'Admin' || profile?.role === 'Super User' || effectiveRole === 'Admin' || effectiveRole === 'Super User') return true;
    
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
    { name: timeframe === 'all' ? 'Total Litres (Lifetime)' : timeframe === 'custom' ? 'Litres (Custom Range)' : `Litres (${timeframe})`, value: `${formatNumber(filteredStatsByTimeframe.litres, 2, false, true)} L`, icon: Milk, color: 'text-green-600', bg: 'bg-green-50', hide: !checkWidgetPerm('Total Litres') },
    { name: timeframe === 'all' ? 'Total Sent (Lifetime)' : timeframe === 'custom' ? 'Sent (Custom Range)' : `Sent (${timeframe})`, value: `${formatNumber(stats.totalSent, 2, false, true)} L`, icon: Truck, color: 'text-primary', bg: 'bg-primary/5', hide: !checkWidgetPerm('Total Sent') },
    { name: timeframe === 'all' ? 'Total Received (Lifetime)' : timeframe === 'custom' ? 'Received (Custom Range)' : `Received (${timeframe})`, value: `${formatNumber(stats.totalReceived, 2, false, true)} L`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', hide: !checkWidgetPerm('Total Received') },
    { 
      name: 'Dispatch Difference', 
      value: `${(stats.totalReceived - stats.totalSent) > 0 ? '+' : ''}${formatNumber(stats.totalReceived - stats.totalSent, 2, false, true)} L`, 
      icon: TrendingUp, 
      color: (stats.totalReceived - stats.totalSent) >= 0 ? 'text-green-600' : 'text-red-600', 
      bg: (stats.totalReceived - stats.totalSent) >= 0 ? 'bg-green-50' : 'bg-red-50',
      hide: !checkWidgetPerm('Dispatch Difference')
    },
    { name: timeframe === 'all' ? 'Total Paid (Lifetime)' : timeframe === 'custom' ? 'Paid (Custom Range)' : `Paid (${timeframe})`, value: `TSh ${formatNumber(filteredStatsByTimeframe.paid, 2, true, true)}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', hide: !checkWidgetPerm('Total Paid') },
    { name: timeframe === 'all' ? 'Total Unpaid (Lifetime)' : timeframe === 'custom' ? 'Unpaid (Custom Range)' : `Unpaid (${timeframe})`, value: `TSh ${formatNumber(filteredStatsByTimeframe.unpaid, 2, true, true)}`, icon: AlertCircle, color: filteredStatsByTimeframe.unpaid > 0 ? 'text-amber-600' : 'text-on-surface-variant', bg: 'bg-amber-50', hide: !checkWidgetPerm('Total Unpaid') },
    { name: 'Station Expenses', value: `TSh ${formatNumber(stats.totalExpenses, 2, true, true)}`, icon: Receipt, color: 'text-red-600', bg: 'bg-red-50', hide: !checkWidgetPerm('Station Expenses') },
    { 
      name: 'Net Balance', 
      value: `TSh ${formatNumber(stats.netBalance, 2, true, true)}`, 
      icon: Wallet, 
      color: stats.netBalance >= 0 ? 'text-green-600' : 'text-red-600', 
      bg: stats.netBalance >= 0 ? 'bg-green-50' : 'bg-red-50', 
      hide: !checkWidgetPerm('Net Balance')
    },
    { name: 'Cans Issued', value: (milkCanStats.issued - milkCanStats.returned).toString(), icon: Milk, color: 'text-orange-600', bg: 'bg-orange-50', hide: !checkWidgetPerm('Cans Issued') },
    { name: "Total Rejects", value: `${formatNumber(rejectStats.totalLitres, 2, false, true)} L`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', hide: !checkWidgetPerm('Today\'s Rejects') },
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
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-on-surface">Dashboard Overview</h1>
          <p className="text-on-surface-variant font-medium text-sm">{globalSettings?.systemName || 'Real-time performance metrics for Jambo MCC'}</p>
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
                  if (t === 'all') {
                    setStartDate(getSystemStartDate()); // System inception March this year
                    setEndDate(getTanzaniaTodayStr());
                  } else if (t === 'daily') {
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
              <DateInput 
                value={startDate} 
                onChange={val => {
                  setStartDate(val);
                  setTimeframe('custom');
                }}
                label="From"
              />
              <div className="w-px h-8 bg-outline-variant/30 self-end mb-1"></div>
              <DateInput 
                value={endDate} 
                onChange={val => {
                  setEndDate(val);
                  setTimeframe('custom');
                }}
                label="To"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-secondary-container/10 rounded-2xl text-secondary">
            <Calendar size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-on-surface">
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
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">Total Liters</span>
            <span className="text-4xl font-black text-primary tracking-tight">{formatNumber(filteredStatsByTimeframe.litres, 2, false, true)} L</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">Amount Paid</span>
            <span className="text-4xl font-black text-green-600 tracking-tight">TSh {formatNumber(filteredStatsByTimeframe.paid, 2, true, true)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">Amount Unpaid</span>
            <span className="text-4xl font-black text-amber-600 tracking-tight">TSh {formatNumber(filteredStatsByTimeframe.unpaid, 2, true, true)}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.filter(stat => !stat.hide).map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-3xl border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-2xl", stat.bg)}>
                <stat.icon className={stat.color} size={20} />
              </div>
              <ArrowUpRight size={16} className="text-on-surface-variant opacity-40" />
            </div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-none mb-2">{stat.name}</p>
            <p className={cn("text-2xl font-black tracking-tight", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Performance Chart */}
      {checkWidgetPerm('MCC Performance') && (
        <div className="bg-white p-8 rounded-[2rem] border border-outline-variant/20 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <BarChart3 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight text-on-surface">MCC Performance</h3>
                <p className="text-xs font-medium text-on-surface-variant">Milk collection trends across the network</p>
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
                  formatter={(value: any, name: string) => [`${formatNumber(value, 2)} Liters`, name]}
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
          <div className="lg:col-span-2 bg-white rounded-[2rem] border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="font-black text-lg tracking-tight text-on-surface">Recent Milk Intake</h3>
              <button 
                onClick={() => navigate(`/daily-register?mccId=${selectedMccId}`)}
                className="text-xs font-black text-primary hover:underline bg-primary/5 px-3 py-1.5 rounded-full"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar-light">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                  <tr>
                    <th className="px-8 py-4">Date</th>
                    <th className="px-8 py-4">Seller Name</th>
                    <th className="px-8 py-4">Quantity</th>
                    <th className="px-8 py-4">Amount</th>
                    <th className="px-8 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-8 py-4 text-xs font-medium">{safeFormat(entry.date, 'dd/MM/yyyy')}</td>
                      <td className="px-8 py-4 text-sm font-black">
                        {entry.manualSellerName || sellers.find(s => s.id === entry.sellerId)?.name || entry.sellerId || 'Unknown'}
                      </td>
                      <td className="px-8 py-4 text-sm font-bold">{formatNumber(entry.quantity, 2, false, true)} {entry.unit}</td>
                      <td className="px-8 py-4 text-sm font-black text-primary">TSh {formatNumber(entry.quantity * entry.pricePerUnit, 2, true, true)}</td>
                      <td className="px-8 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight",
                          entry.status === 'PAID' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recentEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-on-surface-variant italic font-medium">No recent entries found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MCC Status */}
        {checkWidgetPerm('MCC Network Status') && (
          <div className="bg-white rounded-[2rem] border border-outline-variant/20 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-lg tracking-tight text-on-surface">Recent Tanker Movements</h3>
              <button 
                onClick={() => navigate('/factory-intake')}
                className="text-[10px] font-black text-primary hover:underline bg-primary/5 px-3 py-1.5 rounded-full uppercase tracking-wider"
              >
                Dispatches
              </button>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {recentTankers.map((tanker) => (
                <div key={tanker.id} className="flex flex-col gap-2 p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container-high/50 transition-all border border-transparent hover:border-outline-variant/30 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Truck size={16} className="text-primary group-hover:scale-110 transition-transform" />
                       <span className="text-sm font-black">{tanker.truckReg}</span>
                    </div>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2.5 py-1 rounded-full tracking-wide",
                      tanker.factoryStatus === 'Received' ? "bg-green-100 text-green-700" : "bg-primary text-white"
                    )}>
                      {tanker.factoryStatus || 'In Transit'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-on-surface font-bold">
                    <span>{mccs.find(m => m.id === tanker.mccId)?.name || 'Unknown MCC'}</span>
                    <span className="font-black text-primary">{formatNumber(tanker.litresLoaded, 2, false, true)} L</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-medium opacity-60">
                    <span>Sent: {safeFormat(tanker.date)}</span>
                    {tanker.receivedAt && (
                      <span className="text-green-600 font-bold">Rec: {safeFormat(tanker.receivedAt)}</span>
                    )}
                  </div>
                </div>
              ))}
              {recentTankers.length === 0 && (
                <div className="text-center py-12 opacity-40 italic text-sm font-medium">No recent movements</div>
              )}
            </div>
            
            <div className="mt-8 pt-8 border-t border-outline-variant/20">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-lg tracking-tight text-on-surface">MCC Network Status</h3>
                <span className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">{mccs.length} Total</span>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {mccs.map((mcc) => (
                  <div key={mcc.id} className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container-high/40 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full ring-4 ring-white/50",
                        mcc.status === 'Active' ? 'bg-green-500' : 
                        mcc.status === 'Closed' ? 'bg-red-500' :
                        mcc.status === 'Coming Soon' ? 'bg-amber-500' : 'bg-primary'
                      )}></div>
                      <span className="text-sm font-black group-hover:text-primary transition-colors">{mcc.name}</span>
                    </div>
                    <span className="text-[10px] font-black uppercase opacity-60 tracking-wider font-mono">{mcc.status}</span>
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
