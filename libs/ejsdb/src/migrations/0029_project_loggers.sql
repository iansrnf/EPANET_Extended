UPDATE project
SET settings = json_set(settings, '$.loggers', json('[]'))
WHERE settings IS NOT NULL AND json_type(settings, '$.loggers') IS NULL;
