#!/usr/bin/env node
// Sign in as one Coffer member and store the credentials the MCP server uses.
// Writes .env.mcp.local (git-ignored, chmod 600).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.env.mcp.local');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(OUT);

const url = process.env.COFFER_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.COFFER_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL or publishable key. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local first.');
  process.exit(1);
}

function askHidden(query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  const defaultEmail = process.env.COFFER_EMAIL || '';
  const email = (await rl.question(`Coffer email${defaultEmail ? ` [${defaultEmail}]` : ''}: `)).trim() || defaultEmail;
  if (!email) throw new Error('An email is required.');
  const password = await askHidden('Coffer password: ');
  if (!password) throw new Error('A password is required.');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  const { error: joinError } = await supabase.rpc('join_bomb_site');
  if (joinError) throw new Error(`Signed in, but could not open the Coffer workspace: ${joinError.message}`);

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('member_id, display_name')
    .single();
  if (memberError || !member) throw new Error(memberError?.message || 'No member record found.');

  const content = [
    '# Coffer MCP credentials. Created by `bun run mcp:login`. Never commit this file.',
    `COFFER_SUPABASE_URL=${url}`,
    `COFFER_SUPABASE_ANON_KEY=${key}`,
    `COFFER_EMAIL=${email}`,
    `COFFER_PASSWORD=${password}`,
    '',
  ].join('\n');

  fs.writeFileSync(OUT, content, { mode: 0o600 });
  fs.chmodSync(OUT, 0o600);

  console.log(`\nSigned in as ${member.display_name} (${member.member_id}) for ${data.user?.email || email}.`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}.`);
  console.log('\nAdd the server to OpenCode from this project:');
  console.log(`  opencode mcp add coffer -- node ${path.join(ROOT, 'mcp/server.mjs')}`);
  console.log('Then run /mcps to confirm it is connected.');
} catch (error) {
  console.error(`\nLogin failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
