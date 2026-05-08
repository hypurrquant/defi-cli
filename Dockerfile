# SSOT QA gate (docs/QA_WORKFLOW.md Section 2.1):
# all autonomous QA must build and test inside a container.
#
# Quick usage:
#   docker build -t defi-cli-qa .
#   docker run --rm defi-cli-qa                       # default: pnpm test && pnpm -r lint
#   docker run --rm defi-cli-qa pnpm build            # ad-hoc command
#   docker run --rm -v "$PWD:/src:ro" defi-cli-qa \
#       sh -c "rsync -a --exclude=node_modules --exclude=dist /src/ /work && \
#              cd /work/ts && pnpm install --frozen-lockfile && pnpm test"

# syntax=docker/dockerfile:1.7
FROM node:20-alpine

# corepack honors the "packageManager": "pnpm@9.15.0" pin in ts/package.json
# without a separate `npm install -g pnpm` step.
RUN corepack enable

WORKDIR /work

# Cache the install layer: copy only manifests + lockfile first.
COPY ts/package.json ts/pnpm-lock.yaml ts/pnpm-workspace.yaml ./ts/
COPY ts/packages/defi-core/package.json       ./ts/packages/defi-core/package.json
COPY ts/packages/defi-protocols/package.json  ./ts/packages/defi-protocols/package.json
COPY ts/packages/defi-cli/package.json        ./ts/packages/defi-cli/package.json

WORKDIR /work/ts
RUN pnpm install --frozen-lockfile

# Now copy the rest of the workspace (sources, configs, tests, docs).
WORKDIR /work
COPY ts ./ts
COPY README.md SKILL.md CLAUDE.md ./
COPY docs ./docs
COPY skills ./skills

WORKDIR /work/ts
RUN pnpm build

# Default = the SSOT QA gate.
CMD ["sh", "-c", "pnpm test && pnpm -r lint"]
