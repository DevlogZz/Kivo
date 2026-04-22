import { RequestPane } from "@/components/workspace/RequestPane.jsx";
import { ResponsePane } from "@/components/workspace/ResponsePane.jsx";

export function WorkspaceView({
  request,
  isSending,
  sendStartedAt,
  onSend,
  onCancelSend,
  onFieldChange,
  onUpdateActiveRequest,
  response,
  envVars,
  workspaceName,
  collectionName,
}) {
  if (!request) return null;

  return (
    <div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_1fr]">
      <RequestPane
        state={request}
        isSending={isSending}
        onSend={onSend}
        onChange={onFieldChange}
        onTabChange={(tab) => onUpdateActiveRequest((r) => ({ ...r, activeEditorTab: tab }))}
        onParamsChange={(queryParams) => onUpdateActiveRequest((r) => ({ ...r, queryParams }))}
        onHeadersChange={(headers) => onUpdateActiveRequest((r) => ({ ...r, headers }))}
        onAuthChange={(auth) => onUpdateActiveRequest((r) => ({ ...r, auth }))}
        envVars={envVars}
        response={response}
        workspaceName={workspaceName}
        collectionName={collectionName}
      />
      <ResponsePane
        response={response}
        isSending={isSending}
        sendStartedAt={sendStartedAt}
        onCancelSend={onCancelSend}
        activeTab={request.activeResponseTab ?? "Body"}
        onTabChange={(tab) => onUpdateActiveRequest((r) => ({ ...r, activeResponseTab: tab }))}
        bodyView={request.responseBodyView ?? "Raw"}
        onBodyViewChange={(view) => onUpdateActiveRequest((r) => ({ ...r, responseBodyView: view }))}
      />
    </div>
  );
}
