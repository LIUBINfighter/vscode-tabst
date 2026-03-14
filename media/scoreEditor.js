import {
	applyStaffConfigs,
	getSelectedTracks,
	setAllTrackSelection,
	setTrackVolume,
	syncTrackConfigs,
	toggleStaffOption,
	toggleTrackMute,
	toggleTrackSelection,
	toggleTrackSolo
} from './trackSettings.mjs';

const vscode = globalThis.acquireVsCodeApi();
const alphaTab = globalThis.alphaTab;
const config = globalThis.__TABST_CONFIG__;

if (!alphaTab) {
	throw new Error('alphaTab failed to load in the webview.');
}

const alphaTabElement = document.getElementById('alphaTab');
const scoreViewportElement = document.getElementById('score-viewport');
const scoreScrollElement = scoreViewportElement;
const busyIndicator = document.getElementById('busy-indicator');
const busyMessage = document.getElementById('busy-message');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');
const titleElement = document.getElementById('score-title');
const subtitleElement = document.getElementById('score-subtitle');
const currentFileElement = document.getElementById('current-file');
const scoreMetaElement = document.getElementById('score-meta');
const playerStatusElement = document.getElementById('player-status');
const workspaceElement = document.querySelector('.workspace');
const sidebarElement = document.querySelector('.sidebar');
const metaInfoCardElement = document.getElementById('meta-info-card');
const trackSettingsCardElement = document.getElementById('track-settings-card');
const playbackToolsCardElement = document.getElementById('playback-tools-card');
const metaPanelToggleButton = document.getElementById('meta-panel-toggle-button');
const trackPanelToggleButton = document.getElementById('track-panel-toggle-button');
const playbackPanelToggleButton = document.getElementById('playback-panel-toggle-button');
const playPauseButton = document.getElementById('play-pause-button');
const stopButton = document.getElementById('stop-button');
const reloadButton = document.getElementById('reload-button');
const trackSummaryElement = document.getElementById('track-summary');
const trackSelectAllButton = document.getElementById('track-select-all-button');
const trackKeepFirstButton = document.getElementById('track-keep-first-button');
const trackListElement = document.getElementById('track-list');
const playbackSummaryElement = document.getElementById('playback-summary');
const metronomeToggleButton = document.getElementById('metronome-toggle-button');
const metronomeVolumeInput = document.getElementById('metronome-volume');
const metronomeVolumeValueElement = document.getElementById('metronome-volume-value');
const countInToggleButton = document.getElementById('count-in-toggle-button');
const countInVolumeInput = document.getElementById('count-in-volume');
const countInVolumeValueElement = document.getElementById('count-in-volume-value');
const autoScrollToggleButton = document.getElementById('auto-scroll-toggle-button');

let currentFileName = '';
let currentScoreTracks = [];
let trackConfigs = [];
let expandedTrackIndexes = new Set();

const panelVisibility = {
	metaInfo: true,
	trackSettings: true,
	playbackTools: true
};

const panelControls = {
	metaInfo: { card: metaInfoCardElement, button: metaPanelToggleButton },
	trackSettings: { card: trackSettingsCardElement, button: trackPanelToggleButton },
	playbackTools: { card: playbackToolsCardElement, button: playbackPanelToggleButton }
};

const playbackSettings = {
	metronomeEnabled: false,
	metronomeVolumePercent: 65,
	countInEnabled: false,
	countInVolumePercent: 55,
	autoScrollEnabled: true
};

let lastAutoScrollTop = null;
const autoScrollViewportPadding = 24;

const mainGlyphColor = alphaTab.model.Color.fromJson(getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim());
const fallbackGlyphColor = mainGlyphColor ?? new alphaTab.model.Color(235, 235, 235, 1);
const playerSettings = {
	playerMode: 'EnabledAutomatic',
	enableCursor: true,
	soundFont: config.soundFontUri,
	scrollMode: 'Continuous',
	scrollElement: scoreViewportElement
};

