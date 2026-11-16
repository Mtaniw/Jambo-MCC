import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, X, Save, Search, Filter, AlertTriangle, Clock, Beaker, Calendar, Edit2, FileText, FileSpreadsheet, Printer, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { TypeAhead } from '../components/TypeAhead';
import { Modal } from '../components/Modal';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const REJECTION_REASONS = [
  { code: 'A', reason: 'Adulteration — Water / Soda / Other' },
  { code: 'D', reason: 'High Dirt Content / Sediment' },
  { code: 'S', reason: 'Sour Milk / High Acidity' },
  { code: 'T', reason: 'Abnormal Taste or Smell' },
  { code: 'C', reason: 'High Temperature at Collection' },
  { code: 'M', reason: 'Mixed / Cross-Contaminated Milk' },
  { code: 'R', reason: 'Reserving Tank' },
];

const TEST_CODES = [
  { code: 'AT', name: 'Alcohol Test (80% Ethanol)', standard: 'Negative (No Clotting)' },
  { code: 'LT', name: 'Lactometer / Density Test', standard: '1.028 – 1.033 g/mL' },
  { code: 'MT', name: 'Methylene Blue Reduction Test (MBRT)', standard: '> 30 minutes' },
  { code: 'pH', name: 'pH Strip Test', standard: '6.6 – 6.8' },
  { code: 'ST', name: 'Sensory Test (Smell / Color / Taste)', standard: 'Normal appearance' },
  { code: 'None', name: 'None', standard: 'N/A' },
];

