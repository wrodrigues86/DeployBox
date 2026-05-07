import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const POPULAR_TEMPLATES = [
  { id: 'wordpress', name: 'WordPress', category: 'CMS', description: 'Site e blog prontos para publicar.', icon: 'https://cdn.simpleicons.org/wordpress/21759B', framework: 'PHP', template: 'php', internalPort: '8080' },
  { id: 'n8n', name: 'n8n', category: 'Automation', description: 'Automacao de workflows visuais.', icon: 'https://cdn.simpleicons.org/n8n/EA4B71', framework: 'Node.js', template: 'node', internalPort: '5678' },
  { id: 'mysql', name: 'MySQL', category: 'Database', description: 'Banco de dados relacional popular.', icon: 'https://cdn.simpleicons.org/mysql/4479A1', framework: 'Dockerfile', template: 'blank', internalPort: '3306' },
  { id: 'mysql-phpmyadmin', name: 'MySQL + phpMyAdmin', category: 'Database', description: 'MySQL com painel phpMyAdmin no mesmo projeto.', icon: 'https://cdn.simpleicons.org/phpmyadmin/6C78AF', framework: 'Dockerfile', template: 'mysql_phpmyadmin', internalPort: '8080' },
  { id: 'postgresql', name: 'PostgreSQL', category: 'Database', description: 'Banco relacional avancado e robusto.', icon: 'https://cdn.simpleicons.org/postgresql/4169E1', framework: 'Dockerfile', template: 'blank', internalPort: '5432' },
  { id: 'mongodb', name: 'MongoDB', category: 'Database', description: 'Banco NoSQL para apps modernas.', icon: 'https://cdn.simpleicons.org/mongodb/47A248', framework: 'Dockerfile', template: 'blank', internalPort: '27017' },
  { id: 'redis', name: 'Redis', category: 'Cache', description: 'Cache em memoria rapido e leve.', icon: 'https://cdn.simpleicons.org/redis/DC382D', framework: 'Dockerfile', template: 'blank', internalPort: '6379' },
  { id: 'uptime-kuma', name: 'Uptime Kuma', category: 'Monitoring', description: 'Monitoramento de uptime amigavel.', icon: 'https://cdn.simpleicons.org/uptimekuma/5CDD8B', framework: 'Dockerfile', template: 'blank', internalPort: '3001' },
  { id: 'evolution-api', name: 'Evolution API', category: 'API', description: 'API para automacao de mensagens.', icon: 'https://cdn.simpleicons.org/whatsapp/25D366', framework: 'Node.js', template: 'node', internalPort: '8080' },
  { id: 'dotnet-api', name: '.NET API', category: 'Backend', description: 'API em .NET pronta para deploy.', icon: 'https://cdn.simpleicons.org/dotnet/512BD4', framework: '.NET', template: 'dotnet', internalPort: '8080' },
  { id: 'minio', name: 'MinIO', category: 'Storage', description: 'Armazenamento de objetos compativel S3.', icon: 'https://cdn.simpleicons.org/minio/C72E49', framework: 'Dockerfile', template: 'blank', internalPort: '9000' },
  { id: 'rabbitmq', name: 'RabbitMQ', category: 'Queue', description: 'Mensageria para sistemas distribuidos.', icon: 'https://cdn.simpleicons.org/rabbitmq/FF6600', framework: 'Dockerfile', template: 'blank', internalPort: '5672' },
]

const PIPELINE_STEPS = [
  'Clonando repositorio',
  'Detectando aplicacao',
  'Criando container',
  'Configurando dominio',
  'Gerando SSL',
  'Aplicacao online',
]

function slugify(v = '') {
  return String(v)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
}

function detectFramework({ template, repository, dockerfilePath }) {
  const normalizedRepo = String(repository || '').toLowerCase()
  const normalizedDockerfile = String(dockerfilePath || '').toLowerCase()
  if (template === 'php' || normalizedRepo.includes('laravel') || normalizedRepo.includes('wordpress')) return 'PHP'
  if (template === 'python' || normalizedRepo.includes('django') || normalizedRepo.includes('flask') || normalizedRepo.includes('fastapi')) return 'Python'
  if (template === 'dotnet' || normalizedRepo.includes('dotnet') || normalizedRepo.includes('aspnet')) return '.NET'
  if (normalizedDockerfile.includes('dockerfile') || template === 'blank' || template === 'mysql_phpmyadmin') return 'Dockerfile'
  return 'Node.js'
}

