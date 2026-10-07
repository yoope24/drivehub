/**
 * DriveHub Application Client Logic
 */

// Available Icons for Folder Picker
const AVAILABLE_ICONS = [
  'bi-folder2', 'bi-building-fill', 'bi-megaphone-fill', 'bi-cpu-fill',
  'bi-cash-coin', 'bi-people-fill', 'bi-briefcase-fill', 'bi-cloud-check-fill',
  'bi-graph-up-arrow', 'bi-shield-check', 'bi-book-fill', 'bi-hdd-network-fill',
  'bi-collection-fill', 'bi-inboxes-fill', 'bi-palette-fill', 'bi-laptop',
  'bi-globe', 'bi-camera-video-fill', 'bi-file-earmark-code-fill', 'bi-gear-fill',
  'bi-archive-fill', 'bi-award-fill', 'bi-bookmark-star-fill', 'bi-layers-fill'
];

// App State
const state = {
  currentUser: null,
  folders: [],
  cards: [],
  users: [],
  activeFolderId: 'all', // 'all', 'starred', or folder numeric id
  activeTypeFilter: 'all',
  searchQuery: '',
  userSearchQuery: '',
  pendingDelete: null // { type: 'folder'|'card'|'user', id: number, name: string }
};

// Bootstrap Modals & Toasts instances
let folderModalInstance = null;
let cardModalInstance = null;
let deleteModalInstance = null;
let userManagementModalInstance = null;
let userEditModalInstance = null;
let logoutModalInstance = null;
let toastInstance = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  initBootstrapInstances();
  setupEventListeners();
  populateIconPicker();
  
  // Verify authentication & load workspace
  await checkAuthAndLoad();
});

// Initialize Bootstrap Modals
function initBootstrapInstances() {
  const folderModalEl = document.getElementById('folderModal');
  if (folderModalEl) folderModalInstance = new bootstrap.Modal(folderModalEl);

  const cardModalEl = document.getElementById('cardModal');
  if (cardModalEl) cardModalInstance = new bootstrap.Modal(cardModalEl);

  const deleteModalEl = document.getElementById('deleteConfirmModal');
  if (deleteModalEl) deleteModalInstance = new bootstrap.Modal(deleteModalEl);

  const userManageModalEl = document.getElementById('userManagementModal');
  if (userManageModalEl) userManagementModalInstance = new bootstrap.Modal(userManageModalEl);

  const userEditModalEl = document.getElementById('userEditModal');
  if (userEditModalEl) userEditModalInstance = new bootstrap.Modal(userEditModalEl);

  const logoutModalEl = document.getElementById('logoutConfirmModal');
  if (logoutModalEl) logoutModalInstance = new bootstrap.Modal(logoutModalEl);

  const toastEl = document.getElementById('liveToast');
  if (toastEl) toastInstance = new bootstrap.Toast(toastEl, { delay: 3500 });
}

// Toast helper
function showToast(message, iconClass = 'bi-check-circle-fill text-success') {
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');
  if (msgEl) msgEl.textContent = message;
  if (iconEl) iconEl.className = `bi ${iconClass}`;
  if (toastInstance) toastInstance.show();
}

// Authentication check & initial data load
async function checkAuthAndLoad() {
  try {
    const res = await API.getMe();
    state.currentUser = res.user;
    updateUserUI();
    await refreshData();
  } catch (err) {
    console.warn('User not authenticated, redirecting to login:', err);
    window.location.href = '/login.html';
  }
}

