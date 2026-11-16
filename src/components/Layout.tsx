import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  Home as HomeIcon,
  LayoutDashboard, 
  ClipboardList, 
  Receipt, 
  Wallet, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  ShieldCheck,
  Truck,
  Milk,
  Users,
  AlertTriangle,
  FileText,
  Calendar
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { cn } from '../lib/utils';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';

const LOGO_URL = "https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, effectiveRole, permissions } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  const LOGO_BASE = globalSettings?.logoUrl || LOGO_URL;
  const LOGO_RED = globalSettings?.logoRed || LOGO_BASE;
  const LOGO_WHITE = globalSettings?.logoWhite || LOGO_BASE;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) setGlobalSettings(snap.data());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile) return;
    
    const q = query(collection(db, 'presence'), where('status', '==', 'online'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data());
      setOnlineUsers(users);
    }, (error) => {
      console.error('Presence snapshot error:', error);
    });
    return () => unsubscribe();
  }, [profile]);

  // Derive filtered online users (only those seen in last 10 minutes)
  const [filteredOnlineUsers, setFilteredOnlineUsers] = useState<any[]>([]);

  useEffect(() => {
    const filterUsers = () => {
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      
      const filtered = onlineUsers.filter(user => {
        if (!user.lastSeen) return false;
        const lastSeenDate = user.lastSeen?.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
        return (now - lastSeenDate.getTime()) < tenMinutes;
      });
      
      setFilteredOnlineUsers(filtered);
    };

    filterUsers();
    const interval = setInterval(filterUsers, 60000); // Re-filter every minute
    return () => clearInterval(interval);
  }, [onlineUsers]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    { name: 'Home', path: '/', icon: HomeIcon, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk'] },
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Daily Register', path: '/daily-register', icon: ClipboardList, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Expenses', path: '/expenses', icon: Receipt, roles: ['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Funds Received', path: '/funds', icon: Wallet, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Truck & QA', path: '/truck-qa', icon: Truck, roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Cashier', 'Manager', 'Director'] },
    { name: 'Milk Cans', path: '/milk-cans', icon: Milk, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Rejects', path: '/rejects', icon: AlertTriangle, roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Reports', path: '/reports', icon: FileText, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk'] },
    { name: 'Goods Received', path: '/factory-intake', icon: Truck, roles: ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Admin Panel', path: '/admin', icon: Settings, roles: ['Super User', 'Admin'] },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (!profile) return false;
    
    // Admin and Super User always see everything (Fail-safe for primary admin)
    const isPrimaryAdmin = profile.email?.toLowerCase() === 'mtaniwambura@gmail.com';
    if (effectiveRole === 'Admin' || effectiveRole === 'Super User' || isPrimaryAdmin) return true;

    // Check custom user permissions first
    if (profile.customPermissions?.pages) {
      const pageName = item.name === 'Admin Panel' ? 'Admin' : item.name;
      const hasCustomPerm = profile.customPermissions.pages[pageName];
      if (hasCustomPerm !== undefined) return hasCustomPerm;
    }

    // Check granular role-based permissions if they exist
    if (permissions && effectiveRole && permissions[effectiveRole]) {
      const hasPerm = permissions[effectiveRole].pages?.[item.name === 'Admin Panel' ? 'Admin' : item.name];
      if (hasPerm !== undefined) return hasPerm;
    }

    return item.roles.includes(effectiveRole as string);
  });

  const currentPage = navItems.find(item => item.path === location.pathname);

  // Inactivity logout logic (10 minutes)
  useEffect(() => {
    if (!profile) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 10 * 60 * 1000); // 10 minutes
    };

    // Events to listen for
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer(); // Initial call

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [profile]);

  // Click outside dropdown logic
  useEffect(() => {
    if (!showOnlineUsers) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowOnlineUsers(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOnlineUsers]);

  useEffect(() => {
    // BrandingManager handles base title and favicon
    // We only update the title with page prefix here
    const baseTitle = globalSettings?.systemName || 'Jambo MCC Management System';
    if (currentPage) {
      document.title = `${currentPage.name} | ${baseTitle}`;
    }
  }, [currentPage, globalSettings]);

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row font-sans">
      {/* Sidebar - Enhanced for Brand Identity */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-primary text-white transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 overflow-hidden shadow-2xl print:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Sidebar Header */}
          <div className="p-5 pb-4 border-b border-white/10 flex-shrink-0">
            <div className="mb-4 flex items-center justify-between">
              <Logo variant="white" className="h-10 w-auto" />
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] font-black uppercase tracking-tighter leading-none mb-1">{globalSettings?.systemName || 'MCC Management System'}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 text-secondary-container">
              {globalSettings?.companyName || 'Jambo Food Products Ltd'}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar p-5 pr-3 min-h-0">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group relative",
                  location.pathname === item.path 
                    ? "bg-white text-primary shadow-lg shadow-black/20" 
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon size={20} className={cn(
                  "shrink-0 transition-transform duration-300",
                  location.pathname === item.path ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-black text-sm tracking-tight">{item.name}</span>
                {location.pathname === item.path && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-l-full"></div>
                )}
              </Link>
            ))}
          </nav>

