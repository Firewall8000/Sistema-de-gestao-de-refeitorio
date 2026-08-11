/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Secure Build Script: Vanilla JS Runtime Configuration Generator
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const renderApiUrl = process.env.RENDER_API_URL;

if (!renderApiUrl || !renderApiUrl.trim()) {
  console.error('\n❌ BUILD FAILED: A variável de ambiente RENDER_API_URL é OBRIGATÓRIA.');
  console.error('   Por favor, defina RENDER_API_URL (ex: https://santos-dumont-api-staging.onrender.com) antes de executar o build.\n');
  process.exit(1);
}

const cleanUrl = renderApiUrl.trim();
const targetPath = path.join(__dirname, '..', 'js', 'runtime-config.js');

const fileContent = `/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Generated Runtime Configuration (DO NOT EDIT MANUALLY)
   Generated at: ${new Date().toISOString()}
   ========================================================================== */

window.RENDER_API_URL = ${JSON.stringify(cleanUrl)};
`;

try {
  fs.writeFileSync(targetPath, fileContent, 'utf8');
  console.log(`✅ [Build Runtime Config] js/runtime-config.js gerado com sucesso!`);
  console.log(`   RENDER_API_URL configurada para: ${cleanUrl}`);
} catch (err) {
  console.error(`❌ Erro ao escrever js/runtime-config.js:`, err.message);
  process.exit(1);
}
