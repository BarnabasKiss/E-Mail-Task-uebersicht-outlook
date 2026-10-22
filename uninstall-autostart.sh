#!/usr/bin/env bash
# Linux: entfernt den systemd-Benutzerdienst der Mail-App.
set -euo pipefail
systemctl --user disable --now mail-app.service || true
rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/mail-app.service"
systemctl --user daemon-reload
echo "Autostart entfernt."
