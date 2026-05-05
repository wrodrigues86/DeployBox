import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import Editor from '@monaco-editor/react'
import { io } from 'socket.io-client'
import $ from 'jquery'
import 'jstree'
import 'jstree/dist/themes/default/style.min.css'
import './jstree-overrides.css'

const api = axios.create({ baseURL: '/api' })
const notifyUi = (message, type = 'success') => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('nodepanel:notify', { detail: { message, type } }))
}

const DEFAULT_TRANSLATIONS = {
  app_title: 'NodePanel',
  menu_dashboard: 'Dashboard',
  menu_projects: 'Projetos',
  menu_sql: 'SQL',
  menu_logs: 'Logs',
  menu_settings: 'Configurações',
  logout: 'Sair',
  logged_user_prefix: 'Usuário',
  tab_code: 'Código',
  tab_env: 'Variáveis',
  tab_db_sql: 'Banco SQL',
  tab_deps: 'Dependências',
  tab_security: 'Segurança',
  tab_logs: 'Logs',
  tab_versions: 'Versões',
  tab_monitor: 'Monitoramento',
  back_to_list: 'Voltar para lista',
  save_code: 'Salvar Código',
  settings_title: 'Configurações da Aplicação',
  settings_users_title: 'Usuários e Permissões',
  settings_menu_app: 'Configurações da Aplicação',
  settings_menu_users: 'Usuários e Permissões',
  settings_menu_translations: 'Traduções',
  settings_menu_health: 'Saúde do Sistema',
  settings_scope_hint: 'Essas configurações são do NodePanel (globais), não do projeto selecionado.',
  settings_base_url_label: 'URL base da API principal',
  settings_default_rate_limit_label: 'Rate limit padrão para novos projetos',
  settings_refresh_sec_label: 'Intervalo padrão de refresh (segundos)',
  settings_system_version_label: 'Versão do sistema',
  settings_stop_all: 'Parar todos projetos',
  settings_start_all: 'Iniciar todos projetos',
  settings_restore_initial: 'Restaurar sistema',
  settings_restore_initial_confirm: 'Isso vai apagar projetos, usuários e configurações. Continuar?',
  settings_restore_initial_done: 'Sistema restaurado. Refaça o setup inicial.',
  settings_save_button: 'Salvar Configurações',
  settings_saved_ok: 'Configurações globais salvas.',
  settings_health_title: 'Saúde do Sistema',
  settings_health_hint: 'Verificação global do backend da aplicação.',
  settings_health_test: 'Testar /api/health',
  settings_health_none: 'Nenhum teste executado.',
  settings_health_online_prefix: 'Backend online',
  settings_health_fail_prefix: 'Falha healthcheck',
  settings_translations_title: 'Traduções',
  settings_translations_hint: 'Edite o JSON em /translations/pt-BR.json (somente full_admin).',
  settings_translations_save: 'Salvar Traduções',
  settings_translations_locale_label: 'Idioma/Locale',
  settings_translations_new_locale_placeholder: 'novo locale ex: en-US',
  settings_translations_create_locale: 'Criar locale',
  settings_translations_create_locale_success: 'Locale criado com sucesso.',
  settings_translations_create_locale_error: 'Falha ao criar locale.',
  settings_translations_admin_only: 'Apenas usuário full_admin pode editar traduções.',
  settings_translations_new_title: 'Criar nova tradução',
  settings_translations_key_placeholder: 'chave_exemplo',
  settings_translations_value_placeholder: 'Texto da tradução',
  settings_translations_add: 'Adicionar',
  settings_translations_key_required: 'Informe a chave da tradução',
  settings_translations_invalid_current_json: 'JSON atual inválido. Corrija antes de adicionar nova tradução.',
  settings_translations_saved_ok: 'Traduções salvas com sucesso.',
  settings_translations_invalid_json_error: 'JSON inválido para traduções',
  settings_translations_protected_error: 'Não é permitido excluir traduções ativas do sistema.',
  settings_users_admin_only: 'Apenas usuário full_admin pode gerenciar usuários.',
  settings_users_list_title: 'Lista de usuários',
  settings_users_search_placeholder: 'Buscar por nome ou e-mail',
  settings_users_none: 'Nenhum usuário cadastrado.',
  settings_users_new: 'Novo usuário',
  settings_users_edit: 'Edição de usuário',
  settings_users_delete_confirm_prefix: 'Excluir usuário',
  settings_users_save_failed: 'Falha ao salvar usuário',
  settings_users_delete_failed: 'Falha ao excluir usuário',
  settings_users_status_active: 'ativo',
  settings_users_status_inactive: 'inativo',
  settings_users_projects_label: 'projetos',
  settings_users_back_to_list: 'Voltar para lista',
  settings_users_storage_limit_label: 'Limite de armazenamento (MB)',
  settings_users_storage_limit_hint: 'Deixe vazio para ilimitado.',
  settings_users_storage_limit_display: 'limite',
  action_open_url: 'Abrir URL',
  action_execute_test: 'Executar Teste',
  action_clone_git: 'Clonar Git',
  clone_git_title: 'Clonar Repositório Git',
  clone_git_repo_placeholder: 'https://github.com/owner/repo.git',
  clone_git_repo_select_placeholder: 'Selecione um repositório conectado',
  clone_git_token_placeholder: 'Token GitHub (opcional para repositório público)',
  clone_git_show_manual_token: 'Usar token manual',
  clone_git_hide_manual_token: 'Ocultar token manual',
  clone_git_connect: 'Conectar GitHub',
  clone_git_connecting: 'Abrindo login GitHub...',
  clone_git_connected: 'GitHub conectado com sucesso.',
  clone_git_connect_failed: 'Falha ao conectar com GitHub',
  clone_git_popup_blocked: 'O navegador bloqueou o popup de login do GitHub.',
  clone_git_save_token: 'Salvar token',
  clone_git_clear_token: 'Remover token salvo',
  clone_git_token_saved: 'Token salvo neste navegador.',
  clone_git_token_not_saved: 'Token não salvo.',
  clone_git_connect_hint: 'Clique em Conectar, faça login no GitHub e o token volta automaticamente para esta tela.',
  clone_git_branch_placeholder: 'Selecione uma branch',
  clone_git_hint: 'Informe a URL do repositório, use token apenas para repositório privado, escolha a branch e clone para este projeto.',
  clone_git_login: 'Listar branches',
  clone_git_loading_branches: 'Carregando branches...',
  clone_git_loading_repos: 'Carregando repositórios...',
  clone_git_repos_error: 'Falha ao listar repositórios',
  clone_git_no_repos: 'Nenhum repositório encontrado na conta conectada',
  clone_git_branch_required: 'Selecione uma branch',
  clone_git_no_branches: 'Nenhuma branch encontrada',
  clone_git_submit: 'Clonar Repositório',
  clone_git_submitting: 'Clonando...',
  clone_git_repo_required: 'Informe a URL do repositório Git',
  clone_git_branches_error: 'Falha ao listar branches',
  clone_git_error: 'Falha no clone Git',
  explorer_new_folder: 'Nova Pasta',
  explorer_new_file: 'Novo Arquivo',
  explorer_prompt_folder: 'Nome/caminho da nova pasta (ex: src/utils)',
  explorer_prompt_file: 'Nome/caminho do novo arquivo (ex: src/utils/helper.js)',
  explorer_create_folder_error: 'Falha ao criar pasta',
  explorer_create_file_error: 'Falha ao criar arquivo',
  setup_loading: 'Preparando instalação inicial...',
  setup_title: 'Assistente de primeiro acesso. Siga os passos para concluir a instalação.',
  setup_step: 'Passo',
  setup_intro: 'Este wizard configura o administrador inicial da plataforma.',
  action_next: 'Próximo',
  action_back: 'Voltar',
  setup_admin_name_placeholder: 'Nome do admin',
  setup_admin_email_placeholder: 'E-mail do admin',
  setup_admin_password_placeholder: 'Senha do admin',
  setup_admin_password_confirm_placeholder: 'Confirmar senha',
  setup_admin_label: 'Administrador',
  setup_email_label: 'E-mail',
  setup_installing: 'Instalando...',
  setup_finish: 'Concluir Instalação',
  setup_success: 'Instalação concluída. Faça login para continuar.',
  setup_error_required: 'Preencha nome, e-mail e senha do administrador.',
  setup_error_password_mismatch: 'A confirmação da senha não confere.',
  setup_error_failed: 'Falha na instalação inicial.',
  logs_all_projects: 'Todos os projetos',
  logs_clear: 'Limpar Logs',
  login_subtitle: 'Painel administrativo para múltiplos projetos Node.js.',
  label_email: 'E-mail',
  label_password: 'Senha',
  action_login: 'Entrar',
  error_login_failed: 'Falha no login',
  dashboard_summary_title: 'Resumo do ambiente',
  projects_list_title: 'Lista de projetos',
  action_create_new: 'Criar novo',
  action_refresh: 'Atualizar',
  projects_search_placeholder: 'Buscar por nome, slug ou descrição',
  label_total: 'Total',
  action_open: 'Abrir',
  action_pause: 'Pausar',
  action_activate: 'Ativar',
  action_delete: 'Excluir',
  projects_none_found: 'Nenhum projeto encontrado.',
  projects_create_title: 'Criar novo projeto',
  action_close: 'Fechar',
  label_name: 'Nome',
  label_description: 'Descrição',
  action_creating: 'Criando...',
  action_create_project: 'Criar projeto',
  action_select_zip: 'Selecionar ZIP',
  action_uploading_zip: 'Enviando ZIP...',
  action_upload_zip: 'Subir ZIP',
  action_help_zip: 'Help ZIP',
  label_theme: 'Tema',
  action_exit_fullscreen: 'Sair Fullscreen',
  action_fullscreen: 'Fullscreen',
  error_invalid_json: 'JSON inválido',
  action_run_now: 'Executar Agora',
  action_save_cron: 'Salvar Cron',
  zip_help_title: 'Como subir projeto ZIP',
  action_run_sql: 'Executar SQL',
  action_install: 'Instalar',
  action_save: 'Salvar',
  logs_autoscroll_on: 'Auto scroll ON',
  logs_autoscroll_off: 'Auto scroll OFF',
  action_clear: 'Limpar',
  action_download_log: 'Baixar log',
  action_view: 'Visualizar',
  action_restore: 'Restaurar',
  action_compare: 'Comparar',
  action_restart: 'Reiniciar',
}

const sidebarItems = [
  { key: 'Dashboard', labelKey: 'menu_dashboard', fallback: 'Dashboard', icon: 'DB' },
  { key: 'Projetos', labelKey: 'menu_projects', fallback: 'Projetos', icon: 'PR' },
  { key: 'SQL', labelKey: 'menu_sql', fallback: 'SQL', icon: 'SQ' },
  { key: 'Logs', labelKey: 'menu_logs', fallback: 'Logs', icon: 'LG' },
  { key: 'Configuracoes', labelKey: 'menu_settings', fallback: 'Configurações', icon: 'CF' },
]
const defaultTabBySection = {
  Dashboard: null,
  Projetos: 'Código',
  SQL: null,
  Logs: null,
  Configuracoes: null,
}
const settingsSidebarSubmenus = [
  { key: 'app', labelKey: 'settings_menu_app', fallback: 'Configurações da Aplicação' },
  { key: 'users', labelKey: 'settings_menu_users', fallback: 'Usuários e Permissões' },
  { key: 'translations', labelKey: 'settings_menu_translations', fallback: 'Traduções' },
  { key: 'health', labelKey: 'settings_menu_health', fallback: 'Saúde do Sistema' },
]

