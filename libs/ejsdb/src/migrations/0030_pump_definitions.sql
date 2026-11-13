ALTER TABLE project ADD COLUMN pump_definitions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE pumps ADD COLUMN pump_definition_id TEXT;
