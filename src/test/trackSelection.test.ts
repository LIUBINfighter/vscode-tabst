import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const trackSelectionModuleUrl = pathToFileURL(
	path.resolve(__dirname, '../../media/trackSelection.mjs')
).href;

suite('Track selection synchronization', () => {
	test('uses the currently rendered alphaTab tracks for initial checkbox state', async () => {
		const { deriveInitialSelectedTrackIndexes } = await import(trackSelectionModuleUrl);
		const scoreTracks = [{ index: 0 }, { index: 1 }, { index: 2 }];
		const renderedTracks = [scoreTracks[0]];

		assert.deepStrictEqual(deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks), [0]);
	});

	test('supports non-zero rendered track subsets', async () => {
		const { deriveInitialSelectedTrackIndexes } = await import(trackSelectionModuleUrl);
		const scoreTracks = [{ index: 0 }, { index: 1 }, { index: 2 }];
		const renderedTracks = [scoreTracks[1]];

		assert.deepStrictEqual(deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks), [1]);
	});

	test('ignores rendered track indexes that are not present in the score', async () => {
		const { deriveInitialSelectedTrackIndexes } = await import(trackSelectionModuleUrl);
		const scoreTracks = [{ index: 0 }, { index: 1 }, { index: 2 }];
		const renderedTracks = [{ index: 99 }];

		assert.deepStrictEqual(deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks), [0]);
	});

	test('matches rendered tracks by track.index instead of array position', async () => {
		const { deriveInitialSelectedTrackIndexes } = await import(trackSelectionModuleUrl);
		const scoreTracks = [{ index: 10 }, { index: 20 }, { index: 30 }];
		const renderedTracks = [{ index: 20 }];

		assert.deepStrictEqual(deriveInitialSelectedTrackIndexes(scoreTracks, renderedTracks), [1]);
	});
});
