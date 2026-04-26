import { useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

export default function PresenceTracker() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!auth.currentUser || !profile) return;

    const userId = auth.currentUser.uid;
    const presenceRef = doc(db, 'presence', userId);

    const updatePresence = async (status: 'online' | 'offline') => {
      try {
        await setDoc(presenceRef, {
          uid: userId,
          username: profile.username,
          fullName: profile.fullName,
          lastSeen: serverTimestamp(),
          status: status
        }, { merge: true });
      } catch (error) {
        console.error('Error updating presence:', error);
      }
    };

    updatePresence('online');

    // Heartbeat every 2 minutes
    const interval = setInterval(() => updatePresence('online'), 120000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updatePresence('offline');
      } else {
        updatePresence('online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      updatePresence('offline');
    };
  }, [profile]);

  return null;
}