const api = new alphaTab.AlphaTabApi(alphaTabElement, {
	core: {
		scriptFile: config.alphaTabScriptUri,
		smuflFontSources: new Map([
			[alphaTab.FontFileFormat.Woff2, config.bravuraWoff2Uri],
			[alphaTab.FontFileFormat.Woff, config.bravuraWoffUri]
		])
	},
	player: playerSettings,
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

api.customScrollHandler = createStableScrollHandler();

setBusy(false);
setError('');
setPlayerStatus('Idle');
initializePanelControls();
updateSidebarVisibility();
renderPlaybackSettings();
renderTrackList();

playPauseButton.addEventListener('click', () => {
	api.playPause();
});

stopButton.addEventListener('click', () => {
	api.stop();
});

reloadButton.addEventListener('click', () => {
	vscode.postMessage({ command: 'reloadFromDisk' });
});

trackSelectAllButton.addEventListener('click', () => {
	updateTrackSelection(setAllTrackSelection(trackConfigs, true));
});

trackKeepFirstButton.addEventListener('click', () => {
	updateTrackSelection(setAllTrackSelection(trackConfigs, false));
});

metronomeToggleButton.addEventListener('click', () => {
	playbackSettings.metronomeEnabled = !playbackSettings.metronomeEnabled;
	applyPlaybackSettings();
	renderPlaybackSettings();
});

metronomeVolumeInput.addEventListener('input', event => {
	const value = Number.parseInt(event.currentTarget.value, 10);
	if (Number.isNaN(value)) {
		return;
	}

	playbackSettings.metronomeVolumePercent = value;
	if (value > 0) {
		playbackSettings.metronomeEnabled = true;
	}
	applyPlaybackSettings();
	renderPlaybackSettings();
});

countInToggleButton.addEventListener('click', () => {
	playbackSettings.countInEnabled = !playbackSettings.countInEnabled;
	applyPlaybackSettings();
	renderPlaybackSettings();
});

countInVolumeInput.addEventListener('input', event => {
	const value = Number.parseInt(event.currentTarget.value, 10);
	if (Number.isNaN(value)) {
		return;
	}

	playbackSettings.countInVolumePercent = value;
	if (value > 0) {
		playbackSettings.countInEnabled = true;
	}
	applyPlaybackSettings();
	renderPlaybackSettings();
});

autoScrollToggleButton.addEventListener('click', () => {
	playbackSettings.autoScrollEnabled = !playbackSettings.autoScrollEnabled;
	applyPlaybackSettings();
	renderPlaybackSettings();
});

window.addEventListener('pagehide', () => {
	api.stop();
	api.destroy();
});

api.scoreLoaded.on(score => {
	currentScoreTracks = score.tracks;
	trackConfigs = syncTrackConfigs(trackConfigs, score.tracks, api.tracks ?? []);
	currentFileElement.textContent = currentFileName || 'Current score';
	titleElement.textContent = score.title?.trim() || currentFileName || 'Untitled score';
	const artist = score.artist?.trim();
	const album = score.album?.trim();
	const metaParts = [artist, album].filter(Boolean);
	scoreMetaElement.textContent = metaParts.length > 0 ? metaParts.join(' • ') : 'No artist or album metadata';
	subtitleElement.textContent = score.subTitle?.trim() || score.music?.trim() || 'Rendered by alphaTab inside VS Code';
	applyPlaybackSettings();
	applyAllTrackVolumes(trackConfigs);
	renderTrackList();
	setError('');
});

api.renderFinished.on(() => {
	syncTrackPanelFromApi();
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
			currentScoreTracks = [];
			trackConfigs = [];
			expandedTrackIndexes = new Set();
			currentFileElement.textContent = currentFileName;
			titleElement.textContent = currentFileName;
			subtitleElement.textContent = message.fileUri;
			setError('');
			setBusy(true, 'Parsing score and preparing playback…');
			renderTrackList();
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

function renderTrackList() {
	trackListElement.replaceChildren();
	const selectedCount = trackConfigs.filter(track => track.isSelected).length;
	const mutedCount = trackConfigs.filter(track => track.isMuted).length;
	const soloCount = trackConfigs.filter(track => track.isSolo).length;
	const summaryParts = trackConfigs.length
		? [`${selectedCount}/${trackConfigs.length} visible`]
		: [];
	if (soloCount > 0) {
		summaryParts.push(`${soloCount} solo`);
	}
	if (mutedCount > 0) {
		summaryParts.push(`${mutedCount} muted`);
	}
	trackSummaryElement.textContent = trackConfigs.length
		? summaryParts.join(' · ')
		: 'No tracks loaded yet';

	if (trackConfigs.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'hint';
		empty.textContent = 'This score does not expose track settings yet.';
		trackListElement.appendChild(empty);
		return;
	}

	for (const config of trackConfigs) {
		trackListElement.appendChild(renderTrackCard(config));
	}
}

function initializePanelControls() {
	for (const [panelKey, controls] of Object.entries(panelControls)) {
		controls.button.addEventListener('click', () => {
			preserveScoreScrollPosition(() => {
				panelVisibility[panelKey] = !panelVisibility[panelKey];
				updateSidebarVisibility();
			});
		});
	}
}

function preserveScoreScrollPosition(applyLayoutChange) {
	stopAlphaTabScrollAnimation();
	const previousScrollTop = scoreScrollElement.scrollTop;
	const previousScrollHeight = scoreScrollElement.scrollHeight;
	const previousClientHeight = scoreScrollElement.clientHeight;
	const distanceFromBottom = previousScrollHeight - previousClientHeight - previousScrollTop;
	const wasNearBottom = distanceFromBottom <= 24;

	applyLayoutChange();

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (wasNearBottom) {
				scoreScrollElement.scrollTop = Math.max(0, scoreScrollElement.scrollHeight - scoreScrollElement.clientHeight - distanceFromBottom);
				return;
			}

			scoreScrollElement.scrollTop = Math.min(previousScrollTop, Math.max(0, scoreScrollElement.scrollHeight - scoreScrollElement.clientHeight));
		});
	});
}

