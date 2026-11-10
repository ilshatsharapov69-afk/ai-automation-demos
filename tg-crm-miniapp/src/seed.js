// Fictional seed data for a sandbox workspace: Brasswick Interiors, a (made-up) office fit-out company with a sales
// team of four. All companies, people, phones (+1 555 01xx) and e-mails (*.example) are invented.
// Times are relative to "now", so reminders are always due today / overdue / upcoming when the demo opens.
import { COMPANY } from './i18n.js';

const COLLEAGUES = [
  { en: 'Mila Orlova', ru: 'Мила Орлова', username: null },
  { en: 'Artem Volkov', ru: 'Артём Волков', username: null },
  { en: 'Sofia Lind', ru: 'София Линд', username: null },
];

// Owner index: 0 = the visitor ("you"), 1-3 = colleagues above, null = unassigned.
// [company, [contact en, contact ru], phone, source, status, value, owner, created days ago, closed days ago,
//  notes: [days ago, author, en, ru], reminders: [hours from now, owner, en, ru]]
const LEADS = [
  ['Orbita Coworking', ['Daniel Brooks', 'Даниил Бруков'], '0142', 'telegram', 'new', 14800, 0, 0.3, null,
    [[0.3, null, 'Wrote to the bot: 12 hot desks and one meeting room, opening in January.', 'Написали боту: 12 рабочих мест и переговорная, открытие в январе.']],
    [[2, 0, 'Call Daniel: confirm floor plan and budget', 'Позвонить Даниилу: уточнить планировку и бюджет']]],
  ['Kestrel Logistics', ['Hannah Moore', 'Анна Морозова'], '0117', 'referral', 'proposal', 46500, 0, 19, null,
    [[18, 1, 'Head office move, open space for 40 people. Referred by Nordlight Studio.', 'Переезд головного офиса, open space на 40 человек. Рекомендация от Nordlight Studio.'],
     [6, 0, 'Proposal v2 sent: sit-stand desks, acoustic panels. They compare with one more supplier.', 'Отправили КП v2: столы-трансформеры, акустические панели. Сравнивают с ещё одним поставщиком.']],
    [[-3, 0, 'Follow up on proposal v2', 'Узнать решение по КП v2']]],
  ['Mapleleaf Dental', ['Dr. Irene Walsh', 'Ирина Вальш'], '0163', 'website', 'qualified', 9200, 1, 9, null,
    [[8, 1, 'Reception desk + waiting area for 10. Wants samples of fabrics.', 'Ресепшен и зона ожидания на 10 мест. Просит образцы тканей.']],
    [[26, 1, 'Bring fabric samples to the clinic', 'Привезти образцы тканей в клинику']]],
  ['Quill & Ink Publishing', ['Oscar Bennett', 'Оскар Беннет'], '0108', 'call', 'contacted', 7600, 2, 5, null,
    [[4, 2, 'Library shelving for the editors floor. Call back after their budget meeting.', 'Стеллажи-библиотека для редакции. Перезвонить после их совещания по бюджету.']],
    [[5, 2, 'Call back after budget meeting', 'Перезвонить после совещания по бюджету']]],
  ['Bluefin Sushi Bar', ['Kenji Mori', 'Кэндзи Мори'], '0155', 'telegram', 'new', 6300, null, 0.6, null,
    [[0.6, null, 'Bar stools and 8 tables, needs it before the New Year rush.', 'Барные стулья и 8 столов, нужно до новогоднего сезона.']], []],
  ['Granite Law Partners', ['Victoria Hale', 'Виктория Хейл'], '0129', 'referral', 'proposal', 31200, 1, 24, null,
    [[22, 1, 'Four partner offices and a boardroom, premium walnut.', 'Четыре кабинета партнёров и переговорная, премиальный орех.'],
     [0.25, 1, 'They liked the 3D renders. Asked for a 10% discount if they sign this month.', 'Понравились 3D-визуализации. Просят скидку 10%, если подпишут в этом месяце.']],
    [[7, 1, 'Send discount approval to Victoria', 'Отправить Виктории согласованную скидку']]],
  ['Pixel Harbor Games', ['Leo Navarro', 'Лев Наваров'], '0171', 'event', 'qualified', 22800, 0, 12, null,
    [[12, 0, 'Met at the Office Design Expo. 25 seats for a game studio, dark colours.', 'Познакомились на выставке офисного дизайна. 25 мест для гейм-студии, тёмные цвета.'],
     [2, 0, 'Site visit done, measurements in the shared folder.', 'Выезд на объект сделан, замеры в общей папке.']],
    [[30, 0, 'Prepare proposal for Pixel Harbor', 'Подготовить КП для Pixel Harbor']]],
  ['Tallow & Thyme Bakery', ['Grace Turner', 'Галина Тюрина'], '0134', 'website', 'contacted', 4100, 3, 3, null,
    [[3, 3, 'Café seating for 24, wants a quick quote.', 'Посадка на 24 места для кафе, нужна быстрая оценка.']],
    [[-20, 3, 'Send quick quote to Grace', 'Отправить Галине быструю оценку']]],
  ['Vertex Insurance', ['Martin Clarke', 'Мартин Кларк'], '0186', 'call', 'new', 18900, 2, 1, null,
    [[1, 2, 'New branch office, 15 workstations.', 'Новый филиал, 15 рабочих мест.']], []],
  ['Copperleaf Hotel', ['Amelia Ross', 'Амелия Росс'], '0122', 'referral', 'qualified', 38400, 1, 15, null,
    [[14, 1, 'Boutique hotel, 18 rooms: lobby and breakfast area first, rooms next year.', 'Бутик-отель на 18 номеров: сначала лобби и зона завтраков, номера в следующем году.'],
     [0.45, 1, 'Owner approved the budget for the lobby. Waiting for the designer brief.', 'Владелец согласовал бюджет на лобби. Ждём ТЗ от дизайнера.']], []],
  ['Lumen Kids Academy', ['Paula Stein', 'Полина Штейн'], '0145', 'website', 'proposal', 12700, 2, 21, null,
    [[20, 2, 'Six classrooms, safe rounded corners, certified materials.', 'Шесть классов, скруглённые углы, сертифицированные материалы.'],
     [5, 2, 'Proposal sent. Decision by the school board next week.', 'КП отправлено. Решение совета школы на следующей неделе.']], []],
  ['Driftwood Realty', ['Sam Fletcher', 'Семён Флетчер'], '0119', 'telegram', 'contacted', 8800, 0, 4, null,
    [[0.5, 0, 'Sales office with a client lounge. Asked for references.', 'Офис продаж с лаунжем для клиентов. Попросили примеры работ.']],
    [[4, 0, 'Send Sam three references with photos', 'Отправить Семёну три кейса с фото']]],
  ['Stellar Pharmacy', ['Nina Petrov', 'Нина Петрова'], '0193', 'event', 'new', 15600, null, 2, null,
    [[2, null, 'Three pharmacy counters, contact left at the expo stand.', 'Три аптечные стойки, контакт оставили на стенде выставки.']], []],
  ['Riverside Accounting', ['Peter Hughes', 'Пётр Хьюз'], '0138', 'call', 'contacted', 6900, 3, 8, null,
    [[8, 3, '8 desks and lockable cabinets for documents.', '8 столов и запирающиеся шкафы для документов.']], []],
  ['Foxglove Florist', ['Ella Hart', 'Элла Харт'], '0102', 'website', 'new', 2400, null, 0.2, null,
    [[0.2, null, 'Shop counter and display shelves, small budget.', 'Прилавок и витринные полки, небольшой бюджет.']], []],
  ['Cobalt Data Labs', ['Ryan Cho', 'Роман Чо'], '0177', 'referral', 'proposal', 72500, 0, 28, null,
    [[27, 1, 'Big one: 60 seats, two floors. Mila introduced them to us.', 'Крупный: 60 мест, два этажа. Мила нас познакомила.'],
     [9, 0, 'Pitch meeting went well, CFO asked for a payment schedule.', 'Встреча прошла хорошо, финдиректор попросил график платежей.']],
    [[50, 0, 'Call Ryan about the payment schedule', 'Созвониться с Романом по графику платежей']]],
  ['Saffron Spice Restaurant', ['Arjun Mehta', 'Арджун Мехта'], '0151', 'telegram', 'qualified', 11300, 3, 10, null,
    [[9, 3, 'Restaurant hall for 40 guests, warm colours, booths along the wall.', 'Зал ресторана на 40 гостей, тёплые цвета, диваны вдоль стены.']], []],
  // Closed deals (feed the stats).
  ['Nordlight Studio', ['Freya Olsen', 'Фрея Ольсен'], '0111', 'referral', 'won', 19800, 1, 40, 6,
    [[39, 1, 'Architecture studio, 14 drafting desks.', 'Архитектурное бюро, 14 чертёжных столов.'], [6, 1, 'Signed! Delivery in three weeks.', 'Подписали! Поставка через три недели.']], []],
  ['Ironbark Taproom', ['Callum Reid', 'Кирилл Рейд'], '0166', 'event', 'won', 13400, 0, 33, 2,
    [[32, 0, 'Taproom tables and bar from reclaimed oak.', 'Столы и барная стойка из старого дуба.'], [2, 0, 'Contract signed, 50% prepayment received.', 'Договор подписан, получили 50% предоплаты.']], []],
  ['Arcadia Veterinary', ['Lucy Grant', 'Люся Гранина'], '0127', 'website', 'won', 7200, 2, 26, 11,
    [[25, 2, 'Waiting area with washable surfaces.', 'Зона ожидания с моющимися поверхностями.']], []],
  ['Mosaic Language School', ['Pablo Ruiz', 'Павел Руис'], '0158', 'telegram', 'won', 16100, 3, 52, 23,
    [[50, 3, 'Ten classrooms and a teachers room.', 'Десять классов и учительская.']], []],
  ['Brightwater Clinic', ['Helen Cooper', 'Елена Купер'], '0184', 'referral', 'won', 24600, 1, 61, 34,
    [[60, 1, 'Private clinic, reception and six offices.', 'Частная клиника, ресепшен и шесть кабинетов.']], []],
  ['Sunpeak Fitness', ['Mike Dawson', 'Михаил Доусон'], '0131', 'website', 'lost', 9900, 2, 30, 9,
    [[9, 2, 'Lost on price: went with a cheaper flat-pack option.', 'Проиграли по цене: выбрали более дешёвую сборную мебель.']], []],
  ['Halcyon Yoga', ['Nora Fields', 'Нора Филдс'], '0148', 'telegram', 'lost', 3800, 3, 22, 14,
    [[14, 3, 'Project postponed indefinitely.', 'Проект отложен на неопределённый срок.']], []],
  ['Polar Bear Ice Cream', ['Ivan Snow', 'Иван Снегов'], '0175', 'call', 'lost', 2900, 0, 45, 30,
    [[30, 0, 'Kiosk plans cancelled by the mall.', 'Торговый центр отменил размещение киоска.']], []],
  ['Tundra Outdoor Gear', ['Erik Berg', 'Эрик Берг'], '0189', 'event', 'lost', 21000, 1, 55, 38,
    [[38, 1, 'Chose a supplier who also does the shop lighting.', 'Выбрали подрядчика, который делает ещё и освещение.']], []],
];

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '');

