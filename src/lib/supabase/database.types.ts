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
      book_editions: {
        Row: {
          book_id: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          isbn: string | null
          label: string
          language: string | null
          published_year: number | null
          publisher: string | null
          total_pages: number | null
        }
        Insert: {
          book_id: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          isbn?: string | null
          label: string
          language?: string | null
          published_year?: number | null
          publisher?: string | null
          total_pages?: number | null
        }
        Update: {
          book_id?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          isbn?: string | null
          label?: string
          language?: string | null
          published_year?: number | null
          publisher?: string | null
          total_pages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "book_editions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          cover_url: string | null
          created_at: string
          editions_synced_at: string | null
          genres: string[] | null
          hydrated_at: string | null
          id: string
          isbn: string | null
          openlibrary_work_key: string | null
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
          editions_synced_at?: string | null
          genres?: string[] | null
          hydrated_at?: string | null
          id?: string
          isbn?: string | null
          openlibrary_work_key?: string | null
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
          editions_synced_at?: string | null
          genres?: string[] | null
          hydrated_at?: string | null
          id?: string
          isbn?: string | null
          openlibrary_work_key?: string | null
          published_year?: number | null
          publisher?: string | null
          synopsis?: string | null
          title?: string
          total_pages?: number | null
        }
        Relationships: []
      }
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
          spawned_from_activity_id: string | null
          spawned_from_item_id: string | null
          spawned_from_item_type:
            | Database["public"]["Enums"]["item_type"]
            | null
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
          spawned_from_activity_id?: string | null
          spawned_from_item_id?: string | null
          spawned_from_item_type?:
            | Database["public"]["Enums"]["item_type"]
            | null
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
          spawned_from_activity_id?: string | null
          spawned_from_item_id?: string | null
          spawned_from_item_type?:
            | Database["public"]["Enums"]["item_type"]
            | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_activities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_activities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_stats"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_activities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_activities_spawned_from_activity_id_fkey"
            columns: ["spawned_from_activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      club_activity_checkpoint_reads: {
        Row: {
          checkpoint_id: string
          reached_at: string
          user_id: string
        }
        Insert: {
          checkpoint_id: string
          reached_at?: string
          user_id: string
        }
        Update: {
          checkpoint_id?: string
          reached_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_activity_checkpoint_reads_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "club_activity_checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      club_activity_checkpoints: {
        Row: {
          activity_id: string
          created_at: string
          created_by: string
          due_on: string | null
          id: string
          label: string
          order: number
          position: Json
        }
        Insert: {
          activity_id: string
          created_at?: string
          created_by: string
          due_on?: string | null
          id?: string
          label: string
          order: number
          position: Json
        }
        Update: {
          activity_id?: string
          created_at?: string
          created_by?: string
          due_on?: string | null
          id?: string
          label?: string
          order?: number
          position?: Json
        }
        Relationships: [
          {
            foreignKeyName: "club_activity_checkpoints_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_activity_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_activity_opinions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_activity_participants_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      club_activity_placements: {
        Row: {
          activity_id: string
          created_at: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
          tier: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
          tier: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          position?: number
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_activity_placements_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "club_activities"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_stats"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "club_posts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "club_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "club_posts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "club_posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_stats"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_reads: {
        Row: {
          club_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_reads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "club_stats"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_reads_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
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
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          position?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_sorteable: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_sorteable?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_sorteable?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
          visibility?: string
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
      episode_watches: {
        Row: {
          created_at: string
          episode_number: number
          id: string
          pass_id: string | null
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
          pass_id?: string | null
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
          pass_id?: string | null
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
            foreignKeyName: "episode_watches_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "pass_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_watches_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "passes"
            referencedColumns: ["id"]
          },
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
      library_entries: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes: string | null
          pinned_order: number | null
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
          pinned_order?: number | null
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
          pinned_order?: number | null
          position?: Json
          rating?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      movie_versions: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          is_primary: boolean
          label: string
          movie_id: string
          release_year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          is_primary?: boolean
          label: string
          movie_id: string
          release_year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          is_primary?: boolean
          label?: string
          movie_id?: string
          release_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movie_versions_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
        ]
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
      notes: {
        Row: {
          body: string
          created_at: string
          id: string
          is_favorite: boolean
          is_public: boolean
          is_spoiler: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          kind: string
          meta: Json
          parent_note_id: string | null
          pass_id: string | null
          position: Json | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          is_spoiler?: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          kind: string
          meta?: Json
          parent_note_id?: string | null
          pass_id?: string | null
          position?: Json | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          is_public?: boolean
          is_spoiler?: boolean
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          kind?: string
          meta?: Json
          parent_note_id?: string | null
          pass_id?: string | null
          position?: Json | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_parent_note_id_fkey"
            columns: ["parent_note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "pass_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "progress_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      passes: {
        Row: {
          created_at: string
          edition_id: string | null
          finished_on: string | null
          id: string
          is_active: boolean
          is_public: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          pinned_order: number | null
          position: Json
          rating: number | null
          review: string | null
          started_on: string | null
          status: Database["public"]["Enums"]["media_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          edition_id?: string | null
          finished_on?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          pinned_order?: number | null
          position?: Json
          rating?: number | null
          review?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          edition_id?: string | null
          finished_on?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          pinned_order?: number | null
          position?: Json
          rating?: number | null
          review?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          updated_at?: string
          user_id?: string
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
          avatar_url: string | null
          bio: string | null
          created_at: string
          daily_goal_minutes: number | null
          display_name: string | null
          interests: Database["public"]["Enums"]["item_type"][] | null
          is_public: boolean
          onboarded_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_goal_minutes?: number | null
          display_name?: string | null
          interests?: Database["public"]["Enums"]["item_type"][] | null
          is_public?: boolean
          onboarded_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          daily_goal_minutes?: number | null
          display_name?: string | null
          interests?: Database["public"]["Enums"]["item_type"][] | null
          is_public?: boolean
          onboarded_at?: string | null
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
          note: string | null
          pass_id: string
          position: Json
          session_date: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          note?: string | null
          pass_id: string
          position?: Json
          session_date?: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          note?: string | null
          pass_id?: string
          position?: Json
          session_date?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_sessions_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "pass_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_sessions_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "passes"
            referencedColumns: ["id"]
          },
        ]
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
      saga_follows: {
        Row: {
          created_at: string
          saga_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          saga_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          saga_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_follows_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_items: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          optional: boolean
          placement: Database["public"]["Enums"]["saga_placement"] | null
          position: number | null
          role: Database["public"]["Enums"]["saga_item_role"] | null
          saga_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          optional?: boolean
          placement?: Database["public"]["Enums"]["saga_placement"] | null
          position?: number | null
          role?: Database["public"]["Enums"]["saga_item_role"] | null
          saga_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          optional?: boolean
          placement?: Database["public"]["Enums"]["saga_placement"] | null
          position?: number | null
          role?: Database["public"]["Enums"]["saga_item_role"] | null
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
      saga_placement_windows: {
        Row: {
          after_child_saga_id: string | null
          after_item_id: string | null
          after_item_type: Database["public"]["Enums"]["item_type"] | null
          before_child_saga_id: string | null
          before_item_id: string | null
          before_item_type: Database["public"]["Enums"]["item_type"] | null
          child_saga_id: string | null
          created_at: string
          id: string
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          saga_id: string
        }
        Insert: {
          after_child_saga_id?: string | null
          after_item_id?: string | null
          after_item_type?: Database["public"]["Enums"]["item_type"] | null
          before_child_saga_id?: string | null
          before_item_id?: string | null
          before_item_type?: Database["public"]["Enums"]["item_type"] | null
          child_saga_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          saga_id: string
        }
        Update: {
          after_child_saga_id?: string | null
          after_item_id?: string | null
          after_item_type?: Database["public"]["Enums"]["item_type"] | null
          before_child_saga_id?: string | null
          before_item_id?: string | null
          before_item_type?: Database["public"]["Enums"]["item_type"] | null
          child_saga_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          saga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_placement_windows_after_child_saga_id_fkey"
            columns: ["after_child_saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_placement_windows_before_child_saga_id_fkey"
            columns: ["before_child_saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_placement_windows_child_saga_id_fkey"
            columns: ["child_saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_placement_windows_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_route_choices: {
        Row: {
          created_at: string
          route_slug: string
          saga_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          route_slug: string
          saga_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          route_slug?: string
          saga_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_route_choices_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_route_entries: {
        Row: {
          child_saga_id: string | null
          created_at: string
          id: string
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          note: string | null
          position: number
          route_id: string
        }
        Insert: {
          child_saga_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          note?: string | null
          position: number
          route_id: string
        }
        Update: {
          child_saga_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          note?: string | null
          position?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_route_entries_child_saga_id_fkey"
            columns: ["child_saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_route_entries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "saga_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_routes: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          saga_id: string
          slug: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          saga_id: string
          slug: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          saga_id?: string
          slug?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saga_routes_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      sagas: {
        Row: {
          accent_color: string | null
          cover_url: string | null
          created_at: string
          id: string
          name: string
          optional_in_parent: boolean
          overview: string | null
          parent_saga_id: string | null
          placement_in_parent:
            | Database["public"]["Enums"]["saga_placement"]
            | null
          position_in_parent: number | null
          show_map: boolean
          source: string
          tmdb_collection_id: number | null
        }
        Insert: {
          accent_color?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          name: string
          optional_in_parent?: boolean
          overview?: string | null
          parent_saga_id?: string | null
          placement_in_parent?:
            | Database["public"]["Enums"]["saga_placement"]
            | null
          position_in_parent?: number | null
          show_map?: boolean
          source?: string
          tmdb_collection_id?: number | null
        }
        Update: {
          accent_color?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          name?: string
          optional_in_parent?: boolean
          overview?: string | null
          parent_saga_id?: string | null
          placement_in_parent?:
            | Database["public"]["Enums"]["saga_placement"]
            | null
          position_in_parent?: number | null
          show_map?: boolean
          source?: string
          tmdb_collection_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sagas_parent_saga_id_fkey"
            columns: ["parent_saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
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
      club_identities: {
        Row: {
          cover_url: string | null
          description: string | null
          id: string | null
          name: string | null
          slug: string | null
          visibility: Database["public"]["Enums"]["club_visibility"] | null
        }
        Insert: {
          cover_url?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          visibility?: Database["public"]["Enums"]["club_visibility"] | null
        }
        Update: {
          cover_url?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
          visibility?: Database["public"]["Enums"]["club_visibility"] | null
        }
        Relationships: []
      }
      club_stats: {
        Row: {
          club_id: string | null
          member_count: number | null
        }
        Insert: {
          club_id?: string | null
          member_count?: never
        }
        Update: {
          club_id?: string | null
          member_count?: never
        }
        Relationships: []
      }
      pass_reviews: {
        Row: {
          created_at: string | null
          edition_id: string | null
          finished_on: string | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          pinned_order: number | null
          position: Json | null
          rating: number | null
          review: string | null
          started_on: string | null
          status: Database["public"]["Enums"]["media_status"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          edition_id?: string | null
          finished_on?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned_order?: number | null
          position?: Json | null
          rating?: number | null
          review?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["media_status"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          edition_id?: string | null
          finished_on?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned_order?: number | null
          position?: Json | null
          rating?: number | null
          review?: string | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["media_status"] | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      activate_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      activity_window: {
        Args: { p_activity_id: string }
        Returns: {
          window_end: string
          window_start: string
        }[]
      }
      approve_club_join_request: {
        Args: { p_club_id: string; p_user_id: string }
        Returns: undefined
      }
      archive_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      can_view_profile: { Args: { target_user_id: string }; Returns: boolean }
      can_view_target: {
        Args: {
          p_target_id: string
          p_target_type: Database["public"]["Enums"]["target_kind"]
        }
        Returns: boolean
      }
      club_is_private: { Args: { p_club_id: string }; Returns: boolean }
      club_member_row_exists: { Args: { p_club_id: string }; Returns: boolean }
      club_role: {
        Args: { p_club_id: string }
        Returns: Database["public"]["Enums"]["club_role"]
      }
      club_unread_counts: {
        Args: never
        Returns: {
          club_id: string
          unread: number
        }[]
      }
      confirm_checkpoint: {
        Args: { p_checkpoint_id: string }
        Returns: undefined
      }
      create_club: {
        Args: {
          p_cover_url: string
          p_description: string
          p_name: string
          p_slug: string
          p_visibility: Database["public"]["Enums"]["club_visibility"]
        }
        Returns: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          visibility: Database["public"]["Enums"]["club_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_club_event: {
        Args: {
          p_club_id: string
          p_description: string
          p_starts_on: string
          p_title: string
        }
        Returns: string
      }
      create_club_poll: {
        Args: {
          p_club_id: string
          p_ends_at: string
          p_options: string[]
          p_question: string
        }
        Returns: undefined
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      finish_club_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      get_activity_diary_passes: {
        Args: { p_activity_id: string }
        Returns: {
          finished_on: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          user_id: string
        }[]
      }
      get_list_challenge_progress: {
        Args: { p_activity_id: string }
        Returns: {
          completed_on: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          user_id: string
        }[]
      }
      has_min_club_role: {
        Args: {
          min: Database["public"]["Enums"]["club_role"]
          p_club_id: string
        }
        Returns: boolean
      }
      has_min_role: {
        Args: { min: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      has_reached_checkpoint: {
        Args: { p_checkpoint_id: string }
        Returns: boolean
      }
      has_voted_in_club_poll: { Args: { p_post_id: string }; Returns: boolean }
      hydrate_book: {
        Args: {
          p_book_id: string
          p_cover_url?: string
          p_genres?: string[]
          p_synopsis?: string
        }
        Returns: undefined
      }
      is_activity_participant: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      is_club_member: { Args: { p_club_id: string }; Returns: boolean }
      is_visible_via_club_share: {
        Args: { p_owner_id: string; p_row_id: string; p_source_table: string }
        Returns: boolean
      }
      link_tmdb_saga_item: {
        Args: { p_item_id: string; p_saga_id: string }
        Returns: undefined
      }
      notify_club_join_request: {
        Args: { p_club_id: string }
        Returns: undefined
      }
      profile_is_public: { Args: { target_user_id: string }; Returns: boolean }
      register_book_edition: {
        Args: {
          p_book_id: string
          p_cover_url?: string
          p_isbn: string
          p_label?: string
          p_pages?: number
          p_publisher?: string
          p_year?: number
        }
        Returns: string
      }
      reorder_activity_checkpoints: {
        Args: { p_activity_id: string; p_checkpoint_ids: string[] }
        Returns: undefined
      }
      resolve_pending_import: {
        Args: { p_catalog_item_id: string; p_pending_id: string }
        Returns: undefined
      }
      sane_int: { Args: { hi: number; lo: number; v: number }; Returns: number }
      save_saga_route: {
        Args: { p_entries: Json; p_route_id: string }
        Returns: undefined
      }
      save_saga_sequence: {
        Args: {
          p_blocks: Json
          p_entries: Json
          p_removed: Json
          p_saga_id: string
          p_windows: Json
        }
        Returns: undefined
      }
      set_activity_completion_mode: {
        Args: { p_activity_id: string; p_mode: string }
        Returns: undefined
      }
      set_club_member_role: {
        Args: {
          p_club_id: string
          p_role: Database["public"]["Enums"]["club_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      spawn_linked_activity: {
        Args: {
          p_from_item_id: string
          p_from_item_type: Database["public"]["Enums"]["item_type"]
          p_kind: Database["public"]["Enums"]["activity_kind"]
          p_parent_activity_id: string
          p_title: string
        }
        Returns: string
      }
      sync_tmdb_saga_items: {
        Args: { p_items: Json; p_saga_id: string }
        Returns: undefined
      }
      transfer_club_ownership: {
        Args: { p_club_id: string; p_new_owner_id: string }
        Returns: undefined
      }
      update_activity_config: {
        Args: { p_activity_id: string; p_config: Json }
        Returns: undefined
      }
      update_club_event: {
        Args: {
          p_activity_id: string
          p_description: string
          p_starts_on: string
          p_title: string
        }
        Returns: undefined
      }
      vote_club_poll: {
        Args: { p_option_id: string; p_post_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_kind:
        | "buddy_read"
        | "tierlist"
        | "list_challenge"
        | "criteria_challenge"
        | "evento"
      activity_status: "proposed" | "active" | "finished" | "archived"
      club_member_status: "invited" | "active" | "requested"
      club_post_kind: "text" | "activity_share" | "poll"
      club_role: "member" | "moderator" | "owner"
      club_visibility: "public" | "private"
      follow_status: "pending" | "accepted"
      item_type: "book" | "movie" | "series"
      media_status: "planned" | "in_progress" | "completed" | "dropped"
      notification_type:
        | "follow_request"
        | "new_follower"
        | "follow_accepted"
        | "review_liked"
        | "review_commented"
        | "club_join_request"
        | "club_join_approved"
        | "club_invite"
        | "club_invite_accepted"
        | "club_post"
        | "club_post_liked"
        | "club_post_commented"
        | "comment_liked"
        | "club_activity_proposed"
        | "club_activity_activated"
        | "club_activity_spawned"
        | "club_event_created"
      pending_import_status: "pending" | "resolved" | "dismissed"
      push_channel: "web"
      saga_item_role: "precuela" | "spin_off" | "relato" | "paralela"
      saga_placement: "fijo" | "libre"
      target_kind:
        | "diary_entry"
        | "episode_watch"
        | "club_post"
        | "comment"
        | "activity_checkpoint"
        | "club_activity"
      user_role: "user" | "collaborator" | "admin"
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
      activity_kind: [
        "buddy_read",
        "tierlist",
        "list_challenge",
        "criteria_challenge",
        "evento",
      ],
      activity_status: ["proposed", "active", "finished", "archived"],
      club_member_status: ["invited", "active", "requested"],
      club_post_kind: ["text", "activity_share", "poll"],
      club_role: ["member", "moderator", "owner"],
      club_visibility: ["public", "private"],
      follow_status: ["pending", "accepted"],
      item_type: ["book", "movie", "series"],
      media_status: ["planned", "in_progress", "completed", "dropped"],
      notification_type: [
        "follow_request",
        "new_follower",
        "follow_accepted",
        "review_liked",
        "review_commented",
        "club_join_request",
        "club_join_approved",
        "club_invite",
        "club_invite_accepted",
        "club_post",
        "club_post_liked",
        "club_post_commented",
        "comment_liked",
        "club_activity_proposed",
        "club_activity_activated",
        "club_activity_spawned",
        "club_event_created",
      ],
      pending_import_status: ["pending", "resolved", "dismissed"],
      push_channel: ["web"],
      saga_item_role: ["precuela", "spin_off", "relato", "paralela"],
      saga_placement: ["fijo", "libre"],
      target_kind: [
        "diary_entry",
        "episode_watch",
        "club_post",
        "comment",
        "activity_checkpoint",
        "club_activity",
      ],
      user_role: ["user", "collaborator", "admin"],
    },
  },
} as const
