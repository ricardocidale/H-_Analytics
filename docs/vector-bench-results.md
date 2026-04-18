# Vector Store Benchmark Results

Append-only log of `script/vector-bench.ts` runs. Each run records
single-namespace and 7-namespace fan-out top-K query latency over the
`vector_chunks` (pgvector + HNSW) table at the seeded sizes. Synthetic
random vectors are used, so this measures index latency, not recall.

Compare new runs against the most recent entry of comparable size to spot
regressions from HNSW parameter changes (`m`, `ef_construction`,
`ef_search`) or schema/index changes.

## How to run

```bash
# Default: seeds 10k then 100k synthetic chunks, 50 queries per size, top-K=8.
npx tsx script/vector-bench.ts

# Smaller smoke run
npx tsx script/vector-bench.ts --sizes 1000,10000 --queries 20

# Keep the seeded rows (useful when debugging the index)
npx tsx script/vector-bench.ts --keep
```

The script seeds rows in the `knowledge-base` namespace under the id prefix
`bench:vector-bench:` and removes them on exit unless `--keep` is passed.

The scheduled CI job in `.github/workflows/vector-bench.yml` runs this
script weekly against an ephemeral pgvector postgres service container,
appends the run block here, and uploads the JSON summary as an artifact.
The job fails when any seeded size's p95 (single- or multi-namespace)
exceeds the configured `--threshold-p95-ms`.

## Runs

## 2026-04-18T10:58:59.498Z

- Runner: Node v20.20.0, Postgres
- Queries per size: 20, top-K: 8
- Sizes: 1000, 5000

| seeded | total rows | top-K | queries | single p50 (ms) | single p95 (ms) | single mean (ms) | multi p50 (ms) | multi p95 (ms) | multi mean (ms) |
| -----: | ---------: | ----: | ------: | --------------: | --------------: | ---------------: | -------------: | -------------: | --------------: |
| 1,000 | 1,000 | 8 | 20 | 4.8 | 5.4 | 4.7 | 187 | 253 | 145 |
| 5,000 | 5,000 | 8 | 20 | 4.8 | 5.4 | 4.6 | 190 | 255 | 146 |

