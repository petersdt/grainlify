package ingest

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jagadeesh/grainlify/backend/internal/events"
)

type GitHubWebhookIngestor struct {
	Pool *pgxpool.Pool
}

func (i *GitHubWebhookIngestor) Ingest(ctx context.Context, e events.GitHubWebhookReceived) error {
	if i == nil || i.Pool == nil {
		return nil
	}

	// Parse minimal envelope for mapping to project and snapshot upserts.
	var env ghWebhookEnvelope
	_ = json.Unmarshal(e.Payload, &env)

	repoFullName := strings.TrimSpace(e.RepoFullName)
	if repoFullName == "" && env.Repository != nil {
		repoFullName = strings.TrimSpace(env.Repository.FullName)
	}
	action := strings.TrimSpace(e.Action)
	if action == "" {
		action = strings.TrimSpace(env.Action)
	}

	var projectID *string
	if repoFullName != "" {
		var pid string
		if err := i.Pool.QueryRow(ctx, `SELECT id FROM projects WHERE github_full_name = $1`, repoFullName).Scan(&pid); err == nil {
			projectID = &pid
		}
	}

	// Auditable event record (idempotent via delivery_id primary key).
	if e.DeliveryID != "" {
		_, _ = i.Pool.Exec(ctx, `
INSERT INTO github_events (delivery_id, project_id, repo_full_name, event, action, payload)
VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)
ON CONFLICT (delivery_id) DO NOTHING
`, e.DeliveryID, projectID, repoFullName, e.Event, nullIfEmpty(action), string(e.Payload))
	}

	// Snapshot upserts (idempotent).
	if projectID != nil {
		if e.Event == "issues" && env.Issue != nil {
			issue := env.Issue
			_, _ = i.Pool.Exec(ctx, `
INSERT INTO github_issues (project_id, github_issue_id, number, state, title, body, author_login, url, created_at_github, updated_at_github, closed_at_github, last_seen_at)
VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
ON CONFLICT (project_id, github_issue_id) DO UPDATE SET
  number = EXCLUDED.number,
  state = EXCLUDED.state,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  author_login = EXCLUDED.author_login,
  url = EXCLUDED.url,
  created_at_github = EXCLUDED.created_at_github,
  updated_at_github = EXCLUDED.updated_at_github,
  closed_at_github = EXCLUDED.closed_at_github,
  last_seen_at = now()
`, *projectID, issue.ID, issue.Number, issue.State, issue.Title, issue.Body, issue.User.Login, issue.HTMLURL, issue.CreatedAt, issue.UpdatedAt, issue.ClosedAt)
		}

		if (e.Event == "pull_request" || e.Event == "pull_request_review") && env.PullRequest != nil {
			pr := env.PullRequest
			_, _ = i.Pool.Exec(ctx, `
INSERT INTO github_pull_requests (project_id, github_pr_id, number, state, title, body, author_login, url, merged, merged_at_github, created_at_github, updated_at_github, closed_at_github, last_seen_at)
VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
ON CONFLICT (project_id, github_pr_id) DO UPDATE SET
  number = EXCLUDED.number,
  state = EXCLUDED.state,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  author_login = EXCLUDED.author_login,
  url = EXCLUDED.url,
  merged = EXCLUDED.merged,
  merged_at_github = EXCLUDED.merged_at_github,
  created_at_github = EXCLUDED.created_at_github,
  updated_at_github = EXCLUDED.updated_at_github,
  closed_at_github = EXCLUDED.closed_at_github,
  last_seen_at = now()
`, *projectID, pr.ID, pr.Number, pr.State, pr.Title, pr.Body, pr.User.Login, pr.HTMLURL, pr.Merged, pr.MergedAt, pr.CreatedAt, pr.UpdatedAt, pr.ClosedAt)
		}
	}

	// Enqueue follow-up sync jobs (best-effort).
	if projectID != nil && (e.Event == "issues" || e.Event == "pull_request" || e.Event == "push") {
		_, _ = i.Pool.Exec(ctx, `
INSERT INTO sync_jobs (project_id, job_type, status, run_at)
VALUES ($1::uuid, 'sync_issues', 'pending', now()),
       ($1::uuid, 'sync_prs', 'pending', now())
`, *projectID)
	}

	return nil
}

type ghWebhookEnvelope struct {
	Action      string               `json:"action"`
	Repository  *ghRepoPayload       `json:"repository"`
	Issue       *ghIssuePayload      `json:"issue"`
	PullRequest *ghPullRequestPayload `json:"pull_request"`
}

type ghRepoPayload struct {
	FullName string `json:"full_name"`
}

type ghUserPayload struct {
	Login string `json:"login"`
}

type ghIssuePayload struct {
	ID        int64         `json:"id"`
	Number    int           `json:"number"`
	State     string        `json:"state"`
	Title     string        `json:"title"`
	Body      string        `json:"body"`
	HTMLURL   string        `json:"html_url"`
	User      ghUserPayload `json:"user"`
	CreatedAt *time.Time    `json:"created_at"`
	UpdatedAt *time.Time    `json:"updated_at"`
	ClosedAt  *time.Time    `json:"closed_at"`
}

type ghPullRequestPayload struct {
	ID        int64         `json:"id"`
	Number    int           `json:"number"`
	State     string        `json:"state"`
	Title     string        `json:"title"`
	Body      string        `json:"body"`
	HTMLURL   string        `json:"html_url"`
	User      ghUserPayload `json:"user"`
	Merged    bool          `json:"merged"`
	MergedAt  *time.Time    `json:"merged_at"`
	CreatedAt *time.Time    `json:"created_at"`
	UpdatedAt *time.Time    `json:"updated_at"`
	ClosedAt  *time.Time    `json:"closed_at"`
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}




