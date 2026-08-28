# A1 Visual Gate Audit

The visual spec now asserts `geometryPass` and `visualDiff.pass`. Before Batch 1 it only wrote those values to `layout-metrics.json`, so a 5% visual failure could exit successfully. The current comparison uses pixel delta 24 and a 5% overall threshold; the mask is explicitly empty.
