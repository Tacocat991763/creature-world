#!/bin/bash
# Run this once on the Nest server after rsyncing the project.
# Usage: bash ~/creature-world/setup-server.sh

set -e
cd ~/creature-world

echo "==> Ensuring curl and unzip are available..."
apt-get install -y curl unzip 2>/dev/null || true

echo "==> Installing Bun..."
if command -v wget &>/dev/null; then
  wget -qO- https://bun.sh/install | bash
elif command -v curl &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
else
  npm install -g bun
fi
export PATH="$HOME/.bun/bin:$PATH"

echo "==> Installing server dependencies..."
cd server
bun install
cd ..

echo "==> Setting up Caddy proxy (tacocat.hackclub.app → localhost:8000)..."
mkdir -p ~/.config/caddy
cat > ~/.config/caddy/Caddyfile <<'CADDY'
tacocat.hackclub.app {
    reverse_proxy localhost:8000
}
CADDY

pkill -HUP caddy 2>/dev/null || true

echo ""
echo "==> Done! Now run:  bash ~/creature-world/start.sh"
echo "    Then visit:  https://tacocat.hackclub.app"
