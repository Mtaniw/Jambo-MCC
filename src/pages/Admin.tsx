import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, query, where, writeBatch, getDocs, getCountFromServer, getAggregateFromServer, sum, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Link, useSearchParams } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_HOMEPAGE_CONTENT,
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_PRODUCTS,
  DEFAULT_STAFF_SLIDES,
  DairyProductCategory,
  DairyProductConfig,
  FarmerStepItem,
  GlobalSettings,
  HomepageContentConfig,
  HomepageSectionConfig,
  PRODUCT_IMAGE_PRESETS,
  PublicMccItem,
  STAFF_IMAGE_PRESETS,
  StaffSlideItem,
  StaffStandardIcon,
  StaffStandardItem,
  getFirestorePayloadBytes,
  mergeSettings,
  usePublicStats,
} from '../hooks/useSettings';
import { getTanzaniaDate, getTanzaniaTodayStr } from '../lib/dateUtils';
import { format, subDays } from 'date-fns';
import {
  Plus, Trash2, Check, X, Shield, MapPin, Users, Edit2, Phone, Tag, ToggleLeft, ToggleRight,
  UserCog, Settings, Search, Truck, ChevronLeft, ChevronRight, FileText, BarChart3, ShieldCheck,
  Milk, AlertTriangle, Calendar, RefreshCw, PackageCheck, Globe, ArrowUp, ArrowDown, Eye, EyeOff,
  Upload, ExternalLink, Save, Sparkles, GripVertical
} from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { extractColorsFromImage } from '../lib/colorExtractor';
import { syncPublicStatsToFirestore } from '../lib/syncPublicStats';
import heroDropoffImg from '../assets/images/hero_milk_dropoff_1795078323173.jpg';
import coolingTanksImg from '../assets/images/mcc_cooling_tanks_1795078323678.jpg';
import chillingTempImg from '../assets/images/mcc_chilling_temp_check_1795097823145.jpg';
import tankSanitationImg from '../assets/images/mcc_tank_sanitation_cip_1795097821790.jpg';
import bulkTankerImg from '../assets/images/mcc_bulk_milk_tanker_1795097822727.jpg';
import uhtLineupImg from '../assets/images/uht_milk_lineup_1795078325249.jpg';
import yogurtMtindiImg from '../assets/images/yogurt_mtindi_lineup_1795078323906.jpg';

