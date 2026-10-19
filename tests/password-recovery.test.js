const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup(hash = '', overrides = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', textContent: '', hidden: id === 'update-password', disabled: false,
      addEventListener(event, fn) { this[event] = fn; }, focus() {}
    });
    return nodes.get(id);
  };
  const calls = { sessions: 0, updates: [], requests: [], signouts: 0 };
  const auth = {
    async setSession() { calls.sessions++; return { error: null }; },
    async getUser() { return { data: { user: { email: 'danielsandes05@gmail.com' } }, error: null }; },
    async updateUser(data) { calls.updates.push(data); return { error: null }; },
    async resetPasswordForEmail(email, options) { calls.requests.push({ email, options }); return { error: null }; },
    async signOut() { calls.signouts++; return { error: null }; },
    ...overrides
  };
  const window = {
    location: { hash, pathname: '/recuperar-senha.html', href: 'https://example.test/recuperar-senha.html' + hash },
    history: { replaceState(...args) { calls.history = args; } },
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key',
    supabase: { createClient(url, key, options) { calls.options = options; return { auth }; } }
  };
  const context = vm.createContext({ window, document: { getElementById: node }, URL, URLSearchParams });
  vm.runInContext(read('admin-access.js'), context);
  vm.runInContext(read('password-recovery.js'), context);
  await flush();
  return { node, calls, window, submit: id => node(id).submit({ preventDefault() {} }) };
}
const validHash = '#type=recovery&access_token=test-access&refresh_token=test-refresh';

test('plain page cannot change password, even with an existing session', async () => {
  const s = await setup();
  s.node('new-password').value = s.node('confirm-password').value = 'new-password';
  await s.submit('update-password');
  assert.equal(s.calls.sessions, 0);
  assert.equal(s.calls.updates.length, 0);
  assert.equal(s.node('update-password').hidden, true);
});

test('valid recovery verifies identity, clears URL, uses memory and changes password', async () => {
  const s = await setup(validHash);
  assert.equal(s.calls.history[2], '/recuperar-senha.html');
  assert.equal(s.calls.options.auth.persistSession, false);
  assert.equal(s.calls.options.auth.detectSessionInUrl, false);
  assert.equal(s.node('update-password').hidden, false);
  s.node('new-password').value = s.node('confirm-password').value = '  new-password  ';
  await s.submit('update-password');
  assert.equal(s.calls.updates[0].password, '  new-password  ');
  assert.equal(s.calls.signouts, 1);
  assert.equal(s.node('new-password').value, '');
  assert.match(s.node('recovery-status').textContent, /sucesso/);
  await s.submit('update-password');
  assert.equal(s.calls.updates.length, 1);
});

test('wrong account never unlocks password form', async () => {
  const s = await setup(validHash, { async getUser() { return { data: { user: { email: 'other@example.test' } } }; } });
  assert.equal(s.node('update-password').hidden, true);
  await s.submit('update-password');
  assert.equal(s.calls.updates.length, 0);
  assert.match(s.node('recovery-status').textContent, /não pertence/);
});

test('unverified token is rejected', async () => {
  const s = await setup(validHash, { async getUser() { return { error: { code: 'session_not_found' } }; } });
  assert.equal(s.node('update-password').hidden, true);
  assert.match(s.node('recovery-status').textContent, /expirou/);
});

test('expired, incomplete and non-recovery links cannot change password', async () => {
  for (const hash of ['#error_code=otp_expired', '#type=recovery&access_token=x', '#type=signup&access_token=x&refresh_token=y']) {
    const s = await setup(hash);
    assert.equal(s.calls.sessions, 0);
    assert.equal(s.node('update-password').hidden, true);
    assert.match(s.node('recovery-status').textContent, /expirou/);
  }
});

