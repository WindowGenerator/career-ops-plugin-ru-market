#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, SOURCES } from '../lib/config.mjs';
import { adapters } from '../index.mjs';
import { categoryOf } from '../lib/errors.mjs';

export async function checkHealth(ctx) {
  const config = parseConfig({ ru_market: { source: 'all', max_pages: 1 } });
  const sources = await Promise.all(SOURCES.map(async source => {
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
    console.log('Usage: node scripts/health.mjs [--career-ops /path/to/career-ops]');
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--career-ops')) throw new Error('Invalid health arguments');
  const core = resolve(args[1] ?? '../career-ops');
  // Reuse the existing guarded context; health must obey the same egress rules.
  const { buildCtx } = await import(pathToFileURL(resolve(core, 'plugins/_engine.mjs')).href);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const ctx = buildCtx({ ...manifest, optionalEnv: [] });
  const result = await checkHealth({ ...ctx, log: () => {} });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.log(JSON.stringify({ ok: false, status: 'setup-error', message: 'Provide a career-ops checkout with plugins/_engine.mjs using --career-ops' }));
    process.exitCode = 2;
  });
}
