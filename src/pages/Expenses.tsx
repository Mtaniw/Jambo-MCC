import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { ImportModal } from '../components/ImportModal';
import { Upload } from 'lucide-react';

export default function Expenses() {
  const { profile, effectiveRole } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(getTanzaniaTodayStr());

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

  const [formData, setFormData] = useState({
    mccId: '',
    date: getTanzaniaTodayStr(),
    description: '',
    receiptNo: '',
    quantity: '1',
    amountPerUnit: '',
    approvedBy: ''
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0 && !formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id, approvedBy: profile.fullName }));
    });

    let q = query(collection(db, 'expenses'), where('date', '>=', startDate), where('date', '<=', endDate));
    let canQuery = true;
    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        q = query(collection(db, 'expenses'), where('mccId', 'in', profile.mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      } else {
        canQuery = false;
        setExpenses([]);
        setLoading(false);
      }
    }

    let unsubscribeExpenses = () => {};
    if (canQuery) {
      unsubscribeExpenses = onSnapshot(q, (snapshot) => {
        setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      });
    }

    return () => {
      unsubscribeMccs();
      unsubscribeExpenses();
    };
  }, [profile, startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const total = Number(formData.quantity) * Number(formData.amountPerUnit);
    const data = {
      ...formData,
      quantity: Number(formData.quantity),
      amountPerUnit: Number(formData.amountPerUnit),
      total,
      updatedAt: new Date().toISOString()
    };

    if (editingId) {
      await updateDoc(doc(db, 'expenses', editingId), data);
      setEditingId(null);
    } else {
      await addDoc(collection(db, 'expenses'), { ...data, createdAt: new Date().toISOString() });
    }
    setIsAdding(false);
    setFormData({ ...formData, description: '', receiptNo: '', amountPerUnit: '' });
  };

  const handleImport = async (data: any[]) => {
    const now = new Date().toISOString();
    for (const row of data) {
      const mcc = mccs.find(m => m.name.toLowerCase() === String(row.MCC).toLowerCase() || m.id === String(row.MCC));
      if (!mcc) throw new Error(`MCC "${row.MCC}" not found.`);

      const qty = Number(row.Quantity || 1);
      const amountPerUnit = Number(row.AmountPerUnit);
      const total = qty * amountPerUnit;

      await addDoc(collection(db, 'expenses'), {
        mccId: mcc.id,
        date: row.Date,
        description: row.Description,
        receiptNo: row.ReceiptNo || '',
        quantity: qty,
        amountPerUnit: amountPerUnit,
        total: total,
        approvedBy: row.ApprovedBy || profile?.fullName || '',
        createdAt: now,
        updatedAt: now,
        recordedBy: profile?.email
      });
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMccId, setSelectedMccId] = useState('all');

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(exp => {
        const matchesSearch = exp.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (exp.receiptNo || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesMcc = selectedMccId === 'all' || exp.mccId === selectedMccId;
        return matchesSearch && matchesMcc;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });
  }, [expenses, searchTerm, selectedMccId]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((acc, exp) => acc + (Number(exp.total) || 0), 0);
  }, [filteredExpenses]);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Station Expenses</h1>
          <p className="text-on-surface-variant text-sm">Matumizi ya Kituo - Track operational costs</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all">
              <Upload size={18} /> Import
            </button>
            <button onClick={() => { setIsAdding(!isAdding); setEditingId(null); setFormData({ mccId: mccs[0]?.id || '', date: getTanzaniaTodayStr(), description: '', receiptNo: '', quantity: '1', amountPerUnit: '', approvedBy: profile?.fullName || '' }); }} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all">
              {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Add Expense'}
            </button>
          </div>
        )}
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Station Expenses</p>
          <p className="text-2xl font-black text-primary">TSh {formatNumber(totalExpenses, 0)}</p>
          <p className="text-[10px] text-on-surface-variant mt-2">Based on current filters</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Search</label>
          <input 
            placeholder="Description or receipt..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-lg text-sm"
          />
        </div>

        <div className="w-44">
          <DateInput 
            value={startDate}
            onChange={setStartDate}
            label="From"
          />
        </div>

        <div className="w-44">
          <DateInput 
            value={endDate}
            onChange={setEndDate}
            label="To"
          />
        </div>

        {isGlobalViewer && (
          <div className="w-44">
            <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">MCC Filter</label>
            <select 
              value={selectedMccId} 
              onChange={e => setSelectedMccId(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold"
            >
              <option value="all">All MCCs</option>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60">MCC</label>
            <select value={formData.mccId} onChange={e => setFormData({...formData, mccId: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2" required>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <DateInput 
              value={formData.date} 
              onChange={val => setFormData({...formData, date: val})}
              label="Date"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60">Description</label>
            <input placeholder="e.g. Electricity, Fuel, Maintenance" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60">Receipt No.</label>
            <input placeholder="Receipt No." value={formData.receiptNo} onChange={e => setFormData({...formData, receiptNo: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60">Quantity</label>
            <input type="number" placeholder="Quantity" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60">Amount per Unit</label>
            <input type="number" placeholder="Amount per Unit" value={formData.amountPerUnit} onChange={e => setFormData({...formData, amountPerUnit: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2" required />
          </div>
          <div className="lg:col-span-3 flex justify-between items-center bg-primary/5 p-4 rounded-lg border border-primary/10">
            <div>
              <p className="text-[10px] font-bold uppercase text-primary opacity-70">Total Amount</p>
              <p className="text-xl font-black text-primary">TSh {formatNumber(Number(formData.quantity || 0) * Number(formData.amountPerUnit || 0), 0)}</p>
            </div>
            <button type="submit" className="bg-primary text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:shadow-primary/20 transition-all">
              {editingId ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">MCC</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Receipt</th>
                <th className="px-6 py-3">Total</th>
                {canWrite && <th className="px-6 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredExpenses.map(exp => (
                <tr key={exp.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4 text-sm">{safeFormat(exp.date, 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === exp.mccId)?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 text-sm font-medium">{exp.description}</td>
                  <td className="px-6 py-4 text-sm">{exp.receiptNo || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm font-bold">TSh {formatNumber(exp.total, 0)}</td>
                  {canWrite && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setEditingId(exp.id); setFormData(exp); setIsAdding(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-1 hover:text-primary"><Edit2 size={16} /></button>
                        <button onClick={async () => { if(window.confirm('Delete this expense?')) await deleteDoc(doc(db, 'expenses', exp.id)); }} className="p-1 hover:text-error"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant italic">No expenses found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        title="Import Station Expenses"
        templateFileName="Station_Expenses_Template.xlsx"
        templateData={[
          { Date: '2024-01-01', MCC: 'MCC Name or ID', Description: 'Electricity Bill', ReceiptNo: 'REC123', Quantity: 1, AmountPerUnit: 50000, ApprovedBy: 'Manager Name' }
        ]}
        expectedColumns={['Date', 'MCC', 'Description', 'AmountPerUnit']}
      />
    </div>
  );
}
