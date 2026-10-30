// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { shapeArabicForCanvas } from '../textures';

describe('shapeArabicForCanvas (Safari/CoreText Arabic joining)', () => {
  test('shapes all 5 jar labels into connected Presentation Forms-B and Lam-Alef ligatures', () => {
    // مرئيات -> م(init) ر(fina) ئ(init) ي(medi) ا(fina) ت(isol)
    expect(shapeArabicForCanvas('مرئيات')).toBe('\uFEE3\uFEAE\uFE8B\uFEF4\uFE8E\u062A');

    // ألعاب -> أ(isol) ل(init) ع(medi) ا(fina) ب(isol)
    expect(shapeArabicForCanvas('ألعاب')).toBe('\u0623\uFEDF\uFECC\uFE8E\u0628');

    // الكل -> ا(isol) ل(init) ك(medi) ل(fina)
    expect(shapeArabicForCanvas('الكل')).toBe('\u0627\uFEDF\uFEDC\uFEDE');

    // كتب -> ك(init) ت(medi) ب(fina)
    expect(shapeArabicForCanvas('كتب')).toBe('\uFEDB\uFE98\uFE90');

    // مقالات -> م(init) ق(medi) ا(fina) لا(isol ligature U+FEFB) ت(isol)
    expect(shapeArabicForCanvas('مقالات')).toBe('\uFEE3\uFED8\uFE8E\uFEFB\u062A');
  });

  test('handles right-joined Lam-Alef ligatures, tashkeel marks, and leaves ASCII untouched', () => {
    // كلام -> ك(init) + لا(fina ligature U+FEFC) + م(isol)
    expect(shapeArabicForCanvas('كلام')).toBe('\uFEDB\uFEFC\u0645');

    // Transparent diacritics (shadda/fatha) do not break joining between adjacent letters
    expect(shapeArabicForCanvas('مُعَمَّقَة')).toBe(
      '\uFEE3\u064F\uFECC\u064E\uFEE4\u064E\u0651\uFED8\u064E\uFE94',
    );

    expect(shapeArabicForCanvas('JAR OF LINKS')).toBe('JAR OF LINKS');
    expect(shapeArabicForCanvas('')).toBe('');
  });

  test('self-hosted arab-patched handjet-arabic.woff2 asset exists and is non-empty', () => {
    const fontPath = resolve(import.meta.dir, '../../assets/fonts/handjet-arabic.woff2');
    expect(existsSync(fontPath)).toBe(true);
    expect(statSync(fontPath).size).toBeGreaterThan(10_000);
  });
});