// Update User UI elements
function updateUserUI() {
  const user = state.currentUser;
  if (!user) return;

  const initial = (user.full_name || user.username || 'U').charAt(0).toUpperCase();

  // Sidebar user card
  const userAvatar = document.getElementById('userAvatar');
  const userFullName = document.getElementById('userFullName');
  const userUsername = document.getElementById('userUsername');
  const userRoleBadge = document.getElementById('userRoleBadge');

  if (userAvatar) userAvatar.textContent = initial;
  if (userFullName) userFullName.textContent = user.full_name || user.username;
  if (userUsername) userUsername.textContent = `@${user.username}`;
  
  if (userRoleBadge) {
    if (user.role === 'admin') {
      userRoleBadge.textContent = 'ADMIN';
      userRoleBadge.style.backgroundColor = '#4f46e5';
    } else {
      userRoleBadge.textContent = 'MEMBER';
      userRoleBadge.style.backgroundColor = '#10b981';
    }
  }

  // Top bar user dropdown elements
  const topUserAvatar = document.getElementById('topUserAvatar');
  const topUserName = document.getElementById('topUserName');
  const menuUserFullName = document.getElementById('menuUserFullName');
  const menuUserRoleBadge = document.getElementById('menuUserRoleBadge');
  const menuUserUsername = document.getElementById('menuUserUsername');

  if (topUserAvatar) topUserAvatar.textContent = initial;
  if (topUserName) topUserName.textContent = user.full_name || user.username;
  if (menuUserFullName) menuUserFullName.textContent = user.full_name || user.username;
  if (menuUserUsername) menuUserUsername.textContent = `@${user.username}`;
  if (menuUserRoleBadge) {
    if (user.role === 'admin') {
      menuUserRoleBadge.textContent = 'ADMIN';
      menuUserRoleBadge.style.backgroundColor = '#4f46e5';
    } else {
      menuUserRoleBadge.textContent = 'MEMBER';
      menuUserRoleBadge.style.backgroundColor = '#10b981';
    }
  }

  // Toggle Admin-only controls
  const adminElements = document.querySelectorAll('.admin-only-ui');
  adminElements.forEach(el => {
    if (user.role === 'admin') {
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  });
}

// Refresh both folders and cards from API
async function refreshData() {
  try {
    const [folders, cards] = await Promise.all([
      API.getFolders(),
      API.getCards()
    ]);

    state.folders = folders || [];
    state.cards = cards || [];

    updateBadges();
    renderSidebarFolders();
    populateFolderSelectOptions();
    renderHeroBanner();
    renderCards();
  } catch (err) {
    console.error('Error refreshing data:', err);
    showToast('Failed to load workspace data.', 'bi-exclamation-triangle-fill text-danger');
  }
}

// Update all/starred count badges
function updateBadges() {
  const allCount = state.cards.length;
  const starredCount = state.cards.filter(c => c.is_starred === 1).length;

  const allBadge = document.getElementById('allCountBadge');
  const starredBadge = document.getElementById('starredCountBadge');

  if (allBadge) allBadge.textContent = allCount;
  if (starredBadge) starredBadge.textContent = starredCount;
}

// Render dynamic folders in sidebar
function renderSidebarFolders() {
  const listEl = document.getElementById('foldersNavList');
  if (!listEl) return;

  if (state.folders.length === 0) {
    listEl.innerHTML = `
      <li class="text-center py-3 text-muted small">
        <i class="bi bi-folder-x fs-4 d-block mb-1 text-secondary"></i>
        No folders yet
      </li>
    `;
    return;
  }

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  listEl.innerHTML = state.folders.map(folder => {
    const isActive = String(state.activeFolderId) === String(folder.id);
    const folderCardsCount = state.cards.filter(c => c.folder_id === folder.id).length;
    const folderColor = folder.color || '#4f46e5';
    const folderIcon = folder.icon || 'bi-folder2';

    return `
      <li class="sidebar-item" data-id="${folder.id}">
        <div class="sidebar-link ${isActive ? 'active' : ''}" onclick="selectFolder(${folder.id})">
          <span class="icon-box" style="background-color: ${folderColor}22; color: ${folderColor};">
            <i class="bi ${folderIcon}"></i>
          </span>
          <span class="link-text" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</span>
          <span class="badge-count">${folderCardsCount}</span>
          ${isAdmin ? `
            <div class="folder-actions" onclick="event.stopPropagation()">
              <button class="folder-action-btn edit-btn" title="Edit Folder" onclick="openEditFolderModal(${folder.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="folder-action-btn delete-btn" title="Delete Folder" onclick="promptDeleteFolder(${folder.id}, '${escapeHtml(folder.name).replace(/'/g, "\\'")}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </li>
    `;
  }).join('');
}

// Populate Folder Dropdown inside the Drive Card Modal
function populateFolderSelectOptions() {
  const selectEl = document.getElementById('cardFormFolder');
  if (!selectEl) return;

  if (state.folders.length === 0) {
    selectEl.innerHTML = `<option value="">No folders available - create one first</option>`;
    return;
  }

  selectEl.innerHTML = state.folders.map(f => {
    const isSelected = String(state.activeFolderId) === String(f.id) ? 'selected' : '';
    return `<option value="${f.id}" ${isSelected}>${escapeHtml(f.name)}</option>`;
  }).join('');
}

// Handle folder selection
window.selectFolder = function(folderId) {
  state.activeFolderId = folderId;

  // Update navigation items active state
  document.getElementById('navAllItems').classList.remove('active');
  document.getElementById('navStarred').classList.remove('active');

  if (folderId === 'all') {
    document.getElementById('navAllItems').classList.add('active');
  } else if (folderId === 'starred') {
    document.getElementById('navStarred').classList.add('active');
  }

  renderSidebarFolders();
  renderHeroBanner();
  renderCards();

  // Close mobile sidebar if open
  closeMobileSidebar();
};

// Update top Hero banner according to current view
function renderHeroBanner() {
  const banner = document.getElementById('folderHeroBanner');
  const heroTitle = document.getElementById('heroFolderTitle');
  const heroDesc = document.getElementById('heroFolderDesc');
  const heroIcon = document.getElementById('heroFolderIcon');
  const folderControls = document.getElementById('folderAdminControls');
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  if (state.activeFolderId === 'all') {
    heroTitle.textContent = 'All Files & Links';
    heroDesc.textContent = 'Browse and access all synchronized Google Drive folders, spreadsheets, and documents.';
    heroIcon.style.background = '#4f46e5';
    heroIcon.innerHTML = '<i class="bi bi-grid-fill"></i>';
    banner.style.setProperty('--hero-accent', '#4f46e5');
    if (folderControls) folderControls.classList.add('d-none');
  } else if (state.activeFolderId === 'starred') {
    heroTitle.textContent = 'Starred Links & Favorites';
    heroDesc.textContent = 'Fast access to your frequently referenced and pinned Google Drive folders.';
    heroIcon.style.background = '#eab308';
    heroIcon.innerHTML = '<i class="bi bi-star-fill"></i>';
    banner.style.setProperty('--hero-accent', '#eab308');
    if (folderControls) folderControls.classList.add('d-none');
  } else {
    const folder = state.folders.find(f => f.id === Number(state.activeFolderId));
    if (folder) {
      heroTitle.textContent = folder.name;
      heroDesc.textContent = folder.description || 'Google Drive folders and files categorized under this workspace section.';
      const folderColor = folder.color || '#4f46e5';
      heroIcon.style.background = folderColor;
      heroIcon.innerHTML = `<i class="bi ${folder.icon || 'bi-folder2'}"></i>`;
      banner.style.setProperty('--hero-accent', folderColor);

      if (folderControls && isAdmin) {
        folderControls.classList.remove('d-none');
      } else if (folderControls) {
        folderControls.classList.add('d-none');
      }
    }
  }
}

// Render Drive Cards Grid
function renderCards() {
  const container = document.getElementById('cardsGridContainer');
  const emptyState = document.getElementById('emptyStateContainer');
  const countText = document.getElementById('itemsCountText');
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  let filtered = [...state.cards];

  // 1. Folder filtering
  if (state.activeFolderId === 'starred') {
    filtered = filtered.filter(c => c.is_starred === 1);
  } else if (state.activeFolderId !== 'all') {
    filtered = filtered.filter(c => c.folder_id === Number(state.activeFolderId));
  }

  // 2. Type filtering
  if (state.activeTypeFilter !== 'all') {
    filtered = filtered.filter(c => c.resource_type === state.activeTypeFilter);
  }

  // 3. Search query
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(c => {
      const matchTitle = (c.title || '').toLowerCase().includes(q);
      const matchDesc = (c.description || '').toLowerCase().includes(q);
      const matchTags = (c.tags || '').toLowerCase().includes(q);
      const matchFolder = (c.folder_name || '').toLowerCase().includes(q);
      return matchTitle || matchDesc || matchTags || matchFolder;
    });
  }

  countText.textContent = `Showing ${filtered.length} of ${state.cards.length} items`;

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  container.innerHTML = filtered.map(card => {
    const typeMeta = getResourceTypeMeta(card.resource_type);
    const folderColor = card.folder_color || '#4f46e5';
    const tagArray = card.tags ? card.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    return `
      <div class="drive-card" style="--card-accent: ${folderColor};">
        <div class="card-top-bar"></div>
        <div class="drive-card-body">
          <div class="card-type-row">
            <span class="type-badge ${typeMeta.badgeClass}">
              <i class="bi ${typeMeta.icon}"></i> ${typeMeta.label}
            </span>
            <div class="d-flex align-items-center gap-1">
              <button class="star-btn ${card.is_starred === 1 ? 'starred' : ''}" 
                      title="${card.is_starred === 1 ? 'Unstar' : 'Star'}"
                      onclick="toggleCardStar(${card.id})">
                <i class="bi ${card.is_starred === 1 ? 'bi-star-fill' : 'bi-star'}"></i>
              </button>
              ${isAdmin ? `
                <div class="dropdown">
                  <button class="btn btn-sm btn-link text-muted p-0" data-bs-toggle="dropdown" aria-expanded="false" title="More options">
                    <i class="bi bi-three-dots-vertical"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end shadow-sm border">
                    <li>
                      <a class="dropdown-item small" href="#" onclick="openEditCardModal(${card.id}); return false;">
                        <i class="bi bi-pencil me-2 text-primary"></i> Edit Card
                      </a>
                    </li>
                    <li>
                      <a class="dropdown-item small text-danger" href="#" onclick="promptDeleteCard(${card.id}, '${escapeHtml(card.title).replace(/'/g, "\\'")}'); return false;">
                        <i class="bi bi-trash3 me-2"></i> Delete Card
                      </a>
                    </li>
                  </ul>
                </div>
              ` : ''}
            </div>
          </div>

          <h3 class="card-title" title="${escapeHtml(card.title)}">${escapeHtml(card.title)}</h3>
          
          <p class="card-description">
            ${card.description ? escapeHtml(card.description) : '<span class="text-muted fst-italic">No description provided.</span>'}
          </p>

          ${tagArray.length > 0 ? `
            <div class="card-tags">
              ${tagArray.map(tag => `<span class="card-tag">#${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : '<div class="card-tags"></div>'}

          <div class="card-footer-actions">
            <!-- Open Google Drive Folder / File in New Tab -->
            <a href="${escapeHtml(card.drive_url)}" target="_blank" rel="noopener noreferrer" class="btn-open-drive" title="Open Google Drive location in new tab">
              <i class="bi bi-google gdrive-icon"></i>
              <span>Open in Drive</span>
              <i class="bi bi-box-arrow-up-right small ms-auto text-muted"></i>
            </a>

            <!-- Copy Link Button -->
            <button class="btn-icon-action" title="Copy Google Drive Link" onclick="copyDriveLink('${escapeHtml(card.drive_url).replace(/'/g, "\\'")}')">
              <i class="bi bi-link-45deg fs-5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Resource Type Metadata mapping
function getResourceTypeMeta(type) {
  switch (type) {
    case 'spreadsheet':
      return { label: 'Sheet', icon: 'bi-file-earmark-spreadsheet-fill', badgeClass: 'type-spreadsheet' };
    case 'document':
      return { label: 'Doc', icon: 'bi-file-earmark-text-fill', badgeClass: 'type-document' };
    case 'presentation':
      return { label: 'Slides', icon: 'bi-file-earmark-slides-fill', badgeClass: 'type-presentation' };
    case 'form':
      return { label: 'Form', icon: 'bi-ui-checks', badgeClass: 'type-form' };
    case 'archive':
      return { label: 'Archive', icon: 'bi-file-earmark-zip-fill', badgeClass: 'type-archive' };
    case 'folder':
    default:
      return { label: 'Drive Folder', icon: 'bi-folder-fill', badgeClass: 'type-folder' };
  }
}

// Copy link to clipboard
window.copyDriveLink = async function(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('Drive link copied to clipboard!', 'bi-clipboard-check-fill text-success');
  } catch (err) {
    const tempInput = document.createElement('input');
    tempInput.value = url;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast('Drive link copied to clipboard!', 'bi-clipboard-check-fill text-success');
  }
};

// Toggle Starred status
window.toggleCardStar = async function(cardId) {
  try {
    const res = await API.toggleStar(cardId);
    const card = state.cards.find(c => c.id === cardId);
    if (card) {
      card.is_starred = res.is_starred;
    }
    updateBadges();
    renderCards();
    showToast(
      res.is_starred === 1 ? 'Added to Starred Links' : 'Removed from Starred Links',
      res.is_starred === 1 ? 'bi-star-fill text-warning' : 'bi-star text-secondary'
    );
  } catch (err) {
    showToast('Failed to update favorite status.', 'bi-exclamation-circle text-danger');
  }
};

// ========================================================
// FOLDER CRUD OPERATIONS (Admin)
// ========================================================

// Open Folder Modal for Creation
function openCreateFolderModal() {
  document.getElementById('folderModalTitle').textContent = 'Create New Sidebar Folder';
  document.getElementById('folderFormId').value = '';
  document.getElementById('folderFormName').value = '';
  document.getElementById('folderFormDesc').value = '';
  selectFolderIcon('bi-folder2');
  selectFolderColor('#4f46e5');
  folderModalInstance.show();
}

// Open Folder Modal for Editing
window.openEditFolderModal = function(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;

  document.getElementById('folderModalTitle').textContent = 'Edit Sidebar Folder';
  document.getElementById('folderFormId').value = folder.id;
  document.getElementById('folderFormName').value = folder.name;
  document.getElementById('folderFormDesc').value = folder.description || '';
  selectFolderIcon(folder.icon || 'bi-folder2');
  selectFolderColor(folder.color || '#4f46e5');
  folderModalInstance.show();
};

// Delete Folder Prompt
window.promptDeleteFolder = function(id, name) {
  state.pendingDelete = { type: 'folder', id, name };
  document.getElementById('deleteConfirmTitle').textContent = 'Delete Folder?';
  document.getElementById('deleteConfirmMessage').innerHTML = `
    Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?
    <br><span class="text-danger">Warning: All Drive cards inside this folder will also be removed!</span>
  `;
  deleteModalInstance.show();
};

// Handle Folder Form Submission
document.getElementById('folderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('saveFolderSubmitBtn');
  const folderId = document.getElementById('folderFormId').value;
  const name = document.getElementById('folderFormName').value.trim();
  const description = document.getElementById('folderFormDesc').value.trim();
  const icon = document.getElementById('folderFormIcon').value;
  const color = document.getElementById('folderFormColor').value;

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    if (folderId) {
      await API.updateFolder(folderId, { name, description, icon, color });
      showToast(`Folder "${name}" updated successfully!`);
    } else {
      const newFolder = await API.createFolder({ name, description, icon, color });
      showToast(`Folder "${name}" created successfully!`);
      state.activeFolderId = newFolder.id;
    }

    folderModalInstance.hide();
    await refreshData();
  } catch (err) {
    showToast(err.message || 'Error saving folder.', 'bi-exclamation-circle text-danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Folder';
  }
});

// ========================================================
// CARD CRUD OPERATIONS (Admin)
// ========================================================

// Open Card Modal for Creation
function openCreateCardModal() {
  document.getElementById('cardModalTitle').textContent = 'Add Google Drive Card';
  document.getElementById('cardFormId').value = '';
  document.getElementById('cardFormTitle').value = '';
  document.getElementById('cardFormUrl').value = '';
  document.getElementById('cardFormDesc').value = '';
  document.getElementById('cardFormTags').value = '';
  document.getElementById('cardFormType').value = 'folder';
  document.getElementById('cardFormStarred').checked = false;

  populateFolderSelectOptions();
  if (state.activeFolderId !== 'all' && state.activeFolderId !== 'starred') {
    document.getElementById('cardFormFolder').value = state.activeFolderId;
  }

  cardModalInstance.show();
}

// Open Card Modal for Editing
window.openEditCardModal = function(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  document.getElementById('cardModalTitle').textContent = 'Edit Google Drive Card';
  document.getElementById('cardFormId').value = card.id;
  document.getElementById('cardFormTitle').value = card.title;
  document.getElementById('cardFormUrl').value = card.drive_url;
  document.getElementById('cardFormDesc').value = card.description || '';
  document.getElementById('cardFormTags').value = card.tags || '';
  document.getElementById('cardFormType').value = card.resource_type || 'folder';
  document.getElementById('cardFormStarred').checked = card.is_starred === 1;

  populateFolderSelectOptions();
  document.getElementById('cardFormFolder').value = card.folder_id;

  cardModalInstance.show();
};

// Delete Card Prompt
window.promptDeleteCard = function(id, name) {
  state.pendingDelete = { type: 'card', id, name };
  document.getElementById('deleteConfirmTitle').textContent = 'Delete Drive Card?';
  document.getElementById('deleteConfirmMessage').innerHTML = `
    Are you sure you want to delete <strong>${escapeHtml(name)}</strong> from this workspace?
  `;
  deleteModalInstance.show();
};

// Handle Card Form Submission
document.getElementById('cardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('saveCardSubmitBtn');
  const cardId = document.getElementById('cardFormId').value;
  const folder_id = Number(document.getElementById('cardFormFolder').value);
  const title = document.getElementById('cardFormTitle').value.trim();
  const drive_url = document.getElementById('cardFormUrl').value.trim();
  const description = document.getElementById('cardFormDesc').value.trim();
  const resource_type = document.getElementById('cardFormType').value;
  const tags = document.getElementById('cardFormTags').value.trim();
  const is_starred = document.getElementById('cardFormStarred').checked ? 1 : 0;

  if (!folder_id) {
    showToast('Please select a valid folder.', 'bi-exclamation-circle text-danger');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    const payload = { folder_id, title, drive_url, description, resource_type, tags, is_starred };

    if (cardId) {
      await API.updateCard(cardId, payload);
      showToast(`Drive card "${title}" updated successfully!`);
    } else {
      await API.createCard(payload);
      showToast(`Drive card "${title}" created successfully!`);
    }

    cardModalInstance.hide();
    await refreshData();
  } catch (err) {
    showToast(err.message || 'Error saving card.', 'bi-exclamation-circle text-danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Card';
  }
});

// ========================================================
// USER MANAGEMENT & CREDENTIALS (Admin)
// ========================================================

// Open User Management Modal
window.openManageUsersModal = async function() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Admin privilege required.', 'bi-shield-exclamation text-danger');
    return;
  }

  const searchInput = document.getElementById('userSearchInput');
  if (searchInput) searchInput.value = '';
  state.userSearchQuery = '';

  await loadAndRenderUsers();
  userManagementModalInstance.show();
};

