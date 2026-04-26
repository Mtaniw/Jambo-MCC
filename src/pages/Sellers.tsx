import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, Edit2, Search, Filter, Users, Phone, MapPin, Tag, X, Check, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';

export default function Sellers() {
  const { profile } = useAuth();
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
    mccId: '',
    active: true
  });

  useEffect(() => {
    if (!profile) return;

    const unsubMccs = onSnapshot(collection(db, 'mccs'), (snap) => {
      setMccs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    let sellersQuery = query(collection(db, 'sellers'));
    if (profile.role !== 'Super User' && profile.role !== 'Admin' && profile.mccIds?.length > 0) {
      sellersQuery = query(collection(db, 'sellers'), where('mccId', 'in', profile.mccIds));
    }

    const unsubSellers = onSnapshot(sellersQuery, (snap) => {
      setSellers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      const matchesMcc = mccFilter === 'all' || s.mccId === mccFilter;
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
      setFormData({ name: '', phone: '', location: '', category: 'Farmer', mccId: '', active: true });
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Seller Directory</h1>
          <p className="text-on-surface-variant text-sm">Manage registered milk suppliers</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all"
        >
          <Plus size={18} /> Add Seller
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Search Sellers</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg text-sm"
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
                <th className="px-6 py-3">MCC</th>
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
                    {mccs.find(m => m.id === seller.mccId)?.name || 'Unknown'}
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
                      <button onClick={() => setSelectedSeller(seller)} className="p-1 text-primary hover:bg-primary/5 rounded"><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteSeller(seller.id)} className="p-1 text-error hover:bg-red-50 rounded"><Trash2 size={16} /></button>
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

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="text-lg font-bold">Add New Seller</h3>
              <button onClick={() => setIsAdding(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddSeller} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Full Name</label>
                <input 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Phone Number</label>
                <input 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">MCC Assignment</label>
                <select 
                  value={formData.mccId} 
                  onChange={e => setFormData({...formData, mccId: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                >
                  <option value="">Select MCC</option>
                  {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Category</label>
                <select 
                  value={formData.category} 
                  onChange={e => setFormData({...formData, category: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                >
                  <option value="Farmer">Farmer</option>
                  <option value="Cooperative">Cooperative</option>
                  <option value="Agent">Agent</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="active" 
                  checked={formData.active} 
                  onChange={e => setFormData({...formData, active: e.target.checked})}
                />
                <label htmlFor="active" className="text-sm font-bold">Active Status</label>
              </div>
              <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold mt-4 shadow-lg">Save Seller</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {selectedSeller && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="text-lg font-bold">Edit Seller Details</h3>
              <button onClick={() => setSelectedSeller(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateSeller} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Full Name</label>
                <input 
                  value={selectedSeller.name} 
                  onChange={e => setSelectedSeller({...selectedSeller, name: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Phone Number</label>
                <input 
                  value={selectedSeller.phone} 
                  onChange={e => setSelectedSeller({...selectedSeller, phone: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">MCC Assignment</label>
                <select 
                  value={selectedSeller.mccId} 
                  onChange={e => setSelectedSeller({...selectedSeller, mccId: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                  required
                >
                  {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase opacity-60">Category</label>
                <select 
                  value={selectedSeller.category} 
                  onChange={e => setSelectedSeller({...selectedSeller, category: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm"
                >
                  <option value="Farmer">Farmer</option>
                  <option value="Cooperative">Cooperative</option>
                  <option value="Agent">Agent</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="edit-active" 
                  checked={selectedSeller.active} 
                  onChange={e => setSelectedSeller({...selectedSeller, active: e.target.checked})}
                />
                <label htmlFor="edit-active" className="text-sm font-bold">Active Status</label>
              </div>
              <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold mt-4 shadow-lg">Update Seller</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
