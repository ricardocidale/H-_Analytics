import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = `
CREATE SCHEMA IF NOT EXISTS dev_internal;

CREATE TABLE IF NOT EXISTS dev_internal.replit_invoices (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  invoice_number text NOT NULL,
  issued_date timestamp NOT NULL,
  cycle_start timestamp,
  cycle_end timestamp,
  status text NOT NULL,
  net_amount numeric(10,2) NOT NULL,
  gross_subtotal numeric(10,2),
  pre_purchase_applied numeric(10,2),
  prior_invoice_credit numeric(10,2),
  is_cap_hit boolean NOT NULL DEFAULT false,
  is_spike_day boolean NOT NULL DEFAULT false,
  ship_day_context text,
  hplus_attributed_net numeric(10,2) NOT NULL,
  hplus_attributed_gross numeric(10,2) NOT NULL,
  hplus_attribution_ratio numeric(5,4) NOT NULL,
  attribution_method text NOT NULL,
  notes text,
  raw_json jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS replit_invoices_invoice_number_idx ON dev_internal.replit_invoices (invoice_number);
CREATE INDEX IF NOT EXISTS replit_invoices_issued_date_idx ON dev_internal.replit_invoices (issued_date);
CREATE INDEX IF NOT EXISTS replit_invoices_is_spike_day_idx ON dev_internal.replit_invoices (is_spike_day);

CREATE TABLE IF NOT EXISTS dev_internal.replit_invoice_line_items (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  invoice_id integer NOT NULL REFERENCES dev_internal.replit_invoices(id) ON DELETE CASCADE,
  workspace_uuid text NOT NULL,
  workspace_label text,
  units_billed numeric(14,6) NOT NULL,
  unit_price numeric(10,4) NOT NULL,
  amount numeric(10,2) NOT NULL,
  is_hplus_workspace boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS replit_invoice_line_items_invoice_id_idx ON dev_internal.replit_invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS replit_invoice_line_items_workspace_uuid_idx ON dev_internal.replit_invoice_line_items (workspace_uuid);
CREATE INDEX IF NOT EXISTS replit_invoice_line_items_is_hplus_idx ON dev_internal.replit_invoice_line_items (is_hplus_workspace);
`;
async function run() {
  await pool.query(sql);
  const r = await pool.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'dev_internal' AND table_name LIKE 'replit_%' ORDER BY table_name");
  console.log('Tables ensured:', r.rows.map((x: any) => `${x.table_schema}.${x.table_name}`).join(', '));
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
