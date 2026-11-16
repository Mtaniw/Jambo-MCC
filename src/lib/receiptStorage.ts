import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from './errorHandlers';

export interface PreparedReceipt {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface ReceiptMetadata {
  receiptFileId: string;
  receiptFileName: string;
  receiptFileType: string;
  receiptFileSize: number;
}

const CHUNK_SIZE = 650000; // Safe well below Firestore 1MB doc limit
const MAX_RAW_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB raw selection (images get compressed)
const MAX_STORED_BYTES = 4.5 * 1024 * 1024; // ~4.5MB max after preparation

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(dataUrl: string, maxDimension = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => reject(new Error('Failed to process image file.'));
    img.src = dataUrl;
  });
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

export async function validateAndPrepareReceipt(file: File): Promise<PreparedReceipt> {
  const mimeType = inferMimeType(file);
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new Error('Please upload a PDF or image file (PDF, JPG, PNG, WEBP).');
  }

  if (file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new Error('Selected file is too large (max 10 MB).');
  }

  let dataUrl = await readFileAsDataUrl(file);
  let finalMime = mimeType;
  let finalName = file.name.slice(0, 255);

  if (isImage && !mimeType.includes('gif') && !mimeType.includes('svg') && file.size > 400 * 1024) {
    const compressed = await compressImageDataUrl(dataUrl);
    if (compressed.length < dataUrl.length) {
      dataUrl = compressed;
      if (compressed.startsWith('data:image/jpeg')) {
        finalMime = 'image/jpeg';
        if (!/\.(jpe?g)$/i.test(finalName)) {
          finalName = finalName.replace(/\.[^.]+$/, '') + '.jpg';
        }
      }
    }
  }

  const finalSize = estimateBase64Bytes(dataUrl);
  if (finalSize > MAX_STORED_BYTES) {
    throw new Error('File is too large to store (max ~4.5 MB after compression). Please upload a smaller PDF or image.');
  }

  return {
    fileName: finalName,
    mimeType: finalMime,
    size: finalSize > 0 ? finalSize : file.size,
    dataUrl,
  };
}

export async function uploadReceiptToFirestore(
  prepared: PreparedReceipt,
  parentCollection: 'expenses' | 'money_received',
  uploadedBy: string
): Promise<ReceiptMetadata> {
  const receiptRef = doc(collection(db, 'receipts'));
  const now = new Date().toISOString();

  try {
    if (prepared.dataUrl.length <= CHUNK_SIZE) {
      await setDoc(receiptRef, {
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        size: prepared.size,
        chunkCount: 0,
        data: prepared.dataUrl,
        parentCollection,
        uploadedBy: uploadedBy.slice(0, 200),
        createdAt: now,
      });
    } else {
      const chunks: string[] = [];
      for (let i = 0; i < prepared.dataUrl.length; i += CHUNK_SIZE) {
        chunks.push(prepared.dataUrl.slice(i, i + CHUNK_SIZE));
      }

      await setDoc(receiptRef, {
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        size: prepared.size,
        chunkCount: chunks.length,
        parentCollection,
        uploadedBy: uploadedBy.slice(0, 200),
        createdAt: now,
      });

      const batch = writeBatch(db);
      chunks.forEach((chunkData, index) => {
        const chunkRef = doc(db, 'receipts', receiptRef.id, 'chunks', String(index));
        batch.set(chunkRef, { index, data: chunkData });
      });
      await batch.commit();
    }

    return {
      receiptFileId: receiptRef.id,
      receiptFileName: prepared.fileName,
      receiptFileType: prepared.mimeType,
      receiptFileSize: prepared.size,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `receipts/${receiptRef.id}`);
    throw error;
  }
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    throw new Error('Corrupted receipt file data.');
  }
  const header = parts[0];
  const base64 = parts[1];
  const mimeMatch = header.match(/data:([^;]+);/);
  const mime = mimeMatch?.[1] || fallbackMime || 'application/octet-stream';

  const byteChars = atob(base64);
  const byteArrays: Uint8Array[] = [];
  const sliceSize = 8192;
  for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
    const slice = byteChars.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mime });
}

export async function downloadReceiptFromFirestore(
  receiptFileId: string,
  fallbackFileName?: string
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'receipts', receiptFileId));
    if (!snap.exists()) {
      throw new Error('Receipt file was not found.');
    }

    const docData = snap.data();
    let fullDataUrl = docData.data || '';

    if (docData.chunkCount && docData.chunkCount > 0) {
      const chunksSnap = await getDocs(collection(db, 'receipts', receiptFileId, 'chunks'));
      const sortedChunks = chunksSnap.docs
        .map(d => d.data() as { index: number; data: string })
        .sort((a, b) => a.index - b.index);
      fullDataUrl = sortedChunks.map(c => c.data).join('');
    }

    if (!fullDataUrl) {
      throw new Error('Receipt file content is empty.');
    }

    const blob = dataUrlToBlob(fullDataUrl, docData.mimeType || 'application/octet-stream');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docData.fileName || fallbackFileName || 'receipt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `receipts/${receiptFileId}`);
  }
}

export async function deleteReceiptFromFirestore(receiptFileId: string): Promise<void> {
  if (!receiptFileId) return;
  try {
    const receiptRef = doc(db, 'receipts', receiptFileId);
    const snap = await getDoc(receiptRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.chunkCount && data.chunkCount > 0) {
        const chunksSnap = await getDocs(collection(db, 'receipts', receiptFileId, 'chunks'));
        if (!chunksSnap.empty) {
          const batch = writeBatch(db);
          chunksSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(receiptRef);
    }
  } catch (error) {
    console.warn('Could not clean up old receipt file:', error);
  }
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
