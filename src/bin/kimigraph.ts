#!/usr/bin/env node
/**
 * KimiGraph CLI entry point.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { KimiGraph, initGrammars } from '../index';
import { MCPServer } from '../mcp/server';
import { logError } from '../errors';

const program = new Command();
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));

program
  .name('kimigraph')
  .description('Local-first semantic code knowledge graph for Kimi Code CLI')
  .version(pkg.version);

// --------------------------------------------------------------------------
// init
// --------------------------------------------------------------------------
program
  .command('init [project-path]')
  .description('Initialize KimiGraph in a project')
  .option('-i, --index', 'Run initial indexing after init')
  .action(async (projectPath: string = '.', options: { index?: boolean }) => {
    try {
      const resolved = path.resolve(projectPath);
      const kg = await KimiGraph.init(resolved);
      console.log(`Initialized KimiGraph in ${resolved}/.kimigraph/`);

      if (options.index) {
        console.log('Indexing...');
        const result = await kg.indexAll((p) => {
          if (p.phase === 'parsing') {
            process.stdout.write(`\r  ${p.current}/${p.total} files`);
          }
        });
        console.log(`\nIndexed ${result.filesIndexed} files, ${result.nodesCreated} symbols, ${result.edgesCreated} edges`);
      }

      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// index
// --------------------------------------------------------------------------
program
  .command('index [project-path]')
  .description('Full re-index of the project')
  .action(async (projectPath: string = '.') => {
    try {
      const resolved = path.resolve(projectPath);
      const kg = await KimiGraph.open(resolved);
      console.log('Indexing...');
      const result = await kg.indexAll((p) => {
        if (p.phase === 'parsing') {
          process.stdout.write(`\r  ${p.current}/${p.total} files`);
        }
      });
      console.log(`\nIndexed ${result.filesIndexed} files, ${result.nodesCreated} symbols, ${result.edgesCreated} edges`);
      if (result.errors.length > 0) {
        console.log(`  ${result.errors.length} errors (see logs)`);
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// sync
// --------------------------------------------------------------------------
program
  .command('sync [project-path]')
  .description('Incremental sync of changed files')
  .action(async (projectPath: string = '.') => {
    try {
      const resolved = path.resolve(projectPath);
      const kg = await KimiGraph.open(resolved);
      const result = await kg.sync();
      console.log(`Synced: ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesRemoved} removed`);
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// status
// --------------------------------------------------------------------------
program
  .command('status [project-path]')
  .description('Show index statistics')
  .action(async (projectPath: string = '.') => {
    try {
      const resolved = path.resolve(projectPath);
      const kg = await KimiGraph.open(resolved);
      const stats = kg.getStats();
      const dbMb = (stats.dbSizeBytes / 1024 / 1024).toFixed(2);
      console.log(`KimiGraph Status for ${resolved}`);
      console.log(`  Files: ${stats.files}`);
      console.log(`  Symbols: ${stats.nodes}`);
      console.log(`  Relationships: ${stats.edges}`);
      console.log(`  DB size: ${dbMb} MB`);
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// query
// --------------------------------------------------------------------------
program
  .command('query <search>')
  .description('Search symbols by name')
  .option('-k, --kind <kind>', 'Filter by kind')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (search: string, options: { kind?: string; limit: string }) => {
    try {
      const kg = await KimiGraph.open('.');
      const results = kg.searchNodes(search, {
        kinds: options.kind ? [options.kind as any] : undefined,
        limit: parseInt(options.limit, 10),
      });
      for (const r of results) {
        console.log(`${r.node.kind} ${r.node.name} — ${r.node.filePath}:${r.node.startLine}`);
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// callers
// --------------------------------------------------------------------------
program
  .command('callers <symbol>')
  .description('Find symbols that call the given symbol')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (symbol: string, options: { limit: string }) => {
    try {
      const kg = await KimiGraph.open('.');
      const results = kg.searchNodes(symbol, { limit: 5 });
      if (results.length === 0) {
        console.log(`No symbol found matching "${symbol}"`);
        kg.close();
        return;
      }
      const node = results[0].node;
      const callers = kg.getCallers(node.id, parseInt(options.limit, 10));
      console.log(`Callers of ${node.kind} ${node.name} (${node.filePath}:${node.startLine}):`);
      if (callers.length === 0) {
        console.log('  (none)');
      } else {
        for (const c of callers) {
          console.log(`  ${c.kind} ${c.name} — ${c.filePath}:${c.startLine}`);
        }
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// callees
// --------------------------------------------------------------------------
program
  .command('callees <symbol>')
  .description('Find symbols called by the given symbol')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (symbol: string, options: { limit: string }) => {
    try {
      const kg = await KimiGraph.open('.');
      const results = kg.searchNodes(symbol, { limit: 5 });
      if (results.length === 0) {
        console.log(`No symbol found matching "${symbol}"`);
        kg.close();
        return;
      }
      const node = results[0].node;
      const callees = kg.getCallees(node.id, parseInt(options.limit, 10));
      console.log(`Callees of ${node.kind} ${node.name} (${node.filePath}:${node.startLine}):`);
      if (callees.length === 0) {
        console.log('  (none)');
      } else {
        for (const c of callees) {
          console.log(`  ${c.kind} ${c.name} — ${c.filePath}:${c.startLine}`);
        }
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// impact
// --------------------------------------------------------------------------
program
  .command('impact <symbol>')
  .description('Find symbols affected by changing the given symbol')
  .option('-d, --depth <n>', 'Traversal depth', '3')
  .option('-l, --limit <n>', 'Max results', '20')
  .action(async (symbol: string, options: { depth: string; limit: string }) => {
    try {
      const kg = await KimiGraph.open('.');
      const results = kg.searchNodes(symbol, { limit: 5 });
      if (results.length === 0) {
        console.log(`No symbol found matching "${symbol}"`);
        kg.close();
        return;
      }
      const node = results[0].node;
      const impacted = kg.getImpactRadius(node.id, parseInt(options.depth, 10));
      const limit = parseInt(options.limit, 10);
      console.log(`Impact radius of ${node.kind} ${node.name} (${node.filePath}:${node.startLine}):`);
      if (impacted.length === 0) {
        console.log('  (none)');
      } else {
        for (const n of impacted.slice(0, limit)) {
          console.log(`  ${n.kind} ${n.name} — ${n.filePath}:${n.startLine}`);
        }
        if (impacted.length > limit) {
          console.log(`  ... and ${impacted.length - limit} more`);
        }
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// context
// --------------------------------------------------------------------------
program
  .command('context <task>')
  .description('Build context for a task (for testing)')
  .option('--max-nodes <n>', 'Max symbols', '20')
  .action(async (task: string, options: { maxNodes: string }) => {
    try {
      const kg = await KimiGraph.open('.');
      const ctx = await kg.buildContext(task, { maxNodes: parseInt(options.maxNodes, 10) });
      console.log(ctx.summary);
      console.log('\nEntry Points:');
      for (const n of ctx.entryPoints) {
        console.log(`  ${n.kind} ${n.name} — ${n.filePath}:${n.startLine}`);
      }
      console.log('\nRelated Symbols:');
      for (const n of ctx.relatedNodes) {
        console.log(`  ${n.kind} ${n.name} — ${n.filePath}:${n.startLine}`);
      }
      kg.close();
    } catch (err) {
      logError(String(err));
      process.exit(1);
    }
  });

// --------------------------------------------------------------------------
// serve --mcp
// --------------------------------------------------------------------------
program
  .command('serve')
  .description('Start MCP server')
  .option('--mcp', 'Run as MCP server (stdio)')
  .option('--project <path>', 'Project path')
  .action(async (options: { mcp?: boolean; project?: string }) => {
    await initGrammars();
    if (options.mcp) {
      const server = new MCPServer(options.project);
      await server.start();
    } else {
      console.log('Use --mcp to start the MCP server');
    }
  });

// --------------------------------------------------------------------------
// install
// --------------------------------------------------------------------------
program
  .command('install')
  .description('Add KimiGraph to Kimi CLI MCP config')
  .action(() => {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) {
      logError('Could not determine home directory');
      process.exit(1);
    }

    const mcpPath = path.join(home, '.kimi', 'mcp.json');
    fs.mkdirSync(path.dirname(mcpPath), { recursive: true });

    let config: any = { mcpServers: {} };
    if (fs.existsSync(mcpPath)) {
      try {
        config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      } catch {
        // ignore parse errors, overwrite
      }
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.kimigraph = {
      command: 'npx',
      args: ['rwn-kimigraph@latest', 'serve', '--mcp'],
    };

    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`Added KimiGraph to ${mcpPath}`);
    console.log('Restart Kimi CLI to use the tools.');
  });

// --------------------------------------------------------------------------
// uninstall
// --------------------------------------------------------------------------
program
  .command('uninstall')
  .description('Remove KimiGraph from Kimi CLI MCP config')
  .action(() => {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) {
      logError('Could not determine home directory');
      process.exit(1);
    }

    const mcpPath = path.join(home, '.kimi', 'mcp.json');
    if (!fs.existsSync(mcpPath)) {
      console.log('No MCP config found.');
      return;
    }

    let config: any;
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch {
      console.log('Could not parse MCP config.');
      return;
    }

    if (config.mcpServers?.kimigraph) {
      delete config.mcpServers.kimigraph;
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`Removed KimiGraph from ${mcpPath}`);
    } else {
      console.log('KimiGraph not found in MCP config.');
    }
  });

program.parse();