function createStableScrollHandler() {
	return {
		forceScrollTo(currentBeatBounds) {
			performStableAutoScroll(currentBeatBounds, true, 0);
		},
		onBeatCursorUpdating(startBeat, _endBeat, _cursorMode, _actualBeatCursorStartX, _actualBeatCursorEndX, actualBeatCursorTransitionDuration) {
			performStableAutoScroll(startBeat, false, actualBeatCursorTransitionDuration);
		}
	};
}

function performStableAutoScroll(beatBounds, force, transitionDuration) {
	if (!beatBounds || !playbackSettings.autoScrollEnabled) {
		return;
	}

	const ui = api.uiFacade;
	const scroll = ui.getScrollContainer();
	const viewportElement = scroll.element;
	const scrollOffsetY = api.settings.player.scrollOffsetY ?? 0;
	const targetTop = beatBounds.barBounds.masterBarBounds.realBounds.y + scrollOffsetY - autoScrollViewportPadding;
	const maxScrollTop = Math.max(0, viewportElement.scrollHeight - viewportElement.clientHeight);
	const clampedTargetTop = Math.max(0, Math.min(targetTop, maxScrollTop));

	if (!force && lastAutoScrollTop !== null && Math.abs(clampedTargetTop - lastAutoScrollTop) < 2) {
		return;
	}

	lastAutoScrollTop = clampedTargetTop;
	ui.scrollToY(scroll, clampedTargetTop, force ? 0 : transitionDuration);
}

function stopAlphaTabScrollAnimation() {
	try {
		api.uiFacade.stopScrolling(api.uiFacade.getScrollContainer());
	}
	catch {
	}
}

