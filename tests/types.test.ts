import { describe, it, expect } from 'vitest';
import { toolCategory } from '../src/shared/types';

describe('toolCategory', () => {
  it('maps edit tools to code', () => expect(toolCategory('Edit')).toBe('code'));
  it('maps Bash to terminal', () => expect(toolCategory('Bash')).toBe('terminal'));
  it('maps WebFetch to browser', () => expect(toolCategory('WebFetch')).toBe('browser'));
  it('maps unknown tools to other', () => expect(toolCategory('Read')).toBe('other'));
  it('maps undefined to other', () => expect(toolCategory(undefined)).toBe('other'));
});