test('password confirmation must match and meet minimum length', async () => {
  const s = await setup(validHash);
  s.node('new-password').value = 'long-password';
  s.node('confirm-password').value = 'different-password';
  await s.submit('update-password');
  assert.equal(s.calls.updates.length, 0);
  assert.match(s.node('recovery-status').textContent, /iguais/);
  s.node('new-password').value = s.node('confirm-password').value = 'short';
  await s.submit('update-password');
  assert.equal(s.calls.updates.length, 0);
});

test('update failure retains form and permits retry', async () => {
  const s = await setup(validHash, { async updateUser() { return { error: { code: 'weak_password' } }; } });
  s.node('new-password').value = s.node('confirm-password').value = 'new-password';
  await s.submit('update-password');
  assert.equal(s.node('save-password').disabled, false);
  assert.equal(s.node('update-password').hidden, false);
  assert.match(s.node('recovery-status').textContent, /segurança/);
});

test('request specifies current origin recovery page and fixed administrator', async () => {
  const s = await setup();
  await s.submit('request-recovery');
  assert.equal(s.calls.requests[0].email, 'danielsandes05@gmail.com');
  assert.equal(s.calls.requests[0].options.redirectTo, 'https://example.test/recuperar-senha.html');
});

test('email rate limit is reported and button restored', async () => {
  const s = await setup('', { async resetPasswordForEmail() { return { error: { code: 'over_email_send_rate_limit' } }; } });
  await s.submit('request-recovery');
  assert.match(s.node('recovery-status').textContent, /Limite/);
  assert.equal(s.node('send-recovery').disabled, false);
});

test('dashboard recovery at root redirects without retaining credentials in root history', () => {
  const calls = {};
  const window = {
    location: { href: 'https://example.test/', pathname: '/', hash: validHash, replace(value) { calls.destination = value; } },
    history: { replaceState(a, b, value) { calls.history = value; } }
  };
  vm.runInNewContext(read('recovery-redirect.js'), { window, URL, URLSearchParams });
  assert.equal(calls.history, '/');
  assert.equal(calls.destination, 'https://example.test/recuperar-senha.html' + validHash);
});

test('login distinguishes service failures from invalid password and always releases loading', async () => {
  const source = read('app.js');
  const start = source.indexOf("    formAdminAuth.addEventListener('submit', async (e) => {");
  const end = source.indexOf('\n  // Scanner Buttons', start);
  const handlerSource = source.slice(start, end).replace(/\n  }\s*$/, '');
  for (const scenario of [
    { code: 'invalid_credentials', expected: /não conferem/ },
    { code: 'email_not_confirmed', expected: /não foi confirmado/ },
    { code: 'config_missing', expected: /configuração/ },
    { code: 'network', expected: /conectar/ }
  ]) {
    let handler;
    let loading = false;
    let admin = false;
    const nodes = {
      'input-admin-password': { value: 'test', focus() {} },
      'admin-auth-error': { style: {} },
      'btn-confirm-admin-auth': { disabled: false }
    };
    const window = {
      supabaseClient: scenario.code === 'config_missing' ? null : {
        auth: { async signInWithPassword() {
          if (scenario.code === 'network') throw { name: 'AuthRetryableFetchError' };
          return { data: { session: null }, error: { code: scenario.code } };
        } }
      },
      authManager: { setRole() { admin = true; } }
    };
    const context = vm.createContext({ window,
      document: { getElementById: id => nodes[id] },
      formAdminAuth: { addEventListener(event, fn) { handler = fn; } },
      showLoadingModal() { loading = true; }, hideLoadingModal() { loading = false; },
      closeAdminAuthModal() {}, refreshAllUI() {}
    });
    vm.runInContext(read('admin-access.js'), context);
    vm.runInContext(handlerSource, context);
    await handler({ preventDefault() {} });
    assert.equal(admin, false);
    assert.equal(loading, false);
    assert.equal(nodes['btn-confirm-admin-auth'].disabled, false);
    assert.match(nodes['admin-auth-error'].textContent, scenario.expected);
  }
});
