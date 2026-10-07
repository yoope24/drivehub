const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dbHelper = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'drivehub-super-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  // Check cookie or Authorization header
  let token = req.cookies && req.cookies.token;
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
    req.user = decoded;
    next();
  });
}

// Admin authorization guard
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required for this action.' });
  }
  next();
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await dbHelper.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      token,
      user: payload
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Register (Public self-registration)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, full_name } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password, and full name are required.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await dbHelper.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken. Please choose another.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await dbHelper.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [cleanUsername, passwordHash, full_name.trim(), 'user']
    );

    const payload = {
      id: result.lastID,
      username: cleanUsername,
      full_name: full_name.trim(),
      role: 'user'
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: payload
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// USER MANAGEMENT ROUTES (Admin only)
// ==========================================

// Get all users
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbHelper.all(
      'SELECT id, username, full_name, role, created_at FROM users ORDER BY id ASC'
    );
    res.json(users);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users list.' });
  }
});

// Create new user (Admin)
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password, and full name are required.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await dbHelper.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken.' });
    }

    const userRole = role === 'admin' ? 'admin' : 'user';
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await dbHelper.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [cleanUsername, passwordHash, full_name.trim(), userRole]
    );

    const newUser = await dbHelper.get(
      'SELECT id, username, full_name, role, created_at FROM users WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json(newUser);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

// Update user (Admin: can update username, full_name, role, and reset password)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, password, full_name, role } = req.body;

    const existing = await dbHelper.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const cleanUsername = username ? username.trim().toLowerCase() : existing.username;
    if (cleanUsername !== existing.username.toLowerCase()) {
      const duplicate = await dbHelper.get(
        'SELECT id FROM users WHERE LOWER(username) = ? AND id != ?',
        [cleanUsername, userId]
      );
      if (duplicate) {
        return res.status(400).json({ error: 'Username is already in use by another account.' });
      }
    }

    const updatedFullName = full_name ? full_name.trim() : existing.full_name;
    const updatedRole = role === 'admin' ? 'admin' : (role === 'user' ? 'user' : existing.role);

    // If new password is provided, update password_hash
    if (password && password.trim()) {
      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
      }
      const newHash = await bcrypt.hash(password.trim(), 10);
      await dbHelper.run(
        'UPDATE users SET username = ?, password_hash = ?, full_name = ?, role = ? WHERE id = ?',
        [cleanUsername, newHash, updatedFullName, updatedRole, userId]
      );
    } else {
      await dbHelper.run(
        'UPDATE users SET username = ?, full_name = ?, role = ? WHERE id = ?',
        [cleanUsername, updatedFullName, updatedRole, userId]
      );
    }

    const updated = await dbHelper.get(
      'SELECT id, username, full_name, role, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json(updated);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// Delete user (Admin)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);

    // Guard: Prevent deleting self
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
    }

    const existing = await dbHelper.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await dbHelper.run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully.', id: userId });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ==========================================
// FOLDERS / SIDEBAR PAGES ROUTES
// ==========================================

// Get all sidebar folders with card count
app.get('/api/folders', authenticateToken, async (req, res) => {
  try {
    const folders = await dbHelper.all(`
      SELECT f.*, COUNT(c.id) as card_count
      FROM folders f
      LEFT JOIN drive_cards c ON f.id = c.folder_id
      GROUP BY f.id
      ORDER BY f.order_index ASC, f.id ASC
    `);
    res.json(folders);
  } catch (err) {
    console.error('Fetch folders error:', err);
    res.status(500).json({ error: 'Failed to fetch folders.' });
  }
});

// Get single folder by ID with its cards
app.get('/api/folders/:id', authenticateToken, async (req, res) => {
  try {
    const folder = await dbHelper.get('SELECT * FROM folders WHERE id = ?', [req.params.id]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found.' });
    }
    const cards = await dbHelper.all('SELECT * FROM drive_cards WHERE folder_id = ? ORDER BY is_starred DESC, id DESC', [req.params.id]);
    res.json({ ...folder, cards });
  } catch (err) {
    console.error('Fetch folder error:', err);
    res.status(500).json({ error: 'Failed to fetch folder details.' });
  }
});

