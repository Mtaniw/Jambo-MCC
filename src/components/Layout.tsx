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
    { name: 'Truck & QA', path: '/truck-qa', icon: Truck, roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Milk Cans', path: '/milk-cans', icon: Milk, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Rejects', path: '/rejects', icon: AlertTriangle, roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Reports', path: '/reports', icon: FileText, roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk'] },
    { name: 'Goods Received', path: '/factory-intake', icon: Truck, roles: ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'] },
    { name: 'Admin Panel', path: '/admin', icon: Settings, roles: ['Super User', 'Admin'] },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (!profile) return false;
    
    // Admin always sees everything
    if (profile.role === 'Admin') return true;

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
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-primary text-white transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 overflow-hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Fixed Sidebar Header */}
          <div className="p-6 pb-4 border-b border-white/10 flex-shrink-0">
            <div className="mb-4">
              <Logo variant="white" className="h-12 w-auto" />
            </div>
            <p className="text-sm font-bold opacity-90">{globalSettings?.systemName || 'MCC Management System'}</p>
            <p className="text-[10px] opacity-60 font-medium">{globalSettings?.companyName || 'Jambo Food Products Ltd'}</p>
          </div>

          {/* Scrollable Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar p-4 pr-2 min-h-0">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  location.pathname === item.path 
                    ? "bg-white/10 text-secondary-container" 
                    : "hover:bg-white/5 text-white/80 hover:text-white"
                )}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-outline-variant/20 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-on-surface md:hidden p-1 hover:bg-surface-container-low rounded-lg transition-colors">
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="hidden md:flex items-center gap-3">
              <img 
                src={LOGO_RED} 
                alt="Logo" 
                className="h-8 w-auto object-contain" 
                referrerPolicy="no-referrer"
              />
              <div className="h-6 w-px bg-outline-variant/20 mx-1"></div>
              <div className="flex items-center gap-2 text-primary">
                {currentPage && <currentPage.icon size={20} />}
                <h1 className="text-lg font-bold tracking-tight">{currentPage?.name || 'Jambo MCC'}</h1>
              </div>
            </div>
            <h1 className="text-sm font-bold md:hidden truncate max-w-[120px]">{currentPage?.name}</h1>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            {/* Online Users Badge & Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setShowOnlineUsers(!showOnlineUsers)}
                className="hidden lg:flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/10 hover:bg-surface-container-high transition-colors text-left"
              >
                <div className="relative">
                  <Users size={16} className="text-primary" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-white"></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider leading-none">
                    Online ({filteredOnlineUsers.length})
                  </span>
                  <span className="text-[8px] text-primary font-bold truncate max-w-[80px]">
                    {filteredOnlineUsers[0]?.username || filteredOnlineUsers[0]?.fullName || 'System'}
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
            <div className="flex items-center gap-3 pl-3 md:pl-4 border-l border-outline-variant/20">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-on-surface truncate max-w-[150px] leading-none">{profile?.fullName}</p>
                <p className="text-[9px] font-bold text-primary uppercase tracking-widest leading-none mt-1">{profile?.role}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center text-base font-bold shadow-md ring-2 ring-surface flex-shrink-0">
                {profile?.fullName.charAt(0)}
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-on-surface-variant hover:text-error hover:bg-red-50 rounded-lg transition-all group"
                title="Logout"
              >
                <LogOut size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold hidden xl:block">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-10 overflow-auto custom-scrollbar-light">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-surface-dim/20 py-4 px-6 border-t border-outline-variant/10">
          <div className="text-center text-[10px] text-on-surface-variant font-medium">
            © 2026 Jambo Group | MCC System Developed by Mtani Malima
          </div>
        </footer>
      </div>

    </div>
  );
}
