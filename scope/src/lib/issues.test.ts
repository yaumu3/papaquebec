import { describe, expect, it } from 'bun:test';

import { describeIssues } from './issues';

describe('describeIssues', () => {
  it('gives each issue its path, three of them, then how many more', () => {
    // Arrange
    const issues = [
      { path: ['features', 3, 'properties', 'layer'], message: 'unknown layer' },
      { path: [], message: 'not an object' },
      { path: ['title'], message: 'missing' },
      { path: ['note'], message: 'too long' },
      { path: ['id'], message: 'bad' },
    ];

    // Act
    const described = describeIssues(issues);

    // Assert
    expect(described).toBe(
      'features[3].properties.layer: unknown layer; not an object; title: missing; and 2 more',
    );
  });
});
