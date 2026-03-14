import * as path from 'node:path';
import * as vscode from 'vscode';

const SCORE_VIEW_TYPE = 'vscode-tabst.scoreViewer';

type ExtensionToWebviewMessage =
	| {
		command: 'loadScore';
		fileName: string;
		fileUri: string;
		fileData: string;
	}
	| {
		command: 'setBusy';
		busy: boolean;
		message?: string;
	};

type WebviewToExtensionMessage =
	| {
		command: 'ready';
	}
	| {
		command: 'reloadFromDisk';
	};

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(ScoreViewerProvider.register(context));
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-tabst.openInScoreViewer', async (resource?: vscode.Uri) => {
			const targetUri = resource ?? getActiveTabUri();

			if (!targetUri) {
				await vscode.window.showWarningMessage('Open a Guitar Pro or MusicXML file first.');
				return;
			}

			await vscode.commands.executeCommand('vscode.openWith', targetUri, SCORE_VIEW_TYPE);
		})
	);
}

function getActiveTabUri(): vscode.Uri | undefined {
	const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
	if (activeEditorUri) {
		return activeEditorUri;
	}

	const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
	if (!activeTab) {
		return undefined;
	}

	return activeTab.input instanceof vscode.TabInputText ? activeTab.input.uri : undefined;
}

export function deactivate(): void {}

class ScoreDocument implements vscode.CustomDocument {
	private constructor(
		public readonly uri: vscode.Uri,
		private _data: Uint8Array
	) {}

	public static async create(uri: vscode.Uri): Promise<ScoreDocument> {
		const data = await vscode.workspace.fs.readFile(uri);
		return new ScoreDocument(uri, data);
	}

	public get base64Data(): string {
		return Buffer.from(this._data).toString('base64');
	}

	public async reload(): Promise<void> {
		this._data = await vscode.workspace.fs.readFile(this.uri);
	}

	public dispose(): void {}
}

