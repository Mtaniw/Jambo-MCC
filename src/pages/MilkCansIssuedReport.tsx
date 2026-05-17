import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Milk, Calendar, Search, Filter, Download, FileText, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { safeFormat, getTanzaniaTodayStr, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function MilkCansIssuedReport() {
  const { profile, effectiveRole } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [mccFilter, setMccFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);

  useEffect(() => {
    onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  useEffect(() => {
    if (!profile || mccs.length === 0) return;

    let constraints: any[] = [];
    if (startDate) constraints.push(where('dateIssued', '>=', startDate));
    if (endDate) constraints.push(where('dateIssued', '<=', endDate));

    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        constraints.push(where('mccId', 'in', profile.mccIds));
      } else {
        setRecords([]);
        setLoading(false);
        return;
      }
    }

    const q = query(collection(db, 'milk_cans'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'milk_cans'));

    return () => unsubscribe();
  }, [profile, mccs, isGlobalViewer, startDate, endDate]);

  const filteredRecords = records.filter(rec => {
    const matchesSearch = rec.sellerName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rec.driverName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMcc = mccFilter === 'all' || rec.mccId === mccFilter;
    const matchesDate = (!startDate || rec.dateIssued >= startDate) && (!endDate || rec.dateIssued <= endDate);
    return matchesSearch && matchesMcc && matchesDate;
  });

  const stats = {
    totalIssued: filteredRecords.filter(r => r.status === 'Taken').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0),
    totalReturned: filteredRecords.filter(r => r.status === 'Returned').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0),
    pending: filteredRecords.filter(r => r.status === 'Taken').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0) - 
             filteredRecords.filter(r => r.status === 'Returned').reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  };

  const exportToExcel = () => {
    const data = filteredRecords.map(rec => ({
      Date: safeFormat(rec.dateIssued, 'dd/MM/yyyy'),
      MCC: mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      'Seller/Driver': rec.sellerName || rec.driverName || 'N/A',
      Quantity: rec.quantity,
      Status: rec.status,
      'Issued By': rec.issuedBy || 'N/A'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Milk Cans Issued");
    const dateRange = startDate && endDate ? `${startDate}_to_${endDate}` : 'All_Time';
    XLSX.writeFile(wb, `Milk_Cans_Issued_${dateRange}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Milk Cans Issued Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Period: ${startDate || 'All Time'} to ${endDate || 'Present'}`, 14, 30);
    
    const tableData = filteredRecords.map(rec => [
      safeFormat(rec.dateIssued, 'dd/MM/yyyy'),
      mccs.find(m => m.id === rec.mccId)?.name || 'Unknown',
      rec.sellerName || rec.driverName || 'N/A',
      rec.quantity,
      rec.status,
      rec.issuedBy || 'N/A'
    ]);

    (doc as any).autoTable({
      head: [['Date', 'MCC', 'Seller/Driver', 'Qty', 'Status', 'Issued By']],
      body: tableData,
      startY: 40,
    });

    const dateRange = startDate && endDate ? `${startDate}_to_${endDate}` : 'All_Time';
    doc.save(`Milk_Cans_Issued_${dateRange}.pdf`);
  };

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-surface-container-low rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Milk Cans Issued Report</h1>
          <p className="text-on-surface-variant text-sm">Track issuance and return of milk cans</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Total Issued</p>
          <p className="text-2xl font-black text-primary">{stats.totalIssued}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Total Returned</p>
          <p className="text-2xl font-black text-green-600">{stats.totalReturned}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Pending Returns</p>
          <p className="text-2xl font-black text-error">{stats.pending}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">Search Seller or Driver</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search seller or driver..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 h-10 bg-surface-container-low border-none rounded-lg text-sm transition-colors focus:bg-surface-container-high"
            />
          </div>
        </div>

        <div className="w-44 space-y-1">
          <DateInput 
            value={startDate} 
            onChange={setStartDate} 
            label="From"
          />
        </div>

        <div className="w-44 space-y-1">
          <DateInput 
            value={endDate} 
            onChange={setEndDate} 
            label="To"
          />
        </div>
        {isGlobalViewer && (
          <select value={mccFilter} onChange={e => setMccFilter(e.target.value)} className="bg-surface-container-low border-none rounded-lg text-sm">
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        )}
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors" title="Export to Excel">
            <Download size={20} />
          </button>
          <button onClick={exportToPDF} className="p-2 bg-error text-white rounded-lg hover:bg-red-700 transition-colors" title="Export to PDF">
            <FileText size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            <tr>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">MCC</th>
              <th className="px-6 py-3">Seller/Driver</th>
              <th className="px-6 py-3">Quantity</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Issued By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {filteredRecords
              .sort((a, b) => {
                const dateCompare = (b.dateIssued || '').localeCompare(a.dateIssued || '');
                if (dateCompare !== 0) return dateCompare;
                
                const getTime = (val: any) => {
                  if (!val) return 0;
                  if (val.seconds) return val.seconds * 1000;
                  if (val.toDate) return val.toDate().getTime();
                  return new Date(val).getTime() || 0;
                };
                
                return getTime(b.createdAt) - getTime(a.createdAt);
              })
              .map(rec => (
              <tr key={rec.id} className="hover:bg-surface-container-lowest transition-colors">
                <td className="px-6 py-4 text-sm">{safeFormat(rec.dateIssued, 'dd/MM/yyyy')}</td>
                <td className="px-6 py-4 text-sm">{mccs.find(m => m.id === rec.mccId)?.name || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm font-bold">{rec.sellerName || rec.driverName || 'N/A'}</td>
                <td className="px-6 py-4 text-sm font-black">{rec.quantity}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                    rec.status === 'Taken' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                  )}>
                    {rec.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm opacity-60">{rec.issuedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRecords.length === 0 && (
          <div className="text-center py-20">
            <Milk className="mx-auto text-outline-variant mb-4" size={48} />
            <p className="text-on-surface-variant">No records found for the selected period.</p>
          </div>
        )}
      </div>
    </div>
  );
}
