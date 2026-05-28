export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      badge_events: {
        Row: {
          awarded_via: string | null
          badge_key: string
          created_at: string
          guest_id: string
          id: number
          tale_slug: string | null
        }
        Insert: {
          awarded_via?: string | null
          badge_key: string
          created_at?: string
          guest_id: string
          id?: number
          tale_slug?: string | null
        }
        Update: {
          awarded_via?: string | null
          badge_key?: string
          created_at?: string
          guest_id?: string
          id?: number
          tale_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_events_tale_slug_fkey"
            columns: ["tale_slug"]
            isOneToOne: false
            referencedRelation: "tales"
            referencedColumns: ["slug"]
          },
        ]
      }
      beers: {
        Row: {
          abbr: string | null
          abv: string | null
          can_image_url: string | null
          category: string
          created_at: string
          display_order: number
          ibu: string | null
          is_active: boolean
          name: string
          slug: string
          status: string
          style: string | null
          tasting: string | null
          updated_at: string
        }
        Insert: {
          abbr?: string | null
          abv?: string | null
          can_image_url?: string | null
          category: string
          created_at?: string
          display_order?: number
          ibu?: string | null
          is_active?: boolean
          name: string
          slug: string
          status?: string
          style?: string | null
          tasting?: string | null
          updated_at?: string
        }
        Update: {
          abbr?: string | null
          abv?: string | null
          can_image_url?: string | null
          category?: string
          created_at?: string
          display_order?: number
          ibu?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          status?: string
          style?: string | null
          tasting?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      food: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_events: {
        Row: {
          attempts: number | null
          created_at: string
          duration_ms: number | null
          game_type: string
          guest_id: string
          id: number
          meta: Json
          phase: string
          tale_slug: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          duration_ms?: number | null
          game_type: string
          guest_id: string
          id?: number
          meta?: Json
          phase: string
          tale_slug?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string
          duration_ms?: number | null
          game_type?: string
          guest_id?: string
          id?: number
          meta?: Json
          phase?: string
          tale_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_events_tale_slug_fkey"
            columns: ["tale_slug"]
            isOneToOne: false
            referencedRelation: "tales"
            referencedColumns: ["slug"]
          },
        ]
      }
      guest_profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          guest_id: string
          last_seen_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          guest_id: string
          last_seen_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          guest_id?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bytes: number | null
          created_at: string
          created_by: string | null
          display_order: number
          height: number | null
          id: string
          is_primary: boolean
          kind: string
          mime_type: string | null
          owner_kind: string
          owner_slug: string
          storage_path: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          height?: number | null
          id?: string
          is_primary?: boolean
          kind: string
          mime_type?: string | null
          owner_kind: string
          owner_slug: string
          storage_path: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          height?: number | null
          id?: string
          is_primary?: boolean
          kind?: string
          mime_type?: string | null
          owner_kind?: string
          owner_slug?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: []
      }
      qr_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          location_label: string | null
          purpose: string | null
          redirect_to: string | null
          rotated_at: string | null
          tale_slug: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_label?: string | null
          purpose?: string | null
          redirect_to?: string | null
          rotated_at?: string | null
          tale_slug: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_label?: string | null
          purpose?: string | null
          redirect_to?: string | null
          rotated_at?: string | null
          tale_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_tale_slug_fkey"
            columns: ["tale_slug"]
            isOneToOne: false
            referencedRelation: "tales"
            referencedColumns: ["slug"]
          },
        ]
      }
      reward_tiers: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          perks: Json
          stamps_required: number
        }
        Insert: {
          created_at?: string
          id: number
          is_active?: boolean
          name: string
          perks?: Json
          stamps_required: number
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          perks?: Json
          stamps_required?: number
        }
        Relationships: []
      }
      tales: {
        Row: {
          abbr: string | null
          abv: string | null
          bar_summary: Json | null
          can_image_url: string | null
          chapter: string | null
          created_at: string
          display_order: number
          game: Json | null
          game_badge: Json | null
          hero_image_url: string | null
          ibu: string | null
          icon: string | null
          is_active: boolean
          map_title: string | null
          name: string
          person: Json | null
          person_bio: string | null
          pins: Json
          retired_date: string | null
          scan_badge: Json | null
          slug: string
          status: string
          still_here: Json
          story: Json
          style: string | null
          tagline: string | null
          tap_status: string
          timeline: Json
          title: string
          unlock_seal: string | null
          updated_at: string
          year: string | null
        }
        Insert: {
          abbr?: string | null
          abv?: string | null
          bar_summary?: Json | null
          can_image_url?: string | null
          chapter?: string | null
          created_at?: string
          display_order?: number
          game?: Json | null
          game_badge?: Json | null
          hero_image_url?: string | null
          ibu?: string | null
          icon?: string | null
          is_active?: boolean
          map_title?: string | null
          name: string
          person?: Json | null
          person_bio?: string | null
          pins?: Json
          retired_date?: string | null
          scan_badge?: Json | null
          slug: string
          status?: string
          still_here?: Json
          story?: Json
          style?: string | null
          tagline?: string | null
          tap_status?: string
          timeline?: Json
          title: string
          unlock_seal?: string | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          abbr?: string | null
          abv?: string | null
          bar_summary?: Json | null
          can_image_url?: string | null
          chapter?: string | null
          created_at?: string
          display_order?: number
          game?: Json | null
          game_badge?: Json | null
          hero_image_url?: string | null
          ibu?: string | null
          icon?: string | null
          is_active?: boolean
          map_title?: string | null
          name?: string
          person?: Json | null
          person_bio?: string | null
          pins?: Json
          retired_date?: string | null
          scan_badge?: Json | null
          slug?: string
          status?: string
          still_here?: Json
          story?: Json
          style?: string | null
          tagline?: string | null
          tap_status?: string
          timeline?: Json
          title?: string
          unlock_seal?: string | null
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      tap_list: {
        Row: {
          beer_slug: string
          created_at: string
          ended_at: string | null
          notes: string | null
          started_at: string
          tap_number: number | null
        }
        Insert: {
          beer_slug: string
          created_at?: string
          ended_at?: string | null
          notes?: string | null
          started_at?: string
          tap_number?: number | null
        }
        Update: {
          beer_slug?: string
          created_at?: string
          ended_at?: string | null
          notes?: string | null
          started_at?: string
          tap_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tap_list_beer_slug_fkey"
            columns: ["beer_slug"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["slug"]
          },
        ]
      }
      unlock_events: {
        Row: {
          created_at: string
          guest_id: string
          id: number
          ip_hash: string | null
          qr_code_id: string | null
          source: string
          tale_slug: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: number
          ip_hash?: string | null
          qr_code_id?: string | null
          source: string
          tale_slug?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: number
          ip_hash?: string | null
          qr_code_id?: string | null
          source?: string
          tale_slug?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unlock_events_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unlock_events_tale_slug_fkey"
            columns: ["tale_slug"]
            isOneToOne: false
            referencedRelation: "tales"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_type: string
          guest_id: string
          tale_id: string
        }
        Insert: {
          awarded_at?: string
          badge_type: string
          guest_id: string
          tale_id: string
        }
        Update: {
          awarded_at?: string
          badge_type?: string
          guest_id?: string
          tale_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

