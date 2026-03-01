import {
  isValidTag,
  parseTag,
  formatTag,
  getTagGroup,
  getTagsByGroup,
  validateTags,
} from '../../src/utils/tagValidation';

describe('Tag Validation Utilities', () => {
  describe('isValidTag', () => {
    it.each([
      'my-tag',
      'location:room-3',
      '\u30AB\u30C6\u30B4\u30EA:\u30D5\u30A3\u30AE\u30E5\u30A2',
      'simple',
      'a-b-c',
      'group:tag',
    ])('should accept valid tag: %s', (tag) => {
      expect(isValidTag(tag)).toBe(true);
    });

    it.each([
      'has space',
      'special!char',
      ':no-group',
      'trailing:',
      '',
      'a::b',
      'group:',
    ])('should reject invalid tag: "%s"', (tag) => {
      expect(isValidTag(tag)).toBe(false);
    });
  });

  describe('parseTag', () => {
    it('should parse grouped tag', () => {
      expect(parseTag('location:room-3')).toEqual({ group: 'location', value: 'room-3' });
    });

    it('should parse simple tag', () => {
      expect(parseTag('mytag')).toEqual({ value: 'mytag' });
    });

    it('should split only on first colon', () => {
      expect(parseTag('a:b:c')).toEqual({ group: 'a', value: 'b:c' });
    });
  });

  describe('formatTag', () => {
    it('should format grouped tag', () => {
      expect(formatTag('location', 'room-3')).toBe('location:room-3');
    });

    it('should format simple tag', () => {
      expect(formatTag(undefined, 'simple')).toBe('simple');
    });
  });

  describe('getTagGroup', () => {
    it('should return group for grouped tag', () => {
      expect(getTagGroup('location:room-3')).toBe('location');
    });

    it('should return undefined for simple tag', () => {
      expect(getTagGroup('simple')).toBeUndefined();
    });
  });

  describe('getTagsByGroup', () => {
    it('should filter tags by group', () => {
      const tags = ['location:room-1', 'location:room-2', 'other:x'];
      expect(getTagsByGroup(tags, 'location')).toEqual(['location:room-1', 'location:room-2']);
    });
  });

  describe('validateTags', () => {
    it('should separate valid and invalid tags', () => {
      const result = validateTags(['good-tag', 'bad tag', 'location:room-1']);
      expect(result).toEqual({
        valid: ['good-tag', 'location:room-1'],
        invalid: ['bad tag'],
      });
    });
  });
});
