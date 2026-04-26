import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface GlobalSettings {
  milkPrice: number;
  systemName: string;
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  logoRed: string;
  logoWhite: string;
  favicon: string;
}

const defaultSettings: GlobalSettings = {
  milkPrice: 1200,
  systemName: 'Jambo MCC Management System',
  companyName: 'Jambo Food Products Limited',
  supportEmail: 'mtaniwambura@gmail.com',
  logoUrl: 'https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw',
  logoRed: '',
  logoWhite: '',
  favicon: ''
};

export function useSettings() {
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global_config'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings({ ...defaultSettings, ...snapshot.data() } as GlobalSettings);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { settings, loading };
}
