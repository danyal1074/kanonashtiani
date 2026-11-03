// Shared original 3D icon atlases: every UI icon uses the same renderer.
// Chart SVGs and printable answer sheets are data graphics, not UI icons.
const ATLAS = {
  core: { file: 'education-icons-3d.png', columns: 4, rows: 4 },
  actions: { file: 'education-icons-actions-3d.png', columns: 6, rows: 5 },
  tools: { file: 'education-icons-tools-3d.png', columns: 6, rows: 5 },
};
const ICON_3D = {
  "book": [
    "core",
    0
  ],
  "clipboard": [
    "core",
    1
  ],
  "file-check": [
    "core",
    2
  ],
  "check-circle": [
    "core",
    2
  ],
  "users": [
    "core",
    3
  ],
  "calendar": [
    "core",
    4
  ],
  "chart": [
    "core",
    5
  ],
  "trend": [
    "core",
    5
  ],
  "trophy": [
    "core",
    6
  ],
  "award": [
    "core",
    7
  ],
  "home": [
    "core",
    8
  ],
  "message": [
    "core",
    9
  ],
  "bell": [
    "core",
    10
  ],
  "settings": [
    "core",
    11
  ],
  "sliders": [
    "core",
    11
  ],
  "graduation": [
    "core",
    12
  ],
  "backpack": [
    "core",
    12
  ],
  "flask": [
    "core",
    13
  ],
  "board": [
    "core",
    14
  ],
  "building": [
    "core",
    14
  ],
  "wallet": [
    "core",
    15
  ],
  "cap": [
    "core",
    12
  ],
  "file-text": [
    "actions",
    0
  ],
  "timer": [
    "actions",
    1
  ],
  "sparkles": [
    "actions",
    2
  ],
  "gamepad": [
    "actions",
    3
  ],
  "megaphone": [
    "actions",
    4
  ],
  "user": [
    "actions",
    5
  ],
  "user-check": [
    "actions",
    6
  ],
  "user-x": [
    "actions",
    7
  ],
  "card": [
    "actions",
    8
  ],
  "bag": [
    "actions",
    9
  ],
  "check": [
    "actions",
    10
  ],
  "lock": [
    "actions",
    11
  ],
  "logout": [
    "actions",
    12
  ],
  "menu": [
    "actions",
    13
  ],
  "x": [
    "actions",
    14
  ],
  "chevron-left": [
    "actions",
    15
  ],
  "chevron-right": [
    "actions",
    16
  ],
  "arrow-left": [
    "actions",
    17
  ],
  "arrow-right": [
    "actions",
    18
  ],
  "plus": [
    "actions",
    19
  ],
  "search": [
    "actions",
    20
  ],
  "clock": [
    "actions",
    21
  ],
  "star": [
    "actions",
    22
  ],
  "flame": [
    "actions",
    23
  ],
  "target": [
    "actions",
    24
  ],
  "calculator": [
    "actions",
    25
  ],
  "languages": [
    "actions",
    26
  ],
  "bulb": [
    "actions",
    27
  ],
  "globe": [
    "actions",
    28
  ],
  "compass": [
    "actions",
    29
  ],
  "zap": [
    "tools",
    0
  ],
  "bot": [
    "tools",
    1
  ],
  "play": [
    "tools",
    2
  ],
  "pause": [
    "tools",
    3
  ],
  "stop": [
    "tools",
    4
  ],
  "upload": [
    "tools",
    5
  ],
  "download": [
    "tools",
    6
  ],
  "eye": [
    "tools",
    7
  ],
  "eye-off": [
    "tools",
    8
  ],
  "phone": [
    "tools",
    9
  ],
  "alert": [
    "tools",
    10
  ],
  "info": [
    "tools",
    11
  ],
  "video": [
    "tools",
    12
  ],
  "sprout": [
    "tools",
    13
  ],
  "receipt": [
    "tools",
    14
  ],
  "shield": [
    "tools",
    15
  ],
  "printer": [
    "tools",
    16
  ],
  "camera": [
    "tools",
    17
  ],
  "coins": [
    "tools",
    18
  ],
  "inbox": [
    "tools",
    19
  ],
  "send": [
    "tools",
    20
  ],
  "copy": [
    "tools",
    21
  ],
  "cake": [
    "tools",
    22
  ],
  "refresh": [
    "tools",
    23
  ],
  "trash": [
    "tools",
    24
  ],
  "edit": [
    "tools",
    25
  ],
  "heart": [
    "tools",
    26
  ],
  "database": [
    "tools",
    27
  ],
  "more": [
    "tools",
    28
  ],
  "key": [
    "tools",
    29
  ]
};
const escapeAttr = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function icon(name, { size = 20, cls = '', label = '' } = {}) {
  const [atlas, index] = Object.hasOwn(ICON_3D, name) ? ICON_3D[name] : ICON_3D.info;
  const { file, columns, rows } = ATLAS[atlas];
  const width = Number.isFinite(Number(size)) ? Math.max(1, Math.min(512, Number(size))) : 20;
  const x = (index % columns) * 100 / (columns - 1);
  const y = Math.floor(index / columns) * 100 / (rows - 1);
  return `<span class="ic icon-3d icon-atlas-${atlas} ${escapeAttr(cls)}" data-icon="${escapeAttr(Object.hasOwn(ICON_3D, name) ? name : 'info')}" style="width:${width}px;height:${width}px;background-image:url('/roshd/img/${file}');background-size:${columns * 100}% ${rows * 100}%;background-position:${x}% ${y}%" ${label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true"'}></span>`;
}
export const hasIcon = name => Object.hasOwn(ICON_3D, name);

export function sproutArt(level = 1, size = 120) {
  const n = Math.max(1, Math.min(8, Number(level) || 1));
  return `<span class="sprout-art sprout-art-3d" role="img" aria-label="نهال رشد، سطح ${n}">${icon('sprout', { size })}<span class="sprout-level">${String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}</span></span>`;
}
