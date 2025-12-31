package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Env      string
	HTTPAddr string
	Log      string

	DBURL string
	AutoMigrate bool

	JWTSecret string

	NATSURL string

	GitHubOAuthClientID     string
	GitHubOAuthClientSecret string
	GitHubOAuthRedirectURL  string
	GitHubOAuthSuccessRedirectURL string
	GitHubLoginRedirectURL string
	GitHubLoginSuccessRedirectURL string

	// Used to validate GitHub webhook signatures (X-Hub-Signature-256).
	GitHubWebhookSecret string

	// Public base URL of this backend, used when registering GitHub webhooks.
	PublicBaseURL string

	// Used to encrypt stored OAuth access tokens at rest. Must be 32 bytes base64 (AES-256-GCM key).
	TokenEncKeyB64 string

	// Dev/admin convenience: allow promoting a logged-in user to admin via a shared token.
	AdminBootstrapToken string

	// Didit KYC verification
	DiditAPIKey    string
	DiditWorkflowID string
	DiditWebhookSecret string
}

func Load() Config {
	env := getEnv("APP_ENV", "dev")
	logLevel := getEnv("LOG_LEVEL", "info")

	// Prefer HTTP_ADDR if provided, otherwise build it from PORT.
	httpAddr := os.Getenv("HTTP_ADDR")
	if strings.TrimSpace(httpAddr) == "" {
		port := getEnv("PORT", "8080")
		httpAddr = ":" + port
	}

	return Config{
		Env:      env,
		HTTPAddr: httpAddr,
		Log:      logLevel,

		DBURL: getEnv("DB_URL", ""),
		AutoMigrate: getEnvBool("AUTO_MIGRATE", false),

		JWTSecret: getEnv("JWT_SECRET", ""),

		NATSURL: getEnv("NATS_URL", ""),

		GitHubOAuthClientID:     getEnv("GITHUB_OAUTH_CLIENT_ID", ""),
		GitHubOAuthClientSecret: getEnv("GITHUB_OAUTH_CLIENT_SECRET", ""),
		GitHubOAuthRedirectURL:  getEnv("GITHUB_OAUTH_REDIRECT_URL", ""),
		GitHubOAuthSuccessRedirectURL: getEnv("GITHUB_OAUTH_SUCCESS_REDIRECT_URL", ""),
		GitHubLoginRedirectURL: getEnv("GITHUB_LOGIN_REDIRECT_URL", ""),
		GitHubLoginSuccessRedirectURL: getEnv("GITHUB_LOGIN_SUCCESS_REDIRECT_URL", ""),

		GitHubWebhookSecret: getEnv("GITHUB_WEBHOOK_SECRET", ""),

		PublicBaseURL: getEnv("PUBLIC_BASE_URL", ""),

		TokenEncKeyB64: getEnv("TOKEN_ENC_KEY_B64", ""),

		AdminBootstrapToken: getEnv("ADMIN_BOOTSTRAP_TOKEN", ""),

		DiditAPIKey:        getEnv("DIDIT_API_KEY", ""),
		DiditWorkflowID:    getEnv("DIDIT_WORKFLOW_ID", ""),
		DiditWebhookSecret: getEnv("DIDIT_WEBHOOK_SECRET", ""),
	}
}

func (c Config) LogLevel() slog.Leveler {
	switch strings.ToLower(strings.TrimSpace(c.Log)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	case "info", "":
		return slog.LevelInfo
	default:
		// Allow numeric levels for easy tweaking (-4 debug, 0 info, 4 warn, 8 error).
		if n, err := strconv.Atoi(c.Log); err == nil {
			return slog.Level(n)
		}
		return slog.LevelInfo
	}
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func getEnvBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	switch v {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return fallback
	}
}


