import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Search, Filter, Download, FileText, Table as TableIcon, FileDown, Printer, Share2, Calendar, AlertCircle, FileSpreadsheet, ChevronLeft, ChevronRight, Loader2, Edit2, Trash2, X, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  parseISO,
  isWithinInterval,
  subDays,
  eachDayOfInterval
} from 'date-fns';
import { getTanzaniaDate, safeFormat, parseTanzaniaDate, getTanzaniaTodayStr } from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { TypeAhead } from '../components/TypeAhead';

const REJECTION_REASONS: { [key: string]: string } = {
  'A': 'Adulteration — Water / Soda / Other',
  'D': 'High Dirt Content / Sediment',
  'S': 'Sour Milk / High Acidity',
  'T': 'Abnormal Taste or Smell',
  'C': 'High Temperature at Collection',
  'M': 'Mixed / Cross-Contaminated Milk',
};

const TEST_CODES = [
  { code: 'AT', name: 'Alcohol Test (80% Ethanol)', standard: 'Negative (No Clotting)' },
  { code: 'LT', name: 'Lactometer / Density Test', standard: '1.028 – 1.033 g/mL' },
  { code: 'MT', name: 'Methylene Blue Reduction Test (MBRT)', standard: '> 30 minutes' },
  { code: 'pH', name: 'pH Strip Test', standard: '6.6 – 6.8' },
  { code: 'ST', name: 'Sensory Test (Smell / Color / Taste)', standard: 'Normal appearance' },
];

type FilterType = 'day' | 'week' | 'month';

