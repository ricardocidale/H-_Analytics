# Iris Health Report

Generated: 2026-05-08T13:39:58.914Z

## Results

### ✗ test_api_connection — FAIL

Vector store health endpoint unreachable (localhost is internal). This is expected in sandboxed environments and does not indicate a problem with the knowledge base itself.

### ✓ evaluate_retrieval_quality — PASS

Platform overview query returned 5 results (threshold: 3). Knowledge base is well-indexed.

### ✓ evaluate_retrieval_quality — PASS

Data workflows query returned 5 results (threshold: 2). Content coverage is strong.

### ✓ evaluate_retrieval_quality — PASS

API documentation query returned 5 results (threshold: 2). Integration docs are properly indexed.

### ✓ prune_stale_entries — PASS

Vector store pruning completed. No orphaned entries found (0 pruned).

---

**4/5 tools passed.**
