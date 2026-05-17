import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Search, Filter, Download, FileText, Table as TableIcon, FileDown, Printer, Share2, Calendar, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  endOfWeek,
  startOfWeek,
  parseISO,
  isWithinInterval
} from 'date-fns';
import { getTanzaniaDate, safeFormat } from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function SupplierMonthlyPerformance() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [rejects, setRejects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState(format(getTanzaniaDate(), 'yyyy-MM'));
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'high' | 'low' | 'none'>('none');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const allowedRoles = ['Manager', 'Supervisor', 'Director', 'Admin', 'Super User'];
  const hasAccess = profile && allowedRoles.includes(profile.role);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, selectedMccId, searchTerm]);

  useEffect(() => {
    if (!profile || !hasAccess) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
      const sellersData = snapshot.docs.map(doc => {
        const data = doc.data();
        const smccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds: smccIds };
      });
      // Filter sellers by MCC access and active status
      const filteredSellers = sellersData.filter((s: any) => {
        const matchesMcc = profile.role === 'Super User' || profile.role === 'Admin' || (profile.mccIds && s.mccIds && s.mccIds.some((id: string) => profile.mccIds.includes(id)));
        return matchesMcc && s.active !== false;
      });
      setSellers(filteredSellers);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    const unsubscribeRejects = onSnapshot(collection(db, 'rejects'), (snapshot) => {
      setRejects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));

    let q = query(collection(db, 'daily_register'));
    
    // Filter by MCCs the user has access to
    if (profile.role !== 'Super User' && profile.role !== 'Admin') {
      if (profile.mccIds && profile.mccIds.length > 0) {
        q = query(q, where('mccId', 'in', profile.mccIds));
      } else {
        setLoading(false);
        return;
      }
    }

    const unsubscribeEntries = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'daily_register'));

    return () => {
      unsubscribeMccs();
      unsubscribeSellers();
      unsubscribeEntries();
      unsubscribeRejects();
    };
  }, [profile, hasAccess]);

  const reportData = useMemo(() => {
    const baseDate = parseISO(`${selectedMonth}-01`);
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    // Ensure we start from the beginning of the week containing the month start
    const weeks = eachWeekOfInterval({ 
      start: startOfWeek(monthStart, { weekStartsOn: 0 }), 
      end: monthEnd 
    }, { weekStartsOn: 0 });

    const mccFilteredEntries = selectedMccId === 'all' 
      ? entries 
      : entries.filter(e => e.mccId === selectedMccId);

    const monthEntries = mccFilteredEntries.filter(e => {
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const monthRejects = rejects.filter(r => {
      const d = parseISO(r.date);
      const matchesMcc = selectedMccId === 'all' || r.mccId === selectedMccId;
      return matchesMcc && isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    // Group by seller
    const sellerGroups: { [key: string]: any } = {};
    
    // Initialize groups with active sellers to ensure they show up even with 0 deliveries
    sellers.forEach(s => {
      const groupKey = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!sellerGroups[groupKey]) {
        sellerGroups[groupKey] = {
          name: s.name,
          weeks: new Array(weeks.length).fill(0),
          total: 0,
          rejected: 0,
          netPaid: 0
        };
      }
    });

    // Process Daily Register Entries
    monthEntries.forEach(e => {
      const seller = sellers.find(s => s.id === e.sellerId);
      if (!seller) return; // Skip if seller is not in the filtered/active list

      let resolvedName = seller.name.trim();

      // Aggressive normalization for the key to merge duplicates (remove all non-alphanumeric)
      const groupKey = resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (!sellerGroups[groupKey]) {
        sellerGroups[groupKey] = {
          name: resolvedName,
          weeks: new Array(weeks.length).fill(0),
          total: 0,
          rejected: 0,
          netPaid: 0
        };
      }

      const entryDate = parseISO(e.date);
      weeks.forEach((wStart, idx) => {
        const wEnd = endOfWeek(wStart, { weekStartsOn: 0 });
        if (isWithinInterval(entryDate, { start: wStart, end: wEnd })) {
          sellerGroups[groupKey].weeks[idx] += (Number(e.quantity) || 0);
        }
      });

      sellerGroups[groupKey].total += (Number(e.quantity) || 0);
      
      // Only add to netPaid if status is PAID
      if (e.status === 'PAID') {
        sellerGroups[groupKey].netPaid += (Number(e.amount) || (Number(e.quantity) * Number(e.pricePerUnit)) || 0);
      }
    });

    // Process Rejects
    monthRejects.forEach(r => {
      const seller = sellers.find(s => s.id === r.sellerId || s.name === r.sellerName);
      if (!seller) return;

      let resolvedName = seller.name.trim();
      const groupKey = resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (!sellerGroups[groupKey]) {
        sellerGroups[groupKey] = {
          name: resolvedName,
          weeks: new Array(weeks.length).fill(0),
          total: 0,
          rejected: 0,
          netPaid: 0
        };
      }

      sellerGroups[groupKey].rejected += (Number(r.litersRejected) || 0);
    });

    const rows = Object.values(sellerGroups)
      .filter((s: any) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a: any, b: any) => {
        if (sortOrder === 'high') return b.total - a.total;
        if (sortOrder === 'low') return a.total - b.total;
        return 0;
      })
      .map((s: any, idx) => ({
        no: idx + 1,
        ...s
      }));

    const totals = rows.reduce((acc, row) => {
      const weekTotals = acc.weekTotals.map((val: number, i: number) => val + (row.weeks[i] || 0));
      return {
        weekTotals,
        total: acc.total + row.total,
        rejected: acc.rejected + row.rejected,
        netPaid: acc.netPaid + row.netPaid
      };
    }, { 
      weekTotals: new Array(weeks.length).fill(0), 
      total: 0, 
      rejected: 0, 
      netPaid: 0 
    });

    return { rows, totals, weeks, monthLabel: format(baseDate, 'MMMM yyyy') };
  }, [entries, sellers, selectedMonth, selectedMccId, searchTerm]);

  const exportToExcel = () => {
    const data = reportData.rows.map(r => {
      const row: any = {
        'No.': r.no,
        'Seller Name': r.name
      };
      r.weeks.forEach((w: number, i: number) => {
        row[`Week ${i + 1} (L)`] = w;
      });
      row['Total (L)'] = r.total;
      row['Rejected (L)'] = r.rejected;
      row['Net Paid (TZS)'] = r.netPaid;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Performance');
    XLSX.writeFile(wb, `Supplier_Performance_${selectedMonth}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l');
    doc.setFontSize(18);
    doc.text("Jambo Food Products Ltd", 14, 15);
    doc.setFontSize(14);
    doc.text(`Monthly Performance By Supplier - ${reportData.monthLabel}`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy p')}`, 14, 28);
    
    const tableData = reportData.rows.map(r => [
      r.no, 
      r.name, 
      ...r.weeks.map((w: number) => formatNumber(w, 2)),
      formatNumber(r.total, 2),
      formatNumber(r.rejected, 2),
      formatNumber(r.netPaid, 0)
    ]);

    const weekHeaders = reportData.weeks.map((_, i) => `Wk ${i + 1}`);

    (doc as any).autoTable({
      startY: 35,
      head: [['No.', 'Seller Name', ...weekHeaders, 'Total (L)', 'Rejected (L)', 'Net Paid (TZS)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204] }
    });

    doc.save(`Supplier_Performance_${selectedMonth}.pdf`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const doc = new jsPDF('l');
        doc.text("Jambo Food Products Ltd", 14, 15);
        doc.text(`Monthly Performance Report - ${selectedMonth}`, 14, 22);
        const tableData = reportData.rows.map(r => [
          r.no,
          r.name,
          formatNumber(r.total, 2),
          formatNumber(r.rejected, 2),
          `TSh ${formatNumber(r.netPaid, 0)}`
        ]);
        (doc as any).autoTable({
          startY: 30,
          head: [['No.', 'Seller Name', 'Total (L)', 'Rejected (L)', 'Net Paid (TZS)']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `Supplier_Performance_${selectedMonth}.pdf`, { type: 'application/pdf' });

        await navigator.share({
          title: 'Supplier Performance Report',
          text: `Monthly Performance Report for ${selectedMonth}`,
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
  if (loading) return <div className="p-10 text-center">Loading...</div>;

  const totalPages = Math.ceil(reportData.rows.length / pageSize);
  const paginatedRows = reportData.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Monthly Performance (By Supplier)</h1>
          <p className="text-on-surface-variant">Detailed supplier collection summary</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white border rounded-lg hover:bg-surface-dim"><Printer size={18} /></button>
          <button onClick={exportToExcel} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><FileSpreadsheet size={18} /></button>
          <button onClick={exportToPDF} className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dim"><FileDown size={18} /></button>
          <button onClick={handleShare} className="p-2 bg-secondary text-white rounded-lg hover:bg-secondary-dim"><Share2 size={18} /></button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold uppercase mb-1 block">Search Supplier</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="w-48">
          <label className="text-xs font-bold uppercase mb-1 block">Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-2 bg-surface-container-low rounded-lg text-sm" />
        </div>
        <div className="w-48">
          <label className="text-xs font-bold uppercase mb-1 block">MCC</label>
          <select value={selectedMccId} onChange={e => setSelectedMccId(e.target.value)} className="w-full p-2 bg-surface-container-low rounded-lg text-sm">
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="text-xs font-bold uppercase mb-1 block">Sort By Total</label>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value as any)} className="w-full p-2 bg-surface-container-low rounded-lg text-sm">
            <option value="none">Default</option>
            <option value="high">High to Low</option>
            <option value="low">Low to High</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/20 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low font-bold uppercase text-[10px] tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-6 py-4 border-b border-outline-variant/10">No.</th>
                <th className="px-6 py-4 border-b border-outline-variant/10">Seller Name</th>
                {reportData.weeks.map((_, i) => (
                  <th key={i} className="px-6 py-4 border-b border-outline-variant/10 text-right">Wk {i + 1} (L)</th>
                ))}
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Total (L)</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Rejected (L)</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Net Paid (TZS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {paginatedRows.map(row => (
                <tr 
                  key={row.no} 
                  className="hover:bg-primary/5 transition-colors cursor-pointer group"
                  onClick={() => {/* Potential drill down to seller history */}}
                >
                  <td className="px-6 py-4 text-on-surface-variant">{row.no}</td>
                  <td className="px-6 py-4 font-bold text-on-surface group-hover:text-primary transition-colors">{row.name}</td>
                  {row.weeks.map((w: number, i: number) => (
                    <td key={i} className="px-6 py-4 text-right">{formatNumber(w, 2)}</td>
                  ))}
                  <td className="px-6 py-4 text-right font-bold">{formatNumber(row.total, 2)}</td>
                  <td className="px-6 py-4 text-right text-error">{formatNumber(row.rejected, 2)}</td>
                  <td className="px-6 py-4 text-right font-bold text-primary">{formatNumber(row.netPaid, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-container-low/50 font-bold border-t border-outline-variant/20">
              <tr>
                <td colSpan={2} className="px-6 py-5 text-right text-xs uppercase tracking-wider text-on-surface-variant">Grand Totals</td>
                {reportData.totals.weekTotals.map((w: number, i: number) => (
                  <td key={i} className="px-6 py-5 text-right">{formatNumber(w, 2)}</td>
                ))}
                <td className="px-6 py-5 text-right text-on-surface">{formatNumber(reportData.totals.total, 2)}</td>
                <td className="px-6 py-5 text-right text-error">{formatNumber(reportData.totals.rejected, 2)}</td>
                <td className="px-6 py-5 text-right text-primary text-base">{formatNumber(reportData.totals.netPaid, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="bg-surface-container-low/30 px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between">
          <div className="text-xs text-on-surface-variant font-medium">
            Showing <span className="font-bold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(currentPage * pageSize, reportData.rows.length)}</span> of <span className="font-bold text-on-surface">{reportData.rows.length}</span> suppliers
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
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
