import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

const steps = ['basic', 'source', 'build', 'runtime', 'domain', 'review']
const templates = ['node', 'php', 'python', 'nginx', 'blank']

function slugify(v = '') {
  return String(v).toLowerCase().trim().replace(/[^a-z0-9-_\s]/g, '').replace(/\s+/g, '-')
}

export default function DockerWizard({ authHeaders, t, loading, onCancel, onCreate }) {
  const [step, setStep] = useState(0)
  const [repos, setRepos] = useState([])
  const [branches, setBranches] = useState([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '', slug: '', description: '', template: 'node',
    sourceType: 'template', repository: '', branch: '', subPath: '/', dockerfilePath: './Dockerfile',
    buildContext: '.', buildArgs: [{ key: '', value: '' }],
    externalPort: '3000', internalPort: '3000', restartPolicy: 'unless-stopped', cpuLimit: '', memoryMb: '',
    envs: [{ key: '', value: '', secret: false }],
    volumes: [{ hostPath: '', containerPath: '' }],
    subdomain: '', domainBase: '', enableSSL: true, forceHTTPS: true,
    autoDeploy: false,
  })

  const dockerBuildPreview = useMemo(() => `docker build -t deploybox-${form.slug || 'app'}:latest .`, [form.slug])
  const finalDomainPreview = useMemo(() => {
    if (!form.subdomain || !form.domainBase) return '-'
    return `${form.subdomain}.${form.domainBase}`
  }, [form.subdomain, form.domainBase])

  useEffect(() => {
    if (!form.slug) setForm((prev) => ({ ...prev, slug: slugify(prev.name) }))
  }, [form.name])

  async function getRepositories() {
    const token = localStorage.getItem('nodepanel_github_token') || ''
    if (!token) return []
    const { data } = await api.post('/git/repos', { token }, { headers: authHeaders })
    return data?.repos || []
  }

  async function getBranches(repo) {
    const token = localStorage.getItem('nodepanel_github_token') || ''
    if (!token || !repo) return []
    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}.git`
    const { data } = await api.post('/git/branches', { repoUrl, token }, { headers: authHeaders })
    return data?.branches || []
  }

  useEffect(() => {
    if (form.sourceType !== 'github') return
    getRepositories().then(setRepos).catch(() => setRepos([]))
  }, [form.sourceType])

  async function onRepositoryChange(nextRepository) {
    setForm((prev) => ({ ...prev, repository: nextRepository, branch: '' }))
    const list = await getBranches(nextRepository).catch(() => [])
    setBranches(list)
    const branch = list[0] || 'main'
    setForm((prev) => ({ ...prev, branch }))
    try {
      const { data } = await api.post('/projects/docker/detect-dockerfile', { repository: nextRepository, branch }, { headers: authHeaders })
      if (data?.found && data?.path) {
        setForm((prev) => ({ ...prev, dockerfilePath: data.path }))
      }
    } catch (_) {
      // ignore auto detection errors
    }
  }

  async function submit(mode) {
    setBusy(true)
    try {
      await onCreate({ ...form, mode })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {steps.map((k, idx) => (
          <button key={k} className={`btn text-xs ${idx === step ? 'border-panel-accent text-panel-accent' : ''}`} onClick={() => setStep(idx)}>{t(`docker.wizard.${k}.title`, k)}</button>
        ))}
      </div>

      {step === 0 && <div className="space-y-2">
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('label_name', 'Nome')} />
        <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder="slug" />
        <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('label_description', 'Descrição')} />
        <select className="input" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>{templates.map((tpl) => <option key={tpl} value={tpl}>{tpl}</option>)}</select>
      </div>}

      {step === 1 && <div className="space-y-2">
        <select className="input" value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
          <option value="template">template</option><option value="github">github</option><option value="dockerfile">dockerfile</option>
        </select>
        {form.sourceType === 'github' && <>
          <select className="input" value={form.repository} onChange={(e) => onRepositoryChange(e.target.value)}>
            <option value="">repo</option>
            {repos.map((repo) => <option key={repo.fullName} value={repo.fullName}>{repo.fullName}</option>)}
          </select>
          <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">branch</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input className="input" value={form.subPath} onChange={(e) => setForm({ ...form, subPath: e.target.value || '/' })} placeholder="/" />
          <input className="input" value={form.dockerfilePath} onChange={(e) => setForm({ ...form, dockerfilePath: e.target.value || './Dockerfile' })} placeholder="./Dockerfile" />
        </>}
      </div>}

      {step === 2 && <div className="space-y-2">
        <input className="input" value={form.dockerfilePath} onChange={(e) => setForm({ ...form, dockerfilePath: e.target.value })} placeholder="./Dockerfile" />
        <input className="input" value={form.buildContext} onChange={(e) => setForm({ ...form, buildContext: e.target.value })} placeholder="." />
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{dockerBuildPreview}</div>
      </div>}

      {step === 3 && <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={form.externalPort} onChange={(e) => setForm({ ...form, externalPort: e.target.value.replace(/[^\d]/g, '') })} placeholder="external" /><input className="input" value={form.internalPort} onChange={(e) => setForm({ ...form, internalPort: e.target.value.replace(/[^\d]/g, '') })} placeholder="internal" /></div>
        <select className="input" value={form.restartPolicy} onChange={(e) => setForm({ ...form, restartPolicy: e.target.value })}>
          <option value="no">no</option><option value="always">always</option><option value="unless-stopped">unless-stopped</option><option value="on-failure">on-failure</option>
        </select>
        <div className="grid grid-cols-2 gap-2"><input className="input" value={form.cpuLimit} onChange={(e) => setForm({ ...form, cpuLimit: e.target.value })} placeholder="cpu" /><input className="input" value={form.memoryMb} onChange={(e) => setForm({ ...form, memoryMb: e.target.value })} placeholder="memoryMb" /></div>
      </div>}

      {step === 4 && <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} placeholder="subdomain" /><input className="input" value={form.domainBase} onChange={(e) => setForm({ ...form, domainBase: e.target.value })} placeholder="domain" /></div>
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{finalDomainPreview}</div>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={form.enableSSL} onChange={(e) => setForm({ ...form, enableSSL: e.target.checked })} />enableSSL</label>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={form.forceHTTPS} onChange={(e) => setForm({ ...form, forceHTTPS: e.target.checked })} />forceHTTPS</label>
      </div>}

      {step === 5 && <div className="space-y-2 text-sm">
        <div>Nome: {form.name}</div><div>Repo: {form.repository || '-'}</div><div>Branch: {form.branch || '-'}</div><div>Dockerfile: {form.dockerfilePath}</div>
        <div>Porta: {form.externalPort} -&gt; {form.internalPort}</div><div>Domínio: {finalDomainPreview}</div><div>SSL: {form.enableSSL ? 'on' : 'off'}</div>
      </div>}

      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={onCancel}>{t('action_close', 'Fechar')}</button>
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>{t('action_back', 'Voltar')}</button>
        <button className="btn" disabled={step === steps.length - 1} onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>{t('action_next', 'Próximo')}</button>
        <button className="btn border-panel-accent text-panel-accent" disabled={loading || busy} onClick={() => submit('create')}>{busy ? '...' : t('action_create_project', 'Criar projeto')}</button>
        <button className="btn border-emerald-500 text-emerald-300" disabled={loading || busy} onClick={() => submit('deploy')}>{busy ? '...' : t('docker.actions.deploy', 'Deploy')}</button>
      </div>
    </div>
  )
}
