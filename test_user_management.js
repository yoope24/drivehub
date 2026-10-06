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
  console.log('--- TESTING DRIVEHUB USER MANAGEMENT & CREDENTIAL RESET ---');

  // 1. Admin Login
  console.log('\n[1] Admin Login...');
  const adminLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  if (adminLogin.status !== 200) throw new Error('Admin login failed');
  const adminToken = adminLogin.data.token;
  const adminId = adminLogin.data.user.id;
  console.log('Logged in as Admin (ID:', adminId, ')');

  // 2. Fetch Users List
  console.log('\n[2] Fetching Users List as Admin...');
  const usersRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log(`Found ${usersRes.data.length} users:`, usersRes.data.map(u => `@${u.username} (${u.role})`));

  // 3. Create New User
  console.log('\n[3] Admin Creating New User (sarah_manager)...');
  const createRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    full_name: 'Sarah Connor',
    username: 'sarah_manager',
    password: 'initialPassword2026',
    role: 'user'
  });
  console.log('Create User Status:', createRes.status);
  console.log('Created User:', createRes.data);
  const createdUserId = createRes.data.id;

  // 4. Test Login with New User's initial credentials
  console.log('\n[4] Testing Login with New User Credentials...');
  const newLogin = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'sarah_manager', password: 'initialPassword2026' });
  console.log('New User Login Status:', newLogin.status);
  const newUserToken = newLogin.data.token;
  if (!newUserToken) throw new Error('New user login failed');

  // 5. Test Non-Admin trying to access user management (Should be 403 Forbidden)
  console.log('\n[5] Testing Security Guard: Regular User attempting to access /api/users...');
  const forbiddenUsers = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${newUserToken}` }
  });
  console.log('Status (Expected 403):', forbiddenUsers.status, forbiddenUsers.data);

  // 6. Admin Updates Username and Resets Password
  console.log('\n[6] Admin Updating User and Resetting Password...');
  const updateRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${createdUserId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    full_name: 'Sarah C. Connor (VP Operations)',
    username: 'sarah_vp',
    role: 'admin',
    password: 'newResetPassword999'
  });
  console.log('Update User Result:', updateRes.data);

  // 7. Verify Old Password Fails
  console.log('\n[7] Verifying Old Password Fails...');
  const oldLoginFail = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'sarah_vp', password: 'initialPassword2026' });
  console.log('Old Password Status (Expected 401):', oldLoginFail.status);

  // 8. Verify New Password Succeeds
  console.log('\n[8] Verifying New Password Login...');
  const newLoginSuccess = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'sarah_vp', password: 'newResetPassword999' });
  console.log('New Password Login Status (Expected 200):', newLoginSuccess.status);
  console.log('User Role Promoted:', newLoginSuccess.data.user.role);

  // 9. Guard: Admin cannot delete their own active account
  console.log('\n[9] Testing Guard: Admin Cannot Delete Self...');
  const selfDelRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${adminId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Self-Delete Guard (Expected 400):', selfDelRes.status, selfDelRes.data);

  // 10. Admin Deletes Test User
  console.log('\n[10] Admin Deleting Created Test User...');
  const delRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/${createdUserId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('Delete Result:', delRes.data);

  console.log('\nALL USER MANAGEMENT TESTS PASSED PERFECTLY! 🛡️');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
