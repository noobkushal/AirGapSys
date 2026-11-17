#!/usr/bin/env bash
# Independent check of host isolation. Prints facts; exit 0 = no outbound reachability found, 1 = reachable.
# It does not rely on this project's code for the network probe.
set -u
fail=0
echo "== default route =="
if command -v ip >/dev/null; then r=$(ip route show default 2>/dev/null); [ -n "$r" ] && { echo "PRESENT: $r"; fail=1; } || echo "none"; else echo "ip not available"; fi
echo "== established non-loopback sockets =="
if command -v ss >/dev/null; then s=$(ss -Htn state established 2>/dev/null | grep -Ev '127\.0\.0\.1|\[::1\]' || true); [ -n "$s" ] && { echo "$s"; fail=1; } || echo "none"; else echo "ss not available"; fi
echo "== active connection attempts (3 s timeout each) =="
for t in 1.1.1.1:443 8.8.8.8:53 9.9.9.9:443; do
  if timeout 3 bash -c "exec 3<>/dev/tcp/${t%:*}/${t#*:}" 2>/dev/null; then echo "REACHABLE: $t"; fail=1; else echo "unreachable: $t"; fi
done
echo "== Clarix self-report =="
python3 -m clarix --check 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('guard:',d['guard'],'| posture:',d['posture']['status'],'| ollama:',d['ollama'])" || echo "(could not run clarix --check)"
[ "$fail" = 0 ] && echo "RESULT: no outbound reachability found" || echo "RESULT: host CAN reach other networks: it is not air-gapped"
exit $fail
