#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function registryEntry(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Expected an exact 40-hex commit SHA');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  return {
    id: manifest.id, name: `career-ops-plugin-${manifest.id}`, version: manifest.version,
    license: 'MIT', description: manifest.description, repo: manifest.homepage, sha,
    hooks: manifest.hooks, requiredEnv: manifest.requiredEnv, allowedHosts: manifest.allowedHosts,
    addedAt: new Date().toISOString().slice(0, 10),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(registryEntry(process.argv[2]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
