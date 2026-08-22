export type StockStatus = 'in_stock' | 'out_of_stock' | 'low_stock';
export type AppRole = 'admin' | 'storekeeper';
export type MovementType = 'added' | 'issued' | 'returned' | 'adjusted';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
}

export interface StockItem {
  id: string;
  name: string;
  category_id: string | null;
  quantity: number;
  min_quantity: number;
  status: StockStatus;
  person_responsible: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface StockMovement {
  id: string;
  item_id: string;
  movement_type: MovementType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  item?: StockItem;
  performer?: Profile;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user?: Profile;
}

export interface DashboardStats {
  totalItems: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
  recentlyAdded: StockItem[];
  recentlyIssued: StockMovement[];
  categoryBreakdown: { name: string; count: number; color: string }[];
}