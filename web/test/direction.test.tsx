import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DirectionProvider } from '../src/components/DirectionProvider';
import { Text } from '../src/components/Text';

afterEach(cleanup);

describe('DirectionProvider', () => {
  it('sets the document to rtl and lang=ar for the Arabic interface', () => {
    render(<DirectionProvider locale="ar"><span>x</span></DirectionProvider>);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('sets the document to ltr and lang=en for the English interface', () => {
    render(<DirectionProvider locale="en"><span>x</span></DirectionProvider>);
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('Text', () => {
  it('marks user-generated content dir=auto so it lays out by its own script', () => {
    const { getByText } = render(<Text>ليلى حداد</Text>);
    expect(getByText('ليلى حداد').getAttribute('dir')).toBe('auto');
  });

  it('keeps dir=auto for Latin content too, rather than assuming', () => {
    const { getByText } = render(<Text>Dana Haddad</Text>);
    expect(getByText('Dana Haddad').getAttribute('dir')).toBe('auto');
  });
});
