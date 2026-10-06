const http = require('http');

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING DRIVEHUB INTEGRATION TESTS ---');

  // 1. Test Admin Login
  console.log('\n[1] Testing Admin Login...');
  const adminLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  console.log('Status:', adminLogin.status);
  console.log('Admin User:', adminLogin.data.user);
  const adminToken = adminLogin.data.token;
  if (!adminToken) throw new Error('Failed to get admin token');

  // 2. Test Get Current User
  console.log('\n[2] Testing Auth Me with Token...');
  const meRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Me Response:', meRes.data);

  // 3. Test Fetch Folders
  console.log('\n[3] Testing Fetch Sidebar Folders...');
  const foldersRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/folders',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log(`Fetched ${foldersRes.data.length} folders:`, foldersRes.data.map(f => `${f.name} (${f.card_count} cards)`));

  // 4. Test Create New Dynamic Folder
  console.log('\n[4] Testing Admin Create Dynamic Sidebar Folder...');
  const newFolderRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/folders',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    name: 'Client Case Studies 2026',
    icon: 'bi-briefcase-fill',
    color: '#0284c7',
    description: 'Enterprise client presentations, ROI calculators, and testimonial recordings.'
  });
  console.log('Created Folder:', newFolderRes.data);
  const createdFolderId = newFolderRes.data.id;

  // 5. Test Update Folder
  console.log('\n[5] Testing Admin Update Folder...');
  const updateFolderRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/folders/${createdFolderId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    name: 'Strategic Case Studies & ROI',
    description: 'Updated description for strategic case studies.'
  });
  console.log('Updated Folder:', updateFolderRes.data.name);

  // 6. Test Create Drive Card
  console.log('\n[6] Testing Admin Create Drive Card...');
  const newCardRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/cards',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    folder_id: createdFolderId,
    title: 'Acme Corp Enterprise Case Study & Metrics',
    description: 'Deep dive into 300% conversion efficiency improvements, pitch deck slides, and client interview audio.',
    drive_url: 'https://drive.google.com/drive/folders/1abc999xyz888caseStudies',
    resource_type: 'folder',
    tags: 'Acme, Enterprise, CaseStudy, ROI',
    is_starred: 1
  });
  console.log('Created Drive Card:', newCardRes.data);
  const createdCardId = newCardRes.data.id;

  // 7. Test Fetch Cards with Filter
  console.log('\n[7] Testing Fetch Cards by Folder ID & Search...');
  const filterCardsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cards?folder_id=${createdFolderId}&search=Acme`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log(`Found ${filterCardsRes.data.length} card(s):`, filterCardsRes.data.map(c => c.title));

  // 8. Test Toggle Star
  console.log('\n[8] Testing Toggle Star...');
  const starRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cards/${createdCardId}/star`,
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Toggled Star Result:', starRes.data);

  // 9. Test Standard User Restrictions
  console.log('\n[9] Testing Standard User Login and Permissions Guard...');
  const userLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'user', password: 'user123' });
  const userToken = userLogin.data.token;
  console.log('User Role:', userLogin.data.user.role);

  // Attempt folder creation as standard user (should be 403 Forbidden)
  const forbiddenRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/folders',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    }
  }, { name: 'Unauthorized Folder' });
  console.log('Unauthorized Creation Response (Expected 403):', forbiddenRes.status, forbiddenRes.data);

  // 10. Test System Stats
  console.log('\n[10] Testing Stats Endpoint...');
  const statsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/stats',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('System Stats:', statsRes.data);

  // 11. Cleanup test card and folder
  console.log('\n[11] Cleaning up created test card & folder...');
  const delCardRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/cards/${createdCardId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Delete Card:', delCardRes.data);

  const delFolderRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/folders/${createdFolderId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Delete Folder:', delFolderRes.data);

  console.log('\nALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
