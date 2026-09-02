# ADR-0001: AI協業の役割分担をChatGPT=画像生成専任、Claude Code=ゲームデザイン+実装へ変更

Status: Accepted
Date: 2026-09-02

## Context

プロジェクト開始時の役割分担(2026年7月のブレインストーミングで確定し、
`CLAUDE.md`の初版に反映されたもの)は次の通りだった。

- ChatGPT: ゲームデザイン、仕様策定、Issue定義、アート方向性、レビュー依頼書
- Claude Code: 実装、リファクタリング、コードレビュー、技術助言(ゲームデザインの変更禁止)

このため、frozen_case/hot_caseの新カテゴリ追加や`categoryArea`⇔什器拡張額の
変換式決定など、実装中に発生したゲームデザイン判断がChatGPT側の判断待ちで
たびたび滞留していた(`HANDOFF.md`参照)。

## Decision

ユーザーの明示的指示により、役割分担を次へ変更する。

- ChatGPT: 画像・アート生成のみ(キャラクター、什器、商品アート)
- Claude Code: ゲームデザイン、仕様策定、Issue定義、実装、リファクタリング、
  コードレビュー、技術助言

「ゲームデザインを変更しない」という制約は外すが、新メカニクス・新コンテンツ
カテゴリ・バランス数値など基盤的な設計判断は、決定前にユーザーへ確認する
(`CLAUDE.md`のResponsibilities参照)。ユーザーが最終決定者である点は変わらない。

## Consequences

- `CLAUDE.md`のRole・Responsibilities・AI Collaboration節を更新した
  (PR #65)
- 以後、ゲームデザイン判断(什器の新カテゴリ、バランス数値の初期値提案など)は
  Claude Codeが直接行い、必要に応じてユーザーへ確認する運用になる
- ChatGPT側で既に作成されていたゲームデザイン資料(2026年7月のブレスト内容)は
  今後Claude Code側で参照・更新する。散逸を防ぐため、本ADRと同時に
  `design/PRINCIPLES.md`(中核的な設計思想)を新設した
