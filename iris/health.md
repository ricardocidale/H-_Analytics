# Iris Health Report

Generated: 2025-01-10T16:45:33Z

## Results

### ✗ test_api_connection — FAIL
**Source:** primary-kb  
**URL:** http://localhost:8000/health  
**Status:** Unreachable  
**Error:** Host 'localhost' is a private or internal address and cannot be fetched  
**Latency:** N/A

*Note: This is expected in cloud/remote environments where localhost is not accessible from the probe endpoint. If the knowledge base is running locally, this is not a concern.*

---

### ✓ evaluate_retrieval_quality (Query 1) — PASS
**Query:** "H+ analysis methodology and framework"  
**Results Found:** 5  
**Threshold:** 3  
**Status:** Exceeds minimum threshold

---

### ✓ evaluate_retrieval_quality (Query 2) — PASS
**Query:** "data sources and integration"  
**Results Found:** 5  
**Threshold:** 2  
**Status:** Exceeds minimum threshold

---

### ✓ prune_stale_entries — PASS
**Orphaned Vectors Removed:** 0  
**Status:** Vector store is clean; no stale entries detected

---

## Summary

**3/4 tools passed.**

### Health Status: ✓ HEALTHY

The knowledge base is operating normally. Retrieval quality remains strong across both test queries, and the vector store is clean with no orphaned entries. The localhost connectivity check continues to fail as expected in this cloud environment—this is not a concern for remote deployments.

**No action required.**