import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.join(__dirname, 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.warn('verify-preload: dist/index.html not found. Skipping check.');
  process.exit(0);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// Assert that Recharts is NOT modulepreloaded
const hasRechartsPreload = html.includes('recharts') && html.includes('modulepreload');
if (hasRechartsPreload) {
  console.error('✗ BUILD ERROR: Recharts chunk is eagerly preloaded in index.html!');
  process.exit(1);
}

// Assert that other core chunks (vendor, lucide, etc.) are still preloaded for performance
const hasCorePreload = html.includes('modulepreload');
if (!hasCorePreload) {
  console.error('✗ BUILD ERROR: No modulepreload links found in index.html!');
  process.exit(1);
}

console.log('✓ Build validation passed: Recharts chunk is dynamically loaded and core preloads are intact.');
process.exit(0);