function cronPresetToExpr(preset, time, custom) {
  if (preset === 'custom') return custom
  if (preset === 'every_minute') return '* * * * *'
  if (preset === 'every_5_minutes') return '*/5 * * * *'
  if (preset === 'every_hour') return '0 * * * *'
  const [h, m] = (time || '00:00').split(':')
  if (preset === 'daily') return `${Number(m)} ${Number(h)} * * *`
  if (preset === 'monday') return `${Number(m)} ${Number(h)} * * 1`
  return ''
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('nodepanel_token') || '')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(localStorage.getItem('nodepanel_sidebar_collapsed') === '1')
  const [section, setSection] = useState('Dashboard')
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [projectDetailOpen, setProjectDetailOpen] = useState(false)
  const [tab, setTab] = useState('Código')
  const [settingsSubmenu, setSettingsSubmenu] = useState('app')
  const [me, setMe] = useState(null)
  const [translations, setTranslations] = useState(DEFAULT_TRANSLATIONS)
  const [translationLocales, setTranslationLocales] = useState(['pt-BR'])
  const [translationLocale, setTranslationLocale] = useState(localStorage.getItem('nodepanel_translation_locale') || 'pt-BR')
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notices, setNotices] = useState([])

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const isProjectOnlyUser = !!me?.role && me.role !== 'full_admin'
  const currentSection = isProjectOnlyUser ? 'Projetos' : section
  const visibleSidebarItems = useMemo(
    () => (isProjectOnlyUser ? sidebarItems.filter((item) => item.key === 'Projetos') : sidebarItems),
    [isProjectOnlyUser],
  )

  const t = (key, fallback) => translations?.[key] ?? fallback ?? key

  async function refreshProjects(selectId) {
    const { data } = await api.get('/projects', { headers: authHeaders })
    setProjects(data)
    if (!selected || selectId) {
      const found = data.find((p) => p.id === selectId) || data[0] || null
      setSelected(found)
    } else {
      setSelected(data.find((p) => p.id === selected.id) || null)
    }
  }

  async function refreshDashboard() {
    const { data } = await api.get('/dashboard/stats', { headers: authHeaders })
    setDashboard(data)
  }

  async function loadTranslations(locale) {
    const safeLocale = locale || 'pt-BR'
    const { data } = await api.get('/translations', { headers: authHeaders, params: { locale: safeLocale } })
    setTranslations({ ...DEFAULT_TRANSLATIONS, ...(data?.translations || {}) })
    setTranslationLocale(data?.locale || safeLocale)
    localStorage.setItem('nodepanel_translation_locale', data?.locale || safeLocale)
  }

  async function refreshTranslationLocales() {
    const { data } = await api.get('/translations/locales', { headers: authHeaders })
    const list = Array.isArray(data?.locales) && data.locales.length ? data.locales : ['pt-BR']
    setTranslationLocales(list)
    return list
  }

  useEffect(() => {
    if (!token) return
    api.get('/me', { headers: authHeaders }).then((r) => setMe(r.data)).catch(() => setToken(''))
    refreshTranslationLocales()
      .then((list) => {
        const preferred = localStorage.getItem('nodepanel_translation_locale') || translationLocale || 'pt-BR'
        const nextLocale = list.includes(preferred) ? preferred : (list[0] || 'pt-BR')
        return loadTranslations(nextLocale)
      })
      .catch(() => loadTranslations('pt-BR').catch(() => {}))
    refreshProjects().catch(() => setToken(''))
    refreshDashboard().catch(() => {})
    const i = setInterval(() => refreshDashboard().catch(() => {}), 5000)
    return () => clearInterval(i)
  }, [token])

  useEffect(() => {
    localStorage.setItem('nodepanel_sidebar_collapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    function onNotify(event) {
      const message = event?.detail?.message
      const type = event?.detail?.type || 'success'
      if (!message) return
      const id = `${Date.now()}-${Math.random()}`
      setNotices((prev) => [...prev, { id, message, type }].slice(-5))
      setTimeout(() => {
        setNotices((prev) => prev.filter((n) => n.id !== id))
      }, 4200)
    }
    window.addEventListener('nodepanel:notify', onNotify)
    return () => window.removeEventListener('nodepanel:notify', onNotify)
  }, [])

  useEffect(() => {
    const responseInterceptor = api.interceptors.response.use(
      (response) => {
        const method = String(response?.config?.method || '').toLowerCase()
        const url = String(response?.config?.url || '')
        const skip = !!response?.config?.skipNotify
        const isMutation = ['post', 'put', 'patch', 'delete'].includes(method)
        if (isMutation && !skip && !url.includes('/login')) {
          const fromApi = typeof response?.data?.message === 'string' ? response.data.message : ''
          notifyUi(fromApi || 'Alteração salva com sucesso.', 'success')
        }
        return response
      },
      (error) => {
        const method = String(error?.config?.method || '').toLowerCase()
        const url = String(error?.config?.url || '')
        const skip = !!error?.config?.skipNotify
        const isMutation = ['post', 'put', 'patch', 'delete'].includes(method)
        if (isMutation && !skip && !url.includes('/login')) {
          const message = error?.response?.data?.error || error?.message || 'Falha ao salvar alteração.'
          notifyUi(message, 'error')
        }
        return Promise.reject(error)
      },
    )
    return () => api.interceptors.response.eject(responseInterceptor)
  }, [])

  const visibleProjects = useMemo(() => projects, [projects])

  useEffect(() => {
    if (!visibleProjects.length) {
      setSelected(null)
      return
    }
    if (!selected) {
      setSelected(visibleProjects[0])
      return
    }
    const exists = visibleProjects.some((p) => p.id === selected.id)
    if (!exists) setSelected(visibleProjects[0])
  }, [visibleProjects, selected])

  useEffect(() => {
    if (!isProjectOnlyUser) return
    if (section !== 'Projetos') setSection('Projetos')
  }, [isProjectOnlyUser, section])

  function handleSection(nextSection) {
    if (isProjectOnlyUser && nextSection !== 'Projetos') return
    setSection(nextSection)
    if (nextSection === 'Projetos') {
      setProjectDetailOpen(false)
    }
    const nextTab = defaultTabBySection[nextSection]
    if (nextTab) setTab(nextTab)
  }

  if (!token) {
    return <Login t={t} onLogin={(t) => {
      localStorage.setItem('nodepanel_token', t)
      setToken(t)
    }} />
  }

  return (
    <div className="flex min-h-screen bg-panel-bg text-panel-text">
      <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} sticky top-0 h-screen shrink-0 overflow-y-auto border-r border-panel-border bg-slate-950/20 p-3 transition-all duration-200`}>
        <div className="mb-4 flex items-center justify-between">
          {!sidebarCollapsed ? (
            <div>
              <div className="text-2xl font-bold text-panel-accent">{t('app_title', 'NodePanel')}</div>
              <div className="text-xs text-slate-400">Admin Console</div>
              {me?.name && <div className="mt-1 text-xs text-slate-300">{t('logged_user_prefix', 'Usuário')}: {me.name}</div>}
            </div>
          ) : (
            <div className="rounded-md border border-panel-border px-2 py-1 text-xs font-semibold text-panel-accent">NP</div>
          )}
          <button className="btn px-2 py-1" onClick={() => setSidebarCollapsed((v) => !v)} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>
            {sidebarCollapsed ? '>' : '<'}
          </button>
        </div>
        <div className="space-y-2">
          {visibleSidebarItems.map((item) => {
            if (item.key !== 'Configuracoes') {
              return (
                <button
                  key={item.key}
                  className={`w-full rounded-lg border px-2 py-2 transition ${currentSection === item.key ? 'border-panel-accent bg-panel-accent/10 text-panel-accent' : 'border-panel-border hover:border-panel-accent/60'} ${sidebarCollapsed ? 'text-center' : 'text-left'}`}
                  onClick={() => handleSection(item.key)}
                  title={t(item.labelKey, item.fallback)}
                >
                  <span className={`inline-flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
                    <span className="inline-flex h-6 w-8 items-center justify-center rounded border border-panel-border bg-slate-900 text-[11px] font-semibold">
                      {item.icon}
                    </span>
                {!sidebarCollapsed && <span className="text-sm">{t(item.labelKey, item.fallback)}</span>}
              </span>
            </button>
          )
        }

            return (
              <div key={item.key} className="space-y-2">
                <button
                  className={`w-full rounded-lg border px-2 py-2 transition ${currentSection === item.key ? 'border-panel-accent bg-panel-accent/10 text-panel-accent' : 'border-panel-border hover:border-panel-accent/60'} ${sidebarCollapsed ? 'text-center' : 'text-left'}`}
                  onClick={() => handleSection(item.key)}
                  title={t(item.labelKey, item.fallback)}
                >
                  <span className={`inline-flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
                    <span className="inline-flex h-6 w-8 items-center justify-center rounded border border-panel-border bg-slate-900 text-[11px] font-semibold">
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && <span className="text-sm">{t(item.labelKey, item.fallback)}</span>}
                  </span>
                </button>
                {currentSection === 'Configuracoes' && (
                  <div className={`space-y-1 ${sidebarCollapsed ? '' : 'pl-3'}`}>
                    {settingsSidebarSubmenus.map((sub) => (
                      <button
                        key={sub.key}
                        className={`w-full rounded-md border px-2 py-1.5 text-xs transition ${settingsSubmenu === sub.key ? 'border-panel-accent text-panel-accent' : 'border-panel-border text-slate-300 hover:border-slate-500'} ${sidebarCollapsed ? 'text-center' : 'text-left'}`}
                        onClick={() => {
                          setSection('Configuracoes')
                          setSettingsSubmenu(sub.key)
                        }}
                        title={t(sub.labelKey, sub.fallback)}
                      >
                        {sidebarCollapsed ? (t(sub.labelKey, sub.fallback).charAt(0) || '>') : `> ${t(sub.labelKey, sub.fallback)}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button
          className={`mt-6 w-full rounded-lg border border-red-500/70 px-2 py-2 text-red-300 transition hover:border-red-400 ${sidebarCollapsed ? 'text-center' : 'text-left'}`}
          onClick={() => {
            localStorage.removeItem('nodepanel_token')
            setToken('')
          }}
          title="Sair"
        >
          <span className={`inline-flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
            <span className="inline-flex h-6 w-8 items-center justify-center rounded border border-red-500/40 bg-red-950/30 text-[11px] font-semibold">EX</span>
            {!sidebarCollapsed && <span className="text-sm">{t('logout', 'Sair')}</span>}
          </span>
        </button>
      </aside>

      <main className="flex-1 p-5 lg:p-8">
        {!!notices.length && (
          <div className="fixed right-4 top-4 z-50 space-y-2">
            {notices.map((n) => (
              <div
                key={n.id}
                className={`min-w-[260px] max-w-[420px] rounded-lg border px-3 py-2 text-sm shadow-lg ${n.type === 'error' ? 'border-red-500/70 bg-red-950/80 text-red-100' : 'border-emerald-500/70 bg-emerald-950/80 text-emerald-100'}`}
              >
                {n.message}
              </div>
            ))}
          </div>
        )}
        {currentSection === 'Dashboard' && <TopCards dashboard={dashboard} />}

        {currentSection === 'Dashboard' ? (
          <DashboardSection dashboard={dashboard} projects={projects} t={t} />
        ) : currentSection === 'Configuracoes' ? (
          <AppSettingsSection
            authHeaders={authHeaders}
            projects={projects}
            me={me}
            t={t}
            activeSettingsTab={settingsSubmenu}
            translations={translations}
            translationLocale={translationLocale}
            translationLocales={translationLocales}
            onChangeTranslationLocale={async (locale) => {
              await loadTranslations(locale)
              await refreshTranslationLocales()
            }}
            onTranslationsUpdated={(next) => setTranslations({ ...DEFAULT_TRANSLATIONS, ...(next || {}) })}
            onRefreshProjects={() => refreshProjects()}
          />
        ) : currentSection === 'SQL' ? (
          <AppSqlSection authHeaders={authHeaders} t={t} />
        ) : currentSection === 'Logs' ? (
          <AppLogsSection authHeaders={authHeaders} projects={projects} t={t} />
        ) : (
          <div className="mt-6 space-y-5">
            {!projectDetailOpen ? (
              <ProjectList
                projects={visibleProjects}
                selected={selected}
                loading={loading}
                t={t}
                onSelect={(project) => {
                  setSelected(project)
                  setTab('Código')
                  setProjectDetailOpen(true)
                }}
                onRefresh={() => refreshProjects()}
                onCreate={async (payload) => {
                  setLoading(true)
                  try {
                    await api.post('/projects', payload, { headers: authHeaders })
                    await refreshProjects()
                  } finally {
                    setLoading(false)
                  }
                }}
                onToggle={async (project) => {
                  await api.post(`/projects/${project.id}/toggle`, {}, { headers: authHeaders })
                  await refreshProjects(project.id)
                }}
                onDelete={async (project) => {
                  if (!confirm(`Excluir ${project.name}?`)) return
                  await api.delete(`/projects/${project.id}`, { headers: authHeaders })
                  await refreshProjects()
                }}
              />
            ) : (
              <div className="card p-5 lg:p-6">
                {!selected ? (
                  <div className="rounded-lg border border-panel-border bg-slate-950/20 p-6">Projeto não encontrado. Volte para a lista.</div>
                ) : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-panel-border pb-3">
                      <div>
                        <div className="text-lg font-semibold">{selected.name}</div>
                        <div className="text-xs text-slate-400">/{selected.slug} • {selected.type}</div>
                      </div>
                      <button className="btn" onClick={() => setProjectDetailOpen(false)}>{t('back_to_list', 'Voltar para lista')}</button>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2 border-b border-panel-border pb-3">
                      {[
                        { key: 'Código', label: t('tab_code', 'Código') },
                        { key: 'Variáveis', label: t('tab_env', 'Variáveis') },
                        { key: 'Banco SQL', label: t('tab_db_sql', 'Banco SQL') },
                        { key: 'Dependências', label: t('tab_deps', 'Dependências') },
                        { key: 'Segurança', label: t('tab_security', 'Segurança') },
                        { key: 'Logs', label: t('tab_logs', 'Logs') },
                        { key: 'Versões', label: t('tab_versions', 'Versões') },
                        { key: 'Monitoramento', label: t('tab_monitor', 'Monitoramento') },
                      ].map((item) => (
                        <button key={item.key} className={`btn ${tab === item.key ? 'border-panel-accent text-panel-accent' : ''}`} onClick={() => setTab(item.key)}>
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {tab === 'Código' && <CodeTab t={t} project={selected} authHeaders={authHeaders} onSaved={() => refreshProjects(selected.id)} />}
                    {tab === 'Variáveis' && <EnvTab t={t} project={selected} authHeaders={authHeaders} />}
                    {tab === 'Banco SQL' && <SqlTab t={t} project={selected} authHeaders={authHeaders} />}
                    {tab === 'Dependências' && <DepsTab t={t} project={selected} authHeaders={authHeaders} />}
                    {tab === 'Segurança' && <SecurityTab t={t} project={selected} authHeaders={authHeaders} onSaved={() => refreshProjects(selected.id)} />}
                    {tab === 'Logs' && <LogsTab t={t} project={selected} authHeaders={authHeaders} />}
                    {tab === 'Versões' && <VersionsTab t={t} project={selected} authHeaders={authHeaders} onRestored={() => refreshProjects(selected.id)} />}
                    {tab === 'Monitoramento' && <MonitorTab t={t} project={selected} authHeaders={authHeaders} onRefreshProject={() => refreshProjects(selected.id)} />}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function DashboardSection({ dashboard, projects, t }) {
  const dashboardProjects = Array.isArray(dashboard?.projects) && dashboard.projects.length ? dashboard.projects : projects
  return (
    <div className="mt-4 card p-4">
      <h2 className="mb-4 text-lg font-semibold">{t('dashboard_summary_title', 'Resumo do ambiente')}</h2>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-panel-border text-left text-slate-400">
              <th className="py-2">Projeto</th>
              <th>Slug</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Ativo</th>
              <th>Tamanho</th>
            </tr>
          </thead>
          <tbody>
            {dashboardProjects.map((p) => (
              <tr key={p.id} className="border-b border-panel-border/60">
                <td className="py-2">{p.name}</td>
                <td>/{p.slug}</td>
                <td>{p.type}</td>
                <td>{p.status}</td>
                <td>{p.active ? 'sim' : 'não'}</td>
                <td>{typeof p.sizeMB === 'number' ? `${p.sizeMB.toFixed(2)} MB` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-slate-400">
        CPU: {dashboard?.cpu ?? 0}% | RAM: {dashboard?.memoryMB ?? 0} MB | Uptime: {dashboard?.uptimeSec ?? 0}s | Armazenamento: {dashboard?.totalProjectsSizeMB ?? 0} MB
      </div>
    </div>
  )
}

function AppSettingsSection({ authHeaders, projects, me, t, activeSettingsTab, translations, translationLocale, translationLocales, onChangeTranslationLocale, onTranslationsUpdated, onRefreshProjects }) {
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('nodepanel_app_base_url') || window.location.origin)
  const [defaultRateLimit, setDefaultRateLimit] = useState(localStorage.getItem('nodepanel_default_rate_limit') || '120')
  const [autoRefreshSec, setAutoRefreshSec] = useState(localStorage.getItem('nodepanel_refresh_sec') || '5')
  const [systemVersion, setSystemVersion] = useState('1.0.0')
  const [healthStatus, setHealthStatus] = useState('')
  const [translationJson, setTranslationJson] = useState(JSON.stringify(translations || {}, null, 2))
  const [newTranslationKey, setNewTranslationKey] = useState('')
  const [newTranslationValue, setNewTranslationValue] = useState('')
  const [newLocale, setNewLocale] = useState('')
  const [users, setUsers] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [userDetailOpen, setUserDetailOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'project_user', active: true, projectIds: [], storageLimitMB: '' })

  async function save() {
    localStorage.setItem('nodepanel_app_base_url', baseUrl)
    localStorage.setItem('nodepanel_default_rate_limit', String(defaultRateLimit))
    localStorage.setItem('nodepanel_refresh_sec', String(autoRefreshSec))
    setHealthStatus(t('settings_saved_ok', 'Configurações globais salvas.'))
    notifyUi(t('settings_saved_ok', 'Configurações globais salvas.'), 'success')
  }

  async function loadUsers() {
    if (me?.role !== 'full_admin') return
    const { data } = await api.get('/users', { headers: authHeaders })
    setUsers(data)
  }

  useEffect(() => {
    loadUsers().catch(() => {})
  }, [me?.role])

  useEffect(() => {
    api.get('/settings', { headers: authHeaders })
      .then(({ data }) => {
        setSystemVersion(String(data?.system_version || '1.0.0'))
      })
      .catch(() => {})
  }, [authHeaders])

  useEffect(() => {
    setTranslationJson(JSON.stringify(translations || {}, null, 2))
  }, [translations])

  function resetUserForm() {
    setEditingId(null)
    setUserDetailOpen(false)
    setUserForm({ name: '', email: '', password: '', role: 'project_user', active: true, projectIds: [], storageLimitMB: '' })
  }

  return (
    <div className="mt-4 space-y-4">
        {activeSettingsTab === 'app' && (
          <div className="card p-4">
            <h2 className="mb-3 text-lg font-semibold">{t('settings_title', 'Configurações da Aplicação')}</h2>
            <p className="mb-4 text-sm text-slate-400">
              {t('settings_scope_hint', 'Essas configurações são do NodePanel (globais), não do projeto selecionado.')}
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_base_url_label', 'URL base da API principal')}</label>
                <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_default_rate_limit_label', 'Rate limit padrão para novos projetos')}</label>
                <input className="input" type="number" value={defaultRateLimit} onChange={(e) => setDefaultRateLimit(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_refresh_sec_label', 'Intervalo padrão de refresh (segundos)')}</label>
                <input className="input" type="number" value={autoRefreshSec} onChange={(e) => setAutoRefreshSec(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_system_version_label', 'Versão do sistema')}</label>
                <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                  {systemVersion || '1.0.0'}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  className="btn border-amber-500 text-amber-300"
                  onClick={async () => {
                    try {
                      await api.post('/projects/stop-all', {}, { headers: authHeaders })
                      await onRefreshProjects?.()
                      setHealthStatus('Todos os projetos foram parados.')
                    } catch (err) {
                      setHealthStatus(err?.response?.data?.error || 'Falha ao parar todos.')
                    }
                  }}
                >
                  {t('settings_stop_all', 'Parar todos projetos')}
                </button>
                <button
                  className="btn border-emerald-500 text-emerald-300"
                  onClick={async () => {
                    try {
                      await api.post('/projects/start-all', {}, { headers: authHeaders })
                      await onRefreshProjects?.()
                      setHealthStatus('Todos os projetos foram iniciados.')
                    } catch (err) {
                      setHealthStatus(err?.response?.data?.error || 'Falha ao iniciar todos.')
                    }
                  }}
                >
                  {t('settings_start_all', 'Iniciar todos projetos')}
                </button>
              </div>
              <button
                className="btn border-red-500 text-red-300 hover:border-red-400"
                onClick={async () => {
                  if (!confirm(t('settings_restore_initial_confirm', 'Isso vai apagar projetos, usuários e configurações. Continuar?'))) return
                  try {
                    await api.post('/system/restore-initial', {}, { headers: authHeaders })
                    localStorage.removeItem('nodepanel_token')
                    notifyUi(t('settings_restore_initial_done', 'Sistema restaurado. Refaça o setup inicial.'), 'success')
                    window.location.reload()
                  } catch (err) {
                    setHealthStatus(err?.response?.data?.error || 'Falha ao restaurar sistema.')
                  }
                }}
              >
                {t('settings_restore_initial', 'Restaurar sistema')}
              </button>
              <button className="btn border-panel-accent text-panel-accent" onClick={save}>{t('settings_save_button', 'Salvar Configurações')}</button>
            </div>
          </div>
        )}

        {activeSettingsTab === 'health' && (
          <div className="card p-4">
            <h3 className="mb-3 text-lg font-semibold">{t('settings_health_title', 'Saúde do Sistema')}</h3>
            <p className="mb-4 text-sm text-slate-400">{t('settings_health_hint', 'Verificação global do backend da aplicação.')}</p>
            <button
              className="btn"
              onClick={async () => {
                try {
                  const { data } = await api.get('/health')
                  setHealthStatus(`${t('settings_health_online_prefix', 'Backend online')}: ${JSON.stringify(data)}`)
                } catch (err) {
                  setHealthStatus(`${t('settings_health_fail_prefix', 'Falha healthcheck')}: ${err?.message || 'erro'}`)
                }
              }}
            >
              {t('settings_health_test', 'Testar /api/health')}
            </button>
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 text-xs">
              {healthStatus || t('settings_health_none', 'Nenhum teste executado.')}
            </pre>
          </div>
        )}

        {activeSettingsTab === 'translations' && (
          <div className="card p-4">
            <h3 className="mb-3 text-lg font-semibold">{t('settings_translations_title', 'Traduções')}</h3>
            <p className="mb-3 text-sm text-slate-400">{t('settings_translations_hint', 'Edite o JSON de textos da aplicação (somente full_admin).')}</p>
            <div className="mb-3 grid gap-2 md:grid-cols-[220px,1fr,140px]">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_translations_locale_label', 'Idioma/Locale')}</label>
                <select
                  className="input"
                  value={translationLocale || 'pt-BR'}
                  onChange={async (e) => {
                    await onChangeTranslationLocale?.(e.target.value)
                  }}
                >
                  {(translationLocales || ['pt-BR']).map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t('settings_translations_create_locale', 'Criar locale')}</label>
                <input
                  className="input"
                  placeholder={t('settings_translations_new_locale_placeholder', 'novo locale ex: en-US')}
                  value={newLocale}
                  onChange={(e) => setNewLocale(e.target.value)}
                />
              </div>
              <button
                className="btn self-end"
                onClick={async () => {
                  const locale = newLocale.trim()
                  if (!locale) return
                  try {
                    await api.post('/translations/locales', { locale }, { headers: authHeaders })
                    await onChangeTranslationLocale?.(locale)
                    setNewLocale('')
                    notifyUi(t('settings_translations_create_locale_success', 'Locale criado com sucesso.'), 'success')
                  } catch (err) {
                    notifyUi(err?.response?.data?.error || t('settings_translations_create_locale_error', 'Falha ao criar locale.'), 'error')
                  }
                }}
              >
                {t('settings_translations_create_locale', 'Criar locale')}
              </button>
            </div>
            {me?.role !== 'full_admin' ? (
              <div className="rounded-lg border border-panel-border bg-slate-950/40 p-3 text-sm text-slate-300">
                {t('settings_translations_admin_only', 'Apenas usuário full_admin pode editar traduções.')}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-panel-border bg-slate-950/30 p-3">
                  <div className="mb-2 text-xs text-slate-300">{t('settings_translations_new_title', 'Criar nova tradução')}</div>
                  <div className="grid gap-2 md:grid-cols-[1fr,1fr,160px]">
                    <input
                      className="input"
                      placeholder={t('settings_translations_key_placeholder', 'chave_exemplo')}
                      value={newTranslationKey}
                      onChange={(e) => setNewTranslationKey(e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder={t('settings_translations_value_placeholder', 'Texto da tradução')}
                      value={newTranslationValue}
                      onChange={(e) => setNewTranslationValue(e.target.value)}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        const key = newTranslationKey.trim()
                        if (!key) {
                          notifyUi(t('settings_translations_key_required', 'Informe a chave da tradução'), 'error')
                          return
                        }
                        try {
                          const parsed = JSON.parse(translationJson || '{}')
                          parsed[key] = newTranslationValue
                          setTranslationJson(JSON.stringify(parsed, null, 2))
                          setNewTranslationKey('')
                          setNewTranslationValue('')
                        } catch {
                          notifyUi(t('settings_translations_invalid_current_json', 'JSON atual inválido. Corrija antes de adicionar nova tradução.'), 'error')
                        }
                      }}
                    >
                      {t('settings_translations_add', 'Adicionar')}
                    </button>
                  </div>
                </div>
                <textarea
                  className="input min-h-[220px] font-mono text-xs"
                  value={translationJson}
                  onChange={(e) => setTranslationJson(e.target.value)}
                />
                <button
                  className="btn border-panel-accent text-panel-accent"
                  onClick={async () => {
                    try {
                      const parsed = JSON.parse(translationJson || '{}')
                      const protectedKeys = Object.keys(DEFAULT_TRANSLATIONS)
                      const removedProtected = protectedKeys.filter((k) => !(k in parsed))
                      if (removedProtected.length) {
                        notifyUi(t('settings_translations_protected_error', 'Não é permitido excluir traduções ativas do sistema.'), 'error')
                        return
                      }
                      const { data } = await api.put('/translations', { locale: translationLocale, translations: parsed }, { headers: authHeaders })
                      onTranslationsUpdated?.(data.translations || parsed)
                      await onChangeTranslationLocale?.(data.locale || translationLocale || 'pt-BR')
                      setHealthStatus(t('settings_translations_saved_ok', 'Traduções salvas com sucesso.'))
                    } catch (err) {
                      notifyUi(err?.response?.data?.error || t('settings_translations_invalid_json_error', 'JSON inválido para traduções'), 'error')
                    }
                  }}
                >
                  {t('settings_translations_save', 'Salvar Traduções')}
                </button>
              </div>
            )}
          </div>
        )}

        {activeSettingsTab === 'users' && (
          <>
            {me?.role !== 'full_admin' ? (
              <div className="card p-4">
                <h3 className="mb-3 text-lg font-semibold">{t('settings_users_title', 'Usuários e Permissões')}</h3>
                <div className="rounded-lg border border-panel-border bg-slate-950/40 p-3 text-sm text-slate-300">
                  {t('settings_users_admin_only', 'Apenas usuário full_admin pode gerenciar usuários.')}
                </div>
              </div>
            ) : !userDetailOpen ? (
              <div className="card p-4">
                <h3 className="mb-3 text-lg font-semibold">{t('settings_users_title', 'Usuários e Permissões')}</h3>
                <div className="rounded-lg border border-panel-border bg-slate-950/30 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{t('settings_users_list_title', 'Lista de usuários')}</div>
                    <div className="flex gap-2">
                      <button
                        className="btn border-panel-accent text-panel-accent"
                        onClick={() => {
                          setEditingId(null)
                          setUserDetailOpen(true)
                          setUserForm({ name: '', email: '', password: '', role: 'project_user', active: true, projectIds: [], storageLimitMB: '' })
                        }}
                      >
                        {t('action_create_new', 'Criar novo')}
                      </button>
                      <button className="btn" onClick={() => loadUsers().catch(() => {})}>{t('action_refresh', 'Atualizar')}</button>
                    </div>
                  </div>
                </div>
                <div className="mb-3 mt-3">
                  <input
                    className="input"
                    placeholder={t('settings_users_search_placeholder', 'Buscar por nome ou e-mail')}
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                <div className="rounded-xl border border-panel-border bg-slate-950/20 p-3">
                  <div className="max-h-[430px] space-y-2 overflow-auto pr-1">
                    {users
                      .filter((u) => {
                        const term = userSearch.trim().toLowerCase()
                        if (!term) return true
                        return String(u.name || '').toLowerCase().includes(term) || String(u.email || '').toLowerCase().includes(term)
                      })
                      .map((u) => (
                        <div key={u.id} className={`rounded border px-3 py-2 ${editingId === u.id ? 'border-panel-accent bg-panel-accent/10' : 'border-panel-border'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <button
                              className="min-w-0 flex-1 text-left"
                              onClick={() => {
                                setEditingId(u.id)
                                setUserDetailOpen(true)
                                setUserForm({ name: u.name, email: u.email, password: '', role: u.role, active: !!u.active, projectIds: u.projectIds || [], storageLimitMB: u.storageLimitMB ?? '' })
                              }}
                            >
                              <div className="truncate font-medium underline underline-offset-2">{u.name}</div>
                              <div className="mt-1 text-xs text-slate-400">{u.email}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                                {u.role} • {u.active ? t('settings_users_status_active', 'ativo') : t('settings_users_status_inactive', 'inativo')} • {t('settings_users_projects_label', 'projetos')}: {u.projectIds?.length || 0}
                              </div>
                              {u.storageLimitMB ? (
                                <div className="mt-1 text-[11px] text-slate-500">{t('settings_users_storage_limit_display', 'limite')}: {u.storageLimitMB} MB</div>
                              ) : null}
                            </button>
                            <div className="flex gap-2">
                              <button
                                className="btn px-2 py-1 text-xs"
                                onClick={() => {
                                  setEditingId(u.id)
                                  setUserDetailOpen(true)
                                  setUserForm({ name: u.name, email: u.email, password: '', role: u.role, active: !!u.active, projectIds: u.projectIds || [], storageLimitMB: u.storageLimitMB ?? '' })
                                }}
                              >
                                {t('action_open', 'Abrir')}
                              </button>
                              <button
                                className="btn border-red-500 px-2 py-1 text-xs text-red-300"
                                onClick={async () => {
                                  if (!confirm(`${t('settings_users_delete_confirm_prefix', 'Excluir usuário')} ${u.name}?`)) return
                                  try {
                                    await api.delete(`/users/${u.id}`, { headers: authHeaders })
                                    if (editingId === u.id) resetUserForm()
                                    await loadUsers()
                                  } catch (err) {
                                    notifyUi(err?.response?.data?.error || t('settings_users_delete_failed', 'Falha ao excluir usuário'), 'error')
                                  }
                                }}
                              >
                                {t('action_delete', 'Excluir')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    {!users.length && <div className="text-sm text-slate-400">{t('settings_users_none', 'Nenhum usuário cadastrado.')}</div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{editingId ? t('settings_users_edit', 'Edição de usuário') : t('settings_users_new', 'Novo usuário')}</h3>
                  <button className="btn px-2 py-1 text-xs" onClick={resetUserForm}>{t('settings_users_back_to_list', 'Voltar para lista')}</button>
                </div>
                <div className="space-y-2">
                  <input className="input" placeholder="Nome" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                  <input className="input" placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                  <input className="input" placeholder={editingId ? 'Nova senha (opcional)' : 'Senha'} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{t('settings_users_storage_limit_label', 'Limite de armazenamento (MB)')}</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={t('settings_users_storage_limit_hint', 'Deixe vazio para ilimitado.')}
                      value={userForm.storageLimitMB}
                      onChange={(e) => setUserForm({ ...userForm, storageLimitMB: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                      <option value="project_user">project_user</option>
                      <option value="full_admin">full_admin</option>
                    </select>
                    <label className="btn flex items-center justify-center gap-2">
                      <input type="checkbox" checked={!!userForm.active} onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })} />
                      Ativo
                    </label>
                  </div>
                  {userForm.role === 'project_user' && (
                    <div className="max-h-40 space-y-1 overflow-auto rounded border border-panel-border p-2">
                      {projects.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={userForm.projectIds.includes(p.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...userForm.projectIds, p.id]
                                : userForm.projectIds.filter((id) => id !== p.id)
                              setUserForm({ ...userForm, projectIds: next })
                            }}
                          />
                          {p.name} (/{p.slug})
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="btn border-panel-accent text-panel-accent"
                      onClick={async () => {
                        try {
                          if (editingId) {
                            await api.put(`/users/${editingId}`, userForm, { headers: authHeaders })
                          } else {
                            await api.post('/users', userForm, { headers: authHeaders })
                          }
                          resetUserForm()
                          await loadUsers()
                        } catch (err) {
                          notifyUi(err?.response?.data?.error || t('settings_users_save_failed', 'Falha ao salvar usuário'), 'error')
                        }
                      }}
                    >
                      {editingId ? 'Salvar alterações' : 'Criar usuário'}
                    </button>
                    <button className="btn" onClick={resetUserForm}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  )
}

function AppSqlSection({ authHeaders, t }) {
  const [sql, setSql] = useState('SELECT id, name, slug, type, status FROM projects ORDER BY id DESC;')
  const [result, setResult] = useState(null)
  const examples = [
    { label: 'Listar tabelas', sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;" },
    { label: 'Projetos recentes', sql: 'SELECT id, name, slug, type, status, created_at FROM projects ORDER BY id DESC LIMIT 20;' },
    { label: 'Variáveis por projeto', sql: 'SELECT project_id, COUNT(*) AS total_env FROM project_env GROUP BY project_id ORDER BY total_env DESC;' },
    { label: 'Últimos logs', sql: 'SELECT id, project_id, level, message, created_at FROM logs ORDER BY id DESC LIMIT 50;' },
  ]

  return (
    <div className="mt-4 card p-4">
      <h2 className="mb-2 text-lg font-semibold">SQL Global da Aplicação</h2>
      <p className="mb-3 text-sm text-slate-400">Executa comandos no SQLite principal do NodePanel.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button key={ex.label} className="btn text-xs" onClick={() => setSql(ex.sql)}>
            {ex.label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-2">
        <button
          className="btn border-panel-accent text-panel-accent"
          onClick={async () => {
            try {
              const { data } = await api.post('/sql/run', { sql }, { headers: authHeaders })
              setResult(data)
            } catch (err) {
              setResult({ error: err?.response?.data?.error || err.message })
            }
          }}
        >
          Executar SQL
        </button>
      </div>
      <Editor height="260px" defaultLanguage="sql" value={sql} onChange={(v) => setSql(v || '')} theme="vs-dark" />
      <div className="mt-3 overflow-auto rounded-lg border border-panel-border p-3">
        {result?.error && <div className="text-red-400">{result.error}</div>}
        {result?.type === 'exec' && <div className="text-emerald-300">{result.message}</div>}
        {result?.type === 'select' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-panel-border text-left text-slate-300">
                {(result.rows[0] ? Object.keys(result.rows[0]) : ['(sem colunas)']).map((k) => <th key={k} className="py-1 pr-3">{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-panel-border/40">
                  {Object.values(row).map((v, j) => <td key={j} className="py-1 pr-3">{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AppLogsSection({ authHeaders, projects, t }) {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')

  async function load() {
    const query = new URLSearchParams()
    if (filter !== 'all') query.set('level', filter)
    if (projectFilter !== 'all') query.set('projectId', projectFilter)
    query.set('limit', '1000')
    const { data } = await api.get(`/logs?${query.toString()}`, { headers: authHeaders })
    setLogs(data)
  }

  useEffect(() => { load() }, [filter, projectFilter])

  return (
    <div className="mt-4 card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {['all', 'info', 'warning', 'error'].map((f) => (
          <button key={f} className={`btn ${filter === f ? 'border-panel-accent text-panel-accent' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <select className="input max-w-[260px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">{t('logs_all_projects', 'Todos os projetos')}</option>
          {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name} (/{p.slug})</option>)}
        </select>
        <button className="btn" onClick={load}>{t('action_refresh', 'Atualizar')}</button>
        <button
          className="btn border-red-500 text-red-300"
          onClick={async () => {
            const query = projectFilter === 'all' ? '' : `?projectId=${projectFilter}`
            await api.delete(`/logs${query}`, { headers: authHeaders })
            await load()
          }}
        >
          {t('logs_clear', 'Limpar Logs')}
        </button>
      </div>

      <div className="h-[520px] overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 font-mono text-xs">
        {logs.map((l) => (
          <div key={l.id} className={l.level === 'error' ? 'text-red-300' : l.level === 'warning' ? 'text-amber-300' : 'text-cyan-200'}>
            [{new Date(l.createdAt).toLocaleTimeString()}] [{l.level}] [{l.projectSlug || 'app'}] {l.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function Login({ onLogin, t }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupStep, setSetupStep] = useState(1)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupForm, setSetupForm] = useState({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  })

  useEffect(() => {
    api.get('/setup/status')
      .then((r) => setSetupRequired(!!r.data?.setupRequired))
      .catch(() => setSetupRequired(false))
      .finally(() => setCheckingSetup(false))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/login', { email, password })
      onLogin(data.token)
    } catch (err) {
      if (err?.response?.data?.error === 'setup_required') {
        setSetupRequired(true)
        setSetupStep(1)
        return
      }
      setError(err?.response?.data?.error || t('error_login_failed', 'Falha no login'))
    }
  }

  async function runSetup() {
    setError('')
    if (!setupForm.adminName.trim() || !setupForm.adminEmail.trim() || !setupForm.adminPassword) {
      setError(t('setup_error_required', 'Preencha nome, e-mail e senha do administrador.'))
      return
    }
    if (setupForm.adminPassword !== setupForm.adminPasswordConfirm) {
      setError(t('setup_error_password_mismatch', 'A confirmação da senha não confere.'))
      return
    }
    setSetupLoading(true)
    try {
      await api.post('/setup/run', {
        adminName: setupForm.adminName.trim(),
        adminEmail: setupForm.adminEmail.trim(),
        adminPassword: setupForm.adminPassword,
      })
      setSetupRequired(false)
      setEmail(setupForm.adminEmail.trim())
      setPassword(setupForm.adminPassword)
      notifyUi(t('setup_success', 'Instalação concluída. Faça login para continuar.'), 'success')
    } catch (err) {
      setError(err?.response?.data?.error || t('setup_error_failed', 'Falha na instalação inicial.'))
    } finally {
      setSetupLoading(false)
    }
  }

  if (checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4">
        <div className="card w-full max-w-md p-6 text-sm text-slate-300">{t('setup_loading', 'Preparando instalação inicial...')}</div>
      </div>
    )
  }

  if (setupRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4">
        <div className="card w-full max-w-xl space-y-4 p-6">
          <h1 className="text-2xl font-bold text-panel-accent">{t('app_title', 'NodePanel')}</h1>
          <p className="text-sm text-slate-300">{t('setup_title', 'Assistente de primeiro acesso. Siga os passos para concluir a instalação.')}</p>

          <div className="flex items-center gap-2 text-xs">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`rounded-md border px-2 py-1 ${setupStep === n ? 'border-panel-accent text-panel-accent' : 'border-panel-border text-slate-400'}`}>
                {t('setup_step', 'Passo')} {n}
              </div>
            ))}
          </div>

          {setupStep === 1 && (
            <div className="space-y-3 text-sm text-slate-200">
              <div className="rounded-lg border border-panel-border bg-slate-950/30 p-3">
                {t('setup_intro', 'Este wizard configura o administrador inicial da plataforma.')}
              </div>
              <button className="btn border-panel-accent text-panel-accent" onClick={() => setSetupStep(2)}>{t('action_next', 'Próximo')}</button>
            </div>
          )}

          {setupStep === 2 && (
            <div className="space-y-3">
              <input className="input" placeholder={t('setup_admin_name_placeholder', 'Nome do admin')} value={setupForm.adminName} onChange={(e) => setSetupForm({ ...setupForm, adminName: e.target.value })} />
              <input className="input" placeholder={t('setup_admin_email_placeholder', 'E-mail do admin')} value={setupForm.adminEmail} onChange={(e) => setSetupForm({ ...setupForm, adminEmail: e.target.value })} />
              <input className="input" type="password" placeholder={t('setup_admin_password_placeholder', 'Senha do admin')} value={setupForm.adminPassword} onChange={(e) => setSetupForm({ ...setupForm, adminPassword: e.target.value })} />
              <input className="input" type="password" placeholder={t('setup_admin_password_confirm_placeholder', 'Confirmar senha')} value={setupForm.adminPasswordConfirm} onChange={(e) => setSetupForm({ ...setupForm, adminPasswordConfirm: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn" onClick={() => setSetupStep(1)}>{t('action_back', 'Voltar')}</button>
                <button className="btn border-panel-accent text-panel-accent" onClick={() => setSetupStep(3)}>{t('action_next', 'Próximo')}</button>
              </div>
            </div>
          )}

          {setupStep === 3 && (
            <div className="space-y-3 text-sm text-slate-200">
              <div className="rounded-lg border border-panel-border bg-slate-950/30 p-3">
                <div><strong>{t('setup_admin_label', 'Administrador')}:</strong> {setupForm.adminName || '-'}</div>
                <div><strong>{t('setup_email_label', 'E-mail')}:</strong> {setupForm.adminEmail || '-'}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setSetupStep(2)}>{t('action_back', 'Voltar')}</button>
                <button className="btn border-panel-accent text-panel-accent" onClick={runSetup} disabled={setupLoading}>
                  {setupLoading ? t('setup_installing', 'Instalando...') : t('setup_finish', 'Concluir Instalação')}
                </button>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4">
      <form className="card w-full max-w-md space-y-4 p-6" onSubmit={submit}>
        <h1 className="text-2xl font-bold text-panel-accent">{t('app_title', 'NodePanel')}</h1>
        <p className="text-sm text-slate-300">{t('login_subtitle', 'Painel administrativo para múltiplos projetos Node.js.')}</p>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('label_email', 'E-mail')} />
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('label_password', 'Senha')} />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button className="btn w-full border-panel-accent text-panel-accent" type="submit">{t('action_login', 'Entrar')}</button>
      </form>
    </div>
  )
}

function TopCards({ dashboard }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card title="CPU" value={`${dashboard?.cpu ?? 0}%`} />
      <Card title="RAM" value={`${dashboard?.memoryMB ?? 0} MB`} />
      <Card title="Uptime" value={`${dashboard?.uptimeSec ?? 0}s`} />
      <Card title="Projetos" value={`${dashboard?.projects?.length ?? 0}`} />
      <Card title="Armazenamento" value={`${dashboard?.totalProjectsSizeMB ?? 0} MB`} />
    </div>
  )
}

function Card({ title, value }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  )
}

function ProjectList({
  projects,
  selected,
  onSelect,
  onCreate,
  onToggle,
  onDelete,
  onRefresh,
  loading,
  t,
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', slug: '', description: '', type: 'api', worker_mode: 'manual' })
  const filteredProjects = projects.filter((p) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      String(p.name || '').toLowerCase().includes(term) ||
      String(p.slug || '').toLowerCase().includes(term) ||
      String(p.description || '').toLowerCase().includes(term)
    )
  })
  const totalProjects = projects.length
  const totalApi = projects.filter((p) => p.type === 'api').length
  const totalApp = projects.filter((p) => p.type === 'app').length
  const totalWorker = projects.filter((p) => p.type === 'worker').length
  const defaultAppBaseUrl = window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin
  const appBaseUrl = (localStorage.getItem('nodepanel_app_base_url') || defaultAppBaseUrl).replace(/\/$/, '')

  return (
    <div className="card p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('projects_list_title', 'Lista de projetos')}</h2>
        <div className="flex items-center gap-2">
          <button className="btn border-panel-accent text-panel-accent" onClick={() => setCreateOpen(true)}>{t('action_create_new', 'Criar novo')}</button>
          <button className="btn" onClick={onRefresh}>{t('action_refresh', 'Atualizar')}</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr,auto]">
        <input
          className="input"
          placeholder={t('projects_search_placeholder', 'Buscar por nome, slug ou descrição')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-panel-border px-2 py-1">{t('label_total', 'Total')}: {totalProjects}</span>
          <span className="rounded-md border border-panel-border px-2 py-1">API: {totalApi}</span>
          <span className="rounded-md border border-panel-border px-2 py-1">App: {totalApp}</span>
          <span className="rounded-md border border-panel-border px-2 py-1">Worker: {totalWorker}</span>
        </div>
      </div>

      <div className="rounded-xl border border-panel-border bg-slate-950/20 p-3">
        <div className="max-h-[430px] space-y-2 overflow-auto pr-1">
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border px-3 py-2 ${selected?.id === p.id ? 'border-panel-accent bg-panel-accent/10' : 'border-panel-border'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(p)}>
                  <a
                    className="truncate font-medium underline underline-offset-2"
                    href={`${appBaseUrl}/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.name}
                  </a>
                  <div className="mt-1 text-xs text-slate-400">/{p.slug}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{p.type} • {p.status}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{p.description || 'Sem descrição'}</div>
                  {p.updated_at && (
                    <div className="mt-1 text-[11px] text-slate-500">Atualizado: {new Date(p.updated_at).toLocaleString()}</div>
                  )}
                </button>
                <div className="flex shrink-0 gap-2">
                    <button className="btn px-2 py-1 text-xs" onClick={() => onSelect(p)}>{t('action_open', 'Abrir')}</button>
                    <button className="btn px-2 py-1 text-xs" onClick={() => onToggle(p)}>{p.active ? t('action_pause', 'Pausar') : t('action_activate', 'Ativar')}</button>
                    <button className="btn border-red-500 px-2 py-1 text-xs text-red-300" onClick={() => onDelete(p)}>{t('action_delete', 'Excluir')}</button>
                </div>
              </div>
            </div>
          ))}
          {!filteredProjects.length && (
            <div className="col-span-full rounded-lg border border-dashed border-panel-border p-4 text-sm text-slate-400">
              {t('projects_none_found', 'Nenhum projeto encontrado.')}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="card w-full max-w-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('projects_create_title', 'Criar novo projeto')}</h3>
              <button className="btn px-2 py-1" onClick={() => setCreateOpen(false)}>{t('action_close', 'Fechar')}</button>
            </div>
            <div className="space-y-3">
                <input className="input" placeholder={t('label_name', 'Nome')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="input" placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                <input className="input" placeholder={t('label_description', 'Descrição')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="api">API Project</option>
                  <option value="app">Node App Project</option>
                  <option value="worker">Worker Project</option>
                </select>
                <select className="input" value={form.worker_mode} onChange={(e) => setForm({ ...form, worker_mode: e.target.value })}>
                  <option value="manual">manual</option>
                  <option value="cron">cron</option>
                  <option value="continuous">continuous</option>
                </select>
              </div>
              <button
                className="btn w-full border-panel-accent text-panel-accent"
                disabled={loading}
                onClick={async () => {
                  await onCreate(form)
                  setCreateOpen(false)
                  setForm({ name: '', slug: '', description: '', type: 'api', worker_mode: 'manual' })
                }}
              >
                {loading ? t('action_creating', 'Criando...') : t('action_create_project', 'Criar projeto')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CodeTab({ project, authHeaders, onSaved, t }) {
  const gitTokenStorageKey = 'nodepanel_github_token'
  const [code, setCode] = useState(project.code || '')
  const [workerParams, setWorkerParams] = useState('{\n  "mes": "04",\n  "ano": "2026"\n}')
  const [preset, setPreset] = useState('every_5_minutes')
  const [time, setTime] = useState('00:00')
  const [custom, setCustom] = useState('*/5 * * * *')
  const [testPath, setTestPath] = useState('/')
  const [testResult, setTestResult] = useState('')
  const [zipFile, setZipFile] = useState(null)
  const [zipUploading, setZipUploading] = useState(false)
  const [gitCloneOpen, setGitCloneOpen] = useState(false)
  const [gitCloning, setGitCloning] = useState(false)
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [gitRepos, setGitRepos] = useState([])
  const [gitReposLoading, setGitReposLoading] = useState(false)
  const [gitToken, setGitToken] = useState(localStorage.getItem(gitTokenStorageKey) || '')
  const [gitManualTokenOpen, setGitManualTokenOpen] = useState(false)
  const [gitTokenSaved, setGitTokenSaved] = useState(!!localStorage.getItem(gitTokenStorageKey))
  const [gitBranch, setGitBranch] = useState('')
  const [gitBranches, setGitBranches] = useState([])
  const [gitBranchesLoading, setGitBranchesLoading] = useState(false)
  const [gitConnecting, setGitConnecting] = useState(false)
  const [helpZipOpen, setHelpZipOpen] = useState(false)
  const [projectFiles, setProjectFiles] = useState([])
  const [projectDirs, setProjectDirs] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesSearch, setFilesSearch] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState('index.js')
  const [selectedTreePath, setSelectedTreePath] = useState('index.js')
  const [selectedTreeType, setSelectedTreeType] = useState('file')
  const [filesPaneHidden, setFilesPaneHidden] = useState(false)
  const [fileDirty, setFileDirty] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createType, setCreateType] = useState('file')
  const [createPathInput, setCreatePathInput] = useState('')
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveMode, setMoveMode] = useState('move')
  const [moveFromPath, setMoveFromPath] = useState('')
  const [moveTargetDir, setMoveTargetDir] = useState('')
  const [moveNameInput, setMoveNameInput] = useState('')
  const editorShellRef = useRef(null)
  const filesTreeRef = useRef(null)
  const treeSearchTimerRef = useRef(null)

  async function loadProjectFiles(nextSelectedPath = selectedFilePath) {
    setFilesLoading(true)
    try {
      const { data } = await api.get(`/projects/${project.id}/files`, { headers: authHeaders })
      const files = data?.files || []
      const dirs = data?.dirs || []
      setProjectFiles(files)
      setProjectDirs(dirs)
      let targetPath = nextSelectedPath
      if (!targetPath || !files.some((f) => f.path === targetPath)) {
        targetPath = files.some((f) => f.path === 'index.js') ? 'index.js' : (files[0]?.path || '')
      }
      if (targetPath) {
        const targetFile = files.find((file) => file.path === targetPath)
        if (targetFile?.binary) {
          setSelectedFilePath(targetPath)
          setSelectedTreePath(targetPath)
          setSelectedTreeType('file')
          setCode(`Arquivo SQLite: ${targetPath}\n\nEste arquivo e binario e aparece aqui para controle dos arquivos do projeto.\nUse a aba Banco SQL para consultar ou alterar os dados.`)
          setFileDirty(false)
          return
        }
        const fileResp = await api.get(`/projects/${project.id}/file`, { headers: authHeaders, params: { path: targetPath } })
        setSelectedFilePath(targetPath)
        setSelectedTreePath(targetPath)
        setSelectedTreeType('file')
        setCode(fileResp?.data?.content || '')
        setFileDirty(false)
      } else {
        setSelectedFilePath('')
        setSelectedTreePath('')
        setSelectedTreeType('file')
        setCode('')
        setFileDirty(false)
      }
    } catch (err) {
      notifyUi(err?.response?.data?.error || 'Falha ao carregar arquivos do projeto', 'error')
    } finally {
      setFilesLoading(false)
    }
  }

  async function openProjectFile(path) {
    if (!path) return
    try {
      const targetFile = projectFiles.find((file) => file.path === path)
      if (targetFile?.binary) {
        setSelectedFilePath(path)
        setSelectedTreePath(path)
        setSelectedTreeType('file')
        setCode(`Arquivo SQLite: ${path}\n\nEste arquivo e binario e aparece aqui para controle dos arquivos do projeto.\nUse a aba Banco SQL para consultar ou alterar os dados.`)
        setFileDirty(false)
        return
      }
      const { data } = await api.get(`/projects/${project.id}/file`, { headers: authHeaders, params: { path } })
      setSelectedFilePath(path)
      setSelectedTreePath(path)
      setSelectedTreeType('file')
      setCode(data?.content || '')
      setFileDirty(false)
    } catch (err) {
      notifyUi(err?.response?.data?.error || 'Falha ao abrir arquivo', 'error')
    }
  }

  async function submitCreateItem() {
    let input = createPathInput.trim()
    if (!input) return
    if (!input.includes('/') && selectedTreeType === 'folder' && selectedTreePath) {
      input = `${selectedTreePath}/${input}`
    }
    if (!input.includes('/') && selectedTreeType === 'file' && selectedTreePath) {
      const parent = selectedTreePath.includes('/') ? selectedTreePath.slice(0, selectedTreePath.lastIndexOf('/')) : ''
      if (parent) input = `${parent}/${input}`
    }
    try {
      if (createType === 'folder') {
        await api.post(`/projects/${project.id}/folder`, { path: input }, { headers: authHeaders })
        await loadProjectFiles(selectedFilePath)
      } else {
        await api.put(`/projects/${project.id}/file`, { path: input, content: '' }, { headers: authHeaders })
        await loadProjectFiles(input)
      }
      setCreateModalOpen(false)
      setCreatePathInput('')
    } catch (err) {
      notifyUi(
        err?.response?.data?.error || (createType === 'folder'
          ? t('explorer_create_folder_error', 'Falha ao criar pasta')
          : t('explorer_create_file_error', 'Falha ao criar arquivo')),
        'error',
      )
    }
  }

  async function removeItemAt(path, type) {
    if (!path) return
    const label = type === 'folder' ? 'pasta' : 'arquivo'
    const targetPath = path
    const ok = window.confirm(`Remover ${label} "${targetPath}"?`)
    if (!ok) return
    try {
      if (type === 'folder') {
        await api.delete(`/projects/${project.id}/folder`, { headers: authHeaders, params: { path: targetPath } })
      } else {
        await api.delete(`/projects/${project.id}/file`, { headers: authHeaders, params: { path: targetPath } })
      }
      await loadProjectFiles('index.js')
    } catch (err) {
      notifyUi(err?.response?.data?.error || `Falha ao remover ${label}`, 'error')
    }
  }

  async function removeSelectedItem() {
    if (!selectedTreePath) return
    await removeItemAt(selectedTreePath, selectedTreeType)
  }

  function openMoveModal() {
    if (!selectedTreePath) return
    openMoveModalFor(selectedTreePath, selectedTreeType)
  }

  function openMoveModalFor(path, type) {
    if (!path) return
    const clean = String(path || '')
    const baseName = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean
    const parentDir = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : ''
    setSelectedTreePath(path)
    setSelectedTreeType(type)
    setMoveMode('move')
    setMoveFromPath(clean)
    setMoveTargetDir(parentDir)
    setMoveNameInput(baseName)
    setMoveModalOpen(true)
  }

  function openRenameModalFor(path, type) {
    if (!path) return
    const clean = String(path || '')
    const baseName = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean
    const parentDir = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : ''
    setSelectedTreePath(path)
    setSelectedTreeType(type)
    setMoveMode('rename')
    setMoveFromPath(clean)
    setMoveTargetDir(parentDir)
    setMoveNameInput(baseName)
    setMoveModalOpen(true)
  }

  function openCreateModalFor(type, basePath, baseType) {
    const folderBase = baseType === 'folder'
      ? (basePath ? `${basePath}/` : '')
      : (basePath && basePath.includes('/') ? `${basePath.slice(0, basePath.lastIndexOf('/'))}/` : '')
    setCreateType(type)
    setCreatePathInput(folderBase)
    setCreateModalOpen(true)
  }

  async function submitMoveItem() {
    const fromPath = String(moveFromPath || '').trim()
    const name = String(moveNameInput || '').trim()
    const dir = String(moveTargetDir || '').trim()
    const toPath = dir ? `${dir}/${name}` : name
    if (!fromPath || !toPath) return
    if (moveMode === 'move' && selectedTreeType === 'folder' && (toPath === fromPath || toPath.startsWith(`${fromPath}/`))) {
      notifyUi('Destino inválido para pasta', 'error')
      return
    }
    try {
      await api.post(`/projects/${project.id}/move`, { fromPath, toPath }, { headers: authHeaders })
      setMoveModalOpen(false)
      await loadProjectFiles(toPath)
    } catch (err) {
      notifyUi(err?.response?.data?.error || (moveMode === 'rename' ? 'Falha ao renomear item' : 'Falha ao mover item'), 'error')
    }
  }

  useEffect(() => {
    function onFilesShortcuts(e) {
      const tag = String(e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if (typing) return

      if (e.altKey && e.key.toLowerCase() === 'n' && e.shiftKey) {
        e.preventDefault()
        setCreateType('folder')
        const base = selectedTreeType === 'folder'
          ? (selectedTreePath ? `${selectedTreePath}/` : '')
          : (selectedTreePath && selectedTreePath.includes('/') ? `${selectedTreePath.slice(0, selectedTreePath.lastIndexOf('/'))}/` : '')
        setCreatePathInput(base)
        setCreateModalOpen(true)
        return
      }
      if (e.altKey && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        const base = selectedTreeType === 'folder'
          ? (selectedTreePath ? `${selectedTreePath}/` : '')
          : (selectedTreePath && selectedTreePath.includes('/') ? `${selectedTreePath.slice(0, selectedTreePath.lastIndexOf('/'))}/` : '')
        setCreateType('file')
        setCreatePathInput(base)
        setCreateModalOpen(true)
        return
      }
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        openMoveModal()
        return
      }
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        if (selectedTreePath) openRenameModalFor(selectedTreePath, selectedTreeType)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        removeSelectedItem()
      }
    }
    window.addEventListener('keydown', onFilesShortcuts)
    return () => window.removeEventListener('keydown', onFilesShortcuts)
  }, [selectedTreePath, selectedTreeType, project?.id])

  useEffect(() => {
    loadProjectFiles('index.js')
  }, [project.id])

  useEffect(() => {
    function onGithubOauthMessage(event) {
      const data = event?.data
      if (!data || data.type !== 'nodepanel:github-oauth') return
      setGitConnecting(false)
      if (!data.ok || !data.token) {
        notifyUi(data?.error || t('clone_git_connect_failed', 'Falha ao conectar com GitHub'), 'error')
        return
      }
      const token = String(data.token || '').trim()
      if (!token) {
        notifyUi(t('clone_git_connect_failed', 'Falha ao conectar com GitHub'), 'error')
        return
      }
      setGitToken(token)
      setGitTokenSaved(true)
      localStorage.setItem(gitTokenStorageKey, token)
      loadGitRepos(token)
      notifyUi(t('clone_git_connected', 'GitHub conectado com sucesso.'), 'success')
    }
    window.addEventListener('message', onGithubOauthMessage)
    return () => window.removeEventListener('message', onGithubOauthMessage)
  }, [t])

  useEffect(() => {
    if (gitCloneOpen && gitToken.trim() && !gitRepos.length && !gitReposLoading) {
      loadGitRepos(gitToken)
    }
  }, [gitCloneOpen])

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === editorShellRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  async function loadGitRepos(nextToken = gitToken) {
    const clean = String(nextToken || '').trim()
    if (!clean) return
    setGitReposLoading(true)
    try {
      const { data } = await api.post('/git/repos', { token: clean }, { headers: authHeaders })
      const repos = data?.repos || []
      setGitRepos(repos)
      if (!repos.length) notifyUi(t('clone_git_no_repos', 'Nenhum repositório encontrado na conta conectada'), 'error')
    } catch (err) {
      notifyUi(err?.response?.data?.error || t('clone_git_repos_error', 'Falha ao listar repositórios'), 'error')
    } finally {
      setGitReposLoading(false)
    }
  }

  const cronExpr = cronPresetToExpr(preset, time, custom)
  const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`
  const defaultAppBaseUrl = window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin
  const appBaseUrl = (localStorage.getItem('nodepanel_app_base_url') || defaultAppBaseUrl).replace(/\/$/, '')
  const testUrl = normalizedPath === '/' ? `${appBaseUrl}/${project.slug}` : `${appBaseUrl}/${project.slug}${normalizedPath}`
  const selectedFileMeta = projectFiles.find((file) => file.path === selectedFilePath)
  const selectedFileIsBinary = !!selectedFileMeta?.binary
  const fileLang = (() => {
    const ext = String(selectedFilePath || '').split('.').pop()?.toLowerCase()
    if (selectedFileIsBinary) return 'plaintext'
    if (selectedFilePath === 'Dockerfile') return 'dockerfile'
    if (ext === 'ts') return 'typescript'
    if (ext === 'tsx') return 'typescript'
    if (ext === 'jsx') return 'javascript'
    if (ext === 'json') return 'json'
    if (ext === 'sql') return 'sql'
    if (ext === 'md') return 'markdown'
    if (ext === 'yml' || ext === 'yaml') return 'yaml'
    if (ext === 'env') return 'shell'
    return 'javascript'
  })()

  const filesTreeData = useMemo(() => {
    const rootId = 'd:__root__'
    const dirSet = new Set(projectDirs || [])
    for (const file of projectFiles || []) {
      const parts = String(file.path || '').split('/').filter(Boolean)
      if (parts.length <= 1) continue
      for (let i = 1; i < parts.length; i += 1) {
        dirSet.add(parts.slice(0, i).join('/'))
      }
    }

    const nodes = [
      {
        id: rootId,
        parent: '#',
        text: project?.slug || project?.name || 'project',
        icon: 'jstree-folder',
        data: { type: 'folder', path: '' },
        state: { opened: true },
      },
    ]
    const sortedDirs = [...dirSet].sort((a, b) => a.localeCompare(b))
    for (const dirPath of sortedDirs) {
      const parentPath = dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '#'
      nodes.push({
        id: `d:${dirPath}`,
        parent: parentPath === '#' ? rootId : `d:${parentPath}`,
        text: dirPath.split('/').pop(),
        icon: 'jstree-folder',
        data: { type: 'folder', path: dirPath },
      })
    }
    const sortedFiles = [...(projectFiles || [])].sort((a, b) => a.path.localeCompare(b.path))
    for (const file of sortedFiles) {
      const filePath = String(file.path || '')
      const parentPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '#'
      nodes.push({
        id: `f:${filePath}`,
        parent: parentPath === '#' ? rootId : `d:${parentPath}`,
        text: filePath.split('/').pop(),
        icon: 'jstree-file',
        data: { type: 'file', path: filePath },
      })
    }
    return nodes
  }, [projectFiles, projectDirs])

  useEffect(() => {
    if (filesPaneHidden) return
    if (!filesTreeRef.current) return
    const $tree = $(filesTreeRef.current)
    try { $tree.jstree('destroy') } catch (_) {}
    $tree
      .on('activate_node.jstree', (_evt, payload) => {
        const nodeData = payload?.node?.data
        if (!nodeData?.path) return
        setSelectedTreePath(nodeData.path)
        setSelectedTreeType(nodeData.type === 'folder' ? 'folder' : 'file')
        if (nodeData.type === 'file') openProjectFile(nodeData.path)
      })
      .on('move_node.jstree', async (_evt, payload) => {
        const moved = payload?.node?.data
        const parent = payload?.instance?.get_node(payload?.parent)
        const parentPath = String(parent?.data?.path || '')
        const fromPath = String(moved?.path || '')
        if (!fromPath) return
        const toPath = parentPath ? `${parentPath}/${payload.node.text}` : String(payload.node.text || '')
        if (!toPath || toPath === fromPath) return
        try {
          await api.post(`/projects/${project.id}/move`, { fromPath, toPath }, { headers: authHeaders })
          await loadProjectFiles(toPath)
        } catch (err) {
          notifyUi(err?.response?.data?.error || 'Falha ao mover item', 'error')
          await loadProjectFiles(fromPath)
        }
      })
      .jstree({
        core: {
          data: filesTreeData,
          check_callback: true,
          multiple: false,
          themes: { dots: false, icons: true },
          worker: true,
        },
        search: {
          case_sensitive: false,
          show_only_matches: true,
          show_only_matches_children: true,
        },
        sort: (a, b) => {
          const instance = $tree.jstree(true)
          const na = instance.get_node(a)
          const nb = instance.get_node(b)
          const ta = na?.data?.type === 'folder' ? '0' : '1'
          const tb = nb?.data?.type === 'folder' ? '0' : '1'
          if (ta !== tb) return ta.localeCompare(tb)
          return String(na?.text || '').localeCompare(String(nb?.text || ''))
        },
        types: {
          folder: { icon: 'jstree-folder' },
          file: { icon: 'jstree-file' },
        },
        dnd: {
          copy: false,
          is_draggable: true,
        },
        contextmenu: {
          items: (node) => {
            const nodeType = node?.data?.type === 'folder' ? 'folder' : 'file'
            const nodePath = String(node?.data?.path || '')
            const items = {
              newFile: {
                label: 'Novo Arquivo',
                action: () => openCreateModalFor('file', nodePath, nodeType),
              },
              newFolder: {
                label: 'Nova Pasta',
                action: () => openCreateModalFor('folder', nodePath, nodeType),
              },
            }
            if (nodePath) {
              items.rename = {
                label: 'Renomear',
                action: () => openRenameModalFor(nodePath, nodeType),
              }
              items.move = {
                label: 'Mover',
                action: () => openMoveModalFor(nodePath, nodeType),
              }
              items.remove = {
                label: 'Remover',
                action: async () => { await removeItemAt(nodePath, nodeType) },
              }
            }
            return items
          },
        },
        plugins: ['wholerow', 'contextmenu', 'dnd', 'search', 'sort', 'state', 'types', 'unique', 'changed'],
      })
    return () => {
      try { $tree.jstree('destroy') } catch (_) {}
      $tree.off('activate_node.jstree')
    }
  }, [filesTreeData, filesPaneHidden])

  useEffect(() => {
    if (filesPaneHidden) return
    const treeEl = filesTreeRef.current
    if (!treeEl) return
    const instance = $(treeEl).jstree(true)
    if (!instance) return
    if (treeSearchTimerRef.current) clearTimeout(treeSearchTimerRef.current)
    treeSearchTimerRef.current = setTimeout(() => {
      instance.search(String(filesSearch || '').trim())
    }, 180)
    return () => {
      if (treeSearchTimerRef.current) clearTimeout(treeSearchTimerRef.current)
    }
  }, [filesSearch, filesTreeData, filesPaneHidden])

  async function toggleFullscreen() {
    const host = editorShellRef.current
    if (!host) return
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen()
      } else {
        await host.requestFullscreen()
      }
    } catch (_) {
      notifyUi('Falha ao alternar fullscreen', 'error')
    }
  }

  return (
    <div ref={editorShellRef} className="flex h-[82vh] min-h-[680px] flex-col bg-panel-bg px-3 md:px-4">
      <div className="mb-4 shrink-0 space-y-3">
        <div className="rounded-xl border border-panel-border bg-slate-950/30 p-2.5">
          <div className="space-y-2">
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-panel-border bg-slate-950/50 p-1.5">
                <button
                  className={`btn border-panel-accent bg-panel-accent/15 px-3 py-1.5 text-panel-accent hover:bg-panel-accent/20 ${selectedFileIsBinary ? 'opacity-60' : ''}`}
                  disabled={selectedFileIsBinary}
                  onClick={async () => {
                    if (!selectedFilePath || selectedFileIsBinary) return
                    try {
                      if (selectedFilePath === 'index.js') {
                        await api.post(`/projects/${project.id}/code`, { code }, { headers: authHeaders })
                      } else {
                        await api.put(`/projects/${project.id}/file`, { path: selectedFilePath, content: code }, { headers: authHeaders })
                      }
                      setFileDirty(false)
                      await loadProjectFiles(selectedFilePath)
                      onSaved()
                    } catch (err) {
                      notifyUi(err?.response?.data?.error || 'Falha ao salvar arquivo', 'error')
                    }
                  }}
                >
                  {selectedFileIsBinary
                    ? `Banco SQLite (${selectedFilePath})`
                    : selectedFilePath ? `${t('save_code', 'Salvar Código')} (${selectedFilePath})` : t('save_code', 'Salvar Código')}
                </button>
              </div>

              <div className="hidden h-7 w-px bg-panel-border lg:block" />

              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-panel-border bg-slate-950/50 p-1.5">
                <label className="btn cursor-pointer px-3 py-1.5 text-xs sm:text-sm">
                  {t('action_select_zip', 'Selecionar ZIP')}
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  />
                </label>
                <button
                  className="btn px-3 py-1.5 text-xs sm:text-sm"
                  disabled={!zipFile || zipUploading}
                  onClick={async () => {
                    if (!zipFile) return
                    const formData = new FormData()
                    formData.append('file', zipFile)
                    setZipUploading(true)
                    try {
                      await api.post(`/projects/${project.id}/upload-zip`, formData, { headers: authHeaders })
                      setZipFile(null)
                      onSaved()
                    } catch (err) {
                      notifyUi(err?.response?.data?.error || 'Falha no upload ZIP', 'error')
                    } finally {
                      setZipUploading(false)
                    }
                  }}
                >
                  {zipUploading ? t('action_uploading_zip', 'Enviando ZIP...') : t('action_upload_zip', 'Subir ZIP')}
                </button>
                <button
                  className="btn px-3 py-1.5 text-xs sm:text-sm"
                  onClick={() => setGitCloneOpen(true)}
                >
                  {t('action_clone_git', 'Clonar Git')}
                </button>
                <button
                  className="btn px-3 py-1.5 text-xs sm:text-sm"
                  onClick={() => setHelpZipOpen(true)}
                >
                  {t('action_help_zip', 'Help ZIP')}
                </button>
                {(project.type === 'api' || project.type === 'app') && (
                  <button
                    className="btn px-3 py-1.5 text-xs sm:text-sm"
                    onClick={() => window.open(testUrl, '_blank')}
                  >
                    {t('action_open_url', 'Abrir URL')}
                  </button>
                )}
                <button
                  className="btn px-3 py-1.5 text-xs sm:text-sm"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? t('action_exit_fullscreen', 'Sair Fullscreen') : t('action_fullscreen', 'Fullscreen')}
                </button>
              </div>
            </div>

          </div>
        </div>

        {project.type === 'worker' && (
          <div className="rounded-xl border border-panel-border bg-slate-950/20 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" onClick={async () => {
                let parsed = {}
                try { parsed = JSON.parse(workerParams || '{}') } catch { notifyUi(t('error_invalid_json', 'JSON inválido'), 'error'); return }
                await api.post(`/projects/${project.id}/run-now`, { params: parsed }, { headers: authHeaders })
              }}>{t('action_run_now', 'Executar Agora')}</button>
              <select className="input max-w-[220px]" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="every_minute">cada minuto</option>
                <option value="every_5_minutes">cada 5 min</option>
                <option value="every_hour">cada hora</option>
                <option value="daily">todo dia HH:MM</option>
                <option value="monday">segunda HH:MM</option>
                <option value="custom">personalizado</option>
              </select>
              {(preset === 'daily' || preset === 'monday') && <input className="input max-w-[120px]" type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
              {preset === 'custom' && <input className="input max-w-[200px]" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="cron" />}
              <button className="btn" onClick={async () => {
                await api.put(`/projects/${project.id}`, { cron_expression: cronExpr, worker_mode: 'cron' }, { headers: authHeaders })
                notifyUi(`Cron salvo: ${cronExpr}`, 'success')
              }}>{t('action_save_cron', 'Salvar Cron')}</button>
              <span className="ml-auto text-xs text-slate-300">Expression: {cronExpr}</span>
            </div>
          </div>
        )}
      </div>
      {zipFile && (
        <div className="mb-3 text-xs text-slate-300">
          ZIP selecionado: {zipFile.name}
        </div>
      )}
      {gitCloneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="card w-full max-w-xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('clone_git_title', 'Clonar Repositório Git')}</h3>
              <button className="btn px-2 py-1" onClick={() => setGitCloneOpen(false)}>{t('action_close', 'Fechar')}</button>
            </div>
            <div className="space-y-3">
              <input
                className="input"
                placeholder={t('clone_git_repo_placeholder', 'https://github.com/owner/repo.git')}
                value={gitRepoUrl}
                onChange={(e) => {
                  setGitRepoUrl(e.target.value)
                  setGitBranches([])
                  setGitBranch('')
                }}
              />
              <select
                className="input"
                value=""
                disabled={gitReposLoading || !gitRepos.length}
                onChange={(e) => {
                  const url = e.target.value
                  if (!url) return
                  setGitRepoUrl(url)
                  setGitBranches([])
                  setGitBranch('')
                }}
              >
                <option value="">
                  {gitReposLoading
                    ? t('clone_git_loading_repos', 'Carregando repositórios...')
                    : t('clone_git_repo_select_placeholder', 'Selecione um repositório conectado')}
                </option>
                {gitRepos.map((repo) => (
                  <option key={repo.id || repo.fullName} value={repo.cloneUrl}>
                    {repo.fullName}{repo.private ? ' (private)' : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                onClick={() => setGitManualTokenOpen((v) => !v)}
              >
                {gitManualTokenOpen
                  ? t('clone_git_hide_manual_token', 'Ocultar token manual')
                  : t('clone_git_show_manual_token', 'Usar token manual')}
              </button>
              {gitManualTokenOpen && (
                <input
                  className="input"
                  type="password"
                  placeholder={t('clone_git_token_placeholder', 'Token GitHub (opcional para repositório público)')}
                  value={gitToken}
                  onChange={(e) => {
                    setGitToken(e.target.value)
                    setGitBranches([])
                    setGitBranch('')
                  }}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn"
                  type="button"
                  disabled={gitConnecting}
                  onClick={async () => {
                    setGitConnecting(true)
                    try {
                      const { data } = await api.post('/git/github/oauth/start', { origin: window.location.origin }, { headers: authHeaders })
                      const popup = window.open(data.authorizeUrl, 'nodepanel-github-oauth', 'width=620,height=760')
                      if (!popup) {
                        setGitConnecting(false)
                        notifyUi(t('clone_git_popup_blocked', 'O navegador bloqueou o popup de login do GitHub.'), 'error')
                      }
                    } catch (err) {
                      setGitConnecting(false)
                      notifyUi(err?.response?.data?.error || t('clone_git_connect_failed', 'Falha ao conectar com GitHub'), 'error')
                    }
                  }}
                >
                  {gitConnecting ? t('clone_git_connecting', 'Abrindo login GitHub...') : t('clone_git_connect', 'Conectar GitHub')}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const trimmed = gitToken.trim()
                    if (!trimmed) {
                      localStorage.removeItem(gitTokenStorageKey)
                      setGitTokenSaved(false)
                      notifyUi(t('clone_git_token_not_saved', 'Token não salvo.'), 'error')
                      return
                    }
                    localStorage.setItem(gitTokenStorageKey, trimmed)
                    setGitToken(trimmed)
                    setGitTokenSaved(true)
                    notifyUi(t('clone_git_token_saved', 'Token salvo neste navegador.'), 'success')
                  }}
                >
                  {t('clone_git_save_token', 'Salvar token')}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(gitTokenStorageKey)
                    setGitToken('')
                    setGitTokenSaved(false)
                    setGitRepos([])
                    setGitBranches([])
                    setGitBranch('')
                  }}
                >
                  {t('clone_git_clear_token', 'Remover token salvo')}
                </button>
              </div>
              <div className="text-xs text-slate-400">
                {t('clone_git_connect_hint', 'Clique em Conectar, faça login no GitHub e o token volta automaticamente para esta tela.')}
              </div>
              {gitTokenSaved && (
                <div className="text-xs text-emerald-300">{t('clone_git_token_saved', 'Token salvo neste navegador.')}</div>
              )}
              <button
                className="btn w-full"
                disabled={gitBranchesLoading}
                onClick={async () => {
                  if (!gitRepoUrl.trim()) {
                    notifyUi(t('clone_git_repo_required', 'Informe a URL do repositório Git'), 'error')
                    return
                  }
                  setGitBranchesLoading(true)
                  try {
                    const { data } = await api.post('/git/branches', { repoUrl: gitRepoUrl.trim(), token: gitToken.trim() }, { headers: authHeaders })
                    setGitBranches(data.branches || [])
                    setGitBranch((data.branches || [])[0] || '')
                    if (!(data.branches || []).length) notifyUi(t('clone_git_no_branches', 'Nenhuma branch encontrada'), 'error')
                  } catch (err) {
                    notifyUi(err?.response?.data?.error || t('clone_git_branches_error', 'Falha ao listar branches'), 'error')
                  } finally {
                    setGitBranchesLoading(false)
                  }
                }}
              >
                {gitBranchesLoading ? t('clone_git_loading_branches', 'Carregando branches...') : t('clone_git_login', 'Listar branches')}
              </button>
              <select
                className="input"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                disabled={!gitBranches.length}
              >
                <option value="">{t('clone_git_branch_placeholder', 'Selecione uma branch')}</option>
                {gitBranches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              <div className="text-xs text-slate-400">
                {t('clone_git_hint', 'Clona o repositório para este projeto e reinicia automaticamente.')}
              </div>
              <button
                className="btn w-full border-panel-accent text-panel-accent"
                disabled={gitCloning || !gitBranches.length}
                onClick={async () => {
                  if (!gitRepoUrl.trim()) {
                    notifyUi(t('clone_git_repo_required', 'Informe a URL do repositório Git'), 'error')
                    return
                  }
                  if (!gitBranch.trim()) {
                    notifyUi(t('clone_git_branch_required', 'Selecione uma branch'), 'error')
                    return
                  }
                  setGitCloning(true)
                  try {
                    await api.post(`/projects/${project.id}/clone-git`, { repoUrl: gitRepoUrl.trim(), branch: gitBranch.trim(), token: gitToken.trim() }, { headers: authHeaders })
                    await loadProjectFiles('index.js')
                    setGitCloneOpen(false)
                    setGitRepoUrl('')
                    setGitBranch('')
                    setGitBranches([])
                    await onSaved?.()
                  } catch (err) {
                    notifyUi(err?.response?.data?.error || t('clone_git_error', 'Falha no clone Git'), 'error')
                  } finally {
                    setGitCloning(false)
                  }
                }}
              >
                {gitCloning ? t('clone_git_submitting', 'Clonando...') : t('clone_git_submit', 'Clonar Repositório')}
              </button>
            </div>
          </div>
        </div>
      )}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="card w-full max-w-lg p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{createType === 'folder' ? t('explorer_new_folder', 'Nova Pasta') : t('explorer_new_file', 'Novo Arquivo')}</h3>
              <button className="btn px-2 py-1" onClick={() => setCreateModalOpen(false)}>{t('action_close', 'Fechar')}</button>
            </div>
            <div className="space-y-3">
              <input
                className="input"
                autoFocus
                placeholder={createType === 'folder'
                  ? t('explorer_prompt_folder', 'Nome/caminho da nova pasta (ex: src/utils)')
                  : t('explorer_prompt_file', 'Nome/caminho do novo arquivo (ex: src/utils/helper.js)')}
                value={createPathInput}
                onChange={(e) => setCreatePathInput(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setCreateModalOpen(false)}>{t('action_close', 'Fechar')}</button>
                <button className="btn border-panel-accent text-panel-accent" onClick={submitCreateItem}>Criar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {moveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="card w-full max-w-lg p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{moveMode === 'rename' ? 'Renomear' : 'Mover'}</h3>
              <button className="btn px-2 py-1" onClick={() => setMoveModalOpen(false)}>{t('action_close', 'Fechar')}</button>
            </div>
            <div className="space-y-3">
              <input className="input" value={moveFromPath} readOnly />
              <div>
                <label className="mb-1 block text-xs text-slate-400">Pasta destino</label>
                <select className="input" value={moveTargetDir} onChange={(e) => setMoveTargetDir(e.target.value)}>
                  <option value="">/ (raiz)</option>
                  {[...(projectDirs || [])].sort((a, b) => a.localeCompare(b)).map((dir) => (
                    <option key={dir} value={dir}>{dir}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Nome</label>
                <input className="input" value={moveNameInput} onChange={(e) => setMoveNameInput(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setMoveModalOpen(false)}>{t('action_close', 'Fechar')}</button>
                <button className="btn border-panel-accent text-panel-accent" onClick={submitMoveItem}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {helpZipOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="card w-full max-w-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t('zip_help_title', 'Como subir projeto ZIP')}</h3>
              <button className="btn px-2 py-1" onClick={() => setHelpZipOpen(false)}>{t('action_close', 'Fechar')}</button>
            </div>

            <div className="space-y-3 text-sm text-slate-200">
              <p>Use esta regra: o ZIP precisa conter os arquivos do projeto na raiz, sem pastas extras acima.</p>

              <div className="rounded-lg border border-panel-border bg-slate-950/40 p-3 font-mono text-xs">
                index.js<br />
                package.json<br />
                .env (opcional)<br />
                database.db (opcional)<br />
                lib/<br />
                src/<br />
              </div>

              <p><strong>Checklist rápido:</strong></p>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li>O arquivo principal deve ser <code>index.js</code>.</li>
                <li>Para API, exporte <code>routes</code>; para Worker, exporte <code>run</code>; para App, exporte <code>handle</code> (ou use <code>public/</code>).</li>
                <li>Não envie caminhos inválidos (ex.: <code>../</code>).</li>
                <li>Após upload, o NodePanel aplica os arquivos, versiona <code>index.js</code> e reinicia o projeto.</li>
              </ul>

              <p><strong>Dependências:</strong> inclua <code>package.json</code>. Depois, instale na aba <strong>Dependências</strong> ou com <code>npm install</code>.</p>
              <p><strong>Banco:</strong> se não enviar <code>database.db</code>, o projeto cria/usa o banco próprio automaticamente.</p>

              <div className="rounded-lg border border-panel-border bg-slate-950/30 p-3">
                <div className="mb-2 text-xs text-slate-300">Baixar ZIP modelo para editar e subir:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn"
                    onClick={async () => {
                      const resp = await api.get('/templates/project-zip?type=api', { headers: authHeaders, responseType: 'blob' })
                      const url = window.URL.createObjectURL(resp.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'nodepanel-template-api.zip'
                      a.click()
                      window.URL.revokeObjectURL(url)
                    }}
                  >
                    Baixar modelo API
                  </button>
                  <button
                    className="btn"
                    onClick={async () => {
                      const resp = await api.get('/templates/project-zip?type=worker', { headers: authHeaders, responseType: 'blob' })
                      const url = window.URL.createObjectURL(resp.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'nodepanel-template-worker.zip'
                      a.click()
                      window.URL.revokeObjectURL(url)
                    }}
                  >
                    Baixar modelo Worker
                  </button>
                  <button
                    className="btn"
                    onClick={async () => {
                      const resp = await api.get('/templates/project-zip?type=app', { headers: authHeaders, responseType: 'blob' })
                      const url = window.URL.createObjectURL(resp.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'nodepanel-template-app.zip'
                      a.click()
                      window.URL.revokeObjectURL(url)
                    }}
                  >
                    Baixar modelo App
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 ${filesPaneHidden
        ? (project.type === 'worker' ? 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-3 lg:grid-cols-[minmax(0,1fr)]')
        : (project.type === 'worker' ? 'grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_320px]' : 'grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]')}`}>
        {!filesPaneHidden && (
        <div className="min-h-0 flex flex-col gap-2">
          <div className="card min-h-0 flex-1 overflow-auto p-2">
            <div className="mb-2 px-1 text-xs font-medium text-slate-300">Files</div>
            <div className="mb-2 grid grid-cols-2 gap-1">
              <input
                className="input col-span-2 h-8 text-xs"
                placeholder="Buscar em files..."
                value={filesSearch}
                onChange={(e) => setFilesSearch(e.target.value)}
              />
              <button
                className="btn px-2 py-1 text-xs"
                onClick={() => {
                  const instance = $(filesTreeRef.current).jstree(true)
                  if (instance) instance.open_all()
                }}
              >
                Expandir
              </button>
              <button
                className="btn px-2 py-1 text-xs"
                onClick={() => {
                  const instance = $(filesTreeRef.current).jstree(true)
                  if (instance) instance.close_all()
                }}
              >
                Recolher
              </button>
            </div>
            {filesLoading && <div className="px-1 text-xs text-slate-400">Carregando arquivos...</div>}
            {!filesLoading && !projectFiles.length && <div className="px-1 text-xs text-slate-400">Sem arquivos de texto.</div>}
            <div ref={filesTreeRef} className="jstree-nodepanel" />
          </div>
        </div>
        )}
        <div className="relative h-full min-h-0 flex-1 overflow-hidden rounded-lg border border-panel-border">
          <button
            className="absolute left-0 top-4 z-10 -translate-x-1/2 rounded-md border border-panel-border bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:border-panel-accent"
            onClick={() => setFilesPaneHidden((v) => !v)}
            title={filesPaneHidden ? 'Mostrar Files' : 'Esconder Files'}
          >
            {filesPaneHidden ? '>' : '<'}
          </button>
          <Editor
            height="100%"
            defaultLanguage={fileLang}
            language={fileLang}
            value={code}
            onChange={(value) => {
              if (selectedFileIsBinary) return
              setCode(value || '')
              setFileDirty(true)
            }}
            theme="vs-dark"
            options={{
              readOnly: selectedFileIsBinary,
              minimap: { enabled: true },
              fontSize: 14,
              automaticLayout: true,
              wordWrap: 'on',
              quickSuggestions: true,
              formatOnPaste: true,
              formatOnType: true,
              suggestOnTriggerCharacters: true,
              tabSize: 2,
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        {project.type === 'worker' && (
          <div className="card min-h-0 p-3 flex flex-col">
            <div className="mb-2 text-sm font-medium shrink-0">Parâmetros JSON (Execução manual)</div>
            <textarea
              className="input min-h-[180px] flex-1 font-mono text-xs"
              value={workerParams}
              onChange={(e) => setWorkerParams(e.target.value)}
            />
          </div>
        )}
      </div>

      {(project.type === 'api' || project.type === 'app') && (
        <div className="mt-3 flex min-w-0 items-center gap-1.5 rounded-lg border border-panel-border bg-slate-950/50 p-1.5">
          <input
            className="input h-9 min-w-0 flex-1"
            value={testPath}
            onChange={(e) => setTestPath(e.target.value || '/')}
            placeholder="/"
          />
          <button
            className="btn shrink-0 whitespace-nowrap px-3 py-1.5 text-xs sm:text-sm"
            onClick={async () => {
              try {
                const response = await axios.get(testUrl, {
                  headers: project.auth_enabled ? { 'x-api-key': project.api_key } : {},
                  responseType: 'text',
                })
                const contentType = String(response?.headers?.['content-type'] || '').toLowerCase()
                if (contentType.includes('application/json')) {
                  let parsed = response.data
                  if (typeof parsed === 'string') {
                    try { parsed = JSON.parse(parsed) } catch (_) {}
                  }
                  setTestResult(JSON.stringify(parsed, null, 2))
                } else {
                  setTestResult(String(response.data || ''))
                }
              } catch (err) {
                setTestResult(JSON.stringify(err?.response?.data || { error: err.message }, null, 2))
              }
            }}
          >
            {t('action_execute_test', 'Executar Teste')}
          </button>
        </div>
      )}

      {(project.type === 'api' || project.type === 'app') && (
        <div className="mt-3 card p-3">
          <div className="mb-2 text-sm font-medium">Resultado do teste ({testUrl})</div>
          <pre className="max-h-40 overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 text-xs">
            {testResult || 'Clique em "Executar Teste" para ver a resposta da rota.'}
          </pre>
        </div>
      )}
    </div>
  )
}

function EnvTab({ project, authHeaders, t }) {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ envKey: '', envValue: '', isSecret: false })

  async function load() {
    const { data } = await api.get(`/projects/${project.id}/env`, { headers: authHeaders })
    setList(data)
  }

  useEffect(() => { load() }, [project.id])

  return (
    <div>
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr,1fr,120px,120px]">
        <input className="input" placeholder="Chave" value={form.envKey} onChange={(e) => setForm({ ...form, envKey: e.target.value })} />
        <input className="input" placeholder="Valor" value={form.envValue} onChange={(e) => setForm({ ...form, envValue: e.target.value })} />
        <label className="btn flex items-center justify-center gap-2"><input type="checkbox" checked={form.isSecret} onChange={(e) => setForm({ ...form, isSecret: e.target.checked })} />Sensível</label>
        <button className="btn border-panel-accent text-panel-accent" onClick={async () => {
          await api.post(`/projects/${project.id}/env`, form, { headers: authHeaders })
          setForm({ envKey: '', envValue: '', isSecret: false })
          load()
        }}>Adicionar</button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-panel-border text-left text-slate-400">
            <th className="py-2">Chave</th><th>Valor</th><th>Sensível</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((item) => (
            <tr key={item.id} className="border-b border-panel-border/60">
              <td className="py-2">{item.envKey}</td>
              <td>{item.isSecret ? '********' : item.envValue}</td>
              <td>{item.isSecret ? 'Sim' : 'Não'}</td>
              <td className="text-right">
                <button className="btn text-xs" onClick={() => setForm({ envKey: item.envKey, envValue: item.envValue, isSecret: item.isSecret })}>Editar</button>
                <button className="btn ml-2 text-xs border-red-500 text-red-300" onClick={async () => {
                  await api.delete(`/projects/${project.id}/env/${encodeURIComponent(item.envKey)}`, { headers: authHeaders })
                  load()
                }}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SqlTab({ project, authHeaders, t }) {
  const [sql, setSql] = useState('SELECT name FROM sqlite_master WHERE type="table";')
  const [result, setResult] = useState(null)
  const [databases, setDatabases] = useState([])
  const [databasePath, setDatabasePath] = useState('database.db')
  const examples = [
    { label: 'Listar tabelas', sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;" },
    { label: 'Ver _meta', sql: 'SELECT * FROM _meta ORDER BY id DESC LIMIT 20;' },
    { label: 'Listar notas', sql: 'SELECT * FROM notas ORDER BY id DESC LIMIT 50;' },
    { label: 'Criar tabela exemplo', sql: 'CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);' },
    { label: 'Inserir cliente', sql: "INSERT INTO clientes (nome) VALUES ('Cliente Teste');" },
    { label: 'Listar clientes', sql: 'SELECT * FROM clientes ORDER BY id DESC LIMIT 50;' },
  ]

  async function loadDatabases() {
    const { data } = await api.get(`/projects/${project.id}/databases`, { headers: authHeaders })
    const nextDatabases = data?.databases || []
    setDatabases(nextDatabases)
    if (!nextDatabases.some((item) => item.path === databasePath)) {
      setDatabasePath(nextDatabases.some((item) => item.path === 'database.db') ? 'database.db' : (nextDatabases[0]?.path || 'database.db'))
    }
  }

  useEffect(() => {
    loadDatabases().catch((err) => {
      setResult({ error: err?.response?.data?.error || 'Falha ao listar bancos do projeto' })
    })
  }, [project.id])

  return (
    <div>
      <div className="mb-3 grid gap-2 md:grid-cols-[260px,1fr]">
        <select
          className="input"
          value={databasePath}
          onChange={(event) => {
            setDatabasePath(event.target.value)
            setResult(null)
          }}
        >
          {databases.map((database) => (
            <option key={database.path} value={database.path}>{database.path}</option>
          ))}
        </select>
        <div className="rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
          Banco do projeto: projects/{project.slug}/{databasePath}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button key={ex.label} className="btn text-xs" onClick={() => setSql(ex.sql)}>
            {ex.label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-2">
        <button className="btn border-panel-accent text-panel-accent" onClick={async () => {
          try {
            const { data } = await api.post(`/projects/${project.id}/sql/run`, { sql, databasePath }, { headers: authHeaders })
            setResult(data)
          } catch (e) {
            setResult({ error: e?.response?.data?.error || 'Erro SQL' })
          }
        }}>{t('action_run_sql', 'Executar SQL')}</button>
      </div>
      <Editor height="230px" defaultLanguage="sql" value={sql} onChange={(v) => setSql(v || '')} theme="vs-dark" />

      <div className="mt-3 overflow-auto rounded-lg border border-panel-border p-3">
        {result?.error && <div className="text-red-400">{result.error}</div>}
        {result?.type === 'exec' && <div className="text-emerald-300">{result.message}</div>}
        {result?.type === 'select' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-panel-border text-left text-slate-300">
                {(result.rows[0] ? Object.keys(result.rows[0]) : ['(sem colunas)']).map((k) => <th key={k} className="py-1 pr-3">{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-panel-border/40">
                  {Object.values(row).map((v, j) => <td key={j} className="py-1 pr-3">{String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function DepsTab({ project, authHeaders, t }) {
  const [deps, setDeps] = useState([])
  const [pkg, setPkg] = useState('axios')

  async function load() {
    const { data } = await api.get(`/projects/${project.id}/dependencies`, { headers: authHeaders })
    setDeps(data)
  }

  useEffect(() => { load() }, [project.id])

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="axios, sharp, xlsx..." />
        <button className="btn border-panel-accent text-panel-accent" onClick={async () => {
          await api.post(`/projects/${project.id}/dependencies`, { packageName: pkg }, { headers: authHeaders })
          load()
        }}>{t('action_install', 'Instalar')}</button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-panel-border text-left text-slate-400"><th className="py-2">Pacote</th><th>Versão</th><th>Instalado</th><th></th></tr>
        </thead>
        <tbody>
          {deps.map((d) => (
            <tr key={d.id} className="border-b border-panel-border/60">
              <td className="py-2">{d.packageName}</td>
              <td>{d.version}</td>
              <td>{new Date(d.installedAt).toLocaleString()}</td>
              <td className="text-right">
                <button
                  className="btn text-xs border-red-500 text-red-300"
                  onClick={async () => {
                    await api.delete(`/projects/${project.id}/dependencies/${encodeURIComponent(d.packageName)}`, { headers: authHeaders })
                    load()
                  }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SecurityTab({ project, authHeaders, onSaved, t }) {
  const [form, setForm] = useState({
    api_key: project.api_key || '',
    api_secret: '',
    auth_enabled: !!project.auth_enabled,
    rate_limit: project.rate_limit || 120,
    webhook_enabled: !!project.webhook_enabled,
  })

  useEffect(() => {
    setForm({
      api_key: project.api_key || '',
      api_secret: '',
      auth_enabled: !!project.auth_enabled,
      rate_limit: project.rate_limit || 120,
      webhook_enabled: !!project.webhook_enabled,
    })
  }, [project.id])

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <input className="input" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="x-api-key" />
      <input className="input" value={form.api_secret} onChange={(e) => setForm({ ...form, api_secret: e.target.value })} placeholder="api_secret" />
      <input className="input" type="number" value={form.rate_limit} onChange={(e) => setForm({ ...form, rate_limit: Number(e.target.value) })} placeholder="rate limit/min" />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.auth_enabled} onChange={(e) => setForm({ ...form, auth_enabled: e.target.checked })} />auth_enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.webhook_enabled} onChange={(e) => setForm({ ...form, webhook_enabled: e.target.checked })} />webhook on/off</label>
      </div>
      <button className="btn border-panel-accent text-panel-accent md:col-span-2" onClick={async () => {
        await api.put(`/projects/${project.id}`, form, { headers: authHeaders })
        onSaved()
      }}>{t('action_save', 'Salvar')}</button>
      <div className="text-xs text-slate-300 md:col-span-2">Webhook endpoint: /{project.slug}/webhook</div>
    </div>
  )
}

function LogsTab({ project, authHeaders, t }) {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [auto, setAuto] = useState(true)
  const listRef = useRef(null)

  async function load() {
    const url = filter === 'all' ? `/projects/${project.id}/logs` : `/projects/${project.id}/logs?level=${filter}`
    const { data } = await api.get(url, { headers: authHeaders })
    setLogs(data.reverse())
  }

  useEffect(() => { load() }, [project.id, filter])

  useEffect(() => {
    const socket = io('/', { transports: ['websocket'] })
    socket.emit('project:join', project.id)
    socket.on('project:log', (entry) => {
      setLogs((old) => [...old.slice(-499), entry])
    })
    return () => socket.disconnect()
  }, [project.id])

  useEffect(() => {
    if (auto && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [logs, auto])

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {['all', 'info', 'warning', 'error'].map((f) => (
          <button key={f} className={`btn ${filter === f ? 'border-panel-accent text-panel-accent' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <button className="btn" onClick={() => setAuto(!auto)}>{auto ? t('logs_autoscroll_on', 'Auto scroll ON') : t('logs_autoscroll_off', 'Auto scroll OFF')}</button>
        <button className="btn" onClick={async () => {
          await api.delete(`/projects/${project.id}/logs`, { headers: authHeaders })
          setLogs([])
        }}>{t('action_clear', 'Limpar')}</button>
        <button className="btn" onClick={() => {
          const blob = new Blob([logs.map((l) => `[${new Date(l.createdAt).toLocaleTimeString()}] [${l.level}] ${l.message}`).join('\n')], { type: 'text/plain' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `${project.slug}-logs.txt`
          a.click()
          URL.revokeObjectURL(a.href)
        }}>{t('action_download_log', 'Baixar log')}</button>
      </div>

      <div ref={listRef} className="h-[420px] overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 font-mono text-xs">
        {logs.map((l) => (
          <div key={l.id} className={l.level === 'error' ? 'text-red-300' : l.level === 'warning' ? 'text-amber-300' : 'text-cyan-200'}>
            [{new Date(l.createdAt).toLocaleTimeString()}] [{l.level}] {l.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function VersionsTab({ project, authHeaders, onRestored, t }) {
  const [versions, setVersions] = useState([])
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [compare, setCompare] = useState('')

  async function load() {
    const { data } = await api.get(`/projects/${project.id}/versions`, { headers: authHeaders })
    setVersions(data)
  }

  useEffect(() => { load() }, [project.id])

  async function doCompare() {
    if (!leftId || !rightId) return
    const l = await api.get(`/projects/${project.id}/versions/${leftId}`, { headers: authHeaders })
    const r = await api.get(`/projects/${project.id}/versions/${rightId}`, { headers: authHeaders })
    setCompare(`// ${l.data.versionTag} (${l.data.createdAt})\n${l.data.code}\n\n// ${r.data.versionTag} (${r.data.createdAt})\n${r.data.code}`)
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-panel-border text-left text-slate-400"><th className="py-2">Versão</th><th>Data</th><th>Autor</th><th></th></tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-panel-border/60">
              <td className="py-2">{v.versionTag}</td>
              <td>{new Date(v.createdAt).toLocaleString()}</td>
              <td>{v.author}</td>
              <td className="text-right">
                <button className="btn text-xs" onClick={async () => {
                  const { data } = await api.get(`/projects/${project.id}/versions/${v.id}`, { headers: authHeaders })
                  setCompare(data.code)
                }}>{t('action_view', 'Visualizar')}</button>
                <button className="btn ml-2 text-xs" onClick={async () => {
                  await api.post(`/projects/${project.id}/restore/${v.id}`, {}, { headers: authHeaders })
                  onRestored()
                  load()
                }}>{t('action_restore', 'Restaurar')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap gap-2">
        <select className="input max-w-[180px]" value={leftId} onChange={(e) => setLeftId(e.target.value)}><option value="">Comparar v1</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.versionTag}</option>)}</select>
        <select className="input max-w-[180px]" value={rightId} onChange={(e) => setRightId(e.target.value)}><option value="">Comparar v2</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.versionTag}</option>)}</select>
        <button className="btn" onClick={doCompare}>{t('action_compare', 'Comparar')}</button>
      </div>

      <div className="mt-3">
        <Editor height="280px" defaultLanguage="javascript" value={compare} options={{ readOnly: true }} theme="vs-dark" />
      </div>
    </div>
  )
}

function MonitorTab({ project, authHeaders, onRefreshProject, t }) {
  const [stats, setStats] = useState(null)

  async function load() {
    const { data } = await api.get(`/projects/${project.id}/stats`, { headers: authHeaders })
    setStats(data)
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 3000)
    return () => clearInterval(i)
  }, [project.id])

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="CPU" value={`${stats?.cpu ?? 0}%`} />
      <Card title="RAM" value={`${stats?.memoryMB ?? 0} MB`} />
      <Card title="Uptime" value={`${stats?.uptimeSec ?? 0}s`} />
      <Card title="Status" value={stats?.status || '-'} />
      <div className="md:col-span-2 flex gap-2">
        <button className="btn" onClick={async () => { await api.post(`/projects/${project.id}/restart`, {}, { headers: authHeaders }); onRefreshProject() }}>{t('action_restart', 'Reiniciar')}</button>
        {project.type === 'worker' && <button className="btn" onClick={async () => { await api.post(`/projects/${project.id}/run-now`, { params: {} }, { headers: authHeaders }) }}>{t('action_run_now', 'Executar Agora')}</button>}
      </div>
    </div>
  )
}
