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
  'ALTER TABLE bookings ADD COLUMN add_ons TEXT',
]) { try { db.exec(col); } catch (_) {} }

// Backfill sample referral sources for demo data
try {
  db.prepare(`UPDATE couples SET referral_source = 'Friend Referral' WHERE id = 1 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Wedding Wire' WHERE id = 2 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Google Search' WHERE id = 3 AND referral_source IS NULL`).run();
  db.prepare(`UPDATE couples SET referral_source = 'Instagram' WHERE id = 4 AND referral_source IS NULL`).run();
} catch (_) {}

// Replace generic packages with real Rustic Retreat packages
try {
  const needsReset = db.prepare("SELECT id FROM packages WHERE name IN ('Grand Estate', 'Intimate Garden', 'Elopement Package')").get();
  if (needsReset) {
    db.prepare('DELETE FROM packages').run();
    [
      ['2-Day Weekday Escape', 'A focused weekday elopement with complete exclusive property access. Perfect for intimate celebrations with your closest people.', 5000, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Lawn games & activities, Firewood & propane BBQ'],
      ['3-Day Weekend', 'Our most popular package — Friday to Sunday. 60 hours together instead of 6. The complete Rustic Retreat experience.', 6500, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Rehearsal dinner evening, Lawn games & activities, Firewood & propane BBQ'],
      ['5-Day Experience', 'Wednesday/Thursday through Sunday/Monday. The full immersive experience — guests arrive gradually, activities unfold naturally, no one is rushed.', 7500, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Multiple evenings of campfire gatherings, Lawn games & activities, Firewood & propane BBQ'],
    ].forEach(p => db.prepare(`INSERT INTO packages (name, description, price, max_guests, includes) VALUES (?, ?, ?, ?, ?)`).run(...p));
  }
} catch (_) {}

// Seed data function
function seedDatabase() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  console.log('Seeding database...');

  // Staff users
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run('Kris Wemet', 'admin@rusticretreat.com', bcrypt.hashSync('admin123', 10), 'admin');
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run('Sarah Mitchell', 'sarah@rusticretreat.com', bcrypt.hashSync('staff123', 10), 'staff');

  const coupleHash = bcrypt.hashSync('couple123', 10);

  // Couple 1: Sarah & Jake — Booked, 3-Day Weekend, September 2026
  const couple1 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total, referral_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Sarah Larsson', 'Jake Novak', 'sarah.jake@example.com', '(780) 555-1234', coupleHash,
    '2026-09-19', '3-Day Weekend', 'booked',
    'Forest ceremony preferred. Dog (Maple) attending — $50 pet fee paid. AGLC licence in progress. Vegetarian options needed for ~10 guests.', 6500, 'Friend Referral');

  // Couple 2: Megan & Ryan — Booked, 5-Day Experience, August 2026
  const couple2 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total, referral_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Megan Sinclair', "Ryan O'Brien", 'megan.ryan@example.com', '(780) 555-2345', coupleHash,
    '2026-08-07', '5-Day Experience', 'booked',
    "Extended family gathering vibe. 12 tent campers, 6 RVs confirmed. Caterer: Okonkwo Catering (Edmonton). Generator rental needed. AGLC licence obtained.", 7500, 'Wedding Wire');

  // Couple 3: Kayla & Jordan — Inquiry, 3-Day Weekend Summer 2027
  const couple3 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, password_hash, wedding_date, venue_package, status, notes, budget_total, referral_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Kayla Park', 'Jordan Walsh', 'kayla.jordan@example.com', '(780) 555-3456', coupleHash,
    '2027-07-09', '3-Day Weekend', 'inquiry',
    'Toured property June 10 — loved the Poplar Grove area. Comparing with one other venue. Following up mid-July.', 6500, 'Google Search');

  // Couple 4: Amanda & Cole — Lead, no portal account yet
  const couple4 = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, phone, wedding_date, status, notes, budget_total, referral_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Amanda Tremblay', 'Cole Girard', 'amanda.cole@example.com', '(825) 555-4567',
    null, 'lead', 'Submitted website inquiry. Planning June 2027 wedding. About 55 guests. Asked about fireworks.', 0, 'Instagram');

  // Bookings
  db.prepare(`
    INSERT INTO bookings (couple_id, event_date, start_time, end_time, package_name, guest_count,
      ceremony_location, reception_location, catering_type, special_requests, payment_status, deposit_paid, total_price, add_ons)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple1.lastInsertRowid, '2026-09-19', 'Fri 8:00 AM', 'Sun 8:00 PM', '3-Day Weekend', 62,
    'Forest Clearing', 'Clear-Top Gazebo',
    'Self-arranged: BBQ potluck Friday, food truck Saturday (The Wandering Fork YEG)',
    'Dog Maple attending ceremony. AGLC licence application submitted. 8 tent campers, 2 RVs.',
    'partial', 1625, 6500, 'Fireworks – $250, Pet cabin stay – $50');

  db.prepare(`
    INSERT INTO bookings (couple_id, event_date, start_time, end_time, package_name, guest_count,
      ceremony_location, reception_location, catering_type, special_requests, payment_status, deposit_paid, total_price, add_ons)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple2.lastInsertRowid, '2026-08-07', 'Fri 8:00 AM', 'Mon 8:00 PM', '5-Day Experience', 45,
    'Poplar Grove', 'Clear-Top Gazebo',
    'Okonkwo Catering Edmonton (self-contained unit, no venue kitchen needed)',
    '12 tent campers, 6 RVs. Generator rental needed for caterer. AGLC licence obtained June 2026.',
    'partial', 1875, 7500, 'Generator rental');

  // Messages
  const insertMsg = db.prepare(`INSERT INTO messages (couple_id, sender_type, sender_name, content) VALUES (?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, 'staff', 'Kris Wemet', "Hi Sarah & Jake! Welcome to the Rustic Retreat family 🎉 We're so thrilled you chose us for your 3-Day Weekend in September. Please reach out any time with questions — we're here for you!"],
    [couple1.lastInsertRowid, 'couple', 'Sarah Larsson', "Thank you so much! We're so excited. Quick question — is there flexibility on when our vendors can arrive Friday to start setting up?"],
    [couple1.lastInsertRowid, 'staff', 'Kris Wemet', "Absolutely! Vendors can access the property from 8am on Friday (your check-in day). Just have them reach out so we can coordinate arrival times."],
    [couple2.lastInsertRowid, 'staff', 'Sarah Mitchell', "Hi Megan & Ryan! Congratulations on signing your 5-Day Experience contract — this is going to be such an amazing week at the property!"],
    [couple2.lastInsertRowid, 'couple', 'Megan Sinclair', "We're absolutely counting the days! Our caterer (Okonkwo Catering) would love to do a quick site visit before August 7 to plan their setup. Is that possible?"],
  ].forEach(m => insertMsg.run(...m));

  // Checklist for couple 1 (Sarah & Jake)
  const insertChecklist = db.prepare(`INSERT INTO checklist_items (couple_id, title, description, due_date, completed, category) VALUES (?, ?, ?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, 'Obtain AGLC Special Event Licence', 'Required by Alberta law to serve alcohol. Apply at least 4 weeks before event at AGLC.ca.', '2026-08-22', 0, 'Legal'],
    [couple1.lastInsertRowid, 'Confirm food & catering plan', 'No kitchen on-site. Finalize food truck booking (Sat) and BBQ potluck plan (Fri).', '2026-07-15', 1, 'Catering'],
    [couple1.lastInsertRowid, 'Confirm guest camping & RV count', 'Max 60 overnight guests — share final tent/RV headcount with venue by Aug 1.', '2026-08-01', 0, 'Guests'],
    [couple1.lastInsertRowid, 'Review site rules with wedding party', 'Share quiet hours (11pm), generator shutoff (10pm), décor rules, and fire safety with all guests.', '2026-08-15', 0, 'Planning'],
    [couple1.lastInsertRowid, 'Book officiant', 'Confirm ceremony officiant and share weekend schedule.', '2026-06-30', 1, 'Ceremony'],
    [couple1.lastInsertRowid, 'Plan guest transportation', 'Rustic Retreat is 1 hr NW of Edmonton. Arrange carpools or nearby Airbnb shuttles for non-campers.', '2026-08-15', 0, 'Logistics'],
    [couple1.lastInsertRowid, 'Ceremony rehearsal evening', 'Walk-through in Forest Clearing with wedding party — Friday evening works perfectly.', '2026-09-18', 0, 'Ceremony'],
    [couple1.lastInsertRowid, 'Finalize weekend timeline', 'Share complete Fri–Sun schedule with venue and all vendors at least 2 weeks before.', '2026-09-05', 0, 'Planning'],
  ].forEach(item => insertChecklist.run(...item));

  // Guests for couple 1
  const insertGuest = db.prepare(`INSERT INTO guests (couple_id, first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, 'Linda', 'Larsson', 'linda.l@example.com', '(780) 555-0001', 'accepted', null, 0, null, 'Camping – tent'],
    [couple1.lastInsertRowid, 'Peter', 'Larsson', 'peter.l@example.com', '(780) 555-0002', 'accepted', null, 0, null, 'Camping – tent'],
    [couple1.lastInsertRowid, 'Dana', 'Novak', 'dana.n@example.com', '(780) 555-0003', 'accepted', null, 0, 'Gluten free', 'RV parking spot #1'],
    [couple1.lastInsertRowid, 'Greg', 'Novak', 'greg.n@example.com', '(780) 555-0004', 'accepted', null, 1, null, 'RV parking spot #1'],
    [couple1.lastInsertRowid, 'Emma', 'Clarke', 'emma.c@example.com', '(780) 555-0005', 'accepted', null, 0, 'Vegetarian', 'Off-site – Lac La Nonne Airbnb'],
    [couple1.lastInsertRowid, 'Tyler', 'Booth', 'tyler.b@example.com', '(587) 555-0006', 'pending', null, 1, null, null],
    [couple1.lastInsertRowid, 'Rachel', 'Kim', 'rachel.k@example.com', '(587) 555-0007', 'declined', null, 0, null, 'Travelling — unable to attend'],
    [couple1.lastInsertRowid, 'Marcus', 'Webb', 'marcus.w@example.com', '(780) 555-0008', 'accepted', null, 0, null, 'Camping – tent'],
  ].forEach(g => insertGuest.run(...g));

  // Budget items for couple 1
  const insertBudget = db.prepare(`INSERT INTO budget_items (couple_id, category, description, estimated_cost, actual_cost, paid, vendor_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, 'Venue', '3-Day Weekend Package', 6500, 6500, 1, 'Rustic Retreat Weddings', 'Cabin, all amenities, sound system, décor collection included'],
    [couple1.lastInsertRowid, 'Photography', 'Full weekend photography coverage', 3200, 3200, 1, 'Northern Light Photography', 'Fri evening through Sun ceremony & reception'],
    [couple1.lastInsertRowid, 'Catering', 'Food truck — Saturday evening', 2800, 0, 0, 'The Wandering Fork YEG', 'Deposit due July 1 — self-contained unit, no kitchen needed'],
    [couple1.lastInsertRowid, 'Florals', 'Bridal bouquet & ceremony arch florals', 1400, 0, 0, 'Bloom & Co Barrhead', 'Local florist near venue — arch provided, florals only'],
    [couple1.lastInsertRowid, 'Music / DJ', 'DJ for Saturday reception', 1800, 900, 0, 'DJ Altitude Edmonton', 'Deposit paid. Venue sound system included in package.'],
    [couple1.lastInsertRowid, 'Officiant', 'Ceremony officiant fee', 500, 500, 1, 'Rev. Catherine Wong', 'Confirmed — script reviewed'],
    [couple1.lastInsertRowid, 'Attire', 'Wedding dress and suit', 3800, 2200, 0, 'Bridal Dreams Edmonton', 'Dress purchased, suit alterations pending'],
    [couple1.lastInsertRowid, 'Add-Ons', 'Fireworks (venue-coordinated) + pet cabin fee', 300, 300, 1, 'Rustic Retreat Weddings', 'Fireworks $250 + Maple pet fee $50'],
  ].forEach(b => insertBudget.run(...b));

  // Vendors for couple 1
  const insertVendor = db.prepare(`INSERT INTO vendors (couple_id, vendor_type, business_name, contact_name, phone, email, website, notes, booked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, 'Photography', 'Northern Light Photography', 'Alex Drummond', '(780) 555-7001', 'alex@northernlightphoto.ca', 'northernlightphoto.ca', 'Has shot at Rustic Retreat before. Booked Fri–Sun.', 1],
    [couple1.lastInsertRowid, 'Catering', 'The Wandering Fork YEG', 'Maria Santos', '(780) 555-7002', 'maria@wanderingfork.ca', 'wanderingforkyeg.ca', 'Self-contained food truck. Deposit pending — confirm by July 1.', 0],
    [couple1.lastInsertRowid, 'Music / DJ', 'DJ Altitude Edmonton', 'Brennan Lake', '(780) 555-7003', 'brennan@djaltitude.ca', 'djaltitude.ca', 'Using venue sound system. Saturday 6pm–midnight.', 1],
    [couple1.lastInsertRowid, 'Florals', 'Bloom & Co Barrhead', 'Wendy Okafor', '(780) 555-7004', 'wendy@bloomco.ca', null, 'Local florist — bridal bouquet + arch draping only.', 0],
    [couple1.lastInsertRowid, 'Officiant', 'Independent', 'Rev. Catherine Wong', '(780) 555-7005', 'cat.wong@email.ca', null, 'Confirmed. Script reviewed with couple.', 1],
  ].forEach(v => insertVendor.run(...v));

  // Day-of timeline for couple 1 (Saturday is wedding ceremony day)
  const insertTimeline = db.prepare(`INSERT INTO timeline_events (couple_id, time, title, description, location, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  [
    [couple1.lastInsertRowid, '10:00 AM', 'Getting Ready', 'Hair, makeup, and final prep in the Newlywed Cabin', 'Newlywed Cabin', 120, 1],
    [couple1.lastInsertRowid, '12:00 PM', 'Backyard Lunch', 'Casual lunch for early guests — BBQ and salads by the fire pit', 'Fire Pit Area', 90, 2],
    [couple1.lastInsertRowid, '3:00 PM', 'Guests Gather', 'Guests make their way to Forest Clearing', 'Forest Clearing', 30, 3],
    [couple1.lastInsertRowid, '3:30 PM', 'Ceremony', 'Wedding ceremony with Rev. Catherine Wong', 'Forest Clearing', 45, 4],
    [couple1.lastInsertRowid, '4:15 PM', 'Cocktail Hour & Photos', 'Drinks, lawn games, and couple portraits on the trails', 'Meadow & Trails', 75, 5],
    [couple1.lastInsertRowid, '5:30 PM', 'Dinner Opens', 'The Wandering Fork YEG food truck opens for dinner', 'Clear-Top Gazebo', 90, 6],
    [couple1.lastInsertRowid, '7:00 PM', 'Toasts & First Dance', 'Wedding party speeches and couple first dance', 'Clear-Top Gazebo', 45, 7],
    [couple1.lastInsertRowid, '7:45 PM', 'Open Dancing', 'DJ Altitude opens the dance floor', 'Clear-Top Gazebo', 165, 8],
    [couple1.lastInsertRowid, '10:30 PM', 'Fireworks', 'Venue-coordinated fireworks display', 'Back Field', 15, 9],
    [couple1.lastInsertRowid, '10:45 PM', 'Campfire Wind-Down', 'Music off by midnight — fire pit and conversation continue', 'Fire Pit Area', 75, 10],
    [couple1.lastInsertRowid, '12:00 AM', 'Quiet Hours Begin', 'Amplified music ends per property rules', 'Property-wide', 0, 11],
  ].forEach(t => insertTimeline.run(...t));

  // Tasks
  const insertTask = db.prepare(`INSERT INTO tasks (title, description, assigned_to, couple_id, due_date, priority, completed) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Follow up with Amanda & Cole', 'New website inquiry — reach out about a property tour and 2027 availability.', 'Kris Wemet', couple4.lastInsertRowid, '2026-06-28', 'high', 0],
    ['Chase AGLC licence — Sarah & Jake', "Confirm Sarah & Jake have submitted their AGLC Special Event Licence application.", 'Sarah Mitchell', couple1.lastInsertRowid, '2026-07-15', 'high', 0],
    ['Coordinate caterer site visit — Megan & Ryan', "Okonkwo Catering wants to visit before Aug 7. Arrange with Kris.", 'Sarah Mitchell', couple2.lastInsertRowid, '2026-07-01', 'medium', 0],
    ['Property prep — Megan & Ryan event Aug 7', 'Mow trails, test sound system, restock firewood, prep cabins. Event starts Aug 7.', 'Kris Wemet', couple2.lastInsertRowid, '2026-08-04', 'high', 0],
    ['Update 2027 pricing guide', 'Create updated one-pager with 2027 package prices and inclusions to send to inquiries.', 'Kris Wemet', null, '2026-07-15', 'medium', 0],
    ['Schedule Kayla & Jordan second visit', 'They toured June 10 and loved it. Following up to book or close.', 'Sarah Mitchell', couple3.lastInsertRowid, '2026-07-10', 'medium', 0],
  ].forEach(t => insertTask.run(...t));

  // Contracts (real Rustic Retreat Alberta terms)
  const sharedTerms = `1. EXCLUSIVE USE & DURATION
The entire Rustic Retreat property is reserved exclusively for the Clients during the full package period. Check-in is 8:00 AM on the first day; checkout is 8:00 PM on the final day. No other events will be hosted during this time.

2. PAYMENT TERMS
A non-refundable deposit of 25% of the total package price is required to secure the date. Remaining payments are scheduled per this agreement. The venue accepts e-transfer, credit card, or cheque.

3. CANCELLATION POLICY
Cancellations more than 90 days before the event forfeit the deposit only. Cancellations within 60–90 days incur a charge of 50% of the total. Cancellations within 60 days incur 100% of the total balance.

4. ALCOHOL & AGLC LICENSING
Clients are responsible for obtaining an AGLC (Alberta Gaming, Liquor & Cannabis) Special Event Licence. All bar service must comply with Alberta liquor laws. Rustic Retreat staff may hold vehicle keys to prevent impaired driving. ID checks are required for anyone appearing under 25.

5. QUIET HOURS
Amplified music must be reduced to a minimal level at the property line by 11:00 PM Sunday through Thursday, and by midnight on Friday, Saturday, and the wedding night. All guest generators must be turned off by 10:00 PM, no exceptions.

6. OFF-GRID PROPERTY & POWER
The property runs entirely on solar power. Clients must disclose all electrical requirements in advance. Generator rentals are available for additional power needs and must be arranged before the event.

7. VENDORS & CATERING
Clients may bring any licensed and insured vendors. There is no kitchen on-site — all food service must be self-contained. Vendors must carry their own liability insurance. All fireworks must be purchased and coordinated through Rustic Retreat.

8. DÉCOR & PROPERTY CARE
Nothing may be nailed, screwed, or stapled to any structure, tree, arch, or table. Loose glitter and confetti are prohibited. All borrowed décor items must be cleaned and returned to the décor shed before checkout.

9. PETS
Well-behaved, pre-approved pets are welcome. Pets staying in the cabin incur a $50 cleaning fee. No pets in the Bridal Suite or Décor Shed.

10. DAMAGE & LIABILITY
Clients are responsible for all damage caused by Clients, their guests, or their vendors.

11. GOVERNING LAW
This Agreement is governed by the laws of the Province of Alberta, Canada.

IN WITNESS WHEREOF, the Clients confirm they have read and agree to be legally bound by the terms of this Agreement.`;

  const contract1Content = `RUSTIC RETREAT WEDDINGS\nEVENT SERVICES AGREEMENT — Alberta, Canada\n\nThis Event Services Agreement is entered into between Rustic Retreat Weddings ("Venue") and the clients identified below ("Clients").\n\nEVENT DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nClients:              Sarah Larsson & Jake Novak\nPackage:              3-Day Weekend (Fri–Sun)\nEvent Dates:          September 19–21, 2026\nCheck-In / Out:       Fri 8:00 AM / Sun 8:00 PM\nGuest Count:          62 guests\nCeremony Location:    Forest Clearing\nReception / Dancing:  Clear-Top Gazebo\nTotal Price:          $6,500.00 CAD + GST\n\nADD-ONS: Fireworks – $250.00 · Pet cabin stay – $50.00\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + sharedTerms;

  const contract2Content = `RUSTIC RETREAT WEDDINGS\nEVENT SERVICES AGREEMENT — Alberta, Canada\n\nThis Event Services Agreement is entered into between Rustic Retreat Weddings ("Venue") and the clients identified below ("Clients").\n\nEVENT DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nClients:              Megan Sinclair & Ryan O'Brien\nPackage:              5-Day Experience (Fri–Mon)\nEvent Dates:          August 7–11, 2026\nCheck-In / Out:       Fri 8:00 AM / Mon 8:00 PM\nGuest Count:          45 guests\nCeremony Location:    Poplar Grove\nReception / Dancing:  Clear-Top Gazebo\nTotal Price:          $7,500.00 CAD + GST\n\nADD-ONS: Generator rental (caterer power)\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + sharedTerms;

  db.prepare(`
    INSERT INTO contracts (couple_id, title, content, status, signed_at, signer_name,
      wedding_date, start_time, end_time, guest_count, ceremony_location, reception_location,
      package_name, total_price, portal_credentials_sent)
    VALUES (?, ?, ?, 'signed', datetime('now', '-45 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(couple1.lastInsertRowid, '3-Day Weekend Event Services Agreement', contract1Content,
    'Sarah Larsson', '2026-09-19', 'Fri 8:00 AM', 'Sun 8:00 PM', 62,
    'Forest Clearing', 'Clear-Top Gazebo', '3-Day Weekend', 6500);

  db.prepare(`
    INSERT INTO contracts (couple_id, title, content, status, signed_at, signer_name,
      wedding_date, start_time, end_time, guest_count, ceremony_location, reception_location,
      package_name, total_price, portal_credentials_sent)
    VALUES (?, ?, ?, 'signed', datetime('now', '-60 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(couple2.lastInsertRowid, '5-Day Experience Event Services Agreement', contract2Content,
    'Megan Sinclair', '2026-08-07', 'Fri 8:00 AM', 'Mon 8:00 PM', 45,
    'Poplar Grove', 'Clear-Top Gazebo', '5-Day Experience', 7500);

  // Invoices — realistic Rustic Retreat CAD pricing
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, paid, paid_at, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sarah & Jake ($6,500): deposit paid, 2nd payment due today, final due Aug
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Booking Deposit (25%)', 1625, '2026-04-15', 1, '2026-04-15T11:00:00Z', 'E-Transfer');
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Second Payment (25%) — 90 days before event', 1625, '2026-06-21', 0, null, null);
  insertInvoice.run(couple1.lastInsertRowid, 1, 'Final Balance (50%) — 30 days before event', 3250, '2026-08-21', 0, null, null);

  // Megan & Ryan ($7,500): deposit paid, 2nd payment overdue, final due July
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Booking Deposit (25%)', 1875, '2026-03-20', 1, '2026-03-22T09:00:00Z', 'E-Transfer');
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Second Payment (25%) — 90 days before event', 1875, '2026-05-09', 0, null, null);
  insertInvoice.run(couple2.lastInsertRowid, 2, 'Final Balance (50%) — 30 days before event', 3750, '2026-07-08', 0, null, null);

  // Seed packages
  const pkgCount = db.prepare('SELECT COUNT(*) as count FROM packages').get();
  if (pkgCount.count === 0) {
    [
      ['2-Day Weekday Escape', 'A focused weekday elopement with complete exclusive property access. Perfect for intimate celebrations with your closest people.', 5000, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Lawn games & activities, Firewood & propane BBQ'],
      ['3-Day Weekend', 'Our most popular package — Friday to Sunday. 60 hours together instead of 6. The complete Rustic Retreat experience.', 6500, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Rehearsal dinner evening, Lawn games & activities, Firewood & propane BBQ'],
      ['5-Day Experience', 'Wednesday/Thursday through Sunday/Monday. The full immersive experience — guests arrive gradually, activities unfold naturally, no one is rushed.', 7500, 80, '65 acres exclusive use, Ceremony forest spaces, Clear-Top Gazebo, Newlywed cabin, Camping for guests, Sound system & wireless mics, Décor collection, Multiple evenings of campfire gatherings, Lawn games & activities, Firewood & propane BBQ'],
    ].forEach(p => db.prepare(`INSERT INTO packages (name, description, price, max_guests, includes) VALUES (?, ?, ?, ?, ?)`).run(...p));
  }

  console.log('Database seeded successfully!');
}

seedDatabase();

module.exports = db;
