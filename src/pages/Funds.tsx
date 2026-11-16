import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  X, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Wallet, 
  Receipt, 
  Milk, 
  Calculator,
  Printer,
  Download,
  FileText,
  Share2,
  Calendar,
  Filter,
  Loader2,
  Check,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getSystemStartDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { ImportModal } from '../components/ImportModal';
import { Modal } from '../components/Modal';
import { ReceiptUploadField } from '../components/ReceiptUploadField';
import {
  PreparedReceipt,
  uploadReceiptToFirestore,
  downloadReceiptFromFirestore,
  deleteReceiptFromFirestore,
} from '../lib/receiptStorage';
import { Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useSettings } from '../hooks/useSettings';

export default function Funds() {
  const { profile, effectiveRole } = useAuth();
  const { settings } = useSettings();
  const reportRef = useRef<HTMLDivElement>(null);
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
  const [startDate, setStartDate] = useState<string>(getSystemStartDate());
  const [endDate, setEndDate] = useState<string>(getTanzaniaTodayStr());
  const [pendingReceipt, setPendingReceipt] = useState<PreparedReceipt | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isActualAdmin = profile && (profile.role === 'Admin' || profile.role === 'Super User');
  const isGlobalViewer = isActualAdmin || (profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));
  const canWrite = isActualAdmin || (profile && !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

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

  const resetModalState = () => {
    setIsAdding(false);
    setEditingFund(null);
    setPendingReceipt(null);
    setRemoveExistingReceipt(false);
    setActionError(null);
    setFormData(prev => ({
      ...prev,
      sender: '',
      purpose: '',
      refNo: '',
      amountReceived: '',
      amountUsed: '0',
      notes: ''
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || isSaving) return;
    setIsSaving(true);
    setActionError(null);

    try {
      const balance = Number(formData.amountReceived) - Number(formData.amountUsed);
      let receiptFields: Record<string, any> = {};
      const oldReceiptFileId = editingFund?.receiptFileId;

      if (pendingReceipt) {
        const uploadedMeta = await uploadReceiptToFirestore(
          pendingReceipt,
          'money_received',
          profile?.fullName || profile?.email || 'System'
        );
        receiptFields = uploadedMeta;
      } else if (removeExistingReceipt) {
        receiptFields = {
          receiptFileId: null,
          receiptFileName: null,
          receiptFileType: null,
          receiptFileSize: null,
        };
      } else if (oldReceiptFileId) {
        receiptFields = {
          receiptFileId: editingFund.receiptFileId,
          receiptFileName: editingFund.receiptFileName || '',
          receiptFileType: editingFund.receiptFileType || '',
          receiptFileSize: editingFund.receiptFileSize || 0,
        };
      }

      const data = {
        ...formData,
        amountReceived: Number(formData.amountReceived),
        amountUsed: Number(formData.amountUsed),
        balance,
        ...receiptFields,
        updatedAt: new Date().toISOString()
      };

      if (editingFund) {
        try {
          await updateDoc(doc(db, 'money_received', editingFund.id), data);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `money_received/${editingFund.id}`);
        }
        if (oldReceiptFileId && (pendingReceipt || removeExistingReceipt)) {
          await deleteReceiptFromFirestore(oldReceiptFileId);
        }
      } else {
        try {
          await addDoc(collection(db, 'money_received'), {
            ...data,
            createdAt: new Date().toISOString(),
            recordedBy: profile?.fullName || profile?.email || 'System'
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'money_received');
        }
      }

      resetModalState();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save fund record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadReceipt = async (fund: any) => {
    if (!fund.receiptFileId) return;
    setDownloadingId(fund.id);
    setActionError(null);
    try {
      await downloadReceiptFromFirestore(fund.receiptFileId, fund.receiptFileName);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to download fund receipt.');
    } finally {
      setDownloadingId(null);
    }
  };

  const exportToExcel = () => {
    const data = funds.map(f => ({
      Date: f.date,
      MCC: mccs.find(m => m.id === f.mccId)?.name || 'Unknown',
      Sender: f.sender,
      'Ref No': f.refNo || '-',
      Amount: f.amountReceived,
      'Recorded By': f.recordedBy
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Funds Received");
    XLSX.writeFile(wb, `Funds_Received_${startDate}_to_${endDate}.xlsx`);
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setLoading(true);
    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      logging: false
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Funds_Received_${startDate}_to_${endDate}.pdf`);
    setLoading(false);
  };

  const shareReport = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Funds Received Report - ${settings.systemName || 'MCC System'}`,
          text: `Financial reconciliation from ${startDate} to ${endDate}. Net Balance: TSh ${formatNumber(reconciliation.netBalance, 2, true, true)}`,
          url: window.location.href
        });
      } else {
        alert('Sharing is not supported on this device/browser');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
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
        recordedBy: profile?.fullName || profile?.email || 'System'
      });
    }
  };

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Financial Reconciliation</h1>
          <p className="text-on-surface-variant text-sm">Full system financial tracking and funds management</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          
          <div className="flex items-center gap-2 mr-2">
            <button 
              onClick={() => window.print()}
              className="p-2 bg-white border border-outline-variant/20 rounded-lg hover:bg-surface-container transition-colors shadow-sm"
              title="Print Report"
            >
              <Printer size={18} />
            </button>
            <button 
              onClick={exportToExcel}
              className="p-2 bg-white border border-outline-variant/20 rounded-lg hover:bg-surface-container transition-colors shadow-sm"
              title="Export to Excel"
            >
              <Download size={18} />
            </button>
            <button 
              onClick={exportToPDF}
              className="p-2 bg-white border border-outline-variant/20 rounded-lg hover:bg-surface-container transition-colors shadow-sm"
              title="Export to PDF"
            >
              <FileText size={18} />
            </button>
            <button 
              onClick={shareReport}
              className="p-2 bg-white border border-outline-variant/20 rounded-lg hover:bg-surface-container transition-colors shadow-sm"
              title="Share Report"
            >
              <Share2 size={18} />
            </button>
          </div>

          {canWrite && (
            <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all">
              <Upload size={18} /> Import
            </button>
          )}
          {canWrite && (
            <button onClick={() => { if (isAdding) { resetModalState(); } else { setEditingFund(null); setPendingReceipt(null); setRemoveExistingReceipt(false); setActionError(null); setIsAdding(true); } }} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg">
              {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Add Fund Record'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 print:hidden">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      <div ref={reportRef} className="space-y-6 print:p-0">
        <div className="hidden print:block mb-8 border-b pb-4">
          <h1 className="text-3xl font-black">{settings.companyName || 'Jambo Food Products Ltd'}</h1>
          <p className="text-lg font-bold text-primary">{settings.systemName || 'Financial Reconciliation'} - Summary</p>
          <p className="text-sm">Period: {startDate} to {endDate}</p>
          {selectedMccId !== 'all' && <p className="text-sm">MCC Station: {mccs.find(m => m.id === selectedMccId)?.name}</p>}
        </div>

        {/* Reconciliation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg text-green-600"><ArrowDownCircle size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Funds Received</span>
          </div>
          <p className="text-xl font-black text-green-600">TSh {formatNumber(reconciliation.totalReceived, 2, true, true)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><Receipt size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Expenses</span>
          </div>
          <p className="text-xl font-black text-orange-600">TSh {formatNumber(reconciliation.totalExpenses, 2, true, true)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Milk size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Milk Purchases</span>
          </div>
          <p className="text-xl font-black text-blue-600">TSh {formatNumber(reconciliation.totalMilk, 2, true, true)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><ArrowUpCircle size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">Total Expenditure</span>
          </div>
          <p className="text-xl font-black text-purple-600">TSh {formatNumber(reconciliation.totalExpenditure, 2, true, true)}</p>
        </div>
        <div className={cn(
          "p-6 rounded-xl border shadow-lg transition-all hover:scale-[1.02] cursor-default",
          reconciliation.netBalance >= 0 ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600"
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg"><Calculator size={20} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex-1">Net Balance</span>
          </div>
          <p className="text-2xl font-black">TSh {formatNumber(reconciliation.netBalance, 2, true, true)}</p>
          <p className="text-[8px] mt-2 opacity-60">Reconciliation: Received - Total Expenditure</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="w-44 space-y-1">
          <DateInput 
            value={startDate} 
            onChange={setStartDate}
            label="From"
          />
        </div>

        <div className="w-44 space-y-1">
          <DateInput 
            value={endDate} 
            onChange={setEndDate}
            label="To"
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

      <Modal
        isOpen={isAdding || !!editingFund}
        onClose={resetModalState}
        title={editingFund ? "Edit Fund Record" : "Record Funds Received"}
        icon={<ArrowDownCircle size={20} />}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Recipient Station (MCC)</label>
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
                value={formData.date} 
                onChange={val => setFormData({...formData, date: val})}
                label="Date Received"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Source / Sender</label>
              <input 
                placeholder="e.g. Jambo Food Products HQ" 
                value={formData.sender} 
                onChange={e => setFormData({...formData, sender: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Fund Purpose</label>
              <input 
                placeholder="e.g. Weekly Operations" 
                value={formData.purpose} 
                onChange={e => setFormData({...formData, purpose: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Allocated For</label>
              <select 
                value={formData.use} 
                onChange={e => setFormData({...formData, use: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all" 
                required
              >
                <option value="Milk Purchase">Milk Purchase</option>
                <option value="Station Expenses">Station Expenses</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Transaction Ref No.</label>
              <input 
                placeholder="Bank Ref / Mobile Ref" 
                value={formData.refNo} 
                onChange={e => setFormData({...formData, refNo: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Payment Mode</label>
              <select 
                value={formData.mode} 
                onChange={e => setFormData({...formData, mode: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Amount Received (TSh)</label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="0" 
                  value={formData.amountReceived} 
                  onChange={e => setFormData({...formData, amountReceived: e.target.value})} 
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                  required 
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase tracking-widest">TSH</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Internal Notes</label>
            <textarea 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              className="w-full bg-surface-container-low border-none rounded-xl text-sm h-20 p-4 font-medium" 
              placeholder="Any additional details..." 
            />
          </div>

          <ReceiptUploadField
            label="Fund Receipt (PDF or Image — Optional)"
            pendingReceipt={pendingReceipt}
            onSelectReceipt={setPendingReceipt}
            existingReceipt={editingFund}
            removeExisting={removeExistingReceipt}
            onToggleRemoveExisting={setRemoveExistingReceipt}
          />

          <div className="flex justify-end gap-3 pt-6 border-t border-outline-variant/10">
            <button 
              type="button" 
              onClick={resetModalState}
              disabled={isSaving}
              className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all uppercase text-[10px] tracking-widest flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {isSaving ? 'Saving...' : (editingFund ? 'Update Record' : 'Save Record')}
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center">
          <h3 className="font-bold text-on-surface">Funds History</h3>
          <p className="text-xs font-bold text-on-surface-variant print:block hidden">Total Records: {funds.length}</p>
        </div>
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            <tr>
              <th className="px-6 py-3 w-10">#</th>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">MCC</th>
              <th className="px-6 py-3">Sender</th>
              <th className="px-6 py-3">Receipt / Ref</th>
              <th className="px-6 py-3">Amount</th>
              {canWrite && <th className="px-6 py-3 text-right print:hidden">Actions</th>}
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
              }).map((fund, index) => (
              <tr key={fund.id} className="hover:bg-surface-container-lowest transition-colors">
                <td className="px-6 py-4 text-[10px] font-black text-on-surface-variant opacity-30">{index + 1}</td>
                <td className="px-6 py-4 text-sm font-bold">{safeFormat(fund.date, 'dd/MM/yyyy')}</td>
                <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === fund.mccId)?.name || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm font-medium">{fund.sender}</td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{fund.refNo || '-'}</span>
                    {fund.receiptFileId && (
                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(fund)}
                        disabled={downloadingId === fund.id}
                        title={`Download ${fund.receiptFileName || 'receipt'}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 print:hidden"
                      >
                        {downloadingId === fund.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : fund.receiptFileType === 'application/pdf' || (fund.receiptFileName || '').toLowerCase().endsWith('.pdf') ? (
                          <FileText size={12} />
                        ) : (
                          <ImageIcon size={12} />
                        )}
                        <span>{fund.receiptFileType === 'application/pdf' || (fund.receiptFileName || '').toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}</span>
                        <Download size={11} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-black text-green-600">TSh {formatNumber(fund.amountReceived, 2, true, true)}</td>
                {canWrite && (
                  <td className="px-6 py-4 text-right print:hidden">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingFund(fund);
                          setPendingReceipt(null);
                          setRemoveExistingReceipt(false);
                          setActionError(null);
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
                      {isActualAdmin && (
                        <button
                          onClick={async () => {
                            if (window.confirm('Delete this record?')) {
                              if (fund.receiptFileId) await deleteReceiptFromFirestore(fund.receiptFileId);
                              await deleteDoc(doc(db, 'money_received', fund.id));
                            }
                          }}
                          className="text-error p-1 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {funds.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="px-6 py-10 text-center text-on-surface-variant italic">No financial records found for this period.</td>
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
        title="Import Financial Records"
        templateFileName="Financial_Reconciliation_Template.xlsx"
        templateData={[
          { Date: getSystemStartDate(), MCC: 'MCC Name or ID', Sender: 'Jambo HQ', Purpose: 'Milk Payment', Use: 'Milk Purchase', Amount: 5000000, Mode: 'Bank Transfer', RefNo: 'REF123', Notes: '' }
        ]}
        expectedColumns={['Date', 'MCC', 'Amount']}
      />

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-primary" size={48} />
            <p className="font-black text-primary animate-pulse tracking-widest text-xs">PROCESSING REPORT...</p>
          </div>
        </div>
      )}
    </div>
  );
}
