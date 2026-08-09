export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          reason: string | null
          request_metadata: Json
          requested_at: string
          scheduled_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          reason?: string | null
          request_metadata?: Json
          requested_at?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          reason?: string | null
          request_metadata?: Json
          requested_at?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      achievement_progress: {
        Row: {
          achievement_id: string
          created_at: string
          current_value: number
          game_id: string
          id: string
          progress: number
          target_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          current_value?: number
          game_id: string
          id?: string
          progress?: number
          target_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          current_value?: number
          game_id?: string
          id?: string
          progress?: number
          target_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_progress_achievement_game_fk"
            columns: ["achievement_id", "game_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id", "game_id"]
          },
          {
            foreignKeyName: "achievement_progress_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "achievement_progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          created_at: string
          description: string | null
          game_id: string
          icon_url: string | null
          id: string
          is_active: boolean
          is_hidden: boolean
          key: string
          name: string
          points: number
          rarity: string
          rarity_percent: number | null
          source_provider: string | null
          source_synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          game_id: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_hidden?: boolean
          key: string
          name: string
          points?: number
          rarity?: string
          rarity_percent?: number | null
          source_provider?: string | null
          source_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          game_id?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_hidden?: boolean
          key?: string
          name?: string
          points?: number
          rarity?: string
          rarity_percent?: number | null
          source_provider?: string | null
          source_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_comment_deletions: {
        Row: {
          activity_id: string
          comment_id: string
          deleted_at: string
          event_id: string
        }
        Insert: {
          activity_id: string
          comment_id: string
          deleted_at?: string
          event_id?: string
        }
        Update: {
          activity_id?: string
          comment_id?: string
          deleted_at?: string
          event_id?: string
        }
        Relationships: []
      }
      activity_comments: {
        Row: {
          activity_id: string
          author_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          activity_id: string
          author_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          activity_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_feed: {
        Row: {
          achievement_name: string | null
          created_at: string
          game_id: string | null
          game_title: string | null
          id: string
          metadata: Json
          source_key: string | null
          type: string
          user_id: string
          visibility: string
        }
        Insert: {
          achievement_name?: string | null
          created_at?: string
          game_id?: string | null
          game_title?: string | null
          id?: string
          metadata?: Json
          source_key?: string | null
          type: string
          user_id: string
          visibility?: string
        }
        Update: {
          achievement_name?: string | null
          created_at?: string
          game_id?: string | null
          game_title?: string | null
          id?: string
          metadata?: Json
          source_key?: string | null
          type?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "activity_feed_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reactions: {
        Row: {
          activity_id: string
          created_at: string
          reaction: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          reaction?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          room_id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          room_id: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          room_id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          joined_at: string
          last_read_at: string | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          last_read_at?: string | null
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          last_read_at?: string | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string
          dm_pair_key: string | null
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dm_pair_key?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dm_pair_key?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_artwork_items: {
        Row: {
          approved_at: string | null
          artist_name: string
          created_at: string
          description: string
          download_count: number
          game_id: string
          id: string
          kind: string
          moderation_reason: string | null
          moderation_status: string
          rejected_at: string | null
          report_count: number
          source_url: string
          storage_path: string | null
          submitter_id: string
          tags: string[]
          title: string
          updated_at: string
          vote_score: number
        }
        Insert: {
          approved_at?: string | null
          artist_name: string
          created_at?: string
          description?: string
          download_count?: number
          game_id: string
          id?: string
          kind: string
          moderation_reason?: string | null
          moderation_status?: string
          rejected_at?: string | null
          report_count?: number
          source_url: string
          storage_path?: string | null
          submitter_id: string
          tags?: string[]
          title: string
          updated_at?: string
          vote_score?: number
        }
        Update: {
          approved_at?: string | null
          artist_name?: string
          created_at?: string
          description?: string
          download_count?: number
          game_id?: string
          id?: string
          kind?: string
          moderation_reason?: string | null
          moderation_status?: string
          rejected_at?: string | null
          report_count?: number
          source_url?: string
          storage_path?: string | null
          submitter_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          vote_score?: number
        }
        Relationships: []
      }
      community_artwork_reports: {
        Row: {
          artwork_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          artwork_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          artwork_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_artwork_reports_artwork_id_fkey"
            columns: ["artwork_id"]
            isOneToOne: false
            referencedRelation: "community_artwork_items"
            referencedColumns: ["id"]
          },
        ]
      }
      community_artwork_votes: {
        Row: {
          artwork_id: string
          created_at: string
          updated_at: string
          user_id: string
          vote: number
        }
        Insert: {
          artwork_id: string
          created_at?: string
          updated_at?: string
          user_id: string
          vote: number
        }
        Update: {
          artwork_id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
          vote?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_artwork_votes_artwork_id_fkey"
            columns: ["artwork_id"]
            isOneToOne: false
            referencedRelation: "community_artwork_items"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_applications: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
          studio_name: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          studio_name: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          studio_name?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      family_groups: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          max_members: number
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          max_members?: number
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          max_members?: number
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          family_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          family_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          family_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_games: {
        Row: {
          current_user_id: string | null
          family_id: string
          game_id: string
          id: string
          is_available: boolean
          shared_at: string
          shared_by_user_id: string
        }
        Insert: {
          current_user_id?: string | null
          family_id: string
          game_id: string
          id?: string
          is_available?: boolean
          shared_at?: string
          shared_by_user_id: string
        }
        Update: {
          current_user_id?: string | null
          family_id?: string
          game_id?: string
          id?: string
          is_available?: boolean
          shared_at?: string
          shared_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_games_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_shared_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "family_shared_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_links: {
        Row: {
          created_at: string
          dismissed: boolean
          id: string
          match_method: string | null
          matched_user_id: string | null
          merge_group_id: string | null
          owner_id: string
          platform: string
          platform_friend_avatar: string | null
          platform_friend_id: string
          platform_friend_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissed?: boolean
          id?: string
          match_method?: string | null
          matched_user_id?: string | null
          merge_group_id?: string | null
          owner_id: string
          platform: string
          platform_friend_avatar?: string | null
          platform_friend_id: string
          platform_friend_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissed?: boolean
          id?: string
          match_method?: string | null
          matched_user_id?: string | null
          merge_group_id?: string | null
          owner_id?: string
          platform?: string
          platform_friend_avatar?: string | null
          platform_friend_id?: string
          platform_friend_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      friend_merge_suggestions: {
        Row: {
          confidence: number
          created_at: string
          friend_link_a: string
          friend_link_b: string | null
          id: string
          reason: string | null
          status: string
          suggested_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          friend_link_a: string
          friend_link_b?: string | null
          id?: string
          reason?: string | null
          status?: string
          suggested_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          friend_link_a?: string
          friend_link_b?: string | null
          id?: string
          reason?: string | null
          status?: string
          suggested_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_merge_suggestions_friend_link_a_fkey"
            columns: ["friend_link_a"]
            isOneToOne: false
            referencedRelation: "friend_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_merge_suggestions_friend_link_b_fkey"
            columns: ["friend_link_b"]
            isOneToOne: false
            referencedRelation: "friend_links"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requested_at: string
          requester_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requested_at?: string
          requester_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requested_at?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_categories: {
        Row: {
          category_id: string
          game_id: string
        }
        Insert: {
          category_id: string
          game_id: string
        }
        Update: {
          category_id?: string
          game_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_categories_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_categories_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_cross_play: {
        Row: {
          created_at: string
          game_id: string
          id: string
          is_enabled: boolean
          is_verified: boolean
          metadata: Json
          notes: string | null
          platform: string
          updated_at: string
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          is_enabled?: boolean
          is_verified?: boolean
          metadata?: Json
          notes?: string | null
          platform: string
          updated_at?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          is_enabled?: boolean
          is_verified?: boolean
          metadata?: Json
          notes?: string | null
          platform?: string
          updated_at?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_cross_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_cross_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_cross_play_reports: {
        Row: {
          created_at: string
          description: string | null
          from_platform: string
          game_id: string
          id: string
          issue: string
          reporter_id: string
          status: string
          to_platform: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          from_platform: string
          game_id: string
          id?: string
          issue: string
          reporter_id: string
          status?: string
          to_platform: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          from_platform?: string
          game_id?: string
          id?: string
          issue?: string
          reporter_id?: string
          status?: string
          to_platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_cross_play_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_cross_play_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_invites: {
        Row: {
          created_at: string
          expires_at: string
          game_id: string | null
          game_title: string
          id: string
          launch_uri: string | null
          message: string | null
          receiver_id: string | null
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          game_id?: string | null
          game_title: string
          id?: string
          launch_uri?: string | null
          message?: string | null
          receiver_id?: string | null
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          game_id?: string | null
          game_title?: string
          id?: string
          launch_uri?: string | null
          message?: string | null
          receiver_id?: string | null
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          game_id: string
          id: string
          launcher_device_id: string | null
          platform: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          game_id: string
          id?: string
          launcher_device_id?: string | null
          platform?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          game_id?: string
          id?: string
          launcher_device_id?: string | null
          platform?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tags: {
        Row: {
          game_id: string
          tag_id: string
        }
        Insert: {
          game_id: string
          tag_id: string
        }
        Update: {
          game_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          banner_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          developer_name: string | null
          external_ids: Json
          icon_url: string | null
          id: string
          publisher_name: string | null
          release_date: string | null
          short_description: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          developer_name?: string | null
          external_ids?: Json
          icon_url?: string | null
          id?: string
          publisher_name?: string | null
          release_date?: string | null
          short_description?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          developer_name?: string | null
          external_ids?: Json
          icon_url?: string | null
          id?: string
          publisher_name?: string | null
          release_date?: string | null
          short_description?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      launcher_local_entities: {
        Row: {
          created_at: string
          deleted_at: string | null
          device_id: string
          entity: Json
          entity_id: string
          id: string
          kind: string
          last_synced_at: string
          local_updated_at: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          device_id: string
          entity: Json
          entity_id: string
          id?: string
          kind: string
          last_synced_at?: string
          local_updated_at: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          device_id?: string
          entity?: Json
          entity_id?: string
          id?: string
          kind?: string
          last_synced_at?: string
          local_updated_at?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mod_catalog_dependencies: {
        Row: {
          catalog_mod_id: string
          depends_on_catalog_mod_id: string
          id: string
          is_optional: boolean
          required_version: string | null
        }
        Insert: {
          catalog_mod_id: string
          depends_on_catalog_mod_id: string
          id?: string
          is_optional?: boolean
          required_version?: string | null
        }
        Update: {
          catalog_mod_id?: string
          depends_on_catalog_mod_id?: string
          id?: string
          is_optional?: boolean
          required_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_catalog_dependencies_catalog_mod_id_fkey"
            columns: ["catalog_mod_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mod_catalog_dependencies_depends_on_catalog_mod_id_fkey"
            columns: ["depends_on_catalog_mod_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_catalog_entries: {
        Row: {
          author: string | null
          banner_url: string | null
          categories: string[]
          created_at: string
          description: string | null
          external_id: string | null
          game_id: string | null
          icon_url: string | null
          id: string
          local_game_id: string | null
          metadata: Json
          name: string
          provider: string
          slug: string
          source_url: string | null
          status: string
          summary: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          author?: string | null
          banner_url?: string | null
          categories?: string[]
          created_at?: string
          description?: string | null
          external_id?: string | null
          game_id?: string | null
          icon_url?: string | null
          id?: string
          local_game_id?: string | null
          metadata?: Json
          name: string
          provider: string
          slug: string
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          author?: string | null
          banner_url?: string | null
          categories?: string[]
          created_at?: string
          description?: string | null
          external_id?: string | null
          game_id?: string | null
          icon_url?: string | null
          id?: string
          local_game_id?: string | null
          metadata?: Json
          name?: string
          provider?: string
          slug?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_catalog_entries_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "mod_catalog_entries_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_catalog_files: {
        Row: {
          catalog_version_id: string
          created_at: string
          file_name: string
          id: string
          relative_path: string
          sha256: string | null
          size_bytes: number
          storage_path: string | null
        }
        Insert: {
          catalog_version_id: string
          created_at?: string
          file_name: string
          id?: string
          relative_path: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
        }
        Update: {
          catalog_version_id?: string
          created_at?: string
          file_name?: string
          id?: string
          relative_path?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_catalog_files_catalog_version_id_fkey"
            columns: ["catalog_version_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_catalog_versions: {
        Row: {
          catalog_mod_id: string
          changelog: string | null
          created_at: string
          download_url: string | null
          file_size_bytes: number
          id: string
          install_strategy: string
          is_latest: boolean
          metadata: Json
          sha256: string | null
          status: string
          storage_path: string | null
          version: string
        }
        Insert: {
          catalog_mod_id: string
          changelog?: string | null
          created_at?: string
          download_url?: string | null
          file_size_bytes?: number
          id?: string
          install_strategy?: string
          is_latest?: boolean
          metadata?: Json
          sha256?: string | null
          status?: string
          storage_path?: string | null
          version: string
        }
        Update: {
          catalog_mod_id?: string
          changelog?: string | null
          created_at?: string
          download_url?: string | null
          file_size_bytes?: number
          id?: string
          install_strategy?: string
          is_latest?: boolean
          metadata?: Json
          sha256?: string | null
          status?: string
          storage_path?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_catalog_versions_catalog_mod_id_fkey"
            columns: ["catalog_mod_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_dependencies: {
        Row: {
          depends_on_mod_id: string
          id: string
          is_optional: boolean
          mod_id: string
          required_version: string | null
        }
        Insert: {
          depends_on_mod_id: string
          id?: string
          is_optional?: boolean
          mod_id: string
          required_version?: string | null
        }
        Update: {
          depends_on_mod_id?: string
          id?: string
          is_optional?: boolean
          mod_id?: string
          required_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_dependencies_depends_on_mod_id_fkey"
            columns: ["depends_on_mod_id"]
            isOneToOne: false
            referencedRelation: "mods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mod_dependencies_mod_id_fkey"
            columns: ["mod_id"]
            isOneToOne: false
            referencedRelation: "mods"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mod_version_id: string
          relative_path: string
          sha256: string | null
          size_bytes: number
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mod_version_id: string
          relative_path: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mod_version_id?: string
          relative_path?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_files_mod_version_id_fkey"
            columns: ["mod_version_id"]
            isOneToOne: false
            referencedRelation: "mod_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_profiles: {
        Row: {
          created_at: string
          game_id: string
          id: string
          is_active: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          is_active?: boolean
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          is_active?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      mod_provider_game_mappings: {
        Row: {
          confidence: string
          created_at: string
          created_by: string | null
          game_id: string | null
          game_title: string | null
          id: string
          local_game_id: string
          metadata: Json
          provider: string
          provider_game_id: string
          source: string
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          confidence?: string
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          game_title?: string | null
          id?: string
          local_game_id: string
          metadata?: Json
          provider: string
          provider_game_id: string
          source?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          confidence?: string
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          game_title?: string | null
          id?: string
          local_game_id?: string
          metadata?: Json
          provider?: string
          provider_game_id?: string
          source?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_provider_game_mappings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "mod_provider_game_mappings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_reviews: {
        Row: {
          created_at: string
          id: string
          mod_id: string
          rating: number
          review: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mod_id: string
          rating: number
          review?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mod_id?: string
          rating?: number
          review?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_reviews_mod_id_fkey"
            columns: ["mod_id"]
            isOneToOne: false
            referencedRelation: "mods"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_versions: {
        Row: {
          changelog: string | null
          created_at: string
          download_url: string | null
          file_size_bytes: number
          id: string
          is_latest: boolean
          mod_id: string
          sha256: string | null
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          download_url?: string | null
          file_size_bytes?: number
          id?: string
          is_latest?: boolean
          mod_id: string
          sha256?: string | null
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          download_url?: string | null
          file_size_bytes?: number
          id?: string
          is_latest?: boolean
          mod_id?: string
          sha256?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_versions_mod_id_fkey"
            columns: ["mod_id"]
            isOneToOne: false
            referencedRelation: "mods"
            referencedColumns: ["id"]
          },
        ]
      }
      mods: {
        Row: {
          author: string | null
          category: string | null
          created_at: string
          current_version_id: string | null
          description: string | null
          enabled: boolean
          game_id: string | null
          game_title: string
          id: string
          installed_at: string
          load_order: number
          name: string
          profile_id: string | null
          source: string
          source_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          enabled?: boolean
          game_id?: string | null
          game_title: string
          id?: string
          installed_at?: string
          load_order?: number
          name: string
          profile_id?: string | null
          source?: string
          source_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string | null
          category?: string | null
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          enabled?: boolean
          game_id?: string | null
          game_title?: string
          id?: string
          installed_at?: string
          load_order?: number
          name?: string
          profile_id?: string | null
          source?: string
          source_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mods_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "mods_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mods_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "mod_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          author_id: string
          body: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          game_id: string | null
          id: string
          is_published: boolean
          published_at: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          game_id?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          game_id?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "news_items_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_settings: {
        Row: {
          created_at: string
          hotkey: string
          id: string
          is_enabled: boolean
          opacity: number
          position: string
          shortcuts: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hotkey?: string
          id?: string
          is_enabled?: boolean
          opacity?: number
          position?: string
          shortcuts?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hotkey?: string
          id?: string
          is_enabled?: boolean
          opacity?: number
          position?: string
          shortcuts?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_sessions: {
        Row: {
          avg_cpu_percent: number
          avg_fps: number | null
          avg_gpu_percent: number | null
          avg_ram_mb: number
          created_at: string
          duration_seconds: number
          ended_at: string
          game_id: string
          id: string
          max_cpu_percent: number
          max_fps: number | null
          max_gpu_percent: number | null
          max_ram_mb: number
          sample_count: number
          started_at: string
          user_id: string
        }
        Insert: {
          avg_cpu_percent: number
          avg_fps?: number | null
          avg_gpu_percent?: number | null
          avg_ram_mb: number
          created_at?: string
          duration_seconds: number
          ended_at: string
          game_id: string
          id?: string
          max_cpu_percent: number
          max_fps?: number | null
          max_gpu_percent?: number | null
          max_ram_mb: number
          sample_count: number
          started_at: string
          user_id: string
        }
        Update: {
          avg_cpu_percent?: number
          avg_fps?: number | null
          avg_gpu_percent?: number | null
          avg_ram_mb?: number
          created_at?: string
          duration_seconds?: number
          ended_at?: string
          game_id?: string
          id?: string
          max_cpu_percent?: number
          max_fps?: number | null
          max_gpu_percent?: number | null
          max_ram_mb?: number
          sample_count?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_snapshots: {
        Row: {
          cpu_percent: number
          created_at: string
          disk_read_mbps: number | null
          disk_write_mbps: number | null
          duration_seconds: number | null
          fps: number | null
          frame_time_ms: number | null
          game_id: string
          gpu_percent: number | null
          gpu_temp_c: number | null
          id: string
          network_down_kbps: number | null
          network_up_kbps: number | null
          ram_mb: number
          user_id: string
        }
        Insert: {
          cpu_percent: number
          created_at?: string
          disk_read_mbps?: number | null
          disk_write_mbps?: number | null
          duration_seconds?: number | null
          fps?: number | null
          frame_time_ms?: number | null
          game_id: string
          gpu_percent?: number | null
          gpu_temp_c?: number | null
          id?: string
          network_down_kbps?: number | null
          network_up_kbps?: number | null
          ram_mb: number
          user_id: string
        }
        Update: {
          cpu_percent?: number
          created_at?: string
          disk_read_mbps?: number | null
          disk_write_mbps?: number | null
          duration_seconds?: number | null
          fps?: number | null
          frame_time_ms?: number | null
          game_id?: string
          gpu_percent?: number | null
          gpu_temp_c?: number | null
          id?: string
          network_down_kbps?: number | null
          network_up_kbps?: number | null
          ram_mb?: number
          user_id?: string
        }
        Relationships: []
      }
      platform_accounts: {
        Row: {
          created_at: string
          id: string
          linked_at: string
          metadata: Json
          platform: string
          platform_avatar_url: string | null
          platform_user_id: string
          platform_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_at?: string
          metadata?: Json
          platform: string
          platform_avatar_url?: string | null
          platform_user_id: string
          platform_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_at?: string
          metadata?: Json
          platform?: string
          platform_avatar_url?: string | null
          platform_user_id?: string
          platform_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          created_at: string
          game_id: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          platform: string
          target_price_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          platform: string
          target_price_cents: number
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          platform?: string
          target_price_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "price_alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          parent_comment_id: string | null
          profile_user_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          parent_comment_id?: string | null
          profile_user_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          parent_comment_id?: string | null
          profile_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "profile_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          birthdate: string | null
          created_at: string
          marketing_emails_enabled: boolean
          phone: string | null
          real_name: string | null
          security_emails_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          birthdate?: string | null
          created_at?: string
          marketing_emails_enabled?: boolean
          phone?: string | null
          real_name?: string | null
          security_emails_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          birthdate?: string | null
          created_at?: string
          marketing_emails_enabled?: boolean
          phone?: string | null
          real_name?: string | null
          security_emails_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_showcases: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          sort_order: number
          title: string | null
          type: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          sort_order?: number
          title?: string | null
          type: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          sort_order?: number
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      profile_themes: {
        Row: {
          accent_color: string | null
          background_type: string
          background_value: string | null
          card_style: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_premium: boolean
          key: string
          name: string
          text_color: string | null
        }
        Insert: {
          accent_color?: string | null
          background_type?: string
          background_value?: string | null
          card_style?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          key: string
          name: string
          text_color?: string | null
        }
        Update: {
          accent_color?: string | null
          background_type?: string
          background_value?: string | null
          card_style?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          key?: string
          name?: string
          text_color?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          achievement_visibility: string
          app_shell_skin: string | null
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          comments_visibility: string
          country_code: string | null
          created_at: string
          custom_theme_json: Json | null
          display_name: string | null
          featured_achievement_id: string | null
          featured_badge_id: string | null
          featured_game_id: string | null
          game_activity_visibility: string
          id: string
          is_banned: boolean
          is_deleted: boolean
          language: string | null
          last_seen_at: string | null
          library_visibility: string
          online_status_visibility: string
          profile_level: number
          profile_theme_id: string | null
          profile_visibility: string
          profile_xp: number
          timezone: string | null
          updated_at: string
          username: string
          wishlist_visibility: string
        }
        Insert: {
          achievement_visibility?: string
          app_shell_skin?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          comments_visibility?: string
          country_code?: string | null
          created_at?: string
          custom_theme_json?: Json | null
          display_name?: string | null
          featured_achievement_id?: string | null
          featured_badge_id?: string | null
          featured_game_id?: string | null
          game_activity_visibility?: string
          id: string
          is_banned?: boolean
          is_deleted?: boolean
          language?: string | null
          last_seen_at?: string | null
          library_visibility?: string
          online_status_visibility?: string
          profile_level?: number
          profile_theme_id?: string | null
          profile_visibility?: string
          profile_xp?: number
          timezone?: string | null
          updated_at?: string
          username: string
          wishlist_visibility?: string
        }
        Update: {
          achievement_visibility?: string
          app_shell_skin?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          comments_visibility?: string
          country_code?: string | null
          created_at?: string
          custom_theme_json?: Json | null
          display_name?: string | null
          featured_achievement_id?: string | null
          featured_badge_id?: string | null
          featured_game_id?: string | null
          game_activity_visibility?: string
          id?: string
          is_banned?: boolean
          is_deleted?: boolean
          language?: string | null
          last_seen_at?: string | null
          library_visibility?: string
          online_status_visibility?: string
          profile_level?: number
          profile_theme_id?: string | null
          profile_visibility?: string
          profile_xp?: number
          timezone?: string | null
          updated_at?: string
          username?: string
          wishlist_visibility?: string
        }
        Relationships: []
      }
      rawg_asset_cache: {
        Row: {
          cover_url: string | null
          fetched_at: string
          icon_url: string | null
          logo_url: string | null
          normalized_title: string
          status: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          fetched_at?: string
          icon_url?: string | null
          logo_url?: string | null
          normalized_title: string
          status?: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          fetched_at?: string
          icon_url?: string | null
          logo_url?: string | null
          normalized_title?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      share_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          game_invite_id: string
          game_title: string
          id: string
          max_uses: number | null
          platform: string | null
          revoked_at: string | null
          token_hash: string
          token_hint: string
          updated_at: string
          used_at: string | null
          uses_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          game_invite_id: string
          game_title: string
          id?: string
          max_uses?: number | null
          platform?: string | null
          revoked_at?: string | null
          token_hash: string
          token_hint: string
          updated_at?: string
          used_at?: string | null
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          game_invite_id?: string
          game_title?: string
          id?: string
          max_uses?: number | null
          platform?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_hint?: string
          updated_at?: string
          used_at?: string | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_tokens_game_invite_id_fkey"
            columns: ["game_invite_id"]
            isOneToOne: false
            referencedRelation: "game_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      store_builds: {
        Row: {
          arch: string
          changelog: string | null
          created_at: string
          file_name: string
          id: string
          is_latest: boolean
          platform: string
          product_id: string
          sha256: string | null
          size_bytes: number
          storage_path: string
          uploaded_at: string
          version: string
        }
        Insert: {
          arch?: string
          changelog?: string | null
          created_at?: string
          file_name: string
          id?: string
          is_latest?: boolean
          platform: string
          product_id: string
          sha256?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_at?: string
          version: string
        }
        Update: {
          arch?: string
          changelog?: string | null
          created_at?: string
          file_name?: string
          id?: string
          is_latest?: boolean
          platform?: string
          product_id?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_builds_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_cart_items: {
        Row: {
          added_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_customers: {
        Row: {
          created_at: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_licenses: {
        Row: {
          activations_left: number
          created_at: string
          device_id: string | null
          expires_at: string | null
          id: string
          is_revoked: boolean
          license_key: string
          order_id: string | null
          platform: string
          product_id: string
          user_id: string
        }
        Insert: {
          activations_left?: number
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          is_revoked?: boolean
          license_key: string
          order_id?: string | null
          platform: string
          product_id: string
          user_id: string
        }
        Update: {
          activations_left?: number
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          is_revoked?: boolean
          license_key?: string
          order_id?: string | null
          platform?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_licenses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_licenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_invoices: {
        Row: {
          created_at: string
          hosted_invoice_url: string | null
          id: string
          invoice_number: string | null
          issued_at: string | null
          metadata: Json
          order_id: string
          pdf_url: string | null
          provider: string
          provider_invoice_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          metadata?: Json
          order_id: string
          pdf_url?: string | null
          provider?: string
          provider_invoice_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          metadata?: Json
          order_id?: string
          pdf_url?: string | null
          provider?: string
          provider_invoice_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_items: {
        Row: {
          id: string
          order_id: string
          price_cents_snapshot: number
          product_id: string
          quantity: number
          title_snapshot: string
        }
        Insert: {
          id?: string
          order_id: string
          price_cents_snapshot: number
          product_id: string
          quantity: number
          title_snapshot: string
        }
        Update: {
          id?: string
          order_id?: string
          price_cents_snapshot?: number
          product_id?: string
          quantity?: number
          title_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_refund_requests: {
        Row: {
          cancelled_at: string | null
          created_at: string
          details: string | null
          failure_reason: string | null
          id: string
          metadata: Json
          order_id: string
          processed_at: string | null
          provider: string
          provider_refund_id: string | null
          provider_refund_status: string | null
          reason: string
          refund_amount_cents: number | null
          requested_at: string
          reviewed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          details?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          order_id: string
          processed_at?: string | null
          provider?: string
          provider_refund_id?: string | null
          provider_refund_status?: string | null
          reason: string
          refund_amount_cents?: number | null
          requested_at?: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          details?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          order_id?: string
          processed_at?: string | null
          provider?: string
          provider_refund_id?: string | null
          provider_refund_status?: string | null
          reason?: string
          refund_amount_cents?: number | null
          requested_at?: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          checkout_attempt_id: string | null
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          payment_method: string | null
          status: string
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_attempt_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_attempt_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_stripe_webhook_events: {
        Row: {
          error_message: string | null
          event_type: string
          id: string
          processed_at: string | null
          processing_status: string
          received_at: string
          updated_at: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          id: string
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          updated_at?: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_price_alerts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          product_id: string
          target_price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          product_id: string
          target_price_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          product_id?: string
          target_price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_price_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_catalog: {
        Row: {
          id: string
          external_id: string
          source: string
          title: string
          slug: string
          description: string | null
          short_description: string | null
          publisher: string | null
          release_date: string | null
          genres: string[]
          tags: string[]
          platforms: string[]
          price_cents: number
          discount_percent: number
          cover_image_url: string | null
          rating: number | null
          ratings_count: number
          downloads_count: number
          metadata: Json
          last_synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          external_id: string
          source: string
          title: string
          slug: string
          description?: string | null
          short_description?: string | null
          publisher?: string | null
          release_date?: string | null
          genres?: string[]
          tags?: string[]
          platforms?: string[]
          price_cents?: number
          discount_percent?: number
          cover_image_url?: string | null
          rating?: number | null
          ratings_count?: number
          downloads_count?: number
          metadata?: Json
          last_synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          external_id?: string
          source?: string
          title?: string
          slug?: string
          description?: string | null
          short_description?: string | null
          publisher?: string | null
          release_date?: string | null
          genres?: string[]
          tags?: string[]
          platforms?: string[]
          price_cents?: number
          discount_percent?: number
          cover_image_url?: string | null
          rating?: number | null
          ratings_count?: number
          downloads_count?: number
          metadata?: Json
          last_synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_products: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          developer_id: string
          discount_percent: number
          downloads_count: number
          genres: string[]
          id: string
          metadata: Json
          min_system_requirements: Json
          platforms: string[]
          price_cents: number
          publisher: string | null
          rating: number | null
          ratings_count: number
          rec_system_requirements: Json
          release_date: string | null
          short_description: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          trailer_url: string | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          developer_id: string
          discount_percent?: number
          downloads_count?: number
          genres?: string[]
          id?: string
          metadata?: Json
          min_system_requirements?: Json
          platforms?: string[]
          price_cents?: number
          publisher?: string | null
          rating?: number | null
          ratings_count?: number
          rec_system_requirements?: Json
          release_date?: string | null
          short_description?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          trailer_url?: string | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          developer_id?: string
          discount_percent?: number
          downloads_count?: number
          genres?: string[]
          id?: string
          metadata?: Json
          min_system_requirements?: Json
          platforms?: string[]
          price_cents?: number
          publisher?: string | null
          rating?: number | null
          ratings_count?: number
          rec_system_requirements?: Json
          release_date?: string | null
          short_description?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          trailer_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_review_replies: {
        Row: {
          body: string
          created_at: string
          developer_user_id: string
          id: string
          product_id: string
          review_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          developer_user_id: string
          id?: string
          product_id: string
          review_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          developer_user_id?: string
          id?: string
          product_id?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_review_replies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "store_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      store_review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_user_id: string
          review_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_user_id: string
          review_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string
          review_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "store_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      store_reviews: {
        Row: {
          body: string | null
          created_at: string
          hidden_by_reports_at: string | null
          id: string
          is_hidden_by_reports: boolean
          is_published: boolean
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          hidden_by_reports_at?: string | null
          id?: string
          is_hidden_by_reports?: boolean
          is_published?: boolean
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          hidden_by_reports_at?: string | null
          id?: string
          is_hidden_by_reports?: boolean
          is_published?: boolean
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_wishlist: {
        Row: {
          added_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          game_id: string
          id: string
          metadata: Json
          progress: number
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          game_id: string
          id?: string
          metadata?: Json
          progress?: number
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          game_id?: string
          id?: string
          metadata?: Json
          progress?: number
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_game_fk"
            columns: ["achievement_id", "game_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id", "game_id"]
          },
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_achievements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity: {
        Row: {
          achievement_id: string | null
          created_at: string
          data: Json
          game_id: string | null
          id: string
          type: string
          user_id: string
          visibility: string
        }
        Insert: {
          achievement_id?: string | null
          created_at?: string
          data?: Json
          game_id?: string | null
          id?: string
          type: string
          user_id: string
          visibility?: string
        }
        Update: {
          achievement_id?: string | null
          created_at?: string
          data?: Json
          game_id?: string | null
          id?: string
          type?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_activity_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          description: string | null
          earned_at: string
          icon_url: string | null
          id: string
          key: string
          name: string
          rarity: string
          source: string
          user_id: string
        }
        Insert: {
          description?: string | null
          earned_at?: string
          icon_url?: string | null
          id?: string
          key: string
          name: string
          rarity?: string
          source?: string
          user_id: string
        }
        Update: {
          description?: string | null
          earned_at?: string
          icon_url?: string | null
          id?: string
          key?: string
          name?: string
          rarity?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_ip: unknown
          last_seen_at: string | null
          launcher_version: string | null
          machine_fingerprint_hash: string | null
          os_version: string | null
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_ip?: unknown
          last_seen_at?: string | null
          launcher_version?: string | null
          machine_fingerprint_hash?: string | null
          os_version?: string | null
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_ip?: unknown
          last_seen_at?: string | null
          launcher_version?: string | null
          machine_fingerprint_hash?: string | null
          os_version?: string | null
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_game_collection_items: {
        Row: {
          added_at: string
          collection_id: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_game_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "user_game_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_game_collection_items_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_game_collection_items_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_game_collection_items_owner_fk"
            columns: ["collection_id", "user_id"]
            isOneToOne: false
            referencedRelation: "user_game_collections"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      user_game_collections: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_game_stats: {
        Row: {
          created_at: string
          first_played_at: string | null
          game_id: string
          id: string
          ingestion_observed_at: string | null
          installed_version: string | null
          is_favorite: boolean
          last_installed_at: string | null
          last_played_at: string | null
          playtime_minutes: number
          total_sessions: number
          updated_at: string
          user_id: string
          user_notes: string | null
        }
        Insert: {
          created_at?: string
          first_played_at?: string | null
          game_id: string
          id?: string
          ingestion_observed_at?: string | null
          installed_version?: string | null
          is_favorite?: boolean
          last_installed_at?: string | null
          last_played_at?: string | null
          playtime_minutes?: number
          total_sessions?: number
          updated_at?: string
          user_id: string
          user_notes?: string | null
        }
        Update: {
          created_at?: string
          first_played_at?: string | null
          game_id?: string
          id?: string
          ingestion_observed_at?: string | null
          installed_version?: string | null
          is_favorite?: boolean
          last_installed_at?: string | null
          last_played_at?: string | null
          playtime_minutes?: number
          total_sessions?: number
          updated_at?: string
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hardware: {
        Row: {
          cpu: string | null
          created_at: string
          gpu: string | null
          headset: string | null
          keyboard: string | null
          monitor: string | null
          mouse: string | null
          ram: string | null
          setup_image_url: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          cpu?: string | null
          created_at?: string
          gpu?: string | null
          headset?: string | null
          keyboard?: string | null
          monitor?: string | null
          mouse?: string | null
          ram?: string | null
          setup_image_url?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          cpu?: string | null
          created_at?: string
          gpu?: string | null
          headset?: string | null
          keyboard?: string | null
          monitor?: string | null
          mouse?: string | null
          ram?: string | null
          setup_image_url?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_library: {
        Row: {
          added_at: string
          created_at: string
          game_id: string
          id: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          game_id: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          created_at?: string
          game_id?: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_library_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_library_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_library_snapshots: {
        Row: {
          created_at: string
          device_id: string
          game_count: number
          id: string
          last_synced_at: string
          snapshot: Json
          snapshot_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          game_count?: number
          id?: string
          last_synced_at?: string
          snapshot?: Json
          snapshot_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          game_count?: number
          id?: string
          last_synced_at?: string
          snapshot?: Json
          snapshot_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_mod_install_files: {
        Row: {
          absolute_path: string | null
          catalog_file_id: string | null
          created_at: string
          id: string
          install_id: string
          relative_path: string
          sha256: string | null
          size_bytes: number
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          absolute_path?: string | null
          catalog_file_id?: string | null
          created_at?: string
          id?: string
          install_id: string
          relative_path: string
          sha256?: string | null
          size_bytes?: number
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          absolute_path?: string | null
          catalog_file_id?: string | null
          created_at?: string
          id?: string
          install_id?: string
          relative_path?: string
          sha256?: string | null
          size_bytes?: number
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mod_install_files_catalog_file_id_fkey"
            columns: ["catalog_file_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mod_install_files_install_id_fkey"
            columns: ["install_id"]
            isOneToOne: false
            referencedRelation: "user_mod_installs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mod_installs: {
        Row: {
          catalog_mod_id: string | null
          catalog_version_id: string | null
          checked_at: string | null
          created_at: string
          game_id: string | null
          game_title: string
          id: string
          install_path: string | null
          install_state: string
          installed_at: string | null
          last_error: string | null
          legacy_mod_id: string | null
          local_game_id: string | null
          local_install_id: string
          manifest: Json
          name_snapshot: string
          provider: string
          provider_item_id: string | null
          provider_version_id: string | null
          source_url: string | null
          target_dir: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_mod_id?: string | null
          catalog_version_id?: string | null
          checked_at?: string | null
          created_at?: string
          game_id?: string | null
          game_title: string
          id?: string
          install_path?: string | null
          install_state?: string
          installed_at?: string | null
          last_error?: string | null
          legacy_mod_id?: string | null
          local_game_id?: string | null
          local_install_id: string
          manifest?: Json
          name_snapshot: string
          provider: string
          provider_item_id?: string | null
          provider_version_id?: string | null
          source_url?: string | null
          target_dir?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_mod_id?: string | null
          catalog_version_id?: string | null
          checked_at?: string | null
          created_at?: string
          game_id?: string | null
          game_title?: string
          id?: string
          install_path?: string | null
          install_state?: string
          installed_at?: string | null
          last_error?: string | null
          legacy_mod_id?: string | null
          local_game_id?: string | null
          local_install_id?: string
          manifest?: Json
          name_snapshot?: string
          provider?: string
          provider_item_id?: string | null
          provider_version_id?: string | null
          source_url?: string | null
          target_dir?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mod_installs_catalog_mod_id_fkey"
            columns: ["catalog_mod_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mod_installs_catalog_version_id_fkey"
            columns: ["catalog_version_id"]
            isOneToOne: false
            referencedRelation: "mod_catalog_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mod_installs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_mod_installs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mod_installs_legacy_mod_id_fkey"
            columns: ["legacy_mod_id"]
            isOneToOne: false
            referencedRelation: "mods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mod_profile_entries: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          install_id: string
          load_order: number
          profile_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          install_id: string
          load_order?: number
          profile_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          install_id?: string
          load_order?: number
          profile_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mod_profile_entries_install_id_fkey"
            columns: ["install_id"]
            isOneToOne: false
            referencedRelation: "user_mod_installs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mod_profile_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "mod_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          current_game_id: string | null
          current_game_title: string | null
          custom_status: string | null
          last_heartbeat_at: string | null
          platform: string | null
          platform_game_id: string | null
          platform_last_polled_at: string | null
          platform_source: string | null
          session_generation: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          current_game_id?: string | null
          current_game_title?: string | null
          custom_status?: string | null
          last_heartbeat_at?: string | null
          platform?: string | null
          platform_game_id?: string | null
          platform_last_polled_at?: string | null
          platform_source?: string | null
          session_generation?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          current_game_id?: string | null
          current_game_title?: string | null
          custom_status?: string | null
          last_heartbeat_at?: string | null
          platform?: string | null
          platform_game_id?: string | null
          platform_last_polled_at?: string | null
          platform_source?: string | null
          session_generation?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_current_game_id_fkey"
            columns: ["current_game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_presence_current_game_id_fkey"
            columns: ["current_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_cosmetics: {
        Row: {
          cosmetic_key: string
          cosmetic_type: string
          id: string
          unlocked_at: string
          unlocked_source: string
          user_id: string
        }
        Insert: {
          cosmetic_key: string
          cosmetic_type: string
          id?: string
          unlocked_at?: string
          unlocked_source?: string
          user_id: string
        }
        Update: {
          cosmetic_key?: string
          cosmetic_type?: string
          id?: string
          unlocked_at?: string
          unlocked_source?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reviews: {
        Row: {
          body: string | null
          created_at: string
          game_id: string
          id: string
          is_edited: boolean
          playtime_minutes_at_review: number
          rating: number
          recommended: boolean | null
          title: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          game_id: string
          id?: string
          is_edited?: boolean
          playtime_minutes_at_review?: number
          rating: number
          recommended?: boolean | null
          title?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          game_id?: string
          id?: string
          is_edited?: boolean
          playtime_minutes_at_review?: number
          rating?: number
          recommended?: boolean | null
          title?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reviews_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_reviews_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          achievement_notifications: boolean
          auto_update_games: boolean
          auto_update_launcher: boolean
          created_at: string
          download_bandwidth_limit_kbps: number | null
          friend_request_notifications: boolean
          game_update_notifications: boolean
          install_directory: string | null
          launcher_language: string
          minimize_to_tray: boolean
          notifications_enabled: boolean
          start_with_system: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_notifications?: boolean
          auto_update_games?: boolean
          auto_update_launcher?: boolean
          created_at?: string
          download_bandwidth_limit_kbps?: number | null
          friend_request_notifications?: boolean
          game_update_notifications?: boolean
          install_directory?: string | null
          launcher_language?: string
          minimize_to_tray?: boolean
          notifications_enabled?: boolean
          start_with_system?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_notifications?: boolean
          auto_update_games?: boolean
          auto_update_launcher?: boolean
          created_at?: string
          download_bandwidth_limit_kbps?: number | null
          friend_request_notifications?: boolean
          game_update_notifications?: boolean
          install_directory?: string | null
          launcher_language?: string
          minimize_to_tray?: boolean
          notifications_enabled?: boolean
          start_with_system?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_social_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          platform: string
          sort_order: number
          updated_at: string
          url: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          platform: string
          sort_order?: number
          updated_at?: string
          url: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          platform?: string
          sort_order?: number
          updated_at?: string
          url?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_wishlist: {
        Row: {
          added_at: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wishlist_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_cross_play_slugs"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "user_wishlist_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      friend_link_merge_groups: {
        Row: {
          member_count: number | null
          merge_group_id: string | null
          owner_id: string | null
          platforms: string[] | null
        }
        Relationships: []
      }
      game_cross_play_slugs: {
        Row: {
          external_ids: Json | null
          game_id: string | null
          slug: string | null
        }
        Insert: {
          external_ids?: Json | null
          game_id?: string | null
          slug?: string | null
        }
        Update: {
          external_ids?: Json | null
          game_id?: string | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      build_dm_pair_key: {
        Args: { user_a: string; user_b: string }
        Returns: string
      }
      can_view_achievements: {
        Args: { profile_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_view_activity: {
        Args: { target_activity_id: string }
        Returns: boolean
      }
      can_view_game_activity: {
        Args: { profile_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_view_online_status: {
        Args: { profile_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { profile_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_view_visibility: {
        Args: { owner_id: string; viewer_id: string; visibility: string }
        Returns: boolean
      }
      list_community_artwork: {
        Args: { p_game_id: string; p_limit?: number }
        Returns: {
          created_at: string
          description: string
          download_count: number
          game_id: string
          id: string
          artist_name: string
          kind: string
          moderation_status: string
          report_count: number
          source_url: string
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
          user_vote: number
          vote_score: number
        }[]
      }
      create_game_invite_share_token: {
        Args: {
          invite_id_input: string
          platform_input?: string
          ttl_seconds_input?: number
        }
        Returns: {
          expires_at: string
          game_title: string
          platform: string
          token: string
          token_hint: string
        }[]
      }
      generate_family_invite_code: { Args: never; Returns: string }
      get_activity_interaction_summaries: {
        Args: { p_activity_ids: string[] }
        Returns: {
          activity_id: string
          comment_count: number
          reacted_by_current_user: boolean
          reaction_count: number
        }[]
      }
      is_blocked: { Args: { user_a: string; user_b: string }; Returns: boolean }
      is_friend: { Args: { user_a: string; user_b: string }; Returns: boolean }
      is_username_available: {
        Args: { username_input: string }
        Returns: boolean
      }
      redeem_share_token: {
        Args: { token_input: string }
        Returns: {
          accepted_at: string
          game_invite_id: string
          game_title: string
          platform: string
          status: string
        }[]
      }
      refresh_store_product_review_stats: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      report_community_artwork: {
        Args: {
          p_artwork_id: string
          p_details?: string
          p_reason: string
        }
        Returns: {
          artwork_id: string
          moderation_status: string
          report_count: number
          report_status: string
        }[]
      }
      resolve_share_token: {
        Args: { token_input: string }
        Returns: {
          expires_at: string
          game_invite_id: string
          game_title: string
          platform: string
        }[]
      }
      set_activity_rate_up: {
        Args: { p_active: boolean; p_activity_id: string }
        Returns: {
          activity_id: string
          reacted_by_current_user: boolean
          reaction_count: number
        }[]
      }
      sync_store_review_report_hide_state: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      sync_community_artwork_report_state: {
        Args: { p_artwork_id: string }
        Returns: undefined
      }
      sync_community_artwork_vote_score: {
        Args: { p_artwork_id: string }
        Returns: undefined
      }
      vote_community_artwork: {
        Args: { p_artwork_id: string; p_vote: number }
        Returns: {
          artwork_id: string
          user_vote: number
          vote_score: number
        }[]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
