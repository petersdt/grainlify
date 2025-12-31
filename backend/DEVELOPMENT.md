# Development Guide

## Running the Backend Server

### Option 1: Auto-reload with Air (Recommended for Development)

The server will automatically restart when you make changes to any `.go` file.

```bash
# Using the run script (handles PATH automatically)
./run-dev.sh

# Or directly with air
air

# Or using make
make dev
```

### Option 2: Standard Go Run (No Auto-reload)

```bash
go run ./cmd/api

# Or using make
make run
```

## Installing Air

If `air` is not found, install it:

```bash
go install github.com/air-verse/air@latest
```

Make sure `~/go/bin` is in your PATH. Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
export PATH=$PATH:$HOME/go/bin
```

## Configuration

Air configuration is in `.air.toml`. It watches for changes in:
- All `.go` files
- Excludes `tmp/`, `vendor/`, `testdata/`, `migrations/`, `.git/`
- Excludes `*_test.go` files

## Build Commands

```bash
# Build binary
make build
# or
go build -o ./api ./cmd/api

# Run migrations
go run ./cmd/migrate

# Run worker
go run ./cmd/worker
```
