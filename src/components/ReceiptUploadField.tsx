import React, { useRef, useState } from 'react';
import { Upload, FileText, Image as ImageIcon, Download, Trash2, Loader2, AlertCircle } from 'lucide-react';
import {
  PreparedReceipt,
  validateAndPrepareReceipt,
  downloadReceiptFromFirestore,
  formatBytes,
} from '../lib/receiptStorage';

interface ReceiptUploadFieldProps {
  label?: string;
  pendingReceipt: PreparedReceipt | null;
  onSelectReceipt: (prepared: PreparedReceipt | null) => void;
  existingReceipt?: {
    receiptFileId?: string;
    receiptFileName?: string;
    receiptFileType?: string;
    receiptFileSize?: number;
  } | null;
  removeExisting: boolean;
  onToggleRemoveExisting: (remove: boolean) => void;
}

export function ReceiptUploadField({
  label = 'Upload Receipt (PDF / Image - Optional)',
  pendingReceipt,
  onSelectReceipt,
  existingReceipt,
  removeExisting,
  onToggleRemoveExisting,
}: ReceiptUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSavedReceipt = !!(existingReceipt?.receiptFileId && !removeExisting && !pendingReceipt);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const prepared = await validateAndPrepareReceipt(file);
      onSelectReceipt(prepared);
      onToggleRemoveExisting(false);
    } catch (err: any) {
      setError(err?.message || 'Could not process selected file.');
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownloadExisting = async () => {
    if (!existingReceipt?.receiptFileId) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadReceiptFromFirestore(
        existingReceipt.receiptFileId,
        existingReceipt.receiptFileName
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to download receipt.');
    } finally {
      setDownloading(false);
    }
  };

  const isPdf = (mime?: string, name?: string) =>
    mime === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf');

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase text-on-surface-variant opacity-60 block tracking-widest">
        {label}
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {pendingReceipt ? (
        <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              {isPdf(pendingReceipt.mimeType, pendingReceipt.fileName) ? (
                <FileText size={18} />
              ) : (
                <ImageIcon size={18} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-on-surface truncate">{pendingReceipt.fileName}</p>
              <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">
                Ready to save • {formatBytes(pendingReceipt.size)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-white border border-outline-variant/30 rounded-lg hover:bg-surface-container-low transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onSelectReceipt(null)}
              className="p-1.5 text-error hover:bg-red-50 rounded-lg transition-colors"
              title="Remove selected file"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : hasSavedReceipt ? (
        <div className="flex items-center justify-between gap-3 bg-green-50/70 border border-green-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-green-100 text-green-700 shrink-0">
              {isPdf(existingReceipt?.receiptFileType, existingReceipt?.receiptFileName) ? (
                <FileText size={18} />
              ) : (
                <ImageIcon size={18} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-on-surface truncate">
                {existingReceipt?.receiptFileName || 'Attached Receipt'}
              </p>
              <p className="text-[10px] text-green-700 font-semibold uppercase tracking-wider">
                Saved Receipt {existingReceipt?.receiptFileSize ? `• ${formatBytes(existingReceipt.receiptFileSize)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDownloadExisting}
              disabled={downloading}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-white border border-outline-variant/30 rounded-lg hover:bg-surface-container-low transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onToggleRemoveExisting(true)}
              className="p-1.5 text-error hover:bg-red-50 rounded-lg transition-colors"
              title="Remove attached receipt"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
          className="w-full flex items-center justify-center gap-2.5 bg-surface-container-low hover:bg-surface-container border border-dashed border-outline-variant/40 rounded-xl px-4 py-3.5 text-xs font-bold text-on-surface-variant transition-all cursor-pointer disabled:opacity-50"
        >
          {preparing ? (
            <>
              <Loader2 size={16} className="animate-spin text-primary" />
              <span>Preparing file...</span>
            </>
          ) : (
            <>
              <Upload size={16} className="text-primary" />
              <span>
                {removeExisting
                  ? 'Receipt marked for removal — Click to upload replacement (PDF or Image)'
                  : 'Click to attach receipt file (PDF, JPG, PNG — Optional)'}
              </span>
            </>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-error font-medium px-1">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
