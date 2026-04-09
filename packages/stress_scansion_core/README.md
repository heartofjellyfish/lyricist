# stress_scansion_core

Shared stress-scansion primitives for this workspace.

This package owns the reusable pieces that both the main lyric project and the `sentence_to_stress_pattern` project can consume:

- text normalization and tokenization
- stress token extraction from CMU phonemes
- stress-pattern parsing and compatibility helpers
- the shared stress lexicon
- sentence-to-stress scanning

The goal is to keep stress/scansion rules in one place instead of hiding them inside app-specific modules.
