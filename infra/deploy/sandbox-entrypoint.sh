#!/bin/sh
# Entrypoint of the `sandbox` service: stock dind entrypoint plus an egress filter for branch containers.
# Agent code in branch containers has internet egress (NAT via sandbox-egress); this blocks private/link-local/loopback
# destinations (the backend, the VM host, cloud metadata 169.254.169.254). If the rules cannot be installed we exit
# non-zero instead of running unfiltered.
set -eu

dockerd-entrypoint.sh "$@" &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null || true' TERM INT

i=0
until DOCKER_HOST=tcp://localhost:2376 DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH=/certs/client docker version >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 120 ] || ! kill -0 "$pid" 2>/dev/null; then echo "sandbox-entrypoint: inner dockerd did not come up" >&2; kill -TERM "$pid" 2>/dev/null || true; exit 1; fi
  sleep 1
done

setup() {
  iptables -N DOCKER-USER 2>/dev/null || true
  iptables -F DOCKER-USER
  iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
  for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8; do
    iptables -A DOCKER-USER -d "$net" -j DROP
  done
  iptables -A DOCKER-USER -j RETURN
}
if ! setup; then
  echo "sandbox-entrypoint: could not install the DOCKER-USER egress filter" >&2
  kill -TERM "$pid" 2>/dev/null || true
  exit 1
fi

# wait returns early on a trapped signal; wait again for the real exit code.
rc=0
wait "$pid" || rc=$?
if kill -0 "$pid" 2>/dev/null; then wait "$pid" || rc=$?; fi
exit "$rc"
