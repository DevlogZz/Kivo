export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatSavedAt() {
  return new Date().toLocaleString();
}

export function createRow(prefix) {
  return { id: createId(prefix), key: "", value: "", enabled: true };
}

export function createEmptyResponse() {
  return {
    status: 0,
    badge: "Waiting",
    statusText: "No response yet",
    duration: "0 ms",
    size: "0 B",
    headers: {},
    cookies: [],
    body: "Send a request to inspect the response.",
    rawBody: "Send a request to inspect the response.",
    isJson: false,
    meta: {
      url: "-",
      method: "-"
    },
    savedAt: ""
  };
}

export function createRequest(name = "New Request") {
  return {
    id: createId("request"),
    name,
    pinned: false,
    method: "GET",
    url: "",
    queryParams: [createRow("param")],
    headers: [createRow("header")],
    auth: { type: "none", token: "" },
    bodyType: "json",
    body: "",
    bodyRows: [createRow("body")],
    graphqlVariables: "{\n\n}",
    docs: "",
    activeEditorTab: "Params",
    activeResponseTab: "Body",
    responseBodyView: "JSON",
    lastResponse: null
  };
}

export function createWorkspace(name, description = "") {
  return {
    id: createId("workspace"),
    name,
    description,
    requests: [],
    history: [],
    openRequestIds: []
  };
}

export function createDefaultStore() {
  return {
    version: 1,
    activeWorkspaceId: "",
    activeRequestId: "",
    sidebarTab: "requests",
    sidebarCollapsed: false,
    sidebarWidth: 260,
    workspaces: []
  };
}

export function getActiveWorkspace(store) {
  return store.workspaces.find((workspace) => workspace.id === store.activeWorkspaceId) ?? store.workspaces[0] ?? null;
}

export function getActiveRequest(store) {
  const workspace = getActiveWorkspace(store);

  if (!workspace || !workspace.openRequestIds?.includes(store.activeRequestId)) {
    return null;
  }

  return workspace.requests.find((request) => request.id === store.activeRequestId) ?? null;
}

export function orderRequests(requests = []) {
  return [...requests]
    .map((request, index) => ({ request, index }))
    .sort((left, right) => {
      if (Boolean(left.request.pinned) === Boolean(right.request.pinned)) {
        return left.index - right.index;
      }

      return left.request.pinned ? -1 : 1;
    })
    .map(({ request }) => request);
}

export function normalizeRequestRecord(request) {
  return {
    ...request,
    pinned: Boolean(request?.pinned),
    queryParams: Array.isArray(request?.queryParams) && request.queryParams.length ? request.queryParams : [createRow("param")],
    headers: Array.isArray(request?.headers) && request.headers.length ? request.headers : [createRow("header")],
    bodyRows: Array.isArray(request?.bodyRows) && request.bodyRows.length ? request.bodyRows : [createRow("body")],
    graphqlVariables: typeof request?.graphqlVariables === "string" ? request.graphqlVariables : "{\n\n}",
    auth: request?.auth && typeof request.auth === "object"
      ? { type: request.auth.type ?? "none", token: request.auth.token ?? "" }
      : { type: "none", token: "" }
  };
}

export function cloneRequest(request) {
  return {
    ...normalizeRequestRecord(request),
    id: createId("request"),
    name: `${request.name || "New Request"} Copy`,
    pinned: false,
    queryParams: (request.queryParams || []).map((row) => ({ ...row, id: createId("param") })),
    headers: (request.headers || []).map((row) => ({ ...row, id: createId("header") })),
    bodyRows: (request.bodyRows || []).map((row) => ({ ...row, id: createId("body") })),
    lastResponse: request.lastResponse ? { ...request.lastResponse } : null
  };
}
