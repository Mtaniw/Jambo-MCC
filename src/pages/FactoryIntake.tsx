import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Truck, CheckCircle2, AlertCircle, Save, Search, QrCode, X, Beaker, ChevronDown, ChevronUp, Download, FileSpreadsheet, Printer, Share2, Trash2, Calendar } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { safeFormat, getTanzaniaTodayStr, getTanzaniaDate } from '../lib/dateUtils';
import { RESAZURIN_SCALE, getResazurinGrade } from '../lib/qualityConstants';
import { ResazurinBadge } from '../components/ResazurinBadge';
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

  const canWrite = profile && (profile.role === 'Admin' || !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));
  const isAdmin = profile && ['Admin', 'Super User'].includes(effectiveRole as string);

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
    const received = Number(intakeData.qtyReceived);
    await updateDoc(docRef, {
      qtyReceived: received,
      qtyRejected: Number(intakeData.qtyRejected),
      qtyDifference: litresLoaded - received,
      factoryResazurin: intakeData.resazurin,
      factoryTemp: Number(intakeData.temp),
      factoryPh: Number(intakeData.ph),
      factoryAlcoholTest: intakeData.alcoholTest,
      factoryRemarks: intakeData.factoryRemarks,
      factoryStatus: intakeData.status,
      receivedAt: intakeData.receivedAt || new Date().toISOString(),
      receivedBy: profile?.fullName
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
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 30);

    const tableData = filteredRecords.map(rec => [
      safeFormat(rec.date, 'dd/MM/yyyy'),
      mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      rec.truckReg,
      rec.driverName,
      `${rec.litresLoaded} L`,
      `${rec.qtyReceived || 0} L`,
      `${(rec.litresLoaded - (rec.qtyReceived || 0))} L`,
      rec.factoryStatus || 'Pending'
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['Date', 'MCC', 'Truck', 'Driver', 'Sent', 'Received', 'Diff', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`factory_intake_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const data = filteredRecords.map(rec => ({
      Date: safeFormat(rec.date, 'yyyy-MM-dd'),
      MCC: mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      Truck: rec.truckReg,
      Driver: rec.driverName,
      'Sent (L)': rec.litresLoaded,
      'Received (L)': rec.qtyReceived || 0,
      'Difference (L)': (rec.litresLoaded - (rec.qtyReceived || 0)),
      'Rejected (L)': rec.qtyRejected || 0,
      'MCC Resazurin': rec.resazurin,
      'Factory Resazurin': rec.factoryResazurin,
      Status: rec.factoryStatus || 'Pending',
      Remarks: rec.factoryRemarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Intake");
    XLSX.writeFile(wb, `factory_intake_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        // Generate PDF first to share it
        const doc = new jsPDF();
        doc.text('Factory Milk Intake Report', 14, 22);
        const tableData = filteredRecords.map(rec => [
          safeFormat(rec.date, 'dd/MM/yyyy'),
          mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
          rec.truckReg,
          rec.driverName,
          `${rec.litresLoaded} L`,
          `${rec.qtyReceived || 0} L`,
          rec.factoryStatus || 'Pending'
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['Date', 'MCC', 'Truck', 'Driver', 'Sent', 'Received', 'Status']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `factory_intake_${format(new Date(), 'yyyy-MM-dd')}.pdf`, { type: 'application/pdf' });

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
    return records.filter(rec => {
      const matchesSearch = rec.truckReg.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           rec.driverName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
      return matchesSearch && matchesMcc;
    });
  }, [records, searchTerm, mccFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, mccFilter]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Goods Received</h1>
          <p className="text-on-surface-variant text-sm">Record liters received from MCC tankers (Factory Intake)</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToPDF}
            className="bg-white border border-outline-variant/30 text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-surface-container-low transition-colors"
          >
            <Download size={18} /> PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="bg-white border border-outline-variant/30 text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-surface-container-low transition-colors"
          >
            <FileSpreadsheet size={18} /> Excel
          </button>
          <button 
            onClick={() => window.print()}
            className="bg-white border border-outline-variant/30 text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-surface-container-low transition-colors"
          >
            <Printer size={18} /> Print
          </button>
          <button 
            onClick={handleShare}
            className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all"
          >
            <Share2 size={18} /> Share
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[300px] space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-60">Search Records</label>
            <div className="flex items-center gap-4 bg-surface-container-low px-3 h-10 rounded-lg">
              <Search className="text-on-surface-variant" size={20} />
              <input 
                placeholder="Search by Truck Reg or Driver..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
              />
            </div>
          </div>
          
          <div className="w-40 space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-60">From</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10"
            />
          </div>

          <div className="w-40 space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-60">To</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10"
            />
          </div>

          <div className="w-48 space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-60">MCC Filter</label>
            <div className="flex items-center gap-2">
              <select 
                value={mccFilter} 
                onChange={e => setMccFilter(e.target.value)}
                className="flex-1 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 px-3"
              >
                <option value="all">All MCCs</option>
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
              <button 
                onClick={() => setShowScanner(!showScanner)}
                className={cn(
                  "p-2 rounded-lg transition-colors h-10",
                  showScanner ? "bg-primary text-white" : "bg-surface-container-low text-primary hover:bg-primary/10"
                )}
              >
                {showScanner ? <X size={20} /> : <QrCode size={20} />}
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

      <div className="grid grid-cols-1 gap-4">
        {paginatedRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(rec => {
          const isExpanded = expandedId === rec.id;
          const isTempFail = rec.tempAtLoading > 6;
          const isPhFail = rec.ph < 6.6 || rec.ph > 6.8;
          const isAlcoholFail = rec.alcoholTest === 'Fail';
          const isAntibioticFail = rec.antibiotic === 'Positive';
          const isOverallFail = isTempFail || isPhFail || isAlcoholFail || isAntibioticFail;

          return (
            <div key={rec.id} className={cn(
              "bg-white rounded-xl border transition-all duration-200 overflow-hidden",
              isExpanded ? "border-primary shadow-md" : "border-outline-variant/20 shadow-sm"
            )}>
              <div 
                className="p-4 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-lowest"
                onClick={() => setExpandedId(isExpanded ? null : rec.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-lg text-primary">
                    <Truck size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{rec.truckReg}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1 font-bold"><Calendar size={12} /> Sent: {safeFormat(rec.date, 'dd/MM/yyyy')}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-bold text-primary"><Calendar size={12} /> Received: {rec.receivedAt ? safeFormat(rec.receivedAt, 'dd/MM/yyyy') : 'Pending'}</span>
                      <span>•</span>
                      <span>{rec.driverName}</span>
                      <span>•</span>
                      <span className="font-bold text-primary">{mccs.find(m => m.id === rec.mccId)?.name || 'Unknown MCC'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Dispatched</p>
                    <p className="font-bold">{rec.litresLoaded} L</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Weight</p>
                    <p className="font-bold">{rec.weightKg} KG</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                      rec.factoryStatus === 'Received' ? "bg-green-100 text-green-700" : "bg-surface-container-high"
                    )}>
                      {rec.factoryStatus || 'In Transit'}
                    </div>
                    {isExpanded ? <ChevronUp size={20} className="text-on-surface-variant" /> : <ChevronDown size={20} className="text-on-surface-variant" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-surface-container-lowest border-b border-outline-variant/10 p-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Temperature
                      </p>
                      <p className={cn("font-bold", isTempFail ? "text-error" : "text-green-600")}>
                        {rec.tempAtLoading}°C
                      </p>
                      <p className="text-[10px] opacity-60">{isTempFail ? 'Above Limit (>6°C)' : 'Within Limit'}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> pH Level
                      </p>
                      <p className={cn("font-bold", isPhFail ? "text-error" : "text-green-600")}>
                        {rec.ph}
                      </p>
                      <p className="text-[10px] opacity-60">{isPhFail ? 'Out of Range (6.6-6.8)' : 'Normal Range'}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Alcohol Test
                      </p>
                      <p className={cn("font-bold", isAlcoholFail ? "text-error" : "text-green-600")}>
                        {rec.alcoholTest}
                      </p>
                      <p className="text-[10px] opacity-60">{isAlcoholFail ? 'Failed Test' : 'Passed Test'}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Resazurin (Sent)
                      </p>
                      <ResazurinBadge value={rec.resazurin} className="w-full justify-center" />
                      <p className="text-[10px] opacity-60 mt-1">MCC Lab Result</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Resazurin (Factory)
                      </p>
                      <ResazurinBadge value={rec.factoryResazurin} className="w-full justify-center" />
                      <p className="text-[10px] opacity-60 mt-1">Factory Lab Result</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Factory Temp
                      </p>
                      <p className={cn("font-bold", (rec.factoryTemp || 0) > 6 ? "text-error" : "text-green-600")}>
                        {rec.factoryTemp ? `${rec.factoryTemp}°C` : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Factory pH
                      </p>
                      <p className={cn("font-bold", (rec.factoryPh < 6.6 || rec.factoryPh > 6.8) ? "text-error" : "text-green-600")}>
                        {rec.factoryPh || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-outline-variant/10">
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1 flex items-center gap-1">
                        <Beaker size={12} /> Factory Alcohol
                      </p>
                      <p className={cn("font-bold", rec.factoryAlcoholTest === 'Fail' ? "text-error" : "text-green-600")}>
                        {rec.factoryAlcoholTest || 'N/A'}
                      </p>
                    </div>
                  </div>
                  
                  {isOverallFail && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-error text-xs font-bold">
                      <AlertCircle size={16} />
                      WARNING: This batch failed one or more quality tests. Review carefully before intake.
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 bg-surface-container-lowest">
              {editingId === rec.id ? (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Received Date</label>
                    <input 
                      type="date" 
                      value={intakeData.receivedAt} 
                      onChange={e => setIntakeData({...intakeData, receivedAt: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Qty Received (L)</label>
                    <input 
                      type="number" 
                      value={intakeData.qtyReceived} 
                      onChange={e => setIntakeData({...intakeData, qtyReceived: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                      placeholder={rec.litresLoaded.toString()}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Difference (L)</label>
                    <input 
                      type="text"
                      readOnly
                      value={`${(Number(rec.litresLoaded) - Number(intakeData.qtyReceived || 0)).toLocaleString()} L`}
                      className={cn(
                        "w-full bg-surface-container-low border-outline-variant/30 rounded-lg text-sm font-bold",
                        (Number(rec.litresLoaded) - Number(intakeData.qtyReceived || 0)) > 0 ? "text-error" : "text-green-600"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Status</label>
                    <select 
                      value={intakeData.status} 
                      onChange={e => setIntakeData({...intakeData, status: e.target.value})}
                      className={cn(
                        "w-full border-outline-variant/30 rounded-lg text-sm font-bold",
                        intakeData.status === 'Received' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}
                    >
                      <option value="Received">Received</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Temp (°C)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={intakeData.temp} 
                      onChange={e => setIntakeData({...intakeData, temp: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                      placeholder="e.g. 4.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">pH Level</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={intakeData.ph} 
                      onChange={e => setIntakeData({...intakeData, ph: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                      placeholder="6.7"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Alcohol Test</label>
                    <select 
                      value={intakeData.alcoholTest} 
                      onChange={e => setIntakeData({...intakeData, alcoholTest: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                    >
                      <option value="Pass">Pass</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold uppercase">Resazurin (Factory)</label>
                    </div>
                    <div className="space-y-2">
                      <ResazurinBadge value={intakeData.resazurin} className="w-full justify-center" />
                      <select 
                        value={intakeData.resazurin} 
                        onChange={e => setIntakeData({...intakeData, resazurin: e.target.value})}
                        className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                      >
                        {RESAZURIN_SCALE.map(grade => (
                          <option key={grade.value} value={grade.value}>{grade.label} ({grade.description})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase">Qty Rejected (L)</label>
                    <input 
                      type="number" 
                      value={intakeData.qtyRejected} 
                      onChange={e => setIntakeData({...intakeData, qtyRejected: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-[10px] font-bold uppercase">Remarks</label>
                    <input 
                      value={intakeData.factoryRemarks} 
                      onChange={e => setIntakeData({...intakeData, factoryRemarks: e.target.value})}
                      className="w-full bg-white border-outline-variant/30 rounded-lg text-sm"
                      placeholder="Condition of milk..."
                    />
                  </div>
                  <div className="flex gap-2 md:col-span-2">
                    <button 
                      onClick={() => handleSave(rec.id, rec.litresLoaded)}
                      className="flex-1 bg-primary text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                    >
                      <Save size={16} /> Save
                    </button>
                    <button 
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 border border-outline-variant rounded-lg font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">Actual Received</p>
                      <p className={cn("font-bold text-lg", rec.qtyReceived ? "text-primary" : "text-on-surface/30")}>
                        {rec.qtyReceived ? `${formatNumber(rec.qtyReceived, 1)} L` : '---'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">Rejected</p>
                      <p className={cn("font-bold text-lg", rec.qtyRejected > 0 ? "text-error" : "text-on-surface/30")}>
                        {rec.qtyRejected ? `${formatNumber(rec.qtyRejected, 1)} L` : '---'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-on-surface-variant">Difference</p>
                      <p className={cn("font-bold text-lg", (Number(rec.litresLoaded) - Number(rec.qtyReceived || 0)) !== 0 ? "text-error" : "text-green-600")}>
                        {rec.qtyReceived ? `${formatNumber(Number(rec.litresLoaded) - Number(rec.qtyReceived), 1)} L` : '---'}
                      </p>
                    </div>
                    {rec.factoryRemarks && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant">Factory Remarks</p>
                        <p className="text-sm italic">"{rec.factoryRemarks}"</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button 
                        onClick={() => handleDelete(rec.id)}
                        className="p-2 text-error hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Record"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                    {(canWrite || isAdmin) && (
                      <button 
                        onClick={() => {
                          setEditingId(rec.id);
                          setIntakeData({
                            qtyReceived: rec.qtyReceived || rec.litresLoaded,
                            qtyRejected: rec.qtyRejected || '0',
                            resazurin: rec.factoryResazurin || '6',
                            temp: rec.factoryTemp || '',
                            ph: rec.factoryPh || '',
                            alcoholTest: rec.factoryAlcoholTest || 'Pass',
                            receivedAt: rec.receivedAt ? rec.receivedAt.split('T')[0] : getTanzaniaTodayStr(),
                            factoryRemarks: rec.factoryRemarks || '',
                            status: rec.factoryStatus || 'Received'
                          });
                        }}
                        className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors"
                      >
                        {rec.factoryStatus === 'Received' ? 'Update Intake' : 'Record Intake'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

        {filteredRecords.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-outline-variant">
            <Truck className="mx-auto text-outline-variant mb-4" size={48} />
            <p className="text-on-surface-variant">No truck dispatches found.</p>
          </div>
        )}
      </div>

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
