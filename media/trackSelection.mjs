export function deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks) {
	if (scoreTracks.length === 0) {
		return [];
	}

	const selectedIndexes = [];

	for (const renderedTrack of renderedTracks) {
		const trackIndex = resolveTrackIndex(scoreTracks, renderedTrack);
		if (trackIndex === undefined || selectedIndexes.includes(trackIndex)) {
			continue;
		}

		selectedIndexes.push(trackIndex);
	}

	return selectedIndexes.length > 0 ? selectedIndexes : [0];
}

function resolveTrackIndex(scoreTracks, renderedTrack) {
	const referenceIndex = scoreTracks.indexOf(renderedTrack);
	if (referenceIndex >= 0) {
		return referenceIndex;
	}

	if (typeof renderedTrack.index === 'number' && Number.isInteger(renderedTrack.index)) {
		const matchedIndex = scoreTracks.findIndex(scoreTrack => scoreTrack.index === renderedTrack.index);
		return matchedIndex >= 0 ? matchedIndex : undefined;
	}

	return undefined;
}