const dropStatements = (db, wsId) => [
  db.prepare('DELETE FROM notes WHERE lead_id IN (SELECT id FROM leads WHERE workspace_id = ?)').bind(wsId),
  db.prepare('DELETE FROM reminders WHERE workspace_id = ?').bind(wsId),
  db.prepare('DELETE FROM leads WHERE workspace_id = ?').bind(wsId),
  db.prepare('DELETE FROM members WHERE workspace_id = ?').bind(wsId),
  db.prepare('DELETE FROM workspaces WHERE id = ?').bind(wsId),
];

/** Delete a workspace and everything in it. */
export const dropWorkspace = (db, wsId) => db.batch(dropStatements(db, wsId));
export const dropWorkspaces = (db, wsIds) => db.batch(wsIds.flatMap((id) => dropStatements(db, id)));

/**
 * Create (or re-create) a sandbox workspace with fictional data and the visitor as admin.
 * Returns the visitor's member id.
 */
export async function seedWorkspace(db, wsId, user, lang, now = Date.now()) {
  const L = lang === 'ru' ? 1 : 0;
  await db.batch([
    ...dropStatements(db, wsId),
    db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').bind(wsId, COMPANY[lang] || COMPANY.en, iso(now)),
  ]);

  const memberStmt = 'INSERT INTO members (workspace_id, tg_id, name, username, role, lang, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  const youName = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 60) || 'You';
  const mres = await db.batch([
    db.prepare(memberStmt).bind(wsId, user.id, youName, user.username || null, 'admin', lang, iso(now), iso(now - 90 * DAY)),
    ...COLLEAGUES.map((c, i) => db.prepare(memberStmt).bind(wsId, null, c[lang] || c.en, c.username, i === 0 ? 'admin' : 'sales', lang, null, iso(now - 90 * DAY))),
  ]);
  const memberIds = mres.map((r) => r.meta.last_row_id);
  const mid = (i) => (i === null || i === undefined ? null : memberIds[i]);

  const leadStmts = LEADS.map(([company, names, phone, source, status, value, owner, created, closed, notes]) => {
    const createdAt = now - created * DAY;
    const lastNote = notes.length ? Math.min(...notes.map((n) => n[0])) : created;
    const updatedAt = now - Math.min(lastNote, closed ?? Infinity) * DAY;
    return db
      .prepare('INSERT INTO leads (workspace_id, name, company, phone, email, source, status, value, owner_id, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(wsId, names[L], company, `+1 555 ${phone}`, `${slug(names[0].split(' ').pop())}@${slug(company)}.example`, source, status, value, mid(owner),
        iso(createdAt), iso(updatedAt), closed === null ? null : iso(now - closed * DAY));
  });
  const lres = await db.batch(leadStmts);

  const rest = [];
  LEADS.forEach(([, , , , status, , owner, created, closed, notes, reminders], i) => {
    const leadId = lres[i].meta.last_row_id;
    const note = (kind, text, author, at) =>
      db.prepare('INSERT INTO notes (lead_id, author_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(leadId, author, kind, text, iso(at));
    rest.push(note('created', '', mid(owner), now - created * DAY));
    for (const [ago, author, en, ru] of notes) rest.push(note('note', L ? ru : en, mid(author), now - ago * DAY + 60000));
    if (status !== 'new') {
      const at = closed !== null ? now - closed * DAY : now - (created * DAY) / 2;
      rest.push(note('status', `${closed !== null ? 'proposal' : 'new'}>${status}`, mid(owner), at));
    }
    for (const [hours, who, en, ru] of reminders) {
      const due = Math.round((now + hours * 3600000) / 900000) * 900000; // round to 15 minutes
      rest.push(db.prepare('INSERT INTO reminders (workspace_id, lead_id, member_id, due_at, text, done, sent_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
        .bind(wsId, leadId, mid(who), iso(due), L ? ru : en, hours < 0 ? iso(due) : null, iso(now - DAY)));
    }
  });
  await db.batch(rest);
  return memberIds[0];
}

export const SEED_COUNTS = { leads: LEADS.length, members: COLLEAGUES.length + 1, reminders: LEADS.reduce((n, l) => n + l[10].length, 0) };
