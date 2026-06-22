require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// Initialize Supabase Client if credentials are provided and valid
let supabase = null;
const isSupabaseConfigured = process.env.SUPABASE_URL && 
                             process.env.SUPABASE_URL !== 'https://your-project-id.supabase.co' &&
                             process.env.SUPABASE_KEY && 
                             process.env.SUPABASE_KEY !== 'your-supabase-anon-key';

if (isSupabaseConfigured) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error.message);
  }
}

// In-memory fallback database if Supabase isn't configured yet
let localBills = [
  {
    id: "mock-1",
    mail_id: "msg-101",
    vendor: "Acme Power & Light",
    amount: 142.50,
    due_date: "2026-07-05",
    statement_date: "2026-06-15",
    status: "unpaid",
    email_subject: "Your June Electric Bill Statement",
    email_sender: "billing@acmepower.com",
    date_received: new Date().toISOString(),
    extracted_summary: "Monthly electricity usage statement for Acme Power. Amount due is $142.50 by July 05, 2026."
  },
  {
    id: "mock-2",
    mail_id: "msg-102",
    vendor: "GigaStream Internet",
    amount: 79.99,
    due_date: "2026-06-28",
    statement_date: "2026-06-10",
    status: "paid",
    email_subject: "Invoice G-883201 - Paid",
    email_sender: "no-reply@gigastream.net",
    date_received: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    extracted_summary: "High-speed internet invoice. Marked as paid."
  },
  {
    id: "mock-3",
    mail_id: "msg-103",
    vendor: "Metro Trash & Recycle",
    amount: 45.00,
    due_date: "2026-07-12",
    statement_date: "2026-06-12",
    status: "unpaid",
    email_subject: "Quarterly Waste Management Bill",
    email_sender: "service@metrotrash.com",
    date_received: new Date().toISOString(),
    extracted_summary: "Quarterly trash removal billing. Total amount $45.00 due on July 12, 2026."
  }
];

let localPayments = [
  {
    id: "pay-mock-1",
    bill_id: "mock-2",
    payment_method: "card",
    ref_number: "Visa *4242",
    amount: 79.99,
    paid_date: "2026-06-15",
    notes: "Auto-pay setup"
  }
];

// Verify configuration status endpoint
app.get('/api/config-status', (req, res) => {
  const isImapConfigured = process.env.IMAP_USER && process.env.IMAP_USER !== 'your-email@gmail.com';
  const isOpenRouterConfigured = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your-openrouter-api-key';

  res.json({
    supabase: !!supabase,
    imap: isImapConfigured,
    openrouter: isOpenRouterConfigured,
    msg: (!supabase || !isImapConfigured || !isOpenRouterConfigured) 
      ? "Running in demo fallback mode. Please configure your .env file to enable live scan and cloud storage."
      : "Full integration active."
  });
});

// POST route to dynamically verify and save IMAP credentials
app.post('/api/config', async (req, res) => {
  const { email, password, host, port, secure } = req.body;
  if (!email || !password || !host || !port) {
    return res.status(400).json({ error: "Email, password, host and port are required" });
  }

  const imapHost = host.trim();
  const imapPort = parseInt(port) || 993;
  const imapSecure = secure !== false;

  // 1. Verify IMAP connection first
  const testClient = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: {
      user: email,
      pass: password
    },
    logger: false
  });

  testClient.on('error', err => {
    console.error("IMAP Verify Client Error:", err.message);
  });


  try {
    await testClient.connect();
    await testClient.logout(); // Connection verified!
  } catch (verifyError) {
    console.error("IMAP Connection Verification Failed:", verifyError.message);
    return res.status(400).json({ 
      error: `Failed to connect to ${imapHost}:${imapPort}: ${verifyError.message}. Please double check your server and credentials.` 
    });
  }

  // 2. If verified, save to .env
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const setEnvVar = (key, value) => {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    };

    setEnvVar('IMAP_HOST', imapHost);
    setEnvVar('IMAP_PORT', imapPort);
    setEnvVar('IMAP_SECURE', imapSecure);
    setEnvVar('IMAP_USER', email);
    setEnvVar('IMAP_PASSWORD', password);

    fs.writeFileSync(envPath, envContent, 'utf8');

    // Update in-memory process environment immediately
    process.env.IMAP_HOST = imapHost;
    process.env.IMAP_PORT = imapPort;
    process.env.IMAP_SECURE = imapSecure;
    process.env.IMAP_USER = email;
    process.env.IMAP_PASSWORD = password;

    console.log(`Successfully verified and updated email configuration to: ${email} on ${imapHost}`);

    res.json({ success: true, msg: "Credentials verified and applied successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update configuration: " + error.message });
  }
});




