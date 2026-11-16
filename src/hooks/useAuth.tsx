import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';

interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  role: 'Super User' | 'Admin' | 'Cashier' | 'Quality Controller' | 'Supervisor' | 'Manager' | 'Director' | 'Factory Clerk';
  roleOverride?: 'Super User' | 'Admin' | 'Cashier' | 'Quality Controller' | 'Supervisor' | 'Manager' | 'Director' | 'Factory Clerk';
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
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Listen to role permissions
    let unsubscribePermissions: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
      
      // Force Super User role for the primary admin email
      if (firebaseUser && firebaseUser.email?.toLowerCase() === 'mtaniwambura@gmail.com') {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        try {
          const docSnap = await getDoc(profileRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.role !== 'Super User' || data.roleOverride || data.status !== 'active') {
              await updateDoc(profileRef, {
                role: 'Super User',
                roleOverride: null, // Remove any override
                status: 'active'
              });
              console.log('Forced Super User role for admin email');
            }
          } else {
            // First time login for this specific user
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
        } catch (err) {
          console.error('Error in auth role sync:', err);
        }
      }

      // Clean up existing profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      // Clean up existing permissions listener if any
      if (unsubscribePermissions) {
        unsubscribePermissions();
        unsubscribePermissions = null;
      }

      if (firebaseUser) {
        // Listen to profile changes
        const profileRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ uid: firebaseUser.uid, email: firebaseUser.email || '', ...docSnap.data() } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });

        // Listen to role permissions
        unsubscribePermissions = onSnapshot(doc(db, 'settings', 'role_permissions'), (docSnap) => {
          if (docSnap.exists()) {
            setPermissions(docSnap.data() as RolePermissions);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'settings/role_permissions');
        });
      } else {
        setProfile(null);
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
