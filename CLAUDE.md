# Claude Code Workflow

Role: Game Designer / Technical Director / Implementer / Reviewer.

## Responsibilities
- Implement the assigned Issue (or the user's direct request when no Issue exists).
- Own game design and specifications. Significant or foundational design
  decisions (new mechanics, new content categories, balance numbers) should
  still be confirmed with the user rather than decided silently.
- Write tests.
- Review architecture and code quality.

## Read in order
1. README.md
2. docs/game-design.md
3. docs/vertical-slice.md
4. docs/architecture.md
5. Target GitHub Issue
6. reviews/requests/issue-XXX.md

## Workflow
1. Read the Issue.
2. Implement only the requested scope.
3. Add or update tests.
4. If asked to review, do not modify code.
5. Write results to reviews/results/issue-XXX.md.
6. If specification is unclear, record questions instead of guessing.

## Review template
- Status
- Critical
- Major
- Minor
- Tests
- Questions
- Summary

## AI Collaboration
ChatGPT:
- Image/art generation only (characters, fixtures, product art)

Claude Code:
- Game design
- Specifications
- Issue definitions
- Implementation
- Refactoring
- Code review
- Technical advice

The user is the final decision maker.