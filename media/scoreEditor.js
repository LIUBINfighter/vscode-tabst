import { deriveInitialSelectedTrackIndexes } from './trackSelection.mjs';

const vscode = globalThis.acquireVsCodeApi();
const alphaTab = globalThis.alphaTab;
const config = globalThis.__TABST_CONFIG__;

if (!alphaTab) {
	throw new Error('alphaTab failed to load in the webview.');
}

const alphaTabElement = document.getElementById('alphaTab');
const busyIndicator = document.getElementById('busy-indicator');
const busyMessage = document.getElementById('busy-message');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');
const titleElement = document.getElementById('score-title');
const subtitleElement = document.getElementById('score-subtitle');
const currentFileElement = document.getElementById('current-file');
const scoreMetaElement = document.getElementById('score-meta');
const playerStatusElement = document.getElementById('player-status');
const playPauseButton = document.getElementById('play-pause-button');
const stopButton = document.getElementById('stop-button');
const reloadButton = document.getElementById('reload-button');
const trackListElement = document.getElementById('track-list');

let selectedTrackIndexes = [];
let currentFileName = '';
let currentScoreTracks = [];

const mainGlyphColor = alphaTab.model.Color.fromJson(getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim());
const fallbackGlyphColor = mainGlyphColor ?? new alphaTab.model.Color(235, 235, 235, 1);

const api = new alphaTab.AlphaTabApi(alphaTabElement, {
	core: {
		scriptFile: config.alphaTabScriptUri,
		smuflFontSources: new Map([
			[alphaTab.FontFileFormat.Woff2, config.bravuraWoff2Uri],
			[alphaTab.FontFileFormat.Woff, config.bravuraWoffUri]
		])
	},
	player: {
		playerMode: 'EnabledAutomatic',
		enableCursor: true,
		soundFont: config.soundFontUri,
		scrollMode: 'Continuous',
		scrollElement: alphaTabElement
	},
	display: {
		scale: 0.9,
		resources: {
			mainGlyphColor: fallbackGlyphColor,
			secondaryGlyphColor: new alphaTab.model.Color(
				fallbackGlyphColor.r,
				fallbackGlyphColor.g,
				fallbackGlyphColor.b,
				0.45
			),
			staffLineColor: fallbackGlyphColor,
			barSeparatorColor: fallbackGlyphColor,
			barNumberColor: getComputedStyle(document.body).getPropertyValue('--vscode-focusBorder').trim(),
			scoreInfoColor: fallbackGlyphColor
		}
	}
});

setBusy(false);
setError('');
setPlayerStatus('Idle');

playPauseButton.addEventListener('click', () => {
	api.playPause();
});

stopButton.addEventListener('click', () => {
	api.stop();
});

reloadButton.addEventListener('click', () => {
	vscode.postMessage({ command: 'reloadFromDisk' });
});

window.addEventListener('pagehide', () => {
	api.stop();
	api.destroy();
});

api.scoreLoaded.on(score => {
	currentScoreTracks = score.tracks;
	selectedTrackIndexes = deriveInitialSelectedTrackIndexes(score.tracks, api.tracks ?? []);
	currentFileElement.textContent = currentFileName || 'Current score';
	titleElement.textContent = score.title?.trim() || currentFileName || 'Untitled score';
	const artist = score.artist?.trim();
	const album = score.album?.trim();
	const metaParts = [artist, album].filter(Boolean);
	scoreMetaElement.textContent = metaParts.length > 0 ? metaParts.join(' • ') : 'No artist or album metadata';
	subtitleElement.textContent = score.subTitle?.trim() || score.music?.trim() || 'Rendered by alphaTab inside VS Code';
	renderTrackList(score.tracks);
	setError('');
});

api.renderFinished.on(() => {
	syncTrackSelectionUi();
	setBusy(false);
	setPlayerStatus('Rendered');
});

api.playerReady.on(() => {
	setPlayerStatus('Ready for playback');
});

