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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      action_node: {
        Row: {
          archived: boolean
          body: string | null
          bucket: Database["public"]["Enums"]["item_bucket"] | null
          completed_at: string | null
          created_at: string
          date: string | null
          embedding: string | null
          embedding_updated_at: string | null
          id: string
          name: string
          parent_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          space_id: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          bucket?: Database["public"]["Enums"]["item_bucket"] | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          embedding?: string | null
          embedding_updated_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["item_status"] | null
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          bucket?: Database["public"]["Enums"]["item_bucket"] | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          embedding?: string | null
          embedding_updated_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["item_status"] | null
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "action_node"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_todays_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          actor: Database["public"]["Enums"]["activity_actor"]
          details: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id: string
          summary: string
          timestamp: string
          user_id: string
        }
        Insert: {
          actor: Database["public"]["Enums"]["activity_actor"]
          details?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          event_type: Database["public"]["Enums"]["activity_event_type"]
          id?: string
          summary: string
          timestamp?: string
          user_id?: string
        }
        Update: {
          actor?: Database["public"]["Enums"]["activity_actor"]
          details?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["item_type"]
          event_type?: Database["public"]["Enums"]["activity_event_type"]
          id?: string
          summary?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          actor: Database["public"]["Enums"]["activity_actor"]
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          id: string
          model: Database["public"]["Enums"]["claude_model"] | null
          parent_comment_id: string | null
          user_id: string
        }
        Insert: {
          actor: Database["public"]["Enums"]["activity_actor"]
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          id?: string
          model?: Database["public"]["Enums"]["claude_model"] | null
          parent_comment_id?: string | null
          user_id?: string
        }
        Update: {
          actor?: Database["public"]["Enums"]["activity_actor"]
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["item_type"]
          id?: string
          model?: Database["public"]["Enums"]["claude_model"] | null
          parent_comment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "v_entity_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox: {
        Row: {
          archived: boolean
          body: string | null
          created_at: string
          id: string
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          pinned: boolean
          read: boolean
          source: Database["public"]["Enums"]["inbox_source"]
          title: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned?: boolean
          read?: boolean
          source?: Database["public"]["Enums"]["inbox_source"]
          title: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned?: boolean
          read?: boolean
          source?: Database["public"]["Enums"]["inbox_source"]
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      insights: {
        Row: {
          body: string | null
          entity_id: string | null
          entity_type: string | null
          expires_at: string | null
          generated_at: string | null
          id: string
          priority: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          priority?: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          priority?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          archived: boolean
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["item_type"]
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          archived: boolean
          context: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          context?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          context?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      related_items: {
        Row: {
          a_id: string
          a_type: Database["public"]["Enums"]["item_type"]
          b_id: string
          b_type: Database["public"]["Enums"]["item_type"]
          created_at: string
          description: string | null
          id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
          user_id: string
        }
        Insert: {
          a_id: string
          a_type: Database["public"]["Enums"]["item_type"]
          b_id: string
          b_type: Database["public"]["Enums"]["item_type"]
          created_at?: string
          description?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
          user_id?: string
        }
        Update: {
          a_id?: string
          a_type?: Database["public"]["Enums"]["item_type"]
          b_id?: string
          b_type?: Database["public"]["Enums"]["item_type"]
          created_at?: string
          description?: string | null
          id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          fired: boolean
          id: string
          remind_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          fired?: boolean
          id?: string
          remind_at: string
          user_id?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["item_type"]
          fired?: boolean
          id?: string
          remind_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          archived: boolean
          body: string | null
          created_at: string
          id: string
          name: string
          parent_space_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          name: string
          parent_space_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_space_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_parent_space_id_fkey"
            columns: ["parent_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_active_projects: {
        Row: {
          archived: boolean | null
          body: string | null
          created_at: string | null
          id: string | null
          name: string | null
          open_task_count: number | null
          space_id: string | null
          space_name: string | null
          space_path: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_active_tasks: {
        Row: {
          archived: boolean | null
          body: string | null
          bucket: Database["public"]["Enums"]["item_bucket"] | null
          completed_at: string | null
          created_at: string | null
          date: string | null
          id: string | null
          name: string | null
          parent_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_name: string | null
          space_id: string | null
          space_name: string | null
          space_path: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          type: Database["public"]["Enums"]["task_type"] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "action_node"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_todays_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_entity_comments: {
        Row: {
          actor: Database["public"]["Enums"]["activity_actor"] | null
          body: string | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: Database["public"]["Enums"]["item_type"] | null
          id: string | null
        }
        Relationships: []
      }
      v_entity_notes: {
        Row: {
          body: string | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: Database["public"]["Enums"]["item_type"] | null
          id: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_new_inbox: {
        Row: {
          archived: boolean | null
          body: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          pinned: boolean | null
          read: boolean | null
          source: Database["public"]["Enums"]["inbox_source"] | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          archived?: boolean | null
          body?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned?: boolean | null
          read?: boolean | null
          source?: Database["public"]["Enums"]["inbox_source"] | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          archived?: boolean | null
          body?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          item_type?: Database["public"]["Enums"]["item_type"] | null
          pinned?: boolean | null
          read?: boolean | null
          source?: Database["public"]["Enums"]["inbox_source"] | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_overdue_tasks: {
        Row: {
          archived: boolean | null
          body: string | null
          bucket: Database["public"]["Enums"]["item_bucket"] | null
          completed_at: string | null
          created_at: string | null
          date: string | null
          id: string | null
          name: string | null
          parent_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_name: string | null
          space_id: string | null
          space_name: string | null
          space_path: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          type: Database["public"]["Enums"]["task_type"] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "action_node"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_todays_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_space_tree: {
        Row: {
          depth: number | null
          id: string | null
          name: string | null
          parent_space_id: string | null
          path: string | null
        }
        Relationships: []
      }
      v_today_activity: {
        Row: {
          actor: Database["public"]["Enums"]["activity_actor"] | null
          details: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: Database["public"]["Enums"]["item_type"] | null
          event_type: Database["public"]["Enums"]["activity_event_type"] | null
          id: string | null
          project_name: string | null
          space_name: string | null
          summary: string | null
          task_name: string | null
          timestamp: string | null
        }
        Relationships: []
      }
      v_todays_tasks: {
        Row: {
          archived: boolean | null
          body: string | null
          bucket: Database["public"]["Enums"]["item_bucket"] | null
          completed_at: string | null
          created_at: string | null
          date: string | null
          id: string | null
          name: string | null
          parent_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_name: string | null
          space_id: string | null
          space_name: string | null
          space_path: string | null
          status: Database["public"]["Enums"]["item_status"] | null
          type: Database["public"]["Enums"]["task_type"] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "action_node"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_active_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_node_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_todays_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_upcoming_reminders: {
        Row: {
          body: string | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: Database["public"]["Enums"]["item_type"] | null
          id: string | null
          remind_at: string | null
        }
        Relationships: []
      }
      v_waiting: {
        Row: {
          body: string | null
          entity_type: string | null
          id: string | null
          name: string | null
          priority: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_context: {
        Args: { p_id: string; p_type: Database["public"]["Enums"]["item_type"] }
        Returns: {
          actor: string
          context_id: string
          context_kind: string
          detail: string
          summary: string
          ts: string
        }[]
      }
      fn_node_tree: {
        Args: { root_id: string }
        Returns: {
          depth: number
          task_id: string
        }[]
      }
      fn_related: {
        Args: { p_id: string; p_type: Database["public"]["Enums"]["item_type"] }
        Returns: {
          direction: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["item_type"]
          link_id: string
        }[]
      }
      fn_semantic_search: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          entity_type: string
          id: string
          name: string
          project_name: string
          similarity: number
          space_name: string
          status: string
        }[]
      }
      fn_space_tree: {
        Args: { root_id: string }
        Returns: {
          space_id: string
        }[]
      }
      fn_task_tree: {
        Args: { root_id: string }
        Returns: {
          depth: number
          task_id: string
        }[]
      }
      fn_validate_entity_ref: {
        Args: { p_id: string; p_type: Database["public"]["Enums"]["item_type"] }
        Returns: boolean
      }
      run_queries: { Args: { queries: string[] }; Returns: Json }
      show_limit: { Args: Record<PropertyKey, never>; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      activity_actor: "claude" | "shureed"
      activity_event_type:
        | "created"
        | "updated"
        | "status_changed"
        | "note_added"
        | "task_completed"
        | "linked"
      claude_model: "haiku" | "sonnet" | "opus"
      inbox_source: "chat" | "voice" | "text" | "email" | "shortcut"
      item_bucket: "needs_doing" | "someday" | "maybe"
      item_status: "open" | "in_progress" | "waiting" | "done" | "cancelled"
      item_type: "space" | "task" | "note" | "inbox" | "person"
      priority_level: "high" | "medium" | "low"
      relation_type: "relates_to" | "blocks" | "duplicate_of" | "spawned_from"
      task_type:
        | "task"
        | "bug"
        | "improvement"
        | "feature"
        | "idea"
        | "thought"
        | "context_gathering"
        | "plan"
        | "project"
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
      activity_actor: ["claude", "shureed"],
      activity_event_type: [
        "created",
        "updated",
        "status_changed",
        "note_added",
        "task_completed",
        "linked",
      ],
      claude_model: ["haiku", "sonnet", "opus"],
      inbox_source: ["chat", "voice", "text", "email", "shortcut"],
      item_bucket: ["needs_doing", "someday", "maybe"],
      item_status: ["open", "in_progress", "waiting", "done", "cancelled"],
      item_type: ["space", "task", "note", "inbox", "person"],
      priority_level: ["high", "medium", "low"],
      relation_type: ["relates_to", "blocks", "duplicate_of", "spawned_from"],
      task_type: [
        "task",
        "bug",
        "improvement",
        "feature",
        "idea",
        "thought",
        "context_gathering",
        "plan",
        "project",
      ],
    },
  },
} as const
