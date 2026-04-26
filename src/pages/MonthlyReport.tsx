import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Search, Filter, Download, FileText, Table as TableIcon, FileDown, Printer, Share2, Calendar } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  endOfWeek,
  isSameMonth,
  parseISO,
  startOfDay,
  addDays,
  subDays,
  isWithinInterval
} from 'date-fns';
import { getTanzaniaDate, safeFormat } from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function MonthlyReport() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState(format(getTanzaniaDate(), 'yyyy-MM'));

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(profile.role);

  useEffect(() => {
    if (!profile) return;

    // Fetch MCCs
    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    // Fetch Entries
    let q = query(collection(db, 'daily_register'));
    let canQuery = true;
    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        q = query(collection(db, 'daily_register'), where('mccId', 'in', profile.mccIds));
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
      unsubscribeEntries();
    };
  }, [profile, isGlobalViewer]);

  const reportData = useMemo(() => {
    const baseDate = parseISO(`${selectedMonth}-01`);
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    
    // Get weeks in the month
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });

    const mccFilteredEntries = selectedMccId === 'all' 
      ? entries 
      : entries.filter(e => e.mccId === selectedMccId);

    const rows = weeks.map((weekStart, index) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
      
      // Clamp week to month boundaries
      const actualStart = weekStart < monthStart ? monthStart : weekStart;
      const actualEnd = weekEnd > monthEnd ? monthEnd : weekEnd;

      const weekEntries = mccFilteredEntries.filter(e => {
        const entryDate = parseISO(e.date);
        return isWithinInterval(entryDate, { start: actualStart, end: actualEnd });
      });
      
      const sellers = new Set(weekEntries.map(e => e.sellerId || e.manualSellerName)).size;
      const totalLiters = weekEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      const paidEntries = weekEntries.filter(e => e.status === 'PAID');
      const paidLiters = paidEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      const paidAmount = paidEntries.reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0);
      const unpaidEntries = weekEntries.filter(e => e.status === 'PENDING' || e.status === 'UNPAID');
      const unpaidAmount = unpaidEntries.reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0);
      const totalAmount = paidAmount + unpaidAmount;

      return {
        no: index + 1,
        weekLabel: `Week ${index + 1}`,
        dateRange: `${format(actualStart, 'dd/MM/yyyy')} - ${format(actualEnd, 'dd/MM/yyyy')}`,
        sellers,
        totalLiters,
        paidLiters,
        paidAmount,
        unpaidAmount,
        totalAmount
      };
    });

    const monthEntries = mccFilteredEntries.filter(e => {
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const totals = {
      sellers: new Set(monthEntries.map(e => e.sellerId || e.manualSellerName)).size,
      totalLiters: monthEntries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
      paidLiters: monthEntries.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
      paidAmount: monthEntries.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0),
      unpaidAmount: monthEntries.filter(e => e.status === 'PENDING' || e.status === 'UNPAID').reduce((sum, e) => sum + (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0), 0),
      totalAmount: 0
    };
    totals.totalAmount = totals.paidAmount + totals.unpaidAmount;

    return { rows, totals, monthLabel: format(baseDate, 'MMMM yyyy') };
  }, [entries, selectedMonth, selectedMccId]);

  const exportToExcel = () => {
    const data: any[] = reportData.rows.map(r => ({
      '#': r.no,
      'WEEK': r.weekLabel,
      'RANGE': r.dateRange,
      'NO OF SELLERS': r.sellers,
      'TOTAL LITERS': r.totalLiters,
      'PAID LITERS': r.paidLiters,
      'PAID AMOUNT (TSh)': r.paidAmount,
      'UNPAID AMOUNT (TSh)': r.unpaidAmount,
      'TOTAL AMOUNT (TSh)': r.totalAmount
    }));

    data.push({
      '#': '',
      'WEEK': 'TOTALS',
      'RANGE': '',
      'NO OF SELLERS': reportData.totals.sellers,
      'TOTAL LITERS': reportData.totals.totalLiters,
      'PAID LITERS': reportData.totals.paidLiters,
      'PAID AMOUNT (TSh)': reportData.totals.paidAmount,
      'UNPAID AMOUNT (TSh)': reportData.totals.unpaidAmount,
      'TOTAL AMOUNT (TSh)': reportData.totals.totalAmount
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Report');
    XLSX.writeFile(wb, `Monthly_Milk_Report_${reportData.monthLabel.replace(/ /g, '_')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const mccName = selectedMccId === 'all' ? 'All MCCs' : mccs.find(m => m.id === selectedMccId)?.name || '';
    
    doc.setFontSize(18);
    doc.text('JAMBO GROUP - MONTHLY MILK COLLECTION REPORT', 14, 22);
    doc.setFontSize(12);
    doc.text(`MCC: ${mccName}`, 14, 32);
    doc.text(`Month: ${reportData.monthLabel}`, 14, 40);

    const tableData: any[][] = reportData.rows.map(r => [
      r.no,
      `${r.weekLabel} (${r.dateRange})`,
      r.sellers,
      r.totalLiters.toFixed(1),
      r.paidLiters.toFixed(1),
      r.paidAmount.toLocaleString(),
      r.unpaidAmount.toLocaleString(),
      r.totalAmount.toLocaleString()
    ]);

    tableData.push([
      '',
      'TOTALS',
      reportData.totals.sellers,
      reportData.totals.totalLiters.toFixed(1),
      reportData.totals.paidLiters.toFixed(1),
      reportData.totals.paidAmount.toLocaleString(),
      reportData.totals.unpaidAmount.toLocaleString(),
      reportData.totals.totalAmount.toLocaleString()
    ]);

    (doc as any).autoTable({
      head: [['#', 'WEEK', 'SELLERS', 'TOTAL L', 'PAID L', 'PAID (TSh)', 'UNPAID (TSh)', 'TOTAL (TSh)']],
      body: tableData,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Monthly_Milk_Report_${reportData.monthLabel.replace(/ /g, '_')}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Monthly Milk Collection Report',
          text: `Monthly Milk Collection Report for ${reportData.monthLabel}`,
          url: window.location.href
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  return (
    <div className="space-y-6 print:p-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Monthly Milk Collection Report</h1>
          <p className="text-on-surface-variant">Weekly aggregation for the month</p>
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
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1">Select Month</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
        </div>
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
              <h2 className="text-lg font-bold text-primary">Monthly Collection Summary</h2>
              <p className="text-sm text-on-surface-variant">{reportData.monthLabel}</p>
            </div>
            <div className="text-right hidden md:block">
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
                <th className="px-6 py-4 border-b border-outline-variant/20">Week Period</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-center">Sellers</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Total Liters</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Paid Liters</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Paid (TSh)</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Unpaid (TSh)</th>
                <th className="px-6 py-4 border-b border-outline-variant/20 text-right">Total (TSh)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {reportData.rows.map((row) => (
                <tr key={row.no} className="hover:bg-surface-dim/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{row.no}</td>
                  <td className="px-6 py-4 text-sm font-bold text-on-surface">
                    {row.weekLabel}
                    <span className="block text-[10px] text-on-surface-variant font-normal uppercase tracking-tighter">{row.dateRange}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">{row.sellers}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatNumber(row.totalLiters, 1)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">{formatNumber(row.paidLiters, 1)}</td>
                  <td className="px-6 py-4 text-sm text-right font-bold">{formatNumber(row.paidAmount, 0)}</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">{formatNumber(row.unpaidAmount, 0)}</td>
                  <td className="px-6 py-4 text-sm text-right font-black text-primary">{formatNumber(row.totalAmount, 0)}</td>
                </tr>
              ))}
              {reportData.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant italic">
                    No collection data found for this month.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-primary/5">
              <tr className="font-black text-on-surface">
                <td colSpan={2} className="px-6 py-4 text-right uppercase tracking-wider text-xs">Monthly Totals</td>
                <td className="px-6 py-4 text-center">{reportData.totals.sellers}</td>
                <td className="px-6 py-4 text-right">{formatNumber(reportData.totals.totalLiters, 1)}</td>
                <td className="px-6 py-4 text-right text-green-600">{formatNumber(reportData.totals.paidLiters, 1)}</td>
                <td className="px-6 py-4 text-right">{formatNumber(reportData.totals.paidAmount, 0)}</td>
                <td className="px-6 py-4 text-right text-red-600">{formatNumber(reportData.totals.unpaidAmount, 0)}</td>
                <td className="px-6 py-4 text-right text-primary text-lg">{formatNumber(reportData.totals.totalAmount, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="hidden print:block mt-10 text-center text-[10px] text-on-surface-variant">
        Report generated on {format(getTanzaniaDate(), 'PPP pp')} | Jambo MCC Management System
      </div>
    </div>
  );
}
