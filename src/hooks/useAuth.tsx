import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';

interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  role: 'Super User' | 'Admin' | 'Cashier' | 'Quality Controller' | 'Supervisor' | 'Manager' | 'Director' | 'Factory Clerk' | 'Viewer';
  roleOverride?: 'Super User' | 'Admin' | 'Cashier' | 'Quality Controller' | 'Supervisor' | 'Manager' | 'Director' | 'Factory Clerk' | 'Viewer';
  mccIds: string[];
  status: 'pending' | 'active' | 'inactive';
  email: string;
  customPermissions?: {
    pages?: { [page: string]: boolean };
    dashboard?: { [widget: string]: boolean };
  };
}

interface RolePermissions {
  [role: string]: {
    pages: { [page: string]: boolean };
    dashboard: { [widget: string]: boolean };
  };
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  effectiveRole: string | null;
  permissions: RolePermissions | null;
  loading: boolean;
  isAuthReady: boolean;
}

const PROFILE_CACHE_KEY = 'jambo_auth_profile_v1';
const PERMS_CACHE_KEY = 'jambo_role_perms_v1';

function readCachedProfile(uid?: string): UserProfile | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return parsed?.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

function readCachedPermissions(): RolePermissions | null {
  try {
    const raw = localStorage.getItem(PERMS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as RolePermissions) : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  effectiveRole: null,
  permissions: null,
  loading: true,
  isAuthReady: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(() => readCachedPermissions());
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribePermissions: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (unsubscribePermissions) {
        unsubscribePermissions();
        unsubscribePermissions = null;
      }

      if (firebaseUser) {
        // Hydrate immediately from local cache for returning users so UI renders without waiting on network
        const cached = readCachedProfile(firebaseUser.uid);
        if (cached) {
          setProfile(cached);
          setLoading(false);
        }

        // Listen to profile changes immediately (non-blocking)
        const profileRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeProfile = onSnapshot(
          profileRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const nextProfile = { uid: firebaseUser.uid, email: firebaseUser.email || '', ...docSnap.data() } as UserProfile;
              setProfile(nextProfile);
              try {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
              } catch {
                // Ignore storage quota errors
              }
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setLoading(false);
          }
        );

        // Listen to role permissions
        unsubscribePermissions = onSnapshot(
          doc(db, 'settings', 'role_permissions'),
          (docSnap) => {
            if (docSnap.exists()) {
              const perms = docSnap.data() as RolePermissions;
              setPermissions(perms);
              try {
                localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify(perms));
              } catch {
                // Ignore storage quota errors
              }
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.LIST, 'settings/role_permissions');
          }
        );

        // Non-blocking primary admin role sync in background
        if (firebaseUser.email?.toLowerCase() === 'mtaniwambura@gmail.com') {
          getDoc(profileRef)
            .then(async (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.role !== 'Super User' || data.roleOverride || data.status !== 'active') {
                  await updateDoc(profileRef, {
                    role: 'Super User',
                    roleOverride: null,
                    status: 'active'
                  });
                }
              } else {
                await setDoc(profileRef, {
                  fullName: firebaseUser.displayName || 'Mtani Mtani',
                  username: 'mtani',
                  role: 'Super User',
                  mccIds: [],
                  status: 'active',
                  email: firebaseUser.email,
                  createdAt: new Date().toISOString()
                });
              }
            })
            .catch((err) => {
              console.error('Error in auth role sync:', err);
            });
        }
      } else {
        setProfile(null);
        try {
          localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch {
          // Ignore
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribePermissions) unsubscribePermissions();
    };
  }, []);

  const effectiveRole = profile?.email?.toLowerCase() === 'mtaniwambura@gmail.com'
    ? 'Super User'
    : (profile?.roleOverride || profile?.role || null);

  return (
    <AuthContext.Provider value={{ user, profile, effectiveRole, permissions, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
