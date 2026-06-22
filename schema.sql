-- Create Bills table
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mail_id VARCHAR(255) UNIQUE,
    vendor VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    due_date DATE,
    statement_date DATE,
    status VARCHAR(50) DEFAULT 'unpaid', -- 'unpaid', 'paid'
    email_subject TEXT,
    email_sender TEXT,
    date_received TIMESTAMP WITH TIME ZONE,
    extracted_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Payments history table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL, -- 'check', 'card', 'bank_transfer', 'cash', 'other'
    ref_number VARCHAR(100), -- check number or confirmation code
    amount NUMERIC(10, 2) NOT NULL,
    paid_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for scanning duplicates
CREATE INDEX IF NOT EXISTS idx_bills_mail_id ON bills(mail_id);
