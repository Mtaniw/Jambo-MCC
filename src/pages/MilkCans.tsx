import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, Edit2, X, Save, Search, Filter, Milk, Package, ArrowRight, History, AlertTriangle, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { TypeAhead } from '../components/TypeAhead';
import { Modal } from '../components/Modal';

export default function MilkCans() {
  const { profile, effectiveRole } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isManagingInventory, setIsManagingInventory] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mccFilter, setMccFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inventoryMessage, setInventoryMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const hasCleanedUp = React.useRef(false);

  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const isGlobalViewer = isActualAdmin || (profile && ['Factory Clerk', 'Supervisor', 'Manager', 'Director', 'Viewer'].includes(effectiveRole as string));
  const canWrite = isActualAdmin || (profile && ['Cashier', 'Quality Controller', 'Supervisor'].includes(effectiveRole as string));

  const [formData, setFormData] = useState({
    mccId: '',
    sellerId: '',
    sellerName: '',
    phone: '',
    capacity: '30L',
    quantity: '1',
    dateIssued: getTanzaniaTodayStr(),
    status: 'Taken',
    remarks: ''
  });

  const [inventoryForm, setInventoryForm] = useState({
    mccId: '',
    capacity: '30L',
    totalQuantity: ''
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (inventoryForm.mccId && inventoryForm.capacity) {
      const existing = inventory.find(i => i.mccId === inventoryForm.mccId && i.capacity === inventoryForm.capacity);
      if (existing) {
        setInventoryForm(prev => ({ ...prev, totalQuantity: existing.totalQuantity.toString() }));
      } else {
        setInventoryForm(prev => ({ ...prev, totalQuantity: '' }));
      }
    }
  }, [inventoryForm.mccId, inventoryForm.capacity, inventory.length > 0]); // Trigger when inventory first loads

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0) {
        if (!formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id }));
        if (!inventoryForm.mccId) setInventoryForm(prev => ({ ...prev, mccId: list[0].id }));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
      setSellers(snapshot.docs.map(doc => {
        const data = doc.data();
        const smccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds: smccIds };
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    const unsubscribeInventory = onSnapshot(collection(db, 'milk_can_inventory'), (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'milk_can_inventory'));

    let constraints: any[] = [];
    if (startDate) constraints.push(where('dateIssued', '>=', startDate));
    if (endDate) constraints.push(where('dateIssued', '<=', endDate));

    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        constraints.push(where('mccId', 'in', profile.mccIds));
      } else {
        setRecords([]);
        setLoading(false);
        return;
      }
    }

    const q = query(collection(db, 'milk_cans'), ...constraints);

    let unsubscribeRecords = () => {};
    unsubscribeRecords = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(list);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'milk_cans'));

    return () => {
      unsubscribeMccs();
      unsubscribeSellers();
      unsubscribeInventory();
      unsubscribeRecords();
    };
  }, [profile, startDate, endDate]);

  // One-time cleanup for Sam Mahega from the entire system
  useEffect(() => {
    if (!profile || mccs.length === 0 || hasCleanedUp.current) return;

    const performCleanup = async () => {
      hasCleanedUp.current = true;
      const namesToDelete = ['Sam Mahega', 'Sama Mahega'];
      
      for (const name of namesToDelete) {
        // 1. Delete from milk_cans
        const cansQuery = query(collection(db, 'milk_cans'), where('sellerName', '==', name));
        const cansSnap = await getDocs(cansQuery);
        for (const d of cansSnap.docs) {
          const data = d.data();
          await deleteDoc(doc(db, 'milk_cans', d.id));
          // Update inventory after deletion
          const remaining = records.filter(r => r.id !== d.id);
          await updateInventoryAvailable(data.mccId, data.capacity, remaining);
        }

        // 2. Delete from sellers
        const sellersQuery = query(collection(db, 'sellers'), where('name', '==', name));
        const sellersSnap = await getDocs(sellersQuery);
        for (const d of sellersSnap.docs) {
          await deleteDoc(doc(db, 'sellers', d.id));
        }

        // 3. Delete from daily_register
        const registerQuery = query(collection(db, 'daily_register'), where('sellerName', '==', name));
        const registerSnap = await getDocs(registerQuery);
        for (const d of registerSnap.docs) {
          await deleteDoc(doc(db, 'daily_register', d.id));
        }

        // 4. Delete from rejects
        const rejectsQuery = query(collection(db, 'rejects'), where('sellerName', '==', name));
        const rejectsSnap = await getDocs(rejectsQuery);
        for (const d of rejectsSnap.docs) {
          await deleteDoc(doc(db, 'rejects', d.id));
        }

        // 5. Delete from expenses (if he was a recipient)
        const expensesQuery = query(collection(db, 'expenses'), where('recipient', '==', name));
        const expensesSnap = await getDocs(expensesQuery);
        for (const d of expensesSnap.docs) {
          await deleteDoc(doc(db, 'expenses', d.id));
        }
      }

      // 6. Specific Mariwanda 30L inventory fix (as requested previously)
      const mariwandaMcc = mccs.find(m => m.name.includes('Mariwanda'));
      if (mariwandaMcc) {
        const invDocId = `${mariwandaMcc.id}_30L`;
        const mccRecords = records.filter(r => r.mccId === mariwandaMcc.id && r.capacity === '30L' && !namesToDelete.includes(r.sellerName));
        const taken = mccRecords.filter(r => r.status === 'Taken').reduce((sum, r) => sum + Number(r.quantity), 0);
        const returned = mccRecords.filter(r => r.status === 'Returned').reduce((sum, r) => sum + Number(r.quantity), 0);
        const netIssued = taken - returned;
        
        await setDoc(doc(db, 'milk_can_inventory', invDocId), {
          mccId: mariwandaMcc.id,
          capacity: '30L',
          totalQuantity: 2,
          availableQuantity: 2 - netIssued,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    };

    performCleanup();
  }, [mccs, profile]);

  const handleSellerChange = (sellerId: string) => {
    const seller = sellers.find(s => s.id === sellerId);
    if (seller) {
      setFormData({
        ...formData,
        sellerId,
        sellerName: seller.name,
        phone: seller.phone || ''
      });
    } else {
      setFormData({
        ...formData,
        sellerId: '',
        sellerName: '',
        phone: ''
      });
    }
  };

  const updateInventoryAvailable = async (mccId: string, capacity: string, currentRecords?: any[]) => {
    if (!mccId || !capacity) return;
    
    // Use provided records or state records
    const sourceRecords = currentRecords || records;
    
    // Calculate available quantity
    const mccRecords = sourceRecords.filter(r => r.mccId === mccId && r.capacity === capacity);
    const taken = mccRecords.filter(r => r.status === 'Taken').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const returned = mccRecords.filter(r => r.status === 'Returned').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const netIssued = taken - returned;
    
    const invDocId = `${mccId}_${capacity}`;
    const invRef = doc(db, 'milk_can_inventory', invDocId);
    
    try {
      const invSnap = await getDocs(query(collection(db, 'milk_can_inventory'), where('mccId', '==', mccId), where('capacity', '==', capacity)));
      
      let totalQuantity = 0;
      if (!invSnap.empty) {
        totalQuantity = Number(invSnap.docs[0].data().totalQuantity || 0);
      }

      await setDoc(invRef, { 
        mccId,
        capacity,
        totalQuantity,
        availableQuantity: totalQuantity - netIssued,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("Error updating inventory available:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;

    const data = {
      ...formData,
      quantity: Number(formData.quantity),
      issuedBy: profile?.fullName || profile?.email || 'System',
      updatedAt: new Date().toISOString()
    };

    try {
      let newRecords = [...records];
      if (editingId) {
        await updateDoc(doc(db, 'milk_cans', editingId), data);
        newRecords = records.map(r => r.id === editingId ? { ...r, ...data } : r);
        setEditingId(null);
      } else {
        const docRef = await addDoc(collection(db, 'milk_cans'), { ...data, createdAt: new Date().toISOString() });
        newRecords = [...records, { id: docRef.id, ...data }];
      }
      
      // Update inventory using the predicted state to avoid race conditions with onSnapshot
      await updateInventoryAvailable(formData.mccId, formData.capacity, newRecords);
      
      setIsAdding(false);
      setFormData({ ...formData, sellerId: '', sellerName: '', phone: '', quantity: '1', remarks: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'milk_cans');
    }
  };

  const handleInventorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || isSubmitting) return;

    setInventoryMessage(null);
    setIsSubmitting(true);

    const invDocId = `${inventoryForm.mccId}_${inventoryForm.capacity}`;
    const total = Number(inventoryForm.totalQuantity);
    
    if (!inventoryForm.mccId) {
      setInventoryMessage({ type: 'error', text: 'Please select an MCC' });
      setIsSubmitting(false);
      return;
    }

    // Calculate current net issued
    const mccRecords = records.filter(r => r.mccId === inventoryForm.mccId && r.capacity === inventoryForm.capacity);
    const taken = mccRecords.filter(r => r.status === 'Taken').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const returned = mccRecords.filter(r => r.status === 'Returned').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const netIssued = taken - returned;

    const data = {
      mccId: inventoryForm.mccId,
      capacity: inventoryForm.capacity,
      totalQuantity: total,
      availableQuantity: total - netIssued,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'milk_can_inventory', invDocId), data);
      setInventoryMessage({ type: 'success', text: 'Stock updated successfully!' });
      setTimeout(() => {
        setIsManagingInventory(false);
        setInventoryMessage(null);
      }, 2000);
    } catch (error: any) {
      console.error("Inventory update error:", error);
      const errorDetail = error?.message || 'Network timeout or permission denied';
      setInventoryMessage({ 
        type: 'error', 
        text: `Failed to update stock: ${errorDetail}. Please check your internet connection.` 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const matchesSearch = rec.sellerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           rec.driverName?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
      const matchesStatus = statusFilter === 'all' || rec.status === statusFilter;
      return matchesSearch && matchesMcc && matchesStatus;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [records, searchTerm, mccFilter, statusFilter]);

  const summary = records.reduce((acc, rec) => {
    const cap = rec.capacity || '30L';
    if (!acc[cap]) acc[cap] = { taken: 0, returned: 0, total: 0 };
    
    const qty = Number(rec.quantity) || 0;
    if (rec.status === 'Taken') {
      acc[cap].taken += qty;
      acc.totalIssued += qty;
    } else {
      acc[cap].returned += qty;
      acc.totalReturned += qty;
    }
    acc[cap].total += qty;
    return acc;
  }, { totalIssued: 0, totalReturned: 0 } as any);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      {!isOnline && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold animate-pulse flex items-center gap-2">
          <AlertTriangle size={14} /> You are currently offline. Changes may not be saved.
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Milk Cans Issued</h1>
          <p className="text-on-surface-variant text-sm">Track milk containers provided to sellers</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <button 
                onClick={() => setIsManagingInventory(!isManagingInventory)} 
                className="bg-surface-container-high text-primary px-4 py-2 rounded-lg font-bold flex items-center gap-2 border border-primary/20"
              >
                {isManagingInventory ? <X size={18} /> : <Package size={18} />} {isManagingInventory ? 'Cancel' : 'Manage Inventory'}
              </button>
              <button 
                onClick={() => setIsAdding(!isAdding)} 
                className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg"
              >
                {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Issue Can'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inventory Management Modal */}
      <Modal
        isOpen={isManagingInventory}
        onClose={() => {
          setIsManagingInventory(false);
          setInventoryMessage(null);
        }}
        title="Milk Can Master Stock Management"
        icon={<Package size={20} />}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleInventorySubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">MCC Station</label>
              <select 
                value={inventoryForm.mccId} 
                onChange={e => setInventoryForm({...inventoryForm, mccId: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all" 
                required
              >
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Can Capacity</label>
              <select 
                value={inventoryForm.capacity} 
                onChange={e => setInventoryForm({...inventoryForm, capacity: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all"
              >
                <option value="30L">30L</option>
                <option value="50L">50L</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Total Owned Stock Qty</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={inventoryForm.totalQuantity} 
                  onChange={e => setInventoryForm({...inventoryForm, totalQuantity: e.target.value})} 
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                  placeholder="Total cans in system"
                  required 
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase tracking-widest">CANS</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Calculated Availability</label>
              <div className="h-11 flex items-center px-4 bg-primary/5 rounded-xl border border-primary/10">
                <span className="text-sm font-black text-primary">
                  {inventory.find(i => i.mccId === inventoryForm.mccId && i.capacity === inventoryForm.capacity)?.availableQuantity || 0} Cans Available
                </span>
              </div>
            </div>
          </div>

          {inventoryMessage && (
            <div className={cn(
              "p-4 rounded-xl text-xs font-black text-center uppercase tracking-widest",
              inventoryMessage.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700 font-bold normal-case tracking-normal"
            )}>
              {inventoryMessage.text}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            <button 
              type="button" 
              onClick={() => setIsManagingInventory(false)}
              className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest"
            >
              Close
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest flex items-center gap-2"
            >
              <Check size={18} />
              {isSubmitting ? 'Updating...' : 'Update Stock'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Prominent Summary Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-600 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Total Cans Taken</h2>
            <p className="text-4xl font-black">{summary.totalIssued}</p>
            <p className="text-[10px] mt-2 opacity-60">Gross quantity issued to sellers</p>
          </div>
          <Milk className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 rotate-12" />
        </div>

        <div className="bg-green-600 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Total Cans Returned</h2>
            <p className="text-4xl font-black">{summary.totalReturned}</p>
            <p className="text-[10px] mt-2 opacity-60">Gross quantity returned to MCCs</p>
          </div>
          <History className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 rotate-12" />
        </div>

        <div className="bg-primary text-white p-6 rounded-2xl shadow-xl flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Net Cans with Sellers</h2>
            <p className="text-4xl font-black">{summary.totalIssued - summary.totalReturned}</p>
            <p className="text-[10px] mt-2 opacity-60">Currently outstanding in the field</p>
          </div>
          <Package className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 rotate-12" />
        </div>
      </div>

      {/* Inventory & Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['30L', '50L'].map(cap => {
          const data = summary[cap] || { taken: 0, returned: 0, total: 0 };
          const inv = inventory.find(i => i.capacity === cap && (mccFilter === 'all' ? true : i.mccId === mccFilter));
          const totalStock = inventory.filter(i => i.capacity === cap && (mccFilter === 'all' ? true : i.mccId === mccFilter)).reduce((sum, i) => sum + Number(i.totalQuantity), 0);
          const availableStock = inventory.filter(i => i.capacity === cap && (mccFilter === 'all' ? true : i.mccId === mccFilter)).reduce((sum, i) => sum + Number(i.availableQuantity), 0);

          return (
            <div key={cap} className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                  <Milk size={16} /> {cap} Capacity {mccFilter !== 'all' ? `(${mccs.find(m => m.id === mccFilter)?.name})` : 'Global'}
                </h3>
                <div className="flex gap-2">
                  <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                    Stock: {totalStock}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                    availableStock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>
                    Available: {availableStock}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
                  <p className="text-[10px] uppercase font-bold text-amber-700 opacity-70">Taken</p>
                  <p className="text-lg font-bold text-amber-700">{data.taken}</p>
                </div>
                <div className="bg-green-50 p-2 rounded-lg border border-green-100">
                  <p className="text-[10px] uppercase font-bold text-green-700 opacity-70">Returned</p>
                  <p className="text-lg font-bold text-green-700">{data.returned}</p>
                </div>
                <div className="bg-blue-50 p-2 rounded-lg border border-blue-100">
                  <p className="text-[10px] uppercase font-bold text-blue-700 opacity-70">Net Issued</p>
                  <p className="text-lg font-bold text-blue-700">{data.taken - data.returned}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
          <input 
            placeholder="Search seller..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm"
          />
        </div>
        {isGlobalViewer && (
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-on-surface-variant" />
            <select 
              value={mccFilter} 
              onChange={e => setMccFilter(e.target.value)}
              className="bg-surface-container-low border-none rounded-lg text-sm"
            >
              <option value="all">All MCCs</option>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-on-surface-variant" />
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-surface-container-low border-none rounded-lg text-sm"
          >
            <option value="all">All Status</option>
            <option value="Taken">Taken</option>
            <option value="Returned">Returned</option>
          </select>
        </div>
      </div>

      {/* Issuing Form Modal */}
      <Modal
        isOpen={isAdding}
        onClose={() => {
          setIsAdding(false);
          setEditingId(null);
          setFormData({ ...formData, sellerId: '', sellerName: '', phone: '', quantity: '1', remarks: '' });
        }}
        title={editingId ? "Update Milk Can Record" : "Issue Milk Can to Supplier"}
        icon={<Milk size={20} />}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">MCC Station</label>
              <select 
                value={formData.mccId} 
                onChange={e => setFormData({...formData, mccId: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all" 
                required
              >
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <DateInput 
                value={formData.dateIssued} 
                onChange={val => setFormData({...formData, dateIssued: val})}
                label="Date Issued"
              />
            </div>
            <div className="space-y-1 text-xs">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Seller / Supplier</label>
              <TypeAhead
                items={sellers.filter(s => (s.mccIds && s.mccIds.includes(formData.mccId)) || !formData.mccId)}
                onSelect={(seller) => {
                  setFormData({
                    ...formData,
                    sellerId: seller.id,
                    sellerName: seller.name,
                    phone: seller.phone || ''
                  });
                }}
                onClear={() => {
                  setFormData({
                    ...formData,
                    sellerId: '',
                    sellerName: '',
                    phone: ''
                  });
                }}
                labelExtractor={(s) => s.name}
                subLabelExtractor={(s) => {
                  if (!s.mccIds || s.mccIds.length === 0) return 'No MCC';
                  return s.mccIds.map((id: string) => mccs.find(m => m.id === id)?.name).filter(Boolean).join(', ');
                }}
                placeholder="Type to search seller..."
                defaultValue={formData.sellerName}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Supplier Phone</label>
              <input placeholder="---" value={formData.phone} readOnly className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black opacity-40 cursor-not-allowed" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Can Capacity</label>
              <select value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black">
                <option value="30L">30L</option>
                <option value="50L">50L</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Quantity Issued</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={formData.quantity} 
                  onChange={e => setFormData({...formData, quantity: e.target.value})} 
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                  required 
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase tracking-widest">CANS</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Movement Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className={cn(
                "w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-colors",
                formData.status === 'Taken' ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50"
              )}>
                <option value="Taken">🟠 TAKEN</option>
                <option value="Returned">🟢 RETURNED</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Additional Remarks</label>
            <textarea value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-20 p-4 font-medium" placeholder="Condition of can upon issue/return..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            <button 
              type="button" 
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all uppercase text-[10px] tracking-widest flex items-center gap-2"
            >
              <Check size={18} /> {editingId ? 'Update Record' : 'Save Record'}
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            <tr>
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">MCC</th>
              <th className="px-6 py-3">Seller</th>
              <th className="px-6 py-3">Capacity</th>
              <th className="px-6 py-3">Qty</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {filteredRecords.sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime()).map((rec, index) => (
              <tr key={rec.id} className="hover:bg-surface-container-lowest transition-colors">
                <td className="px-6 py-4 text-xs font-bold opacity-40">{index + 1}</td>
                <td className="px-6 py-4 text-sm">{safeFormat(rec.dateIssued, 'dd/MM/yyyy')}</td>
                <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === rec.mccId)?.name || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm">
                  <div className="font-bold">{rec.sellerName}</div>
                  <div className="text-xs opacity-60">{rec.phone}</div>
                </td>
                <td className="px-6 py-4 text-sm">{rec.capacity}</td>
                <td className="px-6 py-4 text-sm font-bold">{rec.quantity}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    rec.status === 'Taken' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                  )}>
                    {rec.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {canWrite && (
                      <>
                        <button onClick={() => { setEditingId(rec.id); setFormData(rec); setIsAdding(true); }} className="p-1 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                        <button onClick={async () => { 
                          if(window.confirm('Delete this record?')) { 
                            await deleteDoc(doc(db, 'milk_cans', rec.id)); 
                            const remainingRecords = records.filter(r => r.id !== rec.id);
                            await updateInventoryAvailable(rec.mccId, rec.capacity, remainingRecords); 
                          } 
                        }} className="p-1 hover:text-error transition-colors"><Trash2 size={16} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRecords.length === 0 && (
          <div className="text-center py-20">
            <Milk className="mx-auto text-outline-variant mb-4" size={48} />
            <p className="text-on-surface-variant">No milk can records found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
