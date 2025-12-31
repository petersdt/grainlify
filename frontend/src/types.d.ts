interface Window {
  ethereum?: any
}

type Project = {
  id: string
  github_full_name: string
  status: string
  github_repo_id?: number | null
  verified_at?: string | null
  verification_error?: string | null
  webhook_id?: number | null
  webhook_url?: string | null
  webhook_created_at?: string | null
  created_at?: string
  updated_at?: string
  ecosystem_name?: string | null
  language?: string | null
  tags?: string[]
  category?: string | null
}




