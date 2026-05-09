import { useCallback, useMemo, useState } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
const notify = (message, type = 'success') => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('nodepanel:notify', { detail: { message, type } }))
}

function envRowsToMap(rows = []) {
  const out = {}
  for (const row of rows) out[row.envKey] = row.envValue
  return out
}

export default function useDockerConfig(project, authHeaders) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [logsOutput, setLogsOutput] = useState('')

  const loadConfig = useCallback(async () => {
    if (!project?.id) return null
    setLoading(true)
    try {
      const [{ data: envRows }, { data: dockerfileResp }] = await Promise.all([
        api.get(`/projects/${project.id}/env`, { headers: authHeaders }),
        api.get(`/projects/${project.id}/file`, { headers: authHeaders, params: { path: 'Dockerfile' } }).catch(() => ({ data: { content: '' } })),
      ])
      const env = envRowsToMap(envRows || [])
      const next = {
        externalPort: String(env.DOCKER_HOST_PORT || env.HOST_PORT || env.PORT || '3000'),
        internalPort: String(env.DOCKER_CONTAINER_PORT || '3000'),
        restartPolicy: String(env.DOCKER_RESTART_POLICY || 'unless-stopped'),
        cpuLimit: String(env.DOCKER_CPU_LIMIT || ''),
        memoryMb: String(env.DOCKER_MEMORY_MB || ''),
        subdomain: String(env.DOCKER_SUBDOMAIN || ''),
        domainBase: String(env.DOCKER_DOMAIN_BASE || ''),
        enableSSL: String(env.DOCKER_ENABLE_SSL || '0') === '1',
        forceHTTPS: String(env.DOCKER_FORCE_HTTPS || '0') === '1',
        autoDeploy: String(env.DOCKER_AUTO_DEPLOY || '0') === '1',
        repository: String(env.DOCKER_REPOSITORY || ''),
        branch: String(env.DOCKER_BRANCH || ''),
        subPath: String(env.DOCKER_SUB_PATH || '/'),
        dockerfilePath: String(env.DOCKER_DOCKERFILE_PATH || './Dockerfile'),
        buildContext: String(env.DOCKER_BUILD_CONTEXT || '.'),
        dockerfile: String(dockerfileResp?.content || ''),
        envs: [],
        volumes: [],
      }
      setConfig(next)
      return next
    } finally {
      setLoading(false)
    }
  }, [project?.id, authHeaders])

  const saveConfig = useCallback(async (nextConfig) => {
    if (!project?.id || !nextConfig) return
    setSaving(true)
    try {
      const envPairs = [
        ['DOCKER_HOST_PORT', String(nextConfig.externalPort || '3000')],
        ['DOCKER_CONTAINER_PORT', String(nextConfig.internalPort || '3000')],
        ['DOCKER_RESTART_POLICY', String(nextConfig.restartPolicy || 'unless-stopped')],
        ['DOCKER_CPU_LIMIT', String(nextConfig.cpuLimit || '')],
        ['DOCKER_MEMORY_MB', String(nextConfig.memoryMb || '')],
        ['DOCKER_SUBDOMAIN', String(nextConfig.subdomain || '')],
        ['DOCKER_DOMAIN_BASE', String(nextConfig.domainBase || '')],
        ['DOCKER_ENABLE_SSL', nextConfig.enableSSL ? '1' : '0'],
        ['DOCKER_FORCE_HTTPS', nextConfig.forceHTTPS ? '1' : '0'],
        ['DOCKER_AUTO_DEPLOY', nextConfig.autoDeploy ? '1' : '0'],
        ['DOCKER_REPOSITORY', String(nextConfig.repository || '')],
        ['DOCKER_BRANCH', String(nextConfig.branch || '')],
        ['DOCKER_SUB_PATH', String(nextConfig.subPath || '/')],
        ['DOCKER_DOCKERFILE_PATH', String(nextConfig.dockerfilePath || './Dockerfile')],
        ['DOCKER_BUILD_CONTEXT', String(nextConfig.buildContext || '.')],
      ]
      await Promise.all(envPairs.map(([envKey, envValue]) => api.post(`/projects/${project.id}/env`, { envKey, envValue, isSecret: false }, { headers: authHeaders, skipNotify: true })))
      if (typeof nextConfig.dockerfile === 'string' && nextConfig.dockerfile.trim()) {
        await api.put(`/projects/${project.id}/file`, { path: 'Dockerfile', content: nextConfig.dockerfile }, { headers: authHeaders, skipNotify: true })
      }
      setConfig(nextConfig)
      notify('Configurações Docker salvas.')
    } finally {
      setSaving(false)
    }
  }, [project?.id, authHeaders])

  const withAction = useCallback(async (name, fn) => {
    setActionLoading(name)
    try {
      return await fn()
    } finally {
      setActionLoading('')
    }
  }, [])

  const handleBuild = useCallback((nextConfig) => withAction('build', async () => {
    const payload = { dockerfile: String(nextConfig?.dockerfile || config?.dockerfile || ''), port: String(nextConfig?.externalPort || config?.externalPort || '3000'), containerPort: String(nextConfig?.internalPort || config?.internalPort || '3000') }
    const { data } = await api.post(`/projects/${project.id}/docker/run-dockerfile`, payload, { headers: { ...authHeaders, 'x-action-source': 'ui_docker_build' }, skipNotify: true })
    setLogsOutput(String(data?.output || 'build_ok'))
    notify('Build Docker concluído.')
    return data
  }), [project?.id, authHeaders, withAction, config])

  const handleRun = useCallback(() => withAction('run', async () => {
    const { data } = await api.post(`/projects/${project.id}/toggle`, {}, { headers: { ...authHeaders, 'x-action-source': 'ui_docker_run' }, skipNotify: true })
    notify('Projeto iniciado.')
    return data
  }), [project?.id, authHeaders, withAction])

  const handleStop = useCallback(() => withAction('stop', async () => {
    const { data } = await api.post(`/projects/${project.id}/toggle`, {}, { headers: { ...authHeaders, 'x-action-source': 'ui_docker_stop' }, skipNotify: true })
    notify('Projeto parado.')
    return data
  }), [project?.id, authHeaders, withAction])

  const handleRestart = useCallback(() => withAction('restart', async () => {
    const { data } = await api.post(`/projects/${project.id}/restart`, {}, { headers: { ...authHeaders, 'x-action-source': 'ui_docker_restart' }, skipNotify: true })
    notify('Projeto reiniciado.')
    return data
  }), [project?.id, authHeaders, withAction])

  const handleRebuild = useCallback((nextConfig) => withAction('rebuild', async () => {
    const data = await handleBuild(nextConfig)
    await api.post(`/projects/${project.id}/restart`, {}, { headers: authHeaders, skipNotify: true })
    notify('Rebuild e deploy concluídos.')
    return data
  }), [project?.id, authHeaders, handleBuild, withAction])

  const handleLogs = useCallback(() => withAction('logs', async () => {
    const { data } = await api.get(`/projects/${project.id}/logs`, { headers: authHeaders })
    const text = (data || []).slice(-100).map((l) => `[${l.level}] ${l.message}`).join('\n')
    setLogsOutput(text)
    return data
  }), [project?.id, authHeaders, withAction])

  return useMemo(() => ({
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
  }), [config, loading, saving, actionLoading, logsOutput, loadConfig, saveConfig, handleBuild, handleRun, handleStop, handleRestart, handleRebuild, handleLogs])
}
