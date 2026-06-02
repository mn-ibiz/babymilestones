-- P6-E05-S05 (Story 35.5): Expenses module — the FOUNDATION the consolidated
-- P&L (Story 35.1) consumes. An `expenses` row records money the business SPENT
-- (rent, salaries, supplies, utilities, …) on a calendar date, attributed to a
-- business unit (the same unit taxonomy services use: play / talent / salon /
-- coaching / event / shop) OR left NULL for SHARED OVERHEAD that is not owned by
-- any single unit. Expenses subtract from unit revenue in the P&L (AC4): the
-- `expensesByUnitInPeriod(from,to)` read model buckets per-unit totals + a
-- shared-overhead bucket (the NULL-unit rows) for 35.1 to consume.
--
-- A RECURRING expense (rent, salaries) is configured once as an
-- `expense_recurring_templates` row with a `day_of_month` (1..28 — every month
-- has these days, so the schedule never skips); a daily scheduled job
-- materialises the concrete `expenses` row on its day, IDEMPOTENTLY (at most once
-- per template per calendar month, guarded by `last_run_month`). A materialised
-- expense carries `recurring_template_id` back to its template.
--
-- Additive only. Money is stored in integer cents (`amount_cents`), matching the
-- rest of the platform (no floats). `receipt_attachment_url` is a plain text URL
-- (no file-upload infra needed) — a link to a receipt scan stored elsewhere.

-- The allowed business-unit codes. A superset of the service-unit taxonomy plus
-- `shop` (retail). NULL is permitted on the column itself = shared overhead, so
-- it is intentionally absent from this CHECK list (a NULL passes a CHECK).
-- Mirrors EXPENSE_BUSINESS_UNITS in @bm/catalog + @bm/contracts.

CREATE TABLE IF NOT EXISTS expense_recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Free-text expense category, non-empty (e.g. "Rent", "Salaries", "Utilities").
  category text NOT NULL CHECK (char_length(category) >= 1 AND char_length(category) <= 120),
  -- The business unit this recurring expense is attributed to, or NULL for SHARED
  -- OVERHEAD. CHECK-constrained to the allowed unit codes (NULL passes the CHECK).
  business_unit text CHECK (
    business_unit IN ('play', 'talent', 'salon', 'coaching', 'event', 'shop')
  ),
  -- The recurring amount in integer cents. Strictly positive.
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  -- How the expense is paid (e.g. "cash", "bank_transfer", "mpesa", "card").
  payment_method text NOT NULL CHECK (char_length(payment_method) >= 1 AND char_length(payment_method) <= 60),
  -- The calendar day-of-month the expense materialises on. 1..28 so it is valid
  -- in EVERY month (Feb has no 29/30/31) — the schedule never silently skips.
  day_of_month integer NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 28),
  -- Optional external reference / memo (invoice no., contract id, …).
  reference text,
  -- Whether this template is live. Inactive templates are skipped by the job.
  active boolean NOT NULL DEFAULT true,
  -- The last calendar month (YYYY-MM) the job materialised an expense from this
  -- template — the idempotency guard. NULL = never materialised. A re-run in the
  -- same month finds this set and skips.
  last_run_month text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The job scans active templates whose day_of_month matches today.
CREATE INDEX IF NOT EXISTS expense_recurring_templates_active_day_idx
  ON expense_recurring_templates (active, day_of_month);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The calendar date the expense was incurred (YYYY-MM-DD). The P&L buckets on
  -- this date, NOT created_at.
  expense_date date NOT NULL,
  -- Free-text expense category, non-empty.
  category text NOT NULL CHECK (char_length(category) >= 1 AND char_length(category) <= 120),
  -- The business unit this expense is attributed to, or NULL for SHARED OVERHEAD.
  business_unit text CHECK (
    business_unit IN ('play', 'talent', 'salon', 'coaching', 'event', 'shop')
  ),
  -- The amount in integer cents. Strictly positive.
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  -- How the expense was paid.
  payment_method text NOT NULL CHECK (char_length(payment_method) >= 1 AND char_length(payment_method) <= 60),
  -- Optional external reference / memo.
  reference text,
  -- Optional URL to a receipt scan stored elsewhere (no upload infra here).
  receipt_attachment_url text,
  -- When materialised from a recurring template, the template it came from. NULL
  -- for one-off, manually-entered expenses.
  recurring_template_id uuid REFERENCES expense_recurring_templates(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The P&L read model filters by [from, to) on expense_date and groups by unit.
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS expenses_unit_date_idx ON expenses (business_unit, expense_date);
-- A materialised expense is found by (template, month) for the job's per-month
-- idempotency belt-and-braces (in addition to the template's last_run_month).
CREATE INDEX IF NOT EXISTS expenses_recurring_template_idx
  ON expenses (recurring_template_id) WHERE recurring_template_id IS NOT NULL;

-- RBAC: `manage expense` gates the expense + recurring-template CRUD surface.
-- Granted to admin (manages the books) AND accountant (owning the books is their
-- function). Additive; mirrors PERMISSION_MATRIX (rbac.ts). super_admin already
-- covers this via its (*,*) wildcard. The @bm/auth snapshot + the db
-- permissions.test.ts EXPECTED list are the drift gates for this matrix.
INSERT INTO permissions (role, action, resource) VALUES
  ('admin', 'manage', 'expense'),
  ('accountant', 'manage', 'expense')
ON CONFLICT (role, action, resource) DO NOTHING;
