const TAG_PATTERN = /^[\p{L}\p{N}-]+(:[\p{L}\p{N}-]+)?$/u;

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag);
}

export function parseTag(tag: string): { group?: string; value: string } {
  const idx = tag.indexOf(':');
  if (idx === -1) {
    return { value: tag };
  }
  return { group: tag.slice(0, idx), value: tag.slice(idx + 1) };
}

export function formatTag(group: string | undefined, value: string): string {
  return group ? `${group}:${value}` : value;
}

export function getTagGroup(tag: string): string | undefined {
  const idx = tag.indexOf(':');
  return idx === -1 ? undefined : tag.slice(0, idx);
}

export function getTagsByGroup(tags: string[], group: string): string[] {
  return tags.filter((t) => getTagGroup(t) === group);
}

export function validateTags(tags: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const tag of tags) {
    (isValidTag(tag) ? valid : invalid).push(tag);
  }
  return { valid, invalid };
}
