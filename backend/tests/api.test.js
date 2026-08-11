/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM API
   Automated Security & Integration Test Suite (Staging)
   ========================================================================== */

const assert = require('assert');
const http = require('http');

const PORT = 10001;
process.env.PORT = PORT;
process.env.NODE_ENV = 'test';

// Iniciar servidor em porta de teste
const server = require('../server');

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes Automatizados de Segurança e API...');

  try {
    // Teste 1: Health Check Público
    console.log('  [1/5] Testando GET /api/health (Público)...');
    const health = await makeRequest('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'UP');
    console.log('  ✅ Teste 1 Passou!');

    // Teste 2: Bloqueio de Requisição Sem Token
    console.log('  [2/5] Testando GET /api/students Sem Header Authorization...');
    const noAuth = await makeRequest('/api/students');
    assert.strictEqual(noAuth.status, 401);
    assert.strictEqual(noAuth.body.error, 'UNAUTHORIZED');
    console.log('  ✅ Teste 2 Passou!');

    // Teste 3: Bloqueio de Requisição Com Token Inválido
    console.log('  [3/5] Testando GET /api/students Com Token Inválido...');
    const invalidToken = await makeRequest('/api/students', {
      headers: { 'Authorization': 'Bearer token_falso_invalid_123' }
    });
    assert.strictEqual(invalidToken.status, 401);
    assert.strictEqual(invalidToken.body.error, 'UNAUTHORIZED');
    console.log('  ✅ Teste 3 Passou!');

    // Teste 4: Bloqueio de Validação de Refeição Sem Token
    console.log('  [4/5] Testando POST /api/meals/validate Sem Token...');
    const noAuthMeal = await makeRequest('/api/meals/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: '2026001', method: 'MANUAL_MATRICULA' }
    });
    assert.strictEqual(noAuthMeal.status, 401);
    console.log('  ✅ Teste 4 Passou!');

    // Teste 5: Rota Não Encontrada (HTTP 404)
    console.log('  [5/5] Testando GET /api/rota-inexistente...');
    const notFound = await makeRequest('/api/rota-inexistente');
    assert.strictEqual(notFound.status, 404);
    assert.strictEqual(notFound.body.error, 'NOT_FOUND');
    console.log('  ✅ Teste 5 Passou!');

    console.log('\n🎉 TODOS OS TESTES AUTOMATIZADOS PASSARAM COM SUCESSO! 🎉\n');
    process.exit(0);

  } catch (err) {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
  }
}

// Aguardar inicialização do servidor Express
setTimeout(runTests, 1000);
