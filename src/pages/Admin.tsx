import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, query, where, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, Check, X, Shield, MapPin, Users, Edit2, Phone, Tag, ToggleLeft, ToggleRight, UserCog, Settings, Search, Truck, ChevronLeft, ChevronRight, FileText, BarChart3, ShieldCheck, Milk, AlertTriangle, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const [activeTab, setActiveTab] = useState<'users' | 'mccs' | 'drivers' | 'sellers' | 'settings'>((searchParams.get('tab') as any) || 'users');
  
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['users', 'mccs', 'drivers', 'sellers', 'settings'].includes(tab)) {
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
  const [settings, setSettings] = useState({ 
    milkPrice: 1200,
    systemName: 'Jambo MCC Management System',
    companyName: 'Jambo Food Products Limited',
    supportEmail: 'mtaniwambura@gmail.com',
    logoUrl: 'https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw',
    logoRed: '',
    logoWhite: '',
    favicon: '',
    loginBgUrl: 'https://picsum.photos/seed/factory/1920/1080'
  });
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<any>({});
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('Quality Controller');
  const [isSavingPerms, setIsSavingPerms] = useState(false);

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
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...snap.data() }));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global_config'));

    return () => { unsubUsers(); unsubMccs(); unsubSellers(); unsubSettings(); unsubDrivers(); };
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

  const handleAddMcc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'mccs'), {
        ...mccForm,
        name: mccForm.name.trim(),
        location: mccForm.location.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsAddingMcc(false);
      setMccForm({ name: '', location: '', status: 'Active', manager: '', qualityController: '', supervisor: '', fieldOfficer: '', driver: '', director: '', cashier: '' });
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
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'global_config'), settings);
      alert('Settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save settings.');
    } finally {
      setIsSavingSettings(false);
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
      setSettings(prev => ({ ...prev, [type]: reader.result as string }));
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
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div>
                <h2 className="text-2xl font-black tracking-tight">{selectedMcc ? 'Edit MCC' : 'Add New MCC'}</h2>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">{selectedMcc ? 'Update existing collection center' : 'Register a new collection center'}</p>
              </div>
              <button onClick={() => { setIsAddingMcc(false); setSelectedMcc(null); }} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={selectedMcc ? handleUpdateMcc : handleAddMcc} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">MCC Name</label>
                  <input 
                    placeholder="e.g. Kahama Main" 
                    value={selectedMcc ? (selectedMcc.name || '') : mccForm.name} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, name: e.target.value}) : setMccForm({...mccForm, name: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Location</label>
                  <input 
                    placeholder="e.g. Shinyanga" 
                    value={selectedMcc ? (selectedMcc.location || '') : mccForm.location} 
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, location: e.target.value}) : setMccForm({...mccForm, location: e.target.value})} 
                    className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Status</label>
                  <select
                    value={selectedMcc ? (selectedMcc.status || 'Active') : mccForm.status}
                    onChange={e => selectedMcc ? setSelectedMcc({...selectedMcc, status: e.target.value}) : setMccForm({...mccForm, status: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Active">Active</option>
                    <option value="Coming Soon">Coming Soon</option>
                    <option value="Planned">Planned</option>
                    <option value="Inactive">Inactive</option>
                  </select>
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

      {/* MCC Edit Modal */}
      {selectedMcc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Edit MCC Details</h2>
              <button onClick={() => setSelectedMcc(null)} className="p-1 hover:bg-surface-container-low rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateMcc} className="space-y-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">MCC Name</label>
                  <input 
                    value={selectedMcc.name} 
                    onChange={e => setSelectedMcc({...selectedMcc, name: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Location</label>
                  <input 
                    value={selectedMcc.location} 
                    onChange={e => setSelectedMcc({...selectedMcc, location: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Status</label>
                <select 
                  value={selectedMcc.status} 
                  onChange={e => setSelectedMcc({...selectedMcc, status: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                  <option value="Coming Soon">Coming Soon</option>
                  <option value="Planned">Planned</option>
                </select>
              </div>

              <div className="border-t border-outline-variant/10 pt-4 mt-4">
                <h3 className="text-xs font-black uppercase text-on-surface-variant tracking-widest mb-4">Assigned Personnel</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Manager', field: 'manager' },
                    { label: 'Cashier', field: 'cashier' },
                    { label: 'Quality Controller', field: 'qualityController' },
                    { label: 'Supervisor', field: 'supervisor' },
                    { label: 'Field Officer', field: 'fieldOfficer' },
                    { label: 'Director', field: 'director' },
                    { label: 'Driver', field: 'driver' },
                  ].map(role => (
                    <div key={role.field} className="space-y-1">
                      <label className="text-[10px] font-bold uppercase opacity-60">{role.label}</label>
                      <input 
                        value={selectedMcc[role.field] || ''} 
                        onChange={e => setSelectedMcc({...selectedMcc, [role.field]: e.target.value})}
                        className="w-full bg-surface-container-low border-none rounded-lg p-2 text-xs"
                        placeholder={`Assign ${role.label}...`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex gap-3 sticky bottom-0 bg-white pb-2">
                <button type="button" onClick={() => setSelectedMcc(null)} className="flex-1 px-4 py-2 font-bold text-on-surface-variant">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-bold shadow-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* System Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-outline-variant/20 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Settings size={28} />
              </div>
              <div>
                <h2 className="text-xl font-bold">System Configuration</h2>
                <p className="text-sm text-on-surface-variant">Global parameters and branding</p>
              </div>
            </div>
          </div>

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

              <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">System Name</label>
                    <input 
                      type="text" 
                      value={settings.systemName} 
                      onChange={e => setSettings({...settings, systemName: e.target.value})}
                      className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Company Name</label>
                    <input 
                      type="text" 
                      value={settings.companyName} 
                      onChange={e => setSettings({...settings, companyName: e.target.value})}
                      className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Support Email</label>
                    <input 
                      type="email" 
                      value={settings.supportEmail} 
                      onChange={e => setSettings({...settings, supportEmail: e.target.value})}
                      className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Milk Price (TSh)</label>
                    <input 
                      type="number" 
                      value={settings.milkPrice} 
                      onChange={e => setSettings({...settings, milkPrice: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Appearance & Branding</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold">Standard Logo (Red)</span>
                        <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'logoRed')} className="text-xs" />
                      </div>
                      {settings.logoRed && <img src={settings.logoRed} className="h-10 object-contain" />}
                    </div>
                    <div className="p-4 bg-red-600 rounded-xl">
                      <div className="flex justify-between items-center mb-4 text-white">
                        <span className="text-xs font-bold">Reverse Logo (White)</span>
                        <input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'logoWhite')} className="text-xs" />
                      </div>
                      {settings.logoWhite && <img src={settings.logoWhite} className="h-10 object-contain" />}
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
                    {isSavingSettings ? 'Saving...' : 'Save Configuration'}
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
