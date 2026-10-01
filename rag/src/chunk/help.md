# RAG: нарезать чанки

Рекурсивная нарезка по заголовкам и абзацам. Семантическая стратегия использует тот же контракт.

## Входы

blocks, docId; статические strategy, maxTokens, overlapTokens, hardMaxTokens.

## Выходы

chunks, lengthHistogram, emptyShare, forcedCutShare, chunkCount.
