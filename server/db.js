const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'rusticretreat.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS couples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner1_name TEXT NOT NULL,
    partner2_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT,
    wedding_date DATE,
    venue_package TEXT,
    status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead', 'inquiry', 'booked', 'completed', 'cancelled')),
    notes TEXT,
    budget_total REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    start_time TEXT,
    end_time TEXT,
    package_name TEXT,
    guest_count INTEGER,
    ceremony_location TEXT,
    reception_location TEXT,
    catering_type TEXT,
    special_requests TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'partial', 'paid', 'overdue')),
    deposit_paid REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('staff', 'couple')),
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    category TEXT DEFAULT 'General',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    rsvp_status TEXT DEFAULT 'pending' CHECK(rsvp_status IN ('pending', 'accepted', 'declined')),
    meal_preference TEXT,
    plus_one INTEGER DEFAULT 0,
    dietary_restrictions TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budget_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    estimated_cost REAL DEFAULT 0,
    actual_cost REAL DEFAULT 0,
    paid INTEGER DEFAULT 0,
    vendor_name TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    vendor_type TEXT NOT NULL,
    business_name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    notes TEXT,
    booked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    duration_minutes INTEGER DEFAULT 30,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    uploaded_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT,
    couple_id INTEGER REFERENCES couples(id) ON DELETE SET NULL,
    due_date DATE,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'signed', 'declined')),
    signing_token TEXT UNIQUE,
    sent_at DATETIME,
    signed_at DATETIME,
    signer_name TEXT,
    signer_email TEXT,
    signature_data TEXT,
    signer_ip TEXT,
    portal_credentials_sent INTEGER DEFAULT 0,
    wedding_date DATE,
    start_time TEXT,
    end_time TEXT,
    guest_count INTEGER,
    ceremony_location TEXT,
    reception_location TEXT,
    package_name TEXT,
    total_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    due_date DATE,
    paid INTEGER DEFAULT 0,
    paid_at DATETIME,
    payment_method TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate existing contracts table with new event-detail columns
for (const col of [
  'ALTER TABLE contracts ADD COLUMN wedding_date DATE',
  'ALTER TABLE contracts ADD COLUMN start_time TEXT',
  'ALTER TABLE contracts ADD COLUMN end_time TEXT',
  'ALTER TABLE contracts ADD COLUMN guest_count INTEGER',
  'ALTER TABLE contracts ADD COLUMN ceremony_location TEXT',
  'ALTER TABLE contracts ADD COLUMN reception_location TEXT',
  'ALTER TABLE contracts ADD COLUMN package_name TEXT',
  'ALTER TABLE contracts ADD COLUMN total_price REAL',
]) { try { db.exec(col); } catch (_) {} }

// Packages table
db.exec(`
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    max_guests INTEGER,
    includes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// New column migrations
for (const col of [
  'ALTER TABLE couples ADD COLUMN referral_source TEXT',
  'ALTER TABLE invoices ADD COLUMN reminder_14d_sent INTEGER DEFAULT 0',
  'ALTER TABLE invoices ADD COLUMN reminder_7d_sent INTEGER DEFAULT 0',
  'ALTER TABLE invoices ADD COLUMN reminder_1d_sent INTEGER DEFAULT 0',
]) { try { db.exec(col); } catch (_) {} }

// Backfill sample referral sources for demo data
try {
  db.prepare(`UPDATE couples SET referral_source = 'Wedding Wire' WHERE id = 1 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Friend Referral' WHERE id = 2 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Google Search' WHERE id = 3 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Instagram' WHERE id = 4 AND referral_source IS NULL`).run();
} catch (_) {}

