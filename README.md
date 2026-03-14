# vscode-tabst

Open Guitar Pro and MusicXML scores directly inside VS Code with alphaTab rendering and playback.

## Features

- Open `*.gp`, `*.gp3`, `*.gp4`, `*.gp5`, `*.gpx`, `*.gp7`, `*.gp8`, `*.musicxml`, and `*.mxl`
- Render notation and tablature in a custom VS Code editor
- Play, pause, and stop score playback with the built-in alphaTab player
- Toggle visible tracks from the sidebar
- Reload the score from disk without reopening the editor

## Usage

### Supported files

These file types open automatically in Tabst Score Viewer:

- Guitar Pro: `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp7`, `.gp8`
- MusicXML: `.musicxml`, `.mxl`

### Open other MusicXML-like files

If you have a generic `.xml` file that contains MusicXML, run:

- `Open in Tabst Score Viewer`

from the Command Palette, editor title, or Explorer context menu.

## Notes

- Rendering and playback are powered by [`@coderline/alphatab`](https://www.alphatab.net/)
- MusicXML support depends on alphaTab's importer compatibility
- Large scores may take a moment to parse before playback becomes ready

## Development

```bash
npm install
npm run compile
npm test
```
