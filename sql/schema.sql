create table if not exists invoices (
  id text primary key,
  pdf_name text, pdf_b64 text,
  received_at timestamptz default now(),
  sender text, subject text,
  supplier_name text, supplier_nif text,
  customer_name text, customer_nif text,
  invoice_number text, invoice_date text,
  base numeric(14,2) default 0, vat numeric(14,2) default 0, total numeric(14,2) default 0,
  po_number text, posting_type text default 'financiero',
  status text not null default 'pendiente',
  confidence text, issues text, rejection_reason text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (supplier_nif, invoice_number)
);
create table if not exists invoice_lines (
  id serial primary key,
  invoice_id text references invoices(id) on delete cascade,
  line_no int, description text, internal_code text,
  qty numeric(14,3) default 0, unit_price numeric(14,4) default 0,
  vat_rate numeric(5,2) default 21, amount numeric(14,2) default 0, issue text
);
create table if not exists approvals (
  id serial primary key,
  invoice_id text references invoices(id) on delete cascade,
  level int, approver_name text, approver_email text,
  decision text default 'pending', comment text, decided_at timestamptz
);
create table if not exists invoice_events (
  id serial primary key,
  invoice_id text references invoices(id) on delete cascade,
  event text, actor text, detail text, at timestamptz default now()
);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_lines_invoice on invoice_lines(invoice_id);
