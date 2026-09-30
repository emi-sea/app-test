CREATE TABLE IF NOT EXISTS probe_items (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    value       TEXT NOT NULL,
    category    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

TRUNCATE probe_items RESTART IDENTITY;

INSERT INTO probe_items (name, value, category)
SELECT
    'item-' || g,
    'payload-' || md5(g::text || clock_timestamp()::text),
    (ARRAY['alpha', 'beta', 'gamma', 'delta', 'epsilon'])[1 + (g % 5)]
FROM generate_series(1, 300) AS g;
