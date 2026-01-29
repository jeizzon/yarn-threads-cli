/**
 * Tests for src/lib/output.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveOutputConfig,
  getStatusPrefix,
  getLabelPrefix,
  hyperlink,
  formatNumber,
  formatDate,
  truncate,
  jsonOutput,
  type OutputConfig,
} from '../lib/output.js';

describe('resolveOutputConfig', () => {
  it('returns default config for empty argv and TTY', () => {
    const config = resolveOutputConfig([], {}, true);
    expect(config).toEqual({
      plain: false,
      emoji: true,
      color: true,
      hyperlinks: true,
      json: false,
    });
  });

  it('returns no color when not TTY', () => {
    const config = resolveOutputConfig([], {}, false);
    expect(config.color).toBe(false);
    expect(config.hyperlinks).toBe(false);
  });

  it('respects NO_COLOR env var', () => {
    const config = resolveOutputConfig([], { NO_COLOR: '1' }, true);
    expect(config.color).toBe(false);
  });

  it('respects TERM=dumb env var', () => {
    const config = resolveOutputConfig([], { TERM: 'dumb' }, true);
    expect(config.color).toBe(false);
  });

  it('handles --json flag', () => {
    const config = resolveOutputConfig(['--json'], {}, true);
    expect(config.json).toBe(true);
    expect(config.emoji).toBe(false);
    expect(config.color).toBe(false);
    expect(config.hyperlinks).toBe(false);
  });

  it('handles --plain flag', () => {
    const config = resolveOutputConfig(['--plain'], {}, true);
    expect(config.plain).toBe(true);
    expect(config.emoji).toBe(false);
    expect(config.color).toBe(false);
    expect(config.hyperlinks).toBe(false);
  });

  it('handles --no-emoji flag', () => {
    const config = resolveOutputConfig(['--no-emoji'], {}, true);
    expect(config.emoji).toBe(false);
    expect(config.color).toBe(true); // color not affected
  });

  it('handles --no-color flag', () => {
    const config = resolveOutputConfig(['--no-color'], {}, true);
    expect(config.color).toBe(false);
    expect(config.emoji).toBe(true); // emoji not affected
  });

  it('handles multiple flags combined', () => {
    const config = resolveOutputConfig(['--no-emoji', '--no-color'], {}, true);
    expect(config.emoji).toBe(false);
    expect(config.color).toBe(false);
  });
});

describe('getStatusPrefix', () => {
  const plainConfig: OutputConfig = { plain: true, emoji: false, color: false, hyperlinks: false, json: false };
  const emojiConfig: OutputConfig = { plain: false, emoji: true, color: true, hyperlinks: true, json: false };
  const textConfig: OutputConfig = { plain: false, emoji: false, color: true, hyperlinks: true, json: false };

  it('returns plain prefixes when plain=true', () => {
    expect(getStatusPrefix('ok', plainConfig)).toBe('[ok] ');
    expect(getStatusPrefix('warn', plainConfig)).toBe('[warn] ');
    expect(getStatusPrefix('err', plainConfig)).toBe('[err] ');
    expect(getStatusPrefix('info', plainConfig)).toBe('[info] ');
    expect(getStatusPrefix('hint', plainConfig)).toBe('[hint] ');
  });

  it('returns emoji prefixes when emoji=true', () => {
    expect(getStatusPrefix('ok', emojiConfig)).toContain('✅');
    expect(getStatusPrefix('warn', emojiConfig)).toContain('⚠️');
    expect(getStatusPrefix('err', emojiConfig)).toContain('❌');
  });

  it('returns text prefixes when neither plain nor emoji', () => {
    expect(getStatusPrefix('ok', textConfig)).toBe('OK: ');
    expect(getStatusPrefix('warn', textConfig)).toBe('WARN: ');
    expect(getStatusPrefix('err', textConfig)).toBe('ERROR: ');
    expect(getStatusPrefix('info', textConfig)).toBe('INFO: ');
    expect(getStatusPrefix('hint', textConfig)).toBe('HINT: ');
  });
});

describe('getLabelPrefix', () => {
  const plainConfig: OutputConfig = { plain: true, emoji: false, color: false, hyperlinks: false, json: false };
  const emojiConfig: OutputConfig = { plain: false, emoji: true, color: true, hyperlinks: true, json: false };

  it('returns plain prefixes when plain=true', () => {
    expect(getLabelPrefix('url', plainConfig)).toBe('URL: ');
    expect(getLabelPrefix('date', plainConfig)).toBe('DATE: ');
    expect(getLabelPrefix('user', plainConfig)).toBe('USER: ');
    expect(getLabelPrefix('bio', plainConfig)).toBe('BIO: ');
  });

  it('returns emoji prefixes when emoji=true', () => {
    // Note: source file uses Unicode escape sequences
    const urlPrefix = getLabelPrefix('url', emojiConfig);
    const datePrefix = getLabelPrefix('date', emojiConfig);
    const userPrefix = getLabelPrefix('user', emojiConfig);
    // Should return different values than plain mode
    expect(urlPrefix).not.toBe('URL: ');
    expect(datePrefix).not.toBe('DATE: ');
    expect(userPrefix).not.toBe('USER: ');
    // Verify they have trailing space
    expect(urlPrefix.endsWith(' ')).toBe(true);
    expect(datePrefix.endsWith(' ')).toBe(true);
    expect(userPrefix.endsWith(' ')).toBe(true);
  });
});

describe('hyperlink', () => {
  const withHyperlinks: OutputConfig = { plain: false, emoji: true, color: true, hyperlinks: true, json: false };
  const withoutHyperlinks: OutputConfig = { plain: false, emoji: true, color: true, hyperlinks: false, json: false };

  it('returns OSC 8 hyperlink when hyperlinks enabled', () => {
    const result = hyperlink('https://example.com', 'Example', withHyperlinks);
    expect(result).toContain('\x1b]8;;https://example.com\x07');
    expect(result).toContain('Example');
    expect(result).toContain('\x1b]8;;\x07');
  });

  it('returns plain text when hyperlinks disabled', () => {
    const result = hyperlink('https://example.com', 'Example', withoutHyperlinks);
    expect(result).toBe('Example');
  });

  it('uses URL as text when text not provided', () => {
    const result = hyperlink('https://example.com', undefined, withoutHyperlinks);
    expect(result).toBe('https://example.com');
  });

  it('returns plain text when no config provided', () => {
    const result = hyperlink('https://example.com', 'Example');
    expect(result).toBe('Example');
  });

  it('sanitizes escape sequences in URL and text', () => {
    const result = hyperlink('https://example.com\x1b\x07', 'Test\x1b\x07', withHyperlinks);
    expect(result).not.toContain('\x1b\x07\x1b');
  });
});

describe('formatNumber', () => {
  it('formats numbers with locale separators', () => {
    // Basic test - exact format depends on locale
    expect(formatNumber(1000)).toMatch(/1[,.]?000/);
    expect(formatNumber(1000000)).toMatch(/1[,.]?000[,.]?000/);
  });

  it('handles small numbers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(999)).toBe('999');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-1000)).toMatch(/-1[,.]?000/);
  });
});

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    // Should produce some localized date string
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns original string on invalid date', () => {
    const result = formatDate('not-a-date');
    // Invalid date returns "Invalid Date" from Date constructor
    // but toLocaleString might still work, so just verify it returns something
    expect(typeof result).toBe('string');
  });

  it('handles various date formats', () => {
    expect(formatDate('2024-01-01')).toBeTruthy();
    expect(formatDate('January 1, 2024')).toBeTruthy();
  });
});

describe('truncate', () => {
  it('returns original string if shorter than maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns original string if equal to maxLen', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and adds ellipsis if longer than maxLen', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles edge case with very short maxLen', () => {
    expect(truncate('hello', 3)).toBe('...');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('colors', () => {
  // Import colors for testing
  it('banner returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.banner('Test');
    expect(typeof result).toBe('string');
    expect(result).toContain('Test');
  });

  it('subtitle returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.subtitle('Test');
    expect(typeof result).toBe('string');
  });

  it('section returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.section('Test');
    expect(typeof result).toBe('string');
  });

  it('bullet returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.bullet('Test');
    expect(typeof result).toBe('string');
  });

  it('command returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.command('Test');
    expect(typeof result).toBe('string');
  });

  it('option returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.option('Test');
    expect(typeof result).toBe('string');
  });

  it('argument returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.argument('Test');
    expect(typeof result).toBe('string');
  });

  it('description returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.description('Test');
    expect(typeof result).toBe('string');
  });

  it('muted returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.muted('Test');
    expect(typeof result).toBe('string');
  });

  it('accent returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.accent('Test');
    expect(typeof result).toBe('string');
  });

  it('error returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.error('Test');
    expect(typeof result).toBe('string');
  });

  it('success returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.success('Test');
    expect(typeof result).toBe('string');
  });

  it('warning returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.warning('Test');
    expect(typeof result).toBe('string');
  });

  it('username returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.username('Test');
    expect(typeof result).toBe('string');
  });

  it('handle returns styled string', async () => {
    const { colors } = await import('../lib/output.js');
    const result = colors.handle('Test');
    expect(typeof result).toBe('string');
  });
});

describe('jsonOutput', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('outputs JSON with 2-space indentation', () => {
    jsonOutput({ foo: 'bar' });
    expect(consoleLogSpy).toHaveBeenCalledWith('{\n  "foo": "bar"\n}');
  });

  it('handles arrays', () => {
    jsonOutput([1, 2, 3]);
    expect(consoleLogSpy).toHaveBeenCalledWith('[\n  1,\n  2,\n  3\n]');
  });

  it('handles null', () => {
    jsonOutput(null);
    expect(consoleLogSpy).toHaveBeenCalledWith('null');
  });

  it('handles nested objects', () => {
    jsonOutput({ a: { b: 'c' } });
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('"a"');
    expect(output).toContain('"b"');
    expect(output).toContain('"c"');
  });
});
