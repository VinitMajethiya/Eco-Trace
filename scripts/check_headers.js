const request = require('supertest');
const app = require('../server');

async function checkHeaders() {
  console.log('--- CHECKING SECURITY HEADERS ---');
  
  // Make a request via supertest
  const res = await request(app).get('/api/reference/emission-factors');
  
  console.log('Response Headers:');
  Object.keys(res.headers).forEach(header => {
    console.log(`  ${header}: ${res.headers[header]}`);
  });

  console.log('\nChecking critical Helmet security headers:');
  const criticalHeaders = {
    'content-security-policy': 'Content-Security-Policy',
    'x-dns-prefetch-control': 'X-DNS-Prefetch-Control',
    'x-frame-options': 'X-Frame-Options',
    'x-content-type-options': 'X-Content-Type-Options',
    'strict-transport-security': 'Strict-Transport-Security',
    'x-download-options': 'X-Download-Options',
    'x-permitted-cross-domain-policies': 'X-Permitted-Cross-Domain-Policies',
    'referrer-policy': 'Referrer-Policy'
  };

  let allOk = true;
  Object.keys(criticalHeaders).forEach(h => {
    if (res.headers[h]) {
      console.log(`  ✓ ${criticalHeaders[h]}: present (${res.headers[h]})`);
    } else {
      console.warn(`  ✗ ${criticalHeaders[h]}: MISSING!`);
      allOk = false;
    }
  });

  if (allOk) {
    console.log('\n✓ ALL CRITICAL SECURITY HEADERS ARE PRESENT!');
  } else {
    console.warn('\n✗ SOME SECURITY HEADERS ARE MISSING!');
  }
}

checkHeaders();
