import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { format, subDays } from 'date-fns';
import { db } from '../firebase';
import { getTanzaniaDate, getTanzaniaTodayStr } from './dateUtils';

export interface PublicStatsSnapshot {
  activeFarmers: number;
  activeMccs: number;
  dailyLitersHq: number;
  updatedAt: string;
}

export interface LiveDbStatsResult extends PublicStatsSnapshot {
  todayIntake: number;
  sourceLabel: string;
}

export const PUBLIC_STATS_CACHE_KEY = 'jambo_public_stats_v1';

let inFlightSync: Promise<LiveDbStatsResult | null> | null = null;
let lastSyncTime = 0;

export async function fetchLiveDbStats(): Promise<LiveDbStatsResult> {
  const todayStr = getTanzaniaTodayStr();
  const thirtyDaysAgoStr = format(subDays(getTanzaniaDate(), 30), 'yyyy-MM-dd');

  const [mccsSnap, sellersCountSnap, inactiveSellersSnap, recentRegisterSnap] = await Promise.all([
    getDocs(collection(db, 'mccs')),
    getCountFromServer(collection(db, 'sellers')),
    getCountFromServer(query(collection(db, 'sellers'), where('active', '==', false))),
    getDocs(query(collection(db, 'daily_register'), where('date', '>=', thirtyDaysAgoStr))),
  ]);

  const activeMccs =
    mccsSnap.docs.filter((d) => d.data().status === 'Active').length || mccsSnap.size;
  const totalSellers = sellersCountSnap.data().count || 0;
  const inactiveSellers = inactiveSellersSnap.data().count || 0;
  const activeFarmers = Math.max(0, totalSellers - inactiveSellers);

  const litersByDate = new Map<string, number>();
  recentRegisterSnap.docs.forEach((d) => {
    const data = d.data();
    const dateKey = String(data.date || '').slice(0, 10);
    const qty = Number(data.quantity) || 0;
    if (dateKey && qty > 0) {
      litersByDate.set(dateKey, (litersByDate.get(dateKey) || 0) + qty);
    }
  });

  // Fallback for historical datasets with no entries in the last 30 days
  if (litersByDate.size === 0) {
    const latestSnap = await getDocs(
      query(collection(db, 'daily_register'), orderBy('date', 'desc'), limit(200))
    );
    latestSnap.docs.forEach((d) => {
      const data = d.data();
      const dateKey = String(data.date || '').slice(0, 10);
      const qty = Number(data.quantity) || 0;
      if (dateKey && qty > 0) {
        litersByDate.set(dateKey, (litersByDate.get(dateKey) || 0) + qty);
      }
    });
  }

  const todayIntake = Math.round(litersByDate.get(todayStr) || 0);
  const recentAvgDaily =
    litersByDate.size > 0
      ? Math.round(
          Array.from(litersByDate.values()).reduce((a, b) => a + b, 0) / litersByDate.size
        )
      : 0;

  const dailyLitersHq = todayIntake > 0 ? todayIntake : recentAvgDaily;
  const sourceLabel =
    todayIntake > 0 ? 'today intake' : litersByDate.size > 0 ? 'daily average' : 'database';

  return {
    activeFarmers,
    activeMccs,
    dailyLitersHq,
    todayIntake,
    sourceLabel,
    updatedAt: new Date().toISOString(),
  };
}

export async function syncPublicStatsToFirestore(options?: {
  force?: boolean;
}): Promise<LiveDbStatsResult | null> {
  const now = Date.now();
  if (!options?.force && inFlightSync) {
    return inFlightSync;
  }
  if (!options?.force && now - lastSyncTime < 8000) {
    return null;
  }

  const runner = (async () => {
    try {
      const live = await fetchLiveDbStats();
      const payload: PublicStatsSnapshot = {
        activeFarmers: live.activeFarmers,
        activeMccs: live.activeMccs,
        dailyLitersHq: live.dailyLitersHq,
        updatedAt: live.updatedAt,
      };
      await setDoc(doc(db, 'settings', 'public_stats'), payload);
      lastSyncTime = Date.now();
      try {
        localStorage.setItem(PUBLIC_STATS_CACHE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore storage quota errors
      }
      return live;
    } catch (err) {
      console.warn('Could not sync public_stats:', err);
      return null;
    } finally {
      inFlightSync = null;
    }
  })();

  inFlightSync = runner;
  return runner;
}