// GET all bills
app.get('/api/bills', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return res.json(data);
    } else {
      return res.json(localBills);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET payment history
app.get('/api/payments', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('payments')
        .select('*, bills(vendor)')
        .order('paid_date', { ascending: false });
      if (error) throw error;
      return res.json(data);
    } else {
      // Map vendor name to local payments for history display
      const mapped = localPayments.map(p => {
        const bill = localBills.find(b => b.id === p.bill_id);
        return {
          ...p,
          bills: { vendor: bill ? bill.vendor : 'Unknown Vendor' }
        };
      });
      return res.json(mapped);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST log payment
app.post('/api/bills/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { payment_method, ref_number, amount, paid_date, notes } = req.body;

  try {
    if (supabase) {
      // 1. Insert payment record
      const { data: paymentData, error: payError } = await supabase
        .from('payments')
        .insert([{
          bill_id: id,
          payment_method,
          ref_number,
          amount: parseFloat(amount),
          paid_date,
          notes
        }])
        .select();
      
      if (payError) throw payError;

      // 2. Update bill status
      const { error: billError } = await supabase
        .from('bills')
        .update({ status: 'paid' })
        .eq('id', id);

      if (billError) throw billError;

      return res.json({ success: true, payment: paymentData[0] });
    } else {
      // Local fallback
      const bill = localBills.find(b => b.id === id);
      if (!bill) return res.status(404).json({ error: "Bill not found" });

      bill.status = 'paid';
      const newPayment = {
        id: `pay-local-${Date.now()}`,
        bill_id: id,
        payment_method,
        ref_number,
        amount: parseFloat(amount),
        paid_date,
        notes
      };
      localPayments.unshift(newPayment);
      return res.json({ success: true, payment: newPayment });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    let billsList = [];
    let paymentsList = [];

    if (supabase) {
      const { data: bData } = await supabase.from('bills').select('*');
      const { data: pData } = await supabase.from('payments').select('*');
      billsList = bData || [];
      paymentsList = pData || [];
    } else {
      billsList = localBills;
      paymentsList = localPayments;
    }

    const unpaidBills = billsList.filter(b => b.status === 'unpaid');
    const totalUnpaid = unpaidBills.reduce((sum, b) => sum + Number(b.amount), 0);
    
    const paidBills = billsList.filter(b => b.status === 'paid');
    const totalPaid = paymentsList.reduce((sum, p) => sum + Number(p.amount), 0);

    // Grouping by payment method (card vs check, etc.)
    const methodCounts = {};
    paymentsList.forEach(p => {
      const m = p.payment_method || 'other';
      methodCounts[m] = (methodCounts[m] || 0) + Number(p.amount);
    });

    // Breakdown for bento box chart
    const methods = Object.keys(methodCounts).map(key => ({
      name: key,
      value: methodCounts[key]
    }));

    return res.json({
      totalUnpaid,
      unpaidCount: unpaidBills.length,
      totalPaid,
      paidCount: paidBills.length,
      paymentMethods: methods,
      recentBills: billsList.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Scan Emails endpoint
app.post('/api/scan', async (req, res) => {
  const { openrouterKey } = req.body;
  const isImapConfigured = process.env.IMAP_USER && process.env.IMAP_USER !== 'your-email@gmail.com';
  const hasOpenRouterKey = (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your-openrouter-api-key') || (openrouterKey && openrouterKey.trim() !== '');

  if (!isImapConfigured || !hasOpenRouterKey) {
    // If not configured, simulate scanning with mock incoming emails
    console.log("Using scanning simulation...");
    const simulatedBills = [
      {
        id: `sim-${Date.now()}-1`,
        mail_id: `msg-${Date.now()}-1`,
        vendor: "Water District 14",
        amount: 58.20,
        due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        statement_date: new Date().toISOString().split('T')[0],
        status: "unpaid",
        email_subject: "Water Statement Invoice #99831",
        email_sender: "noreply@waterdist14.gov",
        date_received: new Date().toISOString(),
        extracted_summary: "Residential water service invoice. Total balance due $58.20."
      },
      {
        id: `sim-${Date.now()}-2`,
        mail_id: `msg-${Date.now()}-2`,
        vendor: "State Farm Insurance",
        amount: 185.00,
        due_date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        statement_date: new Date().toISOString().split('T')[0],
        status: "unpaid",
        email_subject: "Auto Insurance Renewal Invoice",
        email_sender: "billing@statefarm.com",
        date_received: new Date().toISOString(),
        extracted_summary: "Monthly renewal statement. Payment of $185.00 scheduled/due."
      }
    ];

    if (supabase) {
      // Insert simulation to Supabase if config is partial
      const { data, error } = await supabase.from('bills').insert(simulatedBills.map(b => {
        const { id, ...rest } = b; // let db generate UUID
        return rest;
      })).select();
      if (error) console.error("Supabase insert simulation error:", error.message);
    } else {
      localBills.push(...simulatedBills);
    }

    return res.json({
      success: true,
      simulation: true,
      scannedCount: 5,
      billsFound: 2,
      msg: "Scan completed in Demo simulation mode (credentials not configured)."
    });
  }

  // --- Real Scanning Workflow via IMAP & OpenRouter ---
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT) || 993,
    secure: process.env.IMAP_SECURE === 'true' || process.env.IMAP_SECURE === true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD
    },
    logger: false
  });

  client.on('error', err => {
    console.error("IMAP Scan Client Error:", err.message);
  });


  let connection = null;
  try {
    await client.connect();
    connection = await client.getMailboxLock('INBOX');

    // Fetch last 20 messages
    const emails = [];
    const searchResult = await client.search({ all: true });
    // Get the last 50 messages
    const recentUids = searchResult.slice(-50);

    for (const uid of recentUids) {
      const message = await client.fetchOne(uid, { source: true, envelope: true });
      const parsed = await simpleParser(message.source);
      
      emails.push({
        mail_id: message.envelope.messageId || `uid-${uid}`,
        subject: parsed.subject || "No Subject",
        sender: parsed.from?.value[0]?.name || parsed.from?.value[0]?.address || "Unknown Sender",
        date: parsed.date || new Date(),
        bodyText: parsed.text || parsed.html || ""
      });
    }

    let billsFound = 0;
    const addedBills = [];

    for (const email of emails) {
      // 1. Check if email is already parsed (duplicate prevention)
      if (supabase) {
        const { data } = await supabase.from('bills').select('id').eq('mail_id', email.mail_id).maybeSingle();
        if (data) continue;
      } else {
        const found = localBills.some(b => b.mail_id === email.mail_id);
        if (found) continue;
      }

      // 2. Classify and Extract via OpenRouter
      const classification = await analyzeEmailWithOpenRouter(email, openrouterKey);
      
      const isBill = classification ? !!classification.is_bill : false;
      const billRecord = {
        mail_id: email.mail_id,
        vendor: isBill ? (classification.vendor || "Unknown Vendor") : email.sender,
        amount: isBill ? (parseFloat(classification.amount) || 0.00) : 0.00,
        due_date: isBill ? (classification.due_date || null) : null,
        statement_date: isBill ? (classification.statement_date || null) : null,
        status: isBill ? 'unpaid' : 'other',
        email_subject: email.subject,
        email_sender: email.sender,
        date_received: email.date.toISOString(),
        extracted_summary: classification ? (classification.summary || email.subject) : `[AI Scan Offline] ${email.subject}`
      };

      if (supabase) {
        const { error } = await supabase.from('bills').insert([billRecord]);
        if (error) console.error("Supabase insert error:", error.message);
      } else {
        billRecord.id = `local-${Date.now()}-${addedBills.length}`;
        localBills.push(billRecord);
      }
      
      addedBills.push(billRecord);
      if (isBill) {
        billsFound++;
      }
    }

    res.json({
      success: true,
      simulation: false,
      scannedCount: emails.length,
      billsFound,
      newBills: addedBills
    });

  } catch (error) {
    console.error("IMAP Scan Error:", error);
    res.status(500).json({ error: "IMAP error: " + error.message });
  } finally {
    if (connection) connection.release();
    await client.logout();
  }
});

// OpenRouter Analysis helper
async function analyzeEmailWithOpenRouter(email, customKey) {
  const model = process.env.OPENROUTER_MODEL || 'google/gemma-2-9b-it:free';
  const apiKey = customKey || process.env.OPENROUTER_API_KEY;

  const prompt = `You are a billing statements classifier. Analyze this email details and body text, then return a JSON object ONLY (no markdown formatting, no codeblocks).

Email Subject: ${email.subject}
Email Sender: ${email.sender}
Date: ${email.date}
Email Body Preview:
${email.bodyText.substring(0, 1500)}

Response Schema JSON:
{
  "is_bill": true/false (true if it represents an unpaid utility bill, invoice, credit card statement, recurring statement, or subscription billing),
  "vendor": "Name of the service provider / vendor / utility company",
  "amount": 123.45 (extracted cost / amount due),
  "due_date": "YYYY-MM-DD" (extracted payment due date, null if not found),
  "statement_date": "YYYY-MM-DD" (extracted invoice/statement date, null if not found),
  "summary": "Brief 1-sentence summary of the bill details"
}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const textResponse = response.data.choices[0].message.content.trim();
    // Strip markdown code block wrappers if model outputs them
    const jsonStr = textResponse.replace(/^```json/, '').replace(/```$/, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("OpenRouter API Error:", error.response?.data || error.message);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
