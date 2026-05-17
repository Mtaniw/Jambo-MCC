import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';
import { Plus, Trash2, X, Save, Search, Filter, AlertTriangle, Clock, Beaker, Calendar, Edit2 } from 'lucide-react';
import { cn, formatNumber } from '../lib/utils';
import { format, startOfMonth } from 'date-fns';
import { getTanzaniaTodayStr, safeFormat, getTanzaniaDate } from '../lib/dateUtils';
import { DateInput } from '../components/DateInput';
import { TypeAhead } from '../components/TypeAhead';

const REJECTION_REASONS = [
  { code: 'A', reason: 'Adulteration — Water / Soda / Other' },
  { code: 'D', reason: 'High Dirt Content / Sediment' },
  { code: 'S', reason: 'Sour Milk / High Acidity' },
  { code: 'T', reason: 'Abnormal Taste or Smell' },
  { code: 'C', reason: 'High Temperature at Collection' },
  { code: 'M', reason: 'Mixed / Cross-Contaminated Milk' },
];

const TEST_CODES = [
  { code: 'AT', name: 'Alcohol Test (80% Ethanol)', standard: 'Negative (No Clotting)' },
  { code: 'LT', name: 'Lactometer / Density Test', standard: '1.028 – 1.033 g/mL' },
  { code: 'MT', name: 'Methylene Blue Reduction Test (MBRT)', standard: '> 30 minutes' },
  { code: 'pH', name: 'pH Strip Test', standard: '6.6 – 6.8' },
  { code: 'ST', name: 'Sensory Test (Smell / Color / Taste)', standard: 'Normal appearance' },
];

