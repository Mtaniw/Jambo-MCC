import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Search, Filter, Download, FileText, Table as TableIcon, FileDown, Printer, Share2, Calendar, AlertCircle, FileSpreadsheet, Truck, ChevronDown, ChevronUp, Beaker, CheckCircle2 } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { 
  format, 
  startOfMonth, 
  endOfWeek, 
  eachDayOfInterval, 
  parseISO,
  isWithinInterval
} from 'date-fns';
import { getTanzaniaDate, safeFormat } from '../lib/dateUtils';
import { getResazurinGrade } from '../lib/qualityConstants';
import { ResazurinBadge } from '../components/ResazurinBadge';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function TankerWeeklyReport() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [mccFilter, setMccFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'),
    end: format(getTanzaniaDate(), 'yyyy-MM-dd')
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const allowedRoles = ['Cashier', 'Manager', 'Supervisor', 'Director', 'Admin', 'Super User'];
  const hasAccess = profile && allowedRoles.includes(profile.role);

  useEffect(() => {
    setCurrentPage(1);
  }, [records, mccFilter]);

  useEffect(() => {
    if (!profile || !hasAccess) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const q = query(
      collection(db, 'truck_qa'), 
      where('date', '>=', dateRange.start), 
      where('date', '<=', dateRange.end),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'truck_qa'));

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
    });

    return () => {
      unsubscribeMccs();
      unsubscribe();
      unsubscribeSettings();
    };
  }, [profile, hasAccess, dateRange.start, dateRange.end]);

  const reportData = useMemo(() => {
    let displayRecords = [...records].filter(rec => {
      const matchesMcc = mccFilter === 'all' || 
                         rec.mccId === mccFilter || 
                         mccs.find(m => m.id === mccFilter)?.name === rec.mccId;
      
      return matchesMcc;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totals = displayRecords.reduce((acc, rec) => {
      const sent = Number(rec.litresLoaded) || 0;
      const received = Number(rec.qtyReceived) || 0;
      return {
        sent: acc.sent + sent,
        received: acc.received + received,
        diff: acc.diff + (sent - received)
      };
    }, { sent: 0, received: 0, diff: 0 });

    return { 
      rows: displayRecords, 
      totals, 
      weekRange: "Custom Range" 
    };
  }, [records, mccFilter, mccs]);

  const totalPages = Math.ceil(reportData.rows.length / pageSize);
  const paginatedRows = reportData.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportToExcel = () => {
    const data = reportData.rows.map(r => ({
      Day: format(parseISO(r.date), 'EEEE'),
      MCC: mccs.find(m => m.id === r.mccId)?.name || 'Unknown',
      'Date Sent': safeFormat(r.date, 'dd/MM/yyyy'),
      'Date Received': r.receivedAt ? safeFormat(r.receivedAt, 'dd/MM/yyyy') : 'Pending',
      'Liters Sent': r.litresLoaded,
      'Liters Received': r.qtyReceived || 0,
      'Difference': (r.litresLoaded - (r.qtyReceived || 0)),
      'Driver Name': r.driverName,
      'Truck Reg': r.truckReg
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tanker Report');
    XLSX.writeFile(wb, `Tanker_Report_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l');
    doc.setFontSize(18);
    doc.text("Jambo Food Products Ltd", 14, 15);
    doc.setFontSize(14);
    doc.text(`Tanker Loading & Delivery Report`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${safeFormat(dateRange.start)} to ${safeFormat(dateRange.end)}`, 14, 28);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy p')}`, 14, 34);
    
    const tableData = reportData.rows.map(r => [
      format(parseISO(r.date), 'EEE'),
      mccs.find(m => m.id === r.mccId)?.name || 'Unknown',
      safeFormat(r.date),
      r.receivedAt ? safeFormat(r.receivedAt) : 'Pending',
      r.litresLoaded.toFixed(1),
      (r.qtyReceived || 0).toFixed(1),
      (r.litresLoaded - (r.qtyReceived || 0)).toFixed(1),
      r.driverName,
      r.truckReg
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['Day', 'MCC', 'Sent', 'Recv', 'L Sent', 'L Recv', 'Diff', 'Driver', 'Truck']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Tanker_Report_${dateRange.start}_${dateRange.end}.pdf`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const doc = new jsPDF('l');
        doc.text("Jambo Food Products Ltd", 14, 15);
        doc.text(`Tanker Report: ${safeFormat(dateRange.start)} - ${safeFormat(dateRange.end)}`, 14, 22);
        const tableData = reportData.rows.map(r => [
          safeFormat(r.date),
          mccs.find(m => m.id === r.mccId)?.name || 'Unknown',
          r.litresLoaded.toFixed(1),
          (r.qtyReceived || 0).toFixed(1),
          r.truckReg
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['Date', 'MCC', 'Sent', 'Recv', 'Truck']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `Tanker_Report_${dateRange.start}.pdf`, { type: 'application/pdf' });

        await navigator.share({
          title: 'Tanker Loading & Delivery Report',
          text: `Tanker movement summary for ${safeFormat(dateRange.start)} - ${safeFormat(dateRange.end)}`,
          files: [file]
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Sharing is not supported on this browser. Please use the Download buttons.');
    }
  };

  if (!hasAccess) return <div className="p-10 text-center text-error font-bold">Access Denied</div>;

  return (
    <div className={cn("space-y-6", loading && "opacity-60")}>
      {loading && records.length === 0 && (
        <div className="flex justify-center p-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Tanker Loading & Delivery Report</h1>
          <p className="text-on-surface-variant text-sm">Detailed analysis of milk transportation and arrival</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white border border-outline-variant/30 rounded-lg hover:bg-surface-dim transition-colors"><Printer size={18} /></button>
          <button onClick={exportToExcel} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm transition-colors"><FileSpreadsheet size={18} /></button>
          <button onClick={exportToPDF} className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dim shadow-sm transition-colors"><FileDown size={18} /></button>
          <button onClick={handleShare} className="p-2 bg-secondary text-white rounded-lg hover:bg-secondary-dim shadow-sm transition-colors"><Share2 size={18} /></button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">From</label>
          <input 
            type="date"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold py-2 px-3 h-10 transition-colors focus:bg-surface-container-high"
          />
        </div>

        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">To</label>
          <input 
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold py-2 px-3 h-10 transition-colors focus:bg-surface-container-high"
          />
        </div>

        <div className="w-48">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">MCC Filter</label>
          <select 
            value={mccFilter} 
            onChange={e => setMccFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 px-3 transition-colors focus:bg-surface-container-high"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-on-surface-variant">Total Sent</p>
            <p className="font-bold text-primary">{formatNumber(reportData.totals.sent, 1)} L</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-on-surface-variant">Total Received</p>
            <p className="font-bold text-green-600">{formatNumber(reportData.totals.received, 1)} L</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-on-surface-variant">Total Diff</p>
            <p className="font-bold text-error">{formatNumber(reportData.totals.diff, 1)} L</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {paginatedRows.map((row) => {
          const isExpanded = expandedId === row.id;
          const mcc = mccs.find(m => m.id === row.mccId);

          return (
            <div 
              key={row.id} 
              className={cn(
                "bg-white rounded-xl border transition-all duration-200 overflow-hidden",
                isExpanded ? "border-primary shadow-md" : "border-outline-variant/20 shadow-sm hover:shadow-md"
              )}
            >
              <div 
                className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "bg-primary/10 p-3 rounded-lg text-primary transition-colors",
                    isExpanded && "bg-primary text-white"
                  )}>
                    <Truck size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{row.truckReg}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                      <span className="font-medium">{format(parseISO(row.date), 'EEEE')}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-bold"><Calendar size={12} /> Sent: {safeFormat(row.date, 'dd/MM/yyyy')}</span>
                      <span>•</span>
                      <span className={cn(
                        "flex items-center gap-1 font-bold",
                        row.receivedAt ? "text-green-600" : "text-amber-600"
                      )}>
                        <CheckCircle2 size={12} /> Received: {row.receivedAt ? safeFormat(row.receivedAt, 'dd/MM/yyyy') : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">MCC</p>
                    <p className="font-bold text-sm">{mcc?.name || 'Unknown'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Sent</p>
                    <p className="font-bold text-sm">{formatNumber(row.litresLoaded, 1)} L</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Received</p>
                    <p className="font-bold text-green-600 text-sm">{formatNumber(row.qtyReceived, 1)} L</p>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="text-[10px] font-bold uppercase text-on-surface-variant">Status</p>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase inline-block",
                      row.receivedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {row.factoryStatus || (row.receivedAt ? 'Received' : 'In Transit')}
                    </div>
                  </div>
                  <div className="text-on-surface-variant ml-2">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-outline-variant/10 p-6 bg-surface-container-lowest space-y-8 animate-in slide-in-from-top-2 duration-200">
                  {/* Dispatch Details (From MCC) */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-4 bg-primary rounded-full"></div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Dispatch Details (From MCC)</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Loading Temp</p>
                        <p className={cn("font-bold", row.tempAtLoading > 6 ? "text-error" : "text-on-surface")}>
                          {formatNumber(row.tempAtLoading, 1)}°C
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">pH Level</p>
                        <p className={cn("font-bold", (row.ph < 6.6 || row.ph > 6.8) ? "text-error" : "text-on-surface")}>
                          {formatNumber(row.ph, 2)}
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Alcohol Test</p>
                        <p className={cn("font-bold", row.alcoholTest === 'Fail' ? "text-error" : "text-on-surface")}>
                          {row.alcoholTest}
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Density</p>
                        <p className="font-bold">{formatNumber(row.density, 3)}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Antibiotic</p>
                        <p className={cn("font-bold", row.antibiotic === 'Positive' ? "text-error" : "text-on-surface")}>
                          {row.antibiotic}
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Organoleptic</p>
                        <p className="font-bold">{row.organoleptic}</p>
                      </div>
                      
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10 md:col-span-2">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Resazurin Grade</p>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getResazurinGrade(row.resazurin).dotColor }}
                          ></div>
                          <p className="font-bold text-sm">
                            {row.resazurin ? `${getResazurinGrade(row.resazurin).label} - ${getResazurinGrade(row.resazurin).description}` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Loaded Weight</p>
                        <p className="font-bold">{formatNumber(row.weightKg, 2)} KG</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Seal Number</p>
                        <p className="font-bold">{row.sealNo || '---'}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-outline-variant/10 md:col-span-2">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Driver Information</p>
                        <p className="font-bold text-sm">{row.driverName} {row.driverPhone ? `(${row.driverPhone})` : ''}</p>
                      </div>
                    </div>
                  </section>

                  {/* Factory Intake Details (At Factory) */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-4 bg-green-600 rounded-full"></div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-green-600">Intake Details (Factory Received)</h4>
                    </div>
                    
                    {row.receivedAt ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Received Qty</p>
                          <p className="font-bold text-green-600">{formatNumber(row.qtyReceived, 1)} L</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Difference</p>
                          <p className={cn("font-bold", (row.litresLoaded - (row.qtyReceived || 0)) !== 0 ? "text-error" : "text-green-600")}>
                            {formatNumber(row.litresLoaded - (row.qtyReceived || 0), 1)} L
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Factory Temp</p>
                          <p className={cn("font-bold", row.factoryTemp > 6 ? "text-error" : "text-on-surface")}>
                            {row.factoryTemp ? `${formatNumber(row.factoryTemp, 1)}°C` : 'N/A'}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Factory pH</p>
                          <p className={cn("font-bold", (row.factoryPh < 6.6 || row.factoryPh > 6.8) ? "text-error" : "text-on-surface")}>
                            {row.factoryPh ? formatNumber(row.factoryPh, 2) : 'N/A'}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Factory Alcohol</p>
                          <p className={cn("font-bold", row.factoryAlcoholTest === 'Fail' ? "text-error" : "text-on-surface")}>
                            {row.factoryAlcoholTest || 'N/A'}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Rejected Qty</p>
                          <p className={cn("font-bold", row.qtyRejected > 0 ? "text-error" : "text-on-surface")}>
                            {formatNumber(row.qtyRejected, 1)} L
                          </p>
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10 md:col-span-2">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-2 font-black">Factory Resazurin</p>
                          <ResazurinBadge value={row.factoryResazurin} className="w-full justify-center" />
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Received Date</p>
                          <p className="font-bold">{safeFormat(row.receivedAt, 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-outline-variant/10 md:col-span-3">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant mb-1">Factory Remarks</p>
                          <p className="text-sm italic text-on-surface-variant">
                            {row.factoryRemarks ? `"${row.factoryRemarks}"` : 'No remarks provided'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-10 bg-white rounded-xl border border-dashed border-outline-variant/40 text-center text-on-surface-variant italic">
                        The factory has not yet recorded the intake for this tanker.
                      </div>
                    )}
                  </section>
                  
                  <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-medium pt-4 border-t border-outline-variant/10">
                    <div>
                      Recorded by: <span className="font-bold">{row.qualityController || 'N/A'}</span> (MCC)
                    </div>
                    {row.receivedBy && (
                      <div>
                        Accepted by: <span className="font-bold">{row.receivedBy}</span> (Factory)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
        {reportData.rows.length === 0 && (
          <div className="bg-white p-10 rounded-xl border border-dashed border-outline-variant/40 text-center text-on-surface-variant italic">
            No tanker records found.
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white px-6 py-4 rounded-xl border border-outline-variant/20 shadow-sm flex items-center justify-between">
          <div className="text-xs text-on-surface-variant">
            Showing <span className="font-bold">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold">{Math.min(currentPage * pageSize, reportData.rows.length)}</span> of <span className="font-bold">{reportData.rows.length}</span> dispatches
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