// Create Folder (Admin only)
app.post('/api/folders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, icon, color, description, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required.' });
    }

    const cleanName = name.trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'folder';
    const folderIcon = icon && icon.trim() ? icon.trim() : 'bi-folder2';
    const folderColor = color && color.trim() ? color.trim() : '#4f46e5';
    const folderDesc = description ? description.trim() : '';

    // Determine order_index if not provided
    let order = parseInt(order_index, 10);
    if (isNaN(order)) {
      const maxOrderRow = await dbHelper.get('SELECT MAX(order_index) as max_order FROM folders');
      order = (maxOrderRow && maxOrderRow.max_order !== null ? maxOrderRow.max_order : 0) + 1;
    }

    const result = await dbHelper.run(
      'INSERT INTO folders (name, slug, icon, color, description, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanName, slug, folderIcon, folderColor, folderDesc, order]
    );

    const newFolder = await dbHelper.get('SELECT *, 0 as card_count FROM folders WHERE id = ?', [result.lastID]);
    res.status(201).json(newFolder);
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder.' });
  }
});

// Update Folder (Admin only)
app.put('/api/folders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const folderId = req.params.id;
    const { name, icon, color, description, order_index } = req.body;

    const existing = await dbHelper.get('SELECT * FROM folders WHERE id = ?', [folderId]);
    if (!existing) {
      return res.status(404).json({ error: 'Folder not found.' });
    }

    const updatedName = name && name.trim() ? name.trim() : existing.name;
    const updatedSlug = updatedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || existing.slug;
    const updatedIcon = icon && icon.trim() ? icon.trim() : existing.icon;
    const updatedColor = color && color.trim() ? color.trim() : existing.color;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;
    const updatedOrder = order_index !== undefined ? parseInt(order_index, 10) : existing.order_index;

    await dbHelper.run(
      'UPDATE folders SET name = ?, slug = ?, icon = ?, color = ?, description = ?, order_index = ? WHERE id = ?',
      [updatedName, updatedSlug, updatedIcon, updatedColor, updatedDesc, updatedOrder, folderId]
    );

    const updated = await dbHelper.get(`
      SELECT f.*, COUNT(c.id) as card_count
      FROM folders f
      LEFT JOIN drive_cards c ON f.id = c.folder_id
      WHERE f.id = ?
      GROUP BY f.id
    `, [folderId]);

    res.json(updated);
  } catch (err) {
    console.error('Update folder error:', err);
    res.status(500).json({ error: 'Failed to update folder.' });
  }
});

// Delete Folder (Admin only)
app.delete('/api/folders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const folderId = req.params.id;
    const existing = await dbHelper.get('SELECT * FROM folders WHERE id = ?', [folderId]);
    if (!existing) {
      return res.status(404).json({ error: 'Folder not found.' });
    }

    // Delete cards associated with this folder (or let foreign key cascade do it)
    await dbHelper.run('DELETE FROM drive_cards WHERE folder_id = ?', [folderId]);
    await dbHelper.run('DELETE FROM folders WHERE id = ?', [folderId]);

    res.json({ message: 'Folder and its drive cards were deleted successfully.', id: folderId });
  } catch (err) {
    console.error('Delete folder error:', err);
    res.status(500).json({ error: 'Failed to delete folder.' });
  }
});

// ==========================================
// GOOGLE DRIVE CARDS ROUTES
// ==========================================

// Get Cards (filtered by folder_id, search term, or starred)
app.get('/api/cards', authenticateToken, async (req, res) => {
  try {
    const { folder_id, search, starred, type } = req.query;
    let query = `
      SELECT c.*, f.name as folder_name, f.color as folder_color, f.icon as folder_icon
      FROM drive_cards c
      JOIN folders f ON c.folder_id = f.id
      WHERE 1=1
    `;
    const params = [];

    if (folder_id) {
      query += ` AND c.folder_id = ?`;
      params.push(folder_id);
    }

    if (starred === '1' || starred === 'true') {
      query += ` AND c.is_starred = 1`;
      params.push();
    }

    if (type && type !== 'all') {
      query += ` AND c.resource_type = ?`;
      params.push(type);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (c.title LIKE ? OR c.description LIKE ? OR c.tags LIKE ?)`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY c.is_starred DESC, c.id DESC`;

    const cards = await dbHelper.all(query, params);
    res.json(cards);
  } catch (err) {
    console.error('Fetch cards error:', err);
    res.status(500).json({ error: 'Failed to fetch drive cards.' });
  }
});

// Get single card
app.get('/api/cards/:id', authenticateToken, async (req, res) => {
  try {
    const card = await dbHelper.get(`
      SELECT c.*, f.name as folder_name, f.color as folder_color
      FROM drive_cards c
      JOIN folders f ON c.folder_id = f.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!card) {
      return res.status(404).json({ error: 'Drive card not found.' });
    }
    res.json(card);
  } catch (err) {
    console.error('Fetch card error:', err);
    res.status(500).json({ error: 'Failed to fetch card.' });
  }
});

// Create Drive Card (Admin only)
app.post('/api/cards', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { folder_id, title, description, drive_url, resource_type, tags, is_starred } = req.body;

    if (!folder_id || !title || !drive_url) {
      return res.status(400).json({ error: 'Folder, Card Title, and Google Drive URL are required.' });
    }

    // Verify folder exists
    const folder = await dbHelper.get('SELECT id FROM folders WHERE id = ?', [folder_id]);
    if (!folder) {
      return res.status(400).json({ error: 'Selected folder does not exist.' });
    }

    // Basic URL validation
    let validUrl = drive_url.trim();
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = 'https://' + validUrl;
    }

    const type = resource_type && resource_type.trim() ? resource_type.trim() : 'folder';
    const tagList = tags ? tags.trim() : '';
    const starredVal = is_starred ? 1 : 0;

    const result = await dbHelper.run(
      `INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [folder_id, title.trim(), (description || '').trim(), validUrl, type, tagList, starredVal]
    );

    const newCard = await dbHelper.get(`
      SELECT c.*, f.name as folder_name, f.color as folder_color
      FROM drive_cards c
      JOIN folders f ON c.folder_id = f.id
      WHERE c.id = ?
    `, [result.lastID]);

    res.status(201).json(newCard);
  } catch (err) {
    console.error('Create card error:', err);
    res.status(500).json({ error: 'Failed to create drive card.' });
  }
});

// Update Drive Card (Admin only)
app.put('/api/cards/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cardId = req.params.id;
    const { folder_id, title, description, drive_url, resource_type, tags, is_starred } = req.body;

    const existing = await dbHelper.get('SELECT * FROM drive_cards WHERE id = ?', [cardId]);
    if (!existing) {
      return res.status(404).json({ error: 'Drive card not found.' });
    }

    let validUrl = drive_url !== undefined ? drive_url.trim() : existing.drive_url;
    if (validUrl && !/^https?:\/\//i.test(validUrl)) {
      validUrl = 'https://' + validUrl;
    }

    const updatedFolderId = folder_id !== undefined ? folder_id : existing.folder_id;
    const updatedTitle = title !== undefined && title.trim() ? title.trim() : existing.title;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;
    const updatedType = resource_type !== undefined ? resource_type : existing.resource_type;
    const updatedTags = tags !== undefined ? tags.trim() : existing.tags;
    const updatedStarred = is_starred !== undefined ? (is_starred ? 1 : 0) : existing.is_starred;

    await dbHelper.run(
      `UPDATE drive_cards
       SET folder_id = ?, title = ?, description = ?, drive_url = ?, resource_type = ?, tags = ?, is_starred = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [updatedFolderId, updatedTitle, updatedDesc, validUrl, updatedType, updatedTags, updatedStarred, cardId]
    );

    const updated = await dbHelper.get(`
      SELECT c.*, f.name as folder_name, f.color as folder_color
      FROM drive_cards c
      JOIN folders f ON c.folder_id = f.id
      WHERE c.id = ?
    `, [cardId]);

    res.json(updated);
  } catch (err) {
    console.error('Update card error:', err);
    res.status(500).json({ error: 'Failed to update drive card.' });
  }
});

// Toggle Starred (All authenticated users can toggle favorite)
app.patch('/api/cards/:id/star', authenticateToken, async (req, res) => {
  try {
    const cardId = req.params.id;
    const existing = await dbHelper.get('SELECT * FROM drive_cards WHERE id = ?', [cardId]);
    if (!existing) {
      return res.status(404).json({ error: 'Card not found.' });
    }

    const newStarred = existing.is_starred === 1 ? 0 : 1;
    await dbHelper.run('UPDATE drive_cards SET is_starred = ? WHERE id = ?', [newStarred, cardId]);

    res.json({ id: cardId, is_starred: newStarred });
  } catch (err) {
    console.error('Star toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle star.' });
  }
});

// Delete Drive Card (Admin only)
app.delete('/api/cards/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cardId = req.params.id;
    const existing = await dbHelper.get('SELECT * FROM drive_cards WHERE id = ?', [cardId]);
    if (!existing) {
      return res.status(404).json({ error: 'Card not found.' });
    }

    await dbHelper.run('DELETE FROM drive_cards WHERE id = ?', [cardId]);
    res.json({ message: 'Drive card deleted successfully.', id: cardId });
  } catch (err) {
    console.error('Delete card error:', err);
    res.status(500).json({ error: 'Failed to delete drive card.' });
  }
});

// ==========================================
// SYSTEM STATS / SUMMARY
// ==========================================
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const folderCount = await dbHelper.get('SELECT COUNT(*) as count FROM folders');
    const cardCount = await dbHelper.get('SELECT COUNT(*) as count FROM drive_cards');
    const starredCount = await dbHelper.get('SELECT COUNT(*) as count FROM drive_cards WHERE is_starred = 1');
    const typeDistribution = await dbHelper.all('SELECT resource_type, COUNT(*) as count FROM drive_cards GROUP BY resource_type');

    res.json({
      totalFolders: folderCount.count,
      totalCards: cardCount.count,
      starredCards: starredCount.count,
      typeDistribution
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch statistics.' });
  }
});

// ==========================================
// BACKUP & RESTORE / SEED DATA MANAGEMENT
// ==========================================

// Export current database to JSON
app.get('/api/backup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await dbHelper.exportDataAsJson();
    res.json(data);
  } catch (err) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: 'Failed to generate backup.' });
  }
});

// Save current live data into seed_data.json
app.post('/api/backup/save-seed', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await dbHelper.exportDataAsJson();
    const seedPath = path.join(__dirname, 'seed_data.json');
    const fs = require('fs');
    fs.writeFileSync(seedPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ message: 'Current database saved to seed_data.json successfully!', data });
  } catch (err) {
    console.error('Save seed error:', err);
    res.status(500).json({ error: 'Failed to save seed_data.json.' });
  }
});

// Restore database from uploaded JSON
app.post('/api/backup/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { folders } = req.body;
    if (!folders || !Array.isArray(folders)) {
      return res.status(400).json({ error: 'Invalid backup format. Must contain a "folders" array.' });
    }

    // Clear existing folders and cards
    await dbHelper.run('DELETE FROM drive_cards');
    await dbHelper.run('DELETE FROM folders');

    for (let i = 0; i < folders.length; i++) {
      const f = folders[i];
      const result = await dbHelper.run(
        'INSERT INTO folders (name, slug, icon, color, description, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        [f.name, f.slug, f.icon || 'bi-folder2', f.color || '#4f46e5', f.description || '', f.order_index || (i + 1)]
      );
      const folderId = result.lastID;

      if (f.cards && Array.isArray(f.cards)) {
        for (const c of f.cards) {
          await dbHelper.run(
            'INSERT INTO drive_cards (folder_id, title, description, drive_url, resource_type, tags, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [folderId, c.title, c.description || '', c.drive_url, c.resource_type || 'folder', c.tags || '', c.is_starred ? 1 : 0]
          );
        }
      }
    }

    res.json({ message: 'Database restored successfully!', folderCount: folders.length });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database.' });
  }
});

// Start Server and Initialize DB
async function start() {
  try {
    await dbHelper.initializeDatabase();
    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`DriveHub Server running on http://localhost:${PORT}`);
      console.log(`Admin Demo: username: admin | password: admin123`);
      console.log(`User Demo:  username: user  | password: user123`);
      console.log(`===============================================`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[ERROR] Port ${PORT} is already in use by another running process.`);
        console.error(`Please stop any other instance of DriveHub or run: npx kill-port ${PORT}\n`);
      } else {
        console.error('Server error:', err);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
