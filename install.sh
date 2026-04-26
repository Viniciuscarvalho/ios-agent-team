#!/bin/bash
# install.sh — Install iOS Agent Team into your project
# Usage:
#   ./install.sh [target-project-path]
#   bash <(curl -s https://raw.githubusercontent.com/viniciuscarvalho/ios-agent-team/main/install.sh)

set -e

# If run via curl (no local repo), clone to temp dir first
if [ ! -f "$(dirname "$0")/.claude/agents/ios-lead.md" ] && [ ! -f ".claude/agents/ios-lead.md" ]; then
    TMPDIR=$(mktemp -d)
    echo "Downloading iOS Agent Team..."
    git clone --depth 1 https://github.com/viniciuscarvalho/ios-agent-team.git "$TMPDIR/ios-agent-team" 2>/dev/null
    SCRIPT_DIR="$TMPDIR/ios-agent-team"
    TARGET="${1:-.}"
    CLEANUP="$TMPDIR"
else
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    TARGET="${1:-.}"
    CLEANUP=""
fi

echo "Installing iOS Agent Team into: $TARGET"

# Create directories
mkdir -p "$TARGET/.claude/agents"
mkdir -p "$TARGET/.claude/skills"

# Copy agents
echo "  Copying agents..."
cp "$SCRIPT_DIR/.claude/agents/"*.md "$TARGET/.claude/agents/"

# Copy skills (if present in this repo)
if [ -d "$SCRIPT_DIR/.claude/skills" ] && [ "$(ls -A "$SCRIPT_DIR/.claude/skills" 2>/dev/null)" ]; then
    echo "  Copying skills..."
    cp -r "$SCRIPT_DIR/.claude/skills/"* "$TARGET/.claude/skills/"
fi

# Append CLAUDE.md snippet
if [ -f "$TARGET/CLAUDE.md" ]; then
    echo ""
    echo "  Found existing CLAUDE.md. Append the iOS Agent Team section? (y/N)"
    read -r REPLY
    if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        echo "" >> "$TARGET/CLAUDE.md"
        cat "$SCRIPT_DIR/CLAUDE.md.snippet" >> "$TARGET/CLAUDE.md"
        echo "  Appended to CLAUDE.md"
    else
        echo "  Skipped. You can manually append CLAUDE.md.snippet later."
    fi
else
    cp "$SCRIPT_DIR/CLAUDE.md.snippet" "$TARGET/CLAUDE.md"
    echo "  Created CLAUDE.md (customize the project conventions section)"
fi

# Clean up temp clone if needed
if [ -n "$CLEANUP" ]; then
    rm -rf "$CLEANUP"
fi

echo ""
echo "Done! iOS Agent Team installed."
echo ""
echo "Next steps:"
echo "  1. Edit CLAUDE.md to set your deployment target, Swift version, and conventions"
echo "  2. Add your skill content to .claude/skills/ (see .claude/skills/README.md)"
echo "  3. Start Claude Code and try: 'Build a settings view with toggle switches'"
echo ""
echo "Optional — enable agent teams for parallel work:"
echo '  Add to .claude/settings.json (project) or ~/.claude/settings.json (global):'
echo '  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }'
echo ""
echo "Recommended — enable subagent context forking so ios-lead's exploration"
echo "carries into each specialist (cheaper, less re-reading):"
echo '  Add to .claude/settings.json:'
echo '  { "env": { "CLAUDE_CODE_FORK_SUBAGENT": "1" } }'
echo '  See README "Subagent context forking" for details.'
