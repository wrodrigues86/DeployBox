import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

function slugify(v = '') {
  return String(v)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4 shadow-[0_8px_28px_rgba(2,6,23,0.45)] md:p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export default function DockerWizard({ authHeaders, t, loading, onCancel, onSuccess }) {
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [jobId, setJobId] = useState('')
  const [jobLogs, setJobLogs] = useState([])
  const [jobStatus, setJobStatus] = useState('idle')
  const [error, setError] = useState('')
  const [stalledWarning, setStalledWarning] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const stallCountRef = useRef(0)
  const lastLogSignatureRef = useRef('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingTemplates(true)
      try {
        const { data } = await api.get('/templates', { headers: authHeaders })
        if (!cancelled) {
          const next = Array.isArray(data) ? data : []
          setTemplates(next)
          if (next.length) {
            setSelectedTemplate(next[0])
            setProjectName(slugify(next[0].name || next[0].slug || 'app'))
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'Falha ao carregar templates.')
      } finally {
        if (!cancelled) setLoadingTemplates(false)
      }
    })()
    return () => { cancelled = true }
  }, [authHeaders])

  useEffect(() => {
    if (!jobId) return
    let active = true
    stallCountRef.current = 0
    lastLogSignatureRef.current = ''
    setStalledWarning('')
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/install-template/${jobId}/logs`, { headers: authHeaders })
        if (!active) return
        const nextLogs = Array.isArray(data?.logs) ? data.logs : []
        const nextStatus = String(data?.status || 'running')
        setJobLogs(nextLogs)
        setJobStatus(nextStatus)
        setLastUpdatedAt(String(data?.updatedAt || ''))
        const signature = `${nextLogs.length}:${nextLogs[nextLogs.length - 1] || ''}`
        if (signature === lastLogSignatureRef.current && nextStatus === 'running') {
          stallCountRef.current += 1
        } else {
          stallCountRef.current = 0
          setStalledWarning('')
        }
        lastLogSignatureRef.current = signature
        if (stallCountRef.current >= 15) {
          setStalledWarning('Instalacao sem novos logs por um tempo. Verifique Docker/permissoes no servidor.')
        }
        if (data?.status === 'done' || data?.status === 'failed') {
          clearInterval(timer)
          setInstalling(false)
          if (data?.status === 'done') {
            onSuccess?.('install')
          } else {
            const lastLog = Array.isArray(data?.logs) && data.logs.length ? String(data.logs[data.logs.length - 1]) : ''
            setError(lastLog || 'Instalacao finalizada com falha. Verifique os logs.')
          }
        }
      } catch (_) {
        clearInterval(timer)
        setInstalling(false)
        setError('Falha ao acompanhar logs da instalacao.')
      }
    }, 1200)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [jobId, authHeaders, onSuccess])

  const selected = useMemo(() => {
    if (!selectedTemplate?.slug) return null
    return templates.find((item) => item.slug === selectedTemplate.slug) || null
  }, [templates, selectedTemplate])

  async function handleInstall() {
    setError('')
    setStalledWarning('')
    setLastUpdatedAt('')
    if (!selected?.slug) return setError('Selecione um template.')
    const safeProjectName = slugify(projectName || selected.slug)
    if (!safeProjectName) return setError('Informe um nome de projeto valido.')

    setInstalling(true)
    setJobLogs([])
    setJobStatus('running')
    try {
      const { data } = await api.post('/install-template', { template: selected.slug, projectName: safeProjectName }, { headers: authHeaders })
      setJobId(String(data?.jobId || ''))
    } catch (err) {
      setInstalling(false)
      setError(err?.response?.data?.error || 'Falha ao iniciar instalacao do template.')
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-700/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_52%),linear-gradient(160deg,rgba(15,23,42,0.95),rgba(2,6,23,0.94))] p-5 md:p-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-50">Templates Disponiveis</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Escolha um template enviado por ZIP e instale sem terminal.</p>
      </section>

      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{error}</div> : null}

      <SectionCard title="Templates" subtitle="Selecione um template Docker para instalar.">
        {loadingTemplates ? <div className="text-sm text-slate-400">Carregando templates...</div> : null}
        {!loadingTemplates && !templates.length ? <div className="text-sm text-slate-400">Nenhum template enviado ainda.</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((item) => (
            <button
              key={item.slug}
              className={`rounded-xl border p-4 text-left transition ${selected?.slug === item.slug ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/50 hover:border-cyan-500/40'}`}
              onClick={() => {
                setSelectedTemplate(item)
                setProjectName(slugify(item.name || item.slug || 'app'))
              }}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800">
                  {item.iconDataUrl ? <img src={item.iconDataUrl} alt={item.name} className="h-9 w-9 object-contain" /> : <span className="text-xl">🐳</span>}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.slug}</div>
                </div>
              </div>
              <p className="text-xs text-slate-300">{item.description}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Instalar" subtitle="Cria pasta do projeto, copia template e executa o comando automaticamente.">
        <label className="mb-3 block text-sm font-medium text-slate-200">
          Nome do Projeto
          <input
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="site01"
          />
        </label>
        <div className="text-xs text-slate-400">Comando: {selected?.command || '-'}</div>
      </SectionCard>

      <SectionCard title="Logs de Instalacao" subtitle="Acompanhe em tempo real.">
        <div className="mb-2 text-xs text-slate-400">Status: {jobStatus}</div>
        {lastUpdatedAt ? <div className="mb-2 text-[11px] text-slate-500">Ultima atualizacao: {new Date(lastUpdatedAt).toLocaleString()}</div> : null}
        {stalledWarning ? (
          <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
            {stalledWarning}
          </div>
        ) : null}
        <pre className="w-full min-w-0 max-h-[320px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
          {jobLogs.length ? jobLogs.join('\n') : 'Sem logs ainda.'}
        </pre>
      </SectionCard>

      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-xl border border-slate-700/80 bg-slate-950/90 p-4 backdrop-blur">
        <button className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500" onClick={onCancel}>
          {t('action_close', 'Fechar')}
        </button>
        <button
          className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
          disabled={loading || installing || !selected}
          onClick={handleInstall}
        >
          {installing ? 'Instalando...' : 'Instalar'}
        </button>
      </div>
    </div>
  )
}