// Seed data function
function seedDatabase() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  console.log('Seeding database...');

  // Admin user
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
  `).run('Admin User', 'admin@rusticretreat.com', adminHash, 'admin');

  db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
  `).run('Sarah Mitchell', 'sarah@rusticretreat.com', bcrypt.hashSync('staff123', 10), 'staff');

  // Sample couples
  const coupleHash = bcrypt.hashSync('couple123', 10);

  const couple1 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Emma Johnson', 'Liam Wilson', 'emma.liam@example.com', '(555) 234-5678', coupleHash,
    '2026-09-15', 'Grand Estate', 'booked',
    'Outdoor ceremony preferred. Allergic to lilies.', 45000);

  const couple2 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Olivia Chen', 'Noah Martinez', 'olivia.noah@example.com', '(555) 345-6789', coupleHash,
    '2026-11-22', 'Garden Pavilion', 'booked',
    'Chinese-American fusion theme. Need Mandarin interpreter for ceremony.', 38000);

  const couple3 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Sophia Davis', 'Ethan Brown', 'sophia.ethan@example.com', '(555) 456-7890', coupleHash,
    '2027-06-05', 'Rustic Barn', 'inquiry',
    'Interested in barn venue. Still comparing options.', 25000);

  const couple4 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, wedding_date, status, notes, budget_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Ava Thompson', 'Mason Garcia', 'ava.mason@example.com', '(555) 567-8901',
    null, 'lead', 'Reached out via website contact form.', 0);

  // Bookings
  db.prepare(`
    INSERT INTO bookings (couple_id, event_date, start_time, end_time, package_name, guest_count, ceremony_location, reception_location, catering_type, special_requests, payment_status, deposit_paid, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple1.lastInsertRowid, '2026-09-15', '4:00 PM', '11:00 PM', 'Grand Estate', 180,
    'Rose Garden Terrace', 'Grand Ballroom', 'Full Catering',
    'Gluten-free options needed for 12 guests. Kosher meal for 2.',
    'partial', 10000, 45000);

  db.prepare(`
    INSERT INTO bookings (couple_id, event_date, start_time, end_time, package_name, guest_count, ceremony_location, reception_location, catering_type, special_requests, payment_status, deposit_paid, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple2.lastInsertRowid, '2026-11-22', '3:00 PM', '10:00 PM', 'Garden Pavilion', 120,
    'Fountain Courtyard', 'Garden Pavilion', 'Cocktail Reception',
    'Chinese tea ceremony setup needed in morning.',
    'partial', 8000, 38000);

  // Messages
  const msgs = [
    [couple1.lastInsertRowid, 'staff', 'Sarah Mitchell', 'Hello Emma & Liam! Welcome to Rustic Retreat. We\'re so excited to be part of your special day. Please let us know if you have any questions as you start planning!'],
    [couple1.lastInsertRowid, 'couple', 'Emma Johnson', 'Thank you so much! We\'re thrilled to be working with Rustic Retreat. We had a few questions about the floral arrangements and table settings.'],
    [couple1.lastInsertRowid, 'staff', 'Sarah Mitchell', 'Of course! We work with three amazing local florists. I\'ll send you their portfolios. For table settings, we have three collections: Rustic Elegance, Modern Minimalist, and Garden Romance.'],
    [couple2.lastInsertRowid, 'staff', 'Admin User', 'Hi Olivia & Noah! We received your signed contract. Congratulations on booking your wedding at Rustic Retreat for November 22nd!'],
    [couple2.lastInsertRowid, 'couple', 'Olivia Chen', 'Thank you! We\'re so excited. Quick question - can we schedule a tasting session for the catering menu?'],
  ];

  const insertMsg = db.prepare(`
    INSERT INTO messages (couple_id, sender_type, sender_name, content) VALUES (?, ?, ?, ?)
  `);
  msgs.forEach(m => insertMsg.run(...m));

  // Checklist items for couple 1
  const checklistItems = [
    [couple1.lastInsertRowid, 'Book officiant', 'Find and confirm ceremony officiant', '2026-01-15', 1, 'Ceremony'],
    [couple1.lastInsertRowid, 'Final guest list', 'Finalize guest list and send invitations', '2026-03-01', 1, 'Guests'],
    [couple1.lastInsertRowid, 'Choose wedding cake', 'Schedule tasting and select design', '2026-06-01', 0, 'Vendors'],
    [couple1.lastInsertRowid, 'Hair & makeup trial', 'Schedule trial with hair and makeup artist', '2026-07-15', 0, 'Beauty'],
    [couple1.lastInsertRowid, 'Finalize seating chart', 'Create seating arrangements for reception', '2026-08-15', 0, 'Guests'],
    [couple1.lastInsertRowid, 'Wedding rehearsal', 'Ceremony rehearsal with wedding party', '2026-09-14', 0, 'Ceremony'],
    [couple2.lastInsertRowid, 'Select flowers', 'Choose floral arrangements with florist', '2026-05-01', 0, 'Vendors'],
    [couple2.lastInsertRowid, 'Catering tasting', 'Schedule and attend catering tasting', '2026-07-01', 0, 'Catering'],
    [couple2.lastInsertRowid, 'Confirm guest dietary needs', 'Collect dietary restrictions from guests', '2026-09-01', 0, 'Guests'],
  ];

  const insertChecklist = db.prepare(`
    INSERT INTO checklist_items (couple_id, title, description, due_date, completed, category) VALUES (?, ?, ?, ?, ?, ?)
  `);
  checklistItems.forEach(item => insertChecklist.run(...item));

  // Guests for couple 1
  const guests = [
    [couple1.lastInsertRowid, 'Robert', 'Johnson', 'robert.j@example.com', '(555) 111-2222', 'accepted', 'chicken', 0, null],
    [couple1.lastInsertRowid, 'Patricia', 'Johnson', 'pat.j@example.com', '(555) 111-2223', 'accepted', 'vegetarian', 0, 'Gluten free'],
    [couple1.lastInsertRowid, 'James', 'Wilson', 'james.w@example.com', '(555) 222-3333', 'accepted', 'beef', 1, null],
    [couple1.lastInsertRowid, 'Linda', 'Wilson', 'linda.w@example.com', '(555) 222-3334', 'accepted', 'fish', 0, null],
    [couple1.lastInsertRowid, 'Michael', 'Smith', 'mike.s@example.com', '(555) 333-4444', 'pending', 'chicken', 1, null],
    [couple1.lastInsertRowid, 'Jennifer', 'Brown', 'jen.b@example.com', '(555) 444-5555', 'declined', null, 0, null],
    [couple1.lastInsertRowid, 'David', 'Taylor', 'david.t@example.com', '(555) 555-6666', 'accepted', 'beef', 0, null],
    [couple1.lastInsertRowid, 'Sarah', 'Anderson', 'sarah.a@example.com', '(555) 666-7777', 'pending', null, 0, null],
  ];

  const insertGuest = db.prepare(`
    INSERT INTO guests (couple_id, first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  guests.forEach(g => insertGuest.run(...g));

  // Budget items for couple 1
  const budgetItems = [
    [couple1.lastInsertRowid, 'Venue', 'Venue rental and setup', 15000, 15000, 1, 'Rustic Retreat', 'Includes ceremony and reception spaces'],
    [couple1.lastInsertRowid, 'Catering', 'Food and beverage service', 12000, 11500, 1, 'Gourmet Bites Co.', 'Per head pricing, 180 guests'],
    [couple1.lastInsertRowid, 'Photography', 'Full day wedding photography', 3500, 3500, 1, 'Golden Hour Photography', 'Includes engagement session'],
    [couple1.lastInsertRowid, 'Flowers', 'Ceremony and reception florals', 4000, 0, 0, 'Bloom & Blossom', 'Deposit due March 1'],
    [couple1.lastInsertRowid, 'Music', 'DJ for reception', 2000, 500, 0, 'Beats by Brandon', 'Deposit paid'],
    [couple1.lastInsertRowid, 'Cake', 'Wedding cake (5 tiers)', 800, 0, 0, null, 'Still selecting bakery'],
    [couple1.lastInsertRowid, 'Attire', 'Wedding dress and suits', 5000, 3200, 0, 'Bridal Dreams Boutique', 'Dress purchased, alterations pending'],
    [couple1.lastInsertRowid, 'Invitations', 'Save the dates and invitations', 600, 580, 1, 'Paper & Ink Studio', 'Completed'],
  ];

  const insertBudget = db.prepare(`
    INSERT INTO budget_items (couple_id, category, description, estimated_cost, actual_cost, paid, vendor_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  budgetItems.forEach(b => insertBudget.run(...b));

  // Vendors for couple 1
  const vendorList = [
    [couple1.lastInsertRowid, 'Photography', 'Golden Hour Photography', 'Marcus Reed', '(555) 777-8888', 'marcus@goldenhour.com', 'www.goldenhourphoto.com', 'Booked for full day coverage', 1],
    [couple1.lastInsertRowid, 'Catering', 'Gourmet Bites Co.', 'Chef Amanda Ross', '(555) 888-9999', 'amanda@gourmetbites.com', 'www.gourmetbites.com', 'Farm to table cuisine', 1],
    [couple1.lastInsertRowid, 'Music/DJ', 'Beats by Brandon', 'Brandon Lee', '(555) 999-0000', 'brandon@beatsbyb.com', 'www.beatsbybrandon.com', 'Great reviews, very professional', 1],
    [couple1.lastInsertRowid, 'Florals', 'Bloom & Blossom', 'Claire Whitman', '(555) 123-4567', 'claire@bloombloss.com', 'www.bloomandblossom.com', 'Rustic wildflower style', 1],
    [couple1.lastInsertRowid, 'Hair & Makeup', 'Glamour Studio', 'Tina Park', '(555) 234-5678', 'tina@glamourstudio.com', null, 'Trial scheduled for July', 0],
  ];

  const insertVendor = db.prepare(`
    INSERT INTO vendors (couple_id, vendor_type, business_name, contact_name, phone, email, website, notes, booked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  vendorList.forEach(v => insertVendor.run(...v));

  // Timeline events for couple 1
  const timeline = [
    [couple1.lastInsertRowid, '2:00 PM', 'Bridal Party Arrives', 'Wedding party arrives for final preparations', 'Bridal Suite', 60, 1],
    [couple1.lastInsertRowid, '3:30 PM', 'Guest Arrival', 'Guests begin arriving and are seated', 'Rose Garden Terrace', 30, 2],
    [couple1.lastInsertRowid, '4:00 PM', 'Ceremony Begins', 'Wedding ceremony starts', 'Rose Garden Terrace', 45, 3],
    [couple1.lastInsertRowid, '4:45 PM', 'Cocktail Hour', 'Cocktails and appetizers while couple takes photos', 'Fountain Courtyard', 60, 4],
    [couple1.lastInsertRowid, '5:45 PM', 'Reception Doors Open', 'Guests move to reception hall', 'Grand Ballroom', 15, 5],
    [couple1.lastInsertRowid, '6:00 PM', 'Grand Entrance', 'Introduction of wedding party and couple', 'Grand Ballroom', 15, 6],
    [couple1.lastInsertRowid, '6:15 PM', 'First Dance', 'Couple\'s first dance', 'Grand Ballroom', 10, 7],
    [couple1.lastInsertRowid, '6:30 PM', 'Dinner Service', 'Sit-down dinner', 'Grand Ballroom', 90, 8],
    [couple1.lastInsertRowid, '8:00 PM', 'Toasts & Speeches', 'Best man and maid of honor speeches', 'Grand Ballroom', 30, 9],
    [couple1.lastInsertRowid, '8:30 PM', 'Cake Cutting', 'Wedding cake cutting ceremony', 'Grand Ballroom', 15, 10],
    [couple1.lastInsertRowid, '8:45 PM', 'Dancing', 'Open dancing floor', 'Grand Ballroom', 135, 11],
    [couple1.lastInsertRowid, '11:00 PM', 'Last Dance & Farewell', 'Final song and sparkler send-off', 'Grand Ballroom Entrance', 30, 12],
  ];

  const insertTimeline = db.prepare(`
    INSERT INTO timeline_events (couple_id, time, title, description, location, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  timeline.forEach(t => insertTimeline.run(...t));

  // Tasks
  const taskList = [
    ['Follow up with Sophia & Ethan', 'They submitted an inquiry 3 days ago. Schedule a venue tour.', 'Sarah Mitchell', couple3.lastInsertRowid, '2026-06-15', 'high', 0],
    ['Prepare venue tour packet', 'Create updated brochure with 2027 pricing', 'Admin User', null, '2026-06-20', 'medium', 0],
    ['Send contract to Emma & Liam', 'Final contract review and send for signature', 'Sarah Mitchell', couple1.lastInsertRowid, '2026-06-12', 'high', 1],
    ['Update vendor directory', 'Add new florist contacts to vendor list', 'Admin User', null, '2026-06-30', 'low', 0],
    ['Confirm catering tasting - Olivia & Noah', 'Schedule date for catering tasting session', 'Sarah Mitchell', couple2.lastInsertRowid, '2026-07-01', 'medium', 0],
  ];

  const insertTask = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, couple_id, due_date, priority, completed) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  taskList.forEach(t => insertTask.run(...t));

  // Seed contracts with full event details for the two booked couples
  const contractBody = `1. VENUE RENTAL
The Venue agrees to reserve the property exclusively for the Clients' event on the date and times specified above. The rental includes use of all designated event spaces, tables, chairs, and standard decor as outlined in the selected package.

2. PAYMENT TERMS
A non-refundable deposit of 25% of the total package price is required to secure the date. The remaining balance is due no later than 30 days prior to the event date. Payments may be made by check, credit card, or bank transfer.

3. CANCELLATION POLICY
Cancellations made more than 90 days before the event will forfeit the deposit only. Cancellations within 60–90 days will incur a charge of 50% of the total balance. Cancellations within 60 days of the event will incur a charge of 100% of the total balance.

4. VENDOR ACCESS
All vendors must carry their own liability insurance and provide proof upon request.

5. DAMAGE & LIABILITY
Clients are responsible for any damage to the Venue property caused by the Clients, their guests, or their vendors.

6. GOVERNING LAW
This Agreement shall be governed by the laws of the state in which the Venue is located.

IN WITNESS WHEREOF, the Clients have read, understood, and agree to be legally bound by the terms of this Agreement.`;

  const contract1Content = `RUSTIC RETREAT WEDDING VENUE\nEVENT SERVICES AGREEMENT\n\nThis Event Services Agreement is entered into between Rustic Retreat Wedding Venue ("Venue") and the clients identified below ("Clients").\n\nEVENT DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nClients:              Emma Johnson & Liam Wilson\nWedding Date:         September 15, 2026\nEvent Hours:          4:00 PM – 11:00 PM\nGuest Count:          180 guests\nPackage:              Grand Estate\nCeremony Location:    Rose Garden Terrace\nReception Location:   Grand Ballroom\nTotal Contract Price: $45,000.00\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + contractBody;

  const contract2Content = `RUSTIC RETREAT WEDDING VENUE\nEVENT SERVICES AGREEMENT\n\nThis Event Services Agreement is entered into between Rustic Retreat Wedding Venue ("Venue") and the clients identified below ("Clients").\n\nEVENT DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nClients:              Olivia Chen & Noah Martinez\nWedding Date:         November 22, 2026\nEvent Hours:          3:00 PM – 10:00 PM\nGuest Count:          120 guests\nPackage:              Garden Pavilion\nCeremony Location:    Fountain Courtyard\nReception Location:   Garden Pavilion\nTotal Contract Price: $38,000.00\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + contractBody;

  const c1 = db.prepare(`
    INSERT INTO contracts (couple_id, title, content, status, signed_at, signer_name,
      wedding_date, start_time, end_time, guest_count, ceremony_location, reception_location,
      package_name, total_price, portal_credentials_sent)
    VALUES (?, ?, ?, 'signed', datetime('now', '-30 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(couple1.lastInsertRowid, 'Event Services Agreement', contract1Content,
    'Emma Johnson', '2026-09-15', '4:00 PM', '11:00 PM', 180,
    'Rose Garden Terrace', 'Grand Ballroom', 'Grand Estate', 45000);

  const c2 = db.prepare(`
    INSERT INTO contracts (couple_id, title, content, status, signed_at, signer_name,
      wedding_date, start_time, end_time, guest_count, ceremony_location, reception_location,
      package_name, total_price, portal_credentials_sent)
    VALUES (?, ?, ?, 'signed', datetime('now', '-15 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(couple2.lastInsertRowid, 'Event Services Agreement', contract2Content,
    'Olivia Chen', '2026-11-22', '3:00 PM', '10:00 PM', 120,
    'Fountain Courtyard', 'Garden Pavilion', 'Garden Pavilion', 38000);

  // Seed invoices / payment schedules for the two booked couples
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, paid, paid_at, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Emma & Liam (couple1, booking1) — deposit paid, 2nd due soon, final due later
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Booking Deposit (25%)', 11250, '2026-04-01', 1, '2026-04-01T10:00:00Z', 'Credit Card');
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Second Payment (25%) — 90 days before event', 11250, '2026-06-17', 0, null, null);
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Final Balance (50%) — 30 days before event', 22500, '2026-08-16', 0, null, null);

  // Olivia & Noah (couple2, booking2) — deposit paid
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Booking Deposit (25%)', 9500, '2026-04-15', 1, '2026-04-18T14:00:00Z', 'Bank Transfer');
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Second Payment (25%) — 90 days before event', 9500, '2026-08-24', 0, null, null);
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Final Balance (50%) — 30 days before event', 19000, '2026-10-23', 0, null, null);

  // Seed packages
  const pkgCount = db.prepare('SELECT COUNT(*) as count FROM packages').get();
  if (pkgCount.count === 0) {
    const insertPkg = db.prepare(`
      INSERT INTO packages (name, description, price, max_guests, includes) VALUES (?, ?, ?, ?, ?)
    `);
    [
      ['Elopement Package', 'A simple, beautiful ceremony for just the two of you and your closest loved ones.', 5000, 20, 'Intimate ceremony space, 4 hrs venue access, Basic florals, Officiant coordination, Champagne toast'],
      ['Intimate Garden', 'Perfect for smaller, intimate celebrations in our beautiful Garden Pavilion.', 18000, 80, 'Garden Pavilion, Fountain Courtyard, 8 hrs venue access, Tables & chairs, Standard lighting, Bridal suite access'],
      ['Rustic Barn', 'A charming barn wedding experience with rustic decor and countryside charm.', 25000, 150, 'Rustic Barn exclusive use, Outdoor ceremony space, 9 hrs venue access, Rustic furniture, String lights, Getting ready rooms'],
      ['Grand Estate', 'Our most popular full-venue package. Exclusive access to all ceremony and reception spaces.', 45000, 200, 'Full venue exclusive use, Rose Garden Terrace, Grand Ballroom, 10 hrs venue access, Premium furniture, Custom lighting, Two bridal suites, Day-of coordinator'],
    ].forEach(p => insertPkg.run(...p));
  }

  console.log('Database seeded successfully!');
}

seedDatabase();

module.exports = db;