export default function Rejects() {
  const { profile, effectiveRole } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [mccs, setMccs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  
  // Persist filters
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('rejects_search') || '');
  const [mccFilter, setMccFilter] = useState(() => localStorage.getItem('rejects_mcc') || 'all');
  const [startDate, setStartDate] = useState(() => localStorage.getItem('rejects_start_date') || format(startOfMonth(getTanzaniaDate()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => localStorage.getItem('rejects_end_date') || getTanzaniaTodayStr());
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    localStorage.setItem('rejects_search', searchTerm);
    localStorage.setItem('rejects_mcc', mccFilter);
    localStorage.setItem('rejects_start_date', startDate);
    localStorage.setItem('rejects_end_date', endDate);
  }, [searchTerm, mccFilter, startDate, endDate]);

  const isGlobalViewer = profile && ['Super User', 'Admin', 'Factory Clerk', 'Supervisor', 'Manager', 'Director'].includes(effectiveRole as string);
  const canWrite = profile && (profile.role === 'Admin' || ['Super User', 'Admin', 'Quality Controller', 'Cashier'].includes(effectiveRole as string));

  const [formData, setFormData] = useState({
    mccId: '',
    sellerName: '',
    time: safeFormat(new Date().toISOString(), 'HH:mm'),
    litersRejected: '',
    temp: '',
    phAcidity: '',
    rejectionReason: 'A',
    testCode: 'AT',
    actionTaken: 'Returned to Seller',
    remarks: '',
    date: getTanzaniaTodayStr()
  });

  useEffect(() => {
    if (!profile) return;

    const unsubscribeMccs = onSnapshot(collection(db, 'mccs'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMccs(list);
      if (list.length > 0 && !formData.mccId) setFormData(prev => ({ ...prev, mccId: list[0].id }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'mccs'));

    const unsubscribeSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
      setSellers(snapshot.docs.map(doc => {
        const data = doc.data();
        const smccIds = data.mccIds || (data.mccId ? [data.mccId] : []);
        return { id: doc.id, ...data, mccIds: smccIds };
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sellers'));

    return () => {
      unsubscribeMccs();
      unsubscribeSellers();
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || mccs.length === 0) return;

    let q = query(collection(db, 'rejects'), where('date', '>=', startDate), where('date', '<=', endDate));
    let canQuery = true;
    if (!isGlobalViewer) {
      if (profile.mccIds.length > 0) {
        const mccNames = profile.mccIds.map(id => mccs.find(m => m.id === id)?.name).filter(Boolean);
        const queryIds = [...profile.mccIds, ...mccNames];
        q = query(collection(db, 'rejects'), where('mccId', 'in', queryIds.slice(0, 10)), where('date', '>=', startDate), where('date', '<=', endDate));
      } else {
        canQuery = false;
        setRecords([]);
        setLoading(false);
      }
    } else if (mccFilter !== 'all') {
      const mccName = mccs.find(m => m.id === mccFilter)?.name;
      const queryIds = [mccFilter];
      if (mccName) queryIds.push(mccName);
      q = query(collection(db, 'rejects'), where('mccId', 'in', queryIds), where('date', '>=', startDate), where('date', '<=', endDate));
    }

    let unsubscribeRecords = () => {};
    if (canQuery) {
      unsubscribeRecords = onSnapshot(q, (snapshot) => {
        setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'rejects'));
    }

    return () => {
      unsubscribeRecords();
    };
  }, [profile, mccs, isGlobalViewer, startDate, endDate, mccFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) {
      alert('You do not have permission to record rejects.');
      return;
    }
    if (!formData.mccId) {
      alert('Please select an MCC first.');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage('');

    const data = {
      ...formData,
      litersRejected: Number(formData.litersRejected),
      temp: Number(formData.temp || 0),
      recordedBy: profile?.fullName,
      createdAt: new Date().toISOString()
    };

    try {
      if (selectedRecord) {
        await updateDoc(doc(db, 'rejects', selectedRecord.id), data);
        setSuccessMessage('Reject record updated successfully!');
      } else {
        await addDoc(collection(db, 'rejects'), data);
        setSuccessMessage('Reject record saved successfully!');
      }
      setIsAdding(false);
      setSelectedRecord(null);
      setFormData({ ...formData, sellerName: '', litersRejected: '', temp: '', phAcidity: '', remarks: '' });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      handleFirestoreError(error, selectedRecord ? OperationType.UPDATE : OperationType.CREATE, 'rejects');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      testCode: rec.testCode,
      actionTaken: rec.actionTaken,
      remarks: rec.remarks || '',
      date: rec.date
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredRecords = records.filter(rec => {
    const matchesSearch = rec.sellerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMcc = mccFilter === 'all' || 
                       rec.mccId === mccFilter || 
                       mccs.find(m => m.id === mccFilter)?.name === rec.mccId;
    return matchesSearch && matchesMcc;
  });

  const totalRejected = filteredRecords.reduce((sum, rec) => sum + (Number(rec.litersRejected) || 0), 0);

  if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Milk Rejects</h1>
          <p className="text-on-surface-variant text-sm">Record and track rejected milk quality issues</p>
        </div>
        {canWrite && (
          <button 
            onClick={() => {
              if (isAdding) {
                setIsAdding(false);
                setSelectedRecord(null);
                setFormData({ ...formData, sellerName: '', litersRejected: '', temp: '', phAcidity: '', remarks: '' });
              } else {
                setIsAdding(true);
              }
            }} 
            className="bg-error text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg"
          >
            {isAdding ? <X size={18} /> : <Plus size={18} />} {isAdding ? 'Cancel' : 'Record Reject'}
          </button>
        )}
      </div>

      {/* Summary Banner */}
      <div className="bg-red-600 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between overflow-hidden relative">
        <div className="relative z-10">
          <h2 className="text-lg font-bold opacity-80 uppercase tracking-widest mb-1">Total Milk Rejected</h2>
          <p className="text-5xl font-black">{formatNumber(totalRejected, 2)} L</p>
          <p className="text-xs mt-2 opacity-60">Cumulative rejection volume across all MCCs</p>
        </div>
        <AlertTriangle className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10 rotate-12" />
      </div>

      <div className="bg-white p-4 rounded-xl border border-outline-variant/20 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] relative">
          <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">Search Sellers</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
            <input 
              placeholder="Search seller name..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 bg-surface-container-low border-none rounded-lg text-sm h-10"
            />
          </div>
        </div>

        <DateInput 
          value={startDate} 
          onChange={setStartDate} 
          label="From"
          className="w-44"
        />
        <DateInput 
          value={endDate} 
          onChange={setEndDate} 
          label="To"
          className="w-44"
        />

        {isGlobalViewer && (
          <div className="w-44">
            <label className="text-[10px] font-bold uppercase opacity-60 mb-1 block">MCC Filter</label>
            <div className="flex items-center gap-2 relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" size={18} />
              <select 
                value={mccFilter} 
                onChange={e => setMccFilter(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-surface-container-low border-none rounded-lg text-sm font-bold h-10 appearance-none"
              >
                <option value="all">All MCCs</option>
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm space-y-6 animate-in slide-in-from-top-4 duration-200">
          <h3 className="font-bold text-lg flex items-center gap-2">
            {selectedRecord ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
            {selectedRecord ? 'Edit Reject Record' : 'Record New Reject'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">MCC</label>
              <select value={formData.mccId} onChange={e => setFormData({...formData, mccId: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required>
                {mccs.map(mcc => <option key={mcc.id} value={mcc.id}>{mcc.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Seller Name</label>
              <TypeAhead
                items={sellers.filter(s => 
                  !formData.mccId || 
                  (s.mccIds && s.mccIds.includes(formData.mccId)) || 
                  mccs.find(m => m.id === formData.mccId)?.name === s.mccId
                )}
                onSelect={(seller) => {
                  setFormData({...formData, sellerName: seller.name});
                }}
                onClear={() => {
                  setFormData({...formData, sellerName: ''});
                }}
                labelExtractor={(s) => s.name}
                subLabelExtractor={(s) => {
                  if (!s.mccIds || s.mccIds.length === 0) return 'No MCC';
                  return s.mccIds.map((id: string) => mccs.find(m => m.id === id)?.name).filter(Boolean).join(', ');
                }}
                placeholder="Type to search seller..."
                defaultValue={formData.sellerName}
                required
              />
            </div>
            <div className="space-y-1">
              <DateInput 
                value={formData.date} 
                onChange={val => setFormData({...formData, date: val})} 
                label="Date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Time</label>
              <input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Liters Rejected</label>
              <input type="number" value={formData.litersRejected} onChange={e => setFormData({...formData, litersRejected: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Temp (°C)</label>
              <input type="number" step="0.1" value={formData.temp} onChange={e => setFormData({...formData, temp: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">pH / Acidity</label>
              <input value={formData.phAcidity} onChange={e => setFormData({...formData, phAcidity: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" placeholder="e.g. 6.7" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Rejection Reason</label>
              <select value={formData.rejectionReason} onChange={e => setFormData({...formData, rejectionReason: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm">
                {REJECTION_REASONS.map(r => <option key={r.code} value={r.code}>{r.code} - {r.reason}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Test Code</label>
              <select value={formData.testCode} onChange={e => setFormData({...formData, testCode: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm">
                {TEST_CODES.map(t => <option key={t.code} value={t.code}>{t.code} - {t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Action Taken</label>
              <input value={formData.actionTaken} onChange={e => setFormData({...formData, actionTaken: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" required />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider">Remarks</label>
            <textarea value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="w-full bg-surface-container-low border-none rounded-lg text-sm" placeholder="Additional notes..." />
          </div>
          <div className="flex justify-end gap-4 items-center">
            {successMessage && <span className="text-green-600 font-bold text-sm animate-pulse">{successMessage}</span>}
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-error text-white px-8 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save size={18} />
              )}
              {isSubmitting ? 'Saving...' : selectedRecord ? 'Update Record' : 'Save Reject Record'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            <tr>
              <th className="px-6 py-3">Date/Time</th>
              {isGlobalViewer && <th className="px-6 py-3">MCC</th>}
              <th className="px-6 py-3">Seller</th>
              <th className="px-6 py-3">Liters</th>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3">Test</th>
              <th className="px-6 py-3">Action</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {filteredRecords.sort((a, b) => {
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();
              if (dateA !== dateB) return dateA - dateB;
              return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
            }).map(rec => (
              <tr key={rec.id} className="hover:bg-surface-container-lowest transition-colors">
                <td className="px-6 py-4 text-sm">
                  <div className="font-bold">{safeFormat(rec.date, 'dd/MM/yyyy')}</div>
                  <div className="text-xs opacity-60 flex items-center gap-1"><Clock size={12} /> {rec.time}</div>
                </td>
                {isGlobalViewer && (
                  <td className="px-6 py-4 text-sm font-medium">
                    {mccs.find(m => m.id === rec.mccId)?.name || (mccs.some(m => m.name === rec.mccId) ? rec.mccId : 'Unknown')}
                  </td>
                )}
                <td className="px-6 py-4 text-sm font-bold">{rec.sellerName}</td>
                <td className="px-6 py-4 text-sm font-black text-error">{formatNumber(rec.litersRejected, 2)} L</td>
                <td className="px-6 py-4 text-sm">
                  <span className="font-bold text-primary">{rec.rejectionReason}</span>
                  <p className="text-[10px] opacity-60 truncate max-w-[150px]">
                    {REJECTION_REASONS.find(r => r.code === rec.rejectionReason)?.reason}
                  </p>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="font-bold text-secondary">{rec.testCode}</span>
                  <p className="text-[10px] opacity-60 truncate max-w-[150px]">
                    {TEST_CODES.find(t => t.code === rec.testCode)?.name}
                  </p>
                </td>
                <td className="px-6 py-4 text-sm">{rec.actionTaken}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canWrite && (
                      <>
                        <button 
                          onClick={() => handleEdit(rec)}
                          className="p-1 text-primary hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={async () => { 
                            if(window.confirm('Delete this record?')) {
                              try {
                                await deleteDoc(doc(db, 'rejects', rec.id));
                              } catch (error) {
                                handleFirestoreError(error, OperationType.DELETE, `rejects/${rec.id}`);
                              }
                            }
                          }} 
                          className="p-1 text-error hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRecords.length === 0 && (
          <div className="text-center py-20">
            <Beaker className="mx-auto text-outline-variant mb-4" size={48} />
            <p className="text-on-surface-variant">No reject records found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
