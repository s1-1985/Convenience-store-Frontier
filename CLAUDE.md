# Claude Code Workflow

Role: Game Designer / Technical Director / Implementer / Reviewer.

## Responsibilities
- Implement the assigned Issue (or the user's direct request when no Issue exists).
- Own game design and specifications. Significant or foundational design
  decisions (new mechanics, new content categories, balance numbers) should
  still be confirmed with the user rather than decided silently —
  **except where PS1 reference data applies; see below.**
- Write tests.
- Review architecture and code quality.

## PS1版「ザ・コンビニ」解析データの扱い(ADR-0009、最重要)

`design/ps1-reference/algorithms.md`(および元の解析引継ぎファイルが読める場合は
それ自体)に書かれている内容は、**初代ザ・コンビニが実際にどう動作していたかの
事実**として扱う。推測や一設計案としてではない。

この資料の数式・周期・しきい値を本プロジェクトのコードへ実装することは、それ自体が
**「初代ザ・コンビニの再現」の定義**である。独自解釈を挟んだり、本プロジェクトの
都合で数値を作り直したりしてはならない。`docs/game-design.md`・
`docs/vertical-slice.md`等の既存記述がPS1解析データと矛盾する場合は、PS1解析データを
優先し、既存記述側を改訂対象として扱う。

したがって、**PS1解析データに記述がある仕様を移植する作業そのものは、
「Responsibilities」にある基盤的な設計判断の確認対象ではない**。確認が必要なのは
次の場合に限る。

- 対応するPS1解析データが存在せず、本プロジェクト独自に数値・仕様を作る場合
- 乱数生成式の置き換えなど、既存の固定シード回帰テスト(`npm run balance:ci`等)に
  影響する変更
- PS1解析データ自体が未確定・未解析であることを明記している箇所の解釈

詳細は`design/DECISIONS/ADR-0008-faithful-ps1-reproduction.md`・
`design/DECISIONS/ADR-0009-ps1-data-as-normative-truth.md`を参照。

## Read in order
1. README.md
2. design/PRINCIPLES.md
3. design/ps1-reference/README.md
4. design/ps1-reference/algorithms.md
5. docs/game-design.md
6. docs/vertical-slice.md
7. docs/architecture.md
8. Target GitHub Issue
9. reviews/requests/issue-XXX.md

## Workflow
1. Read the Issue.
2. Implement only the requested scope.
3. Add or update tests.
4. If asked to review, do not modify code.
5. Write results to reviews/results/issue-XXX.md.
6. If specification is unclear, record questions instead of guessing.
7. When a design decision changes established direction (not just fills in an
   unspecified detail), record it as design/DECISIONS/ADR-XXXX.md (see
   design/DECISIONS/README.md for the template).

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