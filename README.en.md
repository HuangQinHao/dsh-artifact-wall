# dsh-artifact-wall

Artifact panel for DeepSeek Harness: list the files a turn produced under every
completed reply, preview them in the right sidebar, and open a per-session
artifact wall from a fixed entry at the bottom of each turn.

## What it does

1. **Per-turn artifact rows** — after a reply finishes, the files produced in
   that turn appear as rows above the action row. Click a row to open the file
   in the sidebar; right-click to use the host file menu (open, reveal, copy
   path — the same menu DSH uses for presented files).
2. **Fixed "All artifacts" entry** — every finished turn gets one entry, even
   turns that produced nothing (rendered dimmed). It opens the session artifact
   wall in the right sidebar.
3. **Session artifact wall** — every artifact seen in this session so far, with
   type badge, directory, and the turn it came from. Click any row to preview.

## Data source

The plugin reads the host `deliverables` projection for each turn
(`turn.data.get('deliverables')` → `produced` / `presented`) and merges it into
a module-level per-session store that the sidebar panel subscribes to.
Nothing is written to disk, no host API is extended.

## What counts as an artifact

Extension does not matter. What matters is **how the file was created**:

| Source | Counted |
| --- | --- |
| `write` / `edit` / `str_replace_editor` tool | yes |
| `present` tool | yes |
| shell redirection, `cp`, `Out-File`, `--output` | no |
| a script writing files internally (`open(p, 'wb')`) | no |
| build / deploy side effects | no |

Command text is the only thing the host records; a script's internal writes are
invisible to it, so those files never enter the artifact list.

## Install

From npm (once published):

```bash
# via the Harness plugin page, or:
plugin_manager install_bundle("dsh-artifact-wall@0.1.1")
```

From a local directory:

```bash
plugin_manager install_bundle("<absolute path to this directory>")
```

Refresh the page (Ctrl+R) after installing. The plugin needs no restart and no
configuration.

## Requirements

- DSH `>=0.2.2-rc.1 <0.3.0-0` (enforced by `engines.dsh`)
- Node `>=20`

## Compatibility notes

The plugin uses four client-side extension points, all internal:

| Extension point | Stability |
| --- | --- |
| `conversation.chat.turnTail` (list slot) | changed from chain to additive list in 0.1.6-alpha.2 |
| `sidebar.right.pane.tab` + `sidebarRightTabs.register` | band/priority semantics changed before |
| `ctx.sidebarRight.openResource` | low risk |
| `deliverables` projection keys (`produced` / `presented`) | changes silently break counts |

After a DSH upgrade, verify with:

```
cordis_inspect_query Slots.listSubTree("conversation.chat.turnTail")
```

`ownerProps` must still contain `turn` (a TurnLocation) and `openFile`.

## Limitations

- Only `write` / `edit` / `str_replace_editor` / `present` are recognized.
  Files created by shell commands or by scripts do not appear.
- The wall accumulates over turns already mounted in the current session; scroll
  up to load more turns and they join the list.
- Right-click opens the host menu, not a custom one.

## License

MIT
