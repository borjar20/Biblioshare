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
      challenges: {
        Row: {
          archived_at: string | null
          created_at: string
          criteria: Json
          end_date: string
          id: string
          item_type: Database["public"]["Enums"]["item_type"] | null
          name: string
          start_date: string
          target_count: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          criteria?: Json
          end_date: string
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          name: string
          start_date: string
          target_count: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          criteria?: Json
          end_date?: string
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          name?: string
          start_date?: string
          target_count?: number
          user_id?: string
        }
        Relationships: []
      }
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
      credits: {
        Row: {
          billing_order: number | null
          character: string | null
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          person_id: string
          role: string
        }
        Insert: {
          billing_order?: number | null
          character?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          person_id: string
          role: string
        }
        Update: {
          billing_order?: number | null
          character?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
      episode_watches: {
        Row: {
          created_at: string
          episode_number: number
          id: string
          rating: number | null
          review: string | null
          season_number: number
          series_id: string
          updated_at: string
          user_id: string
          watched_on: string
        }
        Insert: {
          created_at?: string
          episode_number: number
          id?: string
          rating?: number | null
          review?: string | null
          season_number: number
          series_id: string
          updated_at?: string
          user_id: string
          watched_on?: string
        }
        Update: {
          created_at?: string
          episode_number?: number
          id?: string
          rating?: number | null
          review?: string | null
          season_number?: number
          series_id?: string
          updated_at?: string
          user_id?: string
          watched_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_watches_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          status: Database["public"]["Enums"]["follow_status"]
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          status?: Database["public"]["Enums"]["follow_status"]
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          status?: Database["public"]["Enums"]["follow_status"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          read_at: string | null
          target_id: string | null
          target_type: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          target_id?: string | null
          target_type?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          target_id?: string | null
          target_type?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          channel: Database["public"]["Enums"]["push_channel"]
          created_at: string
          credentials: Json
          id: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["push_channel"]
          created_at?: string
          credentials: Json
          id?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["push_channel"]
          created_at?: string
          credentials?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      clubs: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          visibility: Database["public"]["Enums"]["club_visibility"]
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
          visibility?: Database["public"]["Enums"]["club_visibility"]
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          visibility?: Database["public"]["Enums"]["club_visibility"]
        }
        Relationships: []
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          role: Database["public"]["Enums"]["club_role"]
          status: Database["public"]["Enums"]["club_member_status"]
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["club_member_status"]
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          status?: Database["public"]["Enums"]["club_member_status"]
          user_id?: string
        }
        Relationships: []
      }
      club_posts: {
        Row: {
          author_id: string
          body: string
          club_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at: string | null
          ref: Json | null
        }
        Insert: {
          author_id: string
          body: string
          club_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at?: string | null
          ref?: Json | null
        }
        Update: {
          author_id?: string
          body?: string
          club_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["club_post_kind"]
          poll_ends_at?: string | null
          ref?: Json | null
        }
        Relationships: []
      }
      club_poll_options: {
        Row: {
          id: string
          label: string
          position: number
          post_id: string
        }
        Insert: {
          id?: string
          label: string
          position: number
          post_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          post_id?: string
        }
        Relationships: []
      }
      club_poll_votes: {
        Row: {
          option_id: string
          post_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          option_id: string
          post_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          option_id?: string
          post_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: []
      }
      club_activities: {
        Row: {
          club_id: string
          config: Json | null
          created_at: string
          created_by: string
          description: string | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          starts_on: string | null
          status: Database["public"]["Enums"]["activity_status"]
          title: string
        }
        Insert: {
          club_id: string
          config?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
        }
        Update: {
          club_id?: string
          config?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          starts_on?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
        }
        Relationships: []
      }
      club_activity_participants: {
        Row: {
          activity_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: []
      }
      club_activity_items: {
        Row: {
          activity_id: string
          added_by: string
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
        }
        Insert: {
          activity_id: string
          added_by: string
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
        }
        Update: {
          activity_id?: string
          added_by?: string
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          position?: number
        }
        Relationships: []
      }
      club_activity_opinions: {
        Row: {
          activity_id: string
          comment: string | null
          created_at: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating: number | null
          user_id: string
        }
        Insert: {
          activity_id: string
          comment?: string | null
          created_at?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating?: number | null
          user_id: string
        }
        Update: {
          activity_id?: string
          comment?: string | null
          created_at?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["target_kind"]
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["target_kind"]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["target_kind"]
        }
        Relationships: []
      }
      library_entries: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes: string | null
          queue_id: string | null
          pinned_order: number | null
          position: Json
          queue_order: number | null
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
          queue_id?: string | null
          pinned_order?: number | null
          position?: Json
          queue_order?: number | null
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
          queue_id?: string | null
          pinned_order?: number | null
          position?: Json
          queue_order?: number | null
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
      pending_import_rows: {
        Row: {
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["pending_import_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["item_type"]
          payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pending_import_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["pending_import_status"]
          user_id?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          bio: string | null
          birth_date: string | null
          created_at: string
          death_date: string | null
          id: string
          known_for: string | null
          name: string
          openlibrary_key: string | null
          photo_url: string | null
          place_of_birth: string | null
          tmdb_id: number | null
        }
        Insert: {
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          death_date?: string | null
          id?: string
          known_for?: string | null
          name: string
          openlibrary_key?: string | null
          photo_url?: string | null
          place_of_birth?: string | null
          tmdb_id?: number | null
        }
        Update: {
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          death_date?: string | null
          id?: string
          known_for?: string | null
          name?: string
          openlibrary_key?: string | null
          photo_url?: string | null
          place_of_birth?: string | null
          tmdb_id?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          annual_goal_books: number | null
          annual_goal_movies: number | null
          annual_goal_series: number | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          daily_goal_minutes: number | null
          display_name: string | null
          is_public: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          annual_goal_books?: number | null
          annual_goal_movies?: number | null
          annual_goal_series?: number | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_goal_minutes?: number | null
          display_name?: string | null
          is_public?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          annual_goal_books?: number | null
          annual_goal_movies?: number | null
          annual_goal_series?: number | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_goal_minutes?: number | null
          display_name?: string | null
          is_public?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      progress_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          library_entry_id: string
          note: string | null
          position: Json
          session_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          library_entry_id: string
          note?: string | null
          position?: Json
          session_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          library_entry_id?: string
          note?: string | null
          position?: Json
          session_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_sessions_library_entry_id_fkey"
            columns: ["library_entry_id"]
            isOneToOne: false
            referencedRelation: "library_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number | null
          saga_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position?: number | null
          saga_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          position?: number | null
          saga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_items_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      sagas: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          name: string
          overview: string | null
          source: string
          tmdb_collection_id: number | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name: string
          overview?: string | null
          source?: string
          tmdb_collection_id?: number | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          name?: string
          overview?: string | null
          source?: string
          tmdb_collection_id?: number | null
        }
        Relationships: []
      }
      queues: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          cover_url: string | null
          created_at: string
          creator: string | null
          episode_runtime_minutes: number | null
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
          episode_runtime_minutes?: number | null
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
          episode_runtime_minutes?: number | null
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
      series_episodes: {
        Row: {
          air_date: string | null
          created_at: string
          episode_number: number
          id: string
          runtime_minutes: number | null
          season_number: number
          series_id: string
          still_url: string | null
          synopsis: string | null
          title: string | null
        }
        Insert: {
          air_date?: string | null
          created_at?: string
          episode_number: number
          id?: string
          runtime_minutes?: number | null
          season_number: number
          series_id: string
          still_url?: string | null
          synopsis?: string | null
          title?: string | null
        }
        Update: {
          air_date?: string | null
          created_at?: string
          episode_number?: number
          id?: string
          runtime_minutes?: number | null
          season_number?: number
          series_id?: string
          still_url?: string | null
          synopsis?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_episodes_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profile_identities: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          is_public: boolean | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          is_public?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          is_public?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_min_role: {
        Args: { min: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      profile_is_public: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      reorder_queue: {
        Args: { target_queue: string | null; entry_ids: string[] }
        Returns: undefined
      }
      resolve_pending_import: {
        Args: { p_catalog_item_id: string; p_pending_id: string }
        Returns: undefined
      }
      create_club: {
        Args: {
          p_slug: string
          p_name: string
          p_description: string
          p_visibility: Database["public"]["Enums"]["club_visibility"]
          p_cover_url: string
        }
        Returns: Database["public"]["Tables"]["clubs"]["Row"]
      }
      set_club_member_role: {
        Args: {
          p_club_id: string
          p_user_id: string
          p_role: Database["public"]["Enums"]["club_role"]
        }
        Returns: undefined
      }
      transfer_club_ownership: {
        Args: {
          p_club_id: string
          p_new_owner_id: string
        }
        Returns: undefined
      }
      create_club_poll: {
        Args: {
          p_club_id: string
          p_question: string
          p_options: string[]
          p_ends_at: string
        }
        Returns: undefined
      }
      vote_club_poll: {
        Args: {
          p_post_id: string
          p_option_id: string
        }
        Returns: undefined
      }
      activate_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      finish_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      archive_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_kind: "buddy_read" | "tierlist" | "list_challenge" | "criteria_challenge"
      activity_status: "proposed" | "active" | "finished" | "archived"
      follow_status: "pending" | "accepted"
      notification_type: "follow_request" | "new_follower" | "follow_accepted" | "review_liked" | "review_commented" | "club_invite" | "club_invite_accepted" | "club_post" | "club_post_liked" | "club_post_commented" | "comment_liked" | "club_activity_proposed" | "club_activity_activated"
      push_channel: "web"
      target_kind: "diary_entry" | "episode_watch" | "club_post" | "comment"
      item_type: "book" | "movie" | "series"
      media_status: "planned" | "in_progress" | "completed" | "dropped"
      pending_import_status: "pending" | "resolved" | "dismissed"
      user_role: "user" | "collaborator" | "admin"
      club_member_status: "invited" | "active"
      club_role: "member" | "moderator" | "owner"
      club_visibility: "public" | "private"
      club_post_kind: "text" | "activity_share" | "poll"
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
      activity_kind: ["buddy_read", "tierlist", "list_challenge", "criteria_challenge"],
      activity_status: ["proposed", "active", "finished", "archived"],
      follow_status: ["pending", "accepted"],
      notification_type: ["follow_request", "new_follower", "follow_accepted", "review_liked", "review_commented", "club_invite", "club_invite_accepted", "club_post", "club_post_liked", "club_post_commented", "comment_liked", "club_activity_proposed", "club_activity_activated"],
      push_channel: ["web"],
      target_kind: ["diary_entry", "episode_watch", "club_post", "comment"],
      item_type: ["book", "movie", "series"],
      media_status: ["planned", "in_progress", "completed", "dropped"],
      user_role: ["user", "collaborator", "admin"],
      club_member_status: ["invited", "active"],
      club_role: ["member", "moderator", "owner"],
      club_visibility: ["public", "private"],
      club_post_kind: ["text", "activity_share", "poll"],
    },
  },
} as const
