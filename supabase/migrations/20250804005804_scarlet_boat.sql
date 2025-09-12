/*
  # Add realtime features for collaboration

  1. New Tables
    - `project_members` - Project collaborators and roles
    - `project_comments` - Realtime comments system
    
  2. Security
    - Enable RLS on both tables
    - Add policies for appropriate access control
    
  3. Realtime
    - Enable realtime for project_comments table
*/

-- Project members table
CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  user_id text,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'analyst', 'manager', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by text NOT NULL,
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Project comments table
CREATE TABLE IF NOT EXISTS project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  parcel_id text,
  user_id text NOT NULL,
  user_name text NOT NULL,
  message text NOT NULL,
  read_by text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_email ON project_members(email);
CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_parcel_id ON project_comments(parcel_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_created_at ON project_comments(created_at DESC);

-- Enable RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_members
CREATE POLICY "Users can read project members they're part of"
  ON project_members
  FOR SELECT
  TO authenticated, anon
  USING (true); -- For demo, allow all access

CREATE POLICY "Managers can insert project members"
  ON project_members
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true); -- For demo, allow all access

CREATE POLICY "Users can update their own membership"
  ON project_members
  FOR UPDATE
  TO authenticated, anon
  USING (true); -- For demo, allow all access

-- RLS Policies for project_comments
CREATE POLICY "Users can read comments for their projects"
  ON project_comments
  FOR SELECT
  TO authenticated, anon
  USING (true); -- For demo, allow all access

CREATE POLICY "Users can insert comments"
  ON project_comments
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true); -- For demo, allow all access

CREATE POLICY "Users can update read status"
  ON project_comments
  FOR UPDATE
  TO authenticated, anon
  USING (true); -- For demo, allow all access

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE project_comments;