// Line icons (24x24, stroke = currentColor) and the floor-plan illustrations. Drawn for this demo.
const P = {
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M17 6l2.5 2.5M14.5 8.5 17 11"/>',
  house: '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.2c0-.7.5-1.2 1.2-1.2h4.6c.7 0 1.2.5 1.2 1.2V7M3 13h18M11 13v2h2v-2"/>',
  roller: '<rect x="3" y="3.5" width="14" height="6" rx="1.6"/><path d="M17 6.5h3.2v5.3H12v2.7"/><rect x="10.4" y="14.5" width="3.2" height="6.5" rx="1"/>',
  drill: '<path d="M3 6.5h11l2.5 2v3L14 13.5H9.5L8.5 20h-3l1-6.5H3z"/><path d="M16.5 10h4.5M7 10h4"/>',
  gem: '<path d="M6.5 3.5h11L22 9l-10 11.5L2 9z"/><path d="M2 9h20M12 20.5 8.5 9 12 3.5 15.5 9z"/>',
  bath: '<path d="M3 12h18v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z"/><path d="M6 12V5.5a2 2 0 0 1 4 0V6M7 20l-1 1.5M17 20l1 1.5"/>',
  kitchen: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9.5h16M8 6.2h.01M12 6.2h.01M9 13.5h6M9 17h6"/>',
  heat: '<path d="M8 3.5c-1.8 2.5 1.8 4.5 0 7.5M12 3.5c-1.8 2.5 1.8 4.5 0 7.5M16 3.5c-1.8 2.5 1.8 4.5 0 7.5"/><path d="M3 16h18M3 20h18"/>',
  ruler: '<path d="m3 16.5 13.5-13.5 4.5 4.5L7.5 21z"/><path d="m7 12.5 2 2M10 9.5l2 2M13 6.5l2 2"/>',
  truck: '<path d="M2 5.5h11.5v10.5H2zM13.5 9.5h4l3.5 4v2.5h-7.5"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  bolt: '<path d="M13 2.5 4.5 13.5h7l-1 8 9-11.5h-7z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19.5 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.3 2.3 4.3-4.6"/>',
  camera: '<path d="M3 8.5c0-1 .8-1.8 1.8-1.8h2.4L8.8 4.5h6.4l1.6 2.2h2.4c1 0 1.8.8 1.8 1.8v9.7c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8z"/><circle cx="12" cy="13" r="3.6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.4 3.4 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.4 3.5 5.2"/>',
  wallet: '<path d="M4 6.5h14.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 6.5 15.5 3.5v3M15 13.5h2"/>',
  broom: '<path d="M14 3.5 10.5 11M7 11h7l2.5 9.5h-12z"/><path d="M8 20.5l.6-4M11.5 20.5v-4M15 20.5l-.6-4"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4.2 3.8-6.5 7.5-6.5s6.7 2.3 7.5 6.5"/>',
  pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m14 6 4 4"/>',
  send: '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4.5-4.5"/>',
};