// Fetch users from API and render
async function loadAndRenderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="text-center py-4 text-muted">
        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
        Loading workspace users...
      </td>
    </tr>
  `;

  try {
    const users = await API.getUsers();
    state.users = users || [];
    renderUsersTable();
  } catch (err) {
    console.error('Failed to load users:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-circle me-1"></i> Failed to load users.
        </td>
      </tr>
    `;
  }
}

// Render Users Table with search filtering
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  let filtered = [...state.users];
  if (state.userSearchQuery.trim()) {
    const q = state.userSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(u => 
      (u.username || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">
          <i class="bi bi-person-x fs-4 d-block mb-1 text-secondary"></i>
          No users match the search criteria.
        </td>
      </tr>
    `;
    return;
  }

  const currentUserId = state.currentUser ? state.currentUser.id : null;

  tbody.innerHTML = filtered.map(u => {
    const isSelf = u.id === currentUserId;
    const initial = (u.full_name || u.username || 'U').charAt(0).toUpperCase();
    const isAdmin = u.role === 'admin';
    const roleBadge = isAdmin
      ? '<span class="badge" style="background-color: #4f46e5; font-size: 0.72rem;">ADMINISTRATOR</span>'
      : '<span class="badge" style="background-color: #10b981; font-size: 0.72rem;">TEAM MEMBER</span>';
    const dateFormatted = u.created_at ? u.created_at.split(' ')[0] : '—';

    return `
      <tr>
        <td class="ps-3 py-3">
          <div class="d-flex align-items-center gap-2">
            <div class="user-avatar-badge" style="width: 34px; height: 34px; font-size: 0.85rem; background: ${isAdmin ? 'linear-gradient(135deg, #4f46e5, #06b6d4)' : 'linear-gradient(135deg, #10b981, #059669)'};">
              ${initial}
            </div>
            <div>
              <div class="fw-bold text-dark small mb-0">
                ${escapeHtml(u.full_name)}
                ${isSelf ? '<span class="badge bg-light text-primary border ms-1" style="font-size: 0.65rem;">You</span>' : ''}
              </div>
              <div class="text-muted" style="font-size: 0.75rem;">@${escapeHtml(u.username)}</div>
            </div>
          </div>
        </td>
        <td class="py-3">${roleBadge}</td>
        <td class="py-3 text-muted small">${dateFormatted}</td>
        <td class="text-end pe-3 py-3">
          <div class="d-inline-flex gap-1">
            <button class="btn btn-sm btn-outline-primary py-1 px-2" title="Edit Profile & Reset Password" onclick="openEditUserModal(${u.id})">
              <i class="bi bi-pencil-square me-1"></i> Edit & Key
            </button>
            <button class="btn btn-sm btn-outline-danger py-1 px-2" title="${isSelf ? 'Cannot delete your active account' : 'Delete user'}" 
                    ${isSelf ? 'disabled' : ''} 
                    onclick="promptDeleteUser(${u.id}, '${escapeHtml(u.username).replace(/'/g, "\\'")}')">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Open Create User Modal
function openCreateUserModal() {
  document.getElementById('userEditModalTitle').textContent = 'Add New Workspace User';
  document.getElementById('userFormId').value = '';
  document.getElementById('userFormFullName').value = '';
  document.getElementById('userFormUsername').value = '';
  document.getElementById('userFormRole').value = 'user';
  
  const passInput = document.getElementById('userFormPassword');
  passInput.value = '';
  passInput.required = true;
  passInput.placeholder = '••••••••';

  document.getElementById('userPasswordRequiredAsterisk').classList.remove('d-none');
  document.getElementById('userFormPasswordHelp').textContent = 'Enter a secure password for this user (minimum 4 characters).';

  userEditModalInstance.show();
}

// Open Edit User Modal (Username, Full Name, Role, Password Reset)
window.openEditUserModal = function(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('userEditModalTitle').textContent = `Edit User: ${user.full_name}`;
  document.getElementById('userFormId').value = user.id;
  document.getElementById('userFormFullName').value = user.full_name;
  document.getElementById('userFormUsername').value = user.username;
  document.getElementById('userFormRole').value = user.role;

  const passInput = document.getElementById('userFormPassword');
  passInput.value = '';
  passInput.required = false;
  passInput.placeholder = 'Leave blank to keep unchanged';

  document.getElementById('userPasswordRequiredAsterisk').classList.add('d-none');
  document.getElementById('userFormPasswordHelp').textContent = 'Leave empty to keep existing password, or enter a new password to reset it.';

  userEditModalInstance.show();
};

// Prompt Delete User
window.promptDeleteUser = function(id, username) {
  state.pendingDelete = { type: 'user', id, name: username };
  document.getElementById('deleteConfirmTitle').textContent = 'Delete User Account?';
  document.getElementById('deleteConfirmMessage').innerHTML = `
    Are you sure you want to permanently delete user account <strong>@${escapeHtml(username)}</strong>?
    <br><span class="text-danger">This user will immediately lose access to DriveHub.</span>
  `;
  deleteModalInstance.show();
};

// Handle User Edit / Create Form Submission
document.getElementById('userEditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('saveUserSubmitBtn');
  const userId = document.getElementById('userFormId').value;
  const full_name = document.getElementById('userFormFullName').value.trim();
  const username = document.getElementById('userFormUsername').value.trim();
  const role = document.getElementById('userFormRole').value;
  const password = document.getElementById('userFormPassword').value;

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    if (userId) {
      // Update existing user
      const payload = { full_name, username, role };
      if (password && password.trim()) {
        payload.password = password.trim();
      }
      await API.updateUser(userId, payload);
      showToast(`User @${username} updated successfully!`);

      // If updating currently logged in user, refresh local state
      if (state.currentUser && state.currentUser.id === Number(userId)) {
        state.currentUser.full_name = full_name;
        state.currentUser.username = username;
        state.currentUser.role = role;
        updateUserUI();
      }
    } else {
      // Create new user
      if (!password || password.length < 4) {
        showToast('Password must be at least 4 characters long.', 'bi-exclamation-circle text-danger');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save User';
        return;
      }
      await API.createUser({ full_name, username, role, password });
      showToast(`User @${username} created successfully!`);
    }

    userEditModalInstance.hide();
    await loadAndRenderUsers();
  } catch (err) {
    showToast(err.message || 'Error saving user account.', 'bi-exclamation-circle text-danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save User';
  }
});

// Toggle Password visibility in User Form
document.getElementById('toggleUserFormPasswordBtn').addEventListener('click', () => {
  const passInput = document.getElementById('userFormPassword');
  const icon = document.getElementById('toggleUserFormPasswordIcon');
  const isPass = passInput.getAttribute('type') === 'password';
  passInput.setAttribute('type', isPass ? 'text' : 'password');
  icon.className = isPass ? 'bi bi-eye-slash' : 'bi bi-eye';
});

// User Search live input
const userSearchInput = document.getElementById('userSearchInput');
if (userSearchInput) {
  userSearchInput.addEventListener('input', (e) => {
    state.userSearchQuery = e.target.value;
    renderUsersTable();
  });
}

// Add User button inside modal
document.getElementById('modalOpenAddUserBtn').addEventListener('click', openCreateUserModal);

// ========================================================
// GLOBAL DELETE CONFIRMATION HANDLER
// ========================================================
document.getElementById('confirmDeleteActionBtn').addEventListener('click', async () => {
  if (!state.pendingDelete) return;

  const { type, id, name } = state.pendingDelete;
  const btn = document.getElementById('confirmDeleteActionBtn');

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    if (type === 'folder') {
      await API.deleteFolder(id);
      showToast(`Folder "${name}" deleted.`);
      if (String(state.activeFolderId) === String(id)) {
        state.activeFolderId = 'all';
      }
      await refreshData();
    } else if (type === 'card') {
      await API.deleteCard(id);
      showToast(`Card "${name}" deleted.`);
      await refreshData();
    } else if (type === 'user') {
      await API.deleteUser(id);
      showToast(`User account @${name} deleted.`);
      await loadAndRenderUsers();
    }

    deleteModalInstance.hide();
    state.pendingDelete = null;
  } catch (err) {
    showToast(err.message || 'Deletion failed.', 'bi-exclamation-circle text-danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
});

// ========================================================
// LOGOUT HANDLING
// ========================================================
window.handleLogout = function() {
  if (logoutModalInstance) {
    logoutModalInstance.show();
  } else {
    API.logout();
  }
};

document.getElementById('confirmLogoutActionBtn').addEventListener('click', async () => {
  const btn = document.getElementById('confirmLogoutActionBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Signing out...';
  await API.logout();
});

// ========================================================
// ICON & COLOR PICKERS
// ========================================================
function populateIconPicker() {
  const container = document.getElementById('iconPickerGrid');
  if (!container) return;

  container.innerHTML = AVAILABLE_ICONS.map(icon => `
    <button type="button" class="icon-choice-btn" data-icon="${icon}" onclick="selectFolderIcon('${icon}')">
      <i class="bi ${icon}"></i>
    </button>
  `).join('');
}

window.selectFolderIcon = function(icon) {
  document.getElementById('folderFormIcon').value = icon;
  document.getElementById('selectedIconLabel').textContent = `Selected: ${icon}`;

  const buttons = document.querySelectorAll('.icon-choice-btn');
  buttons.forEach(btn => {
    if (btn.dataset.icon === icon) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
};

function selectFolderColor(color) {
  document.getElementById('folderFormColor').value = color;
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    if (swatch.dataset.color === color) {
      swatch.classList.add('selected');
    } else {
      swatch.classList.remove('selected');
    }
  });
}

// ========================================================
// EVENT LISTENERS & NAVIGATION
// ========================================================
function setupEventListeners() {
  // Navigation
  document.getElementById('navAllItems').addEventListener('click', () => selectFolder('all'));
  document.getElementById('navStarred').addEventListener('click', () => selectFolder('starred'));
  document.getElementById('brandHomeLink').addEventListener('click', (e) => {
    e.preventDefault();
    selectFolder('all');
  });

  // Search input live filtering
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderCards();
    });
  }

  // Type filter pills
  const typePills = document.querySelectorAll('#typeFilterPills .filter-pill');
  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      typePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeTypeFilter = pill.dataset.type;
      renderCards();
    });
  });

  // Color picker swatches
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      selectFolderColor(swatch.dataset.color);
    });
  });

  // Action Buttons
  document.getElementById('sidebarAddFolderBtn').addEventListener('click', openCreateFolderModal);
  document.getElementById('topAddFolderBtn').addEventListener('click', openCreateFolderModal);
  document.getElementById('topAddCardBtn').addEventListener('click', openCreateCardModal);
  document.getElementById('emptyStateAddCardBtn').addEventListener('click', openCreateCardModal);

  // Current folder edit & delete buttons (Hero banner)
  document.getElementById('editCurrentFolderBtn').addEventListener('click', () => {
    if (state.activeFolderId !== 'all' && state.activeFolderId !== 'starred') {
      openEditFolderModal(Number(state.activeFolderId));
    }
  });

  document.getElementById('deleteCurrentFolderBtn').addEventListener('click', () => {
    if (state.activeFolderId !== 'all' && state.activeFolderId !== 'starred') {
      const folder = state.folders.find(f => f.id === Number(state.activeFolderId));
      if (folder) promptDeleteFolder(folder.id, folder.name);
    }
  });

  // Mobile sidebar drawer
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  const closeBtn = document.getElementById('closeSidebarBtn');
  const backdrop = document.getElementById('sidebarBackdrop');
  const sidebar = document.getElementById('appSidebar');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('show');
      backdrop.classList.add('show');
    });
  }

  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', closeMobileSidebar);
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', closeMobileSidebar);
  }

  // Logout button in sidebar footer
  document.getElementById('logoutBtn').addEventListener('click', () => {
    handleLogout();
  });
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
}

