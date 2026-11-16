import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, Edit2, X, Wallet, Check, Printer, FileDown, FileSpreadsheet, Share2, FileText, Upload, Download, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getTanzaniaDate, getSystemStartDate } from '../lib/dateUtils';
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
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Expenses() {
  const { profile, effectiveRole } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(getSystemStartDate());
  const [endDate, setEndDate] = useState(getTanzaniaTodayStr());
  const [pendingReceipt, setPendingReceipt] = useState<PreparedReceipt | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [existingReceiptMeta, setExistingReceiptMeta] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const isGlobalViewer = isActualAdmin || (profile && ['Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));
  const canWrite = isActualAdmin || (profile && !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

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

  const resetModalState = () => {
    setIsAdding(false);
    setEditingId(null);
    setPendingReceipt(null);
    setRemoveExistingReceipt(false);
    setExistingReceiptMeta(null);
    setActionError(null);
    setFormData({
      mccId: mccs[0]?.id || '',
      date: getTanzaniaTodayStr(),
      description: '',
      receiptNo: '',
      quantity: '1',
      amountPerUnit: '',
      approvedBy: profile?.fullName || ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || isSaving) return;
    setIsSaving(true);
    setActionError(null);

    try {
      const total = Number(formData.quantity) * Number(formData.amountPerUnit);
      let receiptFields: Record<string, any> = {};
      const oldReceiptFileId = existingReceiptMeta?.receiptFileId;

      if (pendingReceipt) {
        const uploadedMeta = await uploadReceiptToFirestore(
          pendingReceipt,
          'expenses',
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
          receiptFileId: existingReceiptMeta.receiptFileId,
          receiptFileName: existingReceiptMeta.receiptFileName || '',
          receiptFileType: existingReceiptMeta.receiptFileType || '',
          receiptFileSize: existingReceiptMeta.receiptFileSize || 0,
        };
      }

      const data = {
        mccId: formData.mccId,
        date: formData.date,
        description: formData.description,
        receiptNo: formData.receiptNo || '',
        quantity: Number(formData.quantity),
        amountPerUnit: Number(formData.amountPerUnit),
        total,
        approvedBy: formData.approvedBy || '',
        ...receiptFields,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        try {
          await updateDoc(doc(db, 'expenses', editingId), data);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `expenses/${editingId}`);
        }
        if (oldReceiptFileId && (pendingReceipt || removeExistingReceipt)) {
          await deleteReceiptFromFirestore(oldReceiptFileId);
        }
      } else {
        try {
          await addDoc(collection(db, 'expenses'), { ...data, createdAt: new Date().toISOString() });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'expenses');
        }
      }

      resetModalState();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save expense record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadReceipt = async (exp: any) => {
    if (!exp.receiptFileId) return;
    setDownloadingId(exp.id);
    setActionError(null);
    try {
      await downloadReceiptFromFirestore(exp.receiptFileId, exp.receiptFileName);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to download receipt file.');
    } finally {
      setDownloadingId(null);
    }
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
        recordedBy: profile?.fullName || profile?.email || 'System'
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
        if (dateA !== dateB) return dateB - dateA;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [expenses, searchTerm, selectedMccId]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((acc, exp) => acc + (Number(exp.total) || 0), 0);
  }, [filteredExpenses]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Jambo Food Products Ltd", 14, 15);
    doc.setFontSize(14);
    doc.text("Station Expenses Report", 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${safeFormat(startDate, 'dd/MM/yyyy')} to ${safeFormat(endDate, 'dd/MM/yyyy')}`, 14, 28);
    doc.text(`Total Expenses: TSh ${formatNumber(totalExpenses, 2, true, true)}`, 14, 34);
    
    const tableData = filteredExpenses.map((exp, index) => [
      index + 1,
      safeFormat(exp.date, 'dd/MM/yyyy'),
      mccs.find(m => m.id === exp.mccId)?.name || 'Unknown',
      exp.description,
      exp.receiptNo || 'N/A',
      `TSh ${formatNumber(exp.total, 2, true, true)}`
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['#', 'Date', 'MCC', 'Description', 'Receipt No.', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      styles: { fontSize: 8 }
    });

    doc.save(`Station_Expenses_${startDate}_to_${endDate}.pdf`);
  };

  const exportToExcel = () => {
    const data = filteredExpenses.map((exp, index) => ({
      '#': index + 1,
      'Date': safeFormat(exp.date, 'dd/MM/yyyy'),
      'MCC': mccs.find(m => m.id === exp.mccId)?.name || 'Unknown',
      'Description': exp.description,
      'Receipt No.': exp.receiptNo || 'N/A',
      'Quantity': exp.quantity || 1,
      'Amount Per Unit (TSh)': exp.amountPerUnit || 0,
      'Total (TSh)': exp.total || 0,
      'Approved By': exp.approvedBy || '',
      'Date Recorded': exp.createdAt ? safeFormat(exp.createdAt, 'dd/MM/yyyy HH:mm') : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Station Expenses');
    XLSX.writeFile(wb, `Station_Expenses_${startDate}_to_${endDate}.xlsx`);
  };

  const exportToDoc = () => {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Station Expenses Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e3a8a; margin-bottom: 5px; }
          h2 { color: #374151; margin-top: 0; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 11px; }
          th { background-color: #1e3a8a; color: white; font-weight: bold; }
          .total { font-weight: bold; background-color: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Jambo Food Products Ltd</h1>
        <h2>Station Expenses Report</h2>
        <p><b>Period:</b> ${safeFormat(startDate, 'dd/MM/yyyy')} to ${safeFormat(endDate, 'dd/MM/yyyy')}</p>
        <p><b>Total Expenses:</b> TSh ${formatNumber(totalExpenses, 2, true, true)}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>MCC</th>
              <th>Description</th>
              <th>Receipt</th>
              <th>Total (TSh)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredExpenses.map((exp, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${safeFormat(exp.date, 'dd/MM/yyyy')}</td>
                <td>${mccs.find(m => m.id === exp.mccId)?.name || 'Unknown'}</td>
                <td>${exp.description}</td>
                <td>${exp.receiptNo || 'N/A'}</td>
                <td>TSh ${formatNumber(exp.total, 2, true, true)}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="5" style="text-align: right;"><b>Grand Total:</b></td>
              <td><b>TSh ${formatNumber(totalExpenses, 2, true, true)}</b></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Station_Expenses_${startDate}_to_${endDate}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Jambo Food Products Ltd", 14, 15);
        doc.setFontSize(14);
        doc.text("Station Expenses Report", 14, 22);
        doc.setFontSize(10);
        doc.text(`Period: ${safeFormat(startDate, 'dd/MM/yyyy')} to ${safeFormat(endDate, 'dd/MM/yyyy')}`, 14, 28);
        doc.text(`Total Expenses: TSh ${formatNumber(totalExpenses, 2, true, true)}`, 14, 34);

        const tableData = filteredExpenses.map((exp, index) => [
          index + 1,
          safeFormat(exp.date, 'dd/MM/yyyy'),
          mccs.find(m => m.id === exp.mccId)?.name || 'Unknown',
          exp.description,
          exp.receiptNo || 'N/A',
          `TSh ${formatNumber(exp.total, 2, true, true)}`
        ]);

        (doc as any).autoTable({
          startY: 40,
          head: [['#', 'Date', 'MCC', 'Description', 'Receipt No.', 'Total']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 138] },
          styles: { fontSize: 8 }
        });

        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `Station_Expenses_${startDate}_to_${endDate}.pdf`, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Station Expenses Report',
            text: `Station Expenses Report for ${startDate} to ${endDate}`,
            files: [file]
          });
        } else {
          await navigator.share({
            title: 'Station Expenses Report',
            text: `Station Expenses Report: Total TSh ${formatNumber(totalExpenses, 2, true, true)} for period ${startDate} to ${endDate}`
          });
        }
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Sharing is not supported on this browser/environment. You can download the PDF or Excel formats instead!');
    }
  };

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Station Expenses</h1>
          <p className="text-on-surface-variant text-sm">Matumizi ya Kituo - Track operational costs</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button onClick={() => window.print()} className="p-2 bg-white border border-outline-variant/35 rounded-lg hover:bg-surface-dim transition-colors cursor-pointer text-on-surface" title="Print">
            <Printer size={18} />
          </button>
          <button onClick={exportToPDF} className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dim transition-colors cursor-pointer" title="Export to PDF">
            <FileDown size={18} />
          </button>
          <button onClick={exportToExcel} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer" title="Export to Excel">
            <FileSpreadsheet size={18} />
          </button>
          <button onClick={exportToDoc} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer" title="Export to Word (Doc)">
            <FileText size={18} />
          </button>
          <button onClick={handleShare} className="p-2 bg-secondary text-white rounded-lg hover:bg-secondary-dim transition-colors cursor-pointer" title="Share PDF">
            <Share2 size={18} />
          </button>

          {canWrite && (
            <>
              <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all cursor-pointer">
                <Upload size={18} /> Import
              </button>
              <button onClick={() => { if (isAdding) { resetModalState(); } else { setEditingId(null); setPendingReceipt(null); setRemoveExistingReceipt(false); setExistingReceiptMeta(null); setActionError(null); setFormData({ mccId: mccs[0]?.id || '', date: getTanzaniaTodayStr(), description: '', receiptNo: '', quantity: '1', amountPerUnit: '', approvedBy: profile?.fullName || '' }); setIsAdding(true); } }} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all cursor-pointer">
                {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Add Expense'}
              </button>
            </>
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

      {/* Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Station Expenses</p>
          <p className="text-2xl font-black text-primary">TSh {formatNumber(totalExpenses, 2, true, true)}</p>
          <p className="text-[10px] text-on-surface-variant mt-2">Based on current filters</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end print:hidden">
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

      <Modal
        isOpen={isAdding}
        onClose={resetModalState}
        title={editingId ? "Update Station Expense" : "Record New Station Expense"}
        icon={<Wallet size={20} />}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                value={formData.date} 
                onChange={val => setFormData({...formData, date: val})}
                label="Transaction Date"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Expense Description</label>
              <input 
                placeholder="e.g. Electricity, Fuel, Maintenance" 
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black shadow-none" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Receipt / Reference No.</label>
              <input 
                placeholder="---" 
                value={formData.receiptNo} 
                onChange={e => setFormData({...formData, receiptNo: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Unit Quantity</label>
              <input 
                type="number" 
                placeholder="1" 
                value={formData.quantity} 
                onChange={e => setFormData({...formData, quantity: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Unit Cost (TSh)</label>
              <input 
                type="number" 
                placeholder="0" 
                value={formData.amountPerUnit} 
                onChange={e => setFormData({...formData, amountPerUnit: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Approved By</label>
              <input 
                placeholder="Approver name" 
                value={formData.approvedBy} 
                onChange={e => setFormData({...formData, approvedBy: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
              />
            </div>
            <div className="md:col-span-2">
              <ReceiptUploadField
                label="Expense Receipt (PDF or Image — Optional)"
                pendingReceipt={pendingReceipt}
                onSelectReceipt={setPendingReceipt}
                existingReceipt={existingReceiptMeta}
                removeExisting={removeExistingReceipt}
                onToggleRemoveExisting={setRemoveExistingReceipt}
              />
            </div>
          </div>

          <div className="flex justify-between items-center bg-primary/5 p-6 rounded-[1.5rem] border border-primary/10 mt-4">
            <div>
              <p className="text-[10px] font-black uppercase text-primary opacity-70 tracking-widest mb-1">Calculated Total</p>
              <p className="text-2xl font-black text-primary tracking-tight">TSh {formatNumber(Number(formData.quantity || 0) * Number(formData.amountPerUnit || 0), 2, true, true)}</p>
            </div>
            <div className="flex gap-3">
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
                {isSaving ? 'Saving...' : (editingId ? 'Update Record' : 'Save Expense')}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              <tr>
                <th className="px-6 py-3 w-10">#</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">MCC</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Receipt</th>
                <th className="px-6 py-3">Total</th>
                {canWrite && <th className="px-6 py-3 text-right print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredExpenses.map((exp, index) => (
                <tr key={exp.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4 text-[10px] font-black text-on-surface-variant opacity-30">{index + 1}</td>
                  <td className="px-6 py-4 text-sm">{safeFormat(exp.date, 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === exp.mccId)?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 text-sm font-medium">{exp.description}</td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{exp.receiptNo || 'N/A'}</span>
                      {exp.receiptFileId && (
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(exp)}
                          disabled={downloadingId === exp.id}
                          title={`Download ${exp.receiptFileName || 'receipt'}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 print:hidden"
                        >
                          {downloadingId === exp.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : exp.receiptFileType === 'application/pdf' || (exp.receiptFileName || '').toLowerCase().endsWith('.pdf') ? (
                            <FileText size={12} />
                          ) : (
                            <ImageIcon size={12} />
                          )}
                          <span>{exp.receiptFileType === 'application/pdf' || (exp.receiptFileName || '').toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}</span>
                          <Download size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">TSh {formatNumber(exp.total, 2, true, true)}</td>
                  {canWrite && (
                    <td className="px-6 py-4 text-right print:hidden">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingId(exp.id);
                            setFormData({
                              mccId: exp.mccId || mccs[0]?.id || '',
                              date: exp.date || getTanzaniaTodayStr(),
                              description: exp.description || '',
                              receiptNo: exp.receiptNo || '',
                              quantity: String(exp.quantity ?? '1'),
                              amountPerUnit: String(exp.amountPerUnit ?? ''),
                              approvedBy: exp.approvedBy || ''
                            });
                            setExistingReceiptMeta(exp.receiptFileId ? {
                              receiptFileId: exp.receiptFileId,
                              receiptFileName: exp.receiptFileName,
                              receiptFileType: exp.receiptFileType,
                              receiptFileSize: exp.receiptFileSize,
                            } : null);
                            setPendingReceipt(null);
                            setRemoveExistingReceipt(false);
                            setActionError(null);
                            setIsAdding(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="p-1 hover:text-primary"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm('Delete this expense?')) {
                              if (exp.receiptFileId) await deleteReceiptFromFirestore(exp.receiptFileId);
                              await deleteDoc(doc(db, 'expenses', exp.id));
                            }
                          }}
                          className="p-1 hover:text-error"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className="px-6 py-10 text-center text-on-surface-variant italic">No expenses found</td>
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
          { Date: getSystemStartDate(), MCC: 'MCC Name or ID', Description: 'Electricity Bill', ReceiptNo: 'REC123', Quantity: 1, AmountPerUnit: 50000, ApprovedBy: 'Manager Name' }
        ]}
        expectedColumns={['Date', 'MCC', 'Description', 'AmountPerUnit']}
      />
    </div>
  );
}
