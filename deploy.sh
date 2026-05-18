#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — Deploy Laxy ADK pipeline to Firebase
# ---------------------------------------------------------------------------
# Usage:
#   ./deploy.sh              # Deploy everything (functions + hosting + storage)
#   ./deploy.sh functions    # Deploy only Cloud Functions
#   ./deploy.sh hosting      # Deploy only frontend hosting
#   ./deploy.sh storage      # Deploy only storage rules
#   ./deploy.sh setup        # First-time GCP/Firebase setup
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-laxy-studio-dev}"
REGION="${GCP_REGION:-us-central1}"
SA="${PROJECT_ID}@appspot.gserviceaccount.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "functions/.venv/bin/python" ]]; then
    PYTHON_BIN="$(pwd)/functions/.venv/bin/python"
  elif [[ -x "functions/venv/bin/python" ]]; then
    PYTHON_BIN="$(pwd)/functions/venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    err "Python is required but neither 'python3' nor 'python' is available."
    exit 1
  fi
fi

# ── First-time setup ──

setup() {
  log "Enabling required APIs..."
  gcloud services enable \
    aiplatform.googleapis.com \
    cloudfunctions.googleapis.com \
    cloudbuild.googleapis.com \
    firestore.googleapis.com \
    --project="$PROJECT_ID"

  log "Granting Vertex AI access to service account..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA" \
    --role="roles/aiplatform.user" \
    --quiet

  log "Granting Firestore access..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA" \
    --role="roles/datastore.user" \
    --quiet

  log "Setup complete. Run './deploy.sh' to deploy."
}

# ── Deploy functions ──

deploy_functions() {
  log "Running backend tests..."
  pushd functions > /dev/null
  "$PYTHON_BIN" -m pytest tests/ -v --tb=short
  popd > /dev/null

  log "Deploying Cloud Functions to $PROJECT_ID ($REGION)..."
  firebase deploy --only functions --project="$PROJECT_ID"
}

# ── Deploy hosting ──

deploy_hosting() {
  log "Running frontend tests..."
  pushd laxy-studio > /dev/null
  npm run test
  popd > /dev/null

  log "Building frontend..."
  pushd laxy-studio > /dev/null
  npm run build
  popd > /dev/null

  log "Deploying hosting to $PROJECT_ID..."
  firebase deploy --only hosting --project="$PROJECT_ID"
}

# ── Main ──

# ── Deploy storage rules ──

deploy_storage() {
  log "Deploying storage rules to $PROJECT_ID..."
  firebase deploy --only storage --project="$PROJECT_ID"
}

# ── Main ──

case "${1:-all}" in
  setup)
    setup
    ;;
  functions)
    deploy_functions
    ;;
  hosting)
    deploy_hosting
    ;;
  storage)
    deploy_storage
    ;;
  all)
    deploy_functions
    deploy_hosting
    deploy_storage
    log "Full deployment complete."
    ;;
  *)
    err "Unknown target: $1"
    echo "Usage: $0 {setup|functions|hosting|storage|all}"
    exit 1
    ;;
esac
