const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'drivehub.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper for promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables and seed default data
async function initializeDatabase() {
  await run(`PRAGMA foreign_keys = ON;`);

  // 1. Users Table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Folders (Sidebar items / Pages)
  await run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      icon TEXT DEFAULT 'bi-folder2',
      color TEXT DEFAULT '#4f46e5',
      description TEXT,
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Drive Cards Table
  await run(`
    CREATE TABLE IF NOT EXISTS drive_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      drive_url TEXT NOT NULL,
      resource_type TEXT DEFAULT 'folder',
      tags TEXT,
      is_starred INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    )
  `);

  // Seed default admin and user if not exists
  const adminUser = await get(`SELECT * FROM users WHERE username = ?`, ['admin']);
  if (!adminUser) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
      ['admin', adminHash, 'System Administrator', 'admin']
    );
    console.log('Seeded default admin user: admin / admin123');
  }

  const standardUser = await get(`SELECT * FROM users WHERE username = ?`, ['user']);
  if (!standardUser) {
    const userHash = bcrypt.hashSync('user123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
      ['user', userHash, 'Team Member', 'user']
    );
    console.log('Seeded default user: user / user123');
  }

  // Seed initial folders if empty
  const folderCount = await get(`SELECT COUNT(*) as count FROM folders`);
  if (folderCount && folderCount.count === 0) {
    console.log('Seeding initial folders and Google Drive cards...');

    const foldersData = [
      {
        name: 'Company Drive',
        slug: 'company-drive',
        icon: 'bi-building-fill',
        color: '#4f46e5',
        description: 'Core organizational assets, executive documents, and company-wide policies.',
        order_index: 1
      },
      {
        name: 'Marketing & Brand',
        slug: 'marketing-brand',
        icon: 'bi-megaphone-fill',
        color: '#ea580c',
        description: 'Brand guides, media kits, ad campaign creatives, and social media materials.',
        order_index: 2
      },
      {
        name: 'Product & Engineering',
        slug: 'product-engineering',
        icon: 'bi-cpu-fill',
        color: '#0284c7',
        description: 'Architecture blueprints, API specs, sprint roadmaps, and tech diagrams.',
        order_index: 3
      },
      {
        name: 'Finance & Invoices',
        slug: 'finance-invoices',
        icon: 'bi-cash-coin',
        color: '#16a34a',
        description: 'Budget spreadsheets, quarter reports, purchase receipts, and audit books.',
        order_index: 4
      },
      {
        name: 'Human Resources',
        slug: 'human-resources',
        icon: 'bi-people-fill',
        color: '#9333ea',
        description: 'Staff directory, onboarding packs, compliance forms, and holiday policies.',
        order_index: 5
      }
    ];

    for (const f of foldersData) {
      const result = await run(
        `INSERT INTO folders (name, slug, icon, color, description, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
        [f.name, f.slug, f.icon, f.color, f.description, f.order_index]
      );
      const folderId = result.lastID;

      // Seed Drive cards per folder
      if (f.slug === 'company-drive') {
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'All-Hands Company Presentations 2026',
            'Monthly town hall decks, corporate milestones, and executive Q&A recordings.',
            'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ012345',
            'presentation',
            'AllHands, Corporate, Keynote',
            1
          ]
        );
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Corporate Legal & Compliance Repo',
            'NDAs, standard client service agreements, terms of service, and certificates of incorporation.',
            'https://drive.google.com/drive/folders/1bCdEfGhIjKlMnOpQrStUvWxYz0123456',
            'folder',
            'Legal, Compliance, Contracts',
            0
          ]
        );
      } else if (f.slug === 'marketing-brand') {
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Official Brand Assets & SVG Logos',
            'Vector logos, typography guides, high-res dark/light badges, and approved color palettes.',
            'https://drive.google.com/drive/folders/1cDeFgHiJkLmNoPqRsTuVwXyZa0123457',
            'folder',
            'Logos, Design, Branding',
            1
          ]
        );
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Q4 Global Campaign Assets & Press Kit',
            'Promo videos, banner exports, email marketing templates, and press release materials.',
            'https://drive.google.com/drive/folders/1dEfGhIjKlMnOpQrStUvWxYzAb0123458',
            'folder',
            'Q4, Advertising, Media',
            0
          ]
        );
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Marketing Content Calendar Sheet',
            'Editorial calendar for blogs, social channels, webinars, and partner releases.',
            'https://docs.google.com/spreadsheets/d/1eFgHiJkLmNoPqRsTuVwXyZbc0123459',
            'spreadsheet',
            'Content, Social, Schedule',
            1
          ]
        );
      } else if (f.slug === 'product-engineering') {
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'System Architecture & RFC Documents',
            'Microservices topology, database schema migrations, and architectural decision records (ADRs).',
            'https://drive.google.com/drive/folders/1fGhIjKlMnOpQrStUvWxYzcd0123450',
            'document',
            'Architecture, RFC, Backend',
            1
          ]
        );
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Cloud Infrastructure & DevOps Backups',
            'Terraform configs, Kubernetes deployment manifests, and cloud disaster recovery runbooks.',
            'https://drive.google.com/drive/folders/1gHiJkLmNoPqRsTuVwXyZde0123451',
            'folder',
            'DevOps, AWS, Terraform',
            0
          ]
        );
      } else if (f.slug === 'finance-invoices') {
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Fiscal Year 2026 Budgeting & Forecasts',
            'Quarterly P&L breakdowns, department allocations, runway models, and revenue projections.',
            'https://docs.google.com/spreadsheets/d/1hIjKlMnOpQrStUvWxYzef0123452',
            'spreadsheet',
            'Budget, Forecast, 2026',
            1
          ]
        );
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'Vendor Receipts & Client Invoices',
            'Scanned invoice receipts, tax remittance documentation, and payment proofs.',
            'https://drive.google.com/drive/folders/1iJkLmNoPqRsTuVwXyZfg0123453',
            'folder',
            'Invoices, Receipts, Vendors',
            0
          ]
        );
      } else if (f.slug === 'human-resources') {
        await run(
          `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folderId,
            'New Hire Onboarding & Welcome Kit',
            'Step-by-step 30-60-90 day checklists, laptop setup guides, security compliance, and benefits handbook.',
            'https://drive.google.com/drive/folders/1jKlMnOpQrStUvWxYzgh0123454',
            'folder',
            'Onboarding, Culture, Welcome',
            1
          ]
        );
      }
    }
    console.log('Seeding finished successfully.');
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase
};
