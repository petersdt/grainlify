package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jagadeesh/grainlify/backend/internal/api"
	"github.com/jagadeesh/grainlify/backend/internal/bus"
	"github.com/jagadeesh/grainlify/backend/internal/bus/natsbus"
	"github.com/jagadeesh/grainlify/backend/internal/config"
	"github.com/jagadeesh/grainlify/backend/internal/db"
	"github.com/jagadeesh/grainlify/backend/internal/migrate"
	"github.com/jagadeesh/grainlify/backend/internal/syncjobs"
)

func main() {
	config.LoadDotenv()
	cfg := config.Load()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel(),
	}))
	slog.SetDefault(logger)

	var database *db.DB
	if cfg.DBURL == "" {
		if cfg.Env != "dev" {
			slog.Error("DB_URL is required in non-dev environments")
			os.Exit(1)
		}
		slog.Warn("DB_URL not set; running without database (only /health will be useful)")
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		d, err := db.Connect(ctx, cfg.DBURL)
		cancel()
		if err != nil {
			slog.Error("db connect failed", "error", err)
			os.Exit(1)
		}
		database = d
		defer database.Close()

		if cfg.AutoMigrate {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			err := migrate.Up(ctx, database.Pool)
			cancel()
			if err != nil {
				slog.Error("auto-migrate failed", "error", err)
				os.Exit(1)
			}
			slog.Info("auto-migrate complete")
		}
	}

	var eventBus bus.Bus
	if cfg.NATSURL != "" {
		b, err := natsbus.Connect(cfg.NATSURL)
		if err != nil {
			slog.Error("nats connect failed", "error", err)
			os.Exit(1)
		}
		eventBus = b
		defer eventBus.Close()
	}

	app := api.New(cfg, api.Deps{DB: database, Bus: eventBus})

	// Background workers (dev convenience). In production we run `cmd/worker` instead.
	// If NATS is configured, prefer the external worker process.
	if cfg.NATSURL == "" && database != nil && database.Pool != nil {
		worker := syncjobs.New(cfg, database.Pool)
		go func() {
			_ = worker.Run(context.Background())
		}()
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("starting http server", "addr", cfg.HTTPAddr)
		errCh <- app.Listen(cfg.HTTPAddr)
	}()

	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		slog.Info("shutdown signal received", "signal", sig.String())
	case err := <-errCh:
		// Fiber returns nil only on clean shutdown; treat any error as fatal.
		slog.Error("http server exited", "error", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := api.Shutdown(ctx, app); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}

	slog.Info("shutdown complete")
}
