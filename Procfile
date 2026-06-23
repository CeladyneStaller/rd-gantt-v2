# ONE web worker, on purpose. The per-bin lock that serializes writes lives in
# process memory, so the guarantee only holds with a single writer process.
# Do NOT raise --workers and do NOT enable horizontal autoscaling for this
# service: multiple processes each get their own lock and the JSONBin race
# (stale whole-document PUT clobbering a concurrent writer) comes back.
web: uvicorn broker:app --host 0.0.0.0 --port $PORT --workers 1
