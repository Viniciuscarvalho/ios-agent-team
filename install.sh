#!/bin/bash
# install.sh — Install or update iOS Agent Team
# Usage: ./install.sh [--provider claude|codex|gemini|all] [--update] [target-project-path]

set -e

PROVIDER="claude"
UPDATE=false
TARGET="."

while [ "$#" -gt 0 ]; do
    case "$1" in
        --provider) PROVIDER="$2"; shift 2 ;;
        --update) UPDATE=true; shift ;;
        -h|--help)
            echo "Usage: $0 [--provider claude|codex|gemini|all] [--update] [target-project-path]"
            exit 0
            ;;
        *) TARGET="$1"; shift ;;
    esac
done

# If run via curl (no local repo), clone to temp dir first
if [ ! -f "$(dirname "$0")/.claude/agents/ios-lead.md" ] && [ ! -f ".claude/agents/ios-lead.md" ]; then
    TEMP_DIR=$(mktemp -d)
    echo "Downloading iOS Agent Team..."
    git clone --depth 1 https://github.com/viniciuscarvalho/ios-agent-team.git "$TEMP_DIR/ios-agent-team" 2>/dev/null
    SCRIPT_DIR="$TEMP_DIR/ios-agent-team"
    CLEANUP="$TEMP_DIR"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    CLEANUP=""
fi

case "$PROVIDER" in
    claude|codex|gemini|all) ;;
    *) echo "Unknown provider: $PROVIDER" >&2; exit 1 ;;
esac

install_claude() {
    mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/skills"
    cp "$SCRIPT_DIR/.claude/agents/"*.md "$TARGET/.claude/agents/"
    cp -R "$SCRIPT_DIR/.claude/skills/." "$TARGET/.claude/skills/"
    if [ ! -f "$TARGET/CLAUDE.md" ]; then
        cp "$SCRIPT_DIR/CLAUDE.md.snippet" "$TARGET/CLAUDE.md"
    fi
}

install_codex() {
    mkdir -p "$TARGET/.agents"
    cp -R "$SCRIPT_DIR/.codex" "$TARGET/"
    cp -R "$SCRIPT_DIR/.agents/." "$TARGET/.agents/"
    if [ ! -f "$TARGET/AGENTS.md" ]; then
        cp "$SCRIPT_DIR/AGENTS.md" "$TARGET/AGENTS.md"
    fi
}

install_gemini() {
    if ! command -v gemini >/dev/null 2>&1; then
        echo "Gemini CLI is required for the Gemini adapter." >&2
        return 1
    fi
    if [ "$UPDATE" = true ]; then
        gemini extensions update ios-agent-team
    else
        gemini extensions install --consent "$SCRIPT_DIR"
    fi
}

echo "Installing $PROVIDER adapter into: $TARGET"
case "$PROVIDER" in
    claude) install_claude ;;
    codex) install_codex ;;
    gemini) install_gemini ;;
    all) install_claude; install_codex; install_gemini ;;
esac

# Clean up temp clone if needed
if [ -n "$CLEANUP" ]; then
    rm -rf "$CLEANUP"
fi

echo ""
echo "Done. Re-run with --update after pulling a newer release."
