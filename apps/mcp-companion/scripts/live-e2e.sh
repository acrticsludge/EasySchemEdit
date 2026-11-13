#!/usr/bin/env bash
# Full live end-to-end verification of the mcp-companion listener on 127.0.0.1:43127.
# Starts the server, exercises the real wire (security pipeline + pairing + destructive two-phase
# + export), then shuts it down. Everything happens in one process tree so nothing is orphaned.
set -uo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${TMPDIR:-/tmp}/easyschem-listener-live.log"
EXPORT_DIR="${TMPDIR:-/tmp}/easyschem-exports"
BASE="http://127.0.0.1:43127"
PASS=0; FAIL=0

check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1 (expected '$2', got '$3')"; fi; }
status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

rm -f "$LOG"; rm -rf "$EXPORT_DIR"
# The bash/MSYS path and Node's Windows path resolve differently (`/tmp` → `C:\tmp` in Node, but
# `C:/Users/.../AppData/Local/Temp` in bash). Hand the listener the Windows-native form so the
# canonical root it computes is the same directory the assertions look at.
mkdir -p "$EXPORT_DIR"
EXPORT_DIR_CANON="$(cd "$EXPORT_DIR" && pwd -W 2>/dev/null || echo "$EXPORT_DIR")"

cd "$APP" || exit 1
EASYSCHEM_ORIGINS="http://localhost:5173" EASYSCHEM_EXPORT_DIRS="$EXPORT_DIR_CANON" \
  node --experimental-strip-types src/listener.ts > "$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

# Wait for the port to accept connections (max ~20s).
for _ in $(seq 1 40); do
  [ "$(status_of "$BASE/healthz")" = "200" ] && break
  sleep 0.5
done

if [ "$(status_of "$BASE/healthz")" != "200" ]; then
  echo "SERVER DID NOT START"; cat "$LOG"; exit 1
fi
echo "server up (pid $SERVER_PID)"
echo

echo "=== 1. liveness / readiness (no credential) ==="
check "/healthz -> 200" 200 "$(status_of "$BASE/healthz")"
check "/readyz -> 503 (no bridge connected yet)" 503 "$(status_of "$BASE/readyz")"

echo "=== 2. DNS-rebinding defence (F-2.2) ==="
check "Host: evil.com -> 403" 403 "$(status_of -H 'Host: evil.com' "$BASE/healthz")"
check "Host: localhost:43127 -> 200" 200 "$(status_of -H 'Host: localhost:43127' "$BASE/healthz")"
check "Host: localhost.evil.com -> 403" 403 "$(status_of -H 'Host: localhost.evil.com' "$BASE/healthz")"