function updateSidebarVisibility() {
	for (const [panelKey, controls] of Object.entries(panelControls)) {
		const isVisible = panelVisibility[panelKey];
		controls.card.classList.toggle('is-collapsed', !isVisible);
		controls.card.hidden = !isVisible;
		controls.button.classList.toggle('is-active', isVisible);
		controls.button.setAttribute('aria-pressed', String(isVisible));
	}

	const sidebarOpen = panelVisibility.metaInfo || panelVisibility.trackSettings || panelVisibility.playbackTools;
	sidebarElement.hidden = !sidebarOpen;
	workspaceElement.dataset.sidebarOpen = String(sidebarOpen);
}

function renderTrackCard(config) {
	const card = document.createElement('article');
	card.className = 'track-card';
 	const isExpanded = expandedTrackIndexes.has(config.index);
	if (config.isSelected) {
		card.dataset.selected = 'true';
	}
	if (config.isMuted) {
		card.dataset.muted = 'true';
	}
	if (config.isSolo) {
		card.dataset.solo = 'true';
	}

	const header = document.createElement('button');
	header.type = 'button';
	header.className = 'track-header';
	header.addEventListener('click', event => {
		if (event.altKey || event.metaKey) {
			updateTrackSelection(toggleTrackSelection(trackConfigs, config.index));
			return;
		}

		toggleTrackExpansion(config.index);
	});

	const visibility = document.createElement('span');
	visibility.className = 'track-visibility';
	visibility.textContent = config.isSelected ? '✓' : '○';
	visibility.title = 'Option-click to toggle track visibility';

	const expander = document.createElement('span');
	expander.className = 'track-expander';
	expander.textContent = isExpanded ? '▾' : '▸';

	const identity = document.createElement('div');
	identity.className = 'track-identity';

	const titleRow = document.createElement('div');
	titleRow.className = 'track-title-row';

	const title = document.createElement('p');
	title.className = 'track-name';
	title.textContent = config.name;

	const badges = document.createElement('div');
	badges.className = 'track-badges';
	if (config.isMuted) {
		badges.appendChild(createBadge('M', 'muted'));
	}
	if (config.isSolo) {
		badges.appendChild(createBadge('S', 'solo'));
	}

	const kind = document.createElement('p');
	kind.className = 'track-kind';
	kind.textContent = config.kind;

	titleRow.append(title, badges);
	identity.append(titleRow, kind);

	const actions = document.createElement('div');
	actions.className = 'track-actions';
	actions.append(
		createTrackActionButton(config.isSelected, 'Show', () => {
			updateTrackSelection(toggleTrackSelection(trackConfigs, config.index));
		}),
		createTrackActionButton(config.isMuted, 'Mute', () => {
			toggleMute(config.index);
		}),
		createTrackActionButton(config.isSolo, 'Solo', () => {
			toggleSolo(config.index);
		})
	);

	header.append(visibility, expander, identity, actions);
	card.appendChild(header);

	if (!isExpanded) {
		return card;
	}

	const volumeRow = document.createElement('div');
	volumeRow.className = 'track-volume-row';
	volumeRow.innerHTML = `<span class="track-volume-label">Volume</span><span class="track-volume-value">${config.volumePercent}%</span>`;
	const volumeSlider = document.createElement('input');
	volumeSlider.type = 'range';
	volumeSlider.min = '0';
	volumeSlider.max = '200';
	volumeSlider.step = '1';
	volumeSlider.value = String(config.volumePercent);
	volumeSlider.className = 'track-volume-slider';
	volumeSlider.addEventListener('input', event => {
		event.stopPropagation();
		const value = Number.parseInt(event.currentTarget.value, 10);
		if (Number.isNaN(value)) {
			return;
		}

		trackConfigs = setTrackVolume(trackConfigs, config.index, value);
		applyTrackVolume(config.index, value);
		renderTrackList();
	});
	card.appendChild(volumeRow);
	card.appendChild(volumeSlider);

	if (config.staves.length > 0) {
		const staves = document.createElement('div');
		staves.className = 'track-staves';

		for (const [staffPosition, staff] of config.staves.entries()) {
			const row = document.createElement('div');
			row.className = 'staff-row';

			const label = document.createElement('span');
			label.className = 'staff-label';
			label.textContent = `Staff ${staffPosition + 1}`;

			const options = document.createElement('div');
			options.className = 'staff-options';
			options.append(
				createStaffButton('Std', staff.showStandardNotation, () => {
					handleStaffOptionToggle(config.index, staff.staffIndex, 'showStandardNotation');
				}),
				createStaffButton('Tab', staff.showTablature, () => {
					handleStaffOptionToggle(config.index, staff.staffIndex, 'showTablature');
				}),
				createStaffButton('Slash', staff.showSlash, () => {
					handleStaffOptionToggle(config.index, staff.staffIndex, 'showSlash');
				}),
				createStaffButton('Num', staff.showNumbered, () => {
					handleStaffOptionToggle(config.index, staff.staffIndex, 'showNumbered');
				})
			);

			row.append(label, options);
			staves.appendChild(row);
		}

		card.appendChild(staves);
	}

	return card;
}

