/*
  # Fix RLS policies for project_parcels table

  1. Security Updates
    - Update RLS policies to allow both anonymous and authenticated users
    - Enable public access to project_parcels for demo purposes
    - Maintain data integrity while allowing necessary operations

  Note: In production, you may want to restrict this to authenticated users only
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert project parcels" ON project_parcels;
DROP POLICY IF EXISTS "Users can read project parcels" ON project_parcels;
DROP POLICY IF EXISTS "Users can update project parcels" ON project_parcels;
DROP POLICY IF EXISTS "Users can delete project parcels" ON project_parcels;

-- Create new policies that allow both anon and authenticated users
CREATE POLICY "Allow all users to read project parcels"
  ON project_parcels
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all users to insert project parcels"
  ON project_parcels
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all users to update project parcels"
  ON project_parcels
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all users to delete project parcels"
  ON project_parcels
  FOR DELETE
  TO anon, authenticated
  USING (true);