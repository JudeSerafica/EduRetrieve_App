-- Allow null values for module_id first
ALTER TABLE save_modules
ALTER COLUMN module_id DROP NOT NULL;

-- Then add the foreign key with SET NULL on delete
ALTER TABLE save_modules
ADD CONSTRAINT fk_save_module_id
FOREIGN KEY (module_id)
REFERENCES modules(id)
ON DELETE SET NULL;

SELECT * FROM save_modules
WHERE module_id = 'the-module-id-you-tried-to-delete';

-- Allow inserts only for the user who owns the row
CREATE POLICY "Allow user to insert their saved modules"
ON save_modules
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow deletes by the owner
CREATE POLICY "Allow user to delete their saved modules"
ON save_modules
FOR DELETE
USING (auth.uid() = user_id);