class ScoreViewerProvider implements vscode.CustomReadonlyEditorProvider<ScoreDocument> {
	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new ScoreViewerProvider(context);
		return vscode.window.registerCustomEditorProvider(SCORE_VIEW_TYPE, provider, {
			webviewOptions: {
				retainContextWhenHidden: true
			},
			supportsMultipleEditorsPerDocument: true
		});
	}

	private constructor(private readonly context: vscode.ExtensionContext) {}

	public async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
	): Promise<ScoreDocument> {
		return ScoreDocument.create(uri);
	}

	public async resolveCustomEditor(
		document: ScoreDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
				vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@coderline', 'alphatab')
			]
		};

		webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

		const postCurrentScore = async () => {
			await webviewPanel.webview.postMessage({
				command: 'setBusy',
				busy: true,
				message: 'Loading score…'
			} satisfies ExtensionToWebviewMessage);

			await webviewPanel.webview.postMessage({
				command: 'loadScore',
				fileName: path.basename(document.uri.fsPath),
				fileUri: document.uri.toString(),
				fileData: document.base64Data
			} satisfies ExtensionToWebviewMessage);
		};

		const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
			async (message: WebviewToExtensionMessage) => {
				switch (message.command) {
					case 'ready':
						await postCurrentScore();
						break;
					case 'reloadFromDisk':
						await document.reload();
						await postCurrentScore();
						break;
				}
			},
			undefined,
			this.context.subscriptions
		);

		webviewPanel.onDidDispose(() => {
			messageSubscription.dispose();
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'scoreEditor.css'));
		const appUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'scoreEditor.js'));
		const alphaTabUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@coderline', 'alphatab', 'dist', 'alphaTab.min.js')
		);
		const soundFontUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'node_modules',
				'@coderline',
				'alphatab',
				'dist',
				'soundfont',
				'sonivox.sf2'
			)
		);
		const bravuraWoff2Uri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@coderline', 'alphatab', 'dist', 'font', 'Bravura.woff2')
		);
		const bravuraWoffUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@coderline', 'alphatab', 'dist', 'font', 'Bravura.woff')
		);

		const config = JSON.stringify({
			soundFontUri: soundFontUri.toString(),
			bravuraWoff2Uri: bravuraWoff2Uri.toString(),
			bravuraWoffUri: bravuraWoffUri.toString(),
			alphaTabScriptUri: alphaTabUri.toString()
		});

		return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta
			http-equiv="Content-Security-Policy"
			content="default-src 'none'; img-src ${webview.cspSource} blob: data:; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource}; media-src ${webview.cspSource} blob:;"
		/>
		<link rel="stylesheet" href="${styleUri}" />
		<title>Tabst Score Viewer</title>
	</head>
	<body>
		<div class="app-shell">
			<header class="topbar">
				<div>
					<p class="eyebrow">Tabst</p>
					<h1 id="score-title">Open a score file</h1>
					<p id="score-subtitle" class="subtitle">Guitar Pro and MusicXML preview with playback</p>
				</div>
				<div class="toolbar">
					<button id="reload-button" type="button" class="secondary">Reload</button>
					<button id="play-pause-button" type="button">Play</button>
					<button id="stop-button" type="button" class="secondary">Stop</button>
				</div>
			</header>

			<section class="meta-card">
				<div class="meta-row">
					<span class="label">Status</span>
					<span id="player-status">Idle</span>
				</div>
				<div class="meta-row">
					<span class="label">Current file</span>
					<span id="current-file">—</span>
				</div>
				<div class="meta-row">
					<span class="label">Artist / Album</span>
					<span id="score-meta">—</span>
				</div>
			</section>

			<section class="workspace">
				<aside class="sidebar">
					<div class="sidebar-card">
						<div class="card-header-row">
							<div>
								<h2>Track settings</h2>
								<p class="hint">Visibility, staff combinations, volume, solo and mute.</p>
							</div>
							<div class="track-actions-inline">
								<button id="track-select-all-button" type="button" class="secondary compact-button">All</button>
								<button id="track-keep-first-button" type="button" class="secondary compact-button">First only</button>
							</div>
						</div>
						<p id="track-summary" class="hint">No tracks loaded yet</p>
						<div id="track-list" class="track-list"></div>
					</div>
					<div class="sidebar-card playback-card">
						<h2>Playback tools</h2>
						<p class="hint">Metronome, count-in and automatic scrolling.</p>
						<div class="playback-toggle-grid">
							<button id="metronome-toggle-button" type="button" class="playback-chip">Metronome</button>
							<button id="count-in-toggle-button" type="button" class="playback-chip">Count-in</button>
							<button id="auto-scroll-toggle-button" type="button" class="playback-chip">Auto scroll</button>
						</div>
						<div class="playback-slider-group">
							<div class="playback-slider-labels">
								<span>Metronome volume</span>
								<span id="metronome-volume-value">65%</span>
							</div>
							<input id="metronome-volume" type="range" min="0" max="100" step="1" value="65" />
						</div>
						<div class="playback-slider-group">
							<div class="playback-slider-labels">
								<span>Count-in volume</span>
								<span id="count-in-volume-value">55%</span>
							</div>
							<input id="count-in-volume" type="range" min="0" max="100" step="1" value="55" />
						</div>
					</div>
					<div class="sidebar-card status-card" id="busy-indicator" hidden>
						<h2>Working</h2>
						<p id="busy-message">Loading score…</p>
					</div>
					<div class="sidebar-card error-card" id="error-panel" hidden>
						<h2>Could not render this score</h2>
						<pre id="error-message"></pre>
					</div>
				</aside>

				<main class="score-host-wrapper">
					<div id="alphaTab" class="score-host"></div>
				</main>
			</section>
		</div>

		<script nonce="${nonce}">
			window.__TABST_CONFIG__ = ${config};
		</script>
		<script nonce="${nonce}" src="${alphaTabUri}"></script>
		<script type="module" nonce="${nonce}" src="${appUri}"></script>
	</body>
</html>`;
	}
}

function getNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index += 1) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return nonce;
}
