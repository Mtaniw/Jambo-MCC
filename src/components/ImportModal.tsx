import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Check, AlertCircle, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: any[]) => Promise<void>;
  title: string;
  templateData: any[];
  templateFileName: string;
  expectedColumns: string[];
}

export function ImportModal({ 
  isOpen, 
  onClose, 
  onImport, 
  title, 
  templateData, 
  templateFileName,
  expectedColumns 
}: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws);
          
          if (jsonData.length === 0) {
            setError("The file is empty.");
            return;
          }

          // Validate columns
          const firstRow = jsonData[0] as any;
          const columns = Object.keys(firstRow);
          const missingColumns = expectedColumns.filter(col => !columns.includes(col));
          
          if (missingColumns.length > 0) {
            setError(`Missing required columns: ${missingColumns.join(', ')}`);
            return;
          }

          setData(jsonData);
        } catch (err) {
          setError("Failed to parse file. Please ensure it's a valid Excel or CSV file.");
        }
      };
      reader.readAsBinaryString(selectedFile);
    }
  };

  const handleImport = async () => {
    if (data.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      await onImport(data);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setFile(null);
        setData([]);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Import failed. Please check your data and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, templateFileName);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Upload size={20} />
            </div>
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {!success ? (
            <>
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="text-primary" size={24} />
                  <div>
                    <p className="text-sm font-bold">Need a template?</p>
                    <p className="text-xs text-on-surface-variant">Download our pre-formatted Excel template.</p>
                  </div>
                </div>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-xs font-bold text-primary hover:underline"
                >
                  <Download size={16} /> Download
                </button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
                  file ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary hover:bg-surface-container-low"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".xlsx, .xls, .csv"
                />
                <div className={cn(
                  "p-4 rounded-full transition-colors",
                  file ? "bg-primary text-white" : "bg-surface-container-high text-on-surface-variant"
                )}>
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="font-bold">{file ? file.name : "Click to upload or drag and drop"}</p>
                  <p className="text-xs text-on-surface-variant mt-1">Excel or CSV files only (Max 10MB)</p>
                </div>
              </div>

              {error && (
                <div className="bg-error/10 border border-error/20 text-error p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {data.length > 0 && !error && (
                <div className="bg-green-50 border border-green-100 text-green-700 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Check size={20} />
                    <p className="text-sm font-medium">Ready to import {data.length} records</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={onClose}
                  className="flex-1 py-3 font-bold text-on-surface-variant hover:bg-surface-container-low rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleImport}
                  disabled={data.length === 0 || isProcessing || !!error}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                  Start Import
                </button>
              </div>
            </>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
                <Check size={40} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-on-surface">Import Successful!</h3>
                <p className="text-on-surface-variant">Your records have been added to the system.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
