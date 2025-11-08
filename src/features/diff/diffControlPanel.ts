// diffControlPanel
// Controls rendered when updating differences.

import * as vscode from 'vscode';

export type DiffControlAction = 'apply' | 'applyAll' | 'prev' | 'next' | 'skip' | 'cancel';

interface PanelState {
  fileName: string;
  diffShown: boolean;
}

class DiffControlPanel {
  private panel: vscode.WebviewPanel | undefined;
  private pendingResolver: ((a: DiffControlAction) => void) | undefined;
  private state: PanelState = { fileName: '', diffShown: false };

  isVisible(): boolean { return !!this.panel; }

  show(state: PanelState) {
    this.state = state;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'dwDiffControl',
        'Dreamweaver Diff Control',
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage((msg: { type: DiffControlAction }) => {
        const r = this.pendingResolver; this.pendingResolver = undefined;
        if (r) r(msg.type);
      });
    }
    this.render();
  }

  update(state: Partial<PanelState>) {
    this.state = { ...this.state, ...state } as PanelState;
    if (this.panel) this.render();
  }

  waitForAction(): Promise<DiffControlAction> {
    return new Promise<DiffControlAction>(resolve => {
      this.pendingResolver = resolve;
    });
  }

  dispose() { if (this.panel) { this.panel.dispose(); this.panel = undefined; } }

  private render() {
    if (!this.panel) return;
    const { fileName, diffShown } = this.state;
    const disableNav = diffShown ? '' : 'disabled';
    this.panel.webview.html = `<!DOCTYPE html>
      <html><head><meta charset="UTF-8"><style>
        body{font-family:Segoe UI,Arial,sans-serif;margin:10px}
        h3{margin:6px 0 12px}
        .row{display:flex;gap:8px;flex-wrap:wrap}
        button{padding:6px 10px}
        .warn{background:#ffd75e}
        .ok{background:#8fd18f}
        .skip{background:#ddd}
        .nav{background:#e7f0ff}
      </style></head>
      <body>
        <h3>Update: ${fileName}</h3>
        <div class="row">
          <button class="ok" id="apply">Apply</button>
          <button class="ok" id="applyAll">Apply to All</button>
          <button class="nav" id="prev" ${disableNav}>Previous Diff</button>
          <button class="nav" id="next" ${disableNav}>Next Diff</button>
          <button class="skip" id="skip">Skip</button>
          <button class="warn" id="cancel">Cancel</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          for (const id of ['apply','applyAll','prev','next','skip','cancel']) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => vscode.postMessage({ type: id }));
          }
        </script>
      </body></html>`;
  }
}

  const singleton = new DiffControlPanel();

  export const diffControl = {
  isVisible: () => singleton.isVisible(),
  show: (state: PanelState) => singleton.show(state),
  update: (state: Partial<PanelState>) => singleton.update(state),
  waitForAction: () => singleton.waitForAction(),
  dispose: () => singleton.dispose()
};
