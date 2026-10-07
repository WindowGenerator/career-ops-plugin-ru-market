#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig } from '../lib/config.mjs';
import { adapters } from '../index.mjs';
import { categoryOf } from '../lib/errors.mjs';

export async function checkHealth(ctx, { source = 'all' } = {}) {
  const config = parseConfig({ ru_market: { source, max_pages: 1, sources: source === 'getmatch' ? { getmatch: { enabled: true } } : {} } });
  const sources = await Promise.all(config.selected.map(async source => {
    try {
      // Exactly one listing request per source, with no retries or detail fetches.
      const jobs = await adapters[source](config.sources[source], ctx, { retries: 0 });
      return { source, status: jobs.length ? 'reachable' : 'empty', count: jobs.length };
    } catch (error) { return { source, status: categoryOf(error) }; }
  }));
  return { ok: sources.every(s => ['reachable', 'empty'].includes(s.status)), sources };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/health.mjs [--career-ops /path/to/career-ops] [--source all|getmatch]');
    console.log('Separate browser preflight (from career-ops): node scripts/ru-market/scan-hh.mjs --preflight --channel chrome; use --version for tool identity.');
    return;
  }
  let corePath = '../career-ops';
  let source = 'all';
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1]) throw new Error('Missing health option value');
    if (args[i] === '--career-ops') corePath = args[i + 1];
    else if (args[i] === '--source' && ['all', 'getmatch'].includes(args[i + 1])) source = args[i + 1];
    else throw new Error('Invalid health arguments');
  }
  const core = resolve(corePath);
  // Reuse the existing guarded context; health must obey the same egress rules.
  const { buildCtx } = await import(pathToFileURL(resolve(core, 'plugins/_engine.mjs')).href);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const ctx = buildCtx(manifest);
  const result = await checkHealth({ ...ctx, log: () => {} }, { source });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.log(JSON.stringify({ ok: false, status: 'setup-error', message: 'Provide a career-ops checkout with plugins/_engine.mjs using --career-ops' }));
    process.exitCode = 2;
  });
}