function createBadge(label, tone) {
	const badge = document.createElement('span');
	badge.className = 'track-badge';
	badge.dataset.tone = tone;
	badge.textContent = label;
	return badge;
}

function createTrackActionButton(active, label, onClick) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'track-action-button';
	button.dataset.active = String(active);
	button.textContent = label;
	button.addEventListener('click', event => {
		event.stopPropagation();
		onClick();
	});
	return button;
}

function toggleTrackExpansion(trackIndex) {
	if (expandedTrackIndexes.has(trackIndex)) {
		expandedTrackIndexes.delete(trackIndex);
	}
	else {
		expandedTrackIndexes.add(trackIndex);
	}

	renderTrackList();
}

function createStaffButton(label, active, onClick) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'staff-option-button';
	button.dataset.active = String(active);
	button.textContent = label;
	button.addEventListener('click', event => {
		event.stopPropagation();
		onClick();
	});
	return button;
}

function updateTrackSelection(nextTrackConfigs) {
	if (nextTrackConfigs === trackConfigs || currentScoreTracks.length === 0) {
		return;
	}

	preserveScoreScrollPosition(() => {
		trackConfigs = nextTrackConfigs;
		applyStaffConfigs(currentScoreTracks, trackConfigs);
		api.renderTracks(getSelectedTracks(currentScoreTracks, trackConfigs));
		applyAllTrackVolumes(trackConfigs);
		renderTrackList();
	});
}

function toggleMute(trackIndex) {
	const track = currentScoreTracks.find(candidate => candidate.index === trackIndex);
	if (!track) {
		return;
	}

	const config = trackConfigs.find(candidate => candidate.index === trackIndex);
	if (!config) {
		return;
	}

	const nextMuted = !config.isMuted;
	if (nextMuted && config.isSolo) {
		api.changeTrackSolo([track], false);
	}

	api.changeTrackMute([track], nextMuted);
	trackConfigs = toggleTrackMute(trackConfigs, trackIndex);
	renderTrackList();
}

function toggleSolo(trackIndex) {
	const track = currentScoreTracks.find(candidate => candidate.index === trackIndex);
	if (!track) {
		return;
	}

	const config = trackConfigs.find(candidate => candidate.index === trackIndex);
	if (!config) {
		return;
	}

	const nextSolo = !config.isSolo;
	if (nextSolo && config.isMuted) {
		api.changeTrackMute([track], false);
	}

	api.changeTrackSolo([track], nextSolo);
	trackConfigs = toggleTrackSolo(trackConfigs, trackIndex);
	renderTrackList();
}

function handleStaffOptionToggle(trackIndex, staffIndex, option) {
	const nextTrackConfigs = toggleStaffOption(trackConfigs, trackIndex, staffIndex, option);
	if (nextTrackConfigs === trackConfigs || currentScoreTracks.length === 0) {
		return;
	}

	preserveScoreScrollPosition(() => {
		trackConfigs = nextTrackConfigs;
		applyStaffConfigs(currentScoreTracks, trackConfigs);
		api.render();
		applyAllTrackVolumes(trackConfigs);
		renderTrackList();
	});
}

