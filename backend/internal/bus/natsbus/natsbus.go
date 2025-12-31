package natsbus

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
)

type Bus struct {
	nc *nats.Conn
}

func Connect(url string) (*Bus, error) {
	if url == "" {
		return nil, fmt.Errorf("NATS_URL is required")
	}
	nc, err := nats.Connect(url,
		nats.Name("patchwork-api"),
		nats.Timeout(5*time.Second),
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(5),
		nats.ReconnectWait(500*time.Millisecond),
	)
	if err != nil {
		return nil, err
	}
	return &Bus{nc: nc}, nil
}

func (b *Bus) Publish(ctx context.Context, subject string, data []byte) error {
	if b == nil || b.nc == nil {
		return fmt.Errorf("nats not connected")
	}
	// nats.go Publish is fast; respect ctx only for cancellation before send.
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	return b.nc.Publish(subject, data)
}

func (b *Bus) Close() {
	if b == nil || b.nc == nil {
		return
	}
	b.nc.Drain()
	b.nc.Close()
}

func (b *Bus) Conn() *nats.Conn { return b.nc }