function detectBranch(url = '') {
  const normalized = String(url || '').toLowerCase()
  return normalized.includes('develop') ? 'develop' : 'main'
}

function toRepositoryFullName(url = '') {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  const githubMatch = trimmed.match(/github\.com\/(.+?)(?:\.git)?$/i)
  if (githubMatch?.[1]) return githubMatch[1].replace(/\/$/, '')
  return trimmed
}

function envToRows(envs) {
  return (envs || []).filter((item) => item.key.trim()).map((item) => ({
    key: item.key.trim(),
    value: item.value,
    secret: false,
  }))
}

function volumeToRows(volumes) {
  return (volumes || []).filter((item) => item.hostPath.trim() && item.containerPath.trim()).map((item) => ({
    hostPath: item.hostPath.trim(),
    containerPath: item.containerPath.trim(),
  }))
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5 shadow-[0_8px_28px_rgba(2,6,23,0.45)] md:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default function DockerWizard({ authHeaders, t, loading, onCancel, onCreate }) {
  const [search, setSearch] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('node')
  const [selectedTemplateName, setSelectedTemplateName] = useState('Aplicação Personalizada')
  const [selectedConnectedRepo, setSelectedConnectedRepo] = useState('')
  const [repos, setRepos] = useState([])
  const [branches, setBranches] = useState([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [connectingGithub, setConnectingGithub] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [pipelineIndex, setPipelineIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: 'meu-app',
    description: 'Aplicacao publicada com DeployBox',
    repository: '',
    branch: 'main',
    autoDeploy: true,
    internalPort: '3000',
    externalPort: '49152',
    subdomain: '',
    domainBase: '',
    enableSSL: true,
    forceHTTPS: true,
    cpuLimit: '1',
    memoryMb: '512',
    restartPolicy: 'unless-stopped',
    dockerfilePath: './Dockerfile',
    startCommand: '',
    envs: [{ key: '', value: '' }],
    volumes: [{ hostPath: '', containerPath: '' }],
  })

  const framework = useMemo(
    () => detectFramework({ template: selectedTemplate, repository: form.repository, dockerfilePath: form.dockerfilePath }),
    [selectedTemplate, form.repository, form.dockerfilePath],
  )

  const templates = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return POPULAR_TEMPLATES
    return POPULAR_TEMPLATES.filter((item) => {
      const haystack = `${item.name} ${item.category} ${item.description}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [search])

  function applyTemplate(item) {
    setSelectedTemplate(item.template)
    setSelectedTemplateName(item.name)
    setForm((prev) => ({
      ...prev,
      name: item.name,
      description: item.description,
      internalPort: item.internalPort,
    }))
  }

  function addEnvRow() {
    setForm((prev) => ({ ...prev, envs: [...prev.envs, { key: '', value: '' }] }))
  }

  function addVolumeRow() {
    setForm((prev) => ({ ...prev, volumes: [...prev.volumes, { hostPath: '', containerPath: '' }] }))
  }

  useEffect(() => {
    function onGithubOauthMessage(event) {
      const data = event?.data
      if (!data || data.type !== 'nodepanel:github-oauth') return
      if (data.error || !data.token) {
        setConnectingGithub(false)
        setError(data?.error || 'Falha ao conectar com GitHub.')
        return
      }
      localStorage.setItem('nodepanel_github_token', data.token)
      setConnectingGithub(false)
      carregarRepositoriosConectados()
    }
    window.addEventListener('message', onGithubOauthMessage)
    return () => window.removeEventListener('message', onGithubOauthMessage)
  }, [])

  async function conectarGithub() {
    setError('')
    setConnectingGithub(true)
    try {
      const { data } = await api.post('/git/github/oauth/start', { origin: window.location.origin }, { headers: authHeaders })
      const popup = window.open(data.authorizeUrl, 'nodepanel-github-oauth', 'width=620,height=760')
      if (!popup) {
        setConnectingGithub(false)
        setError('O navegador bloqueou o popup de login do GitHub.')
      }
    } catch (err) {
      setConnectingGithub(false)
      setError(err?.response?.data?.error || 'Falha ao iniciar conexão com GitHub.')
    }
  }

  async function carregarRepositoriosConectados() {
    const token = localStorage.getItem('nodepanel_github_token') || ''
    if (!token) {
      await conectarGithub()
      return
    }
    setLoadingRepos(true)
    setError('')
    try {
      const { data } = await api.post('/git/repos', { token }, { headers: authHeaders })
      setRepos(data?.repos || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Falha ao listar repositórios conectados.')
    } finally {
      setLoadingRepos(false)
    }
  }

  async function carregarBranches(repositoryFullName) {
    const token = localStorage.getItem('nodepanel_github_token') || ''
    if (!token || !repositoryFullName) return
    setLoadingBranches(true)
    try {
      const repoUrl = repositoryFullName.startsWith('http') ? repositoryFullName : `https://github.com/${repositoryFullName}.git`
      const { data } = await api.post('/git/branches', { repoUrl, token }, { headers: authHeaders })
      const list = data?.branches || []
      setBranches(list)
      if (list.length) setForm((prev) => ({ ...prev, branch: list[0] }))
    } catch (_) {
      setBranches([])
    } finally {
      setLoadingBranches(false)
    }
  }

  async function runSubmit(mode) {
    setError('')
    if (!form.name.trim()) return setError('Informe o nome da aplicacao.')
    if (!form.repository.trim()) return setError('Informe o repositorio GitHub.')

    const payload = {
      name: form.name.trim(),
      slug: slugify(form.name),
      description: form.description.trim() || 'Aplicacao publicada com DeployBox',
      template: selectedTemplate,
      sourceType: 'github',
      repository: toRepositoryFullName(form.repository),
      branch: form.branch,
      autoDeploy: !!form.autoDeploy,
      externalPort: String(form.externalPort || '49152'),
      internalPort: String(form.internalPort || '3000'),
      dockerfilePath: form.dockerfilePath || './Dockerfile',
      subdomain: form.subdomain,
      domainBase: form.domainBase,
      enableSSL: !!form.enableSSL,
      forceHTTPS: !!form.forceHTTPS,
      mode,
      cpuLimit: form.cpuLimit || '1',
      memoryMb: form.memoryMb || '512',
      restartPolicy: form.restartPolicy || 'unless-stopped',
      startCommand: form.startCommand || '',
      envs: envToRows(form.envs),
      volumes: volumeToRows(form.volumes),
    }

    if (mode === 'deploy') {
      setDeploying(true)
      setPipelineIndex(0)
      const interval = setInterval(() => {
        setPipelineIndex((prev) => {
          if (prev >= PIPELINE_STEPS.length - 1) return prev
          return prev + 1
        })
      }, 550)
      try {
        await onCreate(payload)
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || 'Falha ao publicar aplicacao.')
      } finally {
        clearInterval(interval)
        setPipelineIndex(PIPELINE_STEPS.length - 1)
        setTimeout(() => setDeploying(false), 700)
      }
      return
    }

    setBusy(true)
    try {
      await onCreate(payload)
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao criar aplicacao.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_52%),linear-gradient(160deg,rgba(15,23,42,0.95),rgba(2,6,23,0.94))] p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-50">Criar Aplicação</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Deploy aplicacoes Docker e projetos GitHub em poucos cliques.</p>
      </section>

      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}

      <SectionCard title="Templates Populares" subtitle="Escolha uma aplicacao pronta para acelerar o deploy.">
        <label className="mb-4 block text-sm font-medium text-slate-200">
          Buscar Aplicações
          <input
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            placeholder="mysql"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-2">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/65 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/90 p-1.5">
                        <img src={item.icon} alt={item.name} className="h-6 w-6" loading="lazy" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{item.name}</div>
                        <div className="text-[11px] uppercase tracking-wide text-cyan-300">{item.category}</div>
                      </div>
                    </div>
                    <div className="mt-2 truncate text-xs text-slate-400">{item.description}</div>
                  </div>
                  <button
                    className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-500/20"
                    onClick={() => applyTemplate(item)}
                  >
                    Instalar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Repositório" subtitle="Conecte seu projeto GitHub com o mínimo de configuração.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400" onClick={carregarRepositoriosConectados}>
            {connectingGithub ? 'Conectando GitHub...' : loadingRepos ? 'Carregando repositórios...' : 'Usar repositório conectado (opcional)'}
          </button>
          {!!repos.length && <span className="text-xs text-slate-400">{repos.length} repositórios encontrados</span>}
        </div>
        {!!repos.length && (
          <label className="mb-4 block text-sm font-medium text-slate-200">
            Repositórios conectados
            <select
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              value={selectedConnectedRepo}
              onChange={(e) => {
                const repo = e.target.value
                setSelectedConnectedRepo(repo)
                setForm((prev) => ({ ...prev, repository: repo }))
                carregarBranches(repo)
              }}
            >
              <option value="">Selecione um repositório</option>
              {repos.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>{repo.fullName}</option>
              ))}
            </select>
          </label>
        )}
        <label className="mb-4 block text-sm font-medium text-slate-200">
          Repositório GitHub
          <input
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            placeholder="https://github.com/user/project"
            value={form.repository}
            onChange={(e) => setForm((prev) => ({ ...prev, repository: e.target.value, branch: detectBranch(e.target.value) }))}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-200">
            Branch
            <select
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              value={form.branch}
              onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
            >
              {!!branches.length ? branches.map((b) => <option key={b} value={b}>{b}</option>) : (
                <>
                  <option value="main">main</option>
                  <option value="develop">develop</option>
                </>
              )}
            </select>
            {loadingBranches ? <div className="mt-1 text-xs text-slate-400">Carregando branches...</div> : null}
          </label>
          <label className="mt-8 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 md:mt-7">
            <input type="checkbox" checked={form.autoDeploy} onChange={(e) => setForm((prev) => ({ ...prev, autoDeploy: e.target.checked }))} />
            Deploy automatico ao receber push
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Aplicação" subtitle="Configuração básica com detecção automática de framework.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-200">
            Nome da Aplicação
            <input
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              value={form.name}
              onChange={(e) => {
                const nextName = e.target.value
                setForm((prev) => ({ ...prev, name: nextName }))
              }}
              placeholder="meu-app"
            />
          </label>
          <label className="text-sm font-medium text-slate-200">
            Framework
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {`OK ${framework} detectado`}
            </div>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Template selecionado</div>
            <div className="mt-1 text-base font-semibold text-slate-100">{selectedTemplateName}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Endereço da aplicação</div>
            <div className="mt-1 text-sm text-slate-200">Gerado automaticamente a partir do nome</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Portas" subtitle="Mapeamento simplificado e amigável.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-200">
            Porta Interna
            <input
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              value={form.internalPort}
              onChange={(e) => setForm((prev) => ({ ...prev, internalPort: e.target.value.replace(/[^\d]/g, '') }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-200">
            Porta Externa
            <input
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              value={form.externalPort}
              onChange={(e) => setForm((prev) => ({ ...prev, externalPort: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder="Auto"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Domínio" subtitle="Domínio com SSL automático pronto para produção.">
        <label className="mb-4 block text-sm font-medium text-slate-200">
          Domínio
          <input
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            value={form.subdomain && form.domainBase ? `${form.subdomain}.${form.domainBase}` : ''}
            onChange={(e) => {
              const clean = e.target.value.trim().replace(/^https?:\/\//, '')
              const [subdomain, ...rest] = clean.split('.')
              setForm((prev) => ({
                ...prev,
                subdomain: subdomain || prev.subdomain,
                domainBase: rest.length ? rest.join('.') : prev.domainBase,
              }))
            }}
            placeholder="app.wrodrigues.dev.br"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={form.enableSSL} onChange={(e) => setForm((prev) => ({ ...prev, enableSSL: e.target.checked }))} />
            SSL automatico
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={form.forceHTTPS} onChange={(e) => setForm((prev) => ({ ...prev, forceHTTPS: e.target.checked }))} />
            Forcar HTTPS
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Variáveis de Ambiente" subtitle="Adicione somente as variáveis necessárias.">
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr,1fr] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <div>Chave</div>
            <div>Valor</div>
          </div>
          {form.envs.map((item, idx) => (
            <div key={`env-${idx}`} className="grid grid-cols-[1fr,1fr] gap-2">
              <input
                className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                value={item.key}
                onChange={(e) => setForm((prev) => {
                  const envs = [...prev.envs]
                  envs[idx] = { ...envs[idx], key: e.target.value }
                  return { ...prev, envs }
                })}
              />
              <input
                className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                value={item.value}
                onChange={(e) => setForm((prev) => {
                  const envs = [...prev.envs]
                  envs[idx] = { ...envs[idx], value: e.target.value }
                  return { ...prev, envs }
                })}
              />
            </div>
          ))}
        </div>
        <button className="mt-3 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400" onClick={addEnvRow}>
          Adicionar Variável
        </button>
      </SectionCard>

      <SectionCard title="Configuração Avançada" subtitle="Opcional para casos específicos.">
        <button
          className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400"
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          Avançado
        </button>

        {advancedOpen ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-200">
                CPU
                <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100" value={form.cpuLimit} onChange={(e) => setForm((prev) => ({ ...prev, cpuLimit: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-slate-200">
                Memória (MB)
                <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100" value={form.memoryMb} onChange={(e) => setForm((prev) => ({ ...prev, memoryMb: e.target.value }))} />
              </label>
            </div>
            <label className="text-sm font-medium text-slate-200">
              Caminho do Dockerfile
              <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100" value={form.dockerfilePath} onChange={(e) => setForm((prev) => ({ ...prev, dockerfilePath: e.target.value }))} />
            </label>
            <label className="text-sm font-medium text-slate-200">
              Comando de inicialização
              <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100" value={form.startCommand} onChange={(e) => setForm((prev) => ({ ...prev, startCommand: e.target.value }))} placeholder="npm run start" />
            </label>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-200">Volumes</div>
              {form.volumes.map((item, idx) => (
                <div key={`vol-${idx}`} className="mb-2 grid grid-cols-[1fr,1fr] gap-2">
                  <input
                    className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="/host/path"
                    value={item.hostPath}
                    onChange={(e) => setForm((prev) => {
                      const volumes = [...prev.volumes]
                      volumes[idx] = { ...volumes[idx], hostPath: e.target.value }
                      return { ...prev, volumes }
                    })}
                  />
                  <input
                    className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                    placeholder="/container/path"
                    value={item.containerPath}
                    onChange={(e) => setForm((prev) => {
                      const volumes = [...prev.volumes]
                      volumes[idx] = { ...volumes[idx], containerPath: e.target.value }
                      return { ...prev, volumes }
                    })}
                  />
                </div>
              ))}
              <button className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400" onClick={addVolumeRow}>
                Adicionar Volume
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {deploying ? (
        <SectionCard title="Pipeline de Deploy" subtitle="Publicação em andamento.">
          <div className="space-y-2">
            {PIPELINE_STEPS.map((item, idx) => {
              const done = idx <= pipelineIndex
              return (
                <div key={item} className={`rounded-xl border px-4 py-3 text-sm ${done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-950/70 text-slate-400'}`}>
                  {`${done ? 'OK' : '...'} ${item}`}
                </div>
              )
            })}
          </div>
        </SectionCard>
      ) : null}

      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/90 p-4 backdrop-blur">
        <button className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500" onClick={onCancel}>
          {t('action_close', 'Fechar')}
        </button>
        <button
          className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-500/20"
          disabled={loading || busy || deploying}
          onClick={() => runSubmit('create')}
        >
          {busy ? 'Criando...' : 'Criar'}
        </button>
        <button
          className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
          disabled={loading || busy || deploying}
          onClick={() => runSubmit('deploy')}
        >
          Publicar
        </button>
      </div>

    </div>
  )
}