export const icon = (name, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

// Spirit-level mark: "planka" is a bar, the bubble sits dead centre.
export const logo = `<svg class="logo-mark" viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><rect x="1.5" y="6" width="37" height="12" rx="3.5" fill="currentColor"/><rect x="13" y="9" width="14" height="6" rx="3" fill="#fff" opacity=".95"/><circle cx="20" cy="12" r="2.1" fill="var(--accent)"/><path d="M16.3 9v6M23.7 9v6" stroke="currentColor" stroke-width="1"/></svg>`;

// ---------- floor plans ----------
// Walls drawn as thick lines, doors as gaps with a swing arc, furniture as soft shapes.
function planSvg({ w, h, walls, doors, rooms, furniture, labels, dims, cls }) {
  const wall = walls.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('');
  const door = doors.map(([x, y, r, a]) => {
    // gap of width r at (x,y); a = rotation of the swing
    return `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="0" y="-5" width="${r}" height="10" class="gap"/><path d="M0 0 A ${r} ${r} 0 0 1 ${r} ${-r}" class="swing"/><line x1="${r}" y1="0" x2="${r}" y2="${-r}" class="leaf"/></g>`;
  }).join('');
  const room = rooms.map(([x, y, rw, rh, c]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" class="${c}"/>`).join('');
  const furn = furniture.map((f) => f).join('');
  const lab = labels.map(([x, y, t, a]) => `<text x="${x}" y="${y}"${a ? ` class="${a}"` : ''}>${t}</text>`).join('');
  // dims: vertical dimension lines [x, y1, y2, text] drawn left of the plan
  const dim = (dims || []).map(([x, y1, y2, t]) => `<g class="dim"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}"/><text transform="translate(${x - 7} ${(y1 + y2) / 2}) rotate(-90)">${t}</text></g>`).join('');
  const x0 = dims && dims.length ? -22 : 0;
  return `<svg class="plan ${cls || ''}" viewBox="${x0} 0 ${w - x0} ${h}" role="img" aria-hidden="true"><g class="rooms">${room}</g><g class="furn">${furn}</g><g class="walls">${wall}</g><g class="doors">${door}</g><g class="labels">${lab}</g>${dim}</svg>`;
}

export function heroPlan(l, { withDims = true, cls = '' } = {}) {
  return planSvg({
    w: 420, h: 320, cls,
    rooms: [[20, 30, 230, 160, 'r-acc'], [250, 30, 150, 160, 'r'], [20, 190, 130, 110, 'r'], [150, 190, 140, 110, 'r'], [290, 190, 110, 110, 'r-tile']],
    walls: [[20, 30, 400, 30], [400, 30, 400, 300], [400, 300, 20, 300], [20, 300, 20, 30], [250, 30, 250, 190], [20, 190, 400, 190], [150, 190, 150, 300], [290, 190, 290, 300]],
    doors: [[180, 190, 34, 0], [262, 190, 30, 0], [300, 190, 26, 180 + 0], [150, 220, 28, 90], [290, 255, 26, -90]],
    furniture: [
      '<rect x="40" y="48" width="120" height="34" rx="9" class="f"/><rect x="40" y="48" width="120" height="10" rx="5" class="f2"/>',
      '<rect x="72" y="104" width="62" height="40" rx="6" class="f-soft"/>',
      '<rect x="292" y="56" width="90" height="104" rx="8" class="f"/><rect x="298" y="62" width="36" height="20" rx="5" class="f2"/><rect x="340" y="62" width="36" height="20" rx="5" class="f2"/>',
      '<path d="M28 200h114v18H46v74H28z" class="f"/><circle cx="62" cy="209" r="5" class="f2"/><circle cx="84" cy="209" r="5" class="f2"/>',
      '<rect x="330" y="232" width="62" height="60" rx="14" class="f"/><circle cx="308" cy="286" r="8" class="f2"/>',
    ],
    labels: [[135, 172, l.living], [325, 178, l.bed], [96, 288, l.kitchen], [220, 252, l.hall], [345, 222, l.bath]],
    dims: withDims ? [[6, 30, 300, '6.8 m']] : [],
  });
}

export function projectPlan(kind) {
  if (kind === 'b') {
    return planSvg({
      w: 300, h: 200,
      rooms: [[15, 15, 200, 170, 'r-acc'], [215, 15, 70, 80, 'r-tile'], [215, 95, 70, 90, 'r']],
      walls: [[15, 15, 285, 15], [285, 15, 285, 185], [285, 185, 15, 185], [15, 185, 15, 15], [215, 15, 215, 185], [215, 95, 285, 95]],
      doors: [[215, 52, 24, 90], [215, 130, 26, 90]],
      furniture: ['<rect x="30" y="30" width="80" height="60" rx="8" class="f"/>', '<rect x="130" y="120" width="70" height="50" rx="6" class="f-soft"/>', '<path d="M28 175V112h18v63z" class="f"/>', '<rect x="232" y="26" width="44" height="36" rx="10" class="f"/>'],
      labels: [], dims: [],
    });
  }
  if (kind === 'c') {
    const one = (dx) => `<g transform="translate(${dx} 0)"><rect x="0" y="15" width="135" height="170" class="r-acc"/><rect x="0" y="120" width="60" height="65" class="r-tile"/><rect x="85" y="15" width="50" height="60" class="r"/><g class="walls"><line x1="0" y1="15" x2="135" y2="15"/><line x1="135" y1="15" x2="135" y2="185"/><line x1="135" y1="185" x2="0" y2="185"/><line x1="0" y1="185" x2="0" y2="15"/><line x1="0" y1="120" x2="60" y2="120"/><line x1="60" y1="120" x2="60" y2="185"/><line x1="85" y1="15" x2="85" y2="75"/><line x1="85" y1="75" x2="135" y2="75"/></g><g class="furn"><rect x="96" y="24" width="30" height="42" rx="3" class="f2"/><path d="M98 30h26M98 36h26M98 42h26M98 48h26M98 54h26M98 60h26" class="stairs"/><rect x="12" y="28" width="58" height="40" rx="7" class="f"/><rect x="74" y="125" width="48" height="48" rx="6" class="f-soft"/><rect x="10" y="132" width="40" height="30" rx="9" class="f"/></g></g>`;
    return `<svg class="plan" viewBox="0 0 300 200" role="img" aria-hidden="true">${one(10)}${one(155)}</svg>`;
  }
  return heroPlan({ living: '', bed: '', kitchen: '', bath: '', hall: '' }, { withDims: false, cls: 'plan-sm' });
}
