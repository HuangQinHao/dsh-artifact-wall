/**
 * dsh-artifact-wall — 浏览器半。
 *
 * 两处界面：
 * 1) 每个已完成轮次的末尾（conversation.chat.turnTail）：本轮产物文件清单 + 「查看所有产物」入口；
 * 2) 右侧栏 tab（dsh-resource://artifact-wall/<sessionId>）：本会话已出现过的产物总列表。
 *
 * 数据来源：内建 deliverables 投影在 TurnLocation.data 上发布的 `deliverables` 值
 * （produced = 成功的 write/edit 目标；presented = present 工具声明的文件）。
 * 会话级聚合由本模块的内存 store 完成，每个已挂载轮次的产物都会被登记。
 */
window.__ModuleLoader__.load({
  id: 'dsh-artifact-wall',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'artifact-wall';
    const WALL_ID = 'dsh-artifact-wall';
    const WALL_PREFIX = 'dsh-resource://artifact-wall/';
    const STYLE_ID = 'dsh-artifact-wall/style.css';
    const VISIBLE_ROWS = 4;
    const EMPTY = Object.freeze([]);

    // ---------------------------------------------------------------- 文案

    const zh = {
      'tail.title': '本次产物',
      'tail.count': '{count} 个文件',
      'tail.all': '查看所有产物（{count}）',
      'tail.allEmpty': '查看所有产物',
      'tail.allHint': '打开本会话的产物总列表',
      'tail.expand': '展开其余 {count} 个',
      'tail.collapse': '收起',
      'panel.title': '产物',
      'panel.empty': '本会话没有可列出的产物。只有 write / edit 工具写入的文件会记入产物；用命令行、脚本或部署动作落盘的文件不在其中。',
      'panel.hint': '按对话轮次累积，点击任意文件在右侧栏预览。',
      'panel.turn': '第 {turn} 轮',
    };

    const en = {
      'tail.title': 'Produced in this turn',
      'tail.count': '{count} files',
      'tail.all': 'All artifacts ({count})',
      'tail.allEmpty': 'All artifacts',
      'tail.allHint': 'Open every artifact in this session',
      'tail.expand': 'Show {count} more',
      'tail.collapse': 'Collapse',
      'panel.title': 'Artifacts',
      'panel.empty': 'No listable artifacts in this session. Only files written by the write / edit tools count; files produced by shell commands or scripts are not included.',
      'panel.hint': 'Accumulated per turn. Click a file to preview it in this sidebar.',
      'panel.turn': 'turn {turn}',
    };

    // ---------------------------------------------------------------- 会话产物 store

    /** sessionId -> { version, order: Entry[], byPath: Map<string, Entry> } */
    const buckets = new Map();
    /** sessionId -> { version, value } —— 给 useSyncExternalStore 的稳定快照 */
    const snapshots = new Map();
    /**
     * sessionId -> 宿主在轮次末尾给的文件打开器。
     * 侧边栏面板拿不到 turnTail 的 ownerProps，借用这里登记的实现，
     * 打开行为与宿主自己的文件卡片完全一致（工作区路径相对化、tab 认领都由宿主处理）。
     */
    const openers = new Map();
    const watchers = new Set();

    function notify() {
      for (const watcher of Array.from(watchers)) {
        try {
          watcher();
        } catch (error) {
          // 一个订阅者失败不能阻断其他订阅者。
        }
      }
    }

    function subscribe(watcher) {
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
      };
    }

    function bucketOf(sessionId) {
      let bucket = buckets.get(sessionId);
      if (bucket === undefined) {
        bucket = { version: 0, order: [], byPath: new Map() };
        buckets.set(sessionId, bucket);
      }
      return bucket;
    }

    /**
     * 把一轮的产物并入会话记录。同一路径只保留首次出现的轮次，后到者只补充描述。
     */
    function merge(sessionId, turn, entries) {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      if (!Array.isArray(entries) || entries.length === 0) return;
      const bucket = bucketOf(sessionId);
      let changed = false;
      for (const entry of entries) {
        const path = entry.path;
        const existing = bucket.byPath.get(path);
        if (existing === undefined) {
          const record = {
            path,
            description: entry.description,
            turn,
            index: bucket.order.length,
          };
          bucket.byPath.set(path, record);
          bucket.order.push(record);
          changed = true;
        } else if (typeof entry.description === 'string' && entry.description !== '' && !existing.description) {
          existing.description = entry.description;
          changed = true;
        }
      }
      if (!changed) return;
      bucket.version += 1;
      snapshots.delete(sessionId);
      notify();
    }

    function listOf(sessionId) {
      const bucket = typeof sessionId === 'string' ? buckets.get(sessionId) : undefined;
      if (bucket === undefined || bucket.order.length === 0) return EMPTY;
      const cached = snapshots.get(sessionId);
      if (cached !== undefined && cached.version === bucket.version) return cached.value;
      const value = bucket.order.slice();
      snapshots.set(sessionId, { version: bucket.version, value });
      return value;
    }

    function useArtifacts(sessionId) {
      return React.useSyncExternalStore(
        subscribe,
        () => listOf(sessionId),
        () => listOf(sessionId),
      );
    }

    // ---------------------------------------------------------------- 轮次数据 → 文件清单

    function turnEntries(deliverables) {
      if (deliverables === undefined || deliverables === null) return EMPTY;
      const out = [];
      const index = new Map();
      const produced = Array.isArray(deliverables.produced) ? deliverables.produced : [];
      for (const item of produced) {
        if (!item || typeof item.path !== 'string' || item.path.trim() === '') continue;
        if (index.has(item.path)) continue;
        index.set(item.path, out.length);
        out.push({ path: item.path });
      }
      const presented = Array.isArray(deliverables.presented) ? deliverables.presented : [];
      for (const item of presented) {
        if (!item || typeof item.path !== 'string' || item.path.trim() === '') continue;
        const at = index.get(item.path);
        if (at === undefined) {
          index.set(item.path, out.length);
          out.push({ path: item.path, description: item.description });
        } else if (typeof item.description === 'string' && item.description !== '') {
          out[at].description = item.description;
        }
      }
      return out;
    }

    function splitPath(path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/\/+$/, '');
      const at = normalized.lastIndexOf('/');
      if (at < 0) return { name: normalized, dir: '' };
      return { name: normalized.slice(at + 1), dir: normalized.slice(0, at) };
    }

    function extensionOf(name) {
      const at = name.lastIndexOf('.');
      return at > 0 && at < name.length - 1 ? name.slice(at + 1).toUpperCase().slice(0, 4) : '';
    }

    /** 目录只保留末尾两段，长路径不挤掉文件名。 */
    function shortenDir(dir) {
      if (dir === '') return '';
      const parts = dir.split('/').filter((part) => part !== '');
      if (parts.length <= 2) return dir;
      return '…/' + parts.slice(-2).join('/');
    }

    function describe(record) {
      if (typeof record.description === 'string' && record.description !== '') return record.description;
      const dir = splitPath(record.path).dir;
      return shortenDir(dir) === '' ? record.path : shortenDir(dir);
    }

    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }

    /** dsh-resource://file/session/<sessionId>/<path>；绝对路径在会话作用域内保持绝对。 */
    function fileAddress(sessionId, path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      const encoded = normalized.split('/').map(encodeSegment).join('/');
      return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' + encoded;
    }

    function wallAddress(sessionId) {
      return WALL_PREFIX + encodeURIComponent(sessionId);
    }

    function parseWallSession(address) {
      if (typeof address !== 'string' || !address.startsWith(WALL_PREFIX)) return undefined;
      const end = address.search(/[?#]/);
      const raw = address.slice(WALL_PREFIX.length, end === -1 ? undefined : end);
      if (raw === '') return undefined;
      try {
        return decodeURIComponent(raw);
      } catch (error) {
        return undefined;
      }
    }

    // ---------------------------------------------------------------- 组件

    function FileRow(props) {
      const { record, t, onOpen, contextMenuProps, showTurn } = props;
      const { name, dir } = splitPath(record.path);
      const label = extensionOf(name) || 'FILE';
      return h(
        'div',
        {
          // 右键菜单的触发器先展开，左键行为再覆盖，避免触发器自带的 onClick 抢走左键。
          ...contextMenuProps,
          className: 'daw-row',
          role: 'button',
          tabIndex: 0,
          title: record.path,
          onClick: onOpen,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen();
            }
          },
        },
        h('span', { className: 'daw-glyph', 'aria-hidden': true }, label),
        h(
          'span',
          { className: 'daw-rowBody' },
          h('span', { className: 'daw-rowName' }, name === '' ? record.path : name),
          h('span', { className: 'daw-rowSub' }, describe(record)),
        ),
        showTurn === true && typeof record.turn === 'number'
          ? h('span', { className: 'daw-rowTurn' }, t('panel.turn', { turn: String(record.turn) }))
          : null,
        h('span', { className: 'daw-rowGo', 'aria-hidden': true }, '›'),
      );
    }

    /**
     * 轮次末尾的产物区。present 已声明的文件交给内建 present 卡片展示，这里不再重复列，
     * 只保留「查看所有产物」入口；模型没有 present 时（普通 write/edit），这里补上文件清单。
     */
    function ArtifactTail(props) {
      const sessionId = props.sessionId;
      const location = props.turn;
      const numericTurn = typeof location === 'number' ? location : undefined;
      const turnLocation = location !== undefined && location !== null && typeof location === 'object' ? location : undefined;
      const turnNumber = turnLocation !== undefined && typeof turnLocation.turn === 'number' ? turnLocation.turn : numericTurn;
      const deliverables = turnLocation !== undefined && turnLocation.data !== undefined && typeof turnLocation.data.get === 'function'
        ? turnLocation.data.get('deliverables')
        : undefined;
      const entries = React.useMemo(() => turnEntries(deliverables), [deliverables]);
      const all = useArtifacts(sessionId);
      const [expanded, setExpanded] = React.useState(false);

      React.useEffect(() => {
        if (entries.length === 0) return;
        merge(sessionId, turnNumber, entries);
      }, [sessionId, turnNumber, entries]);

      React.useEffect(() => {
        const opener = props.openFile;
        if (typeof opener === 'function' && typeof sessionId === 'string' && sessionId !== '') {
          openers.set(sessionId, opener);
        }
      }, [sessionId, props.openFile]);

      const t = props.t;
      const openFile = props.openFile;
      const openWall = props.openWall;
      const useContextMenu = props.useContextMenu;
      const menu = typeof useContextMenu === 'function' ? useContextMenu() : undefined;
      const getTriggerProps = menu !== undefined && typeof menu.getTriggerProps === 'function' ? menu.getTriggerProps : undefined;

      // 入口固定：这一轮没有产物也要保留按钮，否则用户得回滚到有产物的那一轮才找得到入口。
      const presentedCount = deliverables !== undefined && Array.isArray(deliverables.presented) ? deliverables.presented.length : 0;
      const showRows = entries.length > 0 && presentedCount === 0;
      const shown = expanded ? entries : entries.slice(0, VISIBLE_ROWS);
      const hidden = entries.length - VISIBLE_ROWS;

      return h(
        'div',
        { className: 'daw-tail' },
        showRows
          ? h(
              'div',
              { className: 'daw-card' },
              h(
                'div',
                { className: 'daw-cardHead' },
                h('span', { className: 'daw-cardTitle' }, t('tail.title')),
                h('span', { className: 'daw-count' }, t('tail.count', { count: String(entries.length) })),
              ),
              h(
                'div',
                { className: 'daw-rows' },
                shown.map((record) =>
                  h(FileRow, {
                    key: record.path,
                    record,
                    t,
                    onOpen: () => {
                      if (typeof openFile === 'function') openFile(record.path);
                    },
                    contextMenuProps:
                      getTriggerProps !== undefined
                        ? getTriggerProps({ kind: 'file', value: { sessionId, path: record.path } })
                        : undefined,
                  }),
                ),
              ),
              hidden > 0 || expanded
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'daw-link',
                      'aria-expanded': expanded,
                      onClick: () => setExpanded((value) => !value),
                    },
                    expanded ? t('tail.collapse') : t('tail.expand', { count: String(hidden) }),
                  )
                : null,
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            className: all.length > 0 ? 'daw-all' : 'daw-all daw-allQuiet',
            title: t('tail.allHint'),
            onClick: () => {
              if (typeof openWall === 'function') openWall(sessionId);
            },
          },
          h('span', { className: 'daw-allIcon', 'aria-hidden': true }, '▤'),
          h('span', null, all.length > 0 ? t('tail.all', { count: String(all.length) }) : t('tail.allEmpty')),
          h('span', { className: 'daw-allGo', 'aria-hidden': true }, '›'),
        ),
      );
    }

    /** 右侧栏产物总列表。 */
    function WallPanel(props) {
      const sessionId = props.sessionId;
      const t = props.t;
      const openArtifact = props.openArtifact;
      const useContextMenu = props.useContextMenu;
      const menu = typeof useContextMenu === 'function' ? useContextMenu() : undefined;
      const getTriggerProps = menu !== undefined && typeof menu.getTriggerProps === 'function' ? menu.getTriggerProps : undefined;
      const tabInfo = typeof props.useTabInfo === 'function' ? props.useTabInfo() : undefined;
      const contentId = tabInfo !== undefined && tabInfo !== null && tabInfo.tab !== undefined ? tabInfo.tab.contentId : undefined;
      const scopeId = parseWallSession(contentId) ?? sessionId;
      const items = useArtifacts(scopeId);

      return h(
        'div',
        { className: 'daw-panel' },
        h(
          'div',
          { className: 'daw-panelHead' },
          h('span', { className: 'daw-panelTitle' }, t('panel.title')),
          h('span', { className: 'daw-count' }, String(items.length)),
        ),
        items.length === 0
          ? h('div', { className: 'daw-empty' }, t('panel.empty'))
          : h(
              'div',
              { className: 'daw-panelList' },
              items.map((record) =>
                h(FileRow, {
                  key: record.path,
                  record,
                  t,
                  showTurn: true,
                  onOpen: () => {
                    const opener = openers.get(scopeId);
                    if (typeof opener === 'function') {
                      opener(record.path);
                      return;
                    }
                    if (typeof openArtifact === 'function') openArtifact(scopeId, record.path);
                  },
                  contextMenuProps:
                    getTriggerProps !== undefined
                      ? getTriggerProps({ kind: 'file', value: { sessionId: scopeId, path: record.path } })
                      : undefined,
                }),
              ),
            ),
        h('div', { className: 'daw-panelFoot' }, t('panel.hint')),
      );
    }

    // ---------------------------------------------------------------- 样式

    const CSS = [
      '.daw-tail{display:flex;flex-direction:column;gap:6px;margin-top:8px;max-width:640px}',
      '.daw-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.daw-cardHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.daw-cardTitle{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.daw-count{font-family:var(--ds-font-family-code);font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.daw-rows{display:flex;flex-direction:column}',
      '.daw-row{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 10px;cursor:pointer;text-align:left;color:inherit;width:100%;box-sizing:border-box}',
      '.daw-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.daw-row:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-state-business-primary)}',
      '.daw-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:24px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font-family:var(--ds-font-family-code);font-size:9px;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}',
      '.daw-rowBody{display:flex;flex-direction:column;min-width:0;flex:1}',
      '.daw-rowName{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.daw-rowSub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.daw-rowTurn{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code)}',
      '.daw-rowGo{flex:none;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:1}',
      '.daw-link{align-self:flex-start;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:2px 10px 6px;cursor:pointer}',
      '.daw-link:hover{color:var(--dsw-alias-label-primary)}',
      '.daw-all{display:inline-flex;align-items:center;gap:6px;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:2px 0;cursor:pointer;align-self:flex-start}',
      '.daw-all:hover{color:var(--dsw-alias-label-primary)}',
      '.daw-allIcon{font-size:11px}',
      '.daw-allQuiet{opacity:.5}',
      '.daw-allQuiet:hover{opacity:.85}',
      '.daw-allGo{font-size:14px;line-height:1}',
      '.daw-panel{display:flex;flex-direction:column;height:100%;min-height:0}',
      '.daw-panelHead{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none}',
      '.daw-panelTitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);flex:1}',
      '.daw-panelList{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;padding:4px 0}',
      '.daw-empty{padding:24px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.daw-panelFoot{flex:none;padding:8px 12px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
    ].join('\n');

    function injectStyle() {
      if (typeof document === 'undefined') return () => {};
      let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']');
      const created = tag === null;
      if (created) {
        tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-artifact-wall';
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }
      return () => {
        if (created && tag !== null && tag.parentNode !== null) tag.parentNode.removeChild(tag);
      };
    }

    // ---------------------------------------------------------------- 插件主体

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'artifact-wall: dictionaries');
      ctx.effect(injectStyle, 'artifact-wall: styles');
      const t = ctx.locale.bind(NS);

      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: WALL_ID,
            kind: 'artifact-wall',
            patterns: ['dsh-resource://artifact-wall/**', 'dsh-resource://artifact-wall/*'],
            priority: 'extension',
            canOpen: (address) => parseWallSession(address) !== undefined,
            title: () => t('panel.title'),
          }),
        'artifact-wall: tab type',
      );

      ctx.effect(
        () =>
          ctx.slots.inject('conversation.chat.turnTail', () =>
            ctx.slots.register(
              {
                name: 'conversation.chat.turnTail',
                id: WALL_ID,
                order: 60,
                locale: NS,
                inject: () => ({
                  openWall: (sessionId) => {
                    if (typeof sessionId !== 'string' || sessionId === '') return;
                    ctx.sidebarRight.openResource(wallAddress(sessionId));
                  },
                }),
              },
              ArtifactTail,
            ),
          ),
        'artifact-wall: turn tail',
      );

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: WALL_ID,
                locale: NS,
                inject: () => ({
                  openArtifact: (sessionId, path) => {
                    if (typeof sessionId !== 'string' || sessionId === '') return;
                    ctx.sidebarRight.openResource(fileAddress(sessionId, path));
                  },
                }),
              },
              WallPanel,
            ),
          ),
        'artifact-wall: panel body',
      );
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply,
    };
  },
});