export default function Rejects() {
  const { profile, effectiveRole } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  
  // Persist filters
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('rejects_search') || '');
  const [mccFilter, setMccFilter] = useState(() => localStorage.getItem('rejects_mcc') || 'all');
  const [startDate, setStartDate] = useState(() => format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => getTanzaniaTodayStr());
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortField, setSortField] = useState<'date' | 'litersRejected'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    localStorage.setItem('rejects_search', searchTerm);
    localStorage.setItem('rejects_mcc', mccFilter);
  }, [searchTerm, mccFilter]);

  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const isGlobalViewer = isActualAdmin || (profile && ['Factory Clerk', 'Supervisor', 'Manager', 'Director', 'Quality Controller'].includes(effectiveRole as string));
  const canWrite = isActualAdmin || (profile && ['Quality Controller', 'Cashier', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

  const [formData, setFormData] = useState({
    mccId: '',
    sellerName: '',
    time: safeFormat(new Date().toISOString(), 'HH:mm'),
    litersRejected: '',
    temp: '',
    phAcidity: '',
    rejectionReason: 'A',
    testCode: 'AT',
    actionTaken: 'Returned to Seller',
    remarks: '',
    date: getTanzaniaTodayStr()
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0 && !formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
      setSellers(snapshot.docs.map(doc => {
        const data = doc.data();
        const smccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds: smccIds };
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    return () => {
      unsubscribeMccs();
      unsubscribeSellers();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || mccs.length === 0) return;

    // Simple single-field date query to bypass any custom composite index requirement
    const q = query(
      collection(db, 'rejects'), 
      where('date', '>=', startDate), 
      where('date', '<=', endDate)
    );

    const unsubscribeRecords = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));

    return () => {
      unsubscribeRecords();
    };
  }, [profile, mccs, startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      alert('You do not have permission to record rejects.');
      return;
    }
    if (!formData.mccId) {
      alert('Please select an MCC first.');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    const data = {
      ...formData,
      phAcidity: String(formData.phAcidity || '').replace(',', '.'),
      litersRejected: Number(formData.litersRejected),
      temp: Number(String(formData.temp || 0).replace(',', '.')),
      recordedBy: profile?.fullName || profile?.email || 'System',
      createdAt: new Date().toISOString()
    };

    try {
      if (selectedRecord) {
        await updateDoc(doc(db, 'rejects', selectedRecord.id), data);
        setSuccessMessage('Reject record updated successfully!');
      } else {
        await addDoc(collection(db, 'rejects'), data);
        setSuccessMessage('Reject record saved successfully!');
      }
      setIsAdding(false);
      setSelectedRecord(null);
      setFormData({ ...formData, sellerName: '', litersRejected: '', temp: '', phAcidity: '', remarks: '' });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      console.error('Error saving reject:', error);
      let errorText = 'Failed to save record. Please try again.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error && parsed.error.includes('permissions')) {
          errorText = 'Permission denied. Your account does not have permission to write here.';
        }
      } catch (e) {
        if (error.message.includes('permissions')) {
          errorText = 'Permission denied. Your account does not have permission to write here.';
        }
      }
      setErrorMessage(errorText);
      handleFirestoreError(error, selectedRecord ? OperationType.UPDATE : OperationType.CREATE, 'rejects');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (rec: any) => {
    setSelectedRecord(rec);
    setFormData({
      mccId: rec.mccId,
      sellerName: rec.sellerName,
      time: rec.time,
      litersRejected: rec.litersRejected.toString(),
      temp: rec.temp?.toString() || '',
      phAcidity: rec.phAcidity || '',
      rejectionReason: rec.rejectionReason,
      testCode: rec.testCode,
      actionTaken: rec.actionTaken,
      remarks: rec.remarks || '',
      date: rec.date
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSort = (field: 'date' | 'litersRejected') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: 'date' | 'litersRejected' }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-20 group-hover:opacity-100 transition-opacity" />;
    return sortOrder === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />;
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Milk Rejects Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Period: ${safeFormat(startDate, 'dd/MM/yyyy')} to ${safeFormat(endDate, 'dd/MM/yyyy')}`, 14, 30);
    doc.text(`Total Rejected: ${formatNumber(totalRejected, 2)} L`, 14, 36);

    const tableData = filteredRecords.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        comparison = Number(a[sortField]) - Number(b[sortField]);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    }).map((rec, index) => [
      index + 1,
      safeFormat(rec.date, 'dd/MM/yyyy'),
      rec.time,
      mccs.find(m => m.id === rec.mccId)?.name || rec.mccId,
      rec.sellerName,
      `${formatNumber(rec.litersRejected, 2)} L`,
      REJECTION_REASONS.find(r => r.code === rec.rejectionReason)?.reason || rec.rejectionReason,
      rec.actionTaken
    ]);

    (doc as any).autoTable({
      startY: 42,
      head: [['#', 'Date', 'Time', 'MCC', 'Seller', 'Volume', 'Reason', 'Action']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] }, // Red header to match Rejects theme
      styles: { fontSize: 8 }
    });

    doc.save(`Milk_Rejects_${safeFormat(startDate, 'dd-MM-yyyy')}_to_${safeFormat(endDate, 'dd-MM-yyyy')}.pdf`);
  };

  const exportToExcel = () => {
    const data = filteredRecords.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        comparison = Number(a[sortField]) - Number(b[sortField]);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    }).map((rec, index) => ({
      'Sno#': index + 1,
      Date: safeFormat(rec.date, 'dd/MM/yyyy'),
      Time: rec.time,
      MCC: mccs.find(m => m.id === rec.mccId)?.name || rec.mccId,
      Seller: rec.sellerName,
      'Volume (L)': formatNumber(rec.litersRejected, 1, false, true),
      'Temp (°C)': rec.temp ? formatNumber(rec.temp, 1) : '',
      'pH/Acidity': rec.phAcidity ? formatNumber(rec.phAcidity, 2) : '',
      Reason: REJECTION_REASONS.find(r => r.code === rec.rejectionReason)?.reason || rec.rejectionReason,
      'Test Code': TEST_CODES.find(t => t.code === rec.testCode)?.name || rec.testCode,
      'Action Taken': rec.actionTaken,
      Remarks: rec.remarks || '',
      'Recorded By': rec.recordedBy || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rejects");
    XLSX.writeFile(wb, `Milk_Rejects_${safeFormat(startDate, 'dd-MM-yyyy')}_to_${safeFormat(endDate, 'dd-MM-yyyy')}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredRecords = records.filter(rec => {
    const matchesSearch = rec.sellerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Client-side MCC filter / access bounds
    let matchesMcc = true;
    if (!isGlobalViewer) {
      if (profile?.mccIds && profile.mccIds.length > 0) {
        const mccNames = profile.mccIds.map(id => mccs.find(m => m.id === id)?.name).filter(Boolean);
        const allowedIds = [...profile.mccIds, ...mccNames];
        matchesMcc = allowedIds.includes(rec.mccId) || allowedIds.some(n => rec.mccId?.includes(n));
      } else {
        matchesMcc = false;
      }
    } else if (mccFilter !== 'all') {
      const mccName = mccs.find(m => m.id === mccFilter)?.name;
      const allowedIds = [mccFilter];
      if (mccName) allowedIds.push(mccName);
      matchesMcc = allowedIds.includes(rec.mccId) || allowedIds.some(n => rec.mccId?.includes(n));
    }
    
    return matchesSearch && matchesMcc;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortField === 'date') {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      comparison = dateA - dateB;
    } else {
      comparison = Number(a[sortField]) - Number(b[sortField]);
    }
    
    if (comparison === 0) {
      comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  const totalRejected = filteredRecords.reduce((sum, rec) => sum + (Number(rec.litersRejected) || 0), 0);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Milk Rejects</h1>
          <p className="text-on-surface-variant text-sm">Record and track rejected milk quality issues</p>
        </div>
        {canWrite && (
          <button 
            onClick={() => {
              if (isAdding) {
                setIsAdding(false);
                setSelectedRecord(null);
                setFormData({ ...formData, sellerName: '', litersRejected: '', temp: '', phAcidity: '', remarks: '' });
              } else {
                setIsAdding(true);
              }
            }} 
            className="bg-error text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg"
          >
            {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Record Reject'}
          </button>
        )}
      </div>

      {/* Summary Banner */}
      <div className="bg-red-600 text-white p-5 rounded-[2rem] shadow-xl flex items-center justify-between overflow-hidden relative">
        <div className="relative z-10">
          <h2 className="text-[10px] font-bold opacity-80 uppercase tracking-widest mb-1">Total Milk Rejected</h2>
          <p className="text-4xl font-black">{formatNumber(totalRejected, 1, true)} L</p>
          <p className="text-[10px] mt-2 opacity-60 font-medium italic">Cumulative verification skip</p>
        </div>
        <AlertTriangle className="absolute -right-6 -bottom-6 w-32 h-32 opacity-10 rotate-12" />
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <label className="text-[9px] font-black uppercase text-on-surface-variant opacity-60 mb-2 block tracking-widest">Search Sellers</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search seller name..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm h-10"
            />
          </div>
        </div>

        <DateInput 
          value={startDate} 
          onChange={setStartDate} 
          label="From"
          className="w-44"
        />
        <DateInput 
          value={endDate} 
          onChange={setEndDate} 
          label="To"
          className="w-44"
        />

        {isGlobalViewer && (
          <div className="w-44">
            <label className="text-[9px] font-black uppercase opacity-60 mb-2 block tracking-widest">MCC Filter</label>
            <div className="flex items-center gap-2 relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" size={18} />
              <select 
                value={mccFilter} 
                onChange={e => setMccFilter(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 appearance-none"
              >
                <option value="all">All MCCs</option>
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handlePrint} className="p-2 bg-white border border-outline-variant/30 rounded-xl hover:bg-surface-dim transition-colors" title="Print List">
            <Printer size={20} />
          </button>
          <button onClick={exportToExcel} className="p-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors" title="Export to Excel">
            <FileSpreadsheet size={20} />
          </button>
          <button onClick={exportToPDF} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors" title="Export to PDF">
            <FileText size={20} />
          </button>
        </div>
      </div>

      <Modal
        isOpen={isAdding}
        onClose={() => {
          setIsAdding(false);
          setSelectedRecord(null);
          setFormData({ ...formData, sellerName: '', litersRejected: '', temp: '', phAcidity: '', remarks: '' });
        }}
        title={selectedRecord ? "Edit Reject Record" : "Record New Reject"}
        icon={<AlertTriangle size={20} />}
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
                value={formData.date} 
                onChange={val => setFormData({...formData, date: val})} 
                label="Rejection Date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Seller / Supplier Name</label>
              <TypeAhead
                items={sellers.filter(s => 
                  !formData.mccId || 
                  (s.mccIds && s.mccIds.includes(formData.mccId)) || 
                  mccs.find(m => m.id === formData.mccId)?.name === s.mccId
                )}
                onSelect={(seller) => {
                  setFormData({...formData, sellerName: seller.name});
                }}
                onClear={() => {
                  setFormData({...formData, sellerName: ''});
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
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Time of Rejection</label>
              <input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Liters Rejected</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any" 
                  value={formData.litersRejected} 
                  onChange={e => setFormData({...formData, litersRejected: e.target.value})} 
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                  placeholder="0.00"
                  required 
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase tracking-widest">Liters</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Temp (°C)</label>
              <div className="relative">
                <input 
                  type="text" 
                  inputMode="decimal" 
                  value={formData.temp} 
                  onChange={e => setFormData({...formData, temp: e.target.value.replace(',', '.')})} 
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" 
                  placeholder="---"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase tracking-widest">Celsius</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">pH / Acidity</label>
              <input type="text" inputMode="decimal" value={formData.phAcidity} onChange={e => setFormData({...formData, phAcidity: e.target.value.replace(',', '.')})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" placeholder="e.g. 6.7" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Rejection Reason</label>
              <select value={formData.rejectionReason} onChange={e => setFormData({...formData, rejectionReason: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black">
                {REJECTION_REASONS.map(r => <option key={r.code} value={r.code}>{r.code} - {r.reason}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Quality Test Performed</label>
              <select value={formData.testCode} onChange={e => setFormData({...formData, testCode: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black">
                {TEST_CODES.map(t => <option key={t.code} value={t.code}>{t.code} - {t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Action Taken</label>
              <input value={formData.actionTaken} onChange={e => setFormData({...formData, actionTaken: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black" required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Additional Remarks</label>
            <textarea value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-20 p-4 font-medium" placeholder="Add any additional notes..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            {errorMessage && <span className="text-error font-bold text-xs flex items-center gap-2 mr-auto bg-error/5 px-3 py-2 rounded-xl">
              <AlertTriangle size={14} /> {errorMessage}
            </span>}
            <button 
              type="button" 
              onClick={() => {
                setIsAdding(false);
                setSelectedRecord(null);
              }}
              className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-error text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-error/20 hover:shadow-error/40 transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest flex items-center gap-2"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save size={18} />
              )}
              {isSubmitting ? 'Saving...' : selectedRecord ? 'Update Record' : 'Save Reject Record'}
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[9px] uppercase tracking-widest text-on-surface-variant font-black">
            <tr>
              <th className="px-5 py-2.5">#</th>
              <th 
                className="px-5 py-2.5 cursor-pointer hover:bg-surface-container-high transition-colors group"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-2">
                  Date/Time
                  <SortIcon field="date" />
                </div>
              </th>
              {isGlobalViewer && <th className="px-5 py-2.5">MCC</th>}
              <th className="px-5 py-2.5">Seller</th>
              <th 
                className="px-5 py-2.5 cursor-pointer hover:bg-surface-container-high transition-colors group"
                onClick={() => handleSort('litersRejected')}
              >
                <div className="flex items-center gap-2">
                  Liters
                  <SortIcon field="litersRejected" />
                </div>
              </th>
              <th className="px-5 py-2.5">Reason</th>
              <th className="px-5 py-2.5">Test</th>
              <th className="px-5 py-2.5">Action</th>
              <th className="px-5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {filteredRecords.map((rec, index) => (
              <tr key={rec.id} className="hover:bg-surface-container-lowest transition-colors whitespace-nowrap">
                <td className="px-5 py-2.5 text-[10px] font-black text-on-surface-variant opacity-30 text-center">{index + 1}</td>
                <td className="px-5 py-2.5 text-[11px]">
                  <div className="font-black">{safeFormat(rec.date, 'dd/MM/yyyy')}</div>
                  <div className="text-[9px] opacity-60 flex items-center gap-1 font-bold"><Clock size={10} /> {rec.time}</div>
                </td>
                {isGlobalViewer && (
                  <td className="px-5 py-2.5 text-[10px] font-black uppercase text-primary tracking-tighter truncate max-w-[100px]">
                    {mccs.find(m => m.id === rec.mccId)?.name || (mccs.some(m => m.name === rec.mccId) ? rec.mccId : 'Unknown')}
                  </td>
                )}
                <td className="px-5 py-2.5 text-xs font-black truncate max-w-[150px]">{rec.sellerName}</td>
                <td className="px-5 py-2.5 text-[11px] font-black text-error">{formatNumber(rec.litersRejected, 1, true)} L</td>
                <td className="px-5 py-2.5 text-[10px]">
                  <span className="font-black text-primary">{rec.rejectionReason}</span>
                  <p className="text-[9px] opacity-60 truncate max-w-[150px] font-bold uppercase tracking-tighter">
                    {REJECTION_REASONS.find(r => r.code === rec.rejectionReason)?.reason}
                  </p>
                </td>
                <td className="px-5 py-2.5 text-[10px]">
                  <span className="font-black text-secondary">{rec.testCode}</span>
                  <p className="text-[9px] opacity-60 truncate max-w-[150px] font-bold uppercase tracking-tighter">
                    {TEST_CODES.find(t => t.code === rec.testCode)?.name}
                  </p>
                </td>
                <td className="px-5 py-2.5 text-[10px] font-medium">{rec.actionTaken}</td>
                <td className="px-5 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canWrite && (
                      <>
                        <button 
                          onClick={() => handleEdit(rec)}
                          className="p-1 text-primary hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={async () => { 
                            if(window.confirm('Delete this record?')) {
                              try {
                                await deleteDoc(doc(db, 'rejects', rec.id));
                              } catch (error) {
                                handleFirestoreError(error, OperationType.DELETE, `rejects/${rec.id}`);
                              }
                            }
                          }} 
                          className="p-1 text-error hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
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
            <Beaker className="mx-auto text-outline-variant mb-4" size={48} />
            <p className="text-on-surface-variant">No reject records found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
