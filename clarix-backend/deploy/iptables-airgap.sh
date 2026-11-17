#!/usr/bin/env bash
# Legacy iptables equivalent of nftables-airgap.conf. UNTESTED in the build environment.
# Needs root. Run from a console session: it cuts remote access. Undo with: iptables -F && iptables -P OUTPUT ACCEPT && iptables -P INPUT ACCEPT
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
iptables  -P INPUT DROP; iptables  -P OUTPUT DROP; iptables  -P FORWARD DROP
iptables  -A INPUT  -i lo -j ACCEPT;  iptables  -A OUTPUT -o lo -j ACCEPT
iptables  -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables  -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -P INPUT DROP; ip6tables -P OUTPUT DROP; ip6tables -P FORWARD DROP
ip6tables -A INPUT  -i lo -j ACCEPT;  ip6tables -A OUTPUT -o lo -j ACCEPT
echo "air-gap egress lockdown applied (loopback only)"
