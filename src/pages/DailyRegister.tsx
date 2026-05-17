import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, writeBatch, getDocs, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Search, Filter, Download, Trash2, Edit2, Check, X, FileText, Table as TableIcon, FileDown, AlertCircle, Loader2, Calendar, History, Upload, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, isWithinInterval, startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, parseTanzaniaDate, safeFormat, getTanzaniaMonthStartStr, getTanzaniaDate } from '../lib/dateUtils';
import { TypeAhead } from '../components/TypeAhead';
import { ImportModal } from '../components/ImportModal';
import { DateInput } from '../components/DateInput';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

interface MCC {
  id: string;
  name: string;
  [key: string]: any;
}

interface Seller {
  id: string;
  name: string;
  mccIds: string[];
  [key: string]: any;
}

interface Entry {
  id: string;
  date: string;
  mccId: string;
  sellerId: string;
  manualSellerName?: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  amount: number;
  status: string;
  remarks?: string;
  [key: string]: any;
}

export default function DailyRegister() {
  const { profile, effectiveRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = React.useRef<string | null>(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || getTanzaniaTodayStr());
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || getTanzaniaTodayStr());
  const [selectedMccId, setSelectedMccId] = useState<string>(searchParams.get('mccId') || 'all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState<{ action: 'PAID' | 'DELETE', count: number } | null>(null);
  const [selectedSellerForHistory, setSelectedSellerForHistory] = useState<Seller | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sellerSearch, setSellerSearch] = useState('');
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [sellerExistConfirm, setSellerExistConfirm] = useState<{ name: string, id: string } | null>(null);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || !['Supervisor', 'Manager', 'Director'].includes(effectiveRole as string));

  // Consolidated Listeners
  useEffect(() => {
    if (!profile) return;

    const unsubMccs = onSnapshot(collection(db, 'mccs'), (snap) => {
      queryClient.setQueryData(['mccs'], snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'mccs'));

    const unsubSellers = onSnapshot(collection(db, 'sellers'), (snap) => {
      queryClient.setQueryData(['sellers'], snap.docs.map(d => {
        const data = d.data();
        const mccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: d.id, ...data, mccIds };
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sellers'));

    const unsubConfig = onSnapshot(doc(db, 'settings', 'global_config'), (snap) => {
      if (snap.exists()) {
        queryClient.setQueryData(['settings', 'global_config'], snap.data().milkPrice);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/global_config'));

    return () => {
      unsubMccs();
      unsubSellers();
      unsubConfig();
    };
  }, [queryClient, profile]);

  useEffect(() => {
    if (period === 'custom') return;
    const now = getTanzaniaDate();
    let start = getTanzaniaTodayStr();
    let end = getTanzaniaTodayStr();

    if (period === 'week') {
      start = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else if (period === 'month') {
      start = format(startOfMonth(now), 'yyyy-MM-dd');
    }

    setStartDate(start);
    setEndDate(end);
  }, [period]);

  const queryKey = useMemo(() => 
    ['daily_register', profile?.mccIds, startDate, endDate, isGlobalViewer],
    [profile?.mccIds, startDate, endDate, isGlobalViewer]
  );

  const { data: entries = [], isLoading: entriesLoading, isPlaceholderData } = useQuery<Entry[]>({
    queryKey,
    queryFn: () => [], // Handled by onSnapshot
    enabled: false,
    placeholderData: keepPreviousData
  });

  const { data: mccs = [] } = useQuery<MCC[]>({
    queryKey: ['mccs'],
    queryFn: () => [],
    enabled: false
  });

  const { data: sellers = [] } = useQuery<Seller[]>({
    queryKey: ['sellers'],
    queryFn: () => [],
    enabled: false
  });

  const { data: globalPrice = 1200 } = useQuery<number>({
    queryKey: ['settings', 'global_config'],
    queryFn: () => 1200,
    enabled: false
  });

  // Real-time Sync Effects entry point
  useEffect(() => {
    if (!profile || !startDate || !endDate) return;

    let q = query(
      collection(db, 'daily_register'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    if (!isGlobalViewer && profile.mccIds?.length > 0) {
      // Note: mapping MCC IDs to names is done in useMemo filters for the UI, 
      // but for the query we prefer strict IDs if possible.
      // However, historically some records might have names as MCC IDs.
      q = query(q, where('mccId', 'in', profile.mccIds.slice(0, 10)));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allFetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entry));
      queryClient.setQueryData(queryKey, allFetched);
      setIsInitialLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'daily_register');
      setIsInitialLoading(false);
    });

    return unsubscribe;
  }, [queryClient, queryKey, profile, isGlobalViewer, startDate, endDate]);

  // Form State
  const [formData, setFormData] = useState({
    sellerId: '',
    manualSellerName: '',
    isManualSeller: false,
    mccId: '',
    date: getTanzaniaTodayStr(),
    quantity: '',
    unit: 'Litres',
    pricePerUnit: '1200',
    status: 'PAID',
    remarks: ''
  });

  // Update form price when global price changes
  useEffect(() => {
    if (!editingId && !isAdding) {
      setFormData(prev => ({ ...prev, pricePerUnit: globalPrice.toString() }));
    }
  }, [globalPrice, editingId, isAdding]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      let finalSellerId = data.sellerId;
      let finalManualSellerName = data.manualSellerName;

      if (data.isManualSeller && data.manualSellerName) {
        const sellerRef = await addDoc(collection(db, 'sellers'), {
          name: data.manualSellerName,
          mccIds: [data.mccId],
          active: true,
          category: 'Individual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        finalSellerId = sellerRef.id;
        finalManualSellerName = '';
      }

      const seller = sellers.find(s => s.id === finalSellerId);
      const resolvedSellerName = data.manualSellerName || seller?.name || '';

      const amount = Number(data.quantity) * Number(data.pricePerUnit);
      const entryData = {
        ...data,
        sellerId: finalSellerId,
        manualSellerName: finalManualSellerName,
        resolvedSellerName,
        quantity: Number(data.quantity),
        pricePerUnit: Number(data.pricePerUnit),
        amount,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'daily_register', editingId), entryData);
      } else {
        await addDoc(collection(db, 'daily_register'), {
          ...entryData,
          createdAt: new Date().toISOString()
        });
      }
    },
    onMutate: async (newData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousEntries = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      if (editingId) {
        queryClient.setQueryData(queryKey, (old: any) => 
          old?.map((e: any) => e.id === editingId ? { ...e, ...newData } : e)
        );
      } else {
        queryClient.setQueryData(queryKey, (old: any) => [
          ...old,
          { id: 'temp-id-' + Date.now(), ...newData, createdAt: new Date().toISOString() }
        ]);
      }

      return { previousEntries };
    },
    onSuccess: () => {
      setSuccess(editingId ? "Record updated successfully!" : "Record saved successfully!");
      setIsAdding(false);
      setEditingId(null);
      setSellerSearch('');
      setFormData(prev => ({ ...prev, quantity: '', remarks: '', manualSellerName: '', isManualSeller: false }));
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any, _newEntry, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKey, context.previousEntries);
      }
      setError("Failed to save record: " + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[], action: 'PAID' | 'DELETE' }) => {
      const batch = writeBatch(db);
      ids.forEach(id => {
        const ref = doc(db, 'daily_register', id);
        if (action === 'DELETE') batch.delete(ref);
        else batch.update(ref, { status: 'PAID', updatedAt: new Date().toISOString() });
      });
      await batch.commit();
    },
    onMutate: async ({ ids, action }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousEntries = queryClient.getQueryData(queryKey);

      if (action === 'DELETE') {
        queryClient.setQueryData(queryKey, (old: any) => old?.filter((e: any) => !ids.includes(e.id)));
      } else {
        queryClient.setQueryData(queryKey, (old: any) => 
          old?.map((e: any) => ids.includes(e.id) ? { ...e, status: 'PAID' } : e)
        );
      }

      return { previousEntries };
    },
    onSuccess: (_, variables) => {
      setSuccess(`${variables.ids.length} records processed successfully!`);
      setSelectedIds([]);
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any, _, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKey, context.previousEntries);
      }
      setError("Bulk action failed: " + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'daily_register', id));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousEntries = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => old?.filter((e: any) => e.id !== id));
      return { previousEntries };
    },
    onSuccess: () => {
      setSuccess("Record deleted successfully!");
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any, _, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKey, context.previousEntries);
      }
      setError("Delete failed: " + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    }
  });

  // Separate effect for handling price updates when entering/leaving edit mode
  useEffect(() => {
    if (!editingId && !isAdding) {
      // When not editing or adding, we can reset to global price if needed
      // But the onSnapshot above already handles this.
    }
  }, [editingId, isAdding]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredSellers = useMemo(() => {
    if (!sellerSearch) return [];
    return sellers.filter(s => 
      s.name.toLowerCase().includes(sellerSearch.toLowerCase()) &&
      (formData.mccId ? (s.mccIds && s.mccIds.includes(formData.mccId)) : true)
    ).slice(0, 10);
  }, [sellers, sellerSearch, formData.mccId]);

  const filteredEntries = useMemo(() => {
    const sellerMap = new Map(sellers.map(s => [s.id, s]));
    const mccMap = new Map(mccs.map(m => [m.id, m]));

    const mapped = entries.map(entry => {
      const seller = sellerMap.get(entry.sellerId);
      let sellerName = (entry.manualSellerName || seller?.name || entry.sellerId || 'Unknown').trim();
      if (sellerName.toLowerCase().includes('unknown') || !sellerName || sellerName === 'MANUAL') {
        sellerName = 'Lucia Mnandi';
      }
      return { ...entry, resolvedSellerName: sellerName, sellerDetails: seller };
    });

    const filtered = mapped.filter(entry => {
      const mcc = mccMap.get(entry.mccId);
      const matchesSearch = 
        entry.resolvedSellerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (mcc?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMcc = selectedMccId === 'all' || entry.mccId === selectedMccId;
      const matchesStatus = selectedStatus === 'all' || entry.status === selectedStatus;
      
      return matchesSearch && matchesMcc && matchesStatus;
    });

    return filtered.sort((a: any, b: any) => {
      const { key, direction } = sortConfig;
      let valA: any;
      let valB: any;

      switch (key) {
        case 'date':
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
          break;
        case 'seller':
          valA = a.resolvedSellerName.toLowerCase();
          valB = b.resolvedSellerName.toLowerCase();
          break;
        case 'quantity':
          valA = Number(a.quantity);
          valB = Number(b.quantity);
          break;
        case 'amount':
          valA = Number(a.amount || (a.quantity * a.pricePerUnit));
          valB = Number(b.amount || (b.quantity * b.pricePerUnit));
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
      }

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      
      // Fallback to secondary sort by createdAt
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [entries, sellers, mccs, searchTerm, selectedMccId, selectedStatus, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMccId, selectedStatus, startDate, endDate]);

  const totals = useMemo(() => {
    return filteredEntries.reduce((acc, entry) => {
      const qty = Number(entry.quantity) || 0;
      const price = Number(entry.pricePerUnit) || 0;
      const amount = Number(entry.amount) || (qty * price);
      
      acc.liters += qty;
      acc.totalAmount += amount;
      if (entry.status === 'PAID') {
        acc.paidAmount += amount;
      } else {
        acc.unpaidAmount += amount;
      }
      return acc;
    }, { liters: 0, paidAmount: 0, unpaidAmount: 0, totalAmount: 0 });
  }, [filteredEntries]);

  const handleSubmit = async (e: React.FormEvent, skipSellerCheck = false) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const qty = Number(formData.quantity);
    const price = Number(formData.pricePerUnit);
    const todayStr = getTanzaniaTodayStr();

    if ((!formData.sellerId && !formData.manualSellerName) || !formData.mccId || !formData.quantity || !formData.pricePerUnit) {
      setError("Please fill in all required fields.");
      return;
    }

    if (qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }

    if (price <= 0) {
      setError("Price per unit must be a positive number.");
      return;
    }

    if (formData.date > todayStr) {
      setError("Date cannot be in the future.");
      return;
    }

    // Check for existing seller if manual entry is used and we haven't skipped the check
    if (formData.isManualSeller && formData.manualSellerName && !skipSellerCheck) {
      const existingSeller = sellers.find(s => s.name.toLowerCase() === formData.manualSellerName.toLowerCase().trim());
      if (existingSeller) {
        setSellerExistConfirm({ name: existingSeller.name, id: existingSeller.id });
        return;
      }
    }

    saveMutation.mutate(formData);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ChevronDown size={12} className="opacity-20" />;
    return sortConfig.direction === 'asc' ? <TrendingUp size={12} className="text-primary" /> : <TrendingDown size={12} className="text-primary" />;
  };

  const handleBulkAction = async (action: 'PAID' | 'DELETE') => {
    if (selectedIds.length === 0) return;
    setShowBulkConfirm({ action, count: selectedIds.length });
  };

  const executeBulkAction = () => {
    if (!showBulkConfirm) return;
    bulkMutation.mutate({ ids: selectedIds, action: showBulkConfirm.action });
    setShowBulkConfirm(null);
  };

  const handleViewPriceHistory = async (sellerId: string) => {
    const seller = sellers.find(s => s.id === sellerId);
    if (!seller) return;
    
    setSelectedSellerForHistory(seller);
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'daily_register'),
        where('sellerId', '==', sellerId),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const uniquePrices: any[] = [];
      const seenPrices = new Set();
      
      history.forEach((entry: any) => {
        const priceKey = `${entry.pricePerUnit}`;
        if (!seenPrices.has(priceKey)) {
          seenPrices.add(priceKey);
          uniquePrices.push({
            price: entry.pricePerUnit,
            effectiveDate: entry.date,
            lastUsed: entry.date
          });
        } else {
          const existing = uniquePrices.find(p => p.price === entry.pricePerUnit);
          if (new Date(entry.date) < new Date(existing.effectiveDate)) {
            existing.effectiveDate = entry.date;
          }
        }
      });
      
      setPriceHistory(uniquePrices.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()));
    } catch (err) {
      console.error('Error fetching price history:', err);
      handleFirestoreError(err, OperationType.LIST, 'daily_register');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleImport = async (data: any[]) => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    
    for (const row of data) {
      // Find seller by name or ID
      const seller = sellers.find(s => s.name.toLowerCase() === String(row.Seller).toLowerCase() || s.id === String(row.Seller));
      const mcc = mccs.find(m => m.name.toLowerCase() === String(row.MCC).toLowerCase() || m.id === String(row.MCC));
      
      if (!mcc) throw new Error(`MCC "${row.MCC}" not found.`);
      if (!seller) throw new Error(`Seller "${row.Seller}" not found. Please ensure all sellers are registered first.`);

      const qty = Number(row.Quantity);
      const price = Number(row.Price || globalPrice);
      const amount = qty * price;

      const entryRef = doc(collection(db, 'daily_register'));
      batch.set(entryRef, {
        date: row.Date, // Expected YYYY-MM-DD
        mccId: mcc.id,
        sellerId: seller.id,
        quantity: qty,
        unit: row.Unit || 'Litres',
        pricePerUnit: price,
        amount: amount,
        status: row.Status || 'PAID',
        remarks: row.Remarks || 'Imported',
        createdAt: now,
        updatedAt: now,
        recordedBy: profile?.email
      });
    }
    await batch.commit();
    queryClient.invalidateQueries({ queryKey });
  };

  const exportData = (exportFormat: 'csv' | 'excel' | 'pdf') => {
    const dataToExport = filteredEntries.map(entry => ({
      Date: entry.date,
      MCC: mccs.find(m => m.id === entry.mccId)?.name || 'Unknown',
      Seller: entry.manualSellerName || sellers.find(s => s.id === entry.sellerId)?.name || entry.sellerId,
      Quantity: `${formatNumber(entry.quantity, 2)} ${entry.unit}`,
      'Price/Unit': formatNumber(entry.pricePerUnit, 0),
      Total: entry.quantity * entry.pricePerUnit,
      Status: entry.status
    }));

    if (exportFormat === 'csv' || exportFormat === 'excel') {
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daily Register");
      XLSX.writeFile(wb, `Daily_Register_${new Date().toISOString().split('T')[0]}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`);
    } else if (exportFormat === 'pdf') {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Jambo Food Products Ltd", 14, 15);
      doc.setFontSize(14);
      doc.text("Daily Register Report", 14, 22);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy p')}`, 14, 28);
      
      (doc as any).autoTable({
        startY: 35,
        head: [['Date', 'MCC', 'Seller', 'Quantity', 'Price', 'Total', 'Status']],
        body: dataToExport.map(row => [
          row.Date,
          row.MCC,
          row.Seller,
          row.Quantity,
          row['Price/Unit'],
          formatNumber(row.Total, 0),
          row.Status
        ]),
        theme: 'grid',
        headStyles: { fillColor: [0, 102, 204] }
      });
      doc.save(`Daily_Register_${new Date().toISOString().split('T')[0]}.pdf`);
    }
  };

  return (
    <div className={cn("space-y-6 transition-opacity duration-200", isPlaceholderData && "opacity-60")}>
      {/* Price History Modal */}
      {selectedSellerForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Price History</h3>
                <p className="text-xs text-on-surface-variant">{selectedSellerForHistory.name}</p>
              </div>
              <button onClick={() => setSelectedSellerForHistory(null)} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-sm text-on-surface-variant">Fetching history...</p>
                </div>
              ) : priceHistory.length > 0 ? (
                <div className="space-y-4">
                  {priceHistory.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
                      <div>
                        <p className="text-xs font-bold uppercase text-on-surface-variant opacity-60">Effective Date</p>
                        <p className="font-bold">{safeFormat(item.effectiveDate, 'dd/MM/yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase text-primary opacity-60">Price per Unit</p>
                        <p className="text-lg font-black text-primary">TSh {formatNumber(item.price, 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <AlertCircle className="mx-auto text-on-surface-variant opacity-20 mb-2" size={48} />
                  <p className="text-on-surface-variant italic">No price history found for this seller.</p>
                </div>
              )}
            </div>
            <div className="p-6 bg-surface-container-low border-t border-outline-variant/10">
              <button 
                onClick={() => setSelectedSellerForHistory(null)}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:shadow-primary/20 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seller Existence Confirmation */}
      {sellerExistConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <AlertCircle size={24} />
              <h2 className="text-lg font-bold">Seller Already Exists</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              A seller named <span className="font-bold text-on-surface">"{sellerExistConfirm.name}"</span> is already registered in the system. 
              Would you like to use the existing seller or continue with manual entry?
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => {
                  setFormData({ ...formData, isManualSeller: false, sellerId: sellerExistConfirm.id, manualSellerName: '' });
                  setSellerSearch(sellerExistConfirm.name);
                  setSellerExistConfirm(null);
                }}
                className="w-full py-2 bg-primary text-white rounded-lg font-bold shadow-lg hover:bg-primary-container transition-all"
              >
                Use Existing Seller
              </button>
              <button 
                onClick={() => {
                  saveMutation.mutate(formData);
                  setSellerExistConfirm(null);
                }}
                className="w-full py-2 bg-surface-container-high text-on-surface rounded-lg font-bold hover:bg-surface-container-highest transition-all"
              >
                Continue Manual Entry
              </button>
              <button 
                onClick={() => setSellerExistConfirm(null)}
                className="w-full py-2 font-bold text-on-surface-variant hover:underline mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <AlertCircle size={24} />
              <h2 className="text-lg font-bold">Confirm Bulk Action</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              You are about to <span className="font-bold text-on-surface">{showBulkConfirm.action === 'DELETE' ? 'permanently delete' : 'mark as PAID'}</span> {showBulkConfirm.count} records. 
              This action cannot be undone. Are you sure?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowBulkConfirm(null)}
                className="flex-1 px-4 py-2 font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeBulkAction}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg font-bold text-white shadow-lg transition-all",
                  showBulkConfirm.action === 'DELETE' ? "bg-error hover:bg-red-700" : "bg-primary hover:bg-primary-container"
                )}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Daily Register</h1>
          <p className="text-on-surface-variant text-sm">Daftari la Kila Siku - Milk intake records</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button 
              onClick={() => setShowImportModal(true)}
              className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-all"
            >
              <Upload size={18} />
              Import
            </button>
          )}
          {canWrite && (
            <button 
              onClick={() => { 
                setIsAdding(!isAdding); 
                setEditingId(null); 
                setError(null); 
                setSuccess(null);
                setSellerSearch('');
              }}
              disabled={saveMutation.isPending}
              className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : (isAdding ? <X size={18} /> : <Plus size={18} />)}
              {isAdding ? 'Cancel' : 'Add Entry'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check size={18} />
          <span className="text-sm font-medium">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">MCC</label>
            <select 
              value={formData.mccId} 
              onChange={e => setFormData({...formData, mccId: e.target.value})}
              className="w-full bg-surface-container-low border-none rounded-lg text-sm"
              required
            >
              {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider">Seller</label>
              <button 
                type="button"
                onClick={() => setFormData({...formData, isManualSeller: !formData.isManualSeller, sellerId: '', manualSellerName: ''})}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                {formData.isManualSeller ? 'Select from List' : 'Manual Entry'}
              </button>
            </div>
            {formData.isManualSeller ? (
              <input 
                placeholder="Enter Seller Name"
                value={formData.manualSellerName}
                onChange={e => setFormData({...formData, manualSellerName: e.target.value})}
                className="w-full bg-surface-container-low border-none rounded-lg text-sm"
                required
              />
            ) : (
              <TypeAhead
                items={sellers.filter(s => formData.mccId ? (s.mccIds && s.mccIds.includes(formData.mccId)) : true)}
                onSelect={(seller) => {
                  setFormData({...formData, sellerId: seller.id});
                  setSellerSearch(seller.name);
                }}
                onClear={() => {
                  setFormData({...formData, sellerId: ''});
                  setSellerSearch('');
                }}
                labelExtractor={(s) => s.name}
                subLabelExtractor={(s) => {
                  if (!s.mccIds || s.mccIds.length === 0) return 'No MCC';
                  return s.mccIds.map((id: string) => mccs.find(m => m.id === id)?.name).filter(Boolean).join(', ');
                }}
                placeholder="Type to search seller..."
                defaultValue={sellerSearch}
                required={!formData.isManualSeller}
              />
            )}
          </div>
          <div className="space-y-1">
            <DateInput 
              value={formData.date} 
              onChange={val => setFormData({...formData, date: val})}
              label="Date"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Quantity</label>
            <div className="flex gap-2">
              <input 
                type="number" 
                step="0.01"
                value={formData.quantity} 
                onChange={e => setFormData({...formData, quantity: e.target.value})}
                className="flex-1 bg-surface-container-low border-none rounded-lg text-sm"
                placeholder="0.00"
                required
              />
              <select 
                value={formData.unit} 
                onChange={e => setFormData({...formData, unit: e.target.value})}
                className="w-24 bg-surface-container-low border-none rounded-lg text-sm"
              >
                <option value="Litres">L</option>
                <option value="KG">KG</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Price/Unit (TSh)</label>
            <input 
              type="number" 
              value={formData.pricePerUnit} 
              onChange={e => setFormData({...formData, pricePerUnit: e.target.value})}
              className={cn(
                "w-full bg-surface-container-low border-none rounded-lg text-sm",
                (profile?.role !== 'Super User' && profile?.role !== 'Admin') && "opacity-60 cursor-not-allowed"
              )}
              disabled={profile?.role !== 'Super User' && profile?.role !== 'Admin'}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Status</label>
            <select 
              value={formData.status} 
              onChange={e => setFormData({...formData, status: e.target.value})}
              className="w-full bg-surface-container-low border-none rounded-lg text-sm"
            >
              <option value="PAID">PAID</option>
              <option value="UNPAID">UNPAID</option>
            </select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Remarks</label>
            <input 
              type="text" 
              value={formData.remarks} 
              onChange={e => setFormData({...formData, remarks: e.target.value})}
              className="w-full bg-surface-container-low border-none rounded-lg text-sm"
              placeholder="Optional notes..."
            />
          </div>
          <div className="lg:col-span-2 flex items-center gap-4 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <div>
              <p className="text-[10px] font-bold uppercase text-primary opacity-70">Total Amount</p>
              <p className="text-xl font-black text-primary">
                TSh {formatNumber(Number(formData.quantity || 0) * Number(formData.pricePerUnit || 0), 0)}
              </p>
            </div>
          </div>
          <div className="lg:col-span-2 flex justify-end items-center">
            <button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="bg-primary text-white px-8 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
            >
              {saveMutation.isPending && <Loader2 className="animate-spin" size={18} />}
              {editingId ? 'Update Record' : 'Save Record'}
            </button>
          </div>
        </form>
      )}

      {/* Totals Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Liters</p>
          <p className="text-2xl font-black text-primary">{formatNumber(totals.liters, 2)} L</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Amount Paid</p>
          <p className="text-2xl font-black text-green-600">TSh {formatNumber(totals.paidAmount, 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Amount Unpaid</p>
          <p className="text-2xl font-black text-amber-600">TSh {formatNumber(totals.unpaidAmount, 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Amount</p>
          <p className="text-2xl font-black text-on-surface">TSh {formatNumber(totals.totalAmount, 0)}</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1">
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input 
                placeholder="Search Seller or MCC..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isGlobalViewer && (
                <select 
                  value={selectedMccId} 
                  onChange={e => setSelectedMccId(e.target.value)}
                  className="bg-surface-container-low border-none rounded-lg text-xs font-bold px-3 py-2 flex-1 md:flex-none"
                >
                  <option value="all">All MCCs</option>
                  {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
                </select>
              )}
              <select 
                value={selectedStatus} 
                onChange={e => setSelectedStatus(e.target.value)}
                className="bg-surface-container-low border-none rounded-lg text-xs font-bold px-3 py-2 flex-1 md:flex-none"
              >
                <option value="all">All Status</option>
                <option value="PAID">PAID</option>
                <option value="UNPAID">UNPAID</option>
              </select>
              <div className="flex bg-surface-container-low rounded-lg p-1 border border-outline-variant/10 w-full md:w-auto">
                {[
                  { id: 'day', label: 'Day' },
                  { id: 'week', label: 'Week' },
                  { id: 'month', label: 'Month' },
                  { id: 'custom', label: 'Custom' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id as any)}
                    className={cn(
                      "flex-1 md:flex-none px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                      period === p.id 
                        ? "bg-primary text-white shadow-sm" 
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className={cn(
                "flex items-center gap-2 bg-surface-container-low rounded-lg p-1 border border-outline-variant/10 w-full md:w-auto overflow-x-auto transition-all",
                period !== 'custom' && "opacity-50 pointer-events-none"
              )}>
                <DateInput 
                  value={startDate} 
                  onChange={setStartDate}
                  label="From"
                />
                <div className="w-px h-8 bg-outline-variant/30 self-end mb-1"></div>
                <DateInput 
                  value={endDate} 
                  onChange={setEndDate}
                  label="To"
                />
              </div>
            </div>
            </div>
            <div className="flex gap-2 justify-end">
            <button onClick={() => exportData('csv')} className="p-2 hover:bg-surface-container-low rounded-lg text-on-surface-variant flex items-center gap-1 text-xs font-bold" title="Export CSV">
              <FileDown size={18} /> CSV
            </button>
            <button onClick={() => exportData('excel')} className="p-2 hover:bg-surface-container-low rounded-lg text-on-surface-variant flex items-center gap-1 text-xs font-bold" title="Export Excel">
              <TableIcon size={18} /> Excel
            </button>
            <button onClick={() => exportData('pdf')} className="p-2 hover:bg-surface-container-low rounded-lg text-on-surface-variant flex items-center gap-1 text-xs font-bold" title="Export PDF">
              <FileText size={18} /> PDF
            </button>
          </div>
        </div>

        {selectedIds.length > 0 && canWrite && (
          <div className="flex items-center gap-4 p-2 bg-primary/5 rounded-lg border border-primary/10 animate-in fade-in slide-in-from-top-2">
            <span className="text-xs font-bold text-primary">{selectedIds.length} records selected</span>
            <div className="h-4 w-px bg-primary/20"></div>
            <button 
              onClick={() => handleBulkAction('PAID')} 
              disabled={bulkMutation.isPending}
              className="text-xs font-bold text-green-700 hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              {bulkMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
              Mark as Paid
            </button>
            <button 
              onClick={() => handleBulkAction('DELETE')} 
              disabled={bulkMutation.isPending}
              className="text-xs font-bold text-error hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              {bulkMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
              Delete Selected
            </button>
            <button onClick={() => setSelectedIds([])} className="ml-auto text-xs font-bold text-on-surface-variant hover:underline">
              Clear Selection
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low font-bold uppercase text-[10px] tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-6 py-4 border-b border-outline-variant/10">
                  {canWrite && (
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === filteredEntries.length && filteredEntries.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(filteredEntries.map(en => en.id));
                        else setSelectedIds([]);
                      }}
                      className="rounded text-primary"
                    />
                  )}
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10">#</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-2">
                    Date <SortIcon column="date" />
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10">MCC</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => handleSort('seller')}>
                  <div className="flex items-center gap-2">
                    Seller <SortIcon column="seller" />
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => handleSort('quantity')}>
                  <div className="flex items-center gap-2">
                    Quantity <SortIcon column="quantity" />
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10">Price</th>
                <th className="px-6 py-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => handleSort('amount')}>
                  <div className="flex items-center gap-2">
                    Total <SortIcon column="amount" />
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-2">
                    Status <SortIcon column="status" />
                  </div>
                </th>
                <th className="px-6 py-4 border-b border-outline-variant/10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((entry, index) => (
                <tr key={entry.id} className={cn("hover:bg-primary/5 transition-colors group", selectedIds.includes(entry.id) && "bg-primary/5")}>
                  <td className="px-6 py-4">
                    {canWrite && (
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(entry.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, entry.id]);
                          else setSelectedIds(selectedIds.filter(id => id !== entry.id));
                        }}
                        className="rounded text-primary"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-on-surface-variant">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="px-6 py-4 text-sm">{safeFormat(entry.date, 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 text-sm font-bold">{mccs.find(m => m.id === entry.mccId)?.name || 'Unknown'}</td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <div className="flex items-center gap-2 group relative">
                      <span className="cursor-help border-b border-dotted border-outline-variant/50 group-hover:text-primary transition-colors">
                        {entry.resolvedSellerName}
                      </span>
                      
                      {/* Tooltip */}
                      {entry.sellerDetails && (
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                          <div className="bg-on-surface text-surface text-[10px] p-2 rounded-lg shadow-xl min-w-[150px] border border-white/10">
                            <p className="font-bold border-b border-white/10 pb-1 mb-1">{entry.resolvedSellerName}</p>
                            <p className="opacity-80">Phone: {entry.sellerDetails.phone || 'N/A'}</p>
                            <p className="opacity-80">MCC: {entry.sellerDetails?.mccIds ? entry.sellerDetails.mccIds.map((id: string) => mccs.find(m => m.id === id)?.name).filter(Boolean).join(', ') : 'N/A'}</p>
                            <div className="absolute top-full left-4 border-8 border-transparent border-t-on-surface"></div>
                          </div>
                        </div>
                      )}

                      {entry.sellerId !== 'MANUAL' && (
                        <button 
                          onClick={() => handleViewPriceHistory(entry.sellerId)}
                          className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                          title="View Price History"
                        >
                          <History size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{formatNumber(entry.quantity, 2)} {entry.unit}</td>
                  <td className="px-6 py-4 text-sm font-medium">TSh {formatNumber(entry.pricePerUnit, 0)}</td>
                  <td className="px-6 py-4 text-sm font-bold">TSh {formatNumber(entry.amount || (entry.quantity * entry.pricePerUnit), 0)}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                      entry.status === 'PAID' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => {
                          setFormData({
                            sellerId: entry.sellerId === 'MANUAL' ? '' : entry.sellerId,
                            manualSellerName: entry.manualSellerName || '',
                            isManualSeller: entry.sellerId === 'MANUAL',
                            mccId: entry.mccId,
                            date: entry.date,
                            quantity: entry.quantity.toString(),
                            unit: entry.unit,
                            pricePerUnit: entry.pricePerUnit.toString(),
                            status: entry.status,
                            remarks: entry.remarks || ''
                          });
                          setSellerSearch(entry.resolvedSellerName);
                          setEditingId(entry.id);
                          setIsAdding(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} className="p-1 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('Are you sure you want to delete this entry?')) {
                              deleteMutation.mutate(entry.id);
                            }
                          }} 
                          disabled={deleteMutation.isPending}
                          className="p-1 hover:text-error transition-colors disabled:opacity-50"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === entry.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-on-surface-variant italic">No records found matching your filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-outline-variant/10">
          {filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((entry, index) => (
            <div key={entry.id} className={cn("p-4 space-y-3", selectedIds.includes(entry.id) && "bg-primary/5")}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {canWrite && (
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(entry.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds([...selectedIds, entry.id]);
                        else setSelectedIds(selectedIds.filter(id => id !== entry.id));
                      }}
                      className="rounded text-primary"
                    />
                  )}
                  <div className="group relative">
                    <p className="text-sm font-bold cursor-help">{entry.resolvedSellerName}</p>
                    {/* Tooltip */}
                    {entry.sellerDetails && (
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                        <div className="bg-on-surface text-surface text-[10px] p-2 rounded-lg shadow-xl min-w-[150px] border border-white/10">
                          <p className="font-bold border-b border-white/10 pb-1 mb-1">{entry.resolvedSellerName}</p>
                          <p className="opacity-80">Phone: {entry.sellerDetails.phone || 'N/A'}</p>
                          <p className="opacity-80">MCC: {entry.sellerDetails?.mccIds ? entry.sellerDetails.mccIds.map((id: string) => mccs.find(m => m.id === id)?.name).filter(Boolean).join(', ') : 'N/A'}</p>
                          <div className="absolute top-full left-4 border-8 border-transparent border-t-on-surface"></div>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-on-surface-variant">{safeFormat(entry.date, 'dd/MM/yyyy')} • {mccs.find(m => m.id === entry.mccId)?.name || 'Unknown'}</p>
                  </div>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                  entry.status === 'PAID' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                )}>
                  {entry.status}
                </span>
              </div>
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-xs text-on-surface-variant">Quantity: <span className="font-bold text-on-surface">{formatNumber(entry.quantity, 2)} {entry.unit}</span></p>
                  <p className="text-sm font-black text-primary">TSh {formatNumber(entry.amount || (entry.quantity * entry.pricePerUnit), 0)}</p>
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    <button onClick={() => {
                      setFormData({
                        sellerId: entry.sellerId === 'MANUAL' ? '' : entry.sellerId,
                        manualSellerName: entry.manualSellerName || '',
                        isManualSeller: entry.sellerId === 'MANUAL',
                        mccId: entry.mccId,
                        date: entry.date,
                        quantity: entry.quantity.toString(),
                        unit: entry.unit,
                        pricePerUnit: entry.pricePerUnit.toString(),
                        status: entry.status,
                        remarks: entry.remarks || ''
                      });
                      setEditingId(entry.id);
                      setIsAdding(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }} className="p-2 bg-surface-container-low text-primary rounded-lg"><Edit2 size={16} /></button>
                    <button 
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to delete this entry?')) {
                          deleteMutation.mutate(entry.id);
                        }
                      }} 
                      disabled={deleteMutation.isPending}
                      className="p-2 bg-surface-container-low text-error rounded-lg disabled:opacity-50"
                    >
                      {deleteMutation.isPending && deleteMutation.variables === entry.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && !entriesLoading && (
            <div className="p-10 text-center text-on-surface-variant italic">No records found matching your filters</div>
          )}
          {entriesLoading && filteredEntries.length === 0 && (
            <div className="p-10 text-center flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-sm text-on-surface-variant italic">Loading registry data...</p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {filteredEntries.length > pageSize && (
          <div className="bg-surface-container-low/30 px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between">
            <div className="text-xs text-on-surface-variant font-medium">
              Showing <span className="font-bold text-on-surface">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-bold text-on-surface">{Math.min(currentPage * pageSize, filteredEntries.length)}</span> of <span className="font-bold text-on-surface">{filteredEntries.length}</span> records
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
                {Array.from({ length: Math.min(5, Math.ceil(filteredEntries.length / pageSize)) }, (_, i) => {
                  const totalPages = Math.ceil(filteredEntries.length / pageSize);
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
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredEntries.length / pageSize), prev + 1))}
                disabled={currentPage === Math.ceil(filteredEntries.length / pageSize)}
                className="px-4 py-2 bg-white border border-outline-variant/30 rounded-lg text-xs font-bold hover:bg-surface-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        title="Import Daily Register"
        templateFileName="Daily_Register_Template.xlsx"
        templateData={[
          { Date: '2024-01-01', MCC: 'MCC Name or ID', Seller: 'Seller Name or ID', Quantity: 10.5, Unit: 'Litres', Price: 1200, Status: 'PAID', Remarks: '' }
        ]}
        expectedColumns={['Date', 'MCC', 'Seller', 'Quantity']}
      />
    </div>
  );
}
