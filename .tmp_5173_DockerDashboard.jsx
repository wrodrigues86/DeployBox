import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/components/docker/DockerDashboard.jsx");import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=6eb28f03"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
let prevRefreshReg;
let prevRefreshSig;
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}
var _s = $RefreshSig$();
import __vite__cjsImport3_react from "/node_modules/.vite/deps/react.js?v=6eb28f03"; const useEffect = __vite__cjsImport3_react["useEffect"]; const useState = __vite__cjsImport3_react["useState"];
import useDockerConfig from "/src/hooks/useDockerConfig.js";
const tabs = [
  { key: "overview", labelKey: "docker_tab_overview", fallback: "VisÃ£o geral" },
  { key: "build", labelKey: "docker_tab_build", fallback: "Build" },
  { key: "runtime", labelKey: "docker_tab_runtime", fallback: "ExecuÃ§Ã£o" },
  { key: "domain", labelKey: "docker_tab_domain", fallback: "DomÃ­nio" },
  { key: "logs", labelKey: "docker_tab_logs", fallback: "Logs" },
  { key: "deploy", labelKey: "docker_tab_deploy", fallback: "PublicaÃ§Ã£o" }
];
export default function DockerDashboard({ project, authHeaders, onSaved, t }) {
  _s();
  const [tab, setTab] = useState("overview");
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
    handleLogs
  } = useDockerConfig(project, authHeaders);
  useEffect(() => {
    loadConfig().catch(() => {
    });
  }, [project?.id]);
  if (loading || !config) return /* @__PURE__ */ jsxDEV("div", { className: "card mt-3 p-4 text-sm text-slate-300", children: "Carregando Docker..." }, void 0, false, {
    fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
    lineNumber: 52,
    columnNumber: 34
  }, this);
  const urlPreview = config.subdomain && config.domainBase ? `${config.subdomain}.${config.domainBase}` : "-";
  const ipPreview = `${window.location.protocol}//${window.location.hostname}:${config.externalPort || "3000"}`;
  const cmdPreview = `docker build -t deploybox-${project.slug}:latest .`;
  return /* @__PURE__ */ jsxDEV("div", { className: "mt-3 space-y-3", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "grid grid-cols-2 gap-2 md:grid-cols-6", children: tabs.map(
      (item) => /* @__PURE__ */ jsxDEV(
        "button",
        {
          className: `btn text-xs ${tab === item.key ? "border-panel-accent text-panel-accent" : ""}`,
          onClick: () => setTab(item.key),
          children: t(item.labelKey, item.fallback)
        },
        item.key,
        false,
        {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 62,
          columnNumber: 9
        },
        this
      )
    ) }, void 0, false, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 60,
      columnNumber: 7
    }, this),
    tab === "overview" && /* @__PURE__ */ jsxDEV("div", { className: "card space-y-2 p-4", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "text-sm", children: [
        t("docker_status", "Status"),
        ": ",
        project.status || "-"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 73,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "text-sm", children: [
        t("docker_image", "Imagem"),
        ": deploybox-",
        project.slug,
        ":latest"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 74,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "text-sm", children: [
        t("docker_ports", "Portas"),
        ": ",
        config.externalPort,
        " -> ",
        config.internalPort
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 75,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "text-sm", children: [
        t("docker_domain", "DomÃ­nio"),
        ": ",
        urlPreview
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 76,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "text-sm", children: [
        t("docker_ip", "IP"),
        ": ",
        ipPreview
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 77,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleRun();
          onSaved?.();
        }, children: t("docker_action_start", "Iniciar") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 79,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleStop();
          onSaved?.();
        }, children: t("docker_action_stop", "Parar") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 80,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleRestart();
          onSaved?.();
        }, children: t("docker.actions.restart", "Reiniciar") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 81,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleRebuild(config);
          onSaved?.();
        }, children: t("docker_action_rebuild", "Rebuild") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 82,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleLogs();
        }, children: "Logs" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 83,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 78,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 72,
      columnNumber: 30
    }, this),
    tab === "build" && /* @__PURE__ */ jsxDEV("div", { className: "card space-y-2 p-4", children: [
      /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.dockerfilePath, onChange: (e) => setConfig({ ...config, dockerfilePath: e.target.value }) }, void 0, false, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 88,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.buildContext, onChange: (e) => setConfig({ ...config, buildContext: e.target.value }) }, void 0, false, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 89,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("textarea", { className: "input min-h-[220px] font-mono text-xs", value: config.dockerfile, onChange: (e) => setConfig({ ...config, dockerfile: e.target.value }) }, void 0, false, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 90,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs", children: cmdPreview }, void 0, false, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 91,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 87,
      columnNumber: 27
    }, this),
    tab === "runtime" && /* @__PURE__ */ jsxDEV("div", { className: "card space-y-2 p-4", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.externalPort, onChange: (e) => setConfig({ ...config, externalPort: e.target.value.replace(/[^\d]/g, "") }), placeholder: "Porta externa" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 95,
          columnNumber: 49
        }, this),
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.internalPort, onChange: (e) => setConfig({ ...config, internalPort: e.target.value.replace(/[^\d]/g, "") }), placeholder: "Porta interna" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 95,
          columnNumber: 227
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 95,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("select", { className: "input", value: config.restartPolicy, onChange: (e) => setConfig({ ...config, restartPolicy: e.target.value }), children: [
        /* @__PURE__ */ jsxDEV("option", { value: "no", children: "no" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 96,
          columnNumber: 138
        }, this),
        /* @__PURE__ */ jsxDEV("option", { value: "always", children: "always" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 96,
          columnNumber: 168
        }, this),
        /* @__PURE__ */ jsxDEV("option", { value: "unless-stopped", children: "unless-stopped" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 96,
          columnNumber: 206
        }, this),
        /* @__PURE__ */ jsxDEV("option", { value: "on-failure", children: "on-failure" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 96,
          columnNumber: 260
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 96,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.cpuLimit, onChange: (e) => setConfig({ ...config, cpuLimit: e.target.value }), placeholder: "CPU" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 97,
          columnNumber: 49
        }, this),
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.memoryMb, onChange: (e) => setConfig({ ...config, memoryMb: e.target.value }), placeholder: "MemÃ³ria (MB)" }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 97,
          columnNumber: 187
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 97,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 94,
      columnNumber: 29
    }, this),
    tab === "domain" && /* @__PURE__ */ jsxDEV("div", { className: "card space-y-2 p-4", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.subdomain, onChange: (e) => setConfig({ ...config, subdomain: e.target.value }) }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 101,
          columnNumber: 49
        }, this),
        /* @__PURE__ */ jsxDEV("input", { className: "input", value: config.domainBase, onChange: (e) => setConfig({ ...config, domainBase: e.target.value }) }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 101,
          columnNumber: 171
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 101,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "rounded-lg border border-panel-border bg-slate-950/40 px-3 py-2 text-xs", children: urlPreview }, void 0, false, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 102,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("label", { className: "btn flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { type: "checkbox", checked: config.enableSSL, onChange: (e) => setConfig({ ...config, enableSSL: e.target.checked }) }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 103,
          columnNumber: 56
        }, this),
        "SSL automÃ¡tico"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 103,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("label", { className: "btn flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { type: "checkbox", checked: config.forceHTTPS, onChange: (e) => setConfig({ ...config, forceHTTPS: e.target.checked }) }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 104,
          columnNumber: 56
        }, this),
        "ForÃ§ar HTTPS"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 104,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 100,
      columnNumber: 28
    }, this),
    tab === "deploy" && /* @__PURE__ */ jsxDEV("div", { className: "card space-y-2 p-4", children: [
      /* @__PURE__ */ jsxDEV("div", { children: [
        "RepositÃ³rio: ",
        config.repository || "-"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 108,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { children: [
        "Branch: ",
        config.branch || "-"
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 109,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("label", { className: "btn flex items-center gap-2", children: [
        /* @__PURE__ */ jsxDEV("input", { type: "checkbox", checked: config.autoDeploy, onChange: (e) => setConfig({ ...config, autoDeploy: e.target.checked }) }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 110,
          columnNumber: 56
        }, this),
        t("docker_action_auto_deploy", "Deploy automÃ¡tico")
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 110,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleBuild(config);
        }, children: t("docker_action_update_code", "Atualizar cÃ³digo") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 112,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", disabled: !!actionLoading, onClick: async () => {
          await handleRebuild(config);
        }, children: t("docker_action_rebuild", "Rebuild") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 113,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn border-emerald-500 text-emerald-300", disabled: !!actionLoading, onClick: async () => {
          await handleRestart();
          onSaved?.();
        }, children: t("docker.actions.deploy", "Publicar") }, void 0, false, {
          fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
          lineNumber: 114,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
        lineNumber: 111,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 107,
      columnNumber: 28
    }, this),
    tab === "logs" && /* @__PURE__ */ jsxDEV("div", { className: "card p-4", children: /* @__PURE__ */ jsxDEV("pre", { className: "max-h-[320px] overflow-auto rounded-lg border border-panel-border bg-slate-950 p-3 text-xs", children: logsOutput || t("docker_no_logs", "Sem logs") }, void 0, false, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 118,
      columnNumber: 52
    }, this) }, void 0, false, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 118,
      columnNumber: 26
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "card flex flex-wrap gap-2 p-3", children: /* @__PURE__ */ jsxDEV("button", { className: "btn border-panel-accent text-panel-accent", disabled: saving || !!actionLoading, onClick: () => saveConfig(config), children: t("docker_action_save_settings", "Salvar configuraÃ§Ãµes") }, void 0, false, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 121,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
      lineNumber: 120,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx",
    lineNumber: 59,
    columnNumber: 5
  }, this);
}
_s(DockerDashboard, "aFKt4m61hW4VJD3utkJeeqw/jlw=", false, function() {
  return [useDockerConfig];
});
_c = DockerDashboard;
var _c;
$RefreshReg$(_c, "DockerDashboard");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("C:/SOURCE/site/node manager/client/src/components/docker/DockerDashboard.jsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,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QVMsTUFBTUcsV0FBV1AsTUFBTSxHQUFJSixZQUFFLCtCQUErQixzQkFBc0IsS0FBOUw7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUFnTSxLQURsTTtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBRUE7QUFBQSxPQS9ERjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBZ0VBO0FBRUo7QUFBQ0MsR0E3RnVCTCxpQkFBZTtBQUFBLFVBaUJqQ0wsZUFBZTtBQUFBO0FBQUEsS0FqQkdLO0FBQWUsSUFBQXVEO0FBQUEsYUFBQUEsSUFBQSIsIm5hbWVzIjpbInVzZUVmZmVjdCIsInVzZVN0YXRlIiwidXNlRG9ja2VyQ29uZmlnIiwidGFicyIsImtleSIsImxhYmVsS2V5IiwiZmFsbGJhY2siLCJEb2NrZXJEYXNoYm9hcmQiLCJwcm9qZWN0IiwiYXV0aEhlYWRlcnMiLCJvblNhdmVkIiwidCIsIl9zIiwidGFiIiwic2V0VGFiIiwiY29uZmlnIiwic2V0Q29uZmlnIiwibG9hZGluZyIsInNhdmluZyIsImFjdGlvbkxvYWRpbmciLCJsb2dzT3V0cHV0IiwibG9hZENvbmZpZyIsInNhdmVDb25maWciLCJoYW5kbGVCdWlsZCIsImhhbmRsZVJ1biIsImhhbmRsZVN0b3AiLCJoYW5kbGVSZXN0YXJ0IiwiaGFuZGxlUmVidWlsZCIsImhhbmRsZUxvZ3MiLCJjYXRjaCIsImlkIiwidXJsUHJldmlldyIsInN1YmRvbWFpbiIsImRvbWFpbkJhc2UiLCJpcFByZXZpZXciLCJ3aW5kb3ciLCJsb2NhdGlvbiIsInByb3RvY29sIiwiaG9zdG5hbWUiLCJleHRlcm5hbFBvcnQiLCJjbWRQcmV2aWV3Iiwic2x1ZyIsIm1hcCIsIml0ZW0iLCJzdGF0dXMiLCJpbnRlcm5hbFBvcnQiLCJkb2NrZXJmaWxlUGF0aCIsImUiLCJ0YXJnZXQiLCJ2YWx1ZSIsImJ1aWxkQ29udGV4dCIsImRvY2tlcmZpbGUiLCJyZXBsYWNlIiwicmVzdGFydFBvbGljeSIsImNwdUxpbWl0IiwibWVtb3J5TWIiLCJlbmFibGVTU0wiLCJjaGVja2VkIiwiZm9yY2VIVFRQUyIsInJlcG9zaXRvcnkiLCJicmFuY2giLCJhdXRvRGVwbG95IiwiX2MiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZXMiOlsiRG9ja2VyRGFzaGJvYXJkLmpzeCJdLCJzb3VyY2VzQ29udGVudCI6WyLvu79pbXBvcnQgeyB1c2VFZmZlY3QsIHVzZVN0YXRlIH0gZnJvbSAncmVhY3QnXG5pbXBvcnQgdXNlRG9ja2VyQ29uZmlnIGZyb20gJy4uLy4uL2hvb2tzL3VzZURvY2tlckNvbmZpZydcblxuY29uc3QgdGFicyA9IFtcbiAgeyBrZXk6ICdvdmVydmlldycsIGxhYmVsS2V5OiAnZG9ja2VyX3RhYl9vdmVydmlldycsIGZhbGxiYWNrOiAnVmlzw6NvIGdlcmFsJyB9LFxuICB7IGtleTogJ2J1aWxkJywgbGFiZWxLZXk6ICdkb2NrZXJfdGFiX2J1aWxkJywgZmFsbGJhY2s6ICdCdWlsZCcgfSxcbiAgeyBrZXk6ICdydW50aW1lJywgbGFiZWxLZXk6ICdkb2NrZXJfdGFiX3J1bnRpbWUnLCBmYWxsYmFjazogJ0V4ZWN1w6fDo28nIH0sXG4gIHsga2V5OiAnZG9tYWluJywgbGFiZWxLZXk6ICdkb2NrZXJfdGFiX2RvbWFpbicsIGZhbGxiYWNrOiAnRG9tw61uaW8nIH0sXG4gIHsga2V5OiAnbG9ncycsIGxhYmVsS2V5OiAnZG9ja2VyX3RhYl9sb2dzJywgZmFsbGJhY2s6ICdMb2dzJyB9LFxuICB7IGtleTogJ2RlcGxveScsIGxhYmVsS2V5OiAnZG9ja2VyX3RhYl9kZXBsb3knLCBmYWxsYmFjazogJ1B1YmxpY2HDp8OjbycgfSxcbl1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRG9ja2VyRGFzaGJvYXJkKHsgcHJvamVjdCwgYXV0aEhlYWRlcnMsIG9uU2F2ZWQsIHQgfSkge1xuICBjb25zdCBbdGFiLCBzZXRUYWJdID0gdXNlU3RhdGUoJ292ZXJ2aWV3JylcbiAgY29uc3Qge1xuICAgIGNvbmZpZyxcbiAgICBzZXRDb25maWcsXG4gICAgbG9hZGluZyxcbiAgICBzYXZpbmcsXG4gICAgYWN0aW9uTG9hZGluZyxcbiAgICBsb2dzT3V0cHV0LFxuICAgIGxvYWRDb25maWcsXG4gICAgc2F2ZUNvbmZpZyxcbiAgICBoYW5kbGVCdWlsZCxcbiAgICBoYW5kbGVSdW4sXG4gICAgaGFuZGxlU3RvcCxcbiAgICBoYW5kbGVSZXN0YXJ0LFxuICAgIGhhbmRsZVJlYnVpbGQsXG4gICAgaGFuZGxlTG9ncyxcbiAgfSA9IHVzZURvY2tlckNvbmZpZyhwcm9qZWN0LCBhdXRoSGVhZGVycylcblxuICB1c2VFZmZlY3QoKCkgPT4geyBsb2FkQ29uZmlnKCkuY2F0Y2goKCkgPT4ge30pIH0sIFtwcm9qZWN0Py5pZF0pXG4gIGlmIChsb2FkaW5nIHx8ICFjb25maWcpIHJldHVybiA8ZGl2IGNsYXNzTmFtZT1cImNhcmQgbXQtMyBwLTQgdGV4dC1zbSB0ZXh0LXNsYXRlLTMwMFwiPkNhcnJlZ2FuZG8gRG9ja2VyLi4uPC9kaXY+XG5cbiAgY29uc3QgdXJsUHJldmlldyA9IGNvbmZpZy5zdWJkb21haW4gJiYgY29uZmlnLmRvbWFpbkJhc2UgPyBgJHtjb25maWcuc3ViZG9tYWlufS4ke2NvbmZpZy5kb21haW5CYXNlfWAgOiAnLSdcbiAgY29uc3QgaXBQcmV2aWV3ID0gYCR7d2luZG93LmxvY2F0aW9uLnByb3RvY29sfS8vJHt3aW5kb3cubG9jYXRpb24uaG9zdG5hbWV9OiR7Y29uZmlnLmV4dGVybmFsUG9ydCB8fCAnMzAwMCd9YFxuICBjb25zdCBjbWRQcmV2aWV3ID0gYGRvY2tlciBidWlsZCAtdCBkZXBsb3lib3gtJHtwcm9qZWN0LnNsdWd9OmxhdGVzdCAuYFxuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJtdC0zIHNwYWNlLXktM1wiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJncmlkIGdyaWQtY29scy0yIGdhcC0yIG1kOmdyaWQtY29scy02XCI+XG4gICAgICAgIHt0YWJzLm1hcCgoaXRlbSkgPT4gKFxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIGtleT17aXRlbS5rZXl9XG4gICAgICAgICAgICBjbGFzc05hbWU9e2BidG4gdGV4dC14cyAke3RhYiA9PT0gaXRlbS5rZXkgPyAnYm9yZGVyLXBhbmVsLWFjY2VudCB0ZXh0LXBhbmVsLWFjY2VudCcgOiAnJ31gfVxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0VGFiKGl0ZW0ua2V5KX1cbiAgICAgICAgICA+XG4gICAgICAgICAgICB7dChpdGVtLmxhYmVsS2V5LCBpdGVtLmZhbGxiYWNrKX1cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKSl9XG4gICAgICA8L2Rpdj5cblxuICAgICAge3RhYiA9PT0gJ292ZXJ2aWV3JyAmJiA8ZGl2IGNsYXNzTmFtZT1cImNhcmQgc3BhY2UteS0yIHAtNFwiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc21cIj57dCgnZG9ja2VyX3N0YXR1cycsICdTdGF0dXMnKX06IHtwcm9qZWN0LnN0YXR1cyB8fCAnLSd9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbVwiPnt0KCdkb2NrZXJfaW1hZ2UnLCAnSW1hZ2VtJyl9OiBkZXBsb3lib3gte3Byb2plY3Quc2x1Z306bGF0ZXN0PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbVwiPnt0KCdkb2NrZXJfcG9ydHMnLCAnUG9ydGFzJyl9OiB7Y29uZmlnLmV4dGVybmFsUG9ydH0gLSZndDsge2NvbmZpZy5pbnRlcm5hbFBvcnR9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbVwiPnt0KCdkb2NrZXJfZG9tYWluJywgJ0RvbcOtbmlvJyl9OiB7dXJsUHJldmlld308L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtXCI+e3QoJ2RvY2tlcl9pcCcsICdJUCcpfToge2lwUHJldmlld308L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtd3JhcCBnYXAtMlwiPlxuICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuXCIgZGlzYWJsZWQ9eyEhYWN0aW9uTG9hZGluZ30gb25DbGljaz17YXN5bmMgKCkgPT4geyBhd2FpdCBoYW5kbGVSdW4oKTsgb25TYXZlZD8uKCkgfX0+e3QoJ2RvY2tlcl9hY3Rpb25fc3RhcnQnLCAnSW5pY2lhcicpfTwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuXCIgZGlzYWJsZWQ9eyEhYWN0aW9uTG9hZGluZ30gb25DbGljaz17YXN5bmMgKCkgPT4geyBhd2FpdCBoYW5kbGVTdG9wKCk7IG9uU2F2ZWQ/LigpIH19Pnt0KCdkb2NrZXJfYWN0aW9uX3N0b3AnLCAnUGFyYXInKX08L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0blwiIGRpc2FibGVkPXshIWFjdGlvbkxvYWRpbmd9IG9uQ2xpY2s9e2FzeW5jICgpID0+IHsgYXdhaXQgaGFuZGxlUmVzdGFydCgpOyBvblNhdmVkPy4oKSB9fT57dCgnZG9ja2VyLmFjdGlvbnMucmVzdGFydCcsICdSZWluaWNpYXInKX08L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0blwiIGRpc2FibGVkPXshIWFjdGlvbkxvYWRpbmd9IG9uQ2xpY2s9e2FzeW5jICgpID0+IHsgYXdhaXQgaGFuZGxlUmVidWlsZChjb25maWcpOyBvblNhdmVkPy4oKSB9fT57dCgnZG9ja2VyX2FjdGlvbl9yZWJ1aWxkJywgJ1JlYnVpbGQnKX08L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0blwiIGRpc2FibGVkPXshIWFjdGlvbkxvYWRpbmd9IG9uQ2xpY2s9e2FzeW5jICgpID0+IHsgYXdhaXQgaGFuZGxlTG9ncygpIH19PkxvZ3M8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj59XG5cbiAgICAgIHt0YWIgPT09ICdidWlsZCcgJiYgPGRpdiBjbGFzc05hbWU9XCJjYXJkIHNwYWNlLXktMiBwLTRcIj5cbiAgICAgICAgPGlucHV0IGNsYXNzTmFtZT1cImlucHV0XCIgdmFsdWU9e2NvbmZpZy5kb2NrZXJmaWxlUGF0aH0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGRvY2tlcmZpbGVQYXRoOiBlLnRhcmdldC52YWx1ZSB9KX0gLz5cbiAgICAgICAgPGlucHV0IGNsYXNzTmFtZT1cImlucHV0XCIgdmFsdWU9e2NvbmZpZy5idWlsZENvbnRleHR9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0Q29uZmlnKHsgLi4uY29uZmlnLCBidWlsZENvbnRleHQ6IGUudGFyZ2V0LnZhbHVlIH0pfSAvPlxuICAgICAgICA8dGV4dGFyZWEgY2xhc3NOYW1lPVwiaW5wdXQgbWluLWgtWzIyMHB4XSBmb250LW1vbm8gdGV4dC14c1wiIHZhbHVlPXtjb25maWcuZG9ja2VyZmlsZX0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGRvY2tlcmZpbGU6IGUudGFyZ2V0LnZhbHVlIH0pfSAvPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci1wYW5lbC1ib3JkZXIgYmctc2xhdGUtOTUwLzQwIHB4LTMgcHktMiB0ZXh0LXhzXCI+e2NtZFByZXZpZXd9PC9kaXY+XG4gICAgICA8L2Rpdj59XG5cbiAgICAgIHt0YWIgPT09ICdydW50aW1lJyAmJiA8ZGl2IGNsYXNzTmFtZT1cImNhcmQgc3BhY2UteS0yIHAtNFwiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImdyaWQgZ3JpZC1jb2xzLTIgZ2FwLTJcIj48aW5wdXQgY2xhc3NOYW1lPVwiaW5wdXRcIiB2YWx1ZT17Y29uZmlnLmV4dGVybmFsUG9ydH0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGV4dGVybmFsUG9ydDogZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW15cXGRdL2csICcnKSB9KX0gcGxhY2Vob2xkZXI9XCJQb3J0YSBleHRlcm5hXCIgLz48aW5wdXQgY2xhc3NOYW1lPVwiaW5wdXRcIiB2YWx1ZT17Y29uZmlnLmludGVybmFsUG9ydH0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGludGVybmFsUG9ydDogZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW15cXGRdL2csICcnKSB9KX0gcGxhY2Vob2xkZXI9XCJQb3J0YSBpbnRlcm5hXCIgLz48L2Rpdj5cbiAgICAgICAgPHNlbGVjdCBjbGFzc05hbWU9XCJpbnB1dFwiIHZhbHVlPXtjb25maWcucmVzdGFydFBvbGljeX0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIHJlc3RhcnRQb2xpY3k6IGUudGFyZ2V0LnZhbHVlIH0pfT48b3B0aW9uIHZhbHVlPVwibm9cIj5ubzwvb3B0aW9uPjxvcHRpb24gdmFsdWU9XCJhbHdheXNcIj5hbHdheXM8L29wdGlvbj48b3B0aW9uIHZhbHVlPVwidW5sZXNzLXN0b3BwZWRcIj51bmxlc3Mtc3RvcHBlZDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9XCJvbi1mYWlsdXJlXCI+b24tZmFpbHVyZTwvb3B0aW9uPjwvc2VsZWN0PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImdyaWQgZ3JpZC1jb2xzLTIgZ2FwLTJcIj48aW5wdXQgY2xhc3NOYW1lPVwiaW5wdXRcIiB2YWx1ZT17Y29uZmlnLmNwdUxpbWl0fSBvbkNoYW5nZT17KGUpID0+IHNldENvbmZpZyh7IC4uLmNvbmZpZywgY3B1TGltaXQ6IGUudGFyZ2V0LnZhbHVlIH0pfSBwbGFjZWhvbGRlcj1cIkNQVVwiIC8+PGlucHV0IGNsYXNzTmFtZT1cImlucHV0XCIgdmFsdWU9e2NvbmZpZy5tZW1vcnlNYn0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIG1lbW9yeU1iOiBlLnRhcmdldC52YWx1ZSB9KX0gcGxhY2Vob2xkZXI9XCJNZW3Ds3JpYSAoTUIpXCIgLz48L2Rpdj5cbiAgICAgIDwvZGl2Pn1cblxuICAgICAge3RhYiA9PT0gJ2RvbWFpbicgJiYgPGRpdiBjbGFzc05hbWU9XCJjYXJkIHNwYWNlLXktMiBwLTRcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJncmlkIGdyaWQtY29scy0yIGdhcC0yXCI+PGlucHV0IGNsYXNzTmFtZT1cImlucHV0XCIgdmFsdWU9e2NvbmZpZy5zdWJkb21haW59IG9uQ2hhbmdlPXsoZSkgPT4gc2V0Q29uZmlnKHsgLi4uY29uZmlnLCBzdWJkb21haW46IGUudGFyZ2V0LnZhbHVlIH0pfSAvPjxpbnB1dCBjbGFzc05hbWU9XCJpbnB1dFwiIHZhbHVlPXtjb25maWcuZG9tYWluQmFzZX0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGRvbWFpbkJhc2U6IGUudGFyZ2V0LnZhbHVlIH0pfSAvPjwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci1wYW5lbC1ib3JkZXIgYmctc2xhdGUtOTUwLzQwIHB4LTMgcHktMiB0ZXh0LXhzXCI+e3VybFByZXZpZXd9PC9kaXY+XG4gICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJidG4gZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17Y29uZmlnLmVuYWJsZVNTTH0gb25DaGFuZ2U9eyhlKSA9PiBzZXRDb25maWcoeyAuLi5jb25maWcsIGVuYWJsZVNTTDogZS50YXJnZXQuY2hlY2tlZCB9KX0gLz5TU0wgYXV0b23DoXRpY288L2xhYmVsPlxuICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiYnRuIGZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+PGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ9e2NvbmZpZy5mb3JjZUhUVFBTfSBvbkNoYW5nZT17KGUpID0+IHNldENvbmZpZyh7IC4uLmNvbmZpZywgZm9yY2VIVFRQUzogZS50YXJnZXQuY2hlY2tlZCB9KX0gLz5Gb3LDp2FyIEhUVFBTPC9sYWJlbD5cbiAgICAgIDwvZGl2Pn1cblxuICAgICAge3RhYiA9PT0gJ2RlcGxveScgJiYgPGRpdiBjbGFzc05hbWU9XCJjYXJkIHNwYWNlLXktMiBwLTRcIj5cbiAgICAgICAgPGRpdj5SZXBvc2l0w7NyaW86IHtjb25maWcucmVwb3NpdG9yeSB8fCAnLSd9PC9kaXY+XG4gICAgICAgIDxkaXY+QnJhbmNoOiB7Y29uZmlnLmJyYW5jaCB8fCAnLSd9PC9kaXY+XG4gICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJidG4gZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17Y29uZmlnLmF1dG9EZXBsb3l9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0Q29uZmlnKHsgLi4uY29uZmlnLCBhdXRvRGVwbG95OiBlLnRhcmdldC5jaGVja2VkIH0pfSAvPnt0KCdkb2NrZXJfYWN0aW9uX2F1dG9fZGVwbG95JywgJ0RlcGxveSBhdXRvbcOhdGljbycpfTwvbGFiZWw+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBnYXAtMlwiPlxuICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPVwiYnRuXCIgZGlzYWJsZWQ9eyEhYWN0aW9uTG9hZGluZ30gb25DbGljaz17YXN5bmMgKCkgPT4geyBhd2FpdCBoYW5kbGVCdWlsZChjb25maWcpIH19Pnt0KCdkb2NrZXJfYWN0aW9uX3VwZGF0ZV9jb2RlJywgJ0F0dWFsaXphciBjw7NkaWdvJyl9PC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG5cIiBkaXNhYmxlZD17ISFhY3Rpb25Mb2FkaW5nfSBvbkNsaWNrPXthc3luYyAoKSA9PiB7IGF3YWl0IGhhbmRsZVJlYnVpbGQoY29uZmlnKSB9fT57dCgnZG9ja2VyX2FjdGlvbl9yZWJ1aWxkJywgJ1JlYnVpbGQnKX08L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImJ0biBib3JkZXItZW1lcmFsZC01MDAgdGV4dC1lbWVyYWxkLTMwMFwiIGRpc2FibGVkPXshIWFjdGlvbkxvYWRpbmd9IG9uQ2xpY2s9e2FzeW5jICgpID0+IHsgYXdhaXQgaGFuZGxlUmVzdGFydCgpOyBvblNhdmVkPy4oKSB9fT57dCgnZG9ja2VyLmFjdGlvbnMuZGVwbG95JywgJ1B1YmxpY2FyJyl9PC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+fVxuXG4gICAgICB7dGFiID09PSAnbG9ncycgJiYgPGRpdiBjbGFzc05hbWU9XCJjYXJkIHAtNFwiPjxwcmUgY2xhc3NOYW1lPVwibWF4LWgtWzMyMHB4XSBvdmVyZmxvdy1hdXRvIHJvdW5kZWQtbGcgYm9yZGVyIGJvcmRlci1wYW5lbC1ib3JkZXIgYmctc2xhdGUtOTUwIHAtMyB0ZXh0LXhzXCI+e2xvZ3NPdXRwdXQgfHwgdCgnZG9ja2VyX25vX2xvZ3MnLCAnU2VtIGxvZ3MnKX08L3ByZT48L2Rpdj59XG5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiY2FyZCBmbGV4IGZsZXgtd3JhcCBnYXAtMiBwLTNcIj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJidG4gYm9yZGVyLXBhbmVsLWFjY2VudCB0ZXh0LXBhbmVsLWFjY2VudFwiIGRpc2FibGVkPXtzYXZpbmcgfHwgISFhY3Rpb25Mb2FkaW5nfSBvbkNsaWNrPXsoKSA9PiBzYXZlQ29uZmlnKGNvbmZpZyl9Pnt0KCdkb2NrZXJfYWN0aW9uX3NhdmVfc2V0dGluZ3MnLCAnU2FsdmFyIGNvbmZpZ3VyYcOnw7VlcycpfTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIClcbn1cclxuIl0sImZpbGUiOiJDOi9TT1VSQ0Uvc2l0ZS9ub2RlIG1hbmFnZXIvY2xpZW50L3NyYy9jb21wb25lbnRzL2RvY2tlci9Eb2NrZXJEYXNoYm9hcmQuanN4In0=
