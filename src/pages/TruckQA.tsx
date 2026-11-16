import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, Edit2, X, Truck, Beaker, CheckCircle2, AlertCircle, QrCode, FileText, Download, Eye, Save, Search, FileSpreadsheet, Printer, Share2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn, formatNumber, formatNumberInput, parseDecimal } from '../lib/utils';
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, parseTanzaniaDate, safeFormat, getTanzaniaDate, getSystemStartDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { RESAZURIN_SCALE, getResazurinGrade } from '../lib/qualityConstants';
import { ResazurinBadge } from '../components/ResazurinBadge';
import { TypeAhead } from '../components/TypeAhead';
import { ImportModal } from '../components/ImportModal';
import { Modal } from '../components/Modal';
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
  const [sortField, setSortField] = useState<'date' | 'litresLoaded'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [settings, setSettings] = useState<any>(null);

  const allowedRoles = ['Quality Controller', 'Cashier', 'Factory Clerk', 'Manager', 'Admin', 'Supervisor', 'Super User', 'Director'];
  const hasAccess = profile && (profile.role === 'Admin' || allowedRoles.includes(effectiveRole as string));

  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const isGlobalViewer = isActualAdmin || (profile && ['Factory Clerk', 'Supervisor', 'Manager', 'Director', 'Quality Controller', 'Cashier'].includes(effectiveRole as string));
  const canWrite = isActualAdmin || (profile && ['Quality Controller', 'Factory Clerk', 'Admin', 'Super User', 'Cashier'].includes(effectiveRole as string));
  const canDelete = isActualAdmin || (profile && ['Quality Controller', 'Cashier'].includes(effectiveRole as string));

  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const matchesSearch = rec.truckReg.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           rec.driverName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
      
      return matchesSearch && matchesMcc;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        comparison = dateA - dateB;
      } else {
        comparison = Number(a[sortField] || 0) - Number(b[sortField] || 0);
      }
      
      if (comparison === 0) {
        comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [records, searchTerm, mccFilter, sortField, sortOrder]);

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
      const parsedTemp = parseDecimal(updatePayload.tempAtLoading);
      const parsedPh = parseDecimal(updatePayload.ph);
      const parsedDensity = parseDecimal(updatePayload.density);

      if (isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 40) {
        alert('Temperature must be between 0 and 40°C');
        return;
      }
      if (isNaN(parsedPh) || parsedPh < 0 || parsedPh > 14) {
        alert('pH must be between 0 and 14');
        return;
      }
      if (isNaN(parsedDensity) || parsedDensity < 1 || parsedDensity > 1.1) {
        alert('Density must be between 1.000 and 1.100');
        return;
      }

      const finalData = {
        ...updatePayload,
        litresLoaded: parseDecimal(updatePayload.litresLoaded),
        weightKg: parseDecimal(updatePayload.weightKg),
        tempAtLoading: parsedTemp,
        ph: parsedPh,
        density: parsedDensity,
        qtyReceived: parseDecimal(updatePayload.qtyReceived || 0),
        qtyRejected: parseDecimal(updatePayload.qtyRejected || 0),
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
    sealNo: 'NIL',
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
    const litres = parseDecimal(formData.litresLoaded);
    const density = parseDecimal(formData.density);
    if (litres && density) {
      const weight = formatNumberInput(litres * density, 2);
      if (weight !== formData.weightKg) {
        setFormData(prev => ({ ...prev, weightKg: weight }));
      }
    }
  }, [formData.litresLoaded, formData.density, formData.weightKg]);

  useEffect(() => {
    if (editData) {
      const litres = parseDecimal(editData.litresLoaded);
      const density = parseDecimal(editData.density);
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
    const parsedTemp = parseDecimal(formData.tempAtLoading);
    const parsedPh = parseDecimal(formData.ph);
    const parsedDensity = parseDecimal(formData.density);

    if (isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 40) {
      alert('Temperature must be between 0 and 40°C');
      return;
    }
    if (isNaN(parsedPh) || parsedPh < 0 || parsedPh > 14) {
      alert('pH must be between 0 and 14');
      return;
    }
    if (isNaN(parsedDensity) || parsedDensity < 1 || parsedDensity > 1.1) {
      alert('Density must be between 1.000 and 1.100');
      return;
    }

    try {
      const data = {
        ...formData,
        litresLoaded: parseDecimal(formData.litresLoaded),
        weightKg: parseDecimal(formData.weightKg),
        tempAtLoading: parsedTemp,
        ph: parsedPh,
        density: parsedDensity,
        qtyReceived: formData.qtyReceived ? parseDecimal(formData.qtyReceived) : null,
        qtyRejected: formData.qtyRejected ? parseDecimal(formData.qtyRejected) : 0,
        qualityController: profile?.fullName || profile?.email || 'System',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'truck_qa'), data);
      setIsAdding(false);
      setFormData({ ...formData, truckReg: '', driverName: '', litresLoaded: '', weightKg: '', tempAtLoading: '', sealNo: 'NIL', remarks: '' });
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
        ph: Number(String(row.PH || 6.7).replace(',', '.')),
        alcoholTest: row.AlcoholTest || 'Pass',
        density: density,
        resazurin: String(row.Resazurin || '6'),
        antibiotic: row.Antibiotic || 'Negative',
        organoleptic: row.Organoleptic || 'Normal',
        qtyReceived: row.QtyReceived ? Number(row.QtyReceived) : null,
        qtyRejected: Number(row.QtyRejected || 0),
        qualityController: row.QualityController || row.Grader || profile?.fullName || profile?.email || 'System',
        remarks: row.Remarks || 'Imported',
        createdAt: now,
        updatedAt: now,
        recordedBy: profile?.fullName || profile?.email || 'System'
      });
    }
  };

  const handleSort = (field: 'date' | 'litresLoaded') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: 'date' | 'litresLoaded' }) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-20 group-hover:opacity-100 transition-opacity" />;
    return sortOrder === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />;
  };

  const generatePDF = (rec: any) => {
    const doc = new jsPDF();
    const mccName = mccs.find(m => m.id === rec.mccId)?.name || 'Unknown MCC';
    
    doc.setFontSize(20);
    doc.text("Truck Quality Assurance Report", 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Report Date: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 25);
    doc.text(`Sent Date: ${safeFormat(rec.date, 'dd/MM/yyyy')}`, 14, 32);
    doc.text(`Received Date: ${rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---'}`, 14, 39);
    doc.text(`MCC: ${mccName}`, 14, 46);
    doc.text(`Truck Reg: ${rec.truckReg}`, 14, 53);
    doc.text(`Driver: ${rec.driverName}`, 14, 60);
    doc.text(`Milk Loaded: ${formatNumber(rec.litresLoaded, 2, true, true)} L`, 14, 67);
    doc.text(`Weight: ${formatNumber(rec.weightKg, 2, true, true)} KG`, 14, 74);
    doc.text(`Seal No: ${rec.sealNo || 'N/A'}`, 14, 81);

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
      startY: 88,
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

    const tableData = filteredRecords.map((rec, index) => [
      index + 1,
      safeFormat(rec.date, 'dd/MM/yyyy'),
      rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
      rec.truckReg,
      rec.driverName,
      `${formatNumber(rec.litresLoaded, 2, true, true)} L`,
      `${rec.qtyReceived ? formatNumber(rec.qtyReceived, 2, true, true) : '---'} L`,
      `${rec.qtyReceived ? (rec.qtyReceived - rec.litresLoaded > 0 ? '+' : '') + formatNumber(rec.qtyReceived - rec.litresLoaded, 2, true, true) : '---'} L`,
      `${formatNumber(rec.tempAtLoading, 2)}°C`,
      rec.factoryStatus || 'In Transit'
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['#', 'Sent Date', 'Received Date', 'Truck', 'Driver', 'Loaded', 'Received', 'Diff', 'Temp', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Truck_QA_Export_${safeFormat(dateRange.start, 'dd-MM-yyyy')}_${safeFormat(dateRange.end, 'dd-MM-yyyy')}.pdf`);
  };

  const exportAllToExcel = () => {
    const data = filteredRecords.map((rec, index) => ({
      'Sno#': index + 1,
      'Sent Date': safeFormat(rec.date, 'dd/MM/yyyy'),
      'Received Date': rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
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
          rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
          rec.truckReg,
          rec.driverName,
          formatNumber(rec.litresLoaded, 2, true, true),
          rec.factoryStatus || 'In Transit'
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['Sent Date', 'Received Date', 'Truck', 'Driver', 'Liters', 'Status']],
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
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-on-surface">Truck & QA</h1>
          <p className="text-on-surface-variant font-medium text-sm">Tanker dispatch and quality assurance pulse</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={() => setShowImportModal(true)} className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-surface-container-highest transition-all">
              <Upload size={18} /> Import
            </button>
          )}
          {canWrite && (
            <button onClick={() => setIsAdding(true)} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              <Plus size={18} /> New Dispatch
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[9px] font-black uppercase text-on-surface-variant opacity-60 mb-2 block tracking-widest">Search Dispatch</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search Truck Reg or Driver..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg text-xs h-9 transition-colors focus:bg-surface-container-high"
            />
          </div>
        </div>

        <div className="w-40">
          <label className="text-[9px] font-black uppercase opacity-60 mb-2 block tracking-widest">MCC Filter</label>
          <select 
            value={mccFilter} 
            onChange={e => setMccFilter(e.target.value)}
            className="w-full px-3 py-1.5 bg-surface-container-low border-none rounded-lg text-[10px] font-black h-9 transition-colors focus:bg-surface-container-high uppercase tracking-tighter"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>

        <div className="w-36">
          <DateInput 
            value={dateRange.start} 
            onChange={val => setDateRange(prev => ({ ...prev, start: val }))}
            label="From"
          />
        </div>

        <div className="w-36">
          <DateInput 
            value={dateRange.end} 
            onChange={val => setDateRange(prev => ({ ...prev, end: val }))}
            label="To"
          />
        </div>

        <div className="w-36">
          <label className="text-[9px] font-black uppercase opacity-60 mb-2 block tracking-widest">Sort Order</label>
          <select 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value as any)}
            className="w-full px-3 py-1.5 bg-surface-container-low border-none rounded-lg text-[10px] font-black h-9 uppercase tracking-tighter"
          >
            <option value="desc">Recent first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white border border-outline-variant/30 rounded-xl hover:bg-surface-dim transition-colors" title="Print List">
            <Printer size={18} />
          </button>
          <button onClick={exportAllToExcel} className="p-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors" title="Export to Excel">
            <FileSpreadsheet size={18} />
          </button>
          <button onClick={exportAllToPDF} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors" title="Export to PDF">
            <FileText size={18} />
          </button>
          <button onClick={handleShare} className="p-2 bg-secondary/10 text-secondary rounded-xl hover:bg-secondary/20 transition-colors" title="Share Report">
            <Share2 size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-primary mb-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Truck size={20} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Total Dispatched</span>
            </div>
            <div className="mt-auto">
              <h2 className="text-3xl font-black text-on-surface tracking-tight">{formatNumber(stats.totalLoaded, 2, true, true)} L</h2>
              <p className="text-[10px] text-on-surface-variant mt-1.5 font-bold italic opacity-60">Estimated volume sent</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-2 text-green-600 mb-3">
              <div className="p-2.5 bg-green-100 rounded-xl">
                <CheckCircle2 size={20} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Actual Received</span>
            </div>
            <div className="mt-auto">
                <h2 className="text-3xl font-black text-on-surface tracking-tight">{formatNumber(stats.totalReceived, 2, true, true)} L</h2>
                <p className="text-[10px] text-on-surface-variant mt-1.5 font-bold italic opacity-60">Volume verified</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className={cn(
            "absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110",
            stats.totalDiff >= 0 ? "bg-green-50" : "bg-red-50"
          )}></div>
          <div className="relative z-10 flex flex-col h-full">
            <div className={cn(
              "flex items-center gap-2 mb-3",
              stats.totalDiff >= 0 ? "text-green-600" : "text-error"
            )}>
                <div className={cn("p-2.5 rounded-xl", stats.totalDiff >= 0 ? "bg-green-100" : "bg-red-100")}>
                  <AlertCircle size={20} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">Total Difference</span>
            </div>
            <div className="mt-auto">
                <h2 className={cn(
                  "text-3xl font-black tracking-tight",
                  stats.totalDiff >= 0 ? "text-green-600" : "text-error"
                )}>
                  {stats.totalDiff > 0 ? '+' : ''}{formatNumber(stats.totalDiff, 2, true, true)} L
                </h2>
                <p className="text-[10px] text-on-surface-variant mt-1.5 font-bold italic opacity-60">Variance</p>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        title="Record New Tanker Dispatch"
        icon={<Truck size={20} />}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
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
              <input 
                type="text" 
                inputMode="decimal" 
                placeholder="0" 
                value={formData.litresLoaded} 
                onChange={e => setFormData({...formData, litresLoaded: e.target.value.replace(',', '.')})} 
                className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold" 
                required 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Weight (KG)</label>
              <input 
                type="text" 
                placeholder="0" 
                value={formatNumber(formData.weightKg, 2, false, true)} 
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
                <input type="text" inputMode="decimal" value={formData.tempAtLoading} onChange={e => setFormData({...formData, tempAtLoading: e.target.value.replace(',', '.')})} className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase">pH (6.6-6.8)</label>
                <input type="text" inputMode="decimal" value={formData.ph} onChange={e => setFormData({...formData, ph: e.target.value.replace(',', '.')})} className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold" required />
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
                <input 
                  type="text" 
                  inputMode="decimal" 
                  value={formData.density} 
                  onChange={e => setFormData({...formData, density: e.target.value.replace(',', '.')})} 
                  className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold" 
                  required 
                />
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

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)} 
              className="px-6 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-primary hover:bg-primary-dark text-white px-8 py-2 rounded-lg font-bold shadow-lg transition-colors"
            >
              Save Dispatch & QA
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white rounded-3xl border border-outline-variant/20 shadow-sm overflow-x-auto custom-scrollbar-light">
        <table className="w-full text-left text-[10px] min-w-[800px]">
          <thead className="bg-surface-container-low font-black uppercase text-[8px] tracking-widest text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 border-b border-outline-variant/10 w-8 text-center opacity-40">Sno#</th>
              <th 
                className="px-3 py-2 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors group"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1.5">
                  Date
                  <SortIcon field="date" />
                </div>
              </th>
              <th className="px-3 py-2 border-b border-outline-variant/10">Truck</th>
              <th className="px-3 py-2 border-b border-outline-variant/10">MCC</th>
              <th 
                className="px-3 py-2 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors group"
                onClick={() => handleSort('litresLoaded')}
              >
                <div className="flex items-center gap-1.5 text-right justify-end">
                  Load (L)
                  <SortIcon field="litresLoaded" />
                </div>
              </th>
              <th className="px-3 py-2 border-b border-outline-variant/10">Rec. (L)</th>
              <th className="px-3 py-2 border-b border-outline-variant/10">Diff (L)</th>
              <th className="px-3 py-2 border-b border-outline-variant/10 text-center">Temp</th>
              <th className="px-3 py-2 border-b border-outline-variant/10 text-center">pH</th>
              <th className="px-3 py-2 border-b border-outline-variant/10 text-center">Status</th>
              <th className="px-3 py-2 border-b border-outline-variant/10 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {paginatedRecords.map((rec, index) => {
              const isTempFail = (rec.tempAtLoading || 0) > 6;
              const parsedPhValue = Number(String(rec.ph || '').replace(',', '.'));
              const isPhFail = isNaN(parsedPhValue) || parsedPhValue < 6.6 || parsedPhValue > 6.8;
              const isAlcoholFail = rec.alcoholTest === 'Fail';
              const isAntibioticFail = rec.antibiotic === 'Positive';
              const isLabFail = isTempFail || isPhFail || isAlcoholFail || isAntibioticFail;
              
              // Status logic: 
              // 1. If factory rejected it, it's Rejected.
              // 2. If factory received it, it's Passed (even with partial rejects).
              // 3. If in transit, base it on Lab tests.
              let statusLabel = 'Passed';
              let statusColorClass = 'text-green-600 bg-green-50';
              let statusIcon = <CheckCircle2 size={12} />;

              if (rec.factoryStatus === 'Rejected') {
                statusLabel = 'Rejected';
                statusColorClass = 'text-error bg-red-50';
                statusIcon = <AlertCircle size={12} />;
              } else if (rec.factoryStatus === 'Received') {
                statusLabel = 'Passed';
                statusColorClass = 'text-green-600 bg-green-50';
                statusIcon = <CheckCircle2 size={12} />;
              } else if (isLabFail) {
                statusLabel = 'Rejected';
                statusColorClass = 'text-error bg-red-50';
                statusIcon = <AlertCircle size={12} />;
              }

              const isExpanded = expandedId === rec.id;

              return (
                <tr 
                  key={rec.id}
                  onClick={() => {
                    setEditData({
                      ...rec,
                      litresLoaded: formatNumber(rec.litresLoaded, 2, true, true),
                      qtyReceived: rec.qtyReceived !== null && rec.qtyReceived !== undefined ? formatNumber(rec.qtyReceived, 2, true, true) : '',
                      qtyRejected: rec.qtyRejected !== null && rec.qtyRejected !== undefined ? formatNumber(rec.qtyRejected, 2, true, true) : '0.00',
                    });
                    setExpandedId(rec.id);
                  }}
                  className={cn(
                    "hover:bg-primary/5 transition-colors cursor-pointer group whitespace-nowrap",
                    isExpanded && "bg-primary/5"
                  )}
                >
                  <td className="px-3 py-2 text-[10px] font-black text-on-surface-variant opacity-30 text-center">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-3 py-2 text-[10px]">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] uppercase font-black bg-primary/10 text-primary px-1 py-0.5 rounded leading-none w-fit tracking-tighter">Sent</span>
                          <span className="font-bold tracking-tighter shrink-0">{safeFormat(rec.date, 'dd/MM/yy')}</span>
                        </div>
                        {rec.receivedAt && (
                          <div className="flex items-center gap-1 text-green-700">
                            <span className="text-[7px] uppercase font-black bg-green-100 px-1 py-0.5 rounded leading-none w-fit tracking-tighter">Rec.</span>
                            <span className="font-bold tracking-tighter shrink-0">{safeFormat(rec.receivedAt, 'dd/MM/yy')}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px] font-black group-hover:text-primary transition-colors tracking-tighter truncate max-w-[80px]">{rec.truckReg}</td>
                    <td className="px-3 py-2 text-[9px] font-black text-on-surface-variant uppercase tracking-tighter truncate max-w-[100px]">
                      {mccs.find(m => m.id === rec.mccId)?.name || 'Unknown'}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-black tracking-tighter text-right">{formatNumber(rec.litresLoaded, 2, true, true)} L</td>
                    <td className={cn(
                      "px-3 py-2 text-[11px] font-black tracking-tighter text-right",
                      !rec.qtyReceived ? "text-on-surface/30" :
                      Number(rec.qtyReceived) >= Number(rec.litresLoaded) ? "text-green-600" : "text-error"
                    )}>
                      {rec.qtyReceived ? `${formatNumber(rec.qtyReceived, 2, true, true)} L` : '---'}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-[11px] font-black tracking-tighter text-right",
                      !rec.qtyReceived ? "text-on-surface/30" :
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? "text-green-600" : 
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) < 0 ? "text-error" : "text-on-surface/30"
                    )}>
                      {rec.qtyReceived ? `${(Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? '+' : ''}${formatNumber(Number(rec.qtyReceived) - Number(rec.litresLoaded), 2, true, true)} L` : ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[8px] font-black inline-flex items-center", isTempFail ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                        {formatNumber(rec.tempAtLoading, 1)}°
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[8px] font-black inline-flex items-center", isPhFail ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                        {formatNumber(rec.ph, 1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        "flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full w-fit mx-auto tracking-tighter",
                        statusColorClass
                      )}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {canWrite && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : rec.id); setEditData({ ...rec, litresLoaded: formatNumber(rec.litresLoaded, 2, true, true), qtyReceived: rec.qtyReceived !== null && rec.qtyReceived !== undefined ? formatNumber(rec.qtyReceived, 2, true, true) : '', qtyRejected: rec.qtyRejected !== null && rec.qtyRejected !== undefined ? formatNumber(rec.qtyRejected, 2, true, true) : '0.00' }); }}
                            className="bg-primary/10 text-primary p-1 rounded-lg hover:bg-primary/20 transition-all"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); generatePDF(rec); }}
                          className="bg-surface-container-high text-on-surface p-1 rounded-lg hover:bg-surface-container-highest transition-all"
                          title="View PDF"
                        >
                          <FileText size={12} />
                        </button>
                        {canDelete && (
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              if (confirm('Delete this record?')) {
                                await deleteDoc(doc(db, 'truck_qa', rec.id));
                              }
                            }}
                            className="bg-error/10 text-error p-1 rounded-lg hover:bg-error/20 transition-all"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      <Modal
        isOpen={!!expandedId && !!editData}
        onClose={() => { setExpandedId(null); setEditData(null); }}
        title="Edit Dispatch & QA Record"
        icon={<Truck size={20} />}
        maxWidth="max-w-4xl"
      >
        {editData && (
          <form onSubmit={handleUpdateRecord} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <DateInput 
                  value={editData.date} 
                  onChange={val => setEditData({...editData, date: val})}
                  label="Date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Truck Reg No.</label>
                <input value={editData.truckReg} readOnly className="w-full bg-surface-container-low border-none rounded-xl text-sm font-black opacity-60 h-11 px-4" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Driver Name</label>
                <input value={editData.driverName} onChange={e => setEditData({...editData, driverName: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Litres Loaded</label>
                <input 
                  type="text" 
                  inputMode="decimal" 
                  value={editData.litresLoaded} 
                  onChange={e => setEditData({...editData, litresLoaded: e.target.value})} 
                  onBlur={e => setEditData({...editData, litresLoaded: e.target.value.trim() ? formatNumber(e.target.value, 2, true, true) : ''})}
                  className="w-full bg-surface-container-low border-none rounded-xl text-sm font-black h-11 px-4" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Weight (KG)</label>
                <input type="text" value={formatNumber(editData.weightKg, 2, false, true)} readOnly className="w-full bg-surface-container-low border-none rounded-xl text-sm opacity-60 h-11 px-4" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Seal No.</label>
                <input value={editData.sealNo} onChange={e => setEditData({...editData, sealNo: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4" />
              </div>
            </div>

            <div className="border-t border-outline-variant/10 pt-4">
              <h3 className="text-sm font-black flex items-center gap-2 mb-4 text-primary uppercase tracking-wider">
                <Beaker size={18} /> QA Parameters
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Temp (°C)</label>
                  <input type="text" inputMode="decimal" value={editData.tempAtLoading} onChange={e => setEditData({...editData, tempAtLoading: e.target.value.replace(',', '.')})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">pH</label>
                  <input type="text" inputMode="decimal" value={editData.ph} onChange={e => setEditData({...editData, ph: e.target.value.replace(',', '.')})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Alcohol</label>
                  <select value={editData.alcoholTest} onChange={e => setEditData({...editData, alcoholTest: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold">
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Density</label>
                  <input 
                    type="text" 
                    inputMode="decimal" 
                    value={editData.density} 
                    onChange={e => setEditData({...editData, density: e.target.value.replace(',', '.')})} 
                    className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Resazurin</label>
                  <select value={editData.resazurin} onChange={e => setEditData({...editData, resazurin: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold">
                    {RESAZURIN_SCALE.map(grade => (
                      <option key={grade.value} value={grade.value}>{grade.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Antibiotic</label>
                  <select value={editData.antibiotic} onChange={e => setEditData({...editData, antibiotic: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold">
                    <option value="Negative">Negative</option>
                    <option value="Positive">Positive</option>
                  </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Qty Received (Hub)</label>
                   <input 
                     type="text" 
                     inputMode="decimal" 
                     value={editData.qtyReceived || ''} 
                     onChange={e => setEditData({...editData, qtyReceived: e.target.value})} 
                     onBlur={e => setEditData({...editData, qtyReceived: e.target.value.trim() ? formatNumber(e.target.value, 2, true, true) : ''})}
                     className="w-full bg-surface-container-low border-none rounded-xl text-sm font-black text-green-600 h-11 px-4 shadow-inner" 
                     placeholder="0.00" 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Qty Rejected</label>
                   <input 
                     type="text" 
                     inputMode="decimal" 
                     value={editData.qtyRejected || '0'} 
                     onChange={e => setEditData({...editData, qtyRejected: e.target.value})} 
                     onBlur={e => setEditData({...editData, qtyRejected: e.target.value.trim() ? formatNumber(e.target.value, 2, true, true) : '0.00'})}
                     className="w-full bg-surface-container-low border-none rounded-xl text-sm text-error h-11 px-4 font-bold" 
                   />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Remarks</label>
              <textarea value={editData.remarks} onChange={e => setEditData({...editData, remarks: e.target.value})} className="w-full bg-surface-container-low border-none rounded-xl text-sm h-20 p-4 font-medium" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
              <button type="button" onClick={() => { setExpandedId(null); setEditData(null); }} className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest">Cancel</button>
              <button type="submit" className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all uppercase text-[10px] tracking-widest flex items-center gap-2">
                <Save size={18} /> Update Record
              </button>
            </div>
          </form>
        )}
      </Modal>

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
          { Date: getSystemStartDate(), MCC: 'MCC Name or ID', TruckReg: 'T 123 ABC', DriverName: 'John Doe', LitresLoaded: 10000, Temp: 4, PH: 6.7, SealNo: 'S123' }
        ]}
        expectedColumns={['Date', 'MCC', 'TruckReg', 'LitresLoaded']}
      />
    </div>
  );
}
