#!/usr/bin/env bash
set -euo pipefail

npm install
(cd frontend && npm install)
npm run build
