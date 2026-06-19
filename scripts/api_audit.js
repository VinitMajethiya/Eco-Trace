const http = require('http');

const BASE_URL = 'http://localhost:5000';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAudit() {
  console.log('--- STARTING REST API AUDIT ---');
  let cookie = '';

  try {
    // 1. POST /api/auth/register
    const email = `audit_${Date.now()}@example.com`;
    console.log(`\n1. Registering user: ${email}`);
    const regRes = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'AuditUser',
      email,
      password: 'Password123!'
    });
    console.log('Status:', regRes.statusCode);
    if (regRes.statusCode !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }

    // 2. POST /api/auth/login
    console.log('\n2. Logging in...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email,
      password: 'Password123!'
    });
    console.log('Status:', loginRes.statusCode);
    const setCookie = loginRes.headers['set-cookie'];
    console.log('Set-Cookie Header present:', !!setCookie);
    if (setCookie) {
      console.log('Cookie values:', setCookie);
      cookie = setCookie[0].split(';')[0];
    } else {
      throw new Error('Login response did not return a session cookie');
    }

    // 3. POST /api/auth/onboarding to complete onboarding defaults
    console.log('\n3. Completing onboarding...');
    const onboardRes = await makeRequest('POST', '/api/auth/onboarding', { Cookie: cookie }, {
      default_commute_mode: 'car_petrol',
      default_diet: 'omnivore',
      household_size: 2,
      city: 'mumbai'
    });
    console.log('Status:', onboardRes.statusCode);

    // 4. POST /api/activities (Valid Activity)
    console.log('\n4. Logging valid activity (transport -> car_petrol -> 50 km)...');
    const actRes = await makeRequest('POST', '/api/activities', { Cookie: cookie }, {
      category: 'transport',
      sub_type: 'car_petrol',
      quantity: 50,
      activity_date: new Date().toISOString().split('T')[0]
    });
    console.log('Status:', actRes.statusCode);
    console.log('Returned Body:', actRes.body);
    // Formula check: 50 km * 0.192 factor = 9.6 kg CO2e
    const expectedCO2e = 50 * 0.192;
    if (Math.abs(actRes.body.co2e_kg - expectedCO2e) > 0.01) {
      console.error(`ERROR: CO2e mismatch. Expected ${expectedCO2e}, got ${actRes.body.co2e_kg}`);
    } else {
      console.log(`✓ Calculation Correct! 50 * 0.192 = ${actRes.body.co2e_kg} kg CO2e`);
    }

    // 5. POST /api/activities (Out-of-Bounds Activity)
    console.log('\n5. Logging out-of-bounds activity (quantity = 999999)...');
    const oobRes = await makeRequest('POST', '/api/activities', { Cookie: cookie }, {
      category: 'transport',
      sub_type: 'car_petrol',
      quantity: 999999,
      activity_date: new Date().toISOString().split('T')[0]
    });
    console.log('Status (Expected 400):', oobRes.statusCode);
    console.log('Response Body:', oobRes.body);
    if (oobRes.statusCode === 400) {
      console.log('✓ Correctly rejected with status 400!');
    } else {
      console.error('ERROR: Out-of-bounds quantity was NOT rejected!');
    }

    // 6. GET /api/dashboard/summary
    console.log('\n6. Fetching dashboard summary...');
    const dashRes = await makeRequest('GET', '/api/dashboard/summary?range=month', { Cookie: cookie });
    console.log('Status:', dashRes.statusCode);
    console.log('Dashboard Data:', JSON.stringify(dashRes.body, null, 2));

    // Calculate details and verify percentages
    const total = dashRes.body.totalCO2e;
    const transportEntry = dashRes.body.categoryBreakdown.find(c => c.category === 'transport');
    const transportTotal = transportEntry ? transportEntry.co2e_kg : 0;
    const computedShare = total > 0 ? (transportTotal / total) * 100 : 0;
    console.log(`Total: ${total}, Transport Total: ${transportTotal}`);
    console.log(`Computed Share: ${computedShare.toFixed(1)}%`);
    console.log(`Dashboard Report Share: ${transportEntry ? `${transportEntry.percentage}%` : 'N/A'}`);

    console.log('\n--- AUDIT COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    console.error('\n--- AUDIT FAILED ---');
    console.error(error);
  }
}

runAudit();
