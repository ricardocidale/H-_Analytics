/**
 * Unit tests for `safeImageSrc` — the XSS guard around <img src> in the
 * slide-factory photo-override surface.
 *
 * Origin: CodeQL alert #94 (js/xss-through-dom). An admin pasting
 * `javascript:alert(1)` into the photo-override field of
 * `AgentsOverridePanel` would have executed script when the preview <img>
 * rendered. `safeImageSrc` filters the URL down to http/https/blob/relative
 * before it reaches the DOM.
 */
import { describe, it, expect } from 'vitest';
import { safeImageSrc } from '../features/slide-factory/SlideFactoryUtils';

describe('safeImageSrc', () => {
  it('allows https URLs', () => {
    expect(safeImageSrc('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
  });

  it('allows http URLs', () => {
    expect(safeImageSrc('http://example.com/photo.jpg')).toBe('http://example.com/photo.jpg');
  });

  it('allows blob: URLs (used by File-API previews)', () => {
    expect(safeImageSrc('blob:https://example.com/abc-123')).toBe('blob:https://example.com/abc-123');
  });

  it('allows relative URLs (resolve against origin at render time)', () => {
    expect(safeImageSrc('/uploads/photo.jpg')).toBe('/uploads/photo.jpg');
    expect(safeImageSrc('photo.jpg')).toBe('photo.jpg');
    expect(safeImageSrc('../images/photo.jpg')).toBe('../images/photo.jpg');
  });

  it('blocks javascript: URLs (primary XSS vector)', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBe('');
    expect(safeImageSrc('JavaScript:alert(1)')).toBe('');
    expect(safeImageSrc('  javascript:alert(1)  ')).toBe('');
  });

  it('blocks data: URLs (can carry text/html with embedded script)', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('');
  });

  it('blocks vbscript: URLs', () => {
    expect(safeImageSrc('vbscript:msgbox(1)')).toBe('');
  });

  it('blocks file: URLs', () => {
    expect(safeImageSrc('file:///etc/passwd')).toBe('');
  });

  it('blocks chrome: / chrome-extension: / about: schemes', () => {
    expect(safeImageSrc('chrome://settings')).toBe('');
    expect(safeImageSrc('chrome-extension://abc/img.png')).toBe('');
    expect(safeImageSrc('about:blank')).toBe('');
  });

  it('returns "" for null / undefined / empty / whitespace', () => {
    expect(safeImageSrc(null)).toBe('');
    expect(safeImageSrc(undefined)).toBe('');
    expect(safeImageSrc('')).toBe('');
    expect(safeImageSrc('   ')).toBe('');
  });

  it('returns "" for unparseable URLs that look like a protocol', () => {
    expect(safeImageSrc('https://[invalid')).toBe('');
    expect(safeImageSrc('http://')).toBe('');
  });
});
