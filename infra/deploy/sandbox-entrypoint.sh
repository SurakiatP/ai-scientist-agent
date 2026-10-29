#!/bin/sh
# Entrypoint of the `sandbox` service: stock dind entrypoint plus an egress filter for branch containers.
# Agent code in branch containers has internet egress (NAT via sandbox-egress); this blocks private/link-local/loopback
# destinations (the backend, the VM host, cloud metadata 169.254.169.254). Fails closed: if the rules cannot be installed
# or verified we exit non-zero instead of running unfiltered. The compose environment sets DOCKER_IPTABLES_LEGACY=""
# so dockerd uses the same (nft) backend as the `iptables` called here and in the healthcheck.
set -eu

fill() {
  iptables -N DOCKER-USER 2>/dev/null || true
  iptables -F DOCKER-USER || return 1
  iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT || return 1
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8; do
    iptables -A DOCKER-USER -d "$net" -j DROP || return 1
  done
  iptables -A DOCKER-USER -j RETURN || return 1
}
verify() {
  iptables -C FORWARD -j DOCKER-USER || return 1
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8; do
    iptables -C DOCKER-USER -d "$net" -j DROP || return 1
  done
}

# Fill the chain before dockerd starts (on a restart it leaves an existing DOCKER-USER chain alone), verify after.
fill || { echo "sandbox-entrypoint: could not install the DOCKER-USER egress filter" >&2; exit 1; }

dockerd-entrypoint.sh "$@" &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null || true' TERM INT

i=0
until DOCKER_HOST=tcp://localhost:2376 DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH=/certs/client docker version >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 120 ] || ! kill -0 "$pid" 2>/dev/null; then echo "sandbox-entrypoint: inner dockerd did not come up" >&2; kill -TERM "$pid" 2>/dev/null || true; exit 1; fi
  sleep 1
done

if ! verify; then
  echo "sandbox-entrypoint: egress filter missing after dockerd start (iptables backend mismatch?)" >&2
  kill -TERM "$pid" 2>/dev/null || true
  exit 1
fi

# wait returns early on a trapped signal; wait again for dockerd's real exit code.
rc=0
wait "$pid" || rc=$?
rc=0
wait "$pid" || rc=$?
exit "$rc"
