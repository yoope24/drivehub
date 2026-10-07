const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let client = null;
let sqliteDb = null;

// Determine connection mode: Turso Cloud Database OR local SQLite
async function getDbConnection() {
  if (process.env.TURSO_DATABASE_URL) {
    if (!client) {
      const { createClient } = await import('@libsql/client');
      client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
      });
      console.log('⚡ Connected to Turso Cloud Database at:', process.env.TURSO_DATABASE_URL);
    }
    return { type: 'turso', client };
  } else {
    if (!sqliteDb) {
      const sqlite3 = require('sqlite3').verbose();
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'drivehub.sqlite');
      sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Failed to connect to SQLite database:', err.message);
        } else {
          console.log('Connected to SQLite database at:', dbPath);
        }
      });
    }
    return { type: 'sqlite', db: sqliteDb };
  }
}

// Promise helper: execute query (INSERT, UPDATE, DELETE, DDL)
async function run(sql, params = []) {
  const conn = await getDbConnection();
  if (conn.type === 'turso') {
    const res = await conn.client.execute({ sql, args: params });
    return {
      lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
      changes: res.rowsAffected
    };
  } else {
    return new Promise((resolve, reject) => {
      conn.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
}

// Promise helper: fetch single row
async function get(sql, params = []) {
  const conn = await getDbConnection();
  if (conn.type === 'turso') {
    const res = await conn.client.execute({ sql, args: params });
    if (res.rows && res.rows.length > 0) {
      return res.rows[0];
    }
    return null;
  } else {
    return new Promise((resolve, reject) => {
      conn.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

// Promise helper: fetch all rows
async function all(sql, params = []) {
  const conn = await getDbConnection();
  if (conn.type === 'turso') {
    const res = await conn.client.execute({ sql, args: params });
    return res.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      conn.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
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
  if (folderCount && (folderCount.count === 0 || folderCount.count === '0')) {
    console.log('Database folders empty. Seeding initial data...');

    // Priority 1: Check seed_data.json
    const seedPath = path.join(__dirname, 'seed_data.json');
    if (fs.existsSync(seedPath)) {
      try {
        const raw = fs.readFileSync(seedPath, 'utf8');
        const seed = JSON.parse(raw);
        if (seed.folders && Array.isArray(seed.folders) && seed.folders.length > 0) {
          console.log(`Seeding from seed_data.json (${seed.folders.length} folders)...`);
          for (let i = 0; i < seed.folders.length; i++) {
            const f = seed.folders[i];
            const result = await run(
              `INSERT INTO folders (name, slug, icon, color, description, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
              [f.name, f.slug, f.icon || 'bi-folder2', f.color || '#4f46e5', f.description || '', f.order_index || (i + 1)]
            );
            const folderId = result.lastID;

            if (f.cards && Array.isArray(f.cards)) {
              for (const c of f.cards) {
                await run(
                  `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    folderId,
                    c.title,
                    c.description || '',
                    c.drive_url,
                    c.resource_type || 'folder',
                    c.tags || '',
                    c.is_starred ? 1 : 0
                  ]
                );
              }
            }
          }
          console.log('Seeding from seed_data.json completed successfully! 🌟');
          return;
        }
      } catch (err) {
        console.error('Error reading seed_data.json, falling back to built-in seed:', err);
      }
    }

    // Fallback: Built-in default folders if seed_data.json missing
    const defaultFolders = [
      {
        name: 'ESSU Administration & Executive',
        slug: 'essu-admin-executive',
        icon: 'bi-building-fill',
        color: '#15803d',
        description: 'University policies, board resolutions, and executive documents.',
        order_index: 1
      },
      {
        name: 'Extension Services & Outreach',
        slug: 'extension-services-outreach',
        icon: 'bi-people-fill',
        color: '#059669',
        description: 'Community projects, training workshops, and partner organizations.',
        order_index: 2
      },
      {
        name: 'Research & Development',
        slug: 'research-development',
        icon: 'bi-mortarboard-fill',
        color: '#0284c7',
        description: 'Faculty research publications, journals, and grants.',
        order_index: 3
      }
    ];

    for (const f of defaultFolders) {
      await run(
        `INSERT INTO folders (name, slug, icon, color, description, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
        [f.name, f.slug, f.icon, f.color, f.description, f.order_index]
      );
    }
    console.log('Built-in fallback seeding completed.');
  }
}

// Export current database to a JSON structure for backup or seed updating
async function exportDataAsJson() {
  const folders = await all('SELECT * FROM folders ORDER BY order_index ASC, id ASC');
  const cards = await all('SELECT * FROM drive_cards ORDER BY id ASC');

  const exportStructure = {
    export_date: new Date().toISOString(),
    folders: folders.map(f => {
      const folderCards = cards.filter(c => c.folder_id === f.id);
      return {
        name: f.name,
        slug: f.slug,
        icon: f.icon,
        color: f.color,
        description: f.description,
        order_index: f.order_index,
        cards: folderCards.map(c => ({
          title: c.title,
          description: c.description,
          drive_url: c.drive_url,
          resource_type: c.resource_type,
          tags: c.tags,
          is_starred: c.is_starred
        }))
      };
    })
  };

  return exportStructure;
}

module.exports = {
  run,
  get,
  all,
  initializeDatabase,
  exportDataAsJson
};
