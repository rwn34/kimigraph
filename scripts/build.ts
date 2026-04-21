#!/usr/bin/env node
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const WATCH = process.argv.includes('--watch');
const OUTDIR = 'dist';

async function copyAssets(): Promise<void> {
  const schemaSrc = path.join('src', 'db', 'schema.sql');
  const schemaDst = path.join(OUTDIR, 'db', 'schema.sql');
  if (fs.existsSync(schemaSrc)) {
    fs.mkdirSync(path.dirname(schemaDst), { recursive: true });
    fs.copyFileSync(schemaSrc, schemaDst);
  }
  const queriesSrc = path.join('src', 'extraction', 'queries');
  const queriesDst = path.join(OUTDIR, 'extraction', 'queries');
  if (fs.existsSync(queriesSrc)) {
    fs.mkdirSync(queriesDst, { recursive: true });
    for (const file of fs.readdirSync(queriesSrc)) {
      if (file.endsWith('.scm')) {
        fs.copyFileSync(path.join(queriesSrc, file), path.join(queriesDst, file));
      }
    }
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

async function build(): Promise<void> {
  fs.mkdirSync(OUTDIR, { recursive: true });
  await copyAssets();

  const commonOptions: esbuild.BuildOptions = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    external: ['better-sqlite3', 'sqlite-vec', '@huggingface/transformers', 'web-tree-sitter', 'tree-sitter-wasms'],
    define: {
      'process.env.KIMIGRAPH_VERSION': `"${getVersion()}"`,
    },
  };

  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/index.ts'],
    outfile: path.join(OUTDIR, 'index.js'),
    minify: false,
  });

  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/bin/kimigraph.ts'],
    outfile: path.join(OUTDIR, 'bin', 'kimigraph.js'),
    minify: false,
  });

  // Add shebang to CLI output
  const cliPath = path.join(OUTDIR, 'bin', 'kimigraph.js');
  if (fs.existsSync(cliPath)) {
    const content = fs.readFileSync(cliPath, 'utf8');
    if (!content.startsWith('#!')) {
      fs.writeFileSync(cliPath, '#!/usr/bin/env node\n' + content, 'utf8');
    }
    if (process.platform !== 'win32') {
      fs.chmodSync(cliPath, 0o755);
    }
  }

  // Generate TypeScript declarations
  try {
    const { execSync } = require('child_process');
    execSync('tsc --emitDeclarationOnly', { stdio: 'inherit' });
  } catch {
    // tsc may emit errors for bundled files; declarations are best-effort
  }

  console.log(`Build complete: ${OUTDIR}/`);
}

async function main(): Promise<void> {
  if (WATCH) {
    console.log('Watching for changes...');
    const ctx = await esbuild.context({
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      entryPoints: ['src/index.ts', 'src/bin/kimigraph.ts'],
      outdir: OUTDIR,
      sourcemap: true,
    });
    await ctx.watch();
  } else {
    await build();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
