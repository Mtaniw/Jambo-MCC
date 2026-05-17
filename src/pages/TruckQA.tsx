import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, Edit2, X, Truck, Beaker, CheckCircle2, AlertCircle, QrCode, FileText, Download, Eye, Save, Search, FileSpreadsheet, Printer, Share2 } from 'lucide-react';
import { cn, formatNumber, formatNumberInput } from '../lib/utils';
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, parseTanzaniaDate, safeFormat, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { RESAZURIN_SCALE, getResazurinGrade } from '../lib/qualityConstants';
import { ResazurinBadge } from '../components/ResazurinBadge';
import { TypeAhead } from '../components/TypeAhead';
import { ImportModal } from '../components/ImportModal';
import { Upload } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function TruckQA() {
  const { profile, effectiveRole } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [showScanner, setShowScanner] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: getTanzaniaTodayStr()
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [mccFilter, setMccFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [settings, setSettings] = useState<any>(null);

  const allowedRoles = ['Quality Controller', 'Cashier', 'Factory Clerk', 'Manager', 'Admin', 'Supervisor', 'Super User', 'Director'];
  const hasAccess = profile && (profile.role === 'Admin' || allowedRoles.includes(effectiveRole as string));

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || !['Supervisor', 'Manager', 'Director', 'Cashier'].includes(effectiveRole as string));

  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const matchesSearch = rec.truckReg.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           rec.driverName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
      
      return matchesSearch && matchesMcc;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      let comparison = dateA - dateB;
      if (comparison === 0) {
        comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [records, searchTerm, mccFilter, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData || !canWrite) return;

    try {
      const docRef = doc(db, 'truck_qa', editData.id);
      const { id, ...updatePayload } = editData;
      
      // Validation
      if (Number(updatePayload.tempAtLoading) < 0 || Number(updatePayload.tempAtLoading) > 40) {
        alert('Temperature must be between 0 and 40°C');
        return;
      }
      if (Number(updatePayload.ph) < 0 || Number(updatePayload.ph) > 14) {
        alert('pH must be between 0 and 14');
        return;
      }

      const finalData = {
        ...updatePayload,
        litresLoaded: Number(updatePayload.litresLoaded),
        weightKg: Number(updatePayload.weightKg),
        tempAtLoading: Number(updatePayload.tempAtLoading),
        ph: Number(updatePayload.ph),
        density: Number(updatePayload.density),
        qtyReceived: Number(updatePayload.qtyReceived || 0),
        qtyRejected: Number(updatePayload.qtyRejected || 0),
      };

      await updateDoc(docRef, finalData);
      setExpandedId(null);
      setEditData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'truck_qa');
      alert('Failed to update record. Please try again.');
    }
  };

  const [formData, setFormData] = useState({
    mccId: '',
    date: getTanzaniaTodayStr(),
    truckReg: '',
    driverName: '',
    driverPhone: '',
    litresLoaded: '',
    weightKg: '',
    tempAtLoading: '',
    sealNo: '',
    organoleptic: 'Normal',
    ph: '6.7',
    alcoholTest: 'Pass',
    density: '1.030',
    resazurin: '6',
    h2o2: 'Pass',
    neutralizers: 'Pass',
    clotOnBoiling: 'No Clot',
    antibiotic: 'Negative',
    qtyReceived: '',
    qtyRejected: '0',
    remarks: ''
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0 && !formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'drivers'));

    let q = query(collection(db, 'truck_qa'), where('date', '>=', dateRange.start), where('date', '<=', dateRange.end));
    let canQuery = true;
    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        q = query(collection(db, 'truck_qa'), where('mccId', 'in', profile.mccIds), where('date', '>=', dateRange.start), where('date', '<=', dateRange.end));
      } else {
        canQuery = false;
        setRecords([]);
        setLoading(false);
      }
    }

    let unsubscribeRecords = () => {};
    if (canQuery) {
      unsubscribeRecords = onSnapshot(q, (snapshot) => {
        setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'truck_qa'));
    }

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global_config'));

    return () => {
      unsubscribeMccs();
      unsubscribeDrivers();
      unsubscribeRecords();
      unsubscribeSettings();
    };
  }, [profile, isGlobalViewer, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        setFormData(prev => ({ ...prev, truckReg: decodedText }));
        setShowScanner(false);
        scanner.clear();
      }, (error) => {
        // console.warn(error);
      });
      return () => {
        scanner.clear().catch(err => console.error("Failed to clear scanner", err));
      };
    }
  }, [showScanner]);

  useEffect(() => {
    if (formData.truckReg) {
      const driver = drivers.find(d => d.tankerReg.toLowerCase() === formData.truckReg.toLowerCase());
      if (driver) {
        setFormData(prev => ({
          ...prev,
          driverName: driver.name,
          driverPhone: driver.phone || '',
        }));
      }
    }
  }, [formData.truckReg, drivers]);

  useEffect(() => {
    const litres = Number(formData.litresLoaded);
    const density = Number(formData.density);
    if (litres && density) {
      const weight = formatNumberInput(litres * density, 2);
      if (weight !== formData.weightKg) {
        setFormData(prev => ({ ...prev, weightKg: weight }));
      }
    }
  }, [formData.litresLoaded, formData.density, formData.weightKg]);

  useEffect(() => {
    if (editData) {
      const litres = Number(editData.litresLoaded);
      const density = Number(editData.density);
      if (litres && density) {
        const weight = formatNumberInput(litres * density, 2);
        if (weight !== editData.weightKg) {
          setEditData(prev => prev ? ({ ...prev, weightKg: weight }) : null);
        }
      }
    }
  }, [editData?.litresLoaded, editData?.density, editData?.weightKg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (Number(formData.tempAtLoading) < 0 || Number(formData.tempAtLoading) > 40) {
      alert('Temperature must be between 0 and 40°C');
      return;
    }
    if (Number(formData.ph) < 0 || Number(formData.ph) > 14) {
      alert('pH must be between 0 and 14');
      return;
    }
    if (Number(formData.density) < 1 || Number(formData.density) > 1.1) {
      alert('Density must be between 1.000 and 1.100');
      return;
    }

    try {
      const data = {
        ...formData,
        litresLoaded: Number(formData.litresLoaded),
        weightKg: Number(formData.weightKg),
        tempAtLoading: Number(formData.tempAtLoading),
        ph: Number(formData.ph),
        density: Number(formData.density),
        qtyReceived: formData.qtyReceived ? Number(formData.qtyReceived) : null,
        qtyRejected: formData.qtyRejected ? Number(formData.qtyRejected) : 0,
        qualityController: profile?.fullName,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'truck_qa'), data);
      setIsAdding(false);
      setFormData({ ...formData, truckReg: '', driverName: '', litresLoaded: '', weightKg: '', tempAtLoading: '', sealNo: '', remarks: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'truck_qa');
      alert('Failed to save record. Please try again.');
    }
  };

  const handleImport = async (data: any[]) => {
    const now = new Date().toISOString();
    for (const row of data) {
      const mcc = mccs.find(m => m.name.toLowerCase() === String(row.MCC).toLowerCase() || m.id === String(row.MCC));
      if (!mcc) throw new Error(`MCC "${row.MCC}" not found.`);

      const litres = Number(row.LitresLoaded);
      const density = Number(row.Density || 1.030);
      const weight = Number(row.WeightKg || formatNumber(litres * density, 2));

      await addDoc(collection(db, 'truck_qa'), {
        mccId: mcc.id,
        date: row.Date,
        truckReg: row.TruckReg,
        driverName: row.DriverName || 'Unknown',
        driverPhone: row.DriverPhone || '',
        litresLoaded: litres,
        weightKg: weight,
        sealNo: row.SealNo || '',
        tempAtLoading: Number(row.Temp || 4),
        ph: Number(row.PH || 6.7),
        alcoholTest: row.AlcoholTest || 'Pass',
        density: density,
        resazurin: String(row.Resazurin || '6'),
        antibiotic: row.Antibiotic || 'Negative',
        organoleptic: row.Organoleptic || 'Normal',
        qtyReceived: row.QtyReceived ? Number(row.QtyReceived) : null,
        qtyRejected: Number(row.QtyRejected || 0),
        qualityController: row.QualityController || row.Grader || profile?.fullName || '',
        remarks: row.Remarks || 'Imported',
        createdAt: now,
        updatedAt: now,
        recordedBy: profile?.email
      });
    }
  };

  const generatePDF = (rec: any) => {
    const doc = new jsPDF();
    const mccName = mccs.find(m => m.id === rec.mccId)?.name || 'Unknown MCC';
    
    doc.setFontSize(20);
    doc.text("Truck Quality Assurance Report", 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Report Date: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 25);
    doc.text(`MCC: ${mccName}`, 14, 32);
    doc.text(`Truck Reg: ${rec.truckReg}`, 14, 39);
    doc.text(`Driver: ${rec.driverName}`, 14, 46);
    doc.text(`Milk Loaded: ${formatNumber(rec.litresLoaded, 2)} L`, 14, 53);
    doc.text(`Weight: ${formatNumber(rec.weightKg, 2)} KG`, 14, 60);
    doc.text(`Seal No: ${rec.sealNo || 'N/A'}`, 14, 67);

    const qaData = [
      ['Parameter', 'Result', 'Status'],
      ['Temperature', `${formatNumber(rec.tempAtLoading, 2)}°C`, rec.tempAtLoading <= 6 ? 'Pass' : 'Fail'],
      ['pH', formatNumber(rec.ph, 2), (rec.ph >= 6.6 && rec.ph <= 6.8) ? 'Pass' : 'Fail'],
      ['Alcohol Test', rec.alcoholTest, rec.alcoholTest === 'Pass' ? 'Pass' : 'Fail'],
      ['Density', formatNumber(rec.density, 3), (rec.density >= 1.028 && rec.density <= 1.032) ? 'Pass' : 'Fail'],
      ['Resazurin', `${getResazurinGrade(rec.resazurin).label} - ${getResazurinGrade(rec.resazurin).description}`, Number(rec.resazurin) >= 4 ? 'Pass' : 'Fail'],
      ['Antibiotic', rec.antibiotic, rec.antibiotic === 'Negative' ? 'Pass' : 'Fail'],
      ['Organoleptic', rec.organoleptic, rec.organoleptic === 'Normal' ? 'Pass' : 'Fail'],
      ['H2O2', rec.h2o2 || 'N/A', rec.h2o2 === 'Pass' ? 'Pass' : 'Fail'],
      ['Neutralizers', rec.neutralizers || 'N/A', rec.neutralizers === 'Pass' ? 'Pass' : 'Fail'],
    ];

    (doc as any).autoTable({
      startY: 75,
      head: [qaData[0]],
      body: qaData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] },
    });

    doc.text(`Quality Controller: ${rec.qualityController || rec.grader || 'N/A'}`, 14, (doc as any).lastAutoTable.finalY + 15);
    doc.text(`Remarks: ${rec.remarks || 'None'}`, 14, (doc as any).lastAutoTable.finalY + 22);

    doc.save(`QA_Report_${rec.truckReg}_${safeFormat(rec.date, 'dd-MM-yyyy')}.pdf`);
  };

  const exportAllToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Truck Dispatch & QA Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Period: ${safeFormat(dateRange.start, 'dd/MM/yyyy')} to ${safeFormat(dateRange.end, 'dd/MM/yyyy')}`, 14, 30);

    const tableData = filteredRecords.map(rec => [
      safeFormat(rec.date, 'dd/MM/yyyy'),
      rec.truckReg,
      rec.driverName,
      `${formatNumber(rec.litresLoaded, 2)} L`,
      `${rec.qtyReceived ? formatNumber(rec.qtyReceived, 2) : '---'} L`,
      `${rec.qtyReceived ? (rec.qtyReceived - rec.litresLoaded > 0 ? '+' : '') + formatNumber(rec.qtyReceived - rec.litresLoaded, 2) : '---'} L`,
      `${formatNumber(rec.tempAtLoading, 2)}°C`,
      rec.factoryStatus || 'In Transit'
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['Date', 'Truck', 'Driver', 'Loaded', 'Received', 'Diff', 'Temp', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Truck_QA_Export_${safeFormat(dateRange.start, 'dd-MM-yyyy')}_${safeFormat(dateRange.end, 'dd-MM-yyyy')}.pdf`);
  };

  const exportAllToExcel = () => {
    const data = filteredRecords.map(rec => ({
      Date: safeFormat(rec.date, 'dd/MM/yyyy'),
      'Truck Reg': rec.truckReg,
      Driver: rec.driverName,
      'Litres Loaded': rec.litresLoaded,
      'Weight (KG)': rec.weightKg,
      'Temp (°C)': rec.tempAtLoading,
      pH: rec.ph,
      Alcohol: rec.alcoholTest,
      Density: rec.density,
      Resazurin: rec.resazurin,
      Antibiotic: rec.antibiotic,
      'Qty Received': rec.qtyReceived || 0,
      'Difference (L)': rec.qtyReceived ? (rec.qtyReceived - rec.litresLoaded) : 0,
      'Qty Rejected': rec.qtyRejected || 0,
      Status: rec.factoryStatus || 'In Transit',
      'Quality Controller': rec.qualityController || rec.grader || '',
      Remarks: rec.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Truck QA");
    XLSX.writeFile(wb, `Truck_QA_Export_${safeFormat(dateRange.start, 'dd-MM-yyyy')}_${safeFormat(dateRange.end, 'dd-MM-yyyy')}.xlsx`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const doc = new jsPDF();
        doc.text('Truck Dispatch & QA Report', 14, 22);
        const tableData = filteredRecords.map(rec => [
          safeFormat(rec.date, 'dd/MM/yyyy'),
          rec.truckReg,
          rec.driverName,
          formatNumber(rec.litresLoaded, 2),
          rec.factoryStatus || 'In Transit'
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['Date', 'Truck', 'Driver', 'Liters', 'Status']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `Truck_QA_${format(new Date(), 'dd-MM-yyyy')}.pdf`, { type: 'application/pdf' });

        await navigator.share({
          title: 'Truck Dispatch & QA Report',
          text: `Summary of tanker dispatches for ${safeFormat(dateRange.start, 'dd/MM/yyyy')} - ${safeFormat(dateRange.end, 'dd/MM/yyyy')}`,
          files: [file]
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Sharing is not supported on this browser. Please use the Download buttons.');
    }
  };

  const stats = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => {
      const loaded = Number(rec.litresLoaded || 0);
      const received = Number(rec.qtyReceived || 0);
      const rejected = Number(rec.qtyRejected || 0);
      
      acc.totalLoaded += loaded;
      acc.totalReceived += received;
      acc.totalRejected += rejected;
      acc.totalDiff += (rec.qtyReceived ? (received - loaded) : 0);
      
      return acc;
    }, {
      totalLoaded: 0,
      totalReceived: 0,
      totalRejected: 0,
      totalDiff: 0
    });
  }, [filteredRecords]);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-xl border border-outline-variant/20 shadow-sm">
        <AlertCircle size={48} className="text-error mb-4" />
        <h2 className="text-xl font-bold text-on-surface">Access Restricted</h2>
        <p className="text-on-surface-variant">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Truck & Quality Assurance</h1>
          <p className="text-on-surface-variant text-sm">Tanker dispatch and lab test results</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all">
              <Upload size={18} /> Import
            </button>
          )}
          {canWrite && (
            <button onClick={() => setIsAdding(!isAdding)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'New Dispatch'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Search Records</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search Truck Reg or Driver..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg text-sm h-10 transition-colors focus:bg-surface-container-high"
            />
          </div>
        </div>

        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">MCC Filter</label>
          <select 
            value={mccFilter} 
            onChange={e => setMccFilter(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 transition-colors focus:bg-surface-container-high px-3"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>

        <div className="w-44">
          <DateInput 
            value={dateRange.start} 
            onChange={val => setDateRange(prev => ({ ...prev, start: val }))}
            label="From"
          />
        </div>

        <div className="w-44">
          <DateInput 
            value={dateRange.end} 
            onChange={val => setDateRange(prev => ({ ...prev, end: val }))}
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

        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white border border-outline-variant/30 rounded-lg hover:bg-surface-dim transition-colors" title="Print List">
            <Printer size={20} />
          </button>
          <button onClick={exportAllToExcel} className="p-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors" title="Export to Excel">
            <FileSpreadsheet size={20} />
          </button>
          <button onClick={exportAllToPDF} className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors" title="Export to PDF">
            <FileText size={20} />
          </button>
          <button onClick={handleShare} className="p-2 bg-secondary/10 text-secondary rounded-lg hover:bg-secondary/20 transition-colors" title="Share Report">
            <Share2 size={20} />
          </button>
        </div>
        <div className="text-xs text-on-surface-variant font-medium ml-auto">
          Showing {filteredRecords.length} records
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Truck size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Total Dispatched</span>
            </div>
            <div className="mt-auto">
              <h2 className="text-3xl font-black text-on-surface">{formatNumber(stats.totalLoaded, 2)} L</h2>
              <p className="text-[10px] text-on-surface-variant mt-1 font-medium italic">Estimated volume sent from MCCs</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-green-600 mb-2">
                <CheckCircle2 size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Actual Received</span>
            </div>
            <div className="mt-auto">
                <h2 className="text-3xl font-black text-on-surface">{formatNumber(stats.totalReceived, 2)} L</h2>
                <p className="text-[10px] text-on-surface-variant mt-1 font-medium italic">Volume verified at collection point</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className={cn(
            "absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110",
            stats.totalDiff >= 0 ? "bg-green-50" : "bg-red-50"
          )}></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className={cn(
              "flex items-center gap-2 mb-2",
              stats.totalDiff >= 0 ? "text-green-600" : "text-error"
            )}>
                <AlertCircle size={18} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Total Difference</span>
            </div>
            <div className="mt-auto">
                <h2 className={cn(
                  "text-3xl font-black",
                  stats.totalDiff >= 0 ? "text-green-600" : "text-error"
                )}>
                  {stats.totalDiff > 0 ? '+' : ''}{formatNumber(stats.totalDiff, 2)} L
                </h2>
                <p className="text-[10px] text-on-surface-variant mt-1 font-medium italic">Variance between sent and received</p>
            </div>
          </div>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">MCC</label>
              <select value={formData.mccId} onChange={e => setFormData({...formData, mccId: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required>
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
              <label className="text-xs font-bold uppercase tracking-wider">Truck Reg No.</label>
              <div className="flex gap-2">
                <TypeAhead
                  className="flex-1"
                  items={drivers}
                  onSelect={(driver) => {
                    setFormData({...formData, truckReg: driver.tankerReg});
                  }}
                  onClear={() => {
                    setFormData({...formData, truckReg: '', driverName: '', driverPhone: ''});
                  }}
                  labelExtractor={(d) => d.tankerReg}
                  subLabelExtractor={(d) => d.name}
                  placeholder="T 123 ABC"
                  defaultValue={formData.truckReg}
                  required
                />
                <button type="button" onClick={() => setShowScanner(!showScanner)} className="p-2 bg-surface-container-low rounded-lg text-primary hover:bg-primary/10 transition-colors h-[38px] mt-auto">
                  <QrCode size={20} />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Driver Name</label>
              <input placeholder="Driver Full Name" value={formData.driverName} onChange={e => setFormData({...formData, driverName: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Driver Phone</label>
              <input placeholder="Phone Number" value={formData.driverPhone} onChange={e => setFormData({...formData, driverPhone: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Milk Loaded in Liters</label>
              <input type="number" placeholder="0" value={formData.litresLoaded} onChange={e => setFormData({...formData, litresLoaded: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Weight (KG)</label>
              <input 
                type="number" 
                placeholder="0" 
                value={formData.weightKg} 
                onChange={e => setFormData({...formData, weightKg: e.target.value})} 
                className="w-full bg-surface-container-low border-none rounded-lg text-sm" 
                readOnly
                title="Auto-calculated from Liters * Density"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Seal No.</label>
              <input placeholder="Seal Number" value={formData.sealNo} onChange={e => setFormData({...formData, sealNo: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
          </div>

          {showScanner && (
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
              <div id="reader" className="max-w-sm mx-auto overflow-hidden rounded-lg"></div>
              <p className="text-center text-xs mt-2 text-on-surface-variant">Scan Truck QR Code</p>
            </div>
          )}

          <div className="border-t border-outline-variant/10 pt-4">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><Beaker size={16} className="text-primary" /> Lab Test Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">Temp (°C)</label>
                <input type="number" step="0.1" value={formData.tempAtLoading} onChange={e => setFormData({...formData, tempAtLoading: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">pH (6.6-6.8)</label>
                <input type="number" step="0.1" value={formData.ph} onChange={e => setFormData({...formData, ph: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">Alcohol Test</label>
                <select value={formData.alcoholTest} onChange={e => setFormData({...formData, alcoholTest: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm">
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">Density</label>
                <input type="number" step="0.001" value={formData.density} onChange={e => setFormData({...formData, density: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold uppercase">Resazurin</label>
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getResazurinGrade(formData.resazurin).dotColor }}
                  ></div>
                </div>
                <select value={formData.resazurin} onChange={e => setFormData({...formData, resazurin: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm">
                  {RESAZURIN_SCALE.map(grade => (
                    <option key={grade.value} value={grade.value}>{grade.label} ({grade.description})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">Antibiotic</label>
                <select value={formData.antibiotic} onChange={e => setFormData({...formData, antibiotic: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm">
                  <option value="Negative">Negative</option>
                  <option value="Positive">Positive</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button type="submit" className="bg-primary text-white px-8 py-2 rounded-lg font-bold shadow-lg">Save Dispatch & QA</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-container-low font-bold uppercase text-[10px] tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-6 py-4 border-b border-outline-variant/10">Sent Date</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Received Date</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Truck</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">MCC</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Loaded (L)</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Received (L)</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Diff (L)</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Temp</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">pH</th>
              <th className="px-6 py-4 border-b border-outline-variant/10">Status</th>
              <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {paginatedRecords.map(rec => {
              const isTempFail = rec.tempAtLoading > 6;
              const isPhFail = rec.ph < 6.6 || rec.ph > 6.8;
              const isAlcoholFail = rec.alcoholTest === 'Fail';
              const isAntibioticFail = rec.antibiotic === 'Positive';
              const isOverallFail = isTempFail || isPhFail || isAlcoholFail || isAntibioticFail || rec.qtyRejected > 0;
              const isExpanded = expandedId === rec.id;

              return (
                <React.Fragment key={rec.id}>
                  <tr 
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedId(null);
                        setEditData(null);
                      } else {
                        setExpandedId(rec.id);
                        setEditData({...rec});
                      }
                    }}
                    className={cn(
                      "hover:bg-primary/5 transition-colors cursor-pointer group",
                      isExpanded && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-4 text-sm">{safeFormat(rec.date, 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-4 text-sm">
                      {rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : <span className="text-xs opacity-40 italic">Pending</span>}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold group-hover:text-primary transition-colors">{rec.truckReg}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="font-bold text-primary">{mccs.find(m => m.id === rec.mccId)?.name || 'Unknown'}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{formatNumber(rec.litresLoaded, 2)} L</td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600">
                      {rec.qtyReceived ? `${formatNumber(rec.qtyReceived, 2)} L` : '---'}
                    </td>
                    <td className={cn(
                      "px-6 py-4 text-sm font-bold",
                      !rec.qtyReceived ? "text-on-surface/30" :
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? "text-green-600" : 
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) < 0 ? "text-error" : "text-on-surface/30"
                    )}>
                      {rec.qtyReceived ? `${(Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? '+' : ''}${formatNumber(Number(rec.qtyReceived) - Number(rec.litresLoaded), 2)} L` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", isTempFail ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                        {formatNumber(rec.tempAtLoading, 2)}°C
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold", isPhFail ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                        {formatNumber(rec.ph, 2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {isOverallFail ? (
                        <span className="flex items-center gap-1 text-error text-[10px] font-bold uppercase bg-red-50 px-2 py-1 rounded-full w-fit"><AlertCircle size={12} /> Rejected</span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-[10px] font-bold uppercase bg-green-50 px-2 py-1 rounded-full w-fit"><CheckCircle2 size={12} /> Passed</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); generatePDF(rec); }} 
                          className="p-1 text-primary hover:bg-primary/10 rounded transition-colors" 
                          title="Download PDF"
                        >
                          <Download size={16} />
                        </button>
                        {canWrite && (
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              if(window.confirm('Delete record?')) await deleteDoc(doc(db, 'truck_qa', rec.id)); 
                            }} 
                            className="text-error p-1 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && editData && (
                    <tr>
                      <td colSpan={7} className="px-6 py-6 bg-surface-container-lowest border-y border-outline-variant/10">
                        <form onSubmit={handleUpdateRecord} className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Basic Info */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold flex items-center gap-2 text-primary border-b border-outline-variant/10 pb-2">
                                <Truck size={16} /> Basic Information
                              </h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">MCC</label>
                                  <select 
                                    value={editData.mccId} 
                                    onChange={e => setEditData({...editData, mccId: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm font-bold"
                                  >
                                    {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Truck Reg</label>
                                  <input 
                                    value={editData.truckReg} 
                                    onChange={e => setEditData({...editData, truckReg: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Driver</label>
                                  <input 
                                    value={editData.driverName} 
                                    onChange={e => setEditData({...editData, driverName: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Driver Phone</label>
                                  <input 
                                    value={editData.driverPhone || ''} 
                                    onChange={e => setEditData({...editData, driverPhone: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Seal No</label>
                                  <input 
                                    value={editData.sealNo} 
                                    onChange={e => setEditData({...editData, sealNo: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <DateInput 
                                    value={editData.date} 
                                    onChange={val => setEditData({...editData, date: val})}
                                    label="Date"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <DateInput 
                                    value={editData.receivedAt ? editData.receivedAt.split('T')[0] : ''} 
                                    onChange={val => setEditData({...editData, receivedAt: val ? val : null})}
                                    label="Received Date"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Quantities */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold flex items-center gap-2 text-primary border-b border-outline-variant/10 pb-2">
                                <FileText size={16} /> Quantities (L/KG)
                              </h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Milk Loaded in Liters</label>
                                  <input 
                                    type="number"
                                    value={editData.litresLoaded} 
                                    onChange={e => setEditData({...editData, litresLoaded: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                    required
                                  />
                                </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-60">Weight (KG)</label>
                <input 
                  type="number"
                  value={editData.weightKg} 
                  onChange={e => setEditData({...editData, weightKg: e.target.value})}
                  className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                  readOnly
                  title="Auto-calculated from Liters * Density"
                />
              </div>
              {editData.receivedAt && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase opacity-60">Qty Received</label>
                    <input 
                      type="number"
                      value={editData.qtyReceived} 
                      onChange={e => setEditData({...editData, qtyReceived: e.target.value})}
                      className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={cn(
                      "text-[10px] font-bold uppercase opacity-60",
                      (Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0)) > 0 ? "text-green-600" : 
                      (Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0)) < 0 ? "text-error" : "text-on-surface-variant"
                    )}>Difference (L)</label>
                    <div className={cn(
                      "w-full bg-surface-container-low border border-outline-variant/30 rounded p-2 text-sm font-bold",
                      (Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0)) > 0 ? "text-green-600" : 
                      (Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0)) < 0 ? "text-error" : "text-on-surface-variant"
                    )}>
                      {(Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0)) > 0 ? '+' : ''}
                      {formatNumber(Number(editData.qtyReceived || 0) - Number(editData.litresLoaded || 0), 2)} L
                    </div>
                  </div>
                </>
              )}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60 text-error">Qty Rejected</label>
                                  <input 
                                    type="number"
                                    value={editData.qtyRejected} 
                                    onChange={e => setEditData({...editData, qtyRejected: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm text-error font-bold"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Lab Results */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold flex items-center gap-2 text-primary border-b border-outline-variant/10 pb-2">
                                <Beaker size={16} /> Lab Test Results
                              </h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Temp (°C)</label>
                                  <input 
                                    type="number" step="0.1"
                                    value={editData.tempAtLoading} 
                                    onChange={e => setEditData({...editData, tempAtLoading: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">pH</label>
                                  <input 
                                    type="number" step="0.1"
                                    value={editData.ph} 
                                    onChange={e => setEditData({...editData, ph: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Alcohol</label>
                                  <select 
                                    value={editData.alcoholTest} 
                                    onChange={e => setEditData({...editData, alcoholTest: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  >
                                    <option value="Pass">Pass</option>
                                    <option value="Fail">Fail</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase opacity-60">Antibiotic</label>
                                  <select 
                                    value={editData.antibiotic} 
                                    onChange={e => setEditData({...editData, antibiotic: e.target.value})}
                                    className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                  >
                                    <option value="Negative">Negative</option>
                                    <option value="Positive">Positive</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold uppercase opacity-60">Resazurin</label>
                                  </div>
                                  <div className="space-y-2">
                                    <ResazurinBadge value={editData.resazurin || '6'} />
                                    <select 
                                      value={editData.resazurin || '6'} 
                                      onChange={e => setEditData({...editData, resazurin: e.target.value})}
                                      className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm"
                                    >
                                      {RESAZURIN_SCALE.map(grade => (
                                        <option key={grade.value} value={grade.value}>{grade.label} ({grade.description})</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-6 items-end border-t border-outline-variant/10 pt-6">
                            <div className="flex-1 space-y-1">
                              <label className="text-[10px] font-bold uppercase opacity-60">Remarks</label>
                              <textarea 
                                value={editData.remarks} 
                                onChange={e => setEditData({...editData, remarks: e.target.value})}
                                className="w-full bg-white border border-outline-variant/30 rounded p-2 text-sm h-20"
                                placeholder="Add any additional notes..."
                                disabled={!canWrite}
                              />
                            </div>
                            {canWrite && (
                              <div className="flex gap-3">
                                <button 
                                  type="button" 
                                  onClick={() => setExpandedId(null)}
                                  className="px-6 py-2 font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button 
                                  type="submit"
                                  className="bg-primary text-white px-8 py-2 rounded-lg font-bold shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2"
                                >
                                  <Save size={18} /> Update Dispatch
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-4 text-[10px] text-on-surface-variant opacity-60 font-medium">
                            <span>Quality Controller: {editData.qualityController || editData.grader}</span>
                            <span>•</span>
                            <span>Created: {safeFormat(editData.createdAt, 'dd/MM/yyyy HH:mm')}</span>
                            {editData.receivedBy && (
                              <>
                                <span>•</span>
                                <span>Received By: {editData.receivedBy}</span>
                              </>
                            )}
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant italic">No records found matching your search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredRecords.length > pageSize && (
        <div className="bg-surface-container-low/30 px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between">
          <div className="text-xs text-on-surface-variant font-medium">
            Showing <span className="font-bold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(currentPage * pageSize, filteredRecords.length)}</span> of <span className="font-bold text-on-surface">{filteredRecords.length}</span> dispatches
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-10 h-10 rounded-lg text-xs font-bold transition-all",
                      currentPage === pageNum ? "bg-primary text-white shadow-md" : "bg-white border border-outline-variant/30 hover:bg-surface-dim"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        title="Import Truck & QA Records"
        templateFileName="Truck_QA_Template.xlsx"
        templateData={[
          { Date: '2024-01-01', MCC: 'MCC Name or ID', TruckReg: 'T 123 ABC', DriverName: 'John Doe', LitresLoaded: 10000, Temp: 4, PH: 6.7, SealNo: 'S123' }
        ]}
        expectedColumns={['Date', 'MCC', 'TruckReg', 'LitresLoaded']}
      />
    </div>
  );
}
