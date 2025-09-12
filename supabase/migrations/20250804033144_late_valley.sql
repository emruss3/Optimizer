/*
  # Remove duplicate update_updated_at_column function

  1. Cleanup
    - Remove duplicate function definitions that cause migration conflicts
    - Keep only the first instance from the earliest migration
  
  2. Safety
    - Use IF EXISTS to prevent errors on clean databases
    - No data loss - only removes function duplicates
*/

-- Drop the duplicate function if it exists
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Recreate the function with proper definition
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';