import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const trackSettingsModuleUrl = pathToFileURL(
	path.resolve(__dirname, '../../media/trackSettings.mjs')
).href;

type TrackConfigSummary = {
	index: number;
	isSelected: boolean;
	isMuted?: boolean;
};

suite('Track settings helpers', () => {
	test('creates track configs using rendered tracks as selected state', async () => {
		const { createTrackConfigs } = await import(trackSettingsModuleUrl);
		const scoreTracks = [
			{
				index: 10,
				name: 'Lead',
				playbackInfo: { programName: 'Guitar', isMute: false, isSolo: false },
				staves: [{ index: 0, showStandardNotation: true, showTablature: true, showSlash: false, showNumbered: false }]
			},
			{
				index: 20,
				name: 'Bass',
				playbackInfo: { programName: 'Bass', isMute: true, isSolo: false },
				staves: [{ index: 0, showStandardNotation: true, showTablature: false, showSlash: false, showNumbered: false }]
			}
		];

		const configs = createTrackConfigs(scoreTracks, [scoreTracks[1]]);

		assert.deepStrictEqual(
			configs.map((config: TrackConfigSummary) => ({
				index: config.index,
				isSelected: config.isSelected,
				isMuted: config.isMuted
			})),
			[
				{ index: 10, isSelected: false, isMuted: false },
				{ index: 20, isSelected: true, isMuted: true }
			]
		);
	});

	test('preserves mute and solo state when syncing configs after rerender', async () => {
		const { syncTrackConfigs } = await import(trackSettingsModuleUrl);
		const scoreTracks = [
			{
				index: 10,
				name: 'Lead',
				playbackInfo: { programName: 'Guitar', isMute: false, isSolo: false },
				staves: [{ index: 0, showStandardNotation: true, showTablature: true, showSlash: false, showNumbered: false }]
			}
		];
		const existingConfigs = [
			{
				index: 10,
				name: 'Lead',
				kind: 'Guitar',
				isSelected: true,
				isMuted: true,
				isSolo: true,
				volumePercent: 135,
				staves: [
					{
						staffIndex: 0,
						showStandardNotation: false,
						showTablature: true,
						showSlash: false,
						showNumbered: false
					}
				]
			}
		];

		const [synced] = syncTrackConfigs(existingConfigs, scoreTracks, scoreTracks);

		assert.deepStrictEqual(
			{
				index: synced.index,
				isMuted: synced.isMuted,
				isSolo: synced.isSolo,
				volumePercent: synced.volumePercent,
				showStandardNotation: synced.staves[0]?.showStandardNotation,
				showTablature: synced.staves[0]?.showTablature
			},
			{
				index: 10,
				isMuted: true,
				isSolo: true,
				volumePercent: 135,
				showStandardNotation: false,
				showTablature: true
			}
		);
	});

	test('prevents disabling every staff display option', async () => {
		const { toggleStaffOption } = await import(trackSettingsModuleUrl);
		const configs = [
			{
				index: 0,
				name: 'Lead',
				kind: 'Guitar',
				isSelected: true,
				isMuted: false,
				isSolo: false,
				volumePercent: 100,
				staves: [
					{
						staffIndex: 0,
						showStandardNotation: true,
						showTablature: false,
						showSlash: false,
						showNumbered: false
					}
				]
			}
		];

		const next = toggleStaffOption(configs, 0, 0, 'showStandardNotation');
		assert.strictEqual(next, configs);
	});

	test('keeps the first track selected when clearing all tracks', async () => {
		const { setAllTrackSelection } = await import(trackSettingsModuleUrl);
		const configs = [
			{ index: 0, isSelected: true },
			{ index: 1, isSelected: true },
			{ index: 2, isSelected: true }
		];

		assert.deepStrictEqual(
			setAllTrackSelection(configs, false).map((config: TrackConfigSummary) => ({ index: config.index, isSelected: config.isSelected })),
			[
				{ index: 0, isSelected: true },
				{ index: 1, isSelected: false },
				{ index: 2, isSelected: false }
			]
		);
	});
});
