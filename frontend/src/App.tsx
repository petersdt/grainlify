import { useEffect, useState } from 'react'
import './App.css'

type GitHubStatusResponse =
  | { linked: false }
  | { linked: true; github: { id: number; login: string } }

// Project type moved to types.d.ts

type SyncJob = {
  id: string
  job_type: string
  status: string
  run_at: string
  attempts: number
  last_error?: string | null
  created_at: string
  updated_at: string
}

function App() {
  const [apiBase, setApiBase] = useState<string>(
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080',
  )
  const [token, setToken] = useState<string>(() => localStorage.getItem('patchwork_jwt') || '')
  const [me, setMe] = useState<any>(null)
  const [githubStatus, setGithubStatus] = useState<GitHubStatusResponse | null>(null)
  const [repoFullName, setRepoFullName] = useState<string>('')
  const [ecosystemName, setEcosystemName] = useState<string>('')
  const [projectLanguage, setProjectLanguage] = useState<string>('')
  const [projectTags, setProjectTags] = useState<string>('')
  const [projectCategory, setProjectCategory] = useState<string>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [publicProjects, setPublicProjects] = useState<Project[]>([])
  const [filterOptions, setFilterOptions] = useState<{ languages: string[]; categories: string[]; tags: string[] }>({ languages: [], categories: [], tags: [] })
  const [filterEcosystem, setFilterEcosystem] = useState<string>('')
  const [filterLanguage, setFilterLanguage] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterTags, setFilterTags] = useState<string>('')
  const [availableEcosystems, setAvailableEcosystems] = useState<any[]>([])
  const [publicEcosystems, setPublicEcosystems] = useState<any[]>([])
  const [selectedProjectID, setSelectedProjectID] = useState<string>('')
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([])
  const [projectIssues, setProjectIssues] = useState<any[]>([])
  const [projectPRs, setProjectPRs] = useState<any[]>([])
  const [projectEvents, setProjectEvents] = useState<any[]>([])
  const [adminBootstrapToken, setAdminBootstrapToken] = useState<string>('')
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [selectedUserID, setSelectedUserID] = useState<string>('')
  const [selectedUserRole, setSelectedUserRole] = useState<string>('maintainer')
  const [ecosystems, setEcosystems] = useState<any[]>([])
  const [ecoName, setEcoName] = useState<string>('')
  const [ecoDescription, setEcoDescription] = useState<string>('')
  const [ecoWebsite, setEcoWebsite] = useState<string>('')
  const [ecoStatus, setEcoStatus] = useState<string>('active')
  const [selectedEcoID, setSelectedEcoID] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [kycStatus, setKycStatus] = useState<any>(null)
  const [kycUrl, setKycUrl] = useState<string>('')

  // If we got redirected back from GitHub login with ?token=..., store it.
  // Also handle KYC callback redirects
  useEffect(() => {
    try {
      const u = new URL(window.location.href)
      const t = u.searchParams.get('token')
      if (t) {
        localStorage.setItem('patchwork_jwt', t)
        setToken(t)
        u.searchParams.delete('token')
        window.history.replaceState({}, '', u.toString())
        setStatus('Signed in with GitHub.')
      }
      
      // Handle KYC callback
      const kycStatus = u.searchParams.get('kyc')
      const sessionId = u.searchParams.get('session_id')
      if (kycStatus === 'verified' && sessionId) {
        u.searchParams.delete('kyc')
        u.searchParams.delete('session_id')
        window.history.replaceState({}, '', u.toString())
        setStatus('KYC verification completed! Refreshing status...')
        // Auto-refresh KYC status after a short delay
        // Check token from localStorage in case state is stale
        const currentToken = token || localStorage.getItem('patchwork_jwt') || ''
        if (currentToken) {
          setTimeout(() => {
            fetchKYCStatus().catch(() => {})
          }, 1000)
        } else {
          setStatus('KYC verification completed! Please log in to see your status.')
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch available ecosystems and filter options on mount
  useEffect(() => {
    fetchAvailableEcosystems().catch(() => {})
    fetchFilterOptions().catch(() => {})
  }, [])

  async function fetchAvailableEcosystems(showStatus = false) {
    try {
      if (showStatus) {
        setError('')
        setStatus('Fetching available ecosystems…')
      }
      const r = await fetch(`${apiBase}/ecosystems`)
      if (!r.ok) {
        if (showStatus) {
          setError('Failed to fetch ecosystems')
          setStatus('')
        }
        return
      }
      const j = (await r.json()) as { ecosystems: any[] }
      const ecosystems = j.ecosystems || []
      setAvailableEcosystems(ecosystems)
      // Auto-select first ecosystem if none selected
      if (!ecosystemName && ecosystems.length > 0) {
        setEcosystemName(ecosystems[0].name)
      }
      if (showStatus) {
        setStatus(`Found ${ecosystems.length} active ecosystem(s).`)
      }
    } catch (e: any) {
      if (showStatus) {
        setError(e?.message || 'Failed to fetch ecosystems')
        setStatus('')
      }
    }
  }

  async function githubLogin() {
    try {
      setError('')
      setStatus('Starting GitHub login…')
      const r = await fetch(`${apiBase}/auth/github/login/start`)
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`github login start failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { url: string }
      window.location.href = j.url
    } catch (e: any) {
      setError(e?.message || 'github login failed')
      setStatus('')
    }
  }

  async function fetchMe() {
    try {
      setError('')
      setStatus('Fetching /me…')
      if (!token) {
        setError('No JWT yet.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/me`, {
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`/me failed: ${r.status} ${t}`)
      }
      setMe(await r.json())
      setStatus('Fetched /me.')
    } catch (e: any) {
      setError(e?.message || '/me failed')
      setStatus('')
    }
  }

  async function createProject() {
    try {
      setError('')
      setStatus('Creating project…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      if (!repoFullName.trim()) {
        setError('Enter GitHub repo full name (owner/repo).')
        setStatus('')
        return
      }
      if (!ecosystemName.trim()) {
        setError('Ecosystem name is required.')
        setStatus('')
        return
      }

      const body: any = {
        github_full_name: repoFullName.trim(),
        ecosystem_name: ecosystemName.trim(), // Required
      }
      if (projectLanguage.trim()) {
        body.language = projectLanguage.trim()
      }
      if (projectTags.trim()) {
        // Parse comma-separated tags
        const tags = projectTags.split(',').map(t => t.trim()).filter(t => t)
        if (tags.length > 0) {
          body.tags = tags
        }
      }
      if (projectCategory.trim()) {
        body.category = projectCategory.trim()
      }
      const r = await fetch(`${apiBase}/projects`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`create project failed: ${r.status} ${t}`)
      }
      setStatus('Project created. Refreshing list…')
      // Clear form fields
      setRepoFullName('')
      setProjectLanguage('')
      setProjectTags('')
      setProjectCategory('')
      await fetchMyProjects()
    } catch (e: any) {
      setError(e?.message || 'create project failed')
      setStatus('')
    }
  }

  async function fetchMyProjects() {
    try {
      setError('')
      setStatus('Fetching my projects…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/projects/mine`, {
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`list projects failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { projects: Project[] }
      setProjects(j.projects || [])
      if (!selectedProjectID && j.projects?.length) {
        setSelectedProjectID(j.projects[0].id)
      }
      setStatus('Projects fetched.')
    } catch (e: any) {
      setError(e?.message || 'list projects failed')
      setStatus('')
    }
  }

  async function verifyProject() {
    try {
      setError('')
      setStatus('Queuing project verification…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      if (!selectedProjectID) {
        setError('Select a project first.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/projects/${selectedProjectID}/verify`, {
        method: 'POST',
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`verify project failed: ${r.status} ${t}`)
      }
      setStatus('Verification queued (202). Refresh projects in a few seconds.')
      // best-effort refresh shortly after
      setTimeout(() => {
        fetchMyProjects().catch(() => {})
      }, 1500)
    } catch (e: any) {
      setError(e?.message || 'verify project failed')
      setStatus('')
    }
  }

  async function runFullSync() {
    try {
      setError('')
      setStatus('Queueing full sync…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      if (!selectedProjectID) {
        setError('Select a project first.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/projects/${selectedProjectID}/sync`, {
        method: 'POST',
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`sync enqueue failed: ${r.status} ${t}`)
      }
      setStatus('Sync queued (202).')
      setTimeout(() => {
        refreshProjectData().catch(() => {})
      }, 1200)
    } catch (e: any) {
      setError(e?.message || 'sync enqueue failed')
      setStatus('')
    }
  }

  async function fetchSyncJobs() {
    if (!token || !selectedProjectID) return
    const r = await fetch(`${apiBase}/projects/${selectedProjectID}/sync/jobs`, {
      headers: { authorization: `bearer ${token}` },
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`sync jobs failed: ${r.status} ${t}`)
    }
    const j = (await r.json()) as { jobs: SyncJob[] }
    setSyncJobs(j.jobs || [])
  }

  async function fetchIssues() {
    if (!token || !selectedProjectID) return
    const r = await fetch(`${apiBase}/projects/${selectedProjectID}/issues`, {
      headers: { authorization: `bearer ${token}` },
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`issues failed: ${r.status} ${t}`)
    }
    const j = (await r.json()) as { issues: any[] }
    setProjectIssues(j.issues || [])
  }

  async function fetchPRs() {
    if (!token || !selectedProjectID) return
    const r = await fetch(`${apiBase}/projects/${selectedProjectID}/prs`, {
      headers: { authorization: `bearer ${token}` },
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`prs failed: ${r.status} ${t}`)
    }
    const j = (await r.json()) as { prs: any[] }
    setProjectPRs(j.prs || [])
  }

  async function fetchEvents() {
    if (!token || !selectedProjectID) return
    const r = await fetch(`${apiBase}/projects/${selectedProjectID}/events`, {
      headers: { authorization: `bearer ${token}` },
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(`events failed: ${r.status} ${t}`)
    }
    const j = (await r.json()) as { events: any[] }
    setProjectEvents(j.events || [])
  }

  async function refreshProjectData() {
    try {
      setError('')
      setStatus('Refreshing project data…')
      await Promise.all([fetchMyProjects(), fetchSyncJobs(), fetchIssues(), fetchPRs(), fetchEvents()])
      setStatus('Project data refreshed.')
    } catch (e: any) {
      setError(e?.message || 'refresh failed')
      setStatus('')
    }
  }

  async function githubLink() {
    try {
      setError('')
      setStatus('Starting GitHub OAuth…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/auth/github/start`, {
        method: 'POST',
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`github start failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { url: string }
      window.open(j.url, '_blank')
      setStatus('Opened GitHub OAuth page.')
    } catch (e: any) {
      setError(e?.message || 'github oauth start failed')
      setStatus('')
    }
  }

  async function fetchGitHubStatus() {
    try {
      setError('')
      setStatus('Checking GitHub link status…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/auth/github/status`, {
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`github status failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as GitHubStatusResponse
      setGithubStatus(j)
      setStatus('GitHub status fetched.')
    } catch (e: any) {
      setError(e?.message || 'github status failed')
      setStatus('')
    }
  }

  async function startKYC() {
    try {
      setError('')
      setStatus('Starting KYC verification…')
      if (!token) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/auth/kyc/start`, {
        method: 'POST',
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        let errorData: any = {}
        try {
          errorData = JSON.parse(t)
        } catch {
          // If not JSON, use the text as error message
          throw new Error(`kyc start failed: ${r.status} ${t}`)
        }
        
        // Handle 409 Conflict - existing session
        if (r.status === 409 && errorData.error === 'kyc_session_exists') {
          setError('')
          setStatus(errorData.message || 'You already have an active KYC session.')
          // If URL is provided in error response, show it
          if (errorData.url) {
            setKycUrl(errorData.url)
          } else if (errorData.session_id) {
            // Try to fetch status to get the URL
            setTimeout(() => {
              fetchKYCStatus().catch(() => {})
            }, 500)
          }
          return
        }
        
        throw new Error(errorData.message || `kyc start failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { session_id: string; url: string }
      setKycUrl(j.url)
      setStatus('KYC session created. Click the link to verify.')
      // Refresh status after a moment
      setTimeout(() => {
        fetchKYCStatus().catch(() => {})
      }, 1000)
    } catch (e: any) {
      setError(e?.message || 'kyc start failed')
      setStatus('')
    }
  }

  async function fetchKYCStatus() {
    try {
      setError('')
      setStatus('Fetching KYC status…')
      
      // Get token from localStorage in case state is stale
      const currentToken = token || localStorage.getItem('patchwork_jwt') || ''
      if (!currentToken) {
        setError('Login first (get JWT).')
        setStatus('')
        return
      }
      
      const r = await fetch(`${apiBase}/auth/kyc/status`, {
        headers: { authorization: `bearer ${currentToken}` },
      })
      if (!r.ok) {
        const t = await r.text()
        if (r.status === 401) {
          // Token expired or invalid - clear it and ask user to login again
          localStorage.removeItem('patchwork_jwt')
          setToken('')
          setError('Session expired. Please log in again.')
          setStatus('')
          return
        }
        throw new Error(`kyc status failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as {
        status: string | null
        session_id: string | null
        verified_at: string | null
        data: any
        extracted?: {
          first_name?: string
          last_name?: string
          full_name?: string
          address?: string
          date_of_birth?: string
          age?: number
          document_type?: string
          document_number?: string
          id_verification_status?: string
          face_match_score?: number
          rejection_reasons?: string[]
        }
        rejection_reason?: any
      }
      setKycStatus(j)
      setStatus('KYC status fetched.')
      
      // Extract session URL from data if available (for pending, in_review, or not_started status)
      if ((j.status === 'pending' || j.status === 'in_review' || j.status === 'not_started') && j.data && j.data.session_url) {
        setKycUrl(j.data.session_url)
      }
    } catch (e: any) {
      setError(e?.message || 'kyc status failed')
      setStatus('')
    }
  }

  async function bootstrapAdmin() {
    try {
      setError('')
      setStatus('Bootstrapping admin…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      if (!adminBootstrapToken.trim()) {
        setError('Enter ADMIN_BOOTSTRAP_TOKEN from backend/.env')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/bootstrap`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${token}`,
          'X-Admin-Bootstrap-Token': adminBootstrapToken.trim(),
        },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`bootstrap failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { ok: boolean; token?: string; role?: string }
      if (j.token) {
        localStorage.setItem('patchwork_jwt', j.token)
        setToken(j.token)
      }
      setStatus('Bootstrapped admin. (JWT refreshed)')
    } catch (e: any) {
      setError(e?.message || 'bootstrap failed')
      setStatus('')
    }
  }

  async function fetchUsers() {
    try {
      setError('')
      setStatus('Fetching users…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/users`, {
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`users failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { users: any[] }
      setAdminUsers(j.users || [])
      if (!selectedUserID && j.users?.length) {
        setSelectedUserID(j.users[0].id)
      }
      setStatus('Users fetched.')
    } catch (e: any) {
      setError(e?.message || 'users fetch failed')
      setStatus('')
    }
  }

  async function setUserRole() {
    try {
      setError('')
      setStatus('Updating user role…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      if (!selectedUserID) {
        setError('Select a user.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/users/${selectedUserID}/role`, {
        method: 'PUT',
        headers: {
          authorization: `bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ role: selectedUserRole }),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`set role failed: ${r.status} ${t}`)
      }
      setStatus('Role updated. Refreshing users…')
      await fetchUsers()
    } catch (e: any) {
      setError(e?.message || 'set role failed')
      setStatus('')
    }
  }

  async function fetchFilterOptions() {
    try {
      const r = await fetch(`${apiBase}/projects/filters`)
      if (!r.ok) {
        return
      }
      const j = (await r.json()) as { languages: string[]; categories: string[]; tags: string[] }
      setFilterOptions({
        languages: j.languages || [],
        categories: j.categories || [],
        tags: j.tags || [],
      })
    } catch {
      // ignore
    }
  }

  async function fetchPublicProjects() {
    try {
      setError('')
      setStatus('Fetching public projects…')
      const params = new URLSearchParams()
      if (filterEcosystem) params.set('ecosystem', filterEcosystem)
      if (filterLanguage) params.set('language', filterLanguage)
      if (filterCategory) params.set('category', filterCategory)
      if (filterTags) params.set('tags', filterTags)
      params.set('limit', '50')
      
      const r = await fetch(`${apiBase}/projects?${params.toString()}`)
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`public projects failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { projects: Project[]; total: number; limit: number; offset: number }
      setPublicProjects(j.projects || [])
      setStatus(`Fetched ${j.projects?.length || 0} projects (total: ${j.total || 0}).`)
    } catch (e: any) {
      setError(e?.message || 'public projects fetch failed')
      setStatus('')
    }
  }

  async function fetchPublicEcosystems() {
    try {
      setError('')
      setStatus('Fetching public ecosystems…')
      const r = await fetch(`${apiBase}/ecosystems`)
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`public ecosystems failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { ecosystems: any[] }
      setPublicEcosystems(j.ecosystems || [])
      setStatus('Public ecosystems fetched.')
    } catch (e: any) {
      setError(e?.message || 'public ecosystems fetch failed')
      setStatus('')
    }
  }

  async function fetchEcosystems() {
    try {
      setError('')
      setStatus('Fetching ecosystems…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/ecosystems`, {
        headers: { authorization: `bearer ${token}` },
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`ecosystems failed: ${r.status} ${t}`)
      }
      const j = (await r.json()) as { ecosystems: any[] }
      setEcosystems(j.ecosystems || [])
      if (!selectedEcoID && j.ecosystems?.length) {
        setSelectedEcoID(j.ecosystems[0].id)
      }
      setStatus('Ecosystems fetched.')
    } catch (e: any) {
      setError(e?.message || 'ecosystems fetch failed')
      setStatus('')
    }
  }

  async function createEcosystem() {
    try {
      setError('')
      setStatus('Creating ecosystem…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      if (!ecoName.trim()) {
        setError('Name is required.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/ecosystems`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: ecoName,
          description: ecoDescription,
          website_url: ecoWebsite,
          status: ecoStatus,
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`create ecosystem failed: ${r.status} ${t}`)
      }
      setStatus('Ecosystem created. Refreshing…')
      await fetchEcosystems()
    } catch (e: any) {
      setError(e?.message || 'create ecosystem failed')
      setStatus('')
    }
  }

  async function updateEcosystem() {
    try {
      setError('')
      setStatus('Updating ecosystem…')
      if (!token) {
        setError('Login first.')
        setStatus('')
        return
      }
      if (!selectedEcoID) {
        setError('Select an ecosystem.')
        setStatus('')
        return
      }
      const r = await fetch(`${apiBase}/admin/ecosystems/${selectedEcoID}`, {
        method: 'PUT',
        headers: {
          authorization: `bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: ecoName,
          description: ecoDescription,
          website_url: ecoWebsite,
          status: ecoStatus,
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(`update ecosystem failed: ${r.status} ${t}`)
      }
      setStatus('Ecosystem updated. Refreshing…')
      await fetchEcosystems()
    } catch (e: any) {
      setError(e?.message || 'update ecosystem failed')
      setStatus('')
    }
  }

  function logout() {
    localStorage.removeItem('patchwork_jwt')
    setToken('')
    setMe(null)
    setGithubStatus(null)
    setProjects([])
    setSelectedProjectID('')
    setSyncJobs([])
    setProjectIssues([])
    setProjectPRs([])
    setProjectEvents([])
    setAdminUsers([])
    setSelectedUserID('')
    setEcosystems([])
    setSelectedEcoID('')
    setKycStatus(null)
    setKycUrl('')
    setStatus('Logged out.')
    setError('')
  }

  return (
    <>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'left' }}>
        <h1>Patchwork Backend Test UI</h1>
        <p style={{ opacity: 0.8 }}>
          Temporary React UI to test wallet login → JWT → GitHub OAuth linking.
        </p>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Backend</h3>
          <label>
            API Base URL:{' '}
            <input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              style={{ width: 380 }}
            />
          </label>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Sign in (GitHub)</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={githubLogin}>
              Sign in with GitHub
            </button>
            <button onClick={fetchMe} disabled={!token}>
              Call /me
            </button>
            <button onClick={logout}>
              Logout
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ marginTop: 8 }}>
              <b>JWT:</b>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{token ? `${token.slice(0, 32)}…` : '(none)'}</pre>
            </div>
            <div style={{ marginTop: 8 }}>
              <b>/me:</b>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{me ? JSON.stringify(me, null, 2) : '(not fetched)'}</pre>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>GitHub OAuth Linking</h3>
          <p style={{ opacity: 0.8 }}>
            Requires backend env: <code>GITHUB_OAUTH_CLIENT_ID</code>, <code>GITHUB_OAUTH_CLIENT_SECRET</code>,
            <code>GITHUB_OAUTH_REDIRECT_URL</code>, <code>TOKEN_ENC_KEY_B64</code>.
          </p>
          <button onClick={githubLink} disabled={!token}>
            Re-authorize GitHub (for scopes)
          </button>
          <button onClick={fetchGitHubStatus} disabled={!token} style={{ marginLeft: 12 }}>
            Check GitHub Status
          </button>

          <div style={{ marginTop: 12 }}>
            <b>Status:</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {githubStatus ? JSON.stringify(githubStatus, null, 2) : '(not checked)'}
            </pre>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>KYC Verification (Didit)</h3>
          <p style={{ opacity: 0.8 }}>
            Verify your identity using Didit. Requires backend env: <code>DIDIT_API_KEY</code>, <code>DIDIT_WORKFLOW_ID</code>.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={startKYC} disabled={!token}>
              Start KYC Verification
            </button>
            <button onClick={fetchKYCStatus} disabled={!token} style={{ marginLeft: 12 }}>
              Check KYC Status
            </button>
          </div>

          {kycUrl && (
            <div style={{ 
              marginTop: 12, 
              padding: 16, 
              backgroundColor: '#ffffff', 
              border: '2px solid #0066cc',
              borderRadius: 6,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <b style={{ color: '#000', fontSize: '1em', display: 'block', marginBottom: 12 }}>Verification Link:</b>
              <div style={{ marginTop: 8, marginBottom: 12 }}>
                <a 
                  href={kycUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ 
                    color: '#0066cc', 
                    wordBreak: 'break-all',
                    fontSize: '1em',
                    fontWeight: 'bold',
                    textDecoration: 'underline'
                  }}
                >
                  {kycUrl}
        </a>
      </div>
              <p style={{ 
                marginTop: 8, 
                fontSize: '0.9em', 
                color: '#333',
                lineHeight: '1.5'
              }}>
                Click the link above to complete your KYC verification. After completing, click "Check KYC Status" to see the updated status.
              </p>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <b>KYC Status:</b>
            {kycStatus ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>Status:</strong>{' '}
                  <span style={{
                    color: kycStatus.status === 'verified' ? '#28a745' : 
                           kycStatus.status === 'rejected' ? '#dc3545' : 
                           kycStatus.status === 'in_review' ? '#ff9800' : // Orange for in review
                           kycStatus.status === 'pending' ? '#ffc107' : // Yellow for pending (user started)
                           kycStatus.status === 'not_started' ? '#17a2b8' : // Cyan for not started
                           kycStatus.status === 'expired' ? '#6c757d' : '#6c757d',
                    fontWeight: 'bold'
                  }}>
                    {kycStatus.status === 'not_started' ? 'Not Started' : 
                     kycStatus.status === 'in_review' ? 'In Review' :
                     kycStatus.status || 'Not started'}
                  </span>
                </div>
                {kycStatus.session_id && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Session ID:</strong> {kycStatus.session_id}
                  </div>
                )}
                {kycStatus.verified_at && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Verified At:</strong> {new Date(kycStatus.verified_at).toLocaleString()}
                  </div>
                )}
                
                {/* Display extracted KYC information */}
                {kycStatus.extracted && (
                  <div style={{ 
                    marginTop: 12, 
                    marginBottom: 12, 
                    padding: 16, 
                    backgroundColor: '#f8f9fa', 
                    border: '1px solid #dee2e6',
                    borderRadius: 6
                  }}>
                    <strong style={{ display: 'block', marginBottom: 12, color: '#333', fontSize: '1.1em' }}>KYC Information:</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                      {kycStatus.extracted.full_name && (
                        <div>
                          <strong style={{ color: '#666' }}>Full Name:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.full_name}</span>
                        </div>
                      )}
                      {kycStatus.extracted.first_name && !kycStatus.extracted.full_name && (
                        <div>
                          <strong style={{ color: '#666' }}>First Name:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.first_name}</span>
                        </div>
                      )}
                      {kycStatus.extracted.last_name && !kycStatus.extracted.full_name && (
                        <div>
                          <strong style={{ color: '#666' }}>Last Name:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.last_name}</span>
                        </div>
                      )}
                      {kycStatus.extracted.date_of_birth && (
                        <div>
                          <strong style={{ color: '#666' }}>Date of Birth:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.date_of_birth}</span>
                        </div>
                      )}
                      {kycStatus.extracted.age && (
                        <div>
                          <strong style={{ color: '#666' }}>Age:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.age}</span>
                        </div>
                      )}
                      {kycStatus.extracted.address && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <strong style={{ color: '#666' }}>Address:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.address}</span>
                        </div>
                      )}
                      {kycStatus.extracted.document_type && (
                        <div>
                          <strong style={{ color: '#666' }}>Document Type:</strong>{' '}
                          <span style={{ color: '#333' }}>{kycStatus.extracted.document_type}</span>
                        </div>
                      )}
                      {kycStatus.extracted.document_number && (
                        <div>
                          <strong style={{ color: '#666' }}>Document Number:</strong>{' '}
                          <span style={{ color: '#333', fontFamily: 'monospace' }}>{kycStatus.extracted.document_number}</span>
                        </div>
                      )}
                      {kycStatus.extracted.id_verification_status && (
                        <div>
                          <strong style={{ color: '#666' }}>ID Verification:</strong>{' '}
                          <span style={{ 
                            color: kycStatus.extracted.id_verification_status === 'Approved' ? '#28a745' : '#dc3545',
                            fontWeight: 'bold'
                          }}>
                            {kycStatus.extracted.id_verification_status}
                          </span>
                        </div>
                      )}
                      {kycStatus.extracted.face_match_score !== undefined && (
                        <div>
                          <strong style={{ color: '#666' }}>Face Match Score:</strong>{' '}
                          <span style={{ 
                            color: kycStatus.extracted.face_match_score >= 70 ? '#28a745' : '#dc3545',
                            fontWeight: 'bold'
                          }}>
                            {kycStatus.extracted.face_match_score.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Display rejection reason */}
                {kycStatus.status === 'rejected' && kycStatus.rejection_reason && (
                  <div style={{ 
                    marginTop: 12, 
                    marginBottom: 12, 
                    padding: 16, 
                    backgroundColor: '#fff3cd', 
                    border: '2px solid #ffc107',
                    borderRadius: 6
                  }}>
                    <strong style={{ display: 'block', marginBottom: 12, color: '#856404', fontSize: '1.1em' }}>Rejection Reason:</strong>
                    <div style={{ color: '#856404', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {typeof kycStatus.rejection_reason === 'string' 
                        ? kycStatus.rejection_reason 
                        : JSON.stringify(kycStatus.rejection_reason, null, 2)}
                    </div>
                    {kycStatus.extracted?.rejection_reasons && kycStatus.extracted.rejection_reasons.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ffc107' }}>
                        <strong style={{ display: 'block', marginBottom: 8, color: '#856404' }}>Detailed Reasons:</strong>
                        <ul style={{ margin: 0, paddingLeft: 20, color: '#856404' }}>
                          {kycStatus.extracted.rejection_reasons.map((reason, idx) => (
                            <li key={idx} style={{ marginBottom: 8 }}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <strong style={{ display: 'block', marginBottom: 8, color: '#333' }}>Full Details:</strong>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    marginTop: 0, 
                    padding: 16, 
                    backgroundColor: '#ffffff', 
                    border: '2px solid #0066cc',
                    borderRadius: 6,
                    color: '#000000',
                    fontSize: '0.9em',
                    lineHeight: '1.6',
                    overflow: 'auto',
                    maxHeight: '400px',
                    fontFamily: 'monospace',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    {JSON.stringify(kycStatus, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>(not checked)</pre>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Admin</h3>
          <p style={{ opacity: 0.8 }}>
            Bootstrap is only allowed when there are 0 admins in DB (or you are already admin). It returns a refreshed JWT.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Bootstrap token:{' '}
              <input
                value={adminBootstrapToken}
                onChange={(e) => setAdminBootstrapToken(e.target.value)}
                placeholder="ADMIN_BOOTSTRAP_TOKEN"
                style={{ width: 280 }}
              />
            </label>
            <button onClick={bootstrapAdmin} disabled={!token}>
              Bootstrap Admin
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={fetchUsers} disabled={!token}>
              List Users
            </button>
            <label>
              User:{' '}
              <select
                value={selectedUserID}
                onChange={(e) => setSelectedUserID(e.target.value)}
                style={{ width: 360 }}
              >
                <option value="">(select)</option>
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id.slice(0, 8)} — {u.role} — github:{String(u.github_user_id ?? 'null')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role:{' '}
              <select value={selectedUserRole} onChange={(e) => setSelectedUserRole(e.target.value)}>
                <option value="contributor">contributor</option>
                <option value="maintainer">maintainer</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button onClick={setUserRole} disabled={!token || !selectedUserID}>
              Set Role
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>Users (latest 50):</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {adminUsers.length ? JSON.stringify(adminUsers, null, 2) : '(not loaded)'}
            </pre>
          </div>

          <hr style={{ margin: '16px 0', opacity: 0.3 }} />

          <h4>Ecosystems (admin-only)</h4>
          <p style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 8 }}>
            Click "List Ecosystems" to load ecosystems, then select one to edit. Use the Status dropdown to change between "active" (visible to users) and "inactive" (hidden).
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={fetchEcosystems} disabled={!token}>
              List Ecosystems
            </button>
            <label>
              Selected:{' '}
              <select
                value={selectedEcoID}
                onChange={(e) => {
                  setSelectedEcoID(e.target.value)
                  const eco = ecosystems.find((ec) => ec.id === e.target.value)
                  if (eco) {
                    setEcoName(eco.name || '')
                    setEcoDescription(eco.description || '')
                    setEcoWebsite(eco.website_url || '')
                    setEcoStatus(eco.status || 'active')
                  }
                }}
                style={{ width: 360 }}
                disabled={ecosystems.length === 0}
              >
                <option value="">
                  {ecosystems.length === 0 ? '(click "List Ecosystems" first)' : '(select)'}
                </option>
                {ecosystems.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.status} — users:{e.user_count ?? 0} projects:{e.project_count ?? 0}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Name:{' '}
              <input value={ecoName} onChange={(e) => setEcoName(e.target.value)} style={{ width: 220 }} />
            </label>
            <label>
              Status:{' '}
              <select 
                value={ecoStatus} 
                onChange={(e) => setEcoStatus(e.target.value)}
                title="active = visible to users, inactive = hidden from project creation dropdown"
              >
                <option value="active">active (visible)</option>
                <option value="inactive">inactive (hidden)</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>
              Website URL:{' '}
              <input value={ecoWebsite} onChange={(e) => setEcoWebsite(e.target.value)} style={{ width: 420 }} />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <label>
              Description:{' '}
              <input value={ecoDescription} onChange={(e) => setEcoDescription(e.target.value)} style={{ width: 620 }} />
            </label>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={createEcosystem} disabled={!token}>
              Create Ecosystem
            </button>
            <button onClick={updateEcosystem} disabled={!token || !selectedEcoID}>
              Update Selected
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>Ecosystems:</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {ecosystems.length ? JSON.stringify(ecosystems, null, 2) : '(not loaded)'}
            </pre>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Ecosystems (Public)</h3>
          <p style={{ opacity: 0.8 }}>
            View active ecosystems with user and project counts.
          </p>
          <button onClick={fetchPublicEcosystems}>
            Fetch Public Ecosystems
          </button>
          <div style={{ marginTop: 12 }}>
            <b>Ecosystems:</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {publicEcosystems.length ? JSON.stringify(publicEcosystems, null, 2) : '(not loaded)'}
            </pre>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Public Projects (Filtered)</h3>
          <p style={{ opacity: 0.8 }}>
            Browse and filter verified projects by ecosystem, language, category, and tags.
          </p>
          
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <label>
              Ecosystem:{' '}
              <select
                value={filterEcosystem}
                onChange={(e) => setFilterEcosystem(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">(all)</option>
                {availableEcosystems.map((eco) => (
                  <option key={eco.id} value={eco.name}>
                    {eco.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language:{' '}
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">(all)</option>
                {filterOptions.languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category:{' '}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">(all)</option>
                {filterOptions.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tags (comma-separated):{' '}
              <input
                value={filterTags}
                onChange={(e) => setFilterTags(e.target.value)}
                placeholder="e.g., good first issue, help wanted"
                style={{ width: 280 }}
              />
            </label>
          </div>
          
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={fetchPublicProjects}>
              Fetch Projects
            </button>
            <button onClick={fetchFilterOptions}>
              Refresh Filter Options
            </button>
            <button onClick={() => {
              setFilterEcosystem('')
              setFilterLanguage('')
              setFilterCategory('')
              setFilterTags('')
            }}>
              Clear Filters
            </button>
          </div>
          
          <div style={{ marginTop: 12 }}>
            <b>Projects ({publicProjects.length}):</b>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
              {publicProjects.length ? JSON.stringify(publicProjects, null, 2) : '(not loaded)'}
            </pre>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Projects</h3>
          <p style={{ opacity: 0.8 }}>
            Register a GitHub repo, then queue verification (repo permission check + webhook creation).
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Repo:{' '}
              <input
                value={repoFullName}
                onChange={(e) => setRepoFullName(e.target.value)}
                placeholder="owner/repo"
                style={{ width: 260 }}
                required
              />
            </label>
            <label>
              Ecosystem (required):{' '}
              <select
                value={ecosystemName}
                onChange={(e) => setEcosystemName(e.target.value)}
                style={{ width: 220 }}
                required
                title="Select an active ecosystem"
              >
                <option value="">(select ecosystem)</option>
                {availableEcosystems.map((eco) => (
                  <option key={eco.id} value={eco.name}>
                    {eco.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={createProject} disabled={!token}>
              Create Project
            </button>
            <button onClick={fetchMyProjects} disabled={!token}>
              Refresh My Projects
            </button>
            <button onClick={() => fetchAvailableEcosystems(true)} title="Refresh available ecosystems">
              Refresh Ecosystems
        </button>
          </div>
          
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Language (optional):{' '}
              <input
                value={projectLanguage}
                onChange={(e) => setProjectLanguage(e.target.value)}
                placeholder="e.g., TypeScript, Go"
                style={{ width: 180 }}
              />
            </label>
            <label>
              Category (optional):{' '}
              <input
                value={projectCategory}
                onChange={(e) => setProjectCategory(e.target.value)}
                placeholder="e.g., Frontend, Backend"
                style={{ width: 180 }}
              />
            </label>
            <label>
              Tags (optional, comma-separated):{' '}
              <input
                value={projectTags}
                onChange={(e) => setProjectTags(e.target.value)}
                placeholder="e.g., good first issue, help wanted"
                style={{ width: 280 }}
              />
            </label>
          </div>
          
          <p style={{ marginTop: 8, fontSize: '0.9em', opacity: 0.7 }}>
            <strong>Note:</strong> Select an ecosystem from the dropdown (only active ecosystems are shown).
            {availableEcosystems.length === 0 && (
              <span style={{ color: '#ff6b6b' }}> No active ecosystems found. Please create one in the Admin section.</span>
            )}
          </p>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Selected project:{' '}
              <select
                value={selectedProjectID}
                onChange={(e) => setSelectedProjectID(e.target.value)}
                style={{ width: 360 }}
              >
                <option value="">(select)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.github_full_name} — {p.status} — {p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={verifyProject} disabled={!token || !selectedProjectID}>
              Verify + Enable Webhook
            </button>
            <button onClick={runFullSync} disabled={!token || !selectedProjectID}>
              Run Full Sync
            </button>
            <button onClick={refreshProjectData} disabled={!token || !selectedProjectID}>
              Refresh Project Data
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>My Projects:</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {projects.length ? JSON.stringify(projects, null, 2) : '(none yet)'}
            </pre>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>Sync Jobs (latest):</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {syncJobs.length ? JSON.stringify(syncJobs, null, 2) : '(none)'}
            </pre>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>Issues (latest 50):</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {projectIssues.length ? JSON.stringify(projectIssues, null, 2) : '(none)'}
            </pre>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>PRs (latest 50):</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {projectPRs.length ? JSON.stringify(projectPRs, null, 2) : '(none)'}
            </pre>
          </div>

          <div style={{ marginTop: 12 }}>
            <b>Webhook Events (latest 50):</b>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {projectEvents.length ? JSON.stringify(projectEvents, null, 2) : '(none)'}
            </pre>
          </div>
        </div>

        {!!status && (
          <div className="card" style={{ marginTop: 16 }}>
            <b>Status:</b> {status}
          </div>
        )}
        {!!error && (
          <div className="card" style={{ marginTop: 16, borderColor: '#ff6b6b' }}>
            <b>Error:</b> {error}
          </div>
        )}
      </div>
    </>
  )
}

export default App
