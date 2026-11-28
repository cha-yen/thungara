#!/usr/bin/env bash
# Thungara - Cross-Platform Automated Test Runner (macOS / Linux / WSL)
# Detects Node.js or Python runtime and executes the unified test suite.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ANSI Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================================${NC}"
echo -e "${CYAN}  กำลังรันชุดทดสอบระบบค้นหา Thungara Search Engine${NC}"
echo -e "${CYAN}========================================================${NC}"
echo ""

if command -v node >/dev/null 2>&1; then
  echo -e "${GREEN}[INFO] Detected Node.js ($(node -v)). Running Unified Node.js Runner...${NC}\n"
  node "$DIR/run_all.js"
  EXIT_CODE=$?
elif command -v python3 >/dev/null 2>&1; then
  echo -e "${YELLOW}[INFO] Node.js not found. Detected Python 3 ($(python3 --version)). Running Python Test Suite...${NC}\n"
  python3 "$DIR/test_full_system.py"
  EXIT_CODE=$?
elif command -v python >/dev/null 2>&1; then
  echo -e "${YELLOW}[INFO] Node.js not found. Detected Python ($(python --version)). Running Python Test Suite...${NC}\n"
  python "$DIR/test_full_system.py"
  EXIT_CODE=$?
else
  echo -e "${RED}[ERROR] Neither Node.js nor Python was found on PATH.${NC}"
  echo -e "Please install Node.js (>= 18) or Python (>= 3.8) to run tests."
  exit 1
fi

echo ""
echo -e "${CYAN}========================================================${NC}"
exit $EXIT_CODE
