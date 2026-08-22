export interface UniformCategory {
  id: string;
  name: string;
  created_at?: string;
}

export interface UniformItem {
  id: string;
  name: string;
  category: string;
  totalQuantity: number;
  remainingQuantity: number;
}

export interface IssuedUniform {
  id: string;
  studentName: string;
  uniformId: string;
  uniformName: string;
  uniformCategory: string;
  quantityTaken: number;
  date: string;
  created_at: string;
  sweaterNumber?: string | null;
}
