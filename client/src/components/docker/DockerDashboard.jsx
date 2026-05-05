import { useEffect, useState } from 'react'
import useDockerConfig from '../../hooks/useDockerConfig'

const tabs = ['overview', 'build', 'runtime', 'domain', 'logs', 'deploy']

export default function DockerDashboard({ project, authHeaders, onSaved, t }) {
  const [tab, setTab] = useState('overview')
  const {
    config,
    setConfig,
    loading,
    saving,
    actionLoading,
    logsOutput,
    loadConfig,
    saveConfig,
    handleBuild,
    handleRun,
    handleStop,
    handleRestart,
    handleRebuild,
    handleLogs,
  } = useDockerConfig(project, authHeaders)

  useEffect(() => { loadConfig().catch(() => {}) }, [project?.id])
  if (loading || !config) return <div className="card mt-3 p-4 text-sm text-slate-300">loading docker...</div>

  const urlPreview = config.subdomain && config.domainBase ? `${config.subdomain}.${config.domainBase}` : '-'
  const ipPreview = `${window.location.protocol}//${window.location.hostname}:${config.externalPort || '3000'}`
  const cmdPreview = `docker build -t deploybox-${project.slug}:latest .`

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">{tabs.map((k) => <button key={k} className={`btn text-xs ${tab === k ? 'border-panel-accent text-panel-accent' : ''}`} onClick={() => setTab(k)}>{k}</button>)}</div>

      {tab === 'overview' && <div className="card space-y-2 p-4">
        <div className="text-sm">status: {project.status || '-'}</div>
        <div className="text-sm">image: deploybox-{project.slug}:latest</div>
        <div className="text-sm">ports: {config.externalPort} -&gt; {config.internalPort}</div>
        <div className="text-sm">domain: {urlPreview}</div>
        <div className="text-sm">ip: {ipPreview}</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRun(); onSaved?.() }}>start</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleStop(); onSaved?.() }}>stop</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRestart(); onSaved?.() }}>{t('docker.actions.restart', 'Restart')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRebuild(config); onSaved?.() }}>rebuild</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleLogs() }}>logs</button>
        </div>
      </div>}

      {tab === 'build' && <div className="card space-y-2 p-4">
        <input className="input" value={config.dockerfilePath} onChange={(e) => setConfig({ ...config, dockerfilePath: e.target.value })} />
        <input className="input" value={config.buildContext} onChange={(e) => setConfig({ ...config, buildContext: e.target.value })} />
        <textarea className="input min-h-[220px] font-mono text-xs" value={config.dockerfile} onChange={(e) => setConfig({ ...config, dockerfile: e.target.value })} />
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{cmdPreview}</div>
      </div>}

      {tab === 'runtime' && <div className="card space-y-2 p-4">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.externalPort} onChange={(e) => setConfig({ ...config, externalPort: e.target.value.replace(/[^\d]/g, '') })} /><input className="input" value={config.internalPort} onChange={(e) => setConfig({ ...config, internalPort: e.target.value.replace(/[^\d]/g, '') })} /></div>
        <select className="input" value={config.restartPolicy} onChange={(e) => setConfig({ ...config, restartPolicy: e.target.value })}><option value="no">no</option><option value="always">always</option><option value="unless-stopped">unless-stopped</option><option value="on-failure">on-failure</option></select>
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.cpuLimit} onChange={(e) => setConfig({ ...config, cpuLimit: e.target.value })} placeholder="cpu" /><input className="input" value={config.memoryMb} onChange={(e) => setConfig({ ...config, memoryMb: e.target.value })} placeholder="memoryMb" /></div>
      </div>}

      {tab === 'domain' && <div className="card space-y-2 p-4">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.subdomain} onChange={(e) => setConfig({ ...config, subdomain: e.target.value })} /><input className="input" value={config.domainBase} onChange={(e) => setConfig({ ...config, domainBase: e.target.value })} /></div>
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{urlPreview}</div>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.enableSSL} onChange={(e) => setConfig({ ...config, enableSSL: e.target.checked })} />enableSSL</label>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.forceHTTPS} onChange={(e) => setConfig({ ...config, forceHTTPS: e.target.checked })} />forceHTTPS</label>
      </div>}

      {tab === 'deploy' && <div className="card space-y-2 p-4">
        <div>repo: {config.repository || '-'}</div>
        <div>branch: {config.branch || '-'}</div>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.autoDeploy} onChange={(e) => setConfig({ ...config, autoDeploy: e.target.checked })} />autoDeploy</label>
        <div className="flex gap-2">
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleBuild(config) }}>Pull latest</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRebuild(config) }}>Rebuild</button>
          <button className="btn border-emerald-500 text-emerald-300" disabled={!!actionLoading} onClick={async () => { await handleRestart(); onSaved?.() }}>{t('docker.actions.deploy', 'Deploy')}</button>
        </div>
      </div>}

      {tab === 'logs' && <div className="card p-4"><pre className="max-h-[320px] overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 text-xs">{logsOutput || 'sem logs'}</pre></div>}

      <div className="card flex flex-wrap gap-2 p-3">
        <button className="btn border-panel-accent text-panel-accent" disabled={saving || !!actionLoading} onClick={() => saveConfig(config)}>Salvar configurações</button>
      </div>
    </div>
  )
}
