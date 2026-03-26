#!/bin/sh
set -e

SELF="solpbc/vit"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

echo "installing vit from source ($SELF)..."

if ! command_exists git; then
  echo "error: git is required. install git and try again."
  exit 1
fi

if ! command_exists bun; then
  echo "bun not found, installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

DIR_NAME=$(echo "$SELF" | sed 's|.*/||')
if [ -d "$DIR_NAME" ]; then
  echo "$DIR_NAME/ already exists, skipping clone"
else
  if command_exists gh; then
    gh repo clone "$SELF" "$DIR_NAME"
  else
    git clone "https://github.com/$SELF.git" "$DIR_NAME"
  fi
fi

cd "$DIR_NAME"

bun install
node bin/vit.js link

echo ""
echo "vit installed from source"
echo "run: cd $DIR_NAME"
