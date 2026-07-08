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
      books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          genres: string[] | null
          google_books_id: string | null
          id: string
          isbn: string | null
          published_year: number | null
          publisher: string | null
          synopsis: string | null
          title: string
          total_pages: number | null
        }
        Insert: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          genres?: string[] | null
          google_books_id?: string | null
          id?: string
          isbn?: string | null
          published_year?: number | null
          publisher?: string | null
          synopsis?: string | null
          title: string
          total_pages?: number | null
        }
        Update: {
          author?: string | null
          cover_url?: string | null
          created_at?: string
          genres?: string[] | null
          google_books_id?: string | null
          id?: string
          isbn?: string | null
          published_year?: number | null
          publisher?: string | null
          synopsis?: string | null
          title?: string
          total_pages?: number | null
        }
        Relationships: []
      }
      diary_entries: {
        Row: {
          created_at: string
          finished_on: string
          id: string
          library_entry_id: string
          rating: number | null
          review: string | null
          started_on: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_on?: string
          id?: string
          library_entry_id: string
          rating?: number | null
          review?: string | null
          started_on?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          finished_on?: string
          id?: string
          library_entry_id?: string
          rating?: number | null
          review?: string | null
          started_on?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_library_entry_id_fkey"
            columns: ["library_entry_id"]
            isOneToOne: false
            referencedRelation: "library_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      library_entries: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes: string | null
          position: Json
          rating: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["media_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          position?: Json
          rating?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          position?: Json
          rating?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      movies: {
        Row: {
          cover_url: string | null
          created_at: string
          director: string | null
          duration_minutes: number | null
          genres: string[] | null
          id: string
          release_year: number | null
          synopsis: string | null
          title: string
          tmdb_id: number | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          director?: string | null
          duration_minutes?: number | null
          genres?: string[] | null
          id?: string
          release_year?: number | null
          synopsis?: string | null
          title: string
          tmdb_id?: number | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          director?: string | null
          duration_minutes?: number | null
          genres?: string[] | null
          id?: string
          release_year?: number | null
          synopsis?: string | null
          title?: string
          tmdb_id?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          is_public: boolean
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          is_public?: boolean
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          is_public?: boolean
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          cover_url: string | null
          created_at: string
          creator: string | null
          genres: string[] | null
          id: string
          release_year: number | null
          synopsis: string | null
          title: string
          tmdb_id: number | null
          total_episodes: number | null
          total_seasons: number | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          creator?: string | null
          genres?: string[] | null
          id?: string
          release_year?: number | null
          synopsis?: string | null
          title: string
          tmdb_id?: number | null
          total_episodes?: number | null
          total_seasons?: number | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          creator?: string | null
          genres?: string[] | null
          id?: string
          release_year?: number | null
          synopsis?: string | null
          title?: string
          tmdb_id?: number | null
          total_episodes?: number | null
          total_seasons?: number | null
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
      item_type: "book" | "movie" | "series"
      media_status: "planned" | "in_progress" | "completed" | "dropped"
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
    Enums: {
      item_type: ["book", "movie", "series"],
      media_status: ["planned", "in_progress", "completed", "dropped"],
    },
  },
} as const
