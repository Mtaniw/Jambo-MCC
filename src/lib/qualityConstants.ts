
export interface ResazurinGrade {
  value: string;
  label: string;
  color: string;
  dotColor: string;
  description: string;
}

export const RESAZURIN_SCALE: ResazurinGrade[] = [
  { value: '6', label: '6', color: 'text-blue-600', dotColor: '#2563EB', description: 'Excellent' },
  { value: '5', label: '5', color: 'text-sky-400', dotColor: '#38BDF8', description: 'Very Good' },
  { value: '4', label: '4', color: 'text-purple-600', dotColor: '#9333EA', description: 'Good' },
  { value: '3', label: '3', color: 'text-fuchsia-400', dotColor: '#E879F9', description: 'Fair' },
  { value: '2', label: '2', color: 'text-pink-600', dotColor: '#DB2777', description: 'Poor' },
  { value: '1', label: '1', color: 'text-slate-300', dotColor: '#CBD5E1', description: 'Bad' },
].sort((a, b) => Number(b.value) - Number(a.value));

export const getResazurinGrade = (value: string | number) => {
  const v = String(value);
  // Support legacy 'Good', 'Fair', 'Poor' by mapping them to 6, 4, 2 roughly or just returning a default
  if (v === 'Good') return RESAZURIN_SCALE.find(g => g.value === '6')!;
  if (v === 'Fair') return RESAZURIN_SCALE.find(g => g.value === '4')!;
  if (v === 'Poor') return RESAZURIN_SCALE.find(g => g.value === '2')!;
  
  return RESAZURIN_SCALE.find(g => g.value === v) || RESAZURIN_SCALE[0];
};
