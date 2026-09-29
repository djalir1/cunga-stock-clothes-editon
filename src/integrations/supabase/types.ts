export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          is_initial: boolean
          amount: number
          created_at: string
          created_by: string | null
          debt_id: string
          id: string
          method: string
          note: string | null
          paid_at: string
        }
        Insert: {
          is_initial?: boolean
          amount: number
          created_at?: string
          created_by?: string | null
          debt_id: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
        }
        Update: {
          is_initial?: boolean
          amount?: number
          created_at?: string
          created_by?: string | null
          debt_id?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debt_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          due_date: string | null
          id: string
          notes: string | null
          sale_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          category_name: string | null
          color: string | null
          id: string
          item_name: string
          line_total: number | null
          quantity: number
          sale_id: string
          size: string | null
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          category_name?: string | null
          color?: string | null
          id?: string
          item_name: string
          line_total?: number | null
          quantity: number
          sale_id: string
          size?: string | null
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          category_name?: string | null
          color?: string | null
          id?: string
          item_name?: string
          line_total?: number | null
          quantity?: number
          sale_id?: string
          size?: string | null
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "stock_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          receipt_no: number
          amount_paid: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          notes: string | null
          payment_method: string
          payment_status: string
          sold_at: string
          source: string
          total: number
        }
        Insert: {
          receipt_no?: never
          amount_paid: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status: string
          sold_at?: string
          source?: string
          total: number
        }
        Update: {
          receipt_no?: never
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          notes?: string | null
          payment_method?: string
          payment_status?: string
          sold_at?: string
          source?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          issued: number
          min_quantity: number
          name: string
          notes: string | null
          person_responsible: string | null
          quantity: number
          status: Database["public"]["Enums"]["stock_status"]
          total_added: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          issued?: number
          min_quantity?: number
          name: string
          notes?: string | null
          person_responsible?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          total_added?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          issued?: number
          min_quantity?: number
          name?: string
          notes?: string | null
          person_responsible?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          total_added?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string
          movement_type: string
          new_quantity: number
          notes: string | null
          performed_by: string | null
          previous_quantity: number
          quantity: number
          sale_id: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          movement_type: string
          new_quantity: number
          notes?: string | null
          performed_by?: string | null
          previous_quantity: number
          quantity: number
          sale_id?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          movement_type?: string
          new_quantity?: number
          notes?: string | null
          performed_by?: string | null
          previous_quantity?: number
          quantity?: number
          sale_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "stock_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_variants: {
        Row: {
          color: string | null
          cost_price: number | null
          created_at: string
          default_price: number | null
          id: string
          item_id: string
          quantity: number
          size: string | null
          sold: number
          total_added: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          cost_price?: number | null
          created_at?: string
          default_price?: number | null
          id?: string
          item_id: string
          quantity?: number
          size?: string | null
          sold?: number
          total_added?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          cost_price?: number | null
          created_at?: string
          default_price?: number | null
          id?: string
          item_id?: string
          quantity?: number
          size?: string | null
          sold?: number
          total_added?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      temp_stock_checkouts: {
        Row: {
          closed_date: string | null
          color: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deposit: number | null
          expected_return_date: string | null
          id: string
          item_name: string
          notes: string | null
          quantity: number
          sale_id: string | null
          size: string | null
          status: string
          taken_date: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          closed_date?: string | null
          color?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deposit?: number | null
          expected_return_date?: string | null
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number
          sale_id?: string | null
          size?: string | null
          status?: string
          taken_date?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          closed_date?: string | null
          color?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit?: number | null
          expected_return_date?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number
          sale_id?: string | null
          size?: string | null
          status?: string
          taken_date?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temp_stock_checkouts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_stock_checkouts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_stock_checkouts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "stock_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      debt_balances: {
        Row: {
          amount: number | null
          balance: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          id: string | null
          notes: string | null
          paid: number | null
          sale_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_stock_variant: {
        Args: {
          p_color: string
          p_cost_price?: number
          p_default_price?: number
          p_item_id: string
          p_quantity: number
          p_size: string
        }
        Returns: string
      }
      check_out_temp: {
        Args: {
          p_customer_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_deposit?: number
          p_expected_return_date?: string
          p_notes?: string
          p_quantity: number
          p_taken_date?: string
          p_variant_id: string
        }
        Returns: string
      }
      close_temp_checkout: {
        Args: {
          p_amount_paid?: number
          p_checkout_id: string
          p_due_date?: string
          p_outcome: string
          p_payment_method?: string
          p_unit_price?: number
        }
        Returns: string
      }
      create_stock_item: {
        Args: {
          p_category_id: string
          p_image_url?: string
          p_min_quantity: number
          p_name: string
          p_notes?: string
          p_variants: Json
        }
        Returns: string
      }
      delete_temp_checkout: {
        Args: { p_checkout_id: string }
        Returns: undefined
      }
      record_debt_payment: {
        Args: {
          p_amount: number
          p_debt_id: string
          p_method?: string
          p_note?: string
        }
        Returns: number
      }
      record_sale: {
        Args: {
          p_amount_paid?: number
          p_customer_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_due_date?: string
          p_lines: Json
          p_notes?: string
          p_payment_method?: string
          p_source?: string
        }
        Returns: string
      }
      restock_variant: {
        Args: { p_notes?: string; p_quantity: number; p_variant_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "storekeeper" | "owner"
      stock_status: "in_stock" | "out_of_stock" | "low_stock"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "storekeeper", "owner"],
      stock_status: ["in_stock", "out_of_stock", "low_stock"],
    },
  },
} as const
