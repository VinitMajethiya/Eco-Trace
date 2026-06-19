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

async function runTest() {
  console.log('--- STARTING RECOMMENDATIONS API FLOW TEST ---');
  let cookie = '';

  try {
    // 1. POST /api/auth/register
    const email = `test_rec_${Date.now()}@example.com`;
    console.log(`\n1. Registering user: ${email}`);
    const regRes = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'TestRecUser',
      email,
      password: 'Password123!'
    });
    console.log('Status:', regRes.statusCode);

    // 2. POST /api/auth/login
    console.log('\n2. Logging in...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email,
      password: 'Password123!'
    });
    console.log('Status:', loginRes.statusCode);
    const setCookie = loginRes.headers['set-cookie'];
    if (setCookie) {
      cookie = setCookie[0].split(';')[0];
    } else {
      throw new Error('Login failed');
    }

    // 3. POST /api/auth/onboarding to complete onboarding defaults
    console.log('\n3. Completing onboarding...');
    await makeRequest('POST', '/api/auth/onboarding', { Cookie: cookie }, {
      default_commute_mode: 'car_petrol',
      default_diet: 'omnivore',
      household_size: 2,
      city: 'mumbai'
    });

    // 4. Log 5 activities to unlock recommendations
    console.log('\n4. Logging 5 transport activities...');
    for (let i = 1; i <= 5; i++) {
      const actRes = await makeRequest('POST', '/api/activities', { Cookie: cookie }, {
        category: 'transport',
        sub_type: 'car_petrol',
        quantity: 20 + i,
        activity_date: `2026-06-0${i}`
      });
      console.log(`Logged Activity ${i}: co2e_kg = ${actRes.body.co2e_kg}`);
    }

    // 5. GET /api/recommendations with invalid API key (temporarily via headers/mocking or we can see it is already configured with valid key)
    // Wait, let's hit recommendations now. The server currently has the valid key in process.env.
    // Let's call /api/recommendations and see the output
    console.log('\n5. Fetching recommendations (Live LLM with current key in .env)...');
    const recRes = await makeRequest('GET', '/api/recommendations?refresh=true', { Cookie: cookie });
    console.log('Status:', recRes.statusCode);
    console.log('Source:', recRes.body.recommendation?.source);
    console.log('Summary:', recRes.body.recommendation?.summary_text);
    console.log('Actions:', JSON.stringify(recRes.body.actions, null, 2));

  } catch (error) {
    console.error('\n--- TEST FAILED ---');
    console.error(error);
  }
}

runTest();