api.playerStateChanged.on(event => {
	if (event.state === alphaTab.synth.PlayerState.Playing) {
		playPauseButton.textContent = 'Pause';
		setPlayerStatus('Playing');
		return;
	}

	if (event.state === alphaTab.synth.PlayerState.Paused) {
		playPauseButton.textContent = 'Play';
		setPlayerStatus('Paused');
		return;
	}

	playPauseButton.textContent = 'Play';
	setPlayerStatus('Stopped');
	});

api.error.on(error => {
	setBusy(false);
	setError(error?.message ?? String(error));
	setPlayerStatus('Error');
});

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'setBusy':
			setBusy(message.busy, message.message);
			break;
		case 'loadScore': {
			api.stop();
			currentFileName = message.fileName;
			currentFileElement.textContent = currentFileName;
			titleElement.textContent = currentFileName;
			subtitleElement.textContent = message.fileUri;
			setError('');
			setBusy(true, 'Parsing score and preparing playback…');
			trackListElement.replaceChildren();
			playPauseButton.textContent = 'Play';
			loadScore(message.fileData);
			break;
		}
	}
});

vscode.postMessage({ command: 'ready' });

function loadScore(base64Data) {
	const binary = atob(base64Data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	api.load(bytes);
}

function renderTrackList(tracks) {
	trackListElement.replaceChildren();

	if (!tracks || tracks.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'hint';
		empty.textContent = 'This score does not expose track data.';
		trackListElement.appendChild(empty);
		return;
	}

	for (const [index, track] of tracks.entries()) {
		const label = document.createElement('label');
		label.className = 'track-item';

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = selectedTrackIndexes.includes(index);
		checkbox.addEventListener('change', () => {
			selectedTrackIndexes = tracks
				.map((_, trackIndex) => trackIndex)
				.filter(trackIndex => {
					const input = trackListElement.querySelector(`input[data-track-index="${trackIndex}"]`);
					return input instanceof HTMLInputElement ? input.checked : false;
				});

			if (selectedTrackIndexes.length === 0) {
				checkbox.checked = true;
				selectedTrackIndexes = [index];
			}

			const selectedTracks = selectedTrackIndexes.map(trackIndex => tracks[trackIndex]);
			api.renderTracks(selectedTracks);
		});
		checkbox.dataset.trackIndex = String(index);

		const content = document.createElement('div');

		const trackName = document.createElement('p');
		trackName.className = 'track-name';
		trackName.textContent = track.name || `Track ${index + 1}`;

		const trackKind = document.createElement('p');
		trackKind.className = 'track-kind';
		trackKind.textContent = track.playbackInfo?.programName || track.staves?.map(stave => stave.name).filter(Boolean).join(' · ') || 'Instrument track';

		content.append(trackName, trackKind);
		label.append(checkbox, content);
		trackListElement.appendChild(label);
	}
}

function syncTrackSelectionUi() {
	if (!currentScoreTracks || currentScoreTracks.length === 0) {
		return;
	}

	selectedTrackIndexes = deriveInitialSelectedTrackIndexes(currentScoreTracks, api.tracks ?? []);

	for (const [trackIndex] of currentScoreTracks.entries()) {
		const input = trackListElement.querySelector(`input[data-track-index="${trackIndex}"]`);
		if (input instanceof HTMLInputElement) {
			input.checked = selectedTrackIndexes.includes(trackIndex);
		}
	}
}

function setBusy(busy, message = 'Loading score…') {
	busyIndicator.hidden = !busy;
	busyMessage.textContent = message;
	playPauseButton.disabled = busy;
	stopButton.disabled = busy;
	reloadButton.disabled = busy;
}

function setError(message) {
	const hasError = Boolean(message);
	errorPanel.hidden = !hasError;
	errorMessage.textContent = hasError ? message : '';
}

function setPlayerStatus(message) {
	playerStatusElement.textContent = message;
}
