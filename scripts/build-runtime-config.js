/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Secure Vercel Build Script
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'public');

/*
 * Variáveis fornecidas exclusivamente pelo ambiente de Preview da Vercel.
 *
 * IMPORTANTE:
 * SUPABASE_SERVICE_ROLE_KEY NÃO DEVE existir aqui.
 */

const renderApiUrl = process.env.RENDER_API_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

/* ==========================================================================
   VALIDAÇÃO DAS VARIÁVEIS
   ========================================================================== */

if (!renderApiUrl || !renderApiUrl.trim()) {
  console.error(
    '\nBUILD FAILED: A variável RENDER_API_URL é obrigatória.'
  );
  process.exit(1);
}

if (!supabaseUrl || !supabaseUrl.trim()) {
  console.error(
    '\nBUILD FAILED: A variável SUPABASE_URL é obrigatória.'
  );
  process.exit(1);
}

if (!supabaseAnonKey || !supabaseAnonKey.trim()) {
  console.error(
    '\nBUILD FAILED: A variável SUPABASE_ANON_KEY é obrigatória.'
  );
  process.exit(1);
}

/* ==========================================================================
   VALIDAÇÃO DAS URLS
   ========================================================================== */

const cleanRenderApiUrl = renderApiUrl.trim();
const cleanSupabaseUrl = supabaseUrl.trim();

try {
  const parsedRenderUrl = new URL(cleanRenderApiUrl);

  if (parsedRenderUrl.protocol !== 'https:') {
    throw new Error();
  }
} catch {
  console.error(
    '\nBUILD FAILED: RENDER_API_URL deve ser uma URL HTTPS válida.'
  );
  process.exit(1);
}

try {
  const parsedSupabaseUrl = new URL(cleanSupabaseUrl);

  if (parsedSupabaseUrl.protocol !== 'https:') {
    throw new Error();
  }
} catch {
  console.error(
    '\nBUILD FAILED: SUPABASE_URL deve ser uma URL HTTPS válida.'
  );
  process.exit(1);
}

/* ==========================================================================
   ARQUIVOS E DIRETÓRIOS DO FRONTEND
   ========================================================================== */

const frontendDirectories = [
  'assets',
  'css',
  'js'
];

const frontendFiles = [
  'index.html',
  'carteirinha.html',
  'manifest.json',
  'sw.js'
];

/* ==========================================================================
   BUILD
   ========================================================================== */

try {
  /*
   * Remove somente a pasta de saída gerada anteriormente.
   */
  fs.rmSync(outputDirectory, {
    recursive: true,
    force: true
  });

  fs.mkdirSync(outputDirectory, {
    recursive: true
  });

  /*
   * Copia somente as pastas públicas do frontend.
   */
  function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(
      `Diretório obrigatório não encontrado: ${source}`
    );
  }

  fs.mkdirSync(destination, {
    recursive: true
  });

  const entries = fs.readdirSync(source, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

for (const directory of frontendDirectories) {
  const source = path.join(projectRoot, directory);
  const destination = path.join(
    outputDirectory,
    directory
  );

  copyDirectory(source, destination);
}

  /*
   * Copia somente os arquivos públicos necessários.
   */
  for (const file of frontendFiles) {
    const source = path.join(projectRoot, file);
    const destination = path.join(
      outputDirectory,
      file
    );

    if (!fs.existsSync(source)) {
      throw new Error(
        `Arquivo obrigatório não encontrado: ${file}`
      );
    }

    fs.copyFileSync(source, destination);
  }

  /* ==========================================================================
     RUNTIME CONFIG
     ========================================================================== */

  const runtimeConfigPath = path.join(
    outputDirectory,
    'js',
    'runtime-config.js'
  );

  const runtimeConfigContent = `/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Generated Runtime Configuration
   DO NOT EDIT MANUALLY
   ========================================================================== */

window.RENDER_API_URL = ${JSON.stringify(cleanRenderApiUrl)};

window.SUPABASE_URL = ${JSON.stringify(cleanSupabaseUrl)};

window.SUPABASE_ANON_KEY = ${JSON.stringify(
    supabaseAnonKey.trim()
  )};
`;

  fs.writeFileSync(
    runtimeConfigPath,
    runtimeConfigContent,
    'utf8'
  );

  console.log(
    'Build concluído: frontend copiado com segurança para public/.'
  );

  console.log(
    'Runtime config gerada em public/js/runtime-config.js.'
  );

  /*
   * Por segurança, não imprimimos nenhuma chave no terminal.
   */
  console.log(
    'Configuração do Render API: OK.'
  );

  console.log(
    'Configuração do Supabase: OK.'
  );

} catch (error) {
  console.error(
    `BUILD FAILED: ${error.message}`
  );

  process.exit(1);
}