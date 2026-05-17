import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Search, Filter, Download, FileText, Table as TableIcon, FileDown, Printer, Share2, Calendar } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  addDays, 
  subDays,
  isSaturday,
  parseISO,
  startOfDay
} from 'date-fns';
import { getTanzaniaDate, safeFormat } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function WeeklyReport() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<any[]>([]);
  const [rejects, setRejects] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [startDate, setStartDate] = useState(format(startOfWeek(getTanzaniaDate(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(getTanzaniaDate(), 'yyyy-MM-dd'));

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director', 'Viewer'].includes(profile.role);

  useEffect(() => {
    if (!profile) return;

    // Fetch MCCs
    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    // Fetch Rejects
    let qRejects = query(collection(db, 'rejects'), where('date', '>=', startDate), where('date', '<=', endDate));
    if (!isGlobalViewer && profile.mccIds.length > 0) {
      qRejects = query(collection(db, 'rejects'), where('mccId', 'in', profile.mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
    }
    const unsubscribeRejects = onSnapshot(qRejects, (snapshot) => {
      setRejects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));

    // Fetch Entries
    let q = query(collection(db, 'daily_register'), where('date', '>=', startDate), where('date', '<=', endDate));
    let canQuery = true;
    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        q = query(collection(db, 'daily_register'), where('mccId', 'in', profile.mccIds), where('date', '>=', startDate), where('date', '<=', endDate));
      } else {
        canQuery = false;
        setEntries([]);
        setLoading(false);
      }
    }

    let unsubscribeEntries = () => {};
    if (canQuery) {
      unsubscribeEntries = onSnapshot(q, (snapshot) => {
        setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'daily_register'));
    }

    return () => {
      unsubscribeMccs();
      unsubscribeRejects();
      unsubscribeEntries();
    };
  }, [profile, isGlobalViewer, startDate, endDate]);

  const reportData = useMemo(() => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    // Safety check for invalid dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { rows: [], totals: { sellers: 0, totalLiters: 0, rejectedLiters: 0, paidLiters: 0, paidAmount: 0, unpaidAmount: 0, totalAmount: 0 }, weekRange: 'Invalid Date' };
    }

    const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });

    const mccFilteredEntries = entries.filter(e => {
      const matchesMcc = selectedMccId === 'all' || e.mccId === selectedMccId;
      const matchesDate = e.date >= startDate && e.date <= endDate;
      return matchesMcc && matchesDate;
    });

    const mccFilteredRejects = rejects.filter(r => {
      const matchesMcc = selectedMccId === 'all' || r.mccId === selectedMccId;
      const matchesDate = r.date >= startDate && r.date <= endDate;
      return matchesMcc && matchesDate;
    });

    const rows = days.map((day, index) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayEntries = mccFilteredEntries.filter(e => e.date === dayStr);
      const dayRejects = mccFilteredRejects.filter(r => r.date === dayStr);
      
      const sellers = new Set(dayEntries.map(e => e.sellerId || e.manualSellerName)).size;
      const totalLiters = dayEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      const rejectedLiters = dayRejects.reduce((sum, r) => sum + (Number(r.litersRejected) || 0), 0);
      const paidEntries = dayEntries.filter(e => e.status === 'PAID');
      const paidLiters = paidEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      const paidAmount = paidEntries.reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0);
      const unpaidEntries = dayEntries.filter(e => e.status === 'PENDING' || e.status === 'UNPAID');
      const unpaidAmount = unpaidEntries.reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0);
      const totalAmount = paidAmount + unpaidAmount;

      return {
        no: index + 1,
        date: dayStr,
        displayDate: format(day, 'dd/MM/yyyy'),
        sellers,
        totalLiters,
        rejectedLiters,
        paidLiters,
        paidAmount,
        unpaidAmount,
        totalAmount
      };
    });

    const totals = {
      sellers: new Set(mccFilteredEntries.map(e => e.sellerId || e.manualSellerName)).size,
      totalLiters: mccFilteredEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
      rejectedLiters: mccFilteredRejects.reduce((sum, r) => sum + (Number(r.litersRejected) || 0), 0),
      paidLiters: mccFilteredEntries.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
      paidAmount: mccFilteredEntries.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0),
      unpaidAmount: mccFilteredEntries.filter(e => e.status === 'PENDING' || e.status === 'UNPAID').reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0),
      totalAmount: 0
    };
    totals.totalAmount = totals.paidAmount + totals.unpaidAmount;

    return { rows, totals, weekRange: `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}` };
  }, [entries, rejects, startDate, endDate, selectedMccId]);

  const exportToExcel = () => {
    const mccName = selectedMccId === 'all' ? 'All MCCs' : mccs.find(m => m.id === selectedMccId)?.name || '';
    const data: any[] = [
      { '#': 'MCC:', 'DATE': mccName, 'NO OF SELLERS': '', 'TOTAL LITERS': '', 'PAID LITERS': '', 'PAID AMOUNT (TSh)': '', 'UNPAID AMOUNT (TSh)': '', 'TOTAL AMOUNT (TSh)': '' },
      { '#': 'Period:', 'DATE': reportData.weekRange, 'NO OF SELLERS': '', 'TOTAL LITERS': '', 'PAID LITERS': '', 'PAID AMOUNT (TSh)': '', 'UNPAID AMOUNT (TSh)': '', 'TOTAL AMOUNT (TSh)': '' },
      {}, // Empty row
      ...reportData.rows.map(r => ({
        '#': r.no,
        'DATE': r.displayDate,
        'NO OF SELLERS': r.sellers,
        'TOTAL LITERS': r.totalLiters,
        'PAID LITERS': r.paidLiters,
        'PAID AMOUNT (TSh)': r.paidAmount,
        'UNPAID AMOUNT (TSh)': r.unpaidAmount,
        'TOTAL AMOUNT (TSh)': r.totalAmount
      }))
    ];

    data.push({
      '#': '',
      'DATE': 'TOTALS',
      'NO OF SELLERS': reportData.totals.sellers,
      'TOTAL LITERS': reportData.totals.totalLiters,
      'PAID LITERS': reportData.totals.paidLiters,
      'PAID AMOUNT (TSh)': reportData.totals.paidAmount,
      'UNPAID AMOUNT (TSh)': reportData.totals.unpaidAmount,
      'TOTAL AMOUNT (TSh)': reportData.totals.totalAmount
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Report');
    XLSX.writeFile(wb, `Weekly_Milk_Report_${reportData.weekRange.replace(/ /g, '_')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const mccName = selectedMccId === 'all' ? 'All MCCs' : mccs.find(m => m.id === selectedMccId)?.name || '';
    
    doc.setFontSize(18);
    doc.text('JAMBO GROUP - WEEKLY MILK COLLECTION REPORT', 14, 22);
    doc.setFontSize(12);
    doc.text(`MCC: ${mccName}`, 14, 32);
    doc.text(`Week: ${reportData.weekRange}`, 14, 40);

    const tableData: any[][] = reportData.rows.map(r => [
      r.no,
      r.displayDate,
      r.sellers,
      formatNumber(r.totalLiters, 2),
      formatNumber(r.paidLiters, 2),
      formatNumber(r.paidAmount, 0),
      formatNumber(r.unpaidAmount, 0),
      formatNumber(r.totalAmount, 0)
    ]);

    tableData.push([
      '',
      'TOTALS',
      reportData.totals.sellers,
      formatNumber(reportData.totals.totalLiters, 2),
      formatNumber(reportData.totals.paidLiters, 2),
      formatNumber(reportData.totals.paidAmount, 0),
      formatNumber(reportData.totals.unpaidAmount, 0),
      formatNumber(reportData.totals.totalAmount, 0)
    ]);

    (doc as any).autoTable({
      head: [['#', 'DATE', 'SELLERS', 'TOTAL L', 'PAID L', 'PAID (TSh)', 'UNPAID (TSh)', 'TOTAL (TSh)']],
      body: tableData,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Weekly_Milk_Report_${reportData.weekRange.replace(/ /g, '_')}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Weekly Milk Collection Report',
          text: `Weekly Milk Collection Report for ${reportData.weekRange}`,
          url: window.location.href
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  return (
    <div className="space-y-6 print:p-0">
      {/* Print Header */}
      <div className="hidden print:block text-center space-y-2 mb-8">
        <h1 className="text-2xl font-black uppercase text-primary">Jambo Food Products Ltd</h1>
        <h2 className="text-xl font-bold">Weekly Milk Collection Report</h2>
        <div className="flex justify-center gap-4 text-sm font-bold">
          <span>Center: {selectedMccId === 'all' ? 'All Centers' : mccs.find(m => m.id === selectedMccId)?.name}</span>
          <span>•</span>
          <span>Period: {reportData.weekRange}</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Weekly Milk Collection Report</h1>
          <p className="text-on-surface-variant">
            {selectedMccId === 'all' ? 'All Milk Collection Centers' : mccs.find(m => m.id === selectedMccId)?.name} • Periodic summary
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleShare} className="flex items-center gap-2 bg-white border border-outline-variant px-4 py-2 rounded-lg hover:bg-surface-dim transition-colors">
            <Share2 size={18} /> Share
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-white border border-outline-variant px-4 py-2 rounded-lg hover:bg-surface-dim transition-colors">
            <Printer size={18} /> Print
          </button>
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            <TableIcon size={18} /> Excel
          </button>
          <button onClick={exportToPDF} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dim transition-colors">
            <FileDown size={18} /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-outline-variant/20 flex flex-wrap gap-4 items-end print:hidden">
        <DateInput 
          value={startDate} 
          onChange={setStartDate} 
          label="From Date"
          className="flex-1 min-w-[150px]"
        />
        <DateInput 
          value={endDate} 
          onChange={setEndDate} 
          label="To Date"
          className="flex-1 min-w-[150px]"
        />
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Filter by MCC</label>
          <select
            value={selectedMccId}
            onChange={(e) => setSelectedMccId(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => (
              <option key={mcc.id} value={mcc.id}>{mcc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl shadow-lg border border-outline-variant/20 overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 bg-surface-dim/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-primary">Weekly Collection Summary</h2>
              <p className="text-sm text-on-surface-variant">{reportData.weekRange}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-on-surface-variant uppercase">MCC</p>
              <p className="font-bold">{selectedMccId === 'all' ? 'All Centers' : mccs.find(m => m.id === selectedMccId)?.name}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-on-surface-variant uppercase text-[10px] tracking-widest font-bold">
                <th className="px-6 py-4 border-b border-outline-variant/20">#</th>
                <th className="px-6 py-4 border-b border-outline-variant/20">Date</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-center">Sellers</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Total Liters</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Rejected (L)</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Paid Liters</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Paid (TSh)</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Unpaid (TSh)</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Total (TSh)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {reportData.rows.map((row) => (
                <tr 
                  key={row.date} 
                  onClick={() => navigate(`/daily-register?date=${row.date}&mccId=${selectedMccId}`)}
                  className="hover:bg-primary/5 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{row.no}</td>
                  <td className="px-6 py-4 text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{row.displayDate}</td>
                  <td className="px-6 py-4 text-sm text-center">{row.sellers}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatNumber(row.totalLiters, 2)}</td>
                  <td className="px-6 py-4 text-sm text-right text-error font-medium">{formatNumber(row.rejectedLiters, 2)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">{formatNumber(row.paidLiters, 2)}</td>
                  <td className="px-6 py-4 text-sm text-right font-bold">{formatNumber(row.paidAmount, 0)}</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">{formatNumber(row.unpaidAmount, 0)}</td>
                  <td className="px-6 py-4 text-sm text-right font-black text-primary">{formatNumber(row.totalAmount, 0)}</td>
                </tr>
              ))}
              {reportData.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant italic">
                    No collection data found for this week.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-primary/5">
              <tr className="font-black text-on-surface">
                <td colSpan={2} className="px-6 py-4 text-right uppercase tracking-wider text-xs">Grand Totals</td>
                <td className="px-6 py-4 text-center">{reportData.totals.sellers}</td>
                <td className="px-6 py-4 text-right">{formatNumber(reportData.totals.totalLiters, 2)}</td>
                <td className="px-6 py-4 text-right text-error">{formatNumber(reportData.totals.rejectedLiters, 2)}</td>
                <td className="px-6 py-4 text-right text-green-600">{formatNumber(reportData.totals.paidLiters, 2)}</td>
                <td className="px-6 py-4 text-right">{formatNumber(reportData.totals.paidAmount, 0)}</td>
                <td className="px-6 py-4 text-right text-red-600">{formatNumber(reportData.totals.unpaidAmount, 0)}</td>
                <td className="px-6 py-4 text-right text-primary text-lg">{formatNumber(reportData.totals.totalAmount, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="hidden print:block mt-10 text-center text-[10px] text-on-surface-variant">
        Report generated on {format(getTanzaniaDate(), 'dd/MM/yyyy HH:mm')} | Jambo MCC Management System
      </div>
    </div>
  );
}
