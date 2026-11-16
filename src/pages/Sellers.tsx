import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, Edit2, Search, Filter, Users, Phone, MapPin, Tag, X, Check, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Modal } from '../components/Modal';

export default function Sellers() {
  const { profile, effectiveRole } = useAuth();
  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const canWrite = isActualAdmin || (profile && ['Cashier', 'Supervisor', 'Manager', 'Director', 'Quality Controller'].includes(effectiveRole as string));
  const [sellers, setSellers] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [mccFilter, setMccFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    location: '',
    category: 'Farmer',
    mccIds: [] as string[],
    active: true
  });

  useEffect(() => {
    if (!profile) return;

    const unsubMccs = onSnapshot(collection(db, 'mccs'), (snap) => {
      setMccs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    let sellersQuery = query(collection(db, 'sellers'));
    if (profile.role !== 'Super User' && profile.role !== 'Admin' && profile.mccIds?.length > 0) {
      sellersQuery = query(collection(db, 'sellers'), where('mccIds', 'array-contains-any', profile.mccIds));
    }

    const unsubSellers = onSnapshot(sellersQuery, (snap) => {
      setSellers(snap.docs.map(doc => {
        const data = doc.data();
        // Migrating old data: if mccId exists and mccIds doesn't, convert to array
        const mccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds };
      }));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    return () => { unsubMccs(); unsubSellers(); };
  }, [profile]);

  const filteredSellers = useMemo(() => {
    return sellers.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           s.phone.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'active' ? s.active !== false : s.active === false);
      const matchesMcc = mccFilter === 'all' || (s.mccIds && s.mccIds.includes(mccFilter));
      return matchesSearch && matchesStatus && matchesMcc;
    });
  }, [sellers, searchTerm, statusFilter, mccFilter]);

  const handleAddSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'sellers'), { 
        ...formData, 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsAdding(false);
      setFormData({ name: '', phone: '', location: '', category: 'Farmer', mccIds: [], active: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sellers');
    }
  };

  const handleUpdateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeller) return;
    try {
      await updateDoc(doc(db, 'sellers', selectedSeller.id), {
        ...selectedSeller,
        updatedAt: new Date().toISOString()
      });
      setSelectedSeller(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'sellers');
    }
  };

  const handleDeleteSeller = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this seller?')) return;
    try {
      await deleteDoc(doc(db, 'sellers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'sellers');
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-on-surface tracking-tighter">Seller Directory</h1>
          <p className="text-on-surface-variant font-medium mt-1">Manage registered milk suppliers</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all"
        >
          <Plus size={20} /> Add Seller
        </button>
      </div>

      {/* Filters- Branded rounded-2xl */}
      <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/20 shadow-sm flex flex-wrap gap-6 items-end">
        <div className="flex-1 min-w-[280px]">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-2 block ml-1">Search Sellers</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={20} />
            <input 
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-surface-container-low border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="w-40">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Status</label>
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value as any)}
            className="w-full p-2 bg-surface-container-low border-none rounded-lg text-sm font-bold"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">MCC</label>
          <select 
            value={mccFilter} 
            onChange={e => setMccFilter(e.target.value)}
            className="w-full p-2 bg-surface-container-low border-none rounded-lg text-sm font-bold"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              <tr>
                <th className="px-6 py-3">#</th>
                <th className="px-6 py-3">Seller Name</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">MCC(s)</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredSellers.map((seller, index) => (
                <tr key={seller.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-bold">{seller.name}</td>
                  <td className="px-6 py-4 text-sm">{seller.phone}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {seller.mccIds && seller.mccIds.length > 0 ? (
                        seller.mccIds.map((id: string) => (
                          <span key={id} className="bg-surface-container-high px-2 py-0.5 rounded text-[10px] font-medium">
                            {mccs.find(m => m.id === id)?.name || 'Unknown'}
                          </span>
                        ))
                      ) : (
                        <span className="text-error italic text-xs">No MCC assigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{seller.category}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      seller.active !== false ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {seller.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       {canWrite && <button onClick={() => setSelectedSeller(seller)} className="p-1 text-primary hover:bg-primary/5 rounded"><Edit2 size={16} /></button>}
                       {isActualAdmin && <button onClick={() => handleDeleteSeller(seller.id)} className="p-1 text-error hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSellers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant italic">No sellers found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals handled via Universal Modal Component */}
      <Modal
        isOpen={isAdding || !!selectedSeller}
        onClose={() => {
          setIsAdding(false);
          setSelectedSeller(null);
          setFormData({ name: '', phone: '', location: '', category: 'Farmer', mccIds: [], active: true });
        }}
        title={selectedSeller ? "Edit Seller Details" : "Add New Seller Supplier"}
        icon={<Users size={20} />}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={selectedSeller ? handleUpdateSeller : handleAddSeller} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Supplier Full Name</label>
              <input 
                value={selectedSeller ? selectedSeller.name : formData.name} 
                onChange={e => selectedSeller 
                  ? setSelectedSeller({...selectedSeller, name: e.target.value})
                  : setFormData({...formData, name: e.target.value})}
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all" 
                required
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Phone Number</label>
              <input 
                value={selectedSeller ? selectedSeller.phone : formData.phone} 
                onChange={e => selectedSeller
                  ? setSelectedSeller({...selectedSeller, phone: e.target.value})
                  : setFormData({...formData, phone: e.target.value})}
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all" 
                required
                placeholder="+255..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Supplier Category</label>
              <select 
                value={selectedSeller ? selectedSeller.category : formData.category} 
                onChange={e => selectedSeller
                  ? setSelectedSeller({...selectedSeller, category: e.target.value})
                  : setFormData({...formData, category: e.target.value})}
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all"
              >
                <option value="Farmer">Farmer</option>
                <option value="Cooperative">Cooperative</option>
                <option value="Agent">Agent</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Status</label>
              <div className="flex items-center h-11 bg-surface-container-low rounded-xl px-4">
                <label className="flex items-center gap-3 cursor-pointer w-full group">
                  <input 
                    type="checkbox" 
                    checked={selectedSeller ? selectedSeller.active : formData.active} 
                    onChange={e => selectedSeller
                      ? setSelectedSeller({...selectedSeller, active: e.target.checked})
                      : setFormData({...formData, active: e.target.checked})}
                    className="w-5 h-5 rounded-md border-outline-variant text-primary focus:ring-primary/20 transition-all"
                  />
                  <span className={cn(
                    "text-xs font-black uppercase tracking-widest transition-colors",
                    (selectedSeller ? selectedSeller.active : formData.active) ? "text-green-600" : "text-amber-600"
                  )}>
                    {(selectedSeller ? selectedSeller.active : formData.active) ? 'Active Supplier' : 'Inactive Supplier'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">MCC Station Assignments</label>
            <div className="bg-surface-container-low rounded-2xl p-4 max-h-48 overflow-y-auto space-y-1 border border-outline-variant/10 scrollbar-thin">
              {mccs.map(mcc => (
                <label key={mcc.id} className="flex items-center gap-3 cursor-pointer hover:bg-black/5 p-2 rounded-xl transition-all group">
                  <input 
                    type="checkbox"
                    checked={selectedSeller 
                      ? (selectedSeller.mccIds && selectedSeller.mccIds.includes(mcc.id))
                      : formData.mccIds.includes(mcc.id)}
                    onChange={e => {
                      if (selectedSeller) {
                        const currentIds = selectedSeller.mccIds || [];
                        const newIds = e.target.checked 
                          ? [...currentIds, mcc.id]
                          : currentIds.filter(id => id !== mcc.id);
                        setSelectedSeller({...selectedSeller, mccIds: newIds});
                      } else {
                        const newIds = e.target.checked 
                          ? [...formData.mccIds, mcc.id]
                          : formData.mccIds.filter(id => id !== mcc.id);
                        setFormData({...formData, mccIds: newIds});
                      }
                    }}
                    className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{mcc.name}</span>
                </label>
              ))}
              {mccs.length === 0 && <p className="text-xs text-on-surface-variant italic p-4 text-center">No MCCs defined in system</p>}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            <button 
              type="button" 
              onClick={() => {
                setIsAdding(false);
                setSelectedSeller(null);
              }}
              className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all uppercase text-[10px] tracking-widest flex items-center gap-2"
            >
              <Check size={18} />
              {selectedSeller ? 'Update Supplier' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