export default function RejectReport() {
  const { profile, effectiveRole } = useAuth();
  const [rejects, setRejects] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMccId, setSelectedMccId] = useState<string>('all');
  const [startDate, setStartDate] = useState(format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTanzaniaTodayStr());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    mccId: '',
    sellerName: '',
    time: '',
    litersRejected: '',
    temp: '',
    phAcidity: '',
    rejectionReason: 'A',
    testCode: 'AT',
    actionTaken: 'Returned to Seller',
    remarks: '',
    date: ''
  });

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || ['Super User', 'Admin', 'Quality Controller', 'Cashier'].includes(effectiveRole as string));

  useEffect(() => {
    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      setMccs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
      setSellers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    return () => {
      unsubscribeMccs();
      unsubscribeSellers();
    };
  }, []);

  useEffect(() => {
    if (!profile || (mccs.length === 0 && !isGlobalViewer)) return;

    let q = query(collection(db, 'rejects'), where('date', '>=', startDate), where('date', '<=', endDate));
    if (!isGlobalViewer && profile?.mccIds?.length > 0) {
      const mccNames = profile.mccIds.map(id => mccs.find(m => m.id === id)?.name).filter(Boolean);
      const queryIds = [...profile.mccIds, ...mccNames];
      q = query(q, where('mccId', 'in', queryIds.slice(0, 10)));
    }
    
    const unsubscribeRejects = onSnapshot(q, (snapshot) => {
      setRejects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));

    return () => {
      unsubscribeRejects();
    };
  }, [profile, mccs, isGlobalViewer, startDate, endDate]);

  const reportData = useMemo(() => {
    const filtered = rejects.filter(r => {
      const matchesMcc = selectedMccId === 'all' || 
                         r.mccId === selectedMccId || 
                         mccs.find(m => m.id === selectedMccId)?.name === r.mccId;
      
      const reasonText = REJECTION_REASONS[r.rejectionReason] || r.rejectionReason || '';
      const matchesSearch = 
        (r.sellerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        reasonText.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesMcc && matchesSearch;
    });

    const rows = filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((r, idx) => ({
        no: idx + 1,
        ...r,
        mccName: mccs.find(m => m.id === r.mccId)?.name || (mccs.some(m => m.name === r.mccId) ? r.mccId : 'Unknown'),
        reasonDisplay: REJECTION_REASONS[r.rejectionReason] || r.rejectionReason || 'N/A'
      }));

    const totals = rows.reduce((acc, row) => ({
      liters: acc.liters + (Number(row.litersRejected) || 0),
      count: acc.count + 1
    }), { liters: 0, count: 0 });

    const label = `${format(new Date(startDate), 'dd MMM')} - ${format(new Date(endDate), 'dd MMM yyyy')}`;

    return { rows, totals, label };
  }, [rejects, mccs, selectedMccId, searchTerm, startDate, endDate]);

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
      testCode: rec.testCode || 'AT',
      actionTaken: rec.actionTaken,
      remarks: rec.remarks || '',
      date: rec.date
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'rejects', selectedRecord.id), {
        ...formData,
        litersRejected: Number(formData.litersRejected),
        temp: Number(formData.temp || 0),
        updatedAt: new Date().toISOString()
      });
      setIsEditing(false);
      setSelectedRecord(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rejects');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      await deleteDoc(doc(db, 'rejects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'rejects');
    }
  };

  const exportToExcel = () => {
    const data = reportData.rows.map(r => ({
      'No.': r.no,
      'Date': r.date,
      'MCC': r.mccName,
      'Seller': r.sellerName,
      'Liters Rejected': r.litersRejected,
      'Reason': r.reasonDisplay,
      'Remarks': r.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rejects');
    XLSX.writeFile(wb, `Reject_Report_${startDate}_to_${endDate}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Jambo Food Products Ltd", 14, 15);
    doc.setFontSize(14);
    doc.text(`Reject Report - ${reportData.label}`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'PPP p')}`, 14, 28);
    
    const tableData = reportData.rows.map(r => [
      r.no, 
      r.date,
      r.mccName,
      r.sellerName,
      r.litersRejected,
      r.reasonDisplay
    ]);

    (doc as any).autoTable({
      startY: 35,
      head: [['No.', 'Date', 'MCC', 'Seller', 'Liters', 'Reason']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] } // Red for rejects
    });

    doc.save(`Reject_Report_${startDate}_to_${endDate}.pdf`);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const doc = new jsPDF();
        doc.text("Jambo Food Products Ltd", 14, 15);
        doc.text(`Reject Report - ${reportData.label}`, 14, 22);
        const tableData = reportData.rows.map(r => [r.no, r.date, r.sellerName, r.litersRejected, r.reasonDisplay]);
        (doc as any).autoTable({
          startY: 30,
          head: [['No.', 'Date', 'Seller', 'Liters', 'Reason']],
          body: tableData,
        });
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], `Reject_Report_${startDate}_to_${endDate}.pdf`, { type: 'application/pdf' });

        await navigator.share({
          title: 'Reject Report',
          text: `Reject Report for ${reportData.label}`,
          files: [file]
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Sharing is not supported on this browser.');
    }
  };

  const totalPages = Math.ceil(reportData.rows.length / pageSize);
  const paginatedRows = reportData.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className={cn("space-y-6", loading && "opacity-60")}>
      {loading && rejects.length === 0 && (
        <div className="flex justify-center p-20">
          <Loader2 className="animate-spin h-10 w-10 text-primary" />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Reject Report</h1>
          <p className="text-on-surface-variant text-sm">Summary of rejected milk deliveries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 bg-white border rounded-lg hover:bg-surface-dim"><Printer size={18} /></button>
          <button onClick={exportToExcel} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><FileSpreadsheet size={18} /></button>
          <button onClick={exportToPDF} className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dim"><FileDown size={18} /></button>
          <button onClick={handleShare} className="p-2 bg-secondary text-white rounded-lg hover:bg-secondary-dim"><Share2 size={18} /></button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">Search Seller or Reason</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search seller or reason..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-lg text-sm h-10 transition-colors focus:bg-surface-container-high"
            />
          </div>
        </div>
        <div className="w-44 space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">From</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 transition-colors focus:bg-surface-container-high"
          />
        </div>
        <div className="w-44 space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">To</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 transition-colors focus:bg-surface-container-high"
          />
        </div>
        <div className="w-48 space-y-1">
          <label className="text-[10px] font-bold uppercase opacity-60">MCC Filter</label>
          <select 
            value={selectedMccId} 
            onChange={e => setSelectedMccId(e.target.value)} 
            className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 transition-colors focus:bg-surface-container-high"
          >
            <option value="all">All MCCs</option>
            {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Liters Rejected</p>
          <p className="text-2xl font-black text-error">{reportData.totals.liters.toFixed(1)} L</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Reject Cases</p>
          <p className="text-2xl font-black text-on-surface">{reportData.totals.count}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/20 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low font-bold uppercase text-[10px] tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-6 py-4 border-b border-outline-variant/10">No.</th>
                <th className="px-6 py-4 border-b border-outline-variant/10">Date</th>
                <th className="px-6 py-4 border-b border-outline-variant/10">MCC</th>
                <th className="px-6 py-4 border-b border-outline-variant/10">Seller</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Liters</th>
                <th className="px-6 py-4 border-b border-outline-variant/10">Reason</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {paginatedRows.map(row => (
                <tr key={row.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4 text-on-surface-variant">{row.no}</td>
                  <td className="px-6 py-4">{safeFormat(row.date, 'dd MMM yyyy')}</td>
                  <td className="px-6 py-4">{row.mccName}</td>
                  <td className="px-6 py-4 font-bold">{row.sellerName}</td>
                  <td className="px-6 py-4 text-right font-bold text-error">{row.litersRejected.toFixed(1)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-error/10 text-error text-[10px] font-bold rounded-full uppercase">
                      {row.rejectionReason}
                    </span>
                    <p className="text-[10px] text-on-surface-variant opacity-60 truncate max-w-[150px]">
                      {row.reasonDisplay}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canWrite && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(row)} className="p-1 text-primary hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(row.id)} className="p-1 text-error hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant italic">No rejects found for this period</td>
                </tr>
              )}
            </tbody>
            {reportData.rows.length > 0 && (
              <tfoot className="bg-surface-container-low/50 font-bold border-t border-outline-variant/20">
                <tr>
                  <td colSpan={4} className="px-6 py-5 text-right text-xs uppercase tracking-wider text-on-surface-variant">Grand Totals</td>
                  <td className="px-6 py-5 text-right text-error text-base">{reportData.totals.liters.toFixed(1)} L</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-surface-container-low/30 px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between">
            <div className="text-xs text-on-surface-variant font-medium">
              Showing <span className="font-bold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(currentPage * pageSize, reportData.rows.length)}</span> of <span className="font-bold text-on-surface">{reportData.rows.length}</span> records
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 transition-all"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Edit Reject Record</h2>
              <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-surface-container-low rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">MCC</label>
                  <select value={formData.mccId} onChange={e => setFormData({...formData, mccId: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" required>
                    {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Seller Name</label>
                  <TypeAhead
                    items={sellers.filter(s => !formData.mccId || s.mccId === formData.mccId || mccs.find(m => m.id === formData.mccId)?.name === s.mccId)}
                    onSelect={(seller) => setFormData({...formData, sellerName: seller.name})}
                    onClear={() => setFormData({...formData, sellerName: ''})}
                    labelExtractor={(s) => s.name}
                    subLabelExtractor={(s) => mccs.find(m => m.id === s.mccId)?.name || ''}
                    placeholder="Type to search seller..."
                    defaultValue={formData.sellerName}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Date</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Time</label>
                  <input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Liters Rejected</label>
                  <input type="number" value={formData.litersRejected} onChange={e => setFormData({...formData, litersRejected: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Temp (°C)</label>
                  <input type="number" step="0.1" value={formData.temp} onChange={e => setFormData({...formData, temp: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Rejection Reason</label>
                  <select value={formData.rejectionReason} onChange={e => setFormData({...formData, rejectionReason: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm">
                    {Object.entries(REJECTION_REASONS).map(([code, reason]) => <option key={code} value={code}>{code} - {reason}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Test Code</label>
                  <select value={formData.testCode} onChange={e => setFormData({...formData, testCode: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm">
                    {TEST_CODES.map(t => <option key={t.code} value={t.code}>{t.code} - {t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">Remarks</label>
                <textarea value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm" rows={2} />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsEditing(false)} className="flex-1 px-4 py-2 font-bold text-on-surface-variant">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Save size={18} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
