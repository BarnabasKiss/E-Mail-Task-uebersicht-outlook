#!/usr/bin/env bash
# Linux: richtet einen systemd-Benutzerdienst ein, der die Mail-App beim Anmelden startet.
# Entfernen: ./uninstall-autostart.sh
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
node_bin="$(command -v node)"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$unit_dir"
cat > "$unit_dir/mail-app.service" <<UNIT
[Unit]
Description=Mail-App (lokaler Server)

[Service]
WorkingDirectory=$dir
ExecStart=$node_bin server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now mail-app.service
echo "Autostart eingerichtet: $unit_dir/mail-app.service"
echo "Log: journalctl --user -u mail-app -f"