export default function Admin() {
  const { profile, effectiveRole, loading } = useAuth();
  const isActualAdmin = (profile && (profile.role === 'Admin' || profile.role === 'Super User' || profile.roleOverride === 'Admin' || profile.roleOverride === 'Super User')) ||
                        (effectiveRole === 'Admin' || effectiveRole === 'Super User') ||
                        (profile?.email?.toLowerCase() === 'mtaniwambura@gmail.com');
  const [searchParams, setSearchParams] = useSearchParams();

  if (loading) return <div className="flex justify-center p-12"><Plus className="animate-spin text-primary" /></div>;

  if (!isActualAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="w-20 h-20 bg-error/10 text-error rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={40} />
        </div>
        <h1 className="text-3xl font-black text-on-surface tracking-tight">Access Restricted</h1>
        <p className="mt-2 text-on-surface-variant max-w-sm mx-auto font-medium">
          The Admin Control Panel is reserved for system administrators. Please contact support if you require elevated permissions.
        </p>
      </div>
    );
  }
  const [users, setUsers] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'mccs' | 'drivers' | 'sellers' | 'inquiries' | 'homepage' | 'settings'>((searchParams.get('tab') as any) || 'users');
  
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['users', 'mccs', 'drivers', 'sellers', 'inquiries', 'homepage', 'settings'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    setSearchParams({ tab });
  };
  const [selectedMcc, setSelectedMcc] = useState<any | null>(null);
  const [isAddingMcc, setIsAddingMcc] = useState(false);
  const [mccToDelete, setMccToDelete] = useState<any | null>(null);
  const [isDeletingMcc, setIsDeletingMcc] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [isAddingSeller, setIsAddingSeller] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [mccSearchTerm, setMccSearchTerm] = useState('');
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [hasUnsavedConfig, setHasUnsavedConfig] = useState(false);
  const dirtyConfigRef = useRef(false);
  const [settingsNotice, setSettingsNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [homepageNotice, setHomepageNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncingStats, setIsSyncingStats] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingHomepage, setIsSavingHomepage] = useState(false);
  const [productPalettes, setProductPalettes] = useState<Record<string, string[]>>({});
  const [extractingProductId, setExtractingProductId] = useState<string | null>(null);
  const [activeSectionModalId, setActiveSectionModalId] = useState<HomepageSectionConfig['id'] | null>(null);
  const [draggedSectionIdx, setDraggedSectionIdx] = useState<number | null>(null);
  const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null);
  const { stats: livePublicStats } = usePublicStats();
  const [rolePermissions, setRolePermissions] = useState<any>({});
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('Quality Controller');
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  useEffect(() => {
    syncPublicStatsToFirestore();
  }, []);

  useEffect(() => {
    if (!activeSectionModalId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAddingMcc && !selectedMcc && !mccToDelete) {
        setActiveSectionModalId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSectionModalId, isAddingMcc, selectedMcc, mccToDelete]);

  const roles = ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Factory Clerk', 'Viewer'];
  const pages = ['Daily Register', 'Factory Intake', 'Truck & QA', 'Rejects', 'Dashboard', 'Expenses', 'Funds', 'Milk Cans', 'Reports', 'Sellers', 'Admin'];
  const widgets = [
    'Total Litres', 'Total Sent', 'Total Received', 'Dispatch Difference',
    'Total Paid', 'Total Unpaid', 'Station Expenses', 
    'Net Balance', 'Cans Issued', 'Today\'s Rejects', 'Active Sellers', 
    'MCC Performance', 'Recent Milk Intake', 'MCC Network Status'
  ];

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'role_permissions'), (snap) => {
      if (snap.exists()) {
        setRolePermissions(snap.data());
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/role_permissions'));
    return () => unsub();
  }, []);

  const handleSavePermissions = async () => {
    setIsSavingPerms(true);
    try {
      await setDoc(doc(db, 'settings', 'role_permissions'), rolePermissions);
      alert('Permissions saved successfully!');
    } catch (err) {
      console.error('Error saving permissions:', err);
      alert('Failed to save permissions.');
    } finally {
      setIsSavingPerms(false);
    }
  };

  const togglePermission = (role: string, type: 'pages' | 'dashboard', item: string) => {
    setRolePermissions((prev: any) => {
      const roleData = prev[role] || { pages: {}, dashboard: {} };
      const typeData = roleData[type] || {};
      return {
        ...prev,
        [role]: {
          ...roleData,
          [type]: {
            ...typeData,
            [item]: !typeData[item]
          }
        }
      };
    });
  };
  const [sellerStatusFilter, setSellerStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sellerSearchTerm, setSellerSearchTerm] = useState('');
  
  // Pagination States
  const [userPage, setUserPage] = useState(1);
  const [sellerPage, setSellerPage] = useState(1);
  const pageSize = 15;

  // Form States
  const [mccForm, setMccForm] = useState({ 
    name: '', 
    location: '', 
    region: '',
    district: '',
    hours: '06:00 – 10:30 · 16:00 – 18:00',
    phone: '',
    status: 'Active', 
    manager: '', 
    qualityController: '', 
    supervisor: '', 
    fieldOfficer: '', 
    driver: '', 
    director: '', 
    cashier: '' 
  });
  const [sellerForm, setSellerForm] = useState({ 
    name: '', 
    phone: '', 
    location: '', 
    category: 'Farmer', 
    mccIds: [] as string[], 
    active: true 
  });

  const [driverForm, setDriverForm] = useState({
    name: '',
    phone: '',
    tankerReg: ''
  });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    const unsubMccs = onSnapshot(collection(db, 'mccs'), (snap) => {
      setMccs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'drivers'));
    const unsubInquiries = onSnapshot(
      query(collection(db, 'wholesale_inquiries'), orderBy('createdAt', 'desc')),
      (snap) => {
        setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (error) => console.warn('Wholesale inquiries listener error:', error)
    );
    let sellersQuery = query(collection(db, 'sellers'));
    if (profile?.role !== 'Super User' && profile?.mccIds?.length > 0) {
      sellersQuery = query(collection(db, 'sellers'), where('mccIds', 'array-contains-any', profile.mccIds));
    }
    const unsubSellers = onSnapshot(sellersQuery, (snap) => {
      setSellers(snap.docs.map(doc => {
        const data = doc.data();
        const mccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds };
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists() && !dirtyConfigRef.current) {
        setSettings(mergeSettings(snap.data() as Partial<GlobalSettings>));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global_config'));

    return () => { unsubUsers(); unsubMccs(); unsubSellers(); unsubSettings(); unsubDrivers(); unsubInquiries(); };
  }, [profile]);

  const filteredMccs = useMemo(() => {
    return mccs.filter(m => 
      (m.name || '').toLowerCase().includes(mccSearchTerm.toLowerCase()) || 
      (m.location || '').toLowerCase().includes(mccSearchTerm.toLowerCase())
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [mccs, mccSearchTerm]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = (u.fullName || '').toLowerCase().includes(userSearchTerm.toLowerCase()) || 
                           (u.email || '').toLowerCase().includes(userSearchTerm.toLowerCase());
      const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      const matchesStatus = userStatusFilter === 'all' || u.status === userStatusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    }).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }, [users, userSearchTerm, userRoleFilter, userStatusFilter]);

  const handleMergeUsers = async (keepUserId: string, deleteUserId: string) => {
    if (!window.confirm('Are you sure you want to merge these users? This will delete the second user account and reassign their records.')) return;
    try {
      const deleteUser = users.find(u => u.id === deleteUserId);
      const keepUser = users.find(u => u.id === keepUserId);
      
      if (deleteUser && keepUser) {
        // Reassign records in daily_register
        const drSnap = await getDocs(query(collection(db, 'daily_register'), where('recordedBy', '==', deleteUser.email)));
        const batch = writeBatch(db);
        drSnap.docs.forEach(d => {
          batch.update(d.ref, { recordedBy: keepUser.email });
        });
        
        // Reassign records in rejects
        const rSnap = await getDocs(query(collection(db, 'rejects'), where('recordedBy', '==', deleteUser.email)));
        rSnap.docs.forEach(d => {
          batch.update(d.ref, { recordedBy: keepUser.email });
        });
        
        await batch.commit();
      }
      
      await deleteDoc(doc(db, 'users', deleteUserId));
      alert('Users merged successfully.');
    } catch (err) {
      console.error('Error merging users:', err);
      alert('Failed to merge users.');
    }
  };

  const handleMergeSellers = async (keepSellerId: string, deleteSellerId: string) => {
    if (!window.confirm('Are you sure you want to merge these sellers? All records (collections, rejects) will be moved to the primary seller.')) return;
    try {
      const batch = writeBatch(db);
      
      // Update daily_register
      const drSnap = await getDocs(query(collection(db, 'daily_register'), where('sellerId', '==', deleteSellerId)));
      drSnap.docs.forEach(d => {
        batch.update(d.ref, { sellerId: keepSellerId });
      });
      
      // Update rejects
      const rSnap = await getDocs(query(collection(db, 'rejects'), where('sellerId', '==', deleteSellerId)));
      rSnap.docs.forEach(d => {
        batch.update(d.ref, { sellerId: keepSellerId });
      });
      
      // Delete the duplicate seller
      batch.delete(doc(db, 'sellers', deleteSellerId));
      
      await batch.commit();
      alert('Sellers merged successfully.');
    } catch (err) {
      console.error('Error merging sellers:', err);
      alert('Failed to merge sellers.');
    }
  };

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice((userPage - 1) * pageSize, userPage * pageSize);
  }, [filteredUsers, userPage]);

  const filteredSellers = useMemo(() => {
    return sellers.filter(seller => {
      const matchesStatus = sellerStatusFilter === 'all' || 
        (sellerStatusFilter === 'active' && seller.active === true) ||
        (sellerStatusFilter === 'inactive' && seller.active === false);
      const matchesSearch = seller.name.toLowerCase().includes(sellerSearchTerm.toLowerCase()) ||
        seller.phone?.toLowerCase().includes(sellerSearchTerm.toLowerCase()) ||
        seller.location?.toLowerCase().includes(sellerSearchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [sellers, sellerStatusFilter, sellerSearchTerm]);

  const paginatedSellers = useMemo(() => {
    return filteredSellers.slice((sellerPage - 1) * pageSize, sellerPage * pageSize);
  }, [filteredSellers, sellerPage]);

  const handleUserStatus = async (userId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user account?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
      alert('Failed to delete user. Please check your permissions.');
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'drivers'), { ...driverForm, createdAt: new Date().toISOString() });
      setIsAddingDriver(false);
      setDriverForm({ name: '', phone: '', tankerReg: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'drivers');
      alert('Failed to save driver. Please try again.');
    }
  };

  const handleUpdateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;
    try {
      await updateDoc(doc(db, 'drivers', selectedDriver.id), {
        name: selectedDriver.name,
        phone: selectedDriver.phone,
        tankerReg: selectedDriver.tankerReg
      });
      setSelectedDriver(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'drivers');
      alert('Failed to update driver. Please try again.');
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!window.confirm('Delete driver?')) return;
    try {
      await deleteDoc(doc(db, 'drivers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'drivers');
    }
  };

  const handleAddSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'sellers'), { ...sellerForm, createdAt: new Date().toISOString() });
      syncPublicStatsToFirestore({ force: true });
      setIsAddingSeller(false);
      setSellerForm({ name: '', phone: '', location: '', category: 'Farmer', mccIds: [], active: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sellers');
      alert('Failed to save seller. Please try again.');
    }
  };

  const handleUpdateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeller) return;
    try {
      await updateDoc(doc(db, 'sellers', selectedSeller.id), {
        name: selectedSeller.name,
        phone: selectedSeller.phone,
        location: selectedSeller.location,
        category: selectedSeller.category,
        mccIds: selectedSeller.mccIds || [],
        active: selectedSeller.active
      });
      syncPublicStatsToFirestore({ force: true });
      setSelectedSeller(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'sellers');
      alert('Failed to update seller. Please try again.');
    }
  };

  const handleDeleteSeller = async (id: string) => {
    if (!window.confirm('Delete seller?')) return;
    try {
      await deleteDoc(doc(db, 'sellers', id));
      syncPublicStatsToFirestore({ force: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'sellers');
    }
  };

  const handleUserMCCs = async (userId: string, mccId: string, checked: boolean) => {
    const user = users.find(u => u.id === userId);
    let newMccIds = [...(user.mccIds || [])];
    if (checked) {
      if (!newMccIds.includes(mccId)) newMccIds.push(mccId);
    } else {
      newMccIds = newMccIds.filter((id: string) => id !== mccId);
    }
    try {
      await updateDoc(doc(db, 'users', userId), { mccIds: newMccIds });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const oldUser = users.find(u => u.id === selectedUser.id);
    const oldStatus = oldUser?.status;
    const statusChanged = oldStatus !== selectedUser.status;

    try {
      await updateDoc(doc(db, 'users', selectedUser.id), {
        fullName: selectedUser.fullName,
        email: selectedUser.email,
        role: selectedUser.role,
        mccIds: selectedUser.mccIds,
        status: selectedUser.status,
        customPermissions: selectedUser.customPermissions || null
      });

      if (statusChanged) {
        fetch('/api/notify-status-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: selectedUser.email,
            userName: selectedUser.fullName,
            oldStatus: oldStatus,
            newStatus: selectedUser.status
          })
        }).catch(err => console.error('Email notification failed:', err));
      }

      setSelectedUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
      alert('Failed to update user.');
    }
  };

  const syncPublicDirectory = async (explicitMccs?: any[]) => {
    try {
      const sourceSnap = explicitMccs ? null : await getDocs(collection(db, 'mccs'));
      const sourceDocs = explicitMccs || sourceSnap!.docs.map(d => ({ id: d.id, ...d.data() }));
      const sanitizedMccs: PublicMccItem[] = sourceDocs.map((m: any) => {
        const loc = String(m.location || 'Tanzania').trim();
        const locParts = loc.split(',').map((s: string) => s.trim()).filter(Boolean);
        return {
          id: m.id,
          name: m.name || 'Jamukaya MCC',
          region: m.region || locParts[locParts.length - 1] || 'Lake Zone',
          district: m.district || locParts[0] || loc,
          location: loc,
          hours: m.hours || settings.dropOffCutoffHours || '06:00 – 10:30 · 16:00 – 18:00',
          phone: m.phone || settings.supportPhone || '+255 [0] 622 666 692',
          status: m.status || 'Active',
        };
      });
      await setDoc(doc(db, 'settings', 'public_directory'), {
        mccs: sanitizedMccs,
        updatedAt: new Date().toISOString(),
      });
      syncPublicStatsToFirestore();
    } catch (err) {
      console.warn('Could not sync public directory:', err);
    }
  };

  const handleAddMcc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'mccs'), {
        ...mccForm,
        name: mccForm.name.trim(),
        location: mccForm.location.trim(),
        region: mccForm.region.trim(),
        district: mccForm.district.trim(),
        hours: mccForm.hours.trim(),
        phone: mccForm.phone.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await syncPublicDirectory();
      setIsAddingMcc(false);
      setMccForm({ name: '', location: '', region: '', district: '', hours: '06:00 – 10:30 · 16:00 – 18:00', phone: '', status: 'Active', manager: '', qualityController: '', supervisor: '', fieldOfficer: '', driver: '', director: '', cashier: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'mccs');
    }
  };

  const handleUpdateMcc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMcc) return;
    try {
      await updateDoc(doc(db, 'mccs', selectedMcc.id), {
        name: (selectedMcc.name || '').trim(),
        location: (selectedMcc.location || '').trim(),
        region: (selectedMcc.region || '').trim(),
        district: (selectedMcc.district || '').trim(),
        hours: (selectedMcc.hours || '').trim(),
        phone: (selectedMcc.phone || '').trim(),
        status: selectedMcc.status || 'Active',
        manager: selectedMcc.manager || '',
        qualityController: selectedMcc.qualityController || '',
        supervisor: selectedMcc.supervisor || '',
        fieldOfficer: selectedMcc.fieldOfficer || '',
        driver: selectedMcc.driver || '',
        director: selectedMcc.director || '',
        cashier: selectedMcc.cashier || '',
        updatedAt: new Date().toISOString()
      });
      await syncPublicDirectory();
      setSelectedMcc(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `mccs/${selectedMcc.id}`);
    }
  };

  const handleDeleteMcc = async () => {
    if (!mccToDelete || isDeletingMcc) return;
    setIsDeletingMcc(true);
    try {
      await deleteDoc(doc(db, 'mccs', mccToDelete.id));
      await syncPublicDirectory();
      if (selectedMcc?.id === mccToDelete.id) {
        setSelectedMcc(null);
      }
      setMccToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `mccs/${mccToDelete.id}`);
    } finally {
      setIsDeletingMcc(false);
    }
  };

  const handleUpdateMccField = async (mccId: string, field: string, value: string) => {
    await updateDoc(doc(db, 'mccs', mccId), { [field]: value });
    await syncPublicDirectory();
  };

  const updateSettingsDraft = (updater: (prev: GlobalSettings) => GlobalSettings) => {
    dirtyConfigRef.current = true;
    setHasUnsavedConfig(true);
    setSettings(prev => updater(prev));
  };

  const handleSyncMetricsFromDb = async () => {
    setIsSyncingStats(true);
    setHomepageNotice(null);
    try {
      const liveStats = await syncPublicStatsToFirestore({ force: true });
      if (!liveStats) {
        setHomepageNotice({ type: 'error', text: 'Could not fetch live database stats right now.' });
        return;
      }

      const [mccsSnap, totalAggSnap] = await Promise.all([
        getDocs(collection(db, 'mccs')),
        getAggregateFromServer(collection(db, 'daily_register'), { totalLitres: sum('quantity') }),
      ]);
      const cumulativeTotal = Math.round(Number(totalAggSnap.data().totalLitres) || 0);

      const nextMetrics = {
        ...settings.impactMetrics,
        activeFarmers: liveStats.activeFarmers,
        activeMccs: liveStats.activeMccs,
        dailyLitersHq: liveStats.dailyLitersHq,
      };
      const payload = mergeSettings({
        ...settings,
        impactMetrics: nextMetrics,
      });

      const payloadBytes = getFirestorePayloadBytes(payload);
      if (payloadBytes <= 980_000) {
        setSettings(payload);
        dirtyConfigRef.current = false;
        setHasUnsavedConfig(false);
        await setDoc(doc(db, 'settings', 'global_config'), payload);
      }

      await syncPublicDirectory(mccsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      setHomepageNotice({
        type: 'success',
        text: `Auto-synced live DB stats: ${formatNumber(liveStats.activeFarmers, 0)} active farmers, ${liveStats.activeMccs} active MCCs, ${formatNumber(liveStats.dailyLitersHq, 0)} L/day (${liveStats.sourceLabel}). Cumulative intake: ${formatNumber(cumulativeTotal, 0)} L.`,
      });
    } catch (err: any) {
      console.error('Error syncing database metrics:', err);
      const detail = err?.code || err?.message || 'Unknown error';
      setHomepageNotice({ type: 'error', text: `Failed to sync metrics from database (${detail}).` });
    } finally {
      setIsSyncingStats(false);
    }
  };

  const persistHomepageSettings = async (
    nextSettings: GlobalSettings,
    successText: string
  ): Promise<boolean> => {
    setIsSavingHomepage(true);
    setHomepageNotice(null);
    try {
      const payload = mergeSettings(nextSettings);
      const payloadBytes = getFirestorePayloadBytes(payload);
      if (payloadBytes > 980_000) {
        setHomepageNotice({
          type: 'error',
          text: `Total configuration size (${Math.round(payloadBytes / 1024)} KB) exceeds Firestore's 1 MB document limit. Please compress/remove large uploaded logos or product images.`,
        });
        return false;
      }
      dirtyConfigRef.current = false;
      setHasUnsavedConfig(false);
      await setDoc(doc(db, 'settings', 'global_config'), payload);
      await syncPublicDirectory();
      setSettings(payload);
      setHomepageNotice({ type: 'success', text: successText });
      return true;
    } catch (err: any) {
      console.error('Error saving homepage configuration:', err);
      dirtyConfigRef.current = true;
      setHasUnsavedConfig(true);
      const detail = err?.code || err?.message || 'Unknown error';
      setHomepageNotice({
        type: 'error',
        text: `Failed to publish Homepage changes (${detail}).`,
      });
      return false;
    } finally {
      setIsSavingHomepage(false);
    }
  };

  const handleToggleHomepageSection = async (sectionId: HomepageSectionConfig['id']) => {
    const current = settings.homepageSections || DEFAULT_HOMEPAGE_SECTIONS;
    const target = current.find(s => s.id === sectionId);
    const nextSections = current.map(s => (s.id === sectionId ? { ...s, enabled: !s.enabled } : s));
    const nextSettings = { ...settings, homepageSections: nextSections };
    setSettings(nextSettings);
    await persistHomepageSettings(
      nextSettings,
      `"${target?.label || sectionId}" turned ${target?.enabled ? 'Off' : 'On'} and saved live!`
    );
  };

  const handleDropHomepageSection = async (targetIndex: number, sourceIndexOverride?: number) => {
    const sourceIndex = sourceIndexOverride ?? draggedSectionIdx;
    setDraggedSectionIdx(null);
    setDragOverSectionIdx(null);
    if (sourceIndex === null || sourceIndex === undefined || sourceIndex === targetIndex) return;

    const list = [...(settings.homepageSections || DEFAULT_HOMEPAGE_SECTIONS)];
    if (sourceIndex < 0 || sourceIndex >= list.length || targetIndex < 0 || targetIndex >= list.length) return;
    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);

    const nextSettings = { ...settings, homepageSections: list };
    setSettings(nextSettings);
    await persistHomepageSettings(
      nextSettings,
      `Moved "${moved.label}" to position #${targetIndex + 1} and saved live!`
    );
  };

  const handleResetHomepageSections = async () => {
    const nextSettings = { ...settings, homepageSections: DEFAULT_HOMEPAGE_SECTIONS };
    setSettings(nextSettings);
    await persistHomepageSettings(nextSettings, 'Reset homepage section order to default and saved live!');
  };

  const handleHomepageSectionMetaChange = (
    sectionId: HomepageSectionConfig['id'],
    field: 'label' | 'description',
    value: string
  ) => {
    updateSettingsDraft(prev => {
      const current = prev.homepageSections || DEFAULT_HOMEPAGE_SECTIONS;
      return {
        ...prev,
        homepageSections: current.map(s => (s.id === sectionId ? { ...s, [field]: value } : s)),
      };
    });
  };

  const updateHomepageContent = <K extends keyof HomepageContentConfig>(
    key: K,
    updater: (prevSection: HomepageContentConfig[K]) => HomepageContentConfig[K]
  ) => {
    updateSettingsDraft(prev => {
      const currentContent = prev.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
      const baseSection = (currentContent[key] || DEFAULT_HOMEPAGE_CONTENT[key]) as HomepageContentConfig[K];
      return {
        ...prev,
        homepageContent: {
          ...currentContent,
          [key]: updater(baseSection),
        },
      };
    });
  };

  const compressImageFile = (
    file: File,
    onDone: (dataUrl: string) => void,
    onError: (msg: string) => void
  ) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const compressToJpeg = (maxWidth: number, quality: number) => {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        let compressed = compressToJpeg(960, 0.78);
        if (compressed.length > 180000) {
          compressed = compressToJpeg(720, 0.7);
        }
        if (compressed.length > 250000) {
          compressed = compressToJpeg(540, 0.62);
        }
        if (!compressed || compressed.length > 250000) {
          onError(
            `Image "${file.name}" is still too large (${Math.round(compressed.length / 1024)} KB) after compression. Please choose a smaller photo or preset.`
          );
          return;
        }
        onDone(compressed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSectionImageUpload = (target: 'hero' | 'staff', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImageFile(
      file,
      (dataUrl) => {
        updateHomepageContent(target, prev => ({ ...prev, imageUrl: dataUrl }));
      },
      (msg) => setHomepageNotice({ type: 'error', text: msg })
    );
  };

  const handleAddFarmerStep = () => {
    updateHomepageContent('farmers', prev => {
      const nextNum = prev.steps.length + 1;
      const newStep: FarmerStepItem = {
        id: `step-${Date.now()}`,
        stepNumber: nextNum < 10 ? `0${nextNum}.` : `${nextNum}.`,
        metaText: 'MCC Gate Standard',
        accentTone: 'green',
        title: 'New Farmer Step',
        description: 'Describe how farmers complete this collection or quality step.',
      };
      return { ...prev, steps: [...prev.steps, newStep] };
    });
  };

  const handleUpdateFarmerStep = (idx: number, field: keyof FarmerStepItem, value: any) => {
    updateHomepageContent('farmers', prev => ({
      ...prev,
      steps: prev.steps.map((st, i) => (i === idx ? { ...st, [field]: value } : st)),
    }));
  };

  const handleDeleteFarmerStep = (idx: number) => {
    updateHomepageContent('farmers', prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx),
    }));
  };

  const resolveStaffSlidePreview = (imageUrl?: string) => {
    switch (imageUrl) {
      case 'preset:cooling-tanks':
      case '':
      case undefined:
        return coolingTanksImg;
      case 'preset:chilling-temp':
        return chillingTempImg;
      case 'preset:tank-sanitation':
        return tankSanitationImg;
      case 'preset:bulk-tanker':
        return bulkTankerImg;
      default:
        return imageUrl;
    }
  };

  const handleAddStaffSlide = () => {
    updateHomepageContent('staff', prev => {
      const currentSlides = prev.slides || DEFAULT_STAFF_SLIDES;
      const newSlide: StaffSlideItem = {
        id: `staff-slide-${Date.now()}`,
        header: 'New Operational Standard',
        highlightLabel: 'MCC Compliance',
        highlightColor: 'green',
        icon: 'shield',
        summary: 'Describe the cold-chain procedure, target metric, or verification step for MCC staff.',
        imageUrl: 'preset:cooling-tanks',
      };
      return { ...prev, slides: [...currentSlides, newSlide] };
    });
  };

  const handleUpdateStaffSlide = (idx: number, field: keyof StaffSlideItem, value: any) => {
    updateHomepageContent('staff', prev => {
      const currentSlides = prev.slides || DEFAULT_STAFF_SLIDES;
      return {
        ...prev,
        slides: currentSlides.map((sl, i) => (i === idx ? { ...sl, [field]: value } : sl)),
      };
    });
  };

  const handleDeleteStaffSlide = (idx: number) => {
    updateHomepageContent('staff', prev => {
      const currentSlides = prev.slides || DEFAULT_STAFF_SLIDES;
      if (currentSlides.length <= 1) return prev;
      return {
        ...prev,
        slides: currentSlides.filter((_, i) => i !== idx),
      };
    });
  };

  const handleMoveStaffSlide = (idx: number, dir: 'up' | 'down') => {
    updateHomepageContent('staff', prev => {
      const list = [...(prev.slides || DEFAULT_STAFF_SLIDES)];
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= list.length) return prev;
      [list[idx], list[target]] = [list[target], list[idx]];
      return { ...prev, slides: list };
    });
  };

  const handleStaffSlideImageUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImageFile(
      file,
      (dataUrl) => handleUpdateStaffSlide(idx, 'imageUrl', dataUrl),
      (msg) => setHomepageNotice({ type: 'error', text: msg })
    );
  };

  const handleAddStaffStandard = () => {
    updateHomepageContent('staff', prev => {
      const newStd: StaffStandardItem = {
        id: `std-${Date.now()}`,
        icon: 'shield',
        title: 'New Hygiene Standard',
        metricLabel: 'Verified Every Shift',
        metricColor: 'green',
        description: 'Operational cold-chain requirement for collection center teams.',
      };
      return { ...prev, standards: [...prev.standards, newStd] };
    });
  };

  const handleUpdateStaffStandard = (idx: number, field: keyof StaffStandardItem, value: any) => {
    updateHomepageContent('staff', prev => ({
      ...prev,
      standards: prev.standards.map((std, i) => (i === idx ? { ...std, [field]: value } : std)),
    }));
  };

  const handleDeleteStaffStandard = (idx: number) => {
    updateHomepageContent('staff', prev => ({
      ...prev,
      standards: prev.standards.filter((_, i) => i !== idx),
    }));
  };

  const handleProductFieldChange = (index: number, field: keyof DairyProductConfig, value: any) => {
    updateSettingsDraft(prev => {
      const nextProducts = [...(prev.products || DEFAULT_PRODUCTS)];
      nextProducts[index] = { ...nextProducts[index], [field]: value };
      return { ...prev, products: nextProducts };
    });
  };

  const resolveProductPreview = (prod: DairyProductConfig) => {
    if (prod.imageUrl) return prod.imageUrl;
    if (prod.category === 'UHT Long-Life Milk') return uhtLineupImg;
    return yogurtMtindiImg;
  };

  const syncProductAccentFromImage = async (
    productId: string,
    category: DairyProductCategory,
    rawImageUrl?: string,
    applyPrimaryHex = true
  ) => {
    const src = rawImageUrl || (category === 'UHT Long-Life Milk' ? uhtLineupImg : yogurtMtindiImg);
    if (!src) return;

    if (applyPrimaryHex) setExtractingProductId(productId);
    const extracted = await extractColorsFromImage(src);
    if (applyPrimaryHex) setExtractingProductId(prev => (prev === productId ? null : prev));

    if (!extracted) return;

    setProductPalettes(prev => ({ ...prev, [productId]: extracted.palette }));

    if (applyPrimaryHex && extracted.primary) {
      updateSettingsDraft(prev => ({
        ...prev,
        products: (prev.products || DEFAULT_PRODUCTS).map(p =>
          p.id === productId ? { ...p, accentHex: extracted.primary } : p
        ),
      }));
    }
  };

  useEffect(() => {
    if (activeTab !== 'homepage') return;
    let cancelled = false;
    (settings.products || []).forEach((prod) => {
      if (productPalettes[prod.id]) return;
      const src = resolveProductPreview(prod);
      extractColorsFromImage(src).then((extracted) => {
        if (cancelled || !extracted) return;
        setProductPalettes(prev => (prev[prod.id] ? prev : { ...prev, [prod.id]: extracted.palette }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, settings.products]);

  const handleAddProduct = () => {
    const newId = `product-${Date.now()}`;
    const defaultImg = './assets/aistudio/images_a44354cc.jpg';
    const newProduct: DairyProductConfig = {
      id: newId,
      name: 'New Jamukaya Product',
      category: 'UHT Long-Life Milk',
      accentLabel: 'Fresh Red Accent',
      accentHex: '#D9232E',
      tagline: 'Fresh Tanzanian dairy crafted at Jamukaya HQ.',
      packSizes: '250 ml · 500 ml',
      shelfLife: '6 Months Ambient',
      storageType: 'No Refrigeration Needed Unopened',
      imageUrl: defaultImg,
      active: true,
    };
    updateSettingsDraft(prev => ({
      ...prev,
      products: [...(prev.products || DEFAULT_PRODUCTS), newProduct],
    }));
    syncProductAccentFromImage(newId, 'UHT Long-Life Milk', defaultImg, true);
  };

  const handleDeleteProduct = (index: number) => {
    const target = (settings.products || [])[index];
    if (!target) return;
    if (!window.confirm(`Remove "${target.name}" from Homepage Product Showcase Catalog?`)) return;
    updateSettingsDraft(prev => ({
      ...prev,
      products: (prev.products || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleMoveProduct = (index: number, direction: 'up' | 'down') => {
    updateSettingsDraft(prev => {
      const list = [...(prev.products || DEFAULT_PRODUCTS)];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
      return { ...prev, products: list };
    });
  };

  const handleProductImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetProd = (settings.products || [])[index];
    if (!file || !targetProd) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const compressToJpeg = (maxWidth: number, quality: number) => {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        let compressed = compressToJpeg(900, 0.78);
        if (compressed.length > 180000) {
          compressed = compressToJpeg(680, 0.7);
        }
        if (compressed.length > 260000) {
          compressed = compressToJpeg(520, 0.62);
        }
        if (!compressed || compressed.length > 260000) {
          setHomepageNotice({
            type: 'error',
            text: `Image "${file.name}" is still too large (${Math.round(compressed.length / 1024)} KB) after compression. Please select a smaller photo or preset.`,
          });
          return;
        }
        handleProductFieldChange(index, 'imageUrl', compressed);
        syncProductAccentFromImage(targetProd.id, targetProd.category, compressed, true);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveHomepage = async (e?: React.FormEvent, closeModalOnSuccess = false) => {
    if (e) e.preventDefault();
    const ok = await persistHomepageSettings(
      settings,
      'Homepage sections, metrics, and Product Showcase Catalog saved & synced live!'
    );
    if (ok && closeModalOnSuccess) {
      setActiveSectionModalId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsNotice(null);
    try {
      const payload = mergeSettings(settings);
      const payloadBytes = getFirestorePayloadBytes(payload);
      if (payloadBytes > 980_000) {
        setSettingsNotice({
          type: 'error',
          text: `Total configuration size (${Math.round(payloadBytes / 1024)} KB) exceeds Firestore's 1 MB document limit. Please reduce uploaded logo/background image sizes.`,
        });
        return;
      }
      dirtyConfigRef.current = false;
      setHasUnsavedConfig(false);
      await setDoc(doc(db, 'settings', 'global_config'), payload);
      await syncPublicDirectory();
      setSettings(payload);
      setSettingsNotice({ type: 'success', text: 'System Settings & Branding saved successfully!' });
    } catch (err: any) {
      console.error('Error saving settings:', err);
      dirtyConfigRef.current = true;
      setHasUnsavedConfig(true);
      const detail = err?.code || err?.message || 'Unknown error';
      setSettingsNotice({ type: 'error', text: `Failed to save system settings (${detail}).` });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleInquiryStatus = async (inquiryId: string, status: 'New' | 'Contacted' | 'Resolved') => {
    try {
      await updateDoc(doc(db, 'wholesale_inquiries', inquiryId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `wholesale_inquiries/${inquiryId}`);
    }
  };

  const handleDeleteInquiry = async (inquiryId: string) => {
    if (!window.confirm('Delete this wholesale inquiry?')) return;
    try {
      await deleteDoc(doc(db, 'wholesale_inquiries', inquiryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `wholesale_inquiries/${inquiryId}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logoRed' | 'logoWhite' | 'favicon' | 'loginBgUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) { // Increase to 1MB for background
      alert('File is too large. Please upload an image under 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      updateSettingsDraft(prev => ({ ...prev, [type]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleRoleOverride = async (role: string | null) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), { roleOverride: role });
      alert(`Role simulation set to: ${role || 'None'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-on-surface tracking-tighter">Admin Control Panel</h1>
          <p className="text-sm sm:text-base text-on-surface-variant font-medium mt-1">Manage users, collection centers, and supplier directory</p>
        </div>
        {/* Logo removed as requested */}
      </div>

      {/* Tabs - More premium look */}
      <div className="flex gap-2 p-1.5 bg-surface-container-low rounded-2xl overflow-x-auto no-scrollbar border border-outline-variant/10">
        {[
          { id: 'users', name: 'Users', icon: Shield },
          { id: 'mccs', name: 'MCCs', icon: MapPin },
          { id: 'drivers', name: 'Drivers', icon: Truck },
          { id: 'sellers', name: 'Suppliers', icon: Users },
          { id: 'inquiries', name: `Inquiries${inquiries.filter(i => i.status === 'New').length ? ` (${inquiries.filter(i => i.status === 'New').length})` : ''}`, icon: PackageCheck },
          { id: 'homepage', name: 'Homepage', icon: Globe },
          { id: 'settings', name: 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 font-black text-xs uppercase tracking-widest transition-all rounded-xl whitespace-nowrap shrink-0",
              activeTab === tab.id 
                ? "bg-white text-primary shadow-sm" 
                : "text-on-surface-variant hover:bg-white/50 hover:text-on-surface"
            )}
          >
            <tab.icon size={16} />
            {tab.name}
          </button>
        ))}
      </div>

      {/* User Management */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input 
                placeholder="Search users by name or email..." 
                value={userSearchTerm}
                onChange={e => {
                  setUserSearchTerm(e.target.value);
                  setUserPage(1);
                }}
                className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase text-on-surface-variant">Role:</label>
              <select 
                value={userRoleFilter} 
                onChange={e => {
                  setUserRoleFilter(e.target.value);
                  setUserPage(1);
                }}
                className="bg-surface-container-low border-none rounded-lg text-xs font-bold"
              >
                <option value="all">All Roles</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase text-on-surface-variant">Status:</label>
              <select 
                value={userStatusFilter} 
                onChange={e => {
                  setUserStatusFilter(e.target.value);
                  setUserPage(1);
                }}
                className="bg-surface-container-low border-none rounded-lg text-xs font-bold"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {users.some((u, i) => users.some((u2, j) => i !== j && u.fullName === u2.fullName && u.fullName === 'Norah Alfred')) && (
              <button 
                onClick={() => {
                  const norahs = users.filter(u => u.fullName === 'Norah Alfred');
                  if (norahs.length >= 2) {
                    handleMergeUsers(norahs[0].id, norahs[1].id);
                  }
                }}
                className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
              >
                <Users size={14} /> Merge Norah Alfred
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                <tr>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">MCC Assignments</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {paginatedUsers.map(user => (
                  <tr key={user.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{user.fullName}</p>
                      <p className="text-xs text-on-surface-variant">{user.email}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-primary">
                      {user.role}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.mccIds?.map((id: string) => (
                          <span key={id} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                            {mccs.find(m => m.id === id)?.name || id || 'Unknown'}
                          </span>
                        ))}
                        {(!user.mccIds || user.mccIds.length === 0) && <span className="text-[9px] opacity-40 italic font-medium text-on-surface-variant">Unassigned</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        user.status === 'active' ? "bg-green-100 text-green-700" : user.status === 'pending' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      )}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setSelectedUser(user)} className="p-1 text-primary hover:bg-primary/5 rounded" title="Edit User"><Edit2 size={16} /></button>
                        {user.status === 'pending' && (
                          <button onClick={() => handleUserStatus(user.id, 'active')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Activate"><Check size={16} /></button>
                        )}
                        {user.status === 'active' && (
                          <button onClick={() => handleUserStatus(user.id, 'inactive')} className="p-1 text-amber-600 hover:bg-amber-50 rounded" title="Deactivate"><ToggleLeft size={16} /></button>
                        )}
                        {user.status === 'inactive' && (
                          <button onClick={() => handleUserStatus(user.id, 'active')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Activate"><ToggleRight size={16} /></button>
                        )}
                        <button onClick={() => handleDeleteUser(user.id)} className="p-1 text-error hover:bg-red-50 rounded" title="Delete Account"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-container-low/50 font-bold border-t border-outline-variant/20">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-xs uppercase tracking-wider text-on-surface-variant">Grand Totals</td>
                  <td colSpan={3} className="px-6 py-4 text-right text-sm text-primary">
                    {filteredUsers.length} Users Total ({filteredUsers.filter(u => u.status === 'active').length} Active)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* User Pagination */}
          {filteredUsers.length > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 bg-white border border-outline-variant/20 rounded-xl shadow-sm">
              <p className="text-xs text-on-surface-variant">
                Showing <span className="font-bold text-on-surface">{(userPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(userPage * pageSize, filteredUsers.length)}</span> of <span className="font-bold text-on-surface">{filteredUsers.length}</span> users
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={userPage === 1}
                  onClick={() => setUserPage(p => p - 1)}
                  className="p-2 rounded-lg border border-outline-variant/30 disabled:opacity-30 hover:bg-surface-container-low transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(filteredUsers.length / pageSize) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setUserPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                        userPage === i + 1 ? "bg-primary text-white shadow-md" : "hover:bg-surface-container-low text-on-surface-variant"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button 
                  disabled={userPage * pageSize >= filteredUsers.length}
                  onClick={() => setUserPage(p => p + 1)}
                  className="p-2 rounded-lg border border-outline-variant/30 disabled:opacity-30 hover:bg-surface-container-low transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MCC Management */}
      {activeTab === 'mccs' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input 
                placeholder="Search MCCs by name or location..." 
                value={mccSearchTerm}
                onChange={e => setMccSearchTerm(e.target.value)}
                className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm"
              />
            </div>
            <button onClick={() => setIsAddingMcc(true)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              <Plus size={18} /> Add MCC
            </button>
          </div>

      {/* MCC Modal */}
      {(isAddingMcc || selectedMcc) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 sm:p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{selectedMcc ? 'Edit MCC' : 'Add New MCC'}</h2>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">{selectedMcc ? 'Update existing collection center & public listing' : 'Register a new collection center & publish to locator'}</p>
              </div>
              <button onClick={() => { setIsAddingMcc(false); setSelectedMcc(null); }} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={selectedMcc ? handleUpdateMcc : handleAddMcc} className="p-6 sm:p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">MCC Name</label>
                  <input 
                    placeholder="e.g. Kahama Main" 
                    value={selectedMcc ? (selectedMcc.name || '') : mccForm.name} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, name: e.target.value}) : setMccForm({...mccForm, name: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Location / Town</label>
                  <input 
                    placeholder="e.g. Kahama, Shinyanga" 
                    value={selectedMcc ? (selectedMcc.location || '') : mccForm.location} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, location: e.target.value}) : setMccForm({...mccForm, location: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Status</label>
                  <select
                    value={selectedMcc ? (selectedMcc.status || 'Active') : mccForm.status}
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, status: e.target.value}) : setMccForm({...mccForm, status: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Active">Active</option>
                    <option value="Coming Soon">Coming Soon</option>
                    <option value="Planned">Planned</option>
                    <option value="Closed">Closed</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Region (Homepage Filter)</label>
                  <input 
                    placeholder="e.g. Mwanza" 
                    value={selectedMcc ? (selectedMcc.region || '') : mccForm.region} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, region: e.target.value}) : setMccForm({...mccForm, region: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">District</label>
                  <input 
                    placeholder="e.g. Nyamagana" 
                    value={selectedMcc ? (selectedMcc.district || '') : mccForm.district} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, district: e.target.value}) : setMccForm({...mccForm, district: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Intake Hours</label>
                  <input 
                    placeholder="06:00 – 10:30" 
                    value={selectedMcc ? (selectedMcc.hours || '') : mccForm.hours} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, hours: e.target.value}) : setMccForm({...mccForm, hours: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Gate Phone</label>
                  <input 
                    placeholder="+255 7XX..." 
                    value={selectedMcc ? (selectedMcc.phone || '') : mccForm.phone} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, phone: e.target.value}) : setMccForm({...mccForm, phone: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-surface-container-low rounded-3xl">
                {[
                  { label: 'Manager', field: 'manager' },
                  { label: 'Cashier', field: 'cashier' },
                  { label: 'Quality QC', field: 'qualityController' },
                  { label: 'Supervisor', field: 'supervisor' },
                  { label: 'Field Officer', field: 'fieldOfficer' },
                  { label: 'Driver', field: 'driver' },
                  { label: 'Director', field: 'director' }
                ].map(role => (
                  <div key={role.field} className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-on-surface-variant tracking-tighter ml-1">{role.label}</label>
                    <input 
                      value={selectedMcc ? (selectedMcc as any)[role.field] || '' : (mccForm as any)[role.field] || ''} 
                      onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, [role.field]: e.target.value}) : setMccForm({...mccForm, [role.field]: e.target.value})}
                      className="w-full bg-white/50 border-none rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder={`Assign name...`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 pt-4">
                {selectedMcc && (
                  <button
                    type="button"
                    onClick={() => setMccToDelete(selectedMcc)}
                    className="px-5 py-4 font-black uppercase text-[10px] tracking-widest text-error bg-error/10 hover:bg-error/20 rounded-2xl transition-all flex items-center gap-2"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                )}
                <button type="button" onClick={() => { setIsAddingMcc(false); setSelectedMcc(null); }} className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest text-on-surface-variant hover:bg-surface-container-low rounded-2xl transition-all">Cancel</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all flex items-center justify-center gap-2">
                  <Check size={18} /> {selectedMcc ? 'Update MCC' : 'Save MCC Center'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MCC Delete Confirmation Modal */}
      {mccToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[120] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3 text-error">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-black">Delete MCC Center</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Are you sure you want to permanently delete <span className="font-bold text-on-surface">{mccToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMccToDelete(null)}
                disabled={isDeletingMcc}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMcc}
                disabled={isDeletingMcc}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-error text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeletingMcc ? 'Deleting...' : 'Delete MCC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Modal */}
      {(isAddingDriver || selectedDriver) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{selectedDriver ? 'Edit Driver' : 'Add New Driver'}</h2>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">{selectedDriver ? 'Update tanker personnel' : 'Register a new tanker driver'}</p>
              </div>
              <button onClick={() => { setIsAddingDriver(false); setSelectedDriver(null); }} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={selectedDriver ? handleUpdateDriver : handleAddDriver} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Driver Name</label>
                  <input placeholder="Full Name" value={selectedDriver ? selectedDriver.name : driverForm.name} onChange={e => selectedDriver ? setSelectedDriver({...selectedDriver, name: e.target.value}) : setDriverForm({...driverForm, name: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Phone Number</label>
                  <input placeholder="e.g. 0712..." value={selectedDriver ? selectedDriver.phone : driverForm.phone} onChange={e => selectedDriver ? setSelectedDriver({...selectedDriver, phone: e.target.value}) : setDriverForm({...driverForm, phone: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Tanker Reg No</label>
                  <input placeholder="e.g. T 123 ABC" value={selectedDriver ? selectedDriver.tankerReg : driverForm.tankerReg} onChange={e => selectedDriver ? setSelectedDriver({...selectedDriver, tankerReg: e.target.value}) : setDriverForm({...driverForm, tankerReg: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" required />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setIsAddingDriver(false); setSelectedDriver(null); }} className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest">Cancel</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2">
                  <Check size={18} /> {selectedDriver ? 'Update Driver' : 'Save Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMccs.map(mcc => (
              <div
                key={mcc.id}
                onClick={() => setSelectedMcc(mcc)}
                className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm space-y-4 group relative cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors truncate">{mcc.name}</h3>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1"><MapPin size={12} /> {mcc.location}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-1 rounded",
                      mcc.status === 'Active' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {mcc.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMcc(mcc);
                        }}
                        title="Edit MCC"
                        className="p-1.5 bg-surface-container-low text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMccToDelete(mcc);
                        }}
                        title="Delete MCC"
                        className="p-1.5 bg-surface-container-low text-error hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/10 text-[11px]">
                  <div className="space-y-0.5">
                    <p className="opacity-60 font-bold uppercase text-[9px]">Manager</p>
                    <p className="font-medium truncate">{mcc.manager || '---'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="opacity-60 font-bold uppercase text-[9px]">Cashier</p>
                    <p className="font-medium truncate">{mcc.cashier || '---'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="opacity-60 font-bold uppercase text-[9px]">Quality QC</p>
                    <p className="font-medium truncate">{mcc.qualityController || '---'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="opacity-60 font-bold uppercase text-[9px]">Supervisor</p>
                    <p className="font-medium truncate">{mcc.supervisor || '---'}</p>
                  </div>
                </div>
              </div>
            ))}
            {filteredMccs.length === 0 && (
              <div className="lg:col-span-3 py-20 text-center bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/30">
                <Search size={40} className="mx-auto mb-4 opacity-20" />
                <p className="text-on-surface-variant font-medium">No MCCs found matching your search.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drivers Management */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setIsAddingDriver(true)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              <Plus size={18} /> Add Driver
            </button>
          </div>
          {isAddingDriver && (
            <form onSubmit={handleAddDriver} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
              <input placeholder="Driver Name" value={driverForm.name} onChange={e => setDriverForm({...driverForm, name: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <input placeholder="Phone" value={driverForm.phone} onChange={e => setDriverForm({...driverForm, phone: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <input placeholder="Tanker Reg No" value={driverForm.tankerReg} onChange={e => setDriverForm({...driverForm, tankerReg: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <div className="flex gap-2 md:col-span-3 justify-end">
                <button type="button" onClick={() => setIsAddingDriver(false)} className="px-4 py-2">Cancel</button>
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-lg font-bold">Save Driver</button>
              </div>
            </form>
          )}
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                <tr>
                  <th className="px-6 py-3">Driver Name</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Tanker Reg</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {drivers.map(driver => (
                  <tr key={driver.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4 text-sm font-bold">{driver.name}</td>
                    <td className="px-6 py-4 text-sm">{driver.phone}</td>
                    <td className="px-6 py-4 text-sm font-medium text-primary">{driver.tankerReg}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setSelectedDriver(driver)} className="p-1 text-primary hover:bg-primary/5 rounded"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteDriver(driver.id)} className="p-1 text-error hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Seller Directory */}
      {activeTab === 'sellers' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="bg-white p-2 rounded-xl border border-outline-variant/20 shadow-sm flex flex-col md:flex-row gap-4 flex-1 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                <input 
                  placeholder="Search sellers by name, phone or location..." 
                  value={sellerSearchTerm}
                  onChange={e => {
                    setSellerSearchTerm(e.target.value);
                    setSellerPage(1);
                  }}
                  className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase text-on-surface-variant whitespace-nowrap">Status:</label>
                <select 
                  value={sellerStatusFilter} 
                  onChange={e => {
                    setSellerStatusFilter(e.target.value as any);
                    setSellerPage(1);
                  }}
                  className="bg-surface-container-low border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Sellers</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>
      {/* Seller Modal */}
      {(isAddingSeller || selectedSeller) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{selectedSeller ? 'Edit Supplier' : 'Add New Supplier'}</h2>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">{selectedSeller ? 'Update supplier information' : 'Register a new milk supplier'}</p>
              </div>
              <button onClick={() => { setIsAddingSeller(false); setSelectedSeller(null); }} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={selectedSeller ? handleUpdateSeller : handleAddSeller} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Supplier Name</label>
                  <input placeholder="Name" value={selectedSeller ? selectedSeller.name : sellerForm.name} onChange={e => selectedSeller ? setSelectedSeller({...selectedSeller, name: e.target.value}) : setSellerForm({...sellerForm, name: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Phone Number</label>
                  <input placeholder="Phone" value={selectedSeller ? selectedSeller.phone : sellerForm.phone} onChange={e => selectedSeller ? setSelectedSeller({...selectedSeller, phone: e.target.value}) : setSellerForm({...sellerForm, phone: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Location / Village</label>
                  <input placeholder="Location" value={selectedSeller ? selectedSeller.location : sellerForm.location} onChange={e => selectedSeller ? setSelectedSeller({...selectedSeller, location: e.target.value}) : setSellerForm({...sellerForm, location: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Category</label>
                  <select value={selectedSeller ? selectedSeller.category : sellerForm.category} onChange={e => selectedSeller ? setSelectedSeller({...selectedSeller, category: e.target.value}) : setSellerForm({...sellerForm, category: e.target.value})} className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold">
                    <option value="Farmer">Farmer</option>
                    <option value="Middleman">Middleman</option>
                    <option value="Business">Business</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">MCC Assignments</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {mccs.map(mcc => (
                    <label key={mcc.id} className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl cursor-pointer hover:bg-primary/5 transition-all border border-transparent hover:border-primary/20">
                      <input 
                        type="checkbox" 
                        checked={selectedSeller ? (selectedSeller.mccIds || []).includes(mcc.id) : (sellerForm.mccIds || []).includes(mcc.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (selectedSeller) {
                            const ids = [...(selectedSeller.mccIds || [])];
                            if (checked) ids.push(mcc.id);
                            else ids.splice(ids.indexOf(mcc.id), 1);
                            setSelectedSeller({...selectedSeller, mccIds: ids});
                          } else {
                            const ids = [...(sellerForm.mccIds || [])];
                            if (checked) ids.push(mcc.id);
                            else ids.splice(ids.indexOf(mcc.id), 1);
                            setSellerForm({...sellerForm, mccIds: ids});
                          }
                        }}
                        className="rounded border-outline-variant text-primary"
                      />
                      <span className="text-xs font-bold truncate">{mcc.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setIsAddingSeller(false); setSelectedSeller(null); }} className="flex-1 py-4 font-black uppercase text-[10px] tracking-widest text-on-surface-variant hover:bg-surface-container-low rounded-2xl transition-all">Cancel</button>
                <button type="submit" className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all flex items-center justify-center gap-2">
                  <Check size={18} /> {selectedSeller ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
            {sellers.some((s, i) => sellers.some((s2, j) => i !== j && s.name.toLowerCase() === s2.name.toLowerCase() && s.name.toLowerCase() === 'norah alfred')) && (
              <button 
                onClick={() => {
                  const norahs = sellers.filter(s => s.name.toLowerCase() === 'norah alfred');
                  if (norahs.length >= 2) {
                    handleMergeSellers(norahs[0].id, norahs[1].id);
                  }
                }}
                className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
              >
                <Users size={14} /> Merge Norah Alfred (Sellers)
              </button>
            )}
          </div>
          {isAddingSeller && (
            <form onSubmit={handleAddSeller} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <input placeholder="Seller Name" value={sellerForm.name} onChange={e => setSellerForm({...sellerForm, name: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <input placeholder="Phone" value={sellerForm.phone} onChange={e => setSellerForm({...sellerForm, phone: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <input placeholder="Location" value={sellerForm.location} onChange={e => setSellerForm({...sellerForm, location: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <select value={sellerForm.category} onChange={e => setSellerForm({...sellerForm, category: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2">
                <option value="Farmer">Farmer</option>
                <option value="Group">Group</option>
                <option value="Agent">Agent</option>
              </select>
              <div className="space-y-1 lg:col-span-3">
                <label className="text-xs font-bold uppercase opacity-60">MCC Assignments</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 bg-surface-container-low rounded-lg border border-outline-variant/10">
                  {mccs.map(mcc => (
                    <label key={mcc.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={sellerForm.mccIds.includes(mcc.id)} 
                        onChange={e => {
                          const newIds = e.target.checked 
                            ? [...sellerForm.mccIds, mcc.id]
                            : sellerForm.mccIds.filter(id => id !== mcc.id);
                          setSellerForm({...sellerForm, mccIds: newIds});
                        }}
                        className="w-4 h-4 rounded text-primary"
                      />
                      {mcc.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 lg:col-span-3 justify-end">
                <button type="button" onClick={() => setIsAddingSeller(false)} className="px-4 py-2">Cancel</button>
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-lg font-bold">Save Seller</button>
              </div>
            </form>
          )}
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                <tr>
                  <th className="px-6 py-3 w-16">S/N</th>
                  <th className="px-6 py-3">Seller Name</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">MCC(s)</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {paginatedSellers.map((seller, index) => (
                  <tr 
                    key={seller.id} 
                    onClick={() => setSelectedSeller(seller)}
                    className="hover:bg-surface-container-lowest transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 text-xs font-medium text-on-surface-variant">
                      {(sellerPage - 1) * pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold group-hover:text-primary transition-colors">{seller.name}</td>
                    <td className="px-6 py-4 text-sm">{seller.phone}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {seller.mccIds?.map((id: string) => (
                          <span key={id} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                            {mccs.find(m => m.id === id)?.name || id}
                          </span>
                        ))}
                        {(!seller.mccIds || seller.mccIds.length === 0) && <span className="text-[9px] opacity-40 italic">None</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        seller.active ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {seller.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSeller(seller);
                          }} 
                          className="p-1 text-primary hover:bg-primary/5 rounded"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSeller(seller.id);
                          }} 
                          className="p-1 text-error hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-container-low/50 font-bold border-t border-outline-variant/20">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-xs uppercase tracking-wider text-on-surface-variant">Grand Totals</td>
                  <td colSpan={3} className="px-6 py-4 text-right text-sm text-primary">
                    {filteredSellers.length} Sellers Total
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Seller Pagination */}
          {filteredSellers.length > pageSize && (
            <div className="flex items-center justify-between px-6 py-4 bg-white border border-outline-variant/20 rounded-xl shadow-sm">
              <p className="text-xs text-on-surface-variant">
                Showing <span className="font-bold text-on-surface">{(sellerPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(sellerPage * pageSize, filteredSellers.length)}</span> of <span className="font-bold text-on-surface">{filteredSellers.length}</span> sellers
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={sellerPage === 1}
                  onClick={() => setSellerPage(p => p - 1)}
                  className="p-2 rounded-lg border border-outline-variant/30 disabled:opacity-30 hover:bg-surface-container-low transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(filteredSellers.length / pageSize) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSellerPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                        sellerPage === i + 1 ? "bg-primary text-white shadow-md" : "hover:bg-surface-container-low text-on-surface-variant"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button 
                  disabled={sellerPage * pageSize >= filteredSellers.length}
                  onClick={() => setSellerPage(p => p + 1)}
                  className="p-2 rounded-lg border border-outline-variant/30 disabled:opacity-30 hover:bg-surface-container-low transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* User Edit Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Edit User Details</h2>
              <button onClick={() => setSelectedUser(null)} className="p-1 hover:bg-surface-container-low rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Full Name</label>
                  <input 
                    value={selectedUser.fullName} 
                    onChange={e => setSelectedUser({...selectedUser, fullName: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Email</label>
                  <input 
                    value={selectedUser.email || ''} 
                    onChange={e => setSelectedUser({...selectedUser, email: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                    type="email"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Role</label>
                  <select 
                    value={selectedUser.role} 
                    onChange={e => setSelectedUser({...selectedUser, role: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  >
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Status</label>
                  <select 
                    value={selectedUser.status} 
                    onChange={e => setSelectedUser({...selectedUser, status: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">MCC Assignments</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-surface-container-low rounded-lg">
                  {mccs.map(mcc => (
                    <label key={mcc.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedUser.mccIds?.includes(mcc.id)} 
                        onChange={e => {
                          let newIds = [...(selectedUser.mccIds || [])];
                          if (e.target.checked) {
                            if (!newIds.includes(mcc.id)) newIds.push(mcc.id);
                          } else {
                            newIds = newIds.filter((id: string) => id !== mcc.id);
                          }
                          setSelectedUser({...selectedUser, mccIds: newIds});
                        }}
                        className="w-4 h-4 rounded text-primary"
                      />
                      {mcc.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-outline-variant/10 pt-4">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                  <ShieldCheck size={14} /> Custom Page Access
                </label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-surface-container-low rounded-lg">
                  {pages.map(page => (
                    <label key={page} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedUser.customPermissions?.pages?.[page] ?? (rolePermissions[selectedUser.role]?.pages?.[page] || false)} 
                        onChange={e => {
                          const customPerms = selectedUser.customPermissions || { pages: {}, dashboard: {} };
                          setSelectedUser({
                            ...selectedUser,
                            customPermissions: {
                              ...customPerms,
                              pages: {
                                ...customPerms.pages,
                                [page]: e.target.checked
                              }
                            }
                          });
                        }}
                        className="w-4 h-4 rounded text-primary"
                      />
                      {page}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-outline-variant/10 pt-4">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-2">
                  <BarChart3 size={14} /> Custom Dashboard Widgets
                </label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-surface-container-low rounded-lg">
                  {widgets.map(widget => (
                    <label key={widget} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedUser.customPermissions?.dashboard?.[widget] ?? (rolePermissions[selectedUser.role]?.dashboard?.[widget] || false)} 
                        onChange={e => {
                          const customPerms = selectedUser.customPermissions || { pages: {}, dashboard: {} };
                          setSelectedUser({
                            ...selectedUser,
                            customPermissions: {
                              ...customPerms,
                              dashboard: {
                                ...customPerms.dashboard,
                                [widget]: e.target.checked
                              }
                            }
                          });
                        }}
                        className="w-4 h-4 rounded text-primary"
                      />
                      {widget}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3 sticky bottom-0 bg-white pb-2">
                <button type="button" onClick={() => setSelectedUser(null)} className="flex-1 px-4 py-2 font-bold text-on-surface-variant">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-bold shadow-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate MCC edit modal removed; unified in (isAddingMcc || selectedMcc) modal above */}

      {/* Driver Edit Modal */}
      {selectedDriver && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Edit Driver Details</h2>
              <button onClick={() => setSelectedDriver(null)} className="p-1 hover:bg-surface-container-low rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateDriver} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Full Name</label>
                <input 
                  value={selectedDriver.name} 
                  onChange={e => setSelectedDriver({...selectedDriver, name: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Phone Number</label>
                <input 
                  value={selectedDriver.phone} 
                  onChange={e => setSelectedDriver({...selectedDriver, phone: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Tanker Reg No</label>
                <input 
                  value={selectedDriver.tankerReg} 
                  onChange={e => setSelectedDriver({...selectedDriver, tankerReg: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setSelectedDriver(null)} className="flex-1 px-4 py-2 font-bold text-on-surface-variant">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-bold shadow-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seller Edit Modal */}
      {selectedSeller && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Edit Seller Details</h2>
              <button onClick={() => setSelectedSeller(null)} className="p-1 hover:bg-surface-container-low rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateSeller} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Full Name</label>
                <input 
                  value={selectedSeller.name} 
                  onChange={e => setSelectedSeller({...selectedSeller, name: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Phone Number</label>
                <input 
                  value={selectedSeller.phone} 
                  onChange={e => setSelectedSeller({...selectedSeller, phone: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Location</label>
                <input 
                  value={selectedSeller.location} 
                  onChange={e => setSelectedSeller({...selectedSeller, location: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">MCC Assignments</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-surface-container-low rounded-lg">
                  {mccs.map(mcc => (
                    <label key={mcc.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedSeller.mccIds?.includes(mcc.id)} 
                        onChange={e => {
                          let newIds = [...(selectedSeller.mccIds || [])];
                          if (e.target.checked) {
                            if (!newIds.includes(mcc.id)) newIds.push(mcc.id);
                          } else {
                            newIds = newIds.filter((id: string) => id !== mcc.id);
                          }
                          setSelectedSeller({...selectedSeller, mccIds: newIds});
                        }}
                        className="w-4 h-4 rounded text-primary"
                      />
                      {mcc.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={selectedSeller.active} 
                  onChange={e => setSelectedSeller({...selectedSeller, active: e.target.checked})}
                  className="w-4 h-4 rounded text-primary"
                />
                <label className="text-sm font-bold">Active Status</label>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setSelectedSeller(null)} className="flex-1 px-4 py-2 font-bold text-on-surface-variant">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-bold shadow-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wholesale Inquiries Management */}
      {activeTab === 'inquiries' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <PackageCheck size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Wholesale &amp; Distributor Inquiries</h2>
                <p className="text-sm text-on-surface-variant">Trade leads submitted directly from the public homepage</p>
              </div>
            </div>
            <span className="text-xs font-bold text-on-surface-variant">
              {inquiries.length} Total Inquiries ({inquiries.filter(i => i.status === 'New').length} New)
            </span>
          </div>

          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                <tr>
                  <th className="px-6 py-3">Business &amp; Contact</th>
                  <th className="px-6 py-3">Phone / Email</th>
                  <th className="px-6 py-3">Product Interest</th>
                  <th className="px-6 py-3">Region</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {inquiries.map(inq => (
                  <tr key={inq.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{inq.businessName}</p>
                      <p className="text-xs text-on-surface-variant">{inq.contactName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{inq.phoneOrEmail}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-primary">{inq.productFocus}</td>
                    <td className="px-6 py-4 text-sm">{inq.region || '---'}</td>
                    <td className="px-6 py-4">
                      <select
                        value={inq.status || 'New'}
                        onChange={e => handleInquiryStatus(inq.id, e.target.value as any)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-bold border-none',
                          inq.status === 'Resolved'
                            ? 'bg-green-100 text-green-700'
                            : inq.status === 'Contacted'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                        )}
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteInquiry(inq.id)}
                        className="p-1.5 text-error hover:bg-red-50 rounded"
                        title="Delete Inquiry"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {inquiries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-on-surface-variant">
                      No wholesale inquiries submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dedicated Homepage Manager Function */}
      {activeTab === 'homepage' && (
        <form onSubmit={handleSaveHomepage} className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Globe size={28} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">Homepage Manager</h2>
                  <span
                    className={cn(
                      'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full',
                      hasUnsavedConfig
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-green-100 text-green-700'
                    )}
                  >
                    {hasUnsavedConfig ? 'Unsaved Changes' : 'Synced with Live Homepage'}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Reorder &amp; toggle homepage sections, update impact metrics, and manage the Product Showcase Catalog
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/"
                className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
              >
                <ExternalLink size={14} />
                Preview Homepage
              </Link>
              <button
                type="button"
                onClick={handleSyncMetricsFromDb}
                disabled={isSyncingStats}
                className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-primary/10 text-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={15} className={isSyncingStats ? 'animate-spin' : ''} />
                {isSyncingStats ? 'Syncing DB...' : 'Sync Metrics & MCCs from DB'}
              </button>
              <button
                type="submit"
                disabled={isSavingHomepage}
                className="px-5 py-2.5 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md hover:shadow-primary/25 transition-all disabled:opacity-50"
              >
                <Save size={15} />
                {isSavingHomepage ? 'Publishing...' : 'Save & Publish Homepage'}
              </button>
            </div>
          </div>

          {homepageNotice && (
            <div
              className={cn(
                'p-4 rounded-xl border text-sm font-bold flex items-center justify-between gap-3',
                homepageNotice.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              )}
            >
              <span>{homepageNotice.text}</span>
              <button type="button" onClick={() => setHomepageNotice(null)} className="p-1 shrink-0">
                <X size={16} />
              </button>
            </div>
          )}

          {/* 1. Drag-and-Drop Homepage Sections Layout & Click-to-Popup Controller */}
          <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Homepage Sections Layout &amp; Visibility
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Drag and drop sections up or down to reorder, toggle On/Off to save live, or click any section to pop up its editor.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetHomepageSections}
                disabled={isSavingHomepage}
                className="text-xs font-bold text-primary hover:underline self-start sm:self-auto disabled:opacity-50"
              >
                Reset Section Order
              </button>
            </div>

            <div className="space-y-3">
              {(settings.homepageSections || DEFAULT_HOMEPAGE_SECTIONS).map((sec, idx) => {
                const isDragging = draggedSectionIdx === idx;
                const isDragOver = dragOverSectionIdx === idx && draggedSectionIdx !== null && draggedSectionIdx !== idx;
                return (
                  <div
                    key={sec.id}
                    draggable
                    onDragStart={e => {
                      setDraggedSectionIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverSectionIdx !== idx) {
                        setDragOverSectionIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverSectionIdx === idx) {
                        setDragOverSectionIdx(null);
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const rawIdx = e.dataTransfer.getData('text/plain');
                      const parsed = rawIdx !== '' ? Number(rawIdx) : undefined;
                      handleDropHomepageSection(idx, Number.isFinite(parsed) ? parsed : undefined);
                    }}
                    onDragEnd={() => {
                      setDraggedSectionIdx(null);
                      setDragOverSectionIdx(null);
                    }}
                    onClick={() => setActiveSectionModalId(sec.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveSectionModalId(sec.id);
                      }
                    }}
                    className={cn(
                      'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border cursor-pointer select-none transition-all',
                      isDragging
                        ? 'opacity-45 scale-[0.99] border-primary/50 bg-primary/[0.04]'
                        : isDragOver
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/[0.05] shadow-sm'
                        : sec.enabled
                        ? 'bg-surface-container-low border-outline-variant/15 hover:border-primary/40 hover:bg-primary/[0.02]'
                        : 'bg-neutral-50 border-neutral-200 opacity-75 hover:border-primary/30'
                    )}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <span
                        title="Drag up or down to reorder section"
                        className="p-1.5 rounded-lg text-on-surface-variant/70 hover:text-primary hover:bg-white cursor-grab active:cursor-grabbing shrink-0"
                      >
                        <GripVertical size={18} />
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-white border border-outline-variant/20 text-xs font-black text-primary flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-on-surface">{sec.label}</span>
                          <span className="text-[10px] font-mono text-on-surface-variant bg-white px-2 py-0.5 rounded border border-outline-variant/15">
                            #{sec.id}
                          </span>
                          {sec.id === 'products' && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {(settings.products || []).filter(p => p.active !== false).length} Active / {(settings.products || []).length} Products
                            </span>
                          )}
                          {sec.id === 'farmers' && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {mccs.filter(m => m.status === 'Active').length} Active MCCs
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">{sec.description}</p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-2.5 shrink-0 self-end sm:self-center"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveSectionModalId(sec.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-outline-variant/20 text-xs font-bold text-on-surface hover:text-primary hover:border-primary/40 transition-colors"
                      >
                        <Edit2 size={13} />
                        Edit Section
                      </button>
                      <button
                        type="button"
                        disabled={isSavingHomepage}
                        onClick={() => handleToggleHomepageSection(sec.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors min-w-[84px] justify-center disabled:opacity-60',
                          sec.enabled
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                        )}
                      >
                        {sec.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                        {sec.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-outline-variant/10">
              <button
                type="submit"
                disabled={isSavingHomepage}
                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50"
              >
                {isSavingHomepage ? 'Saving & Publishing Homepage...' : 'Save & Publish Homepage Configuration'}
              </button>
            </div>
          </div>

          {/* Pop-Up Modal Editor for Clicked Section */}
          {activeSectionModalId && (() => {
            const modalSections = settings.homepageSections || DEFAULT_HOMEPAGE_SECTIONS;
            const modalIdx = modalSections.findIndex(s => s.id === activeSectionModalId);
            const activeSec = modalSections[modalIdx];
            if (!activeSec) return null;

            return (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-200"
                onClick={() => setActiveSectionModalId(null)}
              >
                <div
                  className="bg-white rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="p-5 sm:p-7 border-b border-outline-variant/15 flex items-center justify-between gap-4 bg-surface-container-low shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-primary text-white text-sm font-black flex items-center justify-center shrink-0">
                        {modalIdx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg sm:text-xl font-black tracking-tight text-on-surface truncate">
                            {activeSec.label}
                          </h2>
                          <span className="text-[11px] font-mono text-on-surface-variant bg-white px-2 py-0.5 rounded border border-outline-variant/15">
                            #{activeSec.id}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full',
                              activeSec.enabled ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-700'
                            )}
                          >
                            {activeSec.enabled ? 'Visible on Homepage' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">{activeSec.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSectionModalId(null)}
                      className="p-2 hover:bg-surface-container-high rounded-full transition-colors shrink-0"
                      aria-label="Close section editor"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* Modal Scrollable Body */}
                  <div className="p-5 sm:p-7 space-y-6 overflow-y-auto custom-scrollbar">
                    {homepageNotice && homepageNotice.type === 'error' && (
                      <div className="p-3.5 rounded-xl border bg-red-50 border-red-200 text-red-800 text-xs font-bold flex items-center justify-between gap-2">
                        <span>{homepageNotice.text}</span>
                        <button type="button" onClick={() => setHomepageNotice(null)} className="p-1 shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Section Metadata */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-5 border-b border-outline-variant/15">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-on-surface-variant">Section Title (Admin Layout)</label>
                        <input
                          type="text"
                          value={activeSec.label}
                          onChange={e => handleHomepageSectionMetaChange(activeSec.id, 'label', e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-on-surface-variant">Section Summary</label>
                        <input
                          type="text"
                          value={activeSec.description}
                          onChange={e => handleHomepageSectionMetaChange(activeSec.id, 'description', e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* Section-Specific Add / Delete / Update Controls */}
                    {activeSec.id === 'hero' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const navCopy = hc.nav || DEFAULT_HOMEPAGE_CONTENT.nav;
                      const heroCopy = hc.hero || DEFAULT_HOMEPAGE_CONTENT.hero;
                      return (
                        <div className="space-y-6">
                          {/* Headline & Drop-Off Strip */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                              Hero Banner, Brand &amp; Drop-Off Rate Strip
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Hero Headline</label>
                                <input
                                  type="text"
                                  value={settings.heroHeadline || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, heroHeadline: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Top Trust Badge</label>
                                <input
                                  type="text"
                                  value={heroCopy.badgeText || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, badgeText: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Company Display Name</label>
                                <input
                                  type="text"
                                  value={settings.companyName || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, companyName: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">Hero Subheadline</label>
                              <textarea
                                rows={2}
                                value={settings.heroSubheadline || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, heroSubheadline: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-sm font-bold resize-none"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Primary Button Label (Red)</label>
                                <input
                                  type="text"
                                  value={heroCopy.primaryCtaLabel || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, primaryCtaLabel: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Secondary Button Label (Outlined)</label>
                                <input
                                  type="text"
                                  value={heroCopy.secondaryCtaLabel || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, secondaryCtaLabel: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-xs font-bold text-on-surface-variant">
                                    Drop-Off Price (System Settings)
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveSectionModalId(null);
                                      handleTabChange('settings');
                                    }}
                                    className="text-[11px] font-black text-primary hover:underline"
                                  >
                                    Edit Rate
                                  </button>
                                </div>
                                <div className="w-full px-3.5 py-2.5 bg-primary/[0.06] border border-primary/20 rounded-xl text-sm font-black text-primary flex items-center justify-between tabular-nums">
                                  <span>TSh {formatNumber(settings.milkPrice, 0)} / Litre</span>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                                    Auto-Synced
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Rate Strip Heading</label>
                                <input
                                  type="text"
                                  value={heroCopy.rateLabel || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, rateLabel: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Farmer Payout Schedule</label>
                                <input
                                  type="text"
                                  value={settings.payoutSchedule || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, payoutSchedule: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Quality Verification Label</label>
                                <input
                                  type="text"
                                  value={heroCopy.qualityLabel || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, qualityLabel: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">Quality Highlight Value</label>
                                <input
                                  type="text"
                                  value={heroCopy.qualityValue || ''}
                                  onChange={e => updateHomepageContent('hero', prev => ({ ...prev, qualityValue: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-on-surface-variant">MCC Intake / Cut-Off Hours</label>
                                <input
                                  type="text"
                                  value={settings.dropOffCutoffHours || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, dropOffCutoffHours: e.target.value }))}
                                  placeholder="06:00 – 10:30 EAT · 16:00 – 18:00 EAT"
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Hero Image & Overlay Caption */}
                          <div className="pt-4 border-t border-outline-variant/15 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                Hero Gate Reception Photo &amp; Caption
                              </h4>
                              {heroCopy.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => updateHomepageContent('hero', prev => ({ ...prev, imageUrl: '' }))}
                                  className="text-xs font-bold text-primary hover:underline"
                                >
                                  Restore Default Gate Photo
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                              <div className="md:col-span-4">
                                <img
                                  src={heroCopy.imageUrl || heroDropoffImg}
                                  alt="Hero reception preview"
                                  className="w-full h-28 object-cover rounded-xl border border-outline-variant/20 bg-surface-container-low"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="md:col-span-8 space-y-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={heroCopy.imageUrl || ''}
                                    onChange={e => updateHomepageContent('hero', prev => ({ ...prev, imageUrl: e.target.value }))}
                                    placeholder="Leave blank for default gate photo or paste https:// URL"
                                    className="w-full px-3.5 py-2 bg-surface-container-low border-none rounded-xl text-xs font-medium"
                                  />
                                  <label className="px-3 py-2 rounded-xl bg-surface-container-low hover:bg-primary/10 text-primary text-xs font-bold cursor-pointer shrink-0 inline-flex items-center gap-1.5">
                                    <Upload size={13} /> Upload
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={e => handleSectionImageUpload('hero', e)}
                                      className="hidden"
                                    />
                                  </label>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <input
                                    type="text"
                                    value={heroCopy.imageCaptionEyebrow || ''}
                                    onChange={e => updateHomepageContent('hero', prev => ({ ...prev, imageCaptionEyebrow: e.target.value }))}
                                    placeholder="Morning Milk Reception · {{dropOffHours}}"
                                    className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={heroCopy.imageCaptionText || ''}
                                    onChange={e => updateHomepageContent('hero', prev => ({ ...prev, imageCaptionText: e.target.value }))}
                                    placeholder="Photo overlay description"
                                    className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-medium"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Top Navigation Labels */}
                          <div className="pt-4 border-t border-outline-variant/15 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                              Top Navigation Bar Labels &amp; Logo
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Nav Link 1</label>
                                <input
                                  type="text"
                                  value={navCopy.farmersLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, farmersLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Nav Link 2</label>
                                <input
                                  type="text"
                                  value={navCopy.staffLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, staffLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Nav Link 3</label>
                                <input
                                  type="text"
                                  value={navCopy.productsLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, productsLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Nav Link 4</label>
                                <input
                                  type="text"
                                  value={navCopy.locationsLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, locationsLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Staff Login Btn</label>
                                <input
                                  type="text"
                                  value={navCopy.staffLoginLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, staffLoginLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Red Action Btn</label>
                                <input
                                  type="text"
                                  value={navCopy.ratesButtonLabel || ''}
                                  onChange={e => updateHomepageContent('nav', prev => ({ ...prev, ratesButtonLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-xs font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {activeSec.id === 'farmers' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const farmersCopy = hc.farmers || DEFAULT_HOMEPAGE_CONTENT.farmers;
                      return (
                        <div className="space-y-6">
                          {/* Farmers Header & Locator Copy */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                              For Dairy Farmers Heading &amp; Locator Copy
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Eyebrow</label>
                                <input
                                  type="text"
                                  value={farmersCopy.eyebrow || ''}
                                  onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, eyebrow: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Section Headline</label>
                                <input
                                  type="text"
                                  value={farmersCopy.headline || ''}
                                  onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, headline: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Trust Badge</label>
                                <input
                                  type="text"
                                  value={farmersCopy.trustBadge || ''}
                                  onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, trustBadge: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Locator Eyebrow</label>
                                <input
                                  type="text"
                                  value={farmersCopy.locatorEyebrow || ''}
                                  onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, locatorEyebrow: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Locator Title</label>
                                <input
                                  type="text"
                                  value={farmersCopy.locatorHeadline || ''}
                                  onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, locatorHeadline: e.target.value }))}
                                  className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Locator Subheadline</label>
                              <input
                                type="text"
                                value={farmersCopy.locatorSubheadline || ''}
                                onChange={e => updateHomepageContent('farmers', prev => ({ ...prev, locatorSubheadline: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-medium"
                              />
                            </div>
                          </div>

                          {/* Farmer Process Steps CRUD */}
                          <div className="pt-4 border-t border-outline-variant/15 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                  Drop-Off Guide Cards ({(farmersCopy.steps || []).length})
                                </h4>
                                <p className="text-[11px] text-on-surface-variant">
                                  Supports dynamic tokens <span className="font-mono">{'{{dropOffHours}}'}</span>, <span className="font-mono">{'{{milkPrice}}'}</span>, <span className="font-mono">{'{{payoutSchedule}}'}</span>.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleAddFarmerStep}
                                className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5"
                              >
                                <Plus size={14} /> Add Card
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {(farmersCopy.steps || []).map((step, sIdx) => (
                                <div key={step.id || sIdx} className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={step.stepNumber}
                                        onChange={e => handleUpdateFarmerStep(sIdx, 'stepNumber', e.target.value)}
                                        className="w-12 px-2 py-1 bg-white rounded-lg text-xs font-black border-none"
                                      />
                                      <select
                                        value={step.accentTone}
                                        onChange={e => handleUpdateFarmerStep(sIdx, 'accentTone', e.target.value)}
                                        className="px-2 py-1 bg-white rounded-lg text-[11px] font-bold border-none"
                                      >
                                        <option value="red">Red</option>
                                        <option value="green">Green</option>
                                        <option value="gold">Gold</option>
                                      </select>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFarmerStep(sIdx)}
                                      className="p-1.5 rounded-lg bg-white text-error hover:bg-red-50"
                                      title="Delete card"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={step.metaText}
                                    onChange={e => handleUpdateFarmerStep(sIdx, 'metaText', e.target.value)}
                                    placeholder="Right badge text"
                                    className="w-full px-3 py-1.5 bg-white rounded-lg text-[11px] font-semibold border-none"
                                  />
                                  <input
                                    type="text"
                                    value={step.title}
                                    onChange={e => handleUpdateFarmerStep(sIdx, 'title', e.target.value)}
                                    placeholder="Step title"
                                    className="w-full px-3 py-1.5 bg-white rounded-lg text-xs font-black border-none"
                                  />
                                  <textarea
                                    rows={3}
                                    value={step.description}
                                    onChange={e => handleUpdateFarmerStep(sIdx, 'description', e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white rounded-lg text-xs font-medium border-none resize-none"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* MCC Directory CRUD */}
                          <div className="pt-4 border-t border-outline-variant/15 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                  Collection Centers Directory on Homepage ({mccs.length} Total)
                                </h4>
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  Add, update, or remove Milk Collection Centers displayed in the Farmer Locator.
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => syncPublicDirectory()}
                                  className="px-3 py-2 rounded-xl bg-surface-container-low hover:bg-primary/10 text-primary text-xs font-bold inline-flex items-center gap-1.5"
                                >
                                  <RefreshCw size={13} /> Sync Directory
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsAddingMcc(true)}
                                  className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm"
                                >
                                  <Plus size={14} /> Add MCC
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {mccs.map(mcc => (
                                <div
                                  key={mcc.id}
                                  className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-on-surface truncate">{mcc.name}</p>
                                    <p className="text-[11px] text-on-surface-variant truncate">
                                      {mcc.region || mcc.location} · {mcc.hours || settings.dropOffCutoffHours}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <select
                                      value={mcc.status || 'Active'}
                                      onChange={e => handleUpdateMccField(mcc.id, 'status', e.target.value)}
                                      className="px-2 py-1 rounded-lg bg-white text-[11px] font-bold border-none"
                                    >
                                      <option value="Active">Active</option>
                                      <option value="Coming Soon">Coming Soon</option>
                                      <option value="Inactive">Inactive</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedMcc(mcc)}
                                      title="Edit MCC"
                                      className="p-1.5 rounded-lg bg-white text-primary hover:bg-primary/5"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMccToDelete(mcc)}
                                      title="Delete MCC"
                                      className="p-1.5 rounded-lg bg-white text-error hover:bg-red-50"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {mccs.length === 0 && (
                                <p className="text-xs text-on-surface-variant col-span-full py-4 text-center">
                                  No MCCs added yet. Click &ldquo;Add MCC&rdquo; to create your first collection center.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {activeSec.id === 'staff' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const staffCopy = hc.staff || DEFAULT_HOMEPAGE_CONTENT.staff;
                      const staffSlides = staffCopy.slides && staffCopy.slides.length > 0 ? staffCopy.slides : DEFAULT_STAFF_SLIDES;
                      return (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                MCC Staff Auto-Slider ({staffSlides.length} Slides) &amp; Portal Links
                              </h4>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                Each slide showcases its own photo, header, target highlight, and summary description — auto-sliding on the homepage.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSectionModalId(null);
                                handleTabChange('users');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-primary/10 text-primary text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto"
                            >
                              <Users size={14} /> Manage Staff Accounts ({users.length})
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15">
                            <div className="space-y-1 md:col-span-2">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Section Eyebrow</label>
                              <input
                                type="text"
                                value={staffCopy.eyebrow || ''}
                                onChange={e => updateHomepageContent('staff', prev => ({ ...prev, eyebrow: e.target.value }))}
                                className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Slide Interval (Seconds)</label>
                              <input
                                type="number"
                                min={1.5}
                                max={15}
                                step={0.5}
                                value={((staffCopy.slideIntervalMs || 3800) / 1000).toFixed(1)}
                                onChange={e => {
                                  const secs = Math.max(1.5, Math.min(15, Number(e.target.value) || 3.8));
                                  updateHomepageContent('staff', prev => ({ ...prev, slideIntervalMs: Math.round(secs * 1000) }));
                                }}
                                className="w-full px-3 py-2 bg-white rounded-lg text-xs font-black border-none"
                              />
                            </div>
                          </div>

                          {/* Staff Slides CRUD */}
                          <div className="pt-2 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                Operations &amp; Standards Slides ({staffSlides.length})
                              </h4>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => updateHomepageContent('staff', prev => ({ ...prev, slides: DEFAULT_STAFF_SLIDES }))}
                                  className="text-xs font-bold text-on-surface-variant hover:text-primary"
                                >
                                  Reset Default 4 Slides
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAddStaffSlide}
                                  className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5"
                                >
                                  <Plus size={14} /> Add Slide
                                </button>
                              </div>
                            </div>

                            <div className="space-y-4">
                              {staffSlides.map((slide, sIdx, sArr) => (
                                <div key={slide.id || sIdx} className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <img
                                        src={resolveStaffSlidePreview(slide.imageUrl)}
                                        alt={slide.header}
                                        className="w-20 h-14 rounded-xl object-cover bg-white border border-outline-variant/20 shrink-0"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs font-black text-on-surface truncate">
                                          Slide {sIdx + 1}: {slide.header || 'Untitled Slide'}
                                        </p>
                                        <p className="text-[11px] font-semibold text-on-surface-variant truncate">
                                          {slide.highlightLabel}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={sIdx === 0}
                                        onClick={() => handleMoveStaffSlide(sIdx, 'up')}
                                        title="Move slide earlier"
                                        className="p-1.5 rounded-lg bg-white border border-outline-variant/20 hover:text-primary disabled:opacity-30"
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sIdx === sArr.length - 1}
                                        onClick={() => handleMoveStaffSlide(sIdx, 'down')}
                                        title="Move slide later"
                                        className="p-1.5 rounded-lg bg-white border border-outline-variant/20 hover:text-primary disabled:opacity-30"
                                      >
                                        <ArrowDown size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sArr.length <= 1}
                                        onClick={() => handleDeleteStaffSlide(sIdx)}
                                        title="Delete slide"
                                        className="p-1.5 rounded-lg bg-white border border-outline-variant/20 text-error hover:bg-red-50 disabled:opacity-30"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                    <div className="md:col-span-5 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Slide Header</label>
                                      <input
                                        type="text"
                                        value={slide.header}
                                        onChange={e => handleUpdateStaffSlide(sIdx, 'header', e.target.value)}
                                        className="w-full px-3 py-2 bg-white rounded-lg text-xs font-black border-none"
                                      />
                                    </div>
                                    <div className="md:col-span-3 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Target / Highlight</label>
                                      <input
                                        type="text"
                                        value={slide.highlightLabel}
                                        onChange={e => handleUpdateStaffSlide(sIdx, 'highlightLabel', e.target.value)}
                                        placeholder="e.g. ≤ 4.0 °C Target"
                                        className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                      />
                                    </div>
                                    <div className="md:col-span-2 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Icon</label>
                                      <select
                                        value={slide.icon || 'shield'}
                                        onChange={e => handleUpdateStaffSlide(sIdx, 'icon', e.target.value as StaffStandardIcon)}
                                        className="w-full px-2.5 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                      >
                                        <option value="shield">Shield</option>
                                        <option value="thermometer">Temp</option>
                                        <option value="flask">Lab / CIP</option>
                                        <option value="truck">Tanker</option>
                                        <option value="clock">Clock</option>
                                        <option value="check">Check</option>
                                      </select>
                                    </div>
                                    <div className="md:col-span-2 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Tone</label>
                                      <select
                                        value={slide.highlightColor || 'green'}
                                        onChange={e => handleUpdateStaffSlide(sIdx, 'highlightColor', e.target.value)}
                                        className="w-full px-2.5 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                      >
                                        <option value="green">Green</option>
                                        <option value="red">Red</option>
                                        <option value="dark">Dark</option>
                                        <option value="gold">Gold</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-on-surface-variant">Summary Description</label>
                                    <textarea
                                      rows={2}
                                      value={slide.summary}
                                      onChange={e => handleUpdateStaffSlide(sIdx, 'summary', e.target.value)}
                                      className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none resize-none"
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                    <div className="md:col-span-5 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Photo Preset</label>
                                      <select
                                        value={STAFF_IMAGE_PRESETS.some(p => p.value === slide.imageUrl) ? slide.imageUrl : '__custom__'}
                                        onChange={e => {
                                          if (e.target.value !== '__custom__') {
                                            handleUpdateStaffSlide(sIdx, 'imageUrl', e.target.value);
                                          }
                                        }}
                                        className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                      >
                                        {STAFF_IMAGE_PRESETS.map(p => (
                                          <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                        {!STAFF_IMAGE_PRESETS.some(p => p.value === slide.imageUrl) && (
                                          <option value="__custom__">Custom Image / Uploaded Photo</option>
                                        )}
                                      </select>
                                    </div>
                                    <div className="md:col-span-7 space-y-1">
                                      <label className="text-[10px] font-bold uppercase text-on-surface-variant">Custom Image URL or Upload</label>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          value={slide.imageUrl || ''}
                                          onChange={e => handleUpdateStaffSlide(sIdx, 'imageUrl', e.target.value)}
                                          placeholder="preset:cooling-tanks or https://..."
                                          className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                        />
                                        <label className="px-3 py-2 bg-white rounded-lg text-xs font-bold text-primary hover:bg-primary/5 border border-outline-variant/20 cursor-pointer shrink-0 inline-flex items-center gap-1">
                                          <Upload size={13} /> Upload
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => handleStaffSlideImageUpload(sIdx, e)}
                                            className="hidden"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-outline-variant/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Portal Btn (Signed Out)</label>
                              <input
                                type="text"
                                value={staffCopy.portalCtaLoggedOut || ''}
                                onChange={e => updateHomepageContent('staff', prev => ({ ...prev, portalCtaLoggedOut: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Portal Btn (Signed In)</label>
                              <input
                                type="text"
                                value={staffCopy.portalCtaLoggedIn || ''}
                                onChange={e => updateHomepageContent('staff', prev => ({ ...prev, portalCtaLoggedIn: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">MCC Support Phone</label>
                              <input
                                type="text"
                                value={settings.supportPhone || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, supportPhone: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-on-surface-variant">Official Support Email</label>
                              <input
                                type="email"
                                value={settings.supportEmail || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, supportEmail: e.target.value }))}
                                className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {activeSec.id === 'products' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const prodCopy = hc.products || DEFAULT_HOMEPAGE_CONTENT.products;
                      return (
                      <div className="space-y-5">
                        {/* Slider Timing & CTA Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-on-surface-variant">Auto-Slide Interval (Seconds)</label>
                            <input
                              type="number"
                              min={1.5}
                              max={15}
                              step={0.5}
                              value={((prodCopy.slideIntervalMs || 3500) / 1000).toFixed(1)}
                              onChange={e => {
                                const secs = Math.max(1.5, Math.min(15, Number(e.target.value) || 3.5));
                                updateHomepageContent('products', prev => ({ ...prev, slideIntervalMs: Math.round(secs * 1000) }));
                              }}
                              className="w-full px-3 py-2 bg-white rounded-lg text-xs font-black border-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-on-surface-variant">Primary Slide Button</label>
                            <input
                              type="text"
                              value={prodCopy.primaryCtaLabel || ''}
                              onChange={e => updateHomepageContent('products', prev => ({ ...prev, primaryCtaLabel: e.target.value }))}
                              className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-on-surface-variant">Secondary Slide Button</label>
                            <input
                              type="text"
                              value={prodCopy.secondaryCtaLabel || ''}
                              onChange={e => updateHomepageContent('products', prev => ({ ...prev, secondaryCtaLabel: e.target.value }))}
                              className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                              Homepage Product Showcase Catalog ({(settings.products || []).filter(p => p.active !== false).length} Active / {(settings.products || []).length} Total)
                            </h4>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              Add, edit, reorder, toggle visibility, or update product imagery — synced directly to the homepage auto-slider.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateSettingsDraft(prev => ({ ...prev, products: DEFAULT_PRODUCTS }))}
                              className="text-xs font-bold text-on-surface-variant hover:text-primary"
                            >
                              Reset Defaults
                            </button>
                            <button
                              type="button"
                              onClick={handleAddProduct}
                              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
                            >
                              <Plus size={15} /> Add Product
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {(settings.products || []).map((prod, pIdx, pArr) => (
                            <div
                              key={prod.id}
                              className={cn(
                                'p-4 sm:p-5 rounded-2xl border space-y-4 transition-all',
                                prod.active !== false
                                  ? 'bg-surface-container-low border-outline-variant/15'
                                  : 'bg-neutral-50 border-neutral-200 opacity-75'
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <img
                                    src={resolveProductPreview(prod)}
                                    alt={prod.name}
                                    className="w-14 h-14 rounded-xl object-cover bg-white border border-outline-variant/20 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: prod.accentHex || '#D9232E' }} />
                                      <span className="font-black text-sm truncate">{prod.name}</span>
                                    </div>
                                    <p className="text-[11px] font-semibold text-on-surface-variant mt-0.5">
                                      Slide #{pIdx + 1} · {prod.category}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={pIdx === 0}
                                    onClick={() => handleMoveProduct(pIdx, 'up')}
                                    title="Move slide earlier"
                                    className="p-2 rounded-lg bg-white border border-outline-variant/20 hover:text-primary disabled:opacity-30"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pIdx === pArr.length - 1}
                                    onClick={() => handleMoveProduct(pIdx, 'down')}
                                    title="Move slide later"
                                    className="p-2 rounded-lg bg-white border border-outline-variant/20 hover:text-primary disabled:opacity-30"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleProductFieldChange(pIdx, 'active', prod.active === false)}
                                    className={cn(
                                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                                      prod.active !== false
                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                        : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                                    )}
                                  >
                                    {prod.active !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                                    {prod.active !== false ? 'Visible' : 'Hidden'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProduct(pIdx)}
                                    title="Delete Product"
                                    className="p-2 rounded-lg bg-white border border-outline-variant/20 text-error hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Product Name</label>
                                  <input
                                    type="text"
                                    value={prod.name}
                                    onChange={e => handleProductFieldChange(pIdx, 'name', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Product Line</label>
                                  <select
                                    value={prod.category}
                                    onChange={e => handleProductFieldChange(pIdx, 'category', e.target.value as DairyProductCategory)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                  >
                                    <option value="UHT Long-Life Milk">UHT Long-Life Milk</option>
                                    <option value="Fresh Yogurts">Fresh Yogurts</option>
                                    <option value="Traditional Cultured">Traditional Cultured</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Accent Label</label>
                                  <input
                                    type="text"
                                    value={prod.accentLabel}
                                    onChange={e => handleProductFieldChange(pIdx, 'accentLabel', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Accent Color (Auto from Photo)</label>
                                  <div className="flex items-center gap-1.5 bg-white rounded-lg px-2 py-1">
                                    <input
                                      type="color"
                                      value={prod.accentHex || '#D9232E'}
                                      onChange={e => handleProductFieldChange(pIdx, 'accentHex', e.target.value)}
                                      className="w-7 h-7 rounded border-none cursor-pointer bg-transparent shrink-0"
                                    />
                                    <input
                                      type="text"
                                      value={prod.accentHex || '#D9232E'}
                                      onChange={e => handleProductFieldChange(pIdx, 'accentHex', e.target.value)}
                                      className="w-full text-xs font-mono font-bold border-none bg-transparent focus:ring-0"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => syncProductAccentFromImage(prod.id, prod.category, prod.imageUrl, true)}
                                      disabled={extractingProductId === prod.id}
                                      title="Auto-pick accent color from product photo"
                                      className="px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                                    >
                                      <Sparkles size={11} className={extractingProductId === prod.id ? 'animate-spin' : ''} />
                                      Auto
                                    </button>
                                  </div>
                                  {productPalettes[prod.id]?.length > 0 && (
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <span className="text-[9px] font-bold text-on-surface-variant uppercase">Photo Palette:</span>
                                      {productPalettes[prod.id].map((hex) => (
                                        <button
                                          key={hex}
                                          type="button"
                                          onClick={() => handleProductFieldChange(pIdx, 'accentHex', hex)}
                                          title={`Use ${hex} from photo`}
                                          className={cn(
                                            'w-4 h-4 rounded-full border transition-transform hover:scale-110 cursor-pointer',
                                            (prod.accentHex || '').toUpperCase() === hex.toUpperCase()
                                              ? 'ring-2 ring-primary ring-offset-1 border-white'
                                              : 'border-black/15'
                                          )}
                                          style={{ backgroundColor: hex }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Pack Sizes</label>
                                  <input
                                    type="text"
                                    value={prod.packSizes}
                                    onChange={e => handleProductFieldChange(pIdx, 'packSizes', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                    placeholder="e.g. 250 ml · 500 ml · 1 L"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Shelf Life</label>
                                  <input
                                    type="text"
                                    value={prod.shelfLife}
                                    onChange={e => handleProductFieldChange(pIdx, 'shelfLife', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                    placeholder="e.g. 6 Months Ambient"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Storage Type</label>
                                  <input
                                    type="text"
                                    value={prod.storageType || ''}
                                    onChange={e => handleProductFieldChange(pIdx, 'storageType', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                    placeholder="e.g. Keep Refrigerated 2–4 °C"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                <div className="md:col-span-5 space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Tagline</label>
                                  <input
                                    type="text"
                                    value={prod.tagline}
                                    onChange={e => handleProductFieldChange(pIdx, 'tagline', e.target.value)}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                  />
                                </div>
                                <div className="md:col-span-3 space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Quick Photo Preset</label>
                                  <select
                                    value={PRODUCT_IMAGE_PRESETS.some(p => p.value === (prod.imageUrl || '')) ? (prod.imageUrl || '') : '__custom__'}
                                    onChange={e => {
                                      if (e.target.value !== '__custom__') {
                                        handleProductFieldChange(pIdx, 'imageUrl', e.target.value);
                                        syncProductAccentFromImage(prod.id, prod.category, e.target.value, true);
                                      }
                                    }}
                                    className="w-full px-3 py-2 bg-white rounded-lg text-xs font-bold border-none"
                                  >
                                    {PRODUCT_IMAGE_PRESETS.map(preset => (
                                      <option key={preset.label} value={preset.value}>{preset.label}</option>
                                    ))}
                                    {!PRODUCT_IMAGE_PRESETS.some(p => p.value === (prod.imageUrl || '')) && (
                                      <option value="__custom__">Custom Image / Uploaded Photo</option>
                                    )}
                                  </select>
                                </div>
                                <div className="md:col-span-4 space-y-1">
                                  <label className="text-[10px] font-bold uppercase text-on-surface-variant">Image Path / URL or Upload</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={prod.imageUrl || ''}
                                      onChange={e => handleProductFieldChange(pIdx, 'imageUrl', e.target.value)}
                                      onBlur={e => syncProductAccentFromImage(prod.id, prod.category, e.target.value, true)}
                                      placeholder="./assets/aistudio/... or https://..."
                                      className="w-full px-3 py-2 bg-white rounded-lg text-xs font-medium border-none"
                                    />
                                    <label
                                      className="px-2.5 py-2 bg-white rounded-lg text-xs font-bold text-primary hover:bg-primary/5 border border-outline-variant/20 cursor-pointer shrink-0 inline-flex items-center gap-1"
                                      title="Upload custom product photo"
                                    >
                                      <Upload size={13} />
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => handleProductImageUpload(pIdx, e)}
                                        className="hidden"
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(settings.products || []).length === 0 && (
                            <div className="p-8 rounded-2xl bg-surface-container-low text-center space-y-2">
                              <p className="text-sm font-bold text-on-surface-variant">No products in catalog yet.</p>
                              <button
                                type="button"
                                onClick={handleAddProduct}
                                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5"
                              >
                                <Plus size={14} /> Add First Product
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })()}

                    {activeSec.id === 'wholesale' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const wholesaleCopy = hc.wholesale || DEFAULT_HOMEPAGE_CONTENT.wholesale;
                      return (
                        <div className="space-y-5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                                Wholesale Section Copy &amp; Contacts ({inquiries.filter(i => i.status === 'New').length} New Inquiries)
                              </h4>
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                Edit wholesale headings, inquiry button copy, contact details, and manage incoming leads.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSectionModalId(null);
                                handleTabChange('inquiries');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-primary/10 text-primary text-xs font-bold inline-flex items-center gap-1.5 self-start sm:self-auto"
                            >
                              <PackageCheck size={14} /> Open Inquiries Inbox ({inquiries.length})
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">Eyebrow</label>
                              <input
                                type="text"
                                value={wholesaleCopy.eyebrow || ''}
                                onChange={e => updateHomepageContent('wholesale', prev => ({ ...prev, eyebrow: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <label className="text-xs font-bold text-on-surface-variant">Headline</label>
                              <input
                                type="text"
                                value={wholesaleCopy.headline || ''}
                                onChange={e => updateHomepageContent('wholesale', prev => ({ ...prev, headline: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-on-surface-variant">Description</label>
                            <textarea
                              rows={2}
                              value={wholesaleCopy.description || ''}
                              onChange={e => updateHomepageContent('wholesale', prev => ({ ...prev, description: e.target.value }))}
                              className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-medium resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">Form Footer Note</label>
                              <input
                                type="text"
                                value={wholesaleCopy.footerNote || ''}
                                onChange={e => updateHomepageContent('wholesale', prev => ({ ...prev, footerNote: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-medium"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">Submit Button Label</label>
                              <input
                                type="text"
                                value={wholesaleCopy.submitButtonLabel || ''}
                                onChange={e => updateHomepageContent('wholesale', prev => ({ ...prev, submitButtonLabel: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-outline-variant/15">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">Wholesale Desk Email</label>
                              <input
                                type="email"
                                value={settings.wholesaleEmail || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, wholesaleEmail: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">HQ Phone</label>
                              <input
                                type="text"
                                value={settings.supportPhone || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, supportPhone: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-on-surface-variant">HQ Address</label>
                              <input
                                type="text"
                                value={settings.companyAddress || ''}
                                onChange={e => updateSettingsDraft(prev => ({ ...prev, companyAddress: e.target.value }))}
                                className="w-full px-3.5 py-2.5 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                              />
                            </div>
                          </div>

                          {inquiries.length > 0 && (
                            <div className="space-y-2 pt-2">
                              <p className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant">Recent Inquiries</p>
                              {inquiries.slice(0, 3).map(inq => (
                                <div key={inq.id} className="p-3 rounded-xl bg-surface-container-low flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div>
                                    <span className="font-black text-on-surface">{inq.businessName}</span>
                                    <span className="text-on-surface-variant"> · {inq.productFocus} · {inq.phoneOrEmail}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={inq.status || 'New'}
                                      onChange={e => handleInquiryStatus(inq.id, e.target.value as any)}
                                      className="px-2 py-1 rounded-lg bg-white font-bold text-[11px] border-none"
                                    >
                                      <option value="New">New</option>
                                      <option value="Contacted">Contacted</option>
                                      <option value="Resolved">Resolved</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteInquiry(inq.id)}
                                      className="p-1 text-error hover:bg-red-50 rounded"
                                      title="Delete Inquiry"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {activeSec.id === 'impact' && (() => {
                      const hc = settings.homepageContent || DEFAULT_HOMEPAGE_CONTENT;
                      const impactCopy = hc.impact || DEFAULT_HOMEPAGE_CONTENT.impact;
                      const footerCopy = hc.footer || DEFAULT_HOMEPAGE_CONTENT.footer;
                      const liveFarmers = livePublicStats ? livePublicStats.activeFarmers : (settings.impactMetrics?.activeFarmers ?? 2400);
                      const liveMccs = livePublicStats ? livePublicStats.activeMccs : (settings.impactMetrics?.activeMccs ?? 6);
                      const liveLiters = livePublicStats ? livePublicStats.dailyLitersHq : (settings.impactMetrics?.dailyLitersHq ?? 45000);
                      return (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-2xl bg-green-50 border border-green-200">
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-widest text-green-900">
                                Impact Strip Key Figures — Auto-Fetched from Database
                              </h4>
                              <p className="text-xs text-green-800 mt-0.5">
                                Active Farmers, Collection Centers, and Liters Processed Daily at HQ sync automatically from Firestore collections whenever records change.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleSyncMetricsFromDb}
                              disabled={isSyncingStats}
                              className="px-3.5 py-2 rounded-xl bg-white hover:bg-green-100 text-green-800 border border-green-300 font-bold text-xs inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                            >
                              <RefreshCw size={13} className={isSyncingStats ? 'animate-spin' : ''} />
                              {isSyncingStats ? 'Syncing...' : 'Refresh Live DB Now'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Active Farmers */}
                            <div className="p-4 rounded-xl bg-surface-container-low space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={impactCopy.farmersLabel || ''}
                                  onChange={e => updateHomepageContent('impact', prev => ({ ...prev, farmersLabel: e.target.value }))}
                                  className="w-full px-2.5 py-1 bg-white rounded-lg text-xs font-black border-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSettingsDraft(prev => ({
                                      ...prev,
                                      impactMetrics: {
                                        ...prev.impactMetrics,
                                        showActiveFarmers: prev.impactMetrics?.showActiveFarmers === false,
                                      },
                                    }))
                                  }
                                  className={cn(
                                    'text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0',
                                    settings.impactMetrics?.showActiveFarmers !== false
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-neutral-200 text-neutral-600'
                                  )}
                                >
                                  {settings.impactMetrics?.showActiveFarmers !== false ? 'Visible' : 'Hidden'}
                                </button>
                              </div>
                              <div className="w-full px-3 py-2 bg-white rounded-lg text-base font-black text-primary flex items-center justify-between tabular-nums">
                                <span>{formatNumber(liveFarmers, 0)}+</span>
                                <span className="text-[10px] font-bold uppercase text-green-700">Live DB</span>
                              </div>
                              <textarea
                                rows={2}
                                value={impactCopy.farmersDesc || ''}
                                onChange={e => updateHomepageContent('impact', prev => ({ ...prev, farmersDesc: e.target.value }))}
                                className="w-full px-2.5 py-1.5 bg-white border-none rounded-lg text-[11px] font-medium resize-none"
                              />
                            </div>

                            {/* Collection Centers */}
                            <div className="p-4 rounded-xl bg-surface-container-low space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={impactCopy.mccsLabel || ''}
                                  onChange={e => updateHomepageContent('impact', prev => ({ ...prev, mccsLabel: e.target.value }))}
                                  className="w-full px-2.5 py-1 bg-white rounded-lg text-xs font-black border-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSettingsDraft(prev => ({
                                      ...prev,
                                      impactMetrics: {
                                        ...prev.impactMetrics,
                                        showActiveMccs: prev.impactMetrics?.showActiveMccs === false,
                                      },
                                    }))
                                  }
                                  className={cn(
                                    'text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0',
                                    settings.impactMetrics?.showActiveMccs !== false
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-neutral-200 text-neutral-600'
                                  )}
                                >
                                  {settings.impactMetrics?.showActiveMccs !== false ? 'Visible' : 'Hidden'}
                                </button>
                              </div>
                              <div className="w-full px-3 py-2 bg-white rounded-lg text-base font-black text-primary flex items-center justify-between tabular-nums">
                                <span>{formatNumber(liveMccs, 0)}</span>
                                <span className="text-[10px] font-bold uppercase text-green-700">Live DB</span>
                              </div>
                              <textarea
                                rows={2}
                                value={impactCopy.mccsDesc || ''}
                                onChange={e => updateHomepageContent('impact', prev => ({ ...prev, mccsDesc: e.target.value }))}
                                className="w-full px-2.5 py-1.5 bg-white border-none rounded-lg text-[11px] font-medium resize-none"
                              />
                            </div>

                            {/* Liters Processed Daily at HQ */}
                            <div className="p-4 rounded-xl bg-surface-container-low space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={impactCopy.litersLabel || ''}
                                  onChange={e => updateHomepageContent('impact', prev => ({ ...prev, litersLabel: e.target.value }))}
                                  className="w-full px-2.5 py-1 bg-white rounded-lg text-xs font-black border-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSettingsDraft(prev => ({
                                      ...prev,
                                      impactMetrics: {
                                        ...prev.impactMetrics,
                                        showDailyLitersHq: prev.impactMetrics?.showDailyLitersHq === false,
                                      },
                                    }))
                                  }
                                  className={cn(
                                    'text-[10px] font-black uppercase px-2 py-1 rounded-full shrink-0',
                                    settings.impactMetrics?.showDailyLitersHq !== false
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-neutral-200 text-neutral-600'
                                  )}
                                >
                                  {settings.impactMetrics?.showDailyLitersHq !== false ? 'Visible' : 'Hidden'}
                                </button>
                              </div>
                              <div className="w-full px-3 py-2 bg-white rounded-lg text-base font-black text-primary flex items-center justify-between tabular-nums">
                                <span>{formatNumber(liveLiters, 0)}+ L</span>
                                <span className="text-[10px] font-bold uppercase text-green-700">Live DB</span>
                              </div>
                              <textarea
                                rows={2}
                                value={impactCopy.litersDesc || ''}
                                onChange={e => updateHomepageContent('impact', prev => ({ ...prev, litersDesc: e.target.value }))}
                                className="w-full px-2.5 py-1.5 bg-white border-none rounded-lg text-[11px] font-medium resize-none"
                              />
                            </div>
                          </div>

                          {/* Footer Quick Actions & HQ Contacts */}
                          <div className="pt-4 border-t border-outline-variant/15 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                              Red Footer Quick Actions &amp; Official Contacts
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Wholesale Quick Action Label</label>
                                <input
                                  type="text"
                                  value={footerCopy.wholesaleCtaLabel || ''}
                                  onChange={e => updateHomepageContent('footer', prev => ({ ...prev, wholesaleCtaLabel: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Support Desk Prefix</label>
                                <input
                                  type="text"
                                  value={footerCopy.supportDeskPrefix || ''}
                                  onChange={e => updateHomepageContent('footer', prev => ({ ...prev, supportDeskPrefix: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Support Desk Phone</label>
                                <input
                                  type="text"
                                  value={settings.supportPhone || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, supportPhone: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">Official Email</label>
                                <input
                                  type="email"
                                  value={settings.supportEmail || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, supportEmail: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <label className="text-[10px] font-bold uppercase text-on-surface-variant">HQ Physical &amp; Postal Address</label>
                                <input
                                  type="text"
                                  value={settings.companyAddress || ''}
                                  onChange={e => updateSettingsDraft(prev => ({ ...prev, companyAddress: e.target.value }))}
                                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-xl text-xs font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Modal Footer */}
                  <div className="p-5 sm:p-6 border-t border-outline-variant/15 bg-surface-container-low flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <span className="text-xs text-on-surface-variant font-medium">
                      Changes are saved directly to the live Jamukaya database.
                    </span>
                    <div className="flex items-center gap-3 ml-auto">
                      <button
                        type="button"
                        onClick={() => setActiveSectionModalId(null)}
                        className="px-4 py-2.5 rounded-xl bg-white border border-outline-variant/20 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSavingHomepage}
                        onClick={() => handleSaveHomepage(undefined, true)}
                        className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50"
                      >
                        <Save size={15} />
                        {isSavingHomepage ? 'Saving Live...' : 'Save & Publish Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </form>
      )}

      {/* Dedicated System Settings Function */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Settings size={28} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">System Settings &amp; Branding</h2>
                  {hasUnsavedConfig && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Unsaved Changes
                    </span>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant">Global parameters, milk drop-off rates, official contacts, logos, and role permissions</p>
              </div>
            </div>
          </div>

          {settingsNotice && (
            <div
              className={cn(
                'p-4 rounded-xl border text-sm font-bold flex items-center justify-between',
                settingsNotice.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              )}
            >
              <span>{settingsNotice.text}</span>
              <button type="button" onClick={() => setSettingsNotice(null)} className="p-1">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Role Simulation for Admins */}
              {isActualAdmin && (
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                      <UserCog size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-amber-900">Role Simulation</h3>
                      <p className="text-xs text-amber-700">Test how the system looks for different roles</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => handleRoleOverride(null)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                        !profile.roleOverride ? "bg-amber-700 text-white shadow-md" : "bg-white text-amber-700 border border-amber-200"
                      )}
                    >
                      Default
                    </button>
                    {['Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Factory Clerk'].map(role => (
                      <button 
                        key={role}
                        onClick={() => handleRoleOverride(role)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                          profile.roleOverride === role ? "bg-amber-700 text-white shadow-md" : "bg-white text-amber-700 border border-amber-200"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 sm:p-8 space-y-8">
                {/* Core System & Rates */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Core System &amp; Official Contacts</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">System Name</label>
                      <input 
                        type="text" 
                        value={settings.systemName} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, systemName: e.target.value}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">Company Name</label>
                      <input 
                        type="text" 
                        value={settings.companyName} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, companyName: e.target.value}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">Milk Drop-Off Price (TSh / Liter)</label>
                      <input 
                        type="number" 
                        value={settings.milkPrice} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, milkPrice: Number(e.target.value)}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">MCC Support Desk Phone</label>
                      <input 
                        type="text" 
                        value={settings.supportPhone || ''} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, supportPhone: e.target.value}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">Support Email</label>
                      <input 
                        type="email" 
                        value={settings.supportEmail} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, supportEmail: e.target.value}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant">Wholesale Inquiries Email</label>
                      <input 
                        type="email" 
                        value={settings.wholesaleEmail || ''} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, wholesaleEmail: e.target.value}))}
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-on-surface-variant">Company / HQ Address</label>
                      <input 
                        type="text" 
                        value={settings.companyAddress || ''} 
                        onChange={e => updateSettingsDraft(prev => ({...prev, companyAddress: e.target.value}))}
                        placeholder="P.O Box 71. Ibadakuli, Mwanza Road, Shinyanya - Tanzania"
                        className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Appearance & Branding */}
                <div className="pt-6 border-t border-outline-variant/10 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Appearance &amp; Branding</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold">Standard Logo (Red — Top Nav Bar)</span>
                        <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'logoRed')} className="text-xs" />
                      </div>
                      {(settings.logoRed || settings.logoUrl) && <img src={settings.logoRed || settings.logoUrl} className="h-10 object-contain" />}
                    </div>
                    <div className="p-4 bg-red-600 rounded-xl">
                      <div className="flex justify-between items-center mb-4 text-white">
                        <span className="text-xs font-bold">Reverse Logo (White — Red Footer)</span>
                        <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'logoWhite')} className="text-xs" />
                      </div>
                      {(settings.logoWhite || settings.logoUrl) && <img src={settings.logoWhite || settings.logoUrl} className="h-10 object-contain" />}
                    </div>
                    <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold">Login Background Image</span>
                        <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'loginBgUrl')} className="text-xs" />
                      </div>
                      {settings.loginBgUrl && <img src={settings.loginBgUrl} className="h-20 w-full object-cover rounded-lg" />}
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-outline-variant/10">
                  <button 
                    type="submit" 
                    disabled={isSavingSettings}
                    className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50"
                  >
                    {isSavingSettings ? 'Saving System Settings...' : 'Save System Settings'}
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-6">
              {/* Role Permissions Section */}
              <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-6 space-y-6">
                <div className="flex items-center gap-2 text-indigo-600">
                  <Shield size={20} />
                  <h3 className="font-bold">Role Access</h3>
                </div>
                <select 
                  value={selectedRoleForPerms} 
                  onChange={e => setSelectedRoleForPerms(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm font-bold"
                >
                  {roles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>

                <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2 custom-scrollbar-light">
                  <h4 className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest">Page Visibility</h4>
                  {pages.map(page => (
                    <label key={page} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl cursor-pointer">
                      <span className="text-xs font-bold">{page}</span>
                      <input 
                        type="checkbox" 
                        checked={!!rolePermissions[selectedRoleForPerms]?.pages?.[page]}
                        onChange={() => togglePermission(selectedRoleForPerms, 'pages', page)}
                        className="rounded text-indigo-600"
                      />
                    </label>
                  ))}

                  <h4 className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest mt-6">Dashboard Functions</h4>
                  {widgets.map(widget => (
                    <label key={widget} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl cursor-pointer">
                      <span className="text-xs font-bold">{widget}</span>
                      <input 
                        type="checkbox" 
                        checked={!!rolePermissions[selectedRoleForPerms]?.dashboard?.[widget]}
                        onChange={() => togglePermission(selectedRoleForPerms, 'dashboard', widget)}
                        className="rounded text-indigo-600"
                      />
                    </label>
                  ))}
                </div>

                <button 
                  onClick={handleSavePermissions}
                  disabled={isSavingPerms}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg disabled:opacity-50"
                >
                  Save Access
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
