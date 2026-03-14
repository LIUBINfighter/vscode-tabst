import { deriveInitialSelectedTrackIndexes } from './trackSelection.mjs';

const STAFF_OPTIONS = [
	'showStandardNotation',
	'showTablature',
	'showSlash',
	'showNumbered'
];

export function createTrackConfigs(scoreTracks, renderedTracks) {
	const selectedIndexes = new Set(
		deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks)
	);

	return scoreTracks.map((track, index) => ({
		index: track.index,
		name: track.name || `Track ${index + 1}`,
		kind:
			track.playbackInfo?.programName ||
			track.staves?.map(staff => staff.name).filter(Boolean).join(' · ') ||
			'Instrument track',
		isSelected: selectedIndexes.has(index),
		isMuted: track.playbackInfo?.isMute === true,
		isSolo: track.playbackInfo?.isSolo === true,
		volumePercent: 100,
		staves: (track.staves || []).map((staff, staffIndex) => ({
			staffIndex: typeof staff.index === 'number' ? staff.index : staffIndex,
			showStandardNotation: Boolean(staff.showStandardNotation),
			showTablature: Boolean(staff.showTablature),
			showSlash: Boolean(staff.showSlash),
			showNumbered: Boolean(staff.showNumbered)
		}))
	}));
}

export function syncTrackConfigs(trackConfigs, scoreTracks, renderedTracks) {
	const nextConfigs = createTrackConfigs(scoreTracks, renderedTracks);
	const existingByIndex = new Map(trackConfigs.map(config => [config.index, config]));

	return nextConfigs.map(config => {
		const existing = existingByIndex.get(config.index);
		if (!existing) {
			return config;
		}

		const existingStaves = new Map(existing.staves.map(staff => [staff.staffIndex, staff]));
		return {
			...config,
			isMuted: existing.isMuted,
			isSolo: existing.isSolo,
			volumePercent: existing.volumePercent,
			staves: config.staves.map(staff => ({
				...staff,
				...(existingStaves.get(staff.staffIndex) ?? {})
			}))
		};
	});
}

export function toggleTrackSelection(trackConfigs, trackIndex) {
	const nextConfigs = trackConfigs.map(config =>
		config.index === trackIndex ? { ...config, isSelected: !config.isSelected } : config
	);

	return nextConfigs.some(config => config.isSelected) ? nextConfigs : trackConfigs;
}

export function setAllTrackSelection(trackConfigs, isSelected) {
	if (trackConfigs.length === 0) {
		return trackConfigs;
	}

	if (isSelected) {
		return trackConfigs.map(config => ({ ...config, isSelected: true }));
	}

	return trackConfigs.map((config, index) => ({
		...config,
		isSelected: index === 0
	}));
}

export function setTrackVolume(trackConfigs, trackIndex, volumePercent) {
	const clamped = clampVolumePercent(volumePercent);
	return trackConfigs.map(config =>
		config.index === trackIndex ? { ...config, volumePercent: clamped } : config
	);
}

export function toggleTrackMute(trackConfigs, trackIndex) {
	return trackConfigs.map(config => {
		if (config.index !== trackIndex) {
			return config;
		}

		const nextMuted = !config.isMuted;
		return {
			...config,
			isMuted: nextMuted,
			isSolo: nextMuted ? false : config.isSolo
		};
	});
}

export function toggleTrackSolo(trackConfigs, trackIndex) {
	return trackConfigs.map(config => {
		if (config.index !== trackIndex) {
			return config;
		}

		const nextSolo = !config.isSolo;
		return {
			...config,
			isSolo: nextSolo,
			isMuted: nextSolo ? false : config.isMuted
		};
	});
}

export function toggleStaffOption(trackConfigs, trackIndex, staffIndex, option) {
	if (!STAFF_OPTIONS.includes(option)) {
		return trackConfigs;
	}

	let didChange = false;

	const nextConfigs = trackConfigs.map(config => {
		if (config.index !== trackIndex) {
			return config;
		}

		const nextStaves = config.staves.map(staff => {
			if (staff.staffIndex !== staffIndex) {
				return staff;
			}

			const nextValue = !staff[option];
			const testStaff = { ...staff, [option]: nextValue };
			const hasVisibleStaff = STAFF_OPTIONS.some(key => testStaff[key]);
			if (!hasVisibleStaff) {
				return staff;
			}

			didChange = true;
			return {
				...staff,
				[option]: nextValue
			};
		});

		return didChange ? { ...config, staves: nextStaves } : config;
	});

	return didChange ? nextConfigs : trackConfigs;
}

export function applyStaffConfigs(scoreTracks, trackConfigs) {
	const configsByIndex = new Map(trackConfigs.map(config => [config.index, config]));

	for (const track of scoreTracks) {
		const config = configsByIndex.get(track.index);
		if (!config) {
			continue;
		}

		for (const staff of track.staves || []) {
			const staffConfig = config.staves.find(candidate => candidate.staffIndex === staff.index)
				?? config.staves[0];

			if (!staffConfig) {
				continue;
			}

			staff.showStandardNotation = staffConfig.showStandardNotation;
			staff.showTablature = staffConfig.showTablature;
			staff.showSlash = staffConfig.showSlash;
			staff.showNumbered = staffConfig.showNumbered;
		}
	}
}

export function getSelectedTracks(scoreTracks, trackConfigs) {
	const selectedIndexes = new Set(
		trackConfigs.filter(config => config.isSelected).map(config => config.index)
	);

	return scoreTracks.filter(track => selectedIndexes.has(track.index));
}

function clampVolumePercent(volumePercent) {
	return Math.max(0, Math.min(200, Math.round(volumePercent)));
}
