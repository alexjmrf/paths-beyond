import { describe, expect, it } from 'vitest';
import { ArgParseError, parseArgs } from '../src/cli.js';

describe('parseArgs()', () => {
  it('parses a duel command', () => {
    const result = parseArgs(['duel', 'A.json', 'B.json', '--seed', '42']);
    expect(result).toEqual({ command: 'duel', heroAFile: 'A.json', heroBFile: 'B.json', seed: 42 });
  });

  it('rejects a duel command missing --seed', () => {
    expect(() => parseArgs(['duel', 'A.json', 'B.json'])).toThrow(ArgParseError);
  });

  it('rejects a duel command missing a hero file', () => {
    expect(() => parseArgs(['duel', 'A.json', '--seed', '42'])).toThrow(ArgParseError);
  });

  it('parses a battle command without --replay', () => {
    const result = parseArgs(['battle', 'map.json']);
    expect(result).toEqual({ command: 'battle', mapFile: 'map.json', replayFile: undefined });
  });

  it('parses a battle command with --replay', () => {
    const result = parseArgs(['battle', 'map.json', '--replay', 'r.json']);
    expect(result).toEqual({ command: 'battle', mapFile: 'map.json', replayFile: 'r.json' });
  });

  it('rejects an unknown command', () => {
    expect(() => parseArgs(['nonsense'])).toThrow(ArgParseError);
  });

  it('rejects an empty argv', () => {
    expect(() => parseArgs([])).toThrow(ArgParseError);
  });

  it('ignores a leading literal "--" (pnpm run <script> -- <args> forwarding)', () => {
    const result = parseArgs(['--', 'duel', 'A.json', 'B.json', '--seed', '42']);
    expect(result).toEqual({ command: 'duel', heroAFile: 'A.json', heroBFile: 'B.json', seed: 42 });
  });
});