// HTML escape helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================================
// BACKUP & DATA PERSISTENCE MODAL
// ========================================================
let backupModalInstance = null;

window.openBackupModal = function() {
  if (!backupModalInstance) {
    const el = document.getElementById('backupModal');
    if (el) backupModalInstance = new bootstrap.Modal(el);
  }
  if (backupModalInstance) {
    backupModalInstance.show();
  }
};

window.downloadBackupJSON = async function() {
  const btn = document.getElementById('btnDownloadBackup');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Exporting...';
    }
    showToast('Exporting current folders and cards...', 'bi-download text-info');

    const res = await API.exportBackup();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "seed_data.json");
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();

    showToast('seed_data.json downloaded successfully!', 'bi-check-circle-fill text-success');
  } catch (err) {
    console.error('Download backup error:', err);
    showToast('Failed to download backup: ' + (err.message || err), 'bi-exclamation-triangle text-danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Download seed_data.json';
    }
  }
};

window.handleImportJSON = async function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.folders)) {
        throw new Error('Invalid JSON format. Expected an object with a "folders" array.');
      }

      showToast('Importing folders & cards into live database...', 'bi-cloud-arrow-up text-info');
      await API.importBackup(parsed);
      showToast('Data imported and saved successfully!', 'bi-check-circle-fill text-success');

      if (backupModalInstance) backupModalInstance.hide();
      await fetchFolders();
      await fetchCards();
    } catch (err) {
      console.error('Import error:', err);
      showToast('Import error: ' + (err.message || err), 'bi-exclamation-triangle text-danger');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
};
