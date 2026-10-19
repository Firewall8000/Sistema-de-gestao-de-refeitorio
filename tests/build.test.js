const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Vercel build packages recovery and all local references without backend secrets', t => {
  const root = path.join(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-build-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const item of ['scripts', 'assets', 'css', 'js', 'index.html', 'carteirinha.html',
    'recuperar-senha.html', 'manifest.json', 'manifest-carteirinha.json', 'sw.js']) {
    fs.cpSync(path.join(root, item), path.join(temp, item), { recursive: true });
  }
  fs.mkdirSync(path.join(temp, 'backend'));
  fs.writeFileSync(path.join(temp, 'backend', '.env'), 'PRIVATE_TEST_VALUE=never-publish');
  const result = spawnSync(process.execPath, ['scripts/build-runtime-config.js'], {
    cwd: temp, encoding: 'utf8', env: { ...process.env,
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key',
      RENDER_API_URL: 'https://api.example.test', SUPABASE_SERVICE_ROLE_KEY: 'never-publish'
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(temp, 'public');
  for (const page of ['index.html', 'recuperar-senha.html']) {
    const html = fs.readFileSync(path.join(output, page), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const ref = match[1];
      if (/^(https?:|data:|mailto:)/.test(ref)) continue;
      assert.ok(fs.existsSync(path.join(output, ref)), `${page}: missing ${ref}`);
    }
  }
  const runtime = fs.readFileSync(path.join(output, 'js/runtime-config.js'), 'utf8');
  assert.match(runtime, /https:\/\/example\.supabase\.co/);
  assert.match(runtime, /public-test-key/);
  assert.ok(!runtime.includes('never-publish'));
  assert.ok(!fs.existsSync(path.join(output, 'backend')));
  assert.ok(!fs.existsSync(path.join(output, '.env')));
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(vercel.buildCommand, 'npm run build');
  assert.equal(vercel.outputDirectory, 'public');
});