{/* Sidebar Footer - Removed as requested */}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        {/* Modern Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-outline-variant/10 px-4 md:px-6 h-12 flex items-center justify-between sticky top-0 z-40 print:hidden">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="md:hidden p-2 text-on-surface-variant hover:bg-surface-container-low rounded-xl transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="hidden md:flex items-center gap-4">
              <div className="p-1 bg-surface-container-low rounded-lg border border-outline-variant/10 shadow-sm">
                <img 
                  src={LOGO_RED} 
                  alt="Logo" 
                  className="h-6 w-auto object-contain opacity-80" 
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="h-5 w-px bg-outline-variant/20 mx-1"></div>
              <div className="flex items-center gap-2 text-on-surface">
                {currentPage && <currentPage.icon size={16} className="text-primary" />}
                <h1 className="text-base font-black tracking-tighter">{currentPage?.name || 'Dashboard'}</h1>
              </div>
            </div>
            <h1 className="text-sm font-black md:hidden truncate tracking-tight">{currentPage?.name}</h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[9px] font-black tracking-tighter text-on-surface leading-none">
                {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-primary mt-0.5 opacity-80">Jambo Network</span>
            </div>

            <div className="h-6 w-px bg-outline-variant/20 hidden lg:block"></div>

            {/* Online Users */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setShowOnlineUsers(!showOnlineUsers)}
                className="hidden lg:flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-outline-variant/20 shadow-sm hover:shadow-md hover:border-primary/20 transition-all text-left group"
              >
                <div className="relative">
                  <div className="p-1 bg-primary/5 rounded text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Users size={14} />
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white animate-pulse"></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-on-surface uppercase tracking-widest leading-none">
                    {filteredOnlineUsers.length} Online
                  </span>
                </div>
              </button>

              {showOnlineUsers && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-outline-variant/10 overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-3 bg-surface-container-lowest border-b border-outline-variant/10 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-on-surface">Online Users</h3>
                      <p className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Active Sessions</p>
                    </div>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {filteredOnlineUsers.length} Active
                    </span>
                  </div>
                  
                  <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-1">
                    {filteredOnlineUsers.length > 0 ? (
                      <div className="space-y-0.5">
                        {filteredOnlineUsers.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')).map((user, idx) => (
                          <div key={user.uid || idx} className="flex items-center gap-2.5 p-2 hover:bg-surface-container-low rounded-xl transition-colors">
                            <div className="relative flex-shrink-0">
                              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                {(user.fullName || user.username || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-bold text-on-surface truncate">
                                  {user.fullName || user.username}
                                </p>
                                {user.uid === profile?.uid && (
                                  <span className="text-[8px] bg-primary text-white px-1 py-0.5 rounded font-bold uppercase tracking-tighter">You</span>
                                )}
                              </div>
                              <p className="text-[9px] text-green-600 font-medium leading-tight">
                                Online now
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Users size={20} className="mx-auto text-on-surface-variant opacity-20 mb-2" />
                        <p className="text-[11px] text-on-surface-variant italic">No users online</p>
                      </div>
                    )}
                  </div>
                  <div className="p-2 border-t border-outline-variant/10 bg-surface-container-lowest">
                    <button 
                      onClick={() => setShowOnlineUsers(false)}
                      className="w-full py-2 text-[10px] font-bold text-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
                    >
                      Close List
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown/Section */}
            <div className="flex items-center gap-2 pl-2 md:pl-4 border-l border-outline-variant/20">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-bold text-on-surface truncate max-w-[120px] leading-none">{profile?.fullName}</p>
                <p className="text-[8px] font-bold text-primary uppercase tracking-widest leading-none mt-0.5">{profile?.role}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shadow-md ring-2 ring-surface flex-shrink-0">
                {profile?.fullName.charAt(0)}
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-2 py-1.5 text-on-surface-variant hover:text-error hover:bg-red-50 rounded-lg transition-all group"
                title="Logout"
              >
                <LogOut size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold hidden xl:block">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-2 md:p-3 overflow-auto custom-scrollbar-light">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-surface-dim/20 py-2 px-6 border-t border-outline-variant/10 print:hidden">
          <div className="text-center text-[9px] text-on-surface-variant font-medium">
            © 2026 Jambo Group | MCC System Developed by Mtani Malima
          </div>
        </footer>
      </div>

    </div>
  );
}
