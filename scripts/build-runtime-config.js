/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Secure Vercel Build Script
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'public');

const renderApiUrl = process.env.RENDER_API_URL;

if (!renderApiUrl || !renderApiUrl.trim()) {
  console.error(
    '\nBUILD FAILED: A variável RENDER_API_URL é obrigatória.'
  );
  process.exit(1);
}

const cleanUrl = renderApiUrl.trim();

try {
  const parsedUrl = new URL(cleanUrl);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error();
  }
} catch {
  console.error(
    '\nBUILD FAILED: RENDER_API_URL deve ser uma URL HTTPS válida.'
  );
  process.exit(1);
}

const frontendDirectories = [
  'assets',
  'css',
  'js'
];

const frontendFiles = [
  'index.html',
  'manifest.json',
  'sw.js'
];

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, {
    recursive: true
  });

  const entries = fs.readdirSync(source, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(
      destination,
      entry.name
    );

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
      continue;
    }

    throw new Error(
      `Tipo de arquivo não suportado: ${sourcePath}`
    );
  }
}

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
  for (const directory of frontendDirectories) {
    const source = path.join(projectRoot, directory);
    const destination = path.join(
      outputDirectory,
      directory
    );

    if (!fs.existsSync(source)) {
      throw new Error(
        `Diretório obrigatório não encontrado: ${directory}`
      );
    }

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

  /*
   * Sobrescreve a configuração copiada com o endereço
   * fornecido exclusivamente pelo ambiente de Preview.
   */
  const runtimeConfigPath = path.join(
    outputDirectory,
    'js',
    'runtime-config.js'
  );

  const runtimeConfigContent = `/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Generated Runtime Configuration
   ========================================================================== */

window.RENDER_API_URL = ${JSON.stringify(cleanUrl)};
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
} catch (error) {
  console.error(
    `BUILD FAILED: ${error.message}`
  );
  process.exit(1);
}