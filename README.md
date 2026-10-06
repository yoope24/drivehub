# DriveHub — Modern Web-Based Google Drive File Management System

DriveHub is a modern, responsive, and intuitive web-based file management application built with **HTML5, Vanilla CSS, Bootstrap 5.3, JavaScript, Node.js (Express), and SQLite**.

It provides an organized central hub for enterprise and team Google Drive resources with dynamic sidebar folders, Google Drive resource cards, granular search, and role-based permissions (Admin vs. Member).

---

## 🚀 Key Features

- **Authentication & Role-Based Access Control**:
  - Secure password hashing with `bcryptjs` and session authentication using `jsonwebtoken`.
  - **Admin Role**: Full control to dynamically create, edit, and delete sidebar folders and Google Drive cards.
  - **Member Role**: Clean viewer experience to browse, search, favorite, and open Google Drive links.
  - One-click demo credentials autofill for both roles.

- **Dynamic Left Sidebar & Navigation**:
  - Folders and pages loaded dynamically from SQLite database.
  - Admin can create new sidebar pages with custom icons and color schemes.
  - Real-time item count badges per folder.
  - Special views: **"All Files & Links"** and **"Starred Links"**.
  - Mobile-friendly responsive drawer with smooth backdrop blur.

- **Google Drive Cards**:
  - Add shortcuts to any Google Drive folder, spreadsheet, document, presentation, or form.
  - Custom title, description, Drive URL, resource type, and tags.
  - **"Open in Drive"** opens the Google Drive folder or document in a new tab.
  - **"Copy Link"** button with instant toast notification.
  - Favorite/Star toggle for fast access.
  - Instant client-side search across titles, descriptions, and tags.
  - Filter pills by resource type (Folders, Sheets, Docs, Slides).

- **Database Structure**:
  - Pre-seeded SQLite database with realistic departments and cards.
  - Cascade deletions: Deleting a folder cleanly removes associated cards or prompts confirmation.

---

## 🔑 Default Credentials

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full access: Create/Edit/Delete folders & cards |
| **Team Member** | `user` | `user123` | Read-only access: View, search, star, and open Drive links |

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS (`style.css`), Bootstrap 5.3, Bootstrap Icons, JavaScript (Fetch API).
- **Backend**: Node.js, Express.js, Cookie-Parser, CORS, JWT, Bcrypt.
- **Database**: SQLite (`sqlite3`) with schema migrations and seed scripts.

---

## 🗄️ Database Schema

### 1. `users` Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `folders` Table
```sql
CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT DEFAULT 'bi-folder2',
  color TEXT DEFAULT '#4f46e5',
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. `drive_cards` Table
```sql
CREATE TABLE drive_cards (
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
);
```

---

## 💻 How to Run Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000) (redirects to `/login.html` if unauthenticated).

4. **Run Integration Tests**:
   ```bash
   node test_integration.js
   ```

---

## 🌐 API Endpoints Reference

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & receive JWT token | Public |
| `POST` | `/api/auth/logout` | Clear session cookie | Public |
| `GET` | `/api/auth/me` | Fetch currently logged-in user profile | Authenticated |
| `POST` | `/api/auth/register` | Register new user | Public |
| `GET` | `/api/folders` | List all sidebar folders with card counts | Authenticated |
| `GET` | `/api/folders/:id` | Get folder details and its drive cards | Authenticated |
| `POST` | `/api/folders` | Create a new sidebar folder | Admin only |
| `PUT` | `/api/folders/:id` | Update folder name, icon, color, description | Admin only |
| `DELETE` | `/api/folders/:id` | Delete folder and associated drive cards | Admin only |
| `GET` | `/api/cards` | Get cards (with `folder_id`, `search`, `starred`, `type` filters) | Authenticated |
| `POST` | `/api/cards` | Create new Google Drive card | Admin only |
| `PUT` | `/api/cards/:id` | Update existing Drive card | Admin only |
| `DELETE` | `/api/cards/:id` | Delete Drive card | Admin only |
| `PATCH` | `/api/cards/:id/star` | Toggle favorite / starred status | Authenticated |
| `GET` | `/api/users` | List all users and roles | Admin only |
| `POST` | `/api/users` | Create new user account | Admin only |
| `PUT` | `/api/users/:id` | Update user details and reset password | Admin only |
| `DELETE` | `/api/users/:id` | Delete user account (cannot delete self) | Admin only |
| `GET` | `/api/stats` | System overview stats and card type counts | Authenticated |

---

## 🧪 Automated Test Suites

```bash
# Full folders and Drive cards integration test
node test_integration.js

# User management, role guards, and password reset test
node test_user_management.js
```