echo "=== 3. CORS preflight + Chrome PNA (F-2.1, F-2.3) ==="
PRE=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE/mcp" \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Private-Network: true')
check "allowlisted preflight -> 204" 204 "$(printf '%s' "$PRE" | head -1 | awk '{print $2}')"
printf '%s' "$PRE" | grep -qi 'access-control-allow-private-network: *true' \
  && { PASS=$((PASS+1)); echo "PASS  Access-Control-Allow-Private-Network: true"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  PNA header missing"; }
printf '%s' "$PRE" | grep -qi 'access-control-allow-origin: http://localhost:5173' \
  && { PASS=$((PASS+1)); echo "PASS  exact origin echoed (no wildcard)"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  origin not echoed exactly"; }
check "foreign-origin preflight -> 403" 403 "$(status_of -X OPTIONS "$BASE/mcp" \
  -H 'Origin: http://evil.com' -H 'Access-Control-Request-Method: POST')"

echo "=== 4. auth required ==="
check "/metrics unauthenticated -> 401" 401 "$(status_of "$BASE/metrics")"
check "/mcp unauthenticated -> 401" 401 "$(status_of -X POST "$BASE/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"tool":"fill_selection","projectId":"default","expectedRevision":0}')"

TOKEN=$(grep -o 'pairing token[^:]*: *[0-9a-f]\{64\}' "$LOG" | tail -1 | awk '{print $NF}')
if [ -z "${TOKEN:-}" ]; then echo "FAIL  no pairing token in listener output"; cat "$LOG"; exit 1; fi
echo "pairing token captured (64 hex chars)"

echo "=== 5. pair -> session id ==="
PAIR=$(curl -s -X GET "$BASE/metrics" -H "Authorization: Bearer $TOKEN")
SID=$(printf '%s' "$PAIR" | sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p')
if [ -n "$SID" ]; then PASS=$((PASS+1)); echo "PASS  pairing returned a session id"; else FAIL=$((FAIL+1)); echo "FAIL  no session id: $PAIR"; fi
AUTH="Authorization: Session $SID"
check "spent pairing token cannot be reused -> 403" 403 "$(status_of "$BASE/metrics" -H "Authorization: Bearer $TOKEN")"
check "session authenticates /metrics -> 200" 200 "$(status_of "$BASE/metrics" -H "$AUTH")"

echo "=== 6. destructive two-phase over the wire (SPEC-F §6) ==="
DRY=$(curl -s -X POST "$BASE/mcp" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"tool":"delete_selection","projectId":"default","expectedRevision":0,"args":{"selectionId":"s1"}}')
CT=$(printf '%s' "$DRY" | sed -n 's/.*"confirmationToken":"\([^"]*\)".*/\1/p')
RID=$(printf '%s' "$DRY" | sed -n 's/.*"requestId":"\([^"]*\)".*/\1/p')
printf '%s' "$DRY" | grep -q '"requiresConfirmation":true' \
  && { PASS=$((PASS+1)); echo "PASS  dry-run flags confirmation required"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  dry-run did not flag confirmation: $DRY"; }
[ -n "$CT" ] && { PASS=$((PASS+1)); echo "PASS  dry-run minted a confirmation token"; } \
             || { FAIL=$((FAIL+1)); echo "FAIL  no confirmation token"; }

APPLY=$(curl -s -X POST "$BASE/mcp" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"tool\":\"delete_selection\",\"projectId\":\"default\",\"expectedRevision\":0,\"args\":{\"selectionId\":\"s1\"},\"requestId\":\"$RID\",\"confirmationToken\":\"$CT\"}")
printf '%s' "$APPLY" | grep -q '"applied":true' \
  && { PASS=$((PASS+1)); echo "PASS  apply with the token succeeded"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  apply failed: $APPLY"; }
printf '%s' "$APPLY" | grep -q '"revision":1' \
  && { PASS=$((PASS+1)); echo "PASS  revision incremented to 1"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  revision not incremented: $APPLY"; }

REUSE=$(curl -s -X POST "$BASE/mcp" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"tool\":\"delete_selection\",\"projectId\":\"default\",\"expectedRevision\":0,\"args\":{\"selectionId\":\"s1\"},\"requestId\":\"$RID\",\"confirmationToken\":\"$CT\"}")
printf '%s' "$REUSE" | grep -q '"applied":true' \
  && { PASS=$((PASS+1)); echo "PASS  duplicate requestId replayed the original result (F10)"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  duplicate requestId was not replayed: $REUSE"; }

echo "=== 7. stale revision is refused with the current revision ==="
STALE=$(curl -s -w '\n%{http_code}' -X POST "$BASE/mcp" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"tool":"fill_selection","projectId":"default","expectedRevision":99,"args":{}}')
check "stale revision -> 409" 409 "$(printf '%s' "$STALE" | tail -1)"
printf '%s' "$STALE" | grep -q '"code":"STALE_REVISION"' \
  && { PASS=$((PASS+1)); echo "PASS  wire code STALE_REVISION"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  wrong code"; }

echo "=== 8. export writes through f-8 into the approved root (§7) ==="
B64=$(printf 'schematic-payload' | base64 | tr -d '\n')
EXP=$(curl -s -X POST "$BASE/export" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"default\",\"relativePath\":\"builds/out.vxproj\",\"format\":\".vxproj\",\"bytesBase64\":\"$B64\"}")
printf '%s' "$EXP" | grep -q '"artifactHandle"' \
  && { PASS=$((PASS+1)); echo "PASS  export returned an artifact handle"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  export failed: $EXP"; }
[ -f "$EXPORT_DIR_CANON/builds/out.vxproj" ] \
  && { PASS=$((PASS+1)); echo "PASS  file exists on disk inside the approved root"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  file not written: $EXPORT_DIR_CANON/builds/out.vxproj (listing: $(ls -R "$EXPORT_DIR_CANON" 2>&1 | head -5))"; }
[ -f "$EXPORT_DIR_CANON/builds/out.vxproj" ] && \
  [ "$(cat "$EXPORT_DIR_CANON/builds/out.vxproj")" = "schematic-payload" ] \
  && { PASS=$((PASS+1)); echo "PASS  written bytes match the payload"; } \
  || { FAIL=$((FAIL+1)); echo "FAIL  bytes mismatch"; }

echo "=== 9. traversal refused over the wire ==="
check "relativePath ../escape -> 403" 403 "$(status_of -X POST "$BASE/export" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"default\",\"relativePath\":\"../escape.vxproj\",\"format\":\".vxproj\",\"bytesBase64\":\"$B64\"}")"

echo "=== 10. unknown tool / route ==="
check "unknown tool -> 400" 400 "$(status_of -X POST "$BASE/mcp" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"tool":"not_a_tool","projectId":"default","expectedRevision":1,"args":{}}')"
check "unknown route -> 404" 404 "$(status_of "$BASE/nope" -H "$AUTH")"

echo
echo "=== SUMMARY ==="
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1