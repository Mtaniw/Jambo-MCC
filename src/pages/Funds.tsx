import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, Edit2, X, ArrowDownCircle, ArrowUpCircle, Wallet, Receipt, Milk, Calculator } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat } from '../lib/dateUtils';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { ImportModal } from '../components/ImportModal';
import { Upload } from 'lucide-react';

export default function Funds() {
  const { profile, effectiveRole } = useAuth();
  const [funds, setFunds] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [milkPurchases, setMilkPurchases] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingFund, setEditingFund] = useState<any | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(getTanzaniaTodayStr());

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

  const [formData, setFormData] = useState({
    mccId: '',
    sender: '',
    purpose: '',
    use: 'Milk Purchase',
    refNo: '',
    date: getTanzaniaTodayStr(),
    mode: 'Bank Transfer',
    amountReceived: '',
    amountUsed: '0',
    notes: ''
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0 && !formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const mccIds = profile.mccIds;
    let canQuery = true;
    if (!isGlobalViewer && mccIds.length === 0) {
      canQuery = false;
      setFunds([]);
      setExpenses([]);
      setMilkPurchases([]);
      setLoading(false);
    }

    if (canQuery) {
      // Money Received
      let fq = query(collection(db, 'money_received'), where('date', '>=', startDate), where('date', '<=', endDate));
      if (!isGlobalViewer) fq = query(collection(db, 'money_received'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      const unsubscribeFunds = onSnapshot(fq, (snapshot) => {
        setFunds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'money_received'));

      // Expenses
      let eq = query(collection(db, 'expenses'), where('date', '>=', startDate), where('date', '<=', endDate));
      if (!isGlobalViewer) eq = query(collection(db, 'expenses'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      const unsubscribeExpenses = onSnapshot(eq, (snapshot) => {
        setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'expenses'));

      // Milk Purchases
      let mq = query(collection(db, 'daily_register'), where('date', '>=', startDate), where('date', '<=', endDate));
      if (!isGlobalViewer) mq = query(collection(db, 'daily_register'), where('mccId', 'in', mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      const unsubscribeMilk = onSnapshot(mq, (snapshot) => {
        setMilkPurchases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'daily_register'));

      return () => {
        unsubscribeMccs();
        unsubscribeFunds();
        unsubscribeExpenses();
        unsubscribeMilk();
      };
    }

    return () => unsubscribeMccs();
  }, [profile, startDate, endDate]);

  const reconciliation = useMemo(() => {
    let filteredFunds = selectedMccId === 'all' ? funds : funds.filter(f => f.mccId === selectedMccId);
    let filteredExpenses = selectedMccId === 'all' ? expenses : expenses.filter(e => e.mccId === selectedMccId);
    let filteredMilk = selectedMccId === 'all' ? milkPurchases : milkPurchases.filter(m => m.mccId === selectedMccId);

    const totalReceived = filteredFunds.reduce((sum, f) => sum + (f.amountReceived || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalMilk = filteredMilk.reduce((sum, m) => sum + (m.amount || 0), 0);
    const totalExpenditure = totalExpenses + totalMilk;
    const netBalance = totalReceived - totalExpenditure;

    return { totalReceived, totalExpenses, totalMilk, totalExpenditure, netBalance };
  }, [funds, expenses, milkPurchases, selectedMccId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const balance = Number(formData.amountReceived) - Number(formData.amountUsed);
    const data = {
      ...formData,
      amountReceived: Number(formData.amountReceived),
      amountUsed: Number(formData.amountUsed),
      balance,
      updatedAt: new Date().toISOString()
    };

    if (editingFund) {
      await updateDoc(doc(db, 'money_received', editingFund.id), data);
      setEditingFund(null);
    } else {
      await addDoc(collection(db, 'money_received'), {
        ...data,
        createdAt: new Date().toISOString(),
        recordedBy: profile?.email
      });
    }
    
    setIsAdding(false);
    setFormData({ ...formData, sender: '', purpose: '', refNo: '', amountReceived: '', amountUsed: '0', notes: '' });
  };

  const handleImport = async (data: any[]) => {
    const now = new Date().toISOString();
    for (const row of data) {
      const mcc = mccs.find(m => m.name.toLowerCase() === String(row.MCC).toLowerCase() || m.id === String(row.MCC));
      if (!mcc) throw new Error(`MCC "${row.MCC}" not found.`);

      const amount = Number(row.Amount);
      await addDoc(collection(db, 'money_received'), {
        mccId: mcc.id,
        sender: row.Sender || 'Imported',
        purpose: row.Purpose || 'Funds',
        use: row.Use || 'Milk Purchase',
        refNo: row.RefNo || '',
        date: row.Date,
        mode: row.Mode || 'Bank Transfer',
        amountReceived: amount,
        amountUsed: 0,
        balance: amount,
        notes: row.Notes || 'Imported',
        createdAt: now,
        recordedBy: profile?.email
      });
    }
  };

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Financial Reconciliation</h1>
          <p className="text-on-surface-variant text-sm">Full system financial tracking and funds management</p>
        </div>
        <div className="flex gap-4">
          {isGlobalViewer && (
            <select 
              value={selectedMccId} 
              onChange={e => setSelectedMccId(e.target.value)}
              className="bg-white border border-outline-variant/20 rounded-lg px-4 py-2 text-sm font-bold shadow-sm"
            >
              <option value="all">All MCCs</option>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          )}
          {canWrite && (
            <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all">
              <Upload size={18} /> Import
            </button>
          )}
          {canWrite && (
            <button onClick={() => setIsAdding(!isAdding)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg">
              {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Add Fund Record'}
            </button>
          )}
        </div>
      </div>

      {/* Reconciliation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg text-green-600"><ArrowDownCircle size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Funds Received</span>
          </div>
          <p className="text-xl font-black text-green-600">TSh {formatNumber(reconciliation.totalReceived, 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><Receipt size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Expenses</span>
          </div>
          <p className="text-xl font-black text-orange-600">TSh {formatNumber(reconciliation.totalExpenses, 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Milk size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Milk Purchases</span>
          </div>
          <p className="text-xl font-black text-blue-600">TSh {formatNumber(reconciliation.totalMilk, 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><ArrowUpCircle size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Total Expenditure</span>
          </div>
          <p className="text-xl font-black text-purple-600">TSh {formatNumber(reconciliation.totalExpenditure, 0)}</p>
        </div>
        <div className={cn(
          "p-6 rounded-xl border shadow-lg transition-all hover:scale-[1.02] cursor-default",
          reconciliation.netBalance >= 0 ? "bg-primary text-white border-primary" : "bg-error text-white border-error"
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg"><Calculator size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex-1">Net Balance</span>
          </div>
          <p className="text-2xl font-black">TSh {formatNumber(reconciliation.netBalance, 0)}</p>
          <p className="text-[8px] mt-2 opacity-60">Reconciliation: Received - Total Expenditure</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="w-44 space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">From</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className="w-full h-10 px-3 bg-surface-container-low border-none rounded-lg text-sm font-bold transition-colors focus:bg-surface-container-high"
          />
        </div>

        <div className="w-44 space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">To</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className="w-full h-10 px-3 bg-surface-container-low border-none rounded-lg text-sm font-bold transition-colors focus:bg-surface-container-high"
          />
        </div>

        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Sort Order</label>
          <select 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value as any)}
            className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold"
          >
            <option value="desc">Recent first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        <div className="text-xs text-on-surface-variant font-medium ml-auto pb-2">
          Filtered records reconcile the balance shown above.
        </div>
      </div>

      {(isAdding || editingFund) && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="lg:col-span-3 flex justify-between items-center mb-2">
            <h3 className="font-bold text-primary">{editingFund ? 'Edit Fund Record' : 'Add New Fund Record'}</h3>
            <button type="button" onClick={() => { setIsAdding(false); setEditingFund(null); }} className="text-on-surface-variant hover:text-error transition-colors"><X size={20} /></button>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">MCC</label>
            <select value={formData.mccId} onChange={e => setFormData({...formData, mccId: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required>
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Sender</label>
            <input placeholder="Sender (e.g. Jambo HQ)" value={formData.sender} onChange={e => setFormData({...formData, sender: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Purpose</label>
            <input placeholder="Purpose" value={formData.purpose} onChange={e => setFormData({...formData, purpose: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Primary Use</label>
            <select value={formData.use} onChange={e => setFormData({...formData, use: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required>
              <option value="Milk Purchase">Milk Purchase</option>
              <option value="Station Expenses">Station Expenses</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Ref No.</label>
            <input placeholder="Ref No." value={formData.refNo} onChange={e => setFormData({...formData, refNo: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Date</label>
            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Mode</label>
            <select value={formData.mode} onChange={e => setFormData({...formData, mode: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm">
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Amount Received (TSh)</label>
            <input type="number" placeholder="Amount Received" value={formData.amountReceived} onChange={e => setFormData({...formData, amountReceived: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-2 text-sm" required />
          </div>
          <div className="lg:col-span-3 flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => { setIsAdding(false); setEditingFund(null); }} className="px-6 py-2 rounded-lg font-bold text-on-surface-variant hover:bg-surface-container-low transition-all">Cancel</button>
            <button type="submit" className="bg-primary text-white px-8 py-2 rounded-lg font-bold shadow-lg">
              {editingFund ? 'Update Record' : 'Save Record'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20">
          <h3 className="font-bold text-on-surface">Funds History</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">MCC</th>
              <th className="px-6 py-3">Sender</th>
              <th className="px-6 py-3">Use</th>
              <th className="px-6 py-3">Receipt / Ref</th>
              <th className="px-6 py-3">Amount</th>
              {canWrite && <th className="px-6 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {funds
              .filter(f => selectedMccId === 'all' || f.mccId === selectedMccId)
              .sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                let comparison = dateA - dateB;
                if (comparison === 0) comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                return sortOrder === 'desc' ? -comparison : comparison;
              }).map(fund => (
              <tr key={fund.id} className="hover:bg-surface-container-lowest transition-colors">
                <td className="px-6 py-4 text-sm">{safeFormat(fund.date, 'dd/MM/yyyy')}</td>
                <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === fund.mccId)?.name || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm font-medium">{fund.sender}</td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">{fund.refNo || '-'}</td>
                <td className="px-6 py-4 text-sm font-bold text-green-600">TSh {formatNumber(fund.amountReceived, 0)}</td>
                {canWrite && (
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingFund(fund);
                          setFormData({
                            mccId: fund.mccId,
                            sender: fund.sender,
                            purpose: fund.purpose,
                            use: fund.use,
                            refNo: fund.refNo || '',
                            date: fund.date,
                            mode: fund.mode || 'Bank Transfer',
                            amountReceived: String(fund.amountReceived),
                            amountUsed: String(fund.amountUsed || 0),
                            notes: fund.notes || ''
                          });
                          setIsAdding(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} 
                        className="text-primary p-1 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button onClick={async () => { if(window.confirm('Delete this record?')) await deleteDoc(doc(db, 'money_received', fund.id)); }} className="text-error p-1 hover:bg-red-50 rounded transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        title="Import Financial Records"
        templateFileName="Financial_Reconciliation_Template.xlsx"
        templateData={[
          { Date: '2024-01-01', MCC: 'MCC Name or ID', Sender: 'Jambo HQ', Purpose: 'Milk Payment', Use: 'Milk Purchase', Amount: 5000000, Mode: 'Bank Transfer', RefNo: 'REF123', Notes: '' }
        ]}
        expectedColumns={['Date', 'MCC', 'Amount']}
      />
    </div>
  );
}
