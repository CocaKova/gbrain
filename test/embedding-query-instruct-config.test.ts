/**
 * #5543 — `embedding_query_instruct` config plumbing.
 *
 * The gateway reads this key through loadConfig() → buildGatewayConfig()
 * (file/env plane), and the EMPTY string is a meaningful value ("send
 * queries raw"). These tests pin the three places that could silently
 * turn '' back into "unset": the env fold in loadConfig(), the gateway
 * config builder, and the `config set` routing tables.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWN_CONFIG_KEYS, loadConfig } from '../src/core/config.ts';
import { buildGatewayConfig } from '../src/core/ai/build-gateway-config.ts';
import { FILE_PLANE_API_KEYS, FILE_PLANE_STRING_KEYS } from '../src/commands/config.ts';

let home = '';
const savedHome = process.env.GBRAIN_HOME;
const savedEnv = process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT;

function writeConfig(extra: Record<string, unknown>): void {
  mkdirSync(join(home, '.gbrain'), { recursive: true });
  writeFileSync(
    join(home, '.gbrain', 'config.json'),
    JSON.stringify({
      engine: 'pglite',
      database_path: join(home, '.gbrain', 'brain.pglite'),
      embedding_model: 'llama-server:qwen3-embedding-0.6b',
      embedding_dimensions: 1024,
      ...extra,
    }),
  );
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'gbrain-qi-'));
  process.env.GBRAIN_HOME = home;
  delete process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.GBRAIN_HOME;
  else process.env.GBRAIN_HOME = savedHome;
  if (savedEnv === undefined) delete process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT;
  else process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT = savedEnv;
  rmSync(home, { recursive: true, force: true });
});

describe('#5543: embedding_query_instruct config plumbing', () => {
  test('is a known key and routes to the file plane (not the DB plane, not a redacted credential)', () => {
    expect(KNOWN_CONFIG_KEYS).toContain('embedding_query_instruct');
    expect(FILE_PLANE_STRING_KEYS).toContain('embedding_query_instruct');
    expect(FILE_PLANE_API_KEYS).not.toContain('embedding_query_instruct');
  });

  test('unset in file and env → undefined (gateway applies the family default)', () => {
    writeConfig({});
    const cfg = loadConfig();
    expect(cfg?.embedding_query_instruct).toBeUndefined();
    expect(buildGatewayConfig(cfg!).embedding_query_instruct).toBeUndefined();
  });

  test('file-plane task line reaches the gateway config verbatim', () => {
    writeConfig({ embedding_query_instruct: 'Retrieve the note that answers the question' });
    const cfg = loadConfig();
    expect(buildGatewayConfig(cfg!).embedding_query_instruct).toBe('Retrieve the note that answers the question');
  });

  test('file-plane empty string survives as "" (disable), not undefined', () => {
    writeConfig({ embedding_query_instruct: '' });
    const cfg = loadConfig();
    expect(cfg?.embedding_query_instruct).toBe('');
    expect(buildGatewayConfig(cfg!).embedding_query_instruct).toBe('');
  });

  test('GBRAIN_EMBEDDING_QUERY_INSTRUCT overrides the file, and an exported "" disables', () => {
    writeConfig({ embedding_query_instruct: 'from the file' });
    process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT = 'from the env';
    expect(loadConfig()?.embedding_query_instruct).toBe('from the env');

    process.env.GBRAIN_EMBEDDING_QUERY_INSTRUCT = '';
    expect(loadConfig()?.embedding_query_instruct).toBe('');
  });
});