function syncTrackPanelFromApi() {
	if (currentScoreTracks.length === 0) {
		return;
	}

	trackConfigs = syncTrackConfigs(trackConfigs, currentScoreTracks, api.tracks ?? []);
	if (expandedTrackIndexes.size === 0) {
		expandedTrackIndexes = new Set(trackConfigs.filter(track => track.isSelected).map(track => track.index));
	}
	renderTrackList();
}

function applyTrackVolume(trackIndex, volumePercent) {
	const track = currentScoreTracks.find(candidate => candidate.index === trackIndex);
	if (!track) {
		return;
	}

	api.changeTrackVolume([track], volumePercent / 100);
	const nextMuted = trackConfigs.every(config => config.isMuted);
	if (nextMuted) {
		setPlayerStatus('Metronome only');
	}
	else if (api.playerState === alphaTab.synth.PlayerState.Playing) {
		setPlayerStatus('Playing');
	}
	else {
		setPlayerStatus('Rendered');
	}
	return track;
}

function applyAllTrackVolumes(configs) {
	for (const config of configs) {
		applyTrackVolume(config.index, config.volumePercent);
	}
}

function applyPlaybackSettings() {
	api.metronomeVolume = playbackSettings.metronomeEnabled ? playbackSettings.metronomeVolumePercent / 100 : 0;
	api.countInVolume = playbackSettings.countInEnabled ? playbackSettings.countInVolumePercent / 100 : 0;

	try {
		lastAutoScrollTop = null;
		api.settings.player.scrollElement = scoreViewportElement;
		api.settings.player.scrollMode = playbackSettings.autoScrollEnabled ? alphaTab.ScrollMode.Continuous : alphaTab.ScrollMode.Off;
		api.updateSettings();
	}
	catch (error) {
		console.error('[Tabst] Failed to update playback settings', error);
		setError(`Could not apply playback settings: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function renderPlaybackSettings() {
	metronomeToggleButton.dataset.active = String(playbackSettings.metronomeEnabled);
	countInToggleButton.dataset.active = String(playbackSettings.countInEnabled);
	autoScrollToggleButton.dataset.active = String(playbackSettings.autoScrollEnabled);
	metronomeVolumeInput.value = String(playbackSettings.metronomeVolumePercent);
	metronomeVolumeValueElement.textContent = `${playbackSettings.metronomeVolumePercent}%`;
	countInVolumeInput.value = String(playbackSettings.countInVolumePercent);
	countInVolumeValueElement.textContent = `${playbackSettings.countInVolumePercent}%`;
	playbackSummaryElement.textContent = [
		`Metronome ${playbackSettings.metronomeEnabled ? `on (${playbackSettings.metronomeVolumePercent}%)` : 'off'}`,
		`Count-in ${playbackSettings.countInEnabled ? `on (${playbackSettings.countInVolumePercent}%)` : 'off'}`,
		`Auto scroll ${playbackSettings.autoScrollEnabled ? 'on' : 'off'}`
	].join(' · ');
}

function setBusy(busy, message = 'Loading score…') {
	busyIndicator.hidden = !busy;
	busyMessage.textContent = message;
	playPauseButton.disabled = busy;
	stopButton.disabled = busy;
	reloadButton.disabled = busy;
	if (busy) {
		panelVisibility.metaInfo = true;
	}
	updateSidebarVisibility();
}

function setError(message) {
	const hasError = Boolean(message);
	errorPanel.hidden = !hasError;
	errorMessage.textContent = hasError ? message : '';
	if (hasError) {
		panelVisibility.metaInfo = true;
	}
	updateSidebarVisibility();
}

function setPlayerStatus(message) {
	playerStatusElement.textContent = message;
}
