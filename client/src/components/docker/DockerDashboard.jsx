import { useEffect, useState } from 'react'
import useDockerConfig from '../../hooks/useDockerConfig'

const tabs = [
  { key: 'overview', labelKey: 'docker_tab_overview', fallback: 'Visão geral' },
  { key: 'build', labelKey: 'docker_tab_build', fallback: 'Build' },
  { key: 'runtime', labelKey: 'docker_tab_runtime', fallback: 'Execução' },
  { key: 'domain', labelKey: 'docker_tab_domain', fallback: 'Domínio' },
  { key: 'logs', labelKey: 'docker_tab_logs', fallback: 'Logs' },
  { key: 'deploy', labelKey: 'docker_tab_deploy', fallback: 'Publicação' },
]

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
  if (loading || !config) return <div className="card mt-3 p-4 text-sm text-slate-300">Carregando Docker...</div>

  const urlPreview = config.subdomain && config.domainBase ? `${config.subdomain}.${config.domainBase}` : '-'
  const ipPreview = `${window.location.protocol}//${window.location.hostname}:${config.externalPort || '3000'}`
  const cmdPreview = `docker build -t deploybox-${project.slug}:latest .`

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
        Docker UI PT-BR v2
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {tabs.map((item) => (
          <button
            key={item.key}
            className={`btn text-xs ${tab === item.key ? 'border-panel-accent text-panel-accent' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {t(item.labelKey, item.fallback)}
          </button>
        ))}
      </div>

      {tab === 'overview' && <div className="card space-y-2 p-4">
        <div className="text-sm">{t('docker_status', 'Status')}: {project.status || '-'}</div>
        <div className="text-sm">{t('docker_image', 'Imagem')}: deploybox-{project.slug}:latest</div>
        <div className="text-sm">{t('docker_ports', 'Portas')}: {config.externalPort} -&gt; {config.internalPort}</div>
        <div className="text-sm">{t('docker_domain', 'Domínio')}: {urlPreview}</div>
        <div className="text-sm">{t('docker_ip', 'IP')}: {ipPreview}</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRun(); onSaved?.() }}>{t('docker_action_start', 'Iniciar')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleStop(); onSaved?.() }}>{t('docker_action_stop', 'Parar')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRestart(); onSaved?.() }}>{t('docker.actions.restart', 'Reiniciar')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRebuild(config); onSaved?.() }}>{t('docker_action_rebuild', 'Rebuild')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleLogs() }}>Logs</button>
        </div>
      </div>}

      {tab === 'build' && <div className="card space-y-2 p-4">
        <input className="input" value={config.dockerfilePath} onChange={(e) => setConfig({ ...config, dockerfilePath: e.target.value })} />
        <input className="input" value={config.buildContext} onChange={(e) => setConfig({ ...config, buildContext: e.target.value })} />
        <textarea className="input min-h-[220px] font-mono text-xs" value={config.dockerfile} onChange={(e) => setConfig({ ...config, dockerfile: e.target.value })} />
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{cmdPreview}</div>
      </div>}

      {tab === 'runtime' && <div className="card space-y-2 p-4">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.externalPort} onChange={(e) => setConfig({ ...config, externalPort: e.target.value.replace(/[^\d]/g, '') })} placeholder="Porta externa" /><input className="input" value={config.internalPort} onChange={(e) => setConfig({ ...config, internalPort: e.target.value.replace(/[^\d]/g, '') })} placeholder="Porta interna" /></div>
        <select className="input" value={config.restartPolicy} onChange={(e) => setConfig({ ...config, restartPolicy: e.target.value })}><option value="no">no</option><option value="always">always</option><option value="unless-stopped">unless-stopped</option><option value="on-failure">on-failure</option></select>
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.cpuLimit} onChange={(e) => setConfig({ ...config, cpuLimit: e.target.value })} placeholder="CPU" /><input className="input" value={config.memoryMb} onChange={(e) => setConfig({ ...config, memoryMb: e.target.value })} placeholder="Memória (MB)" /></div>
      </div>}

      {tab === 'domain' && <div className="card space-y-2 p-4">
        <div className="grid grid-cols-2 gap-2"><input className="input" value={config.subdomain} onChange={(e) => setConfig({ ...config, subdomain: e.target.value })} /><input className="input" value={config.domainBase} onChange={(e) => setConfig({ ...config, domainBase: e.target.value })} /></div>
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs">{urlPreview}</div>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.enableSSL} onChange={(e) => setConfig({ ...config, enableSSL: e.target.checked })} />SSL automático</label>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.forceHTTPS} onChange={(e) => setConfig({ ...config, forceHTTPS: e.target.checked })} />Forçar HTTPS</label>
      </div>}

      {tab === 'deploy' && <div className="card space-y-2 p-4">
        <div>Repositório: {config.repository || '-'}</div>
        <div>Branch: {config.branch || '-'}</div>
        <label className="btn flex items-center gap-2"><input type="checkbox" checked={config.autoDeploy} onChange={(e) => setConfig({ ...config, autoDeploy: e.target.checked })} />{t('docker_action_auto_deploy', 'Deploy automático')}</label>
        <div className="flex gap-2">
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleBuild(config) }}>{t('docker_action_update_code', 'Atualizar código')}</button>
          <button className="btn" disabled={!!actionLoading} onClick={async () => { await handleRebuild(config) }}>{t('docker_action_rebuild', 'Rebuild')}</button>
          <button className="btn border-emerald-500 text-emerald-300" disabled={!!actionLoading} onClick={async () => { await handleRestart(); onSaved?.() }}>{t('docker.actions.deploy', 'Publicar')}</button>
        </div>
      </div>}

      {tab === 'logs' && <div className="card p-4"><pre className="max-h-[320px] overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 text-xs">{logsOutput || t('docker_no_logs', 'Sem logs')}</pre></div>}

      <div className="card flex flex-wrap gap-2 p-3">
        <button className="btn border-panel-accent text-panel-accent" disabled={saving || !!actionLoading} onClick={() => saveConfig(config)}>{t('docker_action_save_settings', 'Salvar configurações')}</button>
      </div>
    </div>
  )
}
