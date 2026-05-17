import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, query, where, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, Check, X, Shield, MapPin, Users, Edit2, Phone, Tag, ToggleLeft, ToggleRight, UserCog, Settings, Search, Truck, ChevronLeft, ChevronRight, FileText, BarChart3, ShieldCheck, Milk, AlertTriangle, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Admin() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [isAddingMcc, setIsAddingMcc] = useState(false);
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [isAddingSeller, setIsAddingSeller] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [settings, setSettings] = useState({ 
    milkPrice: 1200,
    systemName: 'Jambo MCC Management System',
    companyName: 'Jambo Food Products Limited',
    supportEmail: 'mtaniwambura@gmail.com',
    logoUrl: 'https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw',
    logoRed: '',
    logoWhite: '',
    favicon: ''
  });
  const [firestoreRules, setFirestoreRules] = useState('');
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<any>({});
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState('Quality Controller');
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  const roles = ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Factory Clerk', 'Viewer'];
  const pages = ['Daily Register', 'Factory Intake', 'Truck & QA', 'Rejects', 'Dashboard', 'Expenses', 'Funds', 'Milk Cans', 'Reports', 'Sellers', 'Admin'];
  const widgets = [
    'Total Litres', 'Total Paid', 'Total Unpaid', 'Station Expenses', 
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
    const unsubRules = onSnapshot(doc(db, 'settings', 'firestore_rules'), (snap) => {
      if (snap.exists()) {
        setFirestoreRules(snap.data().rules || '');
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/firestore_rules'));
    return () => { unsubUsers(); unsubMccs(); unsubSellers(); unsubSettings(); unsubDrivers(); unsubRules(); };
  }, [profile]);

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
      await addDoc(collection(db, 'mccs'), { ...mccForm, createdAt: new Date().toISOString() });
      setIsAddingMcc(false);
      setMccForm({ name: '', location: '', status: 'Active', manager: '', qualityController: '', supervisor: '', fieldOfficer: '', driver: '', director: '', cashier: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'mccs');
      alert('Failed to add MCC.');
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

  const handleSaveRules = async () => {
    setIsSavingRules(true);
    try {
      await setDoc(doc(db, 'settings', 'firestore_rules'), { rules: firestoreRules, updatedAt: new Date().toISOString() });
      alert('Firestore rules saved to database! Note: Actual deployment requires Firebase CLI.');
    } catch (err) {
      console.error('Error saving rules:', err);
      alert('Failed to save rules.');
    } finally {
      setIsSavingRules(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logoRed' | 'logoWhite' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 500 * 1024) {
      alert('File is too large. Please upload an image under 500KB.');
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Admin Control Panel</h1>
          <p className="text-on-surface-variant text-sm">Manage users, collection centers, and supplier directory</p>
        </div>
          <div className="bg-white p-2 rounded-lg shadow-sm border border-outline-variant/10">
            <img 
              src={settings.logoUrl || "https://lh3.googleusercontent.com/aida/ADBb0uiCdrgZRYj1Imqfwxw4sPIxAsPSjWWx9Pr0aWPDVa5-_Rm1bTwdZ2TLFhW-9ZAB_si9aC0BQ7OWnieEDClcJUNnVYZzCYGEOjCz46Rk3kz9jlvRTOYiGQbxtD6JkkLePDVYyPSa7uVt_Pn-CX089J9DKeBzfM7WtFQYcyTlaKUlN2Wwq8U5CzbopOmTC6RxHGJ2jHxaMWLhsCZWoJszc9TiUnsh8yKObLs_z8gAyDRt_1eCr6CAfRAoctphD9HyqNGn5mbYYfZvzw"} 
              alt="Jambo Group" 
              className="h-10 w-auto object-contain" 
              referrerPolicy="no-referrer"
            />
          </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-outline-variant/20 overflow-x-auto no-scrollbar">
        {[
          { id: 'users', name: 'User Management', icon: Shield },
          { id: 'mccs', name: 'MCC Management', icon: MapPin },
          { id: 'drivers', name: 'Drivers Management', icon: Truck },
          { id: 'sellers', name: 'Seller Directory', icon: Users },
          { id: 'settings', name: 'System Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap",
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <tab.icon size={18} />
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
                            {mccs.find(m => m.id === id)?.name || id}
                          </span>
                        ))}
                        {(!user.mccIds || user.mccIds.length === 0) && <span className="text-[9px] opacity-40 italic">None</span>}
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
          <div className="flex justify-end">
            <button onClick={() => setIsAddingMcc(true)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              <Plus size={18} /> Add MCC
            </button>
          </div>
          {isAddingMcc && (
            <form onSubmit={handleAddMcc} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <input placeholder="MCC Name" value={mccForm.name} onChange={e => setMccForm({...mccForm, name: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <input placeholder="Location" value={mccForm.location} onChange={e => setMccForm({...mccForm, location: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2" required />
              <select value={mccForm.status} onChange={e => setMccForm({...mccForm, status: e.target.value})} className="bg-surface-container-low border-none rounded-lg p-2">
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
                <option value="Coming Soon">Coming Soon</option>
                <option value="Planned">Planned</option>
              </select>
              <div className="flex gap-2 lg:col-span-3 justify-end">
                <button type="button" onClick={() => setIsAddingMcc(false)} className="px-4 py-2">Cancel</button>
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-lg font-bold">Save MCC</button>
              </div>
            </form>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mccs.map(mcc => (
              <div key={mcc.id} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg">{mcc.name}</h3>
                  <select 
                    value={mcc.status} 
                    onChange={e => handleUpdateMccField(mcc.id, 'status', e.target.value)}
                    className="text-[10px] font-bold uppercase bg-surface-container-low px-2 py-1 rounded border-none focus:ring-0 cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                    <option value="Coming Soon">Coming Soon</option>
                    <option value="Planned">Planned</option>
                  </select>
                </div>
                <div className="space-y-3 text-sm text-on-surface-variant">
                  <p className="flex items-center gap-2"><MapPin size={14} /> {mcc.location}</p>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/10">
                    {[
                      { label: 'Manager', field: 'manager' },
                      { label: 'Cashier', field: 'cashier' },
                      { label: 'Quality Controller', field: 'qualityController' },
                      { label: 'Supervisor', field: 'supervisor' },
                      { label: 'Field Officer', field: 'fieldOfficer' },
                      { label: 'Driver', field: 'driver' },
                      { label: 'Director', field: 'director' },
                    ].map(role => (
                      <div key={role.field} className="space-y-1">
                        <label className="text-[10px] font-bold uppercase opacity-60">{role.label}</label>
                        <input 
                          value={mcc[role.field] || ''} 
                          onChange={e => handleUpdateMccField(mcc.id, role.field, e.target.value)}
                          placeholder="Name..."
                          className="w-full text-xs bg-surface-container-low border-none rounded p-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
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
            <button onClick={() => setIsAddingSeller(true)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 whitespace-nowrap">
              <Plus size={18} /> Add Seller
            </button>
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
        <div className="space-y-8">
          {/* Role Simulation for Admins */}
          {profile?.role === 'Admin' && (
            <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                  <UserCog size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-amber-900">Admin Role Simulation</h3>
                  <p className="text-xs text-amber-700">Temporarily simulate another role to test permissions and views.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleRoleOverride(null)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    !profile.roleOverride ? "bg-amber-600 text-white shadow-md" : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-100"
                  )}
                >
                  Default (Admin)
                </button>
                {['Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Factory Clerk'].map(role => (
                  <button 
                    key={role}
                    onClick={() => handleRoleOverride(role)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                      profile.roleOverride === role ? "bg-amber-600 text-white shadow-md" : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-100"
                    )}
                  >
                    Simulate {role}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-2xl bg-white rounded-xl border border-outline-variant/20 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">System Configuration</h2>
              <p className="text-sm text-on-surface-variant">Manage global parameters for the entire system</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface">System Name</label>
                <input 
                  type="text" 
                  value={settings.systemName} 
                  onChange={e => setSettings({...settings, systemName: e.target.value})}
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface">Company Name</label>
                <input 
                  type="text" 
                  value={settings.companyName} 
                  onChange={e => setSettings({...settings, companyName: e.target.value})}
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface">Support Email</label>
                <input 
                  type="email" 
                  value={settings.supportEmail} 
                  onChange={e => setSettings({...settings, supportEmail: e.target.value})}
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface">
                  Global Milk Price (TSh per Litre)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">TSh</span>
                  <input 
                    type="number" 
                    value={settings.milkPrice} 
                    onChange={e => setSettings({...settings, milkPrice: Number(e.target.value)})}
                    className="w-full pl-14 pr-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-on-surface">Logo & Favicon Settings</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 space-y-3">
                    <p className="text-xs font-bold uppercase opacity-60">Red Logo (for white areas)</p>
                    <input 
                      type="file" 
                      accept=".png,.svg" 
                      onChange={e => handleFileUpload(e, 'logoRed')}
                      className="text-xs w-full"
                    />
                    {settings.logoRed && (
                      <div className="mt-2 p-2 bg-white rounded-lg border border-outline-variant/10 inline-block shadow-sm">
                        <img src={settings.logoRed} alt="Red Logo Preview" className="h-10 w-auto object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-red-600 rounded-xl border border-red-700 space-y-3">
                    <p className="text-xs font-bold uppercase text-white/60">White Logo (for red areas)</p>
                    <input 
                      type="file" 
                      accept=".png,.svg" 
                      onChange={e => handleFileUpload(e, 'logoWhite')}
                      className="text-xs w-full text-white"
                    />
                    {settings.logoWhite && (
                      <div className="mt-2 p-2 bg-white/10 rounded-lg border border-white/10 inline-block shadow-sm">
                        <img src={settings.logoWhite} alt="White Logo Preview" className="h-10 w-auto object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 space-y-3">
                    <p className="text-xs font-bold uppercase opacity-60">Favicon (Browser Icon)</p>
                    <input 
                      type="file" 
                      accept=".png,.ico,.svg" 
                      onChange={e => handleFileUpload(e, 'favicon')}
                      className="text-xs w-full"
                    />
                    {settings.favicon && (
                      <div className="mt-2 p-2 bg-white rounded-lg border border-outline-variant/10 inline-block shadow-sm">
                        <img src={settings.favicon} alt="Favicon Preview" className="h-6 w-6 object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-on-surface">Fallback Logo URL</label>
                <input 
                  type="text" 
                  value={settings.logoUrl || ''} 
                  onChange={e => setSettings({...settings, logoUrl: e.target.value})}
                  className="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20"
                  placeholder="https://example.com/logo.png"
                />
              </div>
            </div>

            <p className="text-xs text-on-surface-variant italic">These settings will be applied globally across the entire system. Changes are immediate after saving.</p>

            <div className="pt-4">
              <button 
                type="submit" 
                disabled={isSavingSettings}
                className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSavingSettings ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
          </div>

          {/* Firestore Rules Editor */}
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-amber-100 rounded-xl text-amber-700">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Firestore Security Rules</h2>
                <p className="text-sm text-on-surface-variant">View and edit database security rules (Reference Only)</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                <div className="flex items-center gap-2 mb-2 text-amber-700">
                  <AlertTriangle size={16} />
                  <p className="text-xs font-bold uppercase tracking-wider">Warning</p>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Changes saved here are stored in the database for reference. In a production environment, 
                  actual rule deployment must be done via the Firebase CLI or Console.
                </p>
              </div>

              <textarea 
                value={firestoreRules}
                onChange={e => setFirestoreRules(e.target.value)}
                className="w-full h-[400px] font-mono text-xs p-4 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary/20"
                placeholder="service cloud.firestore { ... }"
              />

              <div className="pt-4">
                <button 
                  onClick={handleSaveRules}
                  disabled={isSavingRules}
                  className="w-full bg-amber-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-amber-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingRules ? 'Saving Rules...' : 'Save Rules to Database'}
                </button>
              </div>
            </div>
          </div>

          {/* Role Permissions Management */}
          <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-indigo-100 rounded-xl text-indigo-700">
                <Shield size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Role Permissions</h2>
                <p className="text-sm text-on-surface-variant">Configure granular access for each user role</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl">
                <label className="text-sm font-bold whitespace-nowrap">Select Role to Configure:</label>
                <select 
                  value={selectedRoleForPerms} 
                  onChange={e => setSelectedRoleForPerms(e.target.value)}
                  className="flex-1 bg-white border border-outline-variant/30 rounded-lg p-2 text-sm font-bold"
                >
                  {roles.map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Page Access */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                    <FileText size={16} /> Page Access
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {pages.map(page => (
                      <label key={page} className="flex items-center justify-between p-3 rounded-lg border border-outline-variant/10 hover:bg-surface-container-lowest cursor-pointer transition-colors">
                        <span className="text-sm font-medium">{page}</span>
                        <input 
                          type="checkbox" 
                          checked={!!rolePermissions[selectedRoleForPerms]?.pages?.[page]}
                          onChange={() => togglePermission(selectedRoleForPerms, 'pages', page)}
                          className="w-5 h-5 rounded text-primary focus:ring-primary"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Dashboard Widgets */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                    <BarChart3 size={16} /> Dashboard Widgets
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {widgets.map(widget => (
                      <label key={widget} className="flex items-center justify-between p-3 rounded-lg border border-outline-variant/10 hover:bg-surface-container-lowest cursor-pointer transition-colors">
                        <span className="text-sm font-medium">{widget}</span>
                        <input 
                          type="checkbox" 
                          checked={!!rolePermissions[selectedRoleForPerms]?.dashboard?.[widget]}
                          onChange={() => togglePermission(selectedRoleForPerms, 'dashboard', widget)}
                          className="w-5 h-5 rounded text-primary focus:ring-primary"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-outline-variant/10">
                <button 
                  onClick={handleSavePermissions}
                  disabled={isSavingPerms}
                  className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingPerms ? 'Saving...' : 'Save Role Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
