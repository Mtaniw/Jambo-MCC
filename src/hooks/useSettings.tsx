import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface GlobalSettings {
  milkPrice: number;
  systemName: string;
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  logoRed: string;
  logoWhite: string;
  favicon: string;
  loginBgUrl: string;
}

const SETTINGS_CACHE_KEY = 'jambo_global_settings_v1';

const defaultSettings: GlobalSettings = {
  milkPrice: 1200,
  systemName: 'Jambo MCC Management System',
  companyName: 'Jambo Food Products Limited',
  supportEmail: 'mtaniwambura@gmail.com',
  logoUrl: 'https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw',
  logoRed: '',
  logoWhite: '',
  favicon: '',
  loginBgUrl: 'https://picsum.photos/seed/factory/1920/1080'
};

function readCachedSettings(): GlobalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage read errors
  }
  return defaultSettings;
}

let sharedSettings: GlobalSettings = readCachedSettings();
let sharedLoaded = false;
let subscriberCount = 0;
let unsubscribeFirestore: (() => void) | null = null;
const listeners = new Set<(s: GlobalSettings, loaded: boolean) => void>();

function ensureSettingsSubscription() {
  if (unsubscribeFirestore) return;
  unsubscribeFirestore = onSnapshot(
    doc(db, 'settings', 'global_config'),
    (snapshot) => {
      if (snapshot.exists()) {
        sharedSettings = { ...defaultSettings, ...snapshot.data() } as GlobalSettings;
        try {
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(sharedSettings));
        } catch {
          // Ignore storage quota errors
        }
      }
      sharedLoaded = true;
      listeners.forEach((fn) => fn(sharedSettings, true));
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

    // Sync immediately in case sharedSettings updated between render and effect
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
