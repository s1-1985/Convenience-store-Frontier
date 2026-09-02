# Architecture / Design Decision Records

このディレクトリには、後から見て「なぜ今の設計になったか」が分かるよう、
仕様変更を伴う設計判断をADR(Architecture Decision Record)として記録する。

新しいADRは`ADR-XXXX-短い説明.md`という連番ファイル名で追加する。既存のADRは
上書きせず、方針を変える場合は新しいADRを追加して古いものを`Status: Superseded
by ADR-XXXX`として残す。

## テンプレート

```markdown
# ADR-XXXX: タイトル

Status: Proposed | Accepted | Superseded by ADR-XXXX
Date: YYYY-MM-DD

## Context

なぜこの判断が必要になったか。

## Decision

何を決めたか。

## Consequences

この決定によって何が変わるか、何を諦めるか。
```
