import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Truck, CheckCircle2, AlertCircle, Save, Search, QrCode, X, Beaker, ChevronDown, ChevronUp, Download, FileSpreadsheet, Printer, Share2, Trash2, Calendar } from 'lucide-react';
import { cn, formatNumber, parseDecimal } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { safeFormat, getTanzaniaTodayStr, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { RESAZURIN_SCALE, getResazurinGrade } from '../lib/qualityConstants';
import { ResazurinBadge } from '../components/ResazurinBadge';
import { Modal } from '../components/Modal';
import { Html5QrcodeScanner } from 'html5-qrcode';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function FactoryIntake() {
  const { profile, effectiveRole } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [mccFilter, setMccFilter] = useState('all');
  const [showScanner, setShowScanner] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [startDate, setStartDate] = useState(format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTanzaniaTodayStr());

  const isActualAdmin = profile && ['Admin', 'Super User'].includes(profile.role);
  const isAdmin = isActualAdmin || ['Admin', 'Super User'].includes(effectiveRole as string);
  const canWrite = isActualAdmin || (profile && !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

  const [intakeData, setIntakeData] = useState({
    qtyReceived: '',
    qtyRejected: '0',
    resazurin: '6',
    temp: '',
    ph: '',
    alcoholTest: 'Pass',
    receivedAt: getTanzaniaTodayStr(),
    factoryRemarks: '',
    status: 'Received'
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    // Factory Clerk sees all truck dispatches
    const q = query(collection(db, 'truck_qa'), where('date', '>=', startDate), where('date', '<=', endDate));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'truck_qa'));

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global_config'));

    return () => {
      unsubscribeMccs();
      unsubscribe();
      unsubscribeSettings();
    };
  }, [profile, startDate, endDate]);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner("reader-intake", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        setSearchTerm(decodedText);
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

  const handleSave = async (id: string, litresLoaded: number) => {
    const docRef = doc(db, 'truck_qa', id);
    const received = parseDecimal(intakeData.qtyReceived);
    await updateDoc(docRef, {
      qtyReceived: received,
      qtyRejected: parseDecimal(intakeData.qtyRejected),
      qtyDifference: received - litresLoaded,
      factoryResazurin: intakeData.resazurin,
      factoryTemp: parseDecimal(intakeData.temp),
      factoryPh: parseDecimal(intakeData.ph),
      factoryAlcoholTest: intakeData.alcoholTest,
      factoryRemarks: intakeData.factoryRemarks,
      factoryStatus: intakeData.status,
      receivedAt: intakeData.receivedAt || new Date().toISOString(),
      receivedBy: profile?.fullName || profile?.email || 'System'
    });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteDoc(doc(db, 'truck_qa', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'truck_qa');
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Factory Milk Intake Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

    const tableData = filteredRecords.map((rec, index) => [
      index + 1,
      safeFormat(rec.date, 'dd/MM/yyyy'),
      rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
      mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      rec.truckReg,
      rec.driverName,
      `${formatNumber(rec.litresLoaded, 2, true, true)} L`,
      `${formatNumber(rec.qtyReceived || 0, 2, true, true)} L`,
      `${(Number(rec.qtyReceived || 0) - Number(rec.litresLoaded)) > 0 ? '+' : ''}${formatNumber((Number(rec.qtyReceived || 0) - Number(rec.litresLoaded)), 2, true, true)} L`,
      rec.factoryStatus || 'Pending'
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['#', 'Sent Date', 'Received Date', 'MCC', 'Truck', 'Driver', 'Sent', 'Received', 'Diff', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`factory_intake_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };

  const exportToExcel = () => {
    const data = filteredRecords.map((rec, index) => ({
      'Sno#': index + 1,
      'Sent Date': safeFormat(rec.date, 'dd/MM/yyyy'),
      'Received Date': rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
      MCC: mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      Truck: rec.truckReg,
      Driver: rec.driverName,
      'Sent (L)': rec.litresLoaded,
      'Received (L)': rec.qtyReceived || 0,
      'Difference (L)': (rec.qtyReceived || 0) - rec.litresLoaded,
      'Rejected (L)': rec.qtyRejected || 0,
      'MCC Resazurin': rec.resazurin,
      'Factory Resazurin': rec.factoryResazurin,
      Status: rec.factoryStatus || 'Pending',
      Remarks: rec.factoryRemarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Intake");
    XLSX.writeFile(wb, `factory_intake_${format(new Date(), 'dd/MM/yyyy')}.xlsx`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        // Generate PDF first to share it
        const doc = new jsPDF();
        doc.text('Factory Milk Intake Report', 14, 22);
        const tableData = filteredRecords.map((rec, index) => [
          index + 1,
          safeFormat(rec.date, 'dd/MM/yyyy'),
          rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : '---',
          mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
          rec.truckReg,
          rec.driverName,
          `${formatNumber(rec.litresLoaded, 2, true, true)} L`,
          `${formatNumber(rec.qtyReceived || 0, 2, true, true)} L`,
          `${(Number(rec.qtyReceived || 0) - Number(rec.litresLoaded)) > 0 ? '+' : ''}${formatNumber((Number(rec.qtyReceived || 0) - Number(rec.litresLoaded)), 2, true, true)} L`,
          rec.factoryStatus || 'Pending'
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['#', 'Sent Date', 'Received Date', 'MCC', 'Truck', 'Driver', 'Sent', 'Received', 'Diff', 'Status']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `factory_intake_${format(new Date(), 'dd-MM-yyyy')}.pdf`, { type: 'application/pdf' });

        await navigator.share({
          title: 'Factory Milk Intake Report',
          text: `Milk Intake Report for ${format(new Date(), 'dd/MM/yyyy')}`,
          files: [file]
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Sharing is not supported on this browser. Please use the Download buttons.');
    }
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter(rec => {
        const matchesSearch = (rec.truckReg || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (rec.driverName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
        return matchesSearch && matchesMcc;
      })
      .sort((a, b) => {
        // LIFO: Most recent date first
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        
        // Fallback to createdAt for entries on same day
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;

        // Final fallback to receivedAt if exists
        const recA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
        const recB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
        return recB - recA;
      });
  }, [records, searchTerm, mccFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, mccFilter]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => {
      const loaded = Number(rec.litresLoaded || 0);
      const received = Number(rec.qtyReceived || 0);
      const rejected = Number(rec.qtyRejected || 0);
      
      acc.totalLoaded += loaded;
      acc.totalReceived += received;
      acc.totalRejected += rejected;
      // Only count difference for received records
      if (rec.factoryStatus === 'Received') {
        acc.totalDiff += (received - loaded);
      }
      
      return acc;
    }, {
      totalLoaded: 0,
      totalReceived: 0,
      totalRejected: 0,
      totalDiff: 0
    });
  }, [filteredRecords]);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface">Goods Received</h1>
          <p className="text-on-surface-variant font-medium text-xs">Record liters received from MCC tankers (Factory Intake)</p>
        </div>
        <div className="flex gap-1.5">
          <button 
            onClick={exportToPDF}
            className="bg-white border border-outline-variant/30 text-on-surface px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-surface-container-low transition-colors text-xs"
          >
            <Download size={16} /> PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="bg-white border border-outline-variant/30 text-on-surface px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-surface-container-low transition-colors text-xs"
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button 
            onClick={() => window.print()}
            className="bg-white border border-outline-variant/30 text-on-surface px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-surface-container-low transition-colors text-xs"
          >
            <Printer size={16} /> Print
          </button>
          <button 
            onClick={handleShare}
            className="bg-primary text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-lg hover:shadow-primary/20 transition-all text-xs"
          >
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col">
            <div className="flex items-center gap-1.5 text-primary mb-1">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Truck size={16} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Total Dispatched</span>
            </div>
             <h2 className="text-2xl font-black text-on-surface tracking-tight">{formatNumber(stats.totalLoaded, 2, true, true)} L</h2>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-16 h-16 bg-green-50 rounded-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col">
            <div className="flex items-center gap-1.5 text-green-600 mb-1">
              <div className="p-1.5 bg-green-100 rounded-lg">
                <CheckCircle2 size={16} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Actual Received</span>
            </div>
            <h2 className="text-2xl font-black text-on-surface tracking-tight">{formatNumber(stats.totalReceived, 2, true, true)} L</h2>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-outline-variant/20 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className={cn(
            "absolute top-0 right-0 w-16 h-16 rounded-full -mr-4 -mt-4 transition-transform group-hover:scale-110",
            stats.totalDiff >= 0 ? "bg-green-50" : "bg-red-50"
          )}></div>
          <div className="relative z-10 flex flex-col">
            <div className={cn(
              "flex items-center gap-1.5 mb-1",
              stats.totalDiff >= 0 ? "text-green-600" : "text-error"
            )}>
              <div className={cn("p-1.5 rounded-lg", stats.totalDiff >= 0 ? "bg-green-100" : "bg-red-100")}>
                <AlertCircle size={16} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Difference</span>
            </div>
            <h2 className={cn(
              "text-2xl font-black tracking-tight",
              stats.totalDiff >= 0 ? "text-green-600" : "text-error"
            )}>
              {stats.totalDiff > 0 ? '+' : ''}{formatNumber(stats.totalDiff, 2, true, true)} L
            </h2>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white p-6 rounded-3xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 mb-1.5 block tracking-widest">Search</label>
            <div className="flex items-center gap-3 bg-surface-container-low px-3 h-9 rounded-lg">
              <Search className="text-on-surface-variant" size={18} />
              <input 
                placeholder="Truck Reg or Driver..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
              />
            </div>
          </div>
          
          <div className="w-36 space-y-1">
            <DateInput 
              value={startDate}
              onChange={setStartDate}
              label="From"
            />
          </div>

          <div className="w-36 space-y-1">
            <DateInput 
              value={endDate}
              onChange={setEndDate}
              label="To"
            />
          </div>

          <div className="w-40 space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-60">MCC Filter</label>
            <div className="flex items-center gap-2">
              <select 
                value={mccFilter} 
                onChange={e => setMccFilter(e.target.value)}
                className="flex-1 bg-surface-container-low border-none rounded-lg text-sm font-bold h-9 px-3"
              >
                <option value="all">All MCCs</option>
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
              <button 
                onClick={() => setShowScanner(!showScanner)}
                className={cn(
                  "p-2 rounded-lg transition-colors h-9",
                  showScanner ? "bg-primary text-white" : "bg-surface-container-low text-primary hover:bg-primary/10"
                )}
              >
                {showScanner ? <X size={18} /> : <QrCode size={18} />}
              </button>
            </div>
          </div>
        </div>

        {showScanner && (
          <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
            <div id="reader-intake" className="max-w-sm mx-auto overflow-hidden rounded-lg"></div>
            <p className="text-center text-xs mt-2 text-on-surface-variant">Scan Truck QR Code to filter</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-outline-variant/20 shadow-sm overflow-x-auto custom-scrollbar-light">
        <table className="w-full text-left text-[10px] min-w-[700px]">
          <thead className="bg-surface-container-low font-black uppercase text-[8px] tracking-widest text-on-surface-variant">
            <tr>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 w-8 text-center opacity-40">Sno#</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10">Date</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10">Truck</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10">MCC</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 text-right">Sent (L)</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 text-right">Rec. (L)</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 text-right">Diff (L)</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 text-center">Status</th>
              <th className="px-3 py-2.5 border-b border-outline-variant/10 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {paginatedRecords.map((rec, index) => {
              const isExpanded = expandedId === rec.id;
              // ... rest unchanged ...
              const isTempFail = (rec.tempAtLoading || 0) > 6;
              const parsedPhValue = Number(String(rec.ph || '').replace(',', '.'));
              const isPhFail = isNaN(parsedPhValue) || parsedPhValue < 6.6 || parsedPhValue > 6.8;
              const isAlcoholFail = rec.alcoholTest === 'Fail';
              const isAntibioticFail = rec.antibiotic === 'Positive';
              const isOverallFail = isTempFail || isPhFail || isAlcoholFail || isAntibioticFail;

              return (
                <tr 
                  key={rec.id}
                  className={cn(
                    "hover:bg-primary/5 transition-colors cursor-pointer group whitespace-nowrap",
                    expandedId === rec.id && "bg-primary/5"
                  )}
                  onClick={() => {
                    const recToEdit = rec;
                    setEditingId(rec.id);
                    setExpandedId(rec.id);
                    setIntakeData({
                      qtyReceived: formatNumber(recToEdit.qtyReceived || recToEdit.litresLoaded, 2, true, true),
                      qtyRejected: recToEdit.qtyRejected !== undefined && recToEdit.qtyRejected !== null ? formatNumber(recToEdit.qtyRejected, 2, true, true) : '0.00',
                      resazurin: recToEdit.factoryResazurin || '6',
                      temp: recToEdit.factoryTemp || '',
                      ph: recToEdit.factoryPh || '',
                      alcoholTest: recToEdit.factoryAlcoholTest || 'Pass',
                      receivedAt: recToEdit.receivedAt ? recToEdit.receivedAt.split('T')[0] : getTanzaniaTodayStr(),
                      factoryRemarks: recToEdit.factoryRemarks || '',
                      status: recToEdit.factoryStatus || 'Received'
                    });
                  }}
                >
                  <td className="px-5 py-3 text-[11px] font-black text-on-surface-variant opacity-30 text-center">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-5 py-3 text-[10px] font-medium">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] uppercase font-black bg-primary/10 text-primary px-1 py-0.5 rounded leading-none w-fit">Dispached</span>
                          <span className="font-bold">{safeFormat(rec.date, 'dd/MM/yyyy')}</span>
                        </div>
                        {rec.receivedAt && (
                          <div className="flex items-center gap-1.5 text-green-700">
                            <span className="text-[8px] uppercase font-black bg-green-100 px-1 py-0.5 rounded leading-none w-fit">Received</span>
                            <span className="font-bold">{safeFormat(rec.receivedAt, 'dd/MM/yyyy')}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs font-black group-hover:text-primary transition-colors tracking-tight">{rec.truckReg}</td>
                    <td className="px-5 py-3 text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                      {mccs.find(m => m.id === rec.mccId)?.name || 'Unknown'}
                    </td>
                    <td className="px-5 py-3 text-xs font-black text-green-600 tracking-tight text-right">{formatNumber(rec.litresLoaded, 2, true, true)} L</td>
                    <td className={cn(
                      "px-5 py-3 text-xs font-black tracking-tight text-right",
                      !rec.qtyReceived ? "text-on-surface/30" :
                      Number(rec.qtyReceived) >= Number(rec.litresLoaded) ? "text-green-600" : "text-error"
                    )}>
                      {rec.qtyReceived ? `${formatNumber(rec.qtyReceived, 2, true, true)} L` : '---'}
                    </td>
                    <td className={cn(
                      "px-5 py-3 text-xs font-black tracking-tight text-right",
                      !rec.qtyReceived ? "text-on-surface/30" :
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? "text-green-600" : 
                      (Number(rec.qtyReceived) - Number(rec.litresLoaded)) < 0 ? "text-error" : "text-on-surface/30"
                    )}>
                      {rec.qtyReceived ? `${(Number(rec.qtyReceived) - Number(rec.litresLoaded)) > 0 ? '+' : ''}${formatNumber(Number(rec.qtyReceived) - Number(rec.litresLoaded), 2, true, true)} L` : ''}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tight w-fit inline-flex items-center",
                        rec.factoryStatus === 'Received' ? "bg-green-100 text-green-700" : 
                        rec.factoryStatus === 'Rejected' ? "bg-red-100 text-red-700 font-black" : 
                        "bg-primary text-white"
                      )}>
                        {rec.factoryStatus || 'In Transit'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                        {isActualAdmin && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(rec.id); }}
                            className="bg-error/10 text-error p-1.5 rounded-lg hover:bg-error/20 transition-all shadow-sm"
                            title="Delete Record"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {(canWrite || isAdmin) && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const newEditingId = editingId === rec.id ? null : rec.id;
                              setEditingId(newEditingId);
                              if (newEditingId) {
                                setExpandedId(rec.id); // FIX: Ensure row is expanded to show form
                                setIntakeData({
                                  qtyReceived: formatNumber(rec.qtyReceived || rec.litresLoaded, 2, true, true),
                                  qtyRejected: rec.qtyRejected !== undefined && rec.qtyRejected !== null ? formatNumber(rec.qtyRejected, 2, true, true) : '0.00',
                                  resazurin: rec.factoryResazurin || '6',
                                  temp: rec.factoryTemp || '',
                                  ph: rec.factoryPh || '',
                                  alcoholTest: rec.factoryAlcoholTest || 'Pass',
                                  receivedAt: rec.receivedAt ? rec.receivedAt.split('T')[0] : getTanzaniaTodayStr(),
                                  factoryRemarks: rec.factoryRemarks || '',
                                  status: rec.factoryStatus || 'Received'
                                });
                              }
                            }}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[11px] font-black transition-all whitespace-nowrap shadow-lg flex items-center gap-2 relative z-20",
                              rec.factoryStatus === 'Received' 
                                ? "bg-green-600 text-white hover:bg-green-700" 
                                : "bg-primary text-white hover:shadow-primary/30 hover:scale-[1.05]"
                            )}
                          >
                            {rec.factoryStatus === 'Received' ? <CheckCircle2 size={14} /> : <Truck size={14} />}
                            {rec.factoryStatus === 'Received' ? 'Update Hub' : 'Record Intake'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-40">
                      <Truck size={32} />
                      <p className="text-xs font-bold">No truck dispatches found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      <Modal
        isOpen={!!editingId && expandedId === editingId}
        onClose={() => { setEditingId(null); setExpandedId(null); }}
        title="Factory Intake & QA"
        icon={<Truck size={20} />}
        maxWidth="max-w-4xl"
      >
        {editingId && paginatedRecords.find(r => r.id === editingId) && (
          <div className="space-y-6">
            {(() => {
              const rec = paginatedRecords.find(r => r.id === editingId);
              const isTempFail = (rec.tempAtLoading || 0) > 6;
              const parsedPhValue = Number(String(rec.ph || '').replace(',', '.'));
              const isPhFail = isNaN(parsedPhValue) || parsedPhValue < 6.6 || parsedPhValue > 6.8;
              const isAlcoholFail = rec.alcoholTest === 'Fail';
              
              return (
                <div className="space-y-6">
                  <div className="bg-surface-container-highest p-4 rounded-2xl border border-outline-variant/10">
                    <h3 className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 mb-3 tracking-widest">Sent From MCC Quality Results</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-white p-2.5 rounded-xl border border-outline-variant/10 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[9px] font-bold uppercase text-on-surface-variant mb-0.5 flex items-center gap-1">
                          <Beaker size={10} className="text-primary" /> Temp (MCC)
                        </p>
                        <p className={cn("font-bold text-base", isTempFail ? "text-error" : "text-green-600")}>
                          {formatNumber(rec.tempAtLoading, 1)}°C
                        </p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-outline-variant/10 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[9px] font-bold uppercase text-on-surface-variant mb-0.5 flex items-center gap-1">
                          <Beaker size={10} className="text-primary" /> pH (MCC)
                        </p>
                        <p className={cn("font-bold text-base", isPhFail ? "text-error" : "text-green-600")}>
                          {formatNumber(rec.ph, 1)}
                        </p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-outline-variant/10 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[9px] font-bold uppercase text-on-surface-variant mb-0.5 flex items-center gap-1">
                          <Beaker size={10} className="text-primary" /> Alcohol (MCC)
                        </p>
                        <p className={cn("font-bold text-base", isAlcoholFail ? "text-error" : "text-green-600")}>
                          {rec.alcoholTest}
                        </p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-outline-variant/10 shadow-sm flex flex-col justify-center">
                        <p className="text-[9px] font-bold uppercase text-on-surface-variant mb-0.5 flex items-center gap-1">
                          <Beaker size={10} className="text-primary" /> Resazurin (MCC)
                        </p>
                        <ResazurinBadge value={rec.resazurin} className="w-full justify-center py-1 text-[10px]" />
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-outline-variant/10 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[9px] font-bold uppercase text-on-surface-variant mb-0.5 flex items-center gap-1">
                          <Beaker size={10} className="text-primary" /> Density (MCC)
                        </p>
                        <p className="font-bold text-base text-primary">{formatNumber(rec.density, 3)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-wider">
                      <Save size={18} /> Record Intake QA Parameters
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <DateInput 
                          value={intakeData.receivedAt} 
                          onChange={val => setIntakeData({...intakeData, receivedAt: val})}
                          label="Received Date"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Qty Received (L)</label>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          value={intakeData.qtyReceived} 
                          onChange={e => setIntakeData({...intakeData, qtyReceived: e.target.value})}
                          onBlur={e => setIntakeData({...intakeData, qtyReceived: e.target.value.trim() ? formatNumber(e.target.value, 2, true, true) : ''})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black transition-all"
                          placeholder={formatNumber(rec.litresLoaded, 2, true, true)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Collection Status</label>
                        <select 
                          value={intakeData.status} 
                          onChange={e => setIntakeData({...intakeData, status: e.target.value})}
                          className={cn(
                            "w-full border-none rounded-xl text-sm font-black h-11 px-4 transition-all",
                            intakeData.status === 'Received' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700 font-black h-11"
                          )}
                        >
                          <option value="Received">✅ Received</option>
                          <option value="Rejected">❌ Rejected</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Resazurin (Factory)</label>
                        <select 
                          value={intakeData.resazurin} 
                          onChange={e => setIntakeData({...intakeData, resazurin: e.target.value})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold"
                        >
                          {RESAZURIN_SCALE.map(grade => (
                            <option key={grade.value} value={grade.value}>{grade.label} ({grade.description})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Temp (°C) (Factory)</label>
                        <input 
                          type="text" inputMode="decimal"
                          value={intakeData.temp} 
                          onChange={e => setIntakeData({...intakeData, temp: e.target.value.replace(',', '.')})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold"
                          placeholder="---"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">pH (Factory)</label>
                        <input 
                          type="text" inputMode="decimal"
                          value={intakeData.ph} 
                          onChange={e => setIntakeData({...intakeData, ph: e.target.value.replace(',', '.')})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold"
                          placeholder="---"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Qty Rejected (L)</label>
                        <input 
                          type="text" 
                          inputMode="decimal" 
                          value={intakeData.qtyRejected} 
                          onChange={e => setIntakeData({...intakeData, qtyRejected: e.target.value})}
                          onBlur={e => setIntakeData({...intakeData, qtyRejected: e.target.value.trim() ? formatNumber(e.target.value, 2, true, true) : '0.00'})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 text-error font-black"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Alcohol Test (Factory)</label>
                         <select 
                            value={intakeData.alcoholTest} 
                            onChange={e => setIntakeData({...intakeData, alcoholTest: e.target.value})}
                            className="w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-bold"
                          >
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                          </select>
                      </div>
                      <div className="space-y-1 sm:col-span-1 lg:col-span-1">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Difference (L)</label>
                        <div className={cn(
                          "w-full bg-surface-container-low border-none rounded-xl text-sm h-11 px-4 font-black flex items-center",
                          (Number(intakeData.qtyReceived) - Number(rec.litresLoaded)) > 0 ? "text-green-600" : 
                          (Number(intakeData.qtyReceived) - Number(rec.litresLoaded)) < 0 ? "text-error" : "text-on-surface-variant opacity-40"
                        )}>
                          {(Number(intakeData.qtyReceived) - Number(rec.litresLoaded)) > 0 ? '+' : ''}
                          {formatNumber(Number(intakeData.qtyReceived) - Number(rec.litresLoaded), 2, true, true)} L
                        </div>
                      </div>
                      <div className="space-y-1 sm:col-span-2 md:col-span-3 lg:col-span-3">
                        <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest mb-1.5">Factory Remarks</label>
                        <textarea 
                          value={intakeData.factoryRemarks} 
                          onChange={e => setIntakeData({...intakeData, factoryRemarks: e.target.value})}
                          className="w-full bg-surface-container-low border-none rounded-xl text-sm h-20 p-4 font-medium"
                          placeholder="Add any additional notes from factory intake..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
                    <button 
                      onClick={() => { setEditingId(null); setExpandedId(null); }}
                      className="px-8 py-3 rounded-[1.25rem] font-black text-on-surface-variant hover:bg-surface-container-high transition-all uppercase text-[10px] tracking-widest"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => handleSave(rec.id, rec.litresLoaded)}
                      className="bg-primary text-white px-12 py-3 rounded-[1.25rem] font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all uppercase text-[10px] tracking-widest flex items-center gap-2"
                    >
                      <Save size={18} /> Complete Intake Report
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Pagination Controls */}
      {filteredRecords.length > pageSize && (
        <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-on-surface-variant font-medium">
            Showing <span className="font-bold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(currentPage * pageSize, filteredRecords.length)}</span> of <span className="font-bold text-on-surface">{filteredRecords.length}</span> records
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
    </div>
  );
}
