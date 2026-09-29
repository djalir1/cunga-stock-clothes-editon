export type StockStatus = 'in_stock' | 'out_of_stock' | 'low_stock';
// 'admin' = the developers who build and look after the app (view-only in the shop, can get every alert)
// 'supervisor' = views everything and makes reports; gets only the alerts the owner allows
export type AppRole = 'owner' | 'storekeeper' | 'supervisor' | 'admin';

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  storekeeper: 'Storekeeper',
  supervisor: 'Supervisor (view & reports)',
  admin: 'Developer',
};
// 'issued' = sold · 'loaned' = out with a customer on approval · 'loan_returned' = back on the shelf
export type MovementType = 'added' | 'issued' | 'returned' | 'adjusted' | 'loaned' | 'loan_returned';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  added: 'Added',
  issued: 'Sold',
  returned: 'Restocked',
  adjusted: 'Adjusted',
  loaned: 'Out on approval',
  loan_returned: 'Back from customer',
};

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
  total_added: number;
  issued: number; // units sold
  status: StockStatus;
  image_url: string | null;
  person_responsible: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

/** One size × colour of an item. Stock is counted here; the item holds the totals. */
export interface StockVariant {
  id: string;
  item_id: string;
  size: string | null;
  color: string | null;
  quantity: number;
  total_added: number;
  sold: number;
  /** Usual asking price — a hint only; the real price is typed on every sale */
  default_price: number | null;
  cost_price: number | null;
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
  item?: Pick<StockItem, 'name'>;
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