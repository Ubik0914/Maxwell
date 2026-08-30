export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  dag: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: "OWNER" | "EDITOR" | "VIEWER";
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: "OWNER" | "EDITOR" | "VIEWER";
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          role?: "OWNER" | "EDITOR" | "VIEWER";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      stories: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          description: string | null;
          status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          title: string;
          description?: string | null;
          status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          title?: string;
          description?: string | null;
          status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stories_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      nodes: {
        Row: {
          id: string;
          story_id: string;
          type: "START" | "TASK" | "GOAL";
          title: string;
          description: string | null;
          status:
            | "BLOCKED"
            | "READY"
            | "IN_PROGRESS"
            | "DONE"
            | "CANCELLED"
            | null;
          assignee_id: string | null;
          priority: number | null;
          due_date: string | null;
          position_x: number;
          position_y: number;
          sort_order: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          type: "START" | "TASK" | "GOAL";
          title: string;
          description?: string | null;
          status?:
            | "BLOCKED"
            | "READY"
            | "IN_PROGRESS"
            | "DONE"
            | "CANCELLED"
            | null;
          assignee_id?: string | null;
          priority?: number | null;
          due_date?: string | null;
          position_x?: number;
          position_y?: number;
          sort_order?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          type?: "START" | "TASK" | "GOAL";
          title?: string;
          description?: string | null;
          status?:
            | "BLOCKED"
            | "READY"
            | "IN_PROGRESS"
            | "DONE"
            | "CANCELLED"
            | null;
          assignee_id?: string | null;
          priority?: number | null;
          due_date?: string | null;
          position_x?: number;
          position_y?: number;
          sort_order?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nodes_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      edges: {
        Row: {
          id: string;
          story_id: string;
          source_node_id: string;
          target_node_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          source_node_id: string;
          target_node_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          source_node_id?: string;
          target_node_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edges_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edges_source_node_id_fkey";
            columns: ["source_node_id"];
            isOneToOne: false;
            referencedRelation: "nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edges_target_node_id_fkey";
            columns: ["target_node_id"];
            isOneToOne: false;
            referencedRelation: "nodes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_story: {
        Args: {
          p_workspace_id: string;
          p_title: string;
          p_description: string | null;
          p_start_state: string;
          p_goal_state: string;
        };
        Returns: string;
      };
      insert_task_on_edge: {
        Args: {
          p_edge_id: string;
          p_title: string;
          p_description: string | null;
        };
        Returns: string;
      };
      branch_task_on_edge: {
        Args: {
          p_edge_id: string;
          p_title: string;
          p_description: string | null;
        };
        Returns: string;
      };
      branch_task_from_node: {
        Args: {
          p_source_node_id: string;
          p_target_node_id: string;
          p_title: string;
          p_description: string | null;
        };
        Returns: string;
      };
      import_tasks: {
        Args: {
          p_story_id: string;
          p_rows: unknown;
        };
        Returns: { nodeIds: string[] };
      };
      reorder_nodes: {
        Args: {
          p_story_id: string;
          p_node_ids: string[];
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["dag"]["Tables"]> =
  Database["dag"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["dag"]["Tables"]> =
  Database["dag"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["dag"]["Tables"]> =
  Database["dag"]["Tables"][T]["Update"];
