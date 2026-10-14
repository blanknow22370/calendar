(() => {
  "use strict";

  const STORAGE_KEY = "chronicle-forge.project.v1";
  const THEME_KEY = "chronicle-forge.theme";
  const themes = {
    obsidian: { name: "黑曜编辑台", color: "#070707" },
    paper: { name: "纯白工作台", color: "#f3f3f1" },
    sky: { name: "云境画廊", color: "#3f80b4" },
    orchid: { name: "紫樱工作台", color: "#fbfbfe" }
  };
  const typeIcons = { event: "◆", person: "♙", era: "▰", lore: "✦" };
  const typeNames = { event: "事件", person: "人物", era: "时代", lore: "设定" };
  const symbolChoices = new Set(["◆", "●", "▲", "★", "♙", "▰", "✦"]);
  const materialSources = {
    wikipedia: { name: "中文维基", short: "维基" },
    wikidata: { name: "Wikidata", short: "数据" },
    openlibrary: { name: "Open Library", short: "书目" }
  };
  const defaultMaterialSourceOrder = Object.keys(materialSources);
  const originNames = { manual: "自建节点", material: "外部素材", file: "文件节点" };
  const SECONDS_PER_DAY = 86400;
  const GREGORIAN_MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const BUILTIN_CALENDAR = { id: "gregorian", name: "公历", type: "gregorian", secondsPerDay: SECONDS_PER_DAY };
  const exampleText = `现实：元朝 1206年-1368年

1328年朱元璋出生
1368年明朝建立
1402年都城迁址
1472年王守仁出生
1529年王守仁逝世

架空世界观：从1368年起，历史驶入另一条轨道
1368年架空王朝建立
1490年新的历史节点出现`;

  const $ = (selector) => document.querySelector(selector);
  const dom = {
    appShell: $("#appShell"), projectTitle: $("#projectTitle"), branchList: $("#branchList"),
    timelineStage: $("#timelineStage"), viewport: $("#timelineViewport"), svg: $("#timelineSvg"),
    eventLayer: $("#eventLayer"), branchLabelLayer: $("#branchLabelLayer"), emptyState: $("#emptyState"),
    rangeReadout: $("#rangeReadout"), zoomSlider: $("#zoomSlider"), zoomReadout: $("#zoomReadout"),
    timelineSearch: $("#timelineSearch"), searchCount: $("#searchCount"), calendarBtn: $("#calendarBtn"), granularityControl: $("#granularityControl"),
    minimapCanvas: $("#minimapCanvas"), minimapWindow: $("#minimapWindow"), inspector: $("#inspector"),
    inspectorEmpty: $("#inspectorEmpty"), eventForm: $("#eventForm"), inspectorHeading: $("#inspectorHeading"),
    eventTitle: $("#eventTitle"), eventStart: $("#eventStart"), eventEnd: $("#eventEnd"), eventContinuityMode: $("#eventContinuityMode"), eventContinuityHint: $("#eventContinuityHint"), continuityControl: $("#continuityControl"),
    eventBranch: $("#eventBranch"), eventType: $("#eventType"), eventDescription: $("#eventDescription"),
    eventColor: $("#eventColor"), eventSymbol: $("#eventSymbol"), eventSource: $("#eventSource"),
    attachmentList: $("#attachmentList"), searchResults: $("#searchResults"), parseDialog: $("#parseDialog"),
    timelineText: $("#timelineText"), parsePreview: $("#parsePreview"), parseCount: $("#parseCount"),
    branchDialog: $("#branchDialog"), branchForm: $("#branchForm"), branchParent: $("#branchParent"),
    projectMenu: $("#projectMenu"), importFile: $("#importFile"), toast: $("#toast"), saveStatus: $("#saveStatus"),
    themeBtn: $("#themeBtn"), themeMenu: $("#themeMenu"), eventLibrary: $("#eventLibrary"),
    libraryCount: $("#libraryCount"), branchDialogHeading: $("#branchDialogHeading"), branchSubmitBtn: $("#branchSubmitBtn"),
    deleteBranchBtn: $("#deleteBranchBtn"), calendarInputHint: $("#calendarInputHint"),
    calendarDialog: $("#calendarDialog"), calendarList: $("#calendarList"), calendarJson: $("#calendarJson"),
    materialDrawer: $("#materialDrawer"), materialSearchForm: $("#materialSearchForm"), materialQuery: $("#materialQuery"), materialResults: $("#materialResults"), materialSources: $("#materialSources"),
    branchSurface: $("#branchSurface"), surfaceDialog: $("#surfaceDialog"), surfaceForm: $("#surfaceForm"),
    surfaceParent: $("#surfaceParent"), surfaceDialogHeading: $("#surfaceDialogHeading"), surfaceSubmitBtn: $("#surfaceSubmitBtn"), deleteSurfaceBtn: $("#deleteSurfaceBtn"),
    nodeOriginPill: $("#nodeOriginPill"), descriptionPreview: $("#descriptionPreview"), materialNodeMeta: $("#materialNodeMeta"),
    eventSourceGroupTitle: $("#eventSourceGroupTitle"), eventSourceGroupHint: $("#eventSourceGroupHint"), eventSourceLabelText: $("#eventSourceLabelText"),
    fileFunctionGroup: $("#fileFunctionGroup"), fileMetaList: $("#fileMetaList"), detailPage: $("#detailPage"), detailHeading: $("#detailHeading"),
    detailMeta: $("#detailMeta"), detailSource: $("#detailSource"), detailAttachments: $("#detailAttachments"), nodeContextMenu: $("#nodeContextMenu"), contextMenuTitle: $("#contextMenuTitle")
  };

  const uid = (prefix = "id") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeColor = (value, fallback = "#7c8a95") => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  const branchById = (id) => project.branches.find(branch => branch.id === id);
  const eventById = (id) => project.events.find(event => event.id === id);
  const surfaceById = (id) => project.surfaces?.find(surface => surface.id === id);

  const pad2 = value => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  const isGregorianLeap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const gregorianMonthLengths = year => GREGORIAN_MONTHS.map((days, index) => index === 1 && isGregorianLeap(year) ? 29 : days);
  const daysBeforeGregorianYear = year => 365 * year + Math.floor((year + 3) / 4) - Math.floor((year + 99) / 100) + Math.floor((year + 399) / 400);

  function gregorianToScalar(parts) {
    const year = Math.trunc(Number(parts.year));
    const months = gregorianMonthLengths(year);
    const month = clamp(Math.trunc(Number(parts.month) || 1), 1, 12);
    const day = clamp(Math.trunc(Number(parts.day) || 1), 1, months[month - 1]);
    const seconds = clamp(Math.trunc(Number(parts.hour) || 0), 0, 23) * 3600 + clamp(Math.trunc(Number(parts.minute) || 0), 0, 59) * 60 + clamp(Number(parts.second) || 0, 0, 59.999999);
    return daysBeforeGregorianYear(year) + months.slice(0, month - 1).reduce((sum, value) => sum + value, 0) + day - 1 + seconds / SECONDS_PER_DAY;
  }

  function scalarToGregorian(scalar) {
    let year = Math.floor(Number(scalar) / 365.2425);
    while (daysBeforeGregorianYear(year + 1) <= scalar) year += 1;
    while (daysBeforeGregorianYear(year) > scalar) year -= 1;
    let dayValue = scalar - daysBeforeGregorianYear(year);
    let dayIndex = Math.floor(dayValue + 1e-10);
    let seconds = Math.round((dayValue - dayIndex) * SECONDS_PER_DAY);
    if (seconds >= SECONDS_PER_DAY) { dayIndex += 1; seconds = 0; }
    const months = gregorianMonthLengths(year);
    let month = 1;
    while (month <= months.length && dayIndex >= months[month - 1]) { dayIndex -= months[month - 1]; month += 1; }
    if (month > 12) return scalarToGregorian(daysBeforeGregorianYear(year + 1));
    return { year, month, day: dayIndex + 1, hour: Math.floor(seconds / 3600), minute: Math.floor(seconds % 3600 / 60), second: seconds % 60 };
  }

  function calendarById(id = project?.activeCalendarId) {
    return (project?.calendars || []).find(calendar => calendar.id === id) || BUILTIN_CALENDAR;
  }

  function calendarToScalar(parts, calendar = calendarById()) {
    if (calendar.type === "gregorian") return gregorianToScalar(parts);
    const months = calendar.months;
    const secondsPerDay = calendar.secondsPerDay || SECONDS_PER_DAY;
    const year = Math.trunc(Number(parts.year));
    const month = clamp(Math.trunc(Number(parts.month) || 1), 1, months.length);
    const day = clamp(Math.trunc(Number(parts.day) || 1), 1, months[month - 1]);
    const maxHour = Math.max(0, Math.floor((secondsPerDay - 1) / 3600));
    const clockSeconds = Math.min(secondsPerDay - 1e-6, clamp(Math.trunc(Number(parts.hour) || 0), 0, maxHour) * 3600 + clamp(Math.trunc(Number(parts.minute) || 0), 0, 59) * 60 + clamp(Number(parts.second) || 0, 0, 59.999999));
    const yearSeconds = months.reduce((sum, value) => sum + value, 0) * secondsPerDay;
    const elapsed = year * yearSeconds + (months.slice(0, month - 1).reduce((sum, value) => sum + value, 0) + day - 1) * secondsPerDay + clockSeconds;
    return Number(calendar.epochDay || 0) + elapsed / SECONDS_PER_DAY;
  }

  function scalarToCalendar(scalar, calendar = calendarById()) {
    if (calendar.type === "gregorian") return scalarToGregorian(scalar);
    const months = calendar.months;
    const secondsPerDay = calendar.secondsPerDay || SECONDS_PER_DAY;
    const yearSeconds = months.reduce((sum, value) => sum + value, 0) * secondsPerDay;
    const totalSeconds = (scalar - Number(calendar.epochDay || 0)) * SECONDS_PER_DAY;
    const year = Math.floor(totalSeconds / yearSeconds);
    let remaining = totalSeconds - year * yearSeconds;
    let dayIndex = Math.floor(remaining / secondsPerDay + 1e-10);
    let clockSeconds = Math.round(remaining - dayIndex * secondsPerDay);
    if (clockSeconds >= secondsPerDay) { dayIndex += 1; clockSeconds = 0; }
    let month = 1;
    while (month <= months.length && dayIndex >= months[month - 1]) { dayIndex -= months[month - 1]; month += 1; }
    const hours = Math.floor(clockSeconds / 3600);
    return { year, month: Math.min(month, months.length), day: dayIndex + 1, hour: hours, minute: Math.floor(clockSeconds % 3600 / 60), second: Math.floor(clockSeconds % 60) };
  }

  function legacyYearToScalar(value) {
    const coordinate = Number(value) || 0;
    const year = Math.floor(coordinate);
    return daysBeforeGregorianYear(year) + (coordinate - year) * (isGregorianLeap(year) ? 366 : 365);
  }

  function scalarToCoordinate(scalar) {
    const parts = scalarToGregorian(scalar);
    return parts.year + (scalar - daysBeforeGregorianYear(parts.year)) / (isGregorianLeap(parts.year) ? 366 : 365);
  }

  const coordinateToScalar = legacyYearToScalar;
  const eventStartScalar = event => Number.isFinite(Number(event.startTime)) ? Number(event.startTime) : legacyYearToScalar(event.startYear);
  const eventEndScalar = event => Number.isFinite(Number(event.endTime)) ? Number(event.endTime) : event.endYear == null ? undefined : legacyYearToScalar(event.endYear);
  const eventStartCoordinate = event => scalarToCoordinate(eventStartScalar(event));
  const eventEndCoordinate = event => eventEndScalar(event) == null ? undefined : scalarToCoordinate(eventEndScalar(event));
  const CONTINUITY_EPSILON = .5 / SECONDS_PER_DAY;
  const GRANULARITY_RANK = { year: 0, month: 1, day: 2, exact: 3 };

  function continuityRelation(previous, next) {
    const end = eventEndScalar(previous);
    const start = eventStartScalar(next);
    if (end == null || end > start + CONTINUITY_EPSILON) return null;
    if (Math.abs(end - start) <= CONTINUITY_EPSILON) return "exact";
    const a = scalarToCalendar(end);
    const b = scalarToCalendar(start);
    if (a.year !== b.year) return null;
    if (a.month !== b.month) return "year";
    if (a.day !== b.day) return "month";
    return "day";
  }

  function relationMatchesGranularity(relation, granularity = view?.granularity || "year") {
    return relation != null && GRANULARITY_RANK[relation] >= GRANULARITY_RANK[granularity];
  }

  function continuityRelationLabel(relation, granularity = view?.granularity || "year") {
    if (relation === "exact") return "精确相接";
    if (relationMatchesGranularity(relation, granularity)) return `${relation === "day" ? "日" : relation === "month" ? "月" : "年"}连续`;
    return `${relation === "month" ? "月" : "年"}级同行`;
  }

  function eligibleContinuityPredecessors(event, events = project.events) {
    if (!event) return [];
    const start = eventStartScalar(event);
    return events.filter(candidate => {
      if (candidate.id === event.id || candidate.branchId !== event.branchId || candidate.continuityMode === "separate") return false;
      const end = eventEndScalar(candidate);
      return end != null && eventStartScalar(candidate) < start - CONTINUITY_EPSILON && continuityRelation(candidate, event) != null;
    }).sort((a, b) => eventEndScalar(b) - eventEndScalar(a) || eventStartScalar(b) - eventStartScalar(a) || String(a.id).localeCompare(String(b.id)));
  }

  function buildContinuityLinks(events) {
    const predecessorBySuccessor = new Map();
    const successorByPredecessor = new Map();
    const relationBySuccessor = new Map();
    const claimedPredecessors = new Set();
    const ordered = events.slice().sort((a, b) => eventStartScalar(a) - eventStartScalar(b) || String(a.id).localeCompare(String(b.id)));
    for (const event of ordered) {
      if (event.continuityMode === "separate") continue;
      const predecessor = eligibleContinuityPredecessors(event, events).find(candidate => !claimedPredecessors.has(candidate.id));
      if (!predecessor) continue;
      predecessorBySuccessor.set(event.id, predecessor);
      successorByPredecessor.set(predecessor.id, event);
      relationBySuccessor.set(event.id, continuityRelation(predecessor, event));
      claimedPredecessors.add(predecessor.id);
    }
    return { predecessorBySuccessor, successorByPredecessor, relationBySuccessor };
  }

  function parseCalendarInput(value, calendar = calendarById()) {
    const match = String(value).trim().match(/^(-?\d+)(?:[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?)?(?:[T\s]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}(?:\.\d+)?))?)?$/);
    if (!match) return null;
    const parts = { year: Number(match[1]), month: Number(match[2] || 1), day: Number(match[3] || 1), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0) };
    if (calendar.type === "gregorian") {
      const months = gregorianMonthLengths(parts.year);
      if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > months[parts.month - 1]) return null;
    } else if (parts.month < 1 || parts.month > calendar.months.length || parts.day < 1 || parts.day > calendar.months[parts.month - 1]) return null;
    const maxHour = calendar.type === "gregorian" ? 23 : Math.max(0, Math.floor(((calendar.secondsPerDay || SECONDS_PER_DAY) - 1) / 3600));
    if (parts.hour < 0 || parts.hour > maxHour || parts.minute < 0 || parts.minute > 59 || parts.second < 0 || parts.second >= 60) return null;
    return calendarToScalar(parts, calendar);
  }

  function formatCalendarInput(scalar, calendar = calendarById()) {
    const parts = scalarToCalendar(scalar, calendar);
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }

  function formatScalar(scalar, interval = 1, calendar = calendarById()) {
    const parts = scalarToCalendar(scalar, calendar);
    const year = parts.year < 0 ? `前${Math.abs(parts.year)}` : `${parts.year}`;
    const prefix = calendar.type === "gregorian" ? (parts.year < 0 ? "公元" : "公元 ") : `${calendar.name} `;
    if (interval >= .75) return `${prefix}${year}`;
    const date = `${prefix}${year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    if (interval >= 1 / 800) return date;
    if (interval >= 1 / 400000) return `${date} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
    return `${date} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }

  function formatEventScalar(scalar) {
    const parts = scalarToCalendar(scalar);
    const interval = parts.month === 1 && parts.day === 1 && parts.hour === 0 && parts.minute === 0 && parts.second === 0 ? 1 : parts.hour === 0 && parts.minute === 0 && parts.second === 0 ? .01 : 0;
    return formatScalar(scalar, interval);
  }

  const formatYear = year => formatScalar(legacyYearToScalar(year), 1);
  const formatSpan = event => eventEndScalar(event) != null ? `${formatEventScalar(eventStartScalar(event))} — ${formatEventScalar(eventEndScalar(event))}` : formatEventScalar(eventStartScalar(event));

  function sampleProject() {
    const reality = "branch-reality";
    const alternate = "branch-alternate";
    return {
      version: 3,
      title: "示例项目 · 双线时间轴",
      updatedAt: new Date().toISOString(),
      activeCalendarId: "gregorian",
      timeGranularity: "year",
      calendars: [BUILTIN_CALENDAR],
      surfaces: [{ id: "surface-main", name: "主叙事面", color: "#7a6ee6", parentId: null, collapsed: false, rowHeight: 94, description: "默认叙事空间" }],
      branches: [
        { id: reality, surfaceId: "surface-main", name: "现实史线", color: "#59cbd2", parentId: null, forkYear: 1206, description: "可考的历史基准线" },
        { id: alternate, surfaceId: "surface-main", name: "架空世界线", color: "#d6a85e", parentId: reality, forkYear: 1368, description: "自 1368 年分出的虚构分支，用来演示分歧年份" }
      ],
      events: [
        { id: uid("evt"), branchId: reality, startYear: 1206, endYear: 1368, type: "era", title: "元朝", description: "基准线上的一段时代。时代类节点用延伸光带表示持续范围。", source: "" },
        { id: uid("evt"), branchId: reality, startYear: 1328, type: "person", title: "朱元璋出生", description: "人物类节点，适合记录生卒与经历。", source: "" },
        { id: uid("evt"), branchId: reality, startYear: 1368, type: "event", title: "明朝建立", description: "这条轨线的分歧点：架空线从同一年开始偏离现实。", source: "" },
        { id: uid("evt"), branchId: reality, startYear: 1472, type: "person", title: "王守仁出生", description: "同一轨线上前后相接的节点会自动接续显示，不必手动对齐。", source: "" },
        { id: uid("evt"), branchId: reality, startYear: 1529, type: "person", title: "王守仁逝世", description: "横向拖动节点改变年份，纵向拖动换到其他轨线。", source: "" },
        { id: uid("evt"), branchId: alternate, startYear: 1368, endYear: 1600, type: "era", title: "架空王朝", description: "替代现实的虚构王朝，演示另一条轨线上的区间节点。", source: "" },
        { id: uid("evt"), branchId: alternate, startYear: 1490, type: "lore", title: "新的历史走向", description: "设定类节点适合记录世界观规则。双击轨道空白处即可插入新节点。", source: "" }
      ]
    };
  }

  function normalizeProject(value) {
    const next = value && typeof value === "object" ? value : sampleProject();
    next.version = 3;
    const customCalendars = Array.isArray(next.calendars) ? next.calendars.filter(calendar => calendar?.id !== "gregorian" && Array.isArray(calendar?.months) && calendar.months.length && calendar.months.every(days => Number.isInteger(Number(days)) && Number(days) > 0)).map(calendar => ({
      ...calendar, id: String(calendar.id || uid("calendar")), name: String(calendar.name || "自定义历法"), type: "custom", months: calendar.months.map(Number), secondsPerDay: clamp(Number(calendar.secondsPerDay) || SECONDS_PER_DAY, 3600, 864000), epochDay: Number(calendar.epochDay) || 0
    })) : [];
    next.calendars = [BUILTIN_CALENDAR, ...customCalendars];
    next.activeCalendarId = next.calendars.some(calendar => calendar.id === next.activeCalendarId) ? next.activeCalendarId : "gregorian";
    next.timeGranularity = ["year", "month", "day"].includes(next.timeGranularity) ? next.timeGranularity : "year";
    const sourceOrder = Array.isArray(next.materialSourceOrder) ? next.materialSourceOrder.filter(key => materialSources[key]) : [];
    next.materialSourceOrder = [...new Set([...sourceOrder, ...defaultMaterialSourceOrder])];
    next.materialSourceEnabled = next.materialSourceEnabled && typeof next.materialSourceEnabled === "object" ? next.materialSourceEnabled : {};
    const defaultSurfaceId = "surface-main";
    next.surfaces = Array.isArray(next.surfaces) && next.surfaces.length ? next.surfaces.map(surface => ({ ...surface, id: String(surface.id), name: String(surface.name || "未命名面线"), color: safeColor(surface.color, "#7a6ee6"), parentId: surface.parentId || null, collapsed: Boolean(surface.collapsed), rowHeight: Number.isFinite(Number(surface.rowHeight)) ? clamp(Number(surface.rowHeight), 82, 240) : undefined })) : [{ id: defaultSurfaceId, name: "主叙事面", color: "#7a6ee6", parentId: null, collapsed: false, rowHeight: 94, description: "从旧项目自动迁移" }];
    const surfaceIds = new Set(next.surfaces.map(surface => surface.id));
    const fallbackSurfaceId = next.surfaces[0].id;
    next.branches = Array.isArray(next.branches) ? next.branches.map(branch => ({ ...branch, surfaceId: surfaceIds.has(branch.surfaceId) ? branch.surfaceId : fallbackSurfaceId, color: safeColor(branch.color, "#7c8a95"), collapsed: Boolean(branch.collapsed), trackOrder: Array.isArray(branch.trackOrder) ? branch.trackOrder.map(String) : [] })) : [];
    next.events = Array.isArray(next.events) ? next.events.map(event => ({
      ...event,
      startYear: Number.isFinite(Number(event.startYear)) ? Number(event.startYear) : 0,
      endYear: event.endYear == null || event.endYear === "" ? undefined : Number(event.endYear),
      startTime: Number.isFinite(Number(event.startTime)) ? Number(event.startTime) : legacyYearToScalar(event.startYear),
      endTime: Number.isFinite(Number(event.endTime)) ? Number(event.endTime) : event.endYear == null || event.endYear === "" ? undefined : legacyYearToScalar(event.endYear),
      color: event.color ? safeColor(event.color) : undefined,
      symbol: symbolChoices.has(event.symbol) ? event.symbol : undefined,
      attachments: Array.isArray(event.attachments) ? event.attachments : [],
      origin: ["manual", "material", "file"].includes(event.origin) ? event.origin : event.materialSource ? "material" : Array.isArray(event.attachments) && event.attachments.length ? "file" : "manual",
      continuityMode: event.continuityMode === "separate" ? "separate" : "auto"
    })) : [];
    return next;
  }

  function loadProject() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.branches) && Array.isArray(saved.events)) return normalizeProject(saved);
    } catch (_) { /* invalid local state falls back to the sample */ }
    return normalizeProject(sampleProject());
  }

  let project = loadProject();
  const view = { centerYear: 1390, scale: 2.25, activeBranchId: project.branches[0]?.id, selectedEventId: null, searchQuery: "", granularity: project.timeGranularity || "year" };
  const history = { past: [], future: [] };
  let parseBuffer = { branches: [], events: [] };
  let materialBuffer = [];
  let saveTimer;
  let toastTimer;
  let branchEditingId = null;
  let surfaceEditingId = null;
  let suppressCardClickUntil = 0;
  let materialSearchTimer = null;
  let materialSearchController = null;
  let materialSearchSequence = 0;
  let materialSourceDragKey = null;
  let eventAutoSaveTimer = null;

  function setTheme(theme, announce = false) {
    const nextTheme = themes[theme] ? theme : "paper";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themes[nextTheme].color);
    dom.themeMenu.querySelectorAll("[data-theme]").forEach(option => {
      const active = option.dataset.theme === nextTheme;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", String(active));
    });
    if (announce) showToast(`已切换为「${themes[nextTheme].name}」`);
  }

  function snapshot() {
    history.past.push(clone(project));
    if (history.past.length > 40) history.past.shift();
    history.future.length = 0;
    syncUndoButtons();
  }

  function commit(message = "已保存") {
    clearTimeout(saveTimer);
    dom.saveStatus.textContent = "正在保存……";
    saveTimer = setTimeout(() => {
      project.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        dom.saveStatus.textContent = "保存在此浏览器";
      } catch (error) {
        dom.saveStatus.textContent = "保存空间不足，请导出备份";
        showToast("本地空间不足：请移除大附件或先导出项目");
      }
    }, 220);
    render();
    if (message) showToast(message);
  }

  function undo() {
    if (eventAutoSaveTimer) flushEventAutoSave("");
    if (!history.past.length) return;
    const selectedId = view.selectedEventId;
    history.future.push(clone(project));
    project = history.past.pop();
    view.selectedEventId = project.events.some(event => event.id === selectedId) ? selectedId : null;
    commit("");
    syncInspector();
    syncUndoButtons();
  }

  function redo() {
    if (eventAutoSaveTimer) flushEventAutoSave("");
    if (!history.future.length) return;
    const selectedId = view.selectedEventId;
    history.past.push(clone(project));
    project = history.future.pop();
    view.selectedEventId = project.events.some(event => event.id === selectedId) ? selectedId : null;
    commit("");
    syncInspector();
    syncUndoButtons();
  }

  function syncUndoButtons() {
    $("#undoBtn").disabled = !history.past.length;
    $("#redoBtn").disabled = !history.future.length;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 1900);
  }

  function niceInterval(targetYears) {
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(targetYears, .0001))));
    const value = targetYears / power;
    return (value <= 1 ? 1 : value <= 2 ? 2 : value <= 5 ? 5 : 10) * power;
  }

  function formatGranularityValue(scalar, granularity = view.granularity) {
    const parts = scalarToCalendar(scalar);
    const eraYear = parts.year < 0 ? `前${Math.abs(parts.year)}` : `${parts.year}`;
    const prefix = calendarById().type === "gregorian" ? "公元 " : `${calendarById().name} `;
    if (granularity === "year") return `${prefix}${eraYear}年`;
    if (granularity === "month") return `${prefix}${eraYear}年${pad2(parts.month)}月`;
    return `${prefix}${eraYear}年${pad2(parts.month)}月${pad2(parts.day)}日`;
  }

  function buildGranularTicks(startCoordinate, endCoordinate, granularity = view.granularity) {
    const calendar = calendarById();
    const startScalar = coordinateToScalar(startCoordinate);
    const endScalar = coordinateToScalar(endCoordinate);
    const ticks = [];
    if (granularity === "month") {
      const monthsPerYear = calendar.type === "gregorian" ? 12 : calendar.months.length;
      const start = scalarToCalendar(startScalar, calendar);
      const end = scalarToCalendar(endScalar, calendar);
      const startIndex = start.year * monthsPerYear + start.month - 1;
      const endIndex = end.year * monthsPerYear + end.month;
      const pxPerMonth = view.scale / monthsPerYear;
      const stride = Math.max(1, Math.ceil(66 / Math.max(pxPerMonth, .0001)), Math.ceil((endIndex - startIndex) / 260));
      let index = Math.floor(startIndex / stride) * stride;
      for (let guard = 0; index <= endIndex && guard < 300; index += stride, guard++) {
        const year = Math.floor(index / monthsPerYear);
        const month = ((index % monthsPerYear) + monthsPerYear) % monthsPerYear + 1;
        const scalar = calendarToScalar({ year, month, day: 1 }, calendar);
        ticks.push({ scalar, major: month === 1, label: `${year < 0 ? `前${Math.abs(year)}` : year}年${pad2(month)}月` });
      }
      return ticks;
    }
    const dayScalar = (calendar.secondsPerDay || SECONDS_PER_DAY) / SECONDS_PER_DAY;
    const pxPerDay = view.scale / 365.2425 * dayScalar;
    const totalDays = Math.max(1, (endScalar - startScalar) / dayScalar);
    const stride = Math.max(1, Math.ceil(58 / Math.max(pxPerDay, .0001)), Math.ceil(totalDays / 260));
    const start = scalarToCalendar(startScalar, calendar);
    let scalar = calendarToScalar({ year: start.year, month: start.month, day: start.day }, calendar);
    if (scalar < startScalar - CONTINUITY_EPSILON) scalar += stride * dayScalar;
    for (let guard = 0; scalar <= endScalar + stride * dayScalar && guard < 300; scalar += stride * dayScalar, guard++) {
      const parts = scalarToCalendar(scalar, calendar);
      ticks.push({ scalar, major: parts.day === 1, label: `${parts.month === 1 && parts.day === 1 ? `${parts.year}年` : ""}${pad2(parts.month)}月${pad2(parts.day)}日` });
    }
    return ticks;
  }

  function switchGranularity(granularity) {
    if (!["year", "month", "day"].includes(granularity)) return;
    view.granularity = granularity;
    project.timeGranularity = granularity;
    const recommendedScale = { year: 90, month: 960, day: 19000 }[granularity];
    view.scale = recommendedScale;
    commit("");
    showToast(`已切换为${granularity === "year" ? "年" : granularity === "month" ? "月" : "日"}粒度；连续链保持稳定同行`);
  }

  const MIN_SCALE = .00002;
  const MAX_SCALE = 1e9;
  function sliderToScale(value) { return MIN_SCALE * Math.pow(MAX_SCALE / MIN_SCALE, Number(value) / 100); }
  function scaleToSlider(scale) { return Math.log(scale / MIN_SCALE) / Math.log(MAX_SCALE / MIN_SCALE) * 100; }
  function formatZoomScale(scale) {
    const pixelsPerSecond = scale / (365.2425 * SECONDS_PER_DAY);
    if (pixelsPerSecond >= .2) return `${pixelsPerSecond.toFixed(1)}px/秒`;
    if (scale >= 365.2425 * 24) return `${(scale / 365.2425 / 24).toFixed(1)}px/时`;
    if (scale >= 365.2425) return `${(scale / 365.2425).toFixed(1)}px/日`;
    return `${Math.round(scale / 2.25 * 100)}%`;
  }
  function screenXForYear(year, width = dom.viewport.clientWidth) { return width / 2 + (year - view.centerYear) * view.scale; }
  function yearForScreenX(x, width = dom.viewport.clientWidth) { return view.centerYear + (x - width / 2) / view.scale; }

  function eventMatches(event, query = view.searchQuery) {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    if (!needle) return true;
    const branch = branchById(event.branchId);
    return [event.title, event.description, event.source, formatSpan(event), branch?.name, typeNames[event.type]]
      .filter(value => value != null).join(" ").toLocaleLowerCase("zh-CN").includes(needle);
  }

  function matchingEvents() { return project.events.filter(event => eventMatches(event)); }

  function surfaceOrAncestorCollapsed(surfaceId) {
    const visited = new Set();
    let surface = surfaceById(surfaceId);
    while (surface && !visited.has(surface.id)) {
      if (surface.collapsed) return true;
      visited.add(surface.id);
      surface = surfaceById(surface.parentId);
    }
    return false;
  }

  function surfaceDepth(surfaceId) {
    let depth = 0;
    const visited = new Set();
    let surface = surfaceById(surfaceId);
    while (surface?.parentId && !visited.has(surface.id)) { visited.add(surface.id); surface = surfaceById(surface.parentId); depth += 1; }
    return depth;
  }

  function effectiveSurfaceRowHeight(surfaceId) {
    const visited = new Set();
    let surface = surfaceById(surfaceId);
    while (surface && !visited.has(surface.id)) {
      if (Number.isFinite(Number(surface.rowHeight))) return clamp(Number(surface.rowHeight), 82, 240);
      visited.add(surface.id); surface = surfaceById(surface.parentId);
    }
    return 94;
  }

  function orderedVisibleBranches() {
    const ordered = [];
    const visited = new Set();
    const visit = surface => {
      if (!surface || visited.has(surface.id)) return;
      visited.add(surface.id);
      if (!surfaceOrAncestorCollapsed(surface.id)) ordered.push(...project.branches.filter(branch => branch.surfaceId === surface.id));
      project.surfaces.filter(child => child.parentId === surface.id).forEach(visit);
    };
    project.surfaces.filter(surface => !surface.parentId || !surfaceById(surface.parentId)).forEach(visit);
    project.surfaces.filter(surface => !visited.has(surface.id)).forEach(visit);
    return ordered;
  }

  function surfaceIsWithin(surfaceId, ancestorId) {
    const visited = new Set();
    let surface = surfaceById(surfaceId);
    while (surface && !visited.has(surface.id)) {
      if (surface.id === ancestorId) return true;
      visited.add(surface.id); surface = surfaceById(surface.parentId);
    }
    return false;
  }

  function buildBranchLayouts(width) {
    const visibleMargin = 280;
    let top = 48;
    const layouts = [];
    for (const branch of orderedVisibleBranches()) {
      const slotSpacing = effectiveSurfaceRowHeight(branch.surfaceId);
      if (branch.collapsed) {
        layouts.push({ branch, top, height: 72, guideY: top + 28, slotSpacing, items: [] });
        top += 72;
        continue;
      }
      const branchEvents = project.events.filter(event => event.branchId === branch.id);
      const continuityLinks = buildContinuityLinks(branchEvents);
      const rootForEvent = event => {
        let current = event;
        const visited = new Set();
        while (continuityLinks.predecessorBySuccessor.has(current.id) && !visited.has(current.id)) {
          visited.add(current.id);
          current = continuityLinks.predecessorBySuccessor.get(current.id);
        }
        return current.id;
      };
      const groupMap = new Map();
      branchEvents.forEach(event => {
        const key = rootForEvent(event);
        if (!groupMap.has(key)) groupMap.set(key, { key, events: [] });
        groupMap.get(key).events.push(event);
      });
      const defaultGroups = [...groupMap.values()].map(group => {
        group.events.sort((a, b) => eventStartScalar(a) - eventStartScalar(b) || String(a.id).localeCompare(String(b.id)));
        group.start = Math.min(...group.events.map(eventStartScalar));
        group.end = Math.max(...group.events.map(event => eventEndScalar(event) ?? eventStartScalar(event)));
        group.duration = Math.max(0, group.end - group.start);
        group.continuous = group.events.length > 1;
        return group;
      }).sort((a, b) => Number(b.continuous) - Number(a.continuous) || b.duration - a.duration || a.start - b.start || a.key.localeCompare(b.key));
      const savedOrder = Array.isArray(branch.trackOrder) ? branch.trackOrder : [];
      const savedIndex = new Map(savedOrder.map((key, index) => [key, index]));
      const groups = savedOrder.length ? defaultGroups.slice().sort((a, b) => {
        const ai = savedIndex.has(a.key) ? savedIndex.get(a.key) : Number.MAX_SAFE_INTEGER;
        const bi = savedIndex.has(b.key) ? savedIndex.get(b.key) : Number.MAX_SAFE_INTEGER;
        return ai - bi || defaultGroups.indexOf(a) - defaultGroups.indexOf(b);
      }) : defaultGroups;
      const slotByGroup = new Map(groups.map((group, index) => [group.key, index]));
      const allItems = branchEvents.map(event => {
        const x = screenXForYear(eventStartCoordinate(event), width);
        const endCoordinate = eventEndCoordinate(event);
        return { event, x, endX: endCoordinate == null ? x : screenXForYear(endCoordinate, width), groupKey: rootForEvent(event), slot: slotByGroup.get(rootForEvent(event)) ?? 0 };
      }).sort((a, b) => a.slot - b.slot || a.x - b.x || String(a.event.id).localeCompare(String(b.event.id)));
      const itemById = new Map(allItems.map(item => [item.event.id, item]));
      for (const item of allItems) {
        const predecessor = continuityLinks.predecessorBySuccessor.get(item.event.id);
        const successor = continuityLinks.successorByPredecessor.get(item.event.id);
        if (predecessor) {
          item.continuityFromId = predecessor.id;
          item.continuityRelation = continuityLinks.relationBySuccessor.get(item.event.id);
          item.continuityDirect = relationMatchesGranularity(item.continuityRelation);
        }
        if (successor) {
          item.continuityToId = successor.id;
          item.continuityToRelation = continuityLinks.relationBySuccessor.get(successor.id);
          item.continuityToDirect = relationMatchesGranularity(item.continuityToRelation);
        }
      }
      for (const item of allItems) {
        const endCoordinate = eventEndCoordinate(item.event);
        const rangeWidth = endCoordinate != null ? Math.max(0, item.endX - item.x) : 0;
        const displayStart = Math.max(item.x, 0);
        const displayEnd = Math.min(item.endX, width);
        const successorItem = item.continuityToId ? itemById.get(item.continuityToId) : null;
        const spanToSuccessor = successorItem ? Math.max(0, successorItem.x - item.x) : rangeWidth;
        item.cardWidth = item.continuityToId ? clamp(spanToSuccessor - 10, 18, 220) : 220;
        item.rangeWidth = rangeWidth;
        item.rangeLeft = Math.max(0, displayStart - item.x);
        item.displayRangeWidth = Math.max(0, displayEnd - displayStart);
        item.rangeHandleVisible = endCoordinate != null && item.endX >= 0 && item.endX <= width;
        item.rangeContinuesLeft = endCoordinate != null && item.x < 0;
        item.rangeContinuesRight = endCoordinate != null && item.endX > width;
      }
      const candidates = allItems.filter(item => Math.max(item.x, item.endX, item.x + item.cardWidth) > -visibleMargin && Math.min(item.x, item.endX) < width + visibleMargin);
      const slots = Math.max(1, groups.length);
      const height = Math.max(125, 70 + slots * slotSpacing);
      layouts.push({ branch, top, height, guideY: top + 28, slotSpacing, items: candidates, groups, groupOrder: groups.map(group => group.key) });
      top += height;
    }
    return { layouts, totalHeight: Math.max(top + 30, dom.viewport.clientHeight) };
  }

  function render() {
    dom.projectTitle.value = project.title;
    renderBranchList();
    renderTimeline();
    renderMinimap();
    renderEventLibrary();
    renderCalendarList();
    renderMaterialSourceControls();
    syncSelects();
  }

  function renderCalendarList() {
    const active = calendarById();
    dom.calendarBtn.textContent = active.name;
    dom.calendarInputHint.textContent = `当前使用「${active.name}」；格式：年-月-日 时:分:秒`;
    dom.calendarList.innerHTML = project.calendars.map(calendar => `<div class="calendar-item ${calendar.id === project.activeCalendarId ? "active" : ""}" data-calendar-id="${esc(calendar.id)}">
      <div><strong>${esc(calendar.name)}</strong><small>${calendar.type === "gregorian" ? "内置公历 · 支持闰年" : `${calendar.months.length} 个月 · ${calendar.months.reduce((sum, value) => sum + value, 0)} 日/年`}</small></div>
      <button class="button" type="button" data-calendar-action="switch" ${calendar.id === project.activeCalendarId ? "disabled" : ""}>${calendar.id === project.activeCalendarId ? "使用中" : "切换"}</button>
      ${calendar.type === "gregorian" ? "" : '<button class="icon-button" type="button" data-calendar-action="delete" title="删除历法">×</button>'}
    </div>`).join("");
  }

  function switchCalendar(calendarId) {
    if (!project.calendars.some(calendar => calendar.id === calendarId) || project.activeCalendarId === calendarId) return;
    snapshot();
    project.activeCalendarId = calendarId;
    commit(`已切换为「${calendarById(calendarId).name}」`);
    syncInspector();
  }

  function importCalendarDefinition() {
    try {
      const definition = JSON.parse(dom.calendarJson.value);
      if (!definition || !Array.isArray(definition.months) || !definition.months.length || !definition.months.every(value => Number.isInteger(Number(value)) && Number(value) > 0)) throw new Error("months 必须是正整数数组");
      const calendar = {
        id: uid("calendar"), name: String(definition.name || "自定义历法"), type: "custom", months: definition.months.map(Number),
        secondsPerDay: clamp(Number(definition.secondsPerDay) || SECONDS_PER_DAY, 3600, 864000), epochDay: Number(definition.epochDay) || 0
      };
      snapshot();
      project.calendars.push(calendar);
      project.activeCalendarId = calendar.id;
      dom.calendarJson.value = "";
      commit(`已导入并切换为「${calendar.name}」`);
      syncInspector();
    } catch (error) { showToast(`历法导入失败：${error.message}`); }
  }

  function renderBranchList() {
    const renderBranch = branch => {
      const count = project.events.filter(event => event.branchId === branch.id).length;
      return `<div class="branch-item ${view.activeBranchId === branch.id ? "active" : ""} ${branch.collapsed ? "collapsed" : ""}" data-branch-id="${branch.id}" draggable="true" style="--branch-color:${safeColor(branch.color)}">
        <span class="branch-grip" title="拖动排序">⠿</span><span class="branch-symbol"></span><span class="branch-copy"><strong>${esc(branch.name)}</strong><small>${esc(branch.description || `${formatYear(branch.forkYear)} 分歧`)}</small></span><span class="branch-count">${count}</span>
        <button class="branch-action" type="button" data-branch-action="collapse" title="${branch.collapsed ? "展开" : "折叠"}">${branch.collapsed ? "＋" : "－"}</button><button class="branch-action" type="button" data-branch-action="edit" title="编辑轨线">⋯</button>
      </div>`;
    };
    const visited = new Set();
    const renderSurface = (surface, depth = 0) => {
      if (visited.has(surface.id)) return "";
      visited.add(surface.id);
      const directBranches = project.branches.filter(branch => branch.surfaceId === surface.id);
      const childSurfaces = project.surfaces.filter(child => child.parentId === surface.id);
      const childHtml = childSurfaces.map(child => renderSurface(child, depth + 1)).join("");
      const totalCards = project.events.filter(event => directBranches.some(branch => branch.id === event.branchId)).length;
      return `<section class="surface-group ${surface.collapsed ? "collapsed" : ""}" style="--surface-color:${safeColor(surface.color)};--surface-depth:${depth}">
        <div class="surface-item" data-surface-id="${surface.id}" draggable="true">
          <span class="surface-chevron">${surface.collapsed ? "▸" : "▾"}</span><span class="surface-copy"><strong>${esc(surface.name)}</strong><small>${directBranches.length} 轨 · ${totalCards} 卡 · ${Math.round(effectiveSurfaceRowHeight(surface.id))} 高</small></span>
          <button class="branch-action" type="button" data-surface-action="collapse" title="${surface.collapsed ? "展开面线" : "折叠面线"}">${surface.collapsed ? "＋" : "－"}</button><button class="branch-action" type="button" data-surface-action="edit" title="编辑面线">⋯</button>
        </div>
        ${surface.collapsed ? "" : `<div class="surface-children">${directBranches.map(renderBranch).join("")}${childHtml}</div>`}
      </section>`;
    };
    const roots = project.surfaces.filter(surface => !surface.parentId || !surfaceById(surface.parentId));
    let html = roots.map(surface => renderSurface(surface)).join("");
    html += project.surfaces.filter(surface => !visited.has(surface.id)).map(surface => renderSurface(surface)).join("");
    dom.branchList.innerHTML = html;
  }

  function materialSourceKey(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("wikidata")) return "wikidata";
    if (normalized.includes("open library")) return "openlibrary";
    if (normalized.includes("维基") || normalized.includes("wikipedia")) return "wikipedia";
    return "";
  }

  function eventOrigin(event) {
    return ["manual", "material", "file"].includes(event?.origin) ? event.origin : event?.materialSource ? "material" : event?.attachments?.length ? "file" : "manual";
  }

  function eventOriginLabel(event) {
    const origin = eventOrigin(event);
    if (origin === "material") return `素材 · ${event.materialSource || "外部来源"}`;
    if (origin === "file") return "文件";
    return typeNames[event.type] || originNames.manual;
  }

  function renderEventLibrary() {
    const events = matchingEvents().slice().sort((a, b) => eventStartScalar(a) - eventStartScalar(b) || a.title.localeCompare(b.title, "zh-CN"));
    const continuityLinks = buildContinuityLinks(project.events);
    dom.libraryCount.textContent = `${events.length}/${project.events.length}`;
    dom.searchCount.hidden = !view.searchQuery;
    dom.searchCount.textContent = view.searchQuery ? `${events.length} 项` : "";
    dom.eventLibrary.innerHTML = events.length ? events.map(event => {
      const branch = branchById(event.branchId);
      const color = safeColor(event.color, safeColor(branch?.color));
      const origin = eventOrigin(event);
      const predecessor = continuityLinks.predecessorBySuccessor.get(event.id);
      const relation = continuityLinks.relationBySuccessor.get(event.id);
      return `<article class="library-card origin-${origin} ${view.selectedEventId === event.id ? "selected" : ""}" data-library-event-id="${event.id}" draggable="true" style="--event-color:${color}">
        <span class="library-symbol">${esc(event.symbol || typeIcons[event.type] || "◆")}</span><div><strong>${esc(event.title)}</strong><small><em>${esc(eventOriginLabel(event))}</em>${predecessor ? ` · <i title="接续 ${esc(predecessor.title)}">${esc(continuityRelationLabel(relation))}</i>` : ""} · ${esc(formatSpan(event))} · ${esc(branch?.name || "未分组")}</small></div>${event.attachments?.length ? `<b title="${event.attachments.length} 个附件">📎</b>` : ""}
      </article>`;
    }).join("") : `<p class="library-empty">${view.searchQuery ? "没有匹配的事件" : "双击时间轴创建第一张卡片"}</p>`;
  }

  function renderTimeline() {
    const width = dom.viewport.clientWidth || 800;
    const { layouts, totalHeight } = buildBranchLayouts(width);
    dom.svg.setAttribute("width", width);
    dom.svg.setAttribute("height", totalHeight);
    dom.svg.style.height = `${totalHeight}px`;
    dom.eventLayer.style.height = `${totalHeight}px`;
    dom.branchLabelLayer.style.height = `${totalHeight}px`;
    const startYear = yearForScreenX(0, width);
    const endYear = yearForScreenX(width, width);
    dom.zoomReadout.textContent = formatZoomScale(view.scale);
    dom.zoomSlider.value = clamp(scaleToSlider(view.scale), 0, 100);
    dom.granularityControl.querySelectorAll("[data-granularity]").forEach(button => {
      const active = button.dataset.granularity === view.granularity;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const major = niceInterval(110 / view.scale);
    dom.rangeReadout.textContent = `${formatGranularityValue(coordinateToScalar(startYear))} — ${formatGranularityValue(coordinateToScalar(endYear))}`;
    const svg = [];
    if (view.granularity === "year") {
      const minor = major / 5;
      const first = Math.floor(startYear / minor) * minor;
      for (let year = first, guard = 0; year <= endYear + minor && guard < 1000; year += minor, guard++) {
        const x = screenXForYear(year, width);
        const isMajor = Math.abs(year / major - Math.round(year / major)) < .0001;
        svg.push(`<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${totalHeight}" class="axis-line ${isMajor ? "major" : ""}"/>`);
        if (isMajor) svg.push(`<text x="${(x + 5).toFixed(2)}" y="17" class="axis-label">${esc(formatScalar(coordinateToScalar(year), major))}</text>`);
      }
    } else {
      for (const tick of buildGranularTicks(startYear, endYear)) {
        const x = screenXForYear(scalarToCoordinate(tick.scalar), width);
        svg.push(`<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${totalHeight}" class="axis-line ${tick.major ? "major" : ""}"/>`);
        svg.push(`<text x="${(x + 5).toFixed(2)}" y="17" class="axis-label">${esc(tick.label)}</text>`);
      }
    }
    if (startYear < 0 && endYear > 0) {
      const zeroX = screenXForYear(0, width);
      svg.push(`<line x1="${zeroX}" y1="0" x2="${zeroX}" y2="${totalHeight}" class="axis-zero"/>`);
    }

    const labels = [];
    const cards = [];
    const layoutMap = new Map(layouts.map(layout => [layout.branch.id, layout]));
    const bands = [];
    project.surfaces.forEach(surface => {
      const members = layouts.filter(layout => surfaceIsWithin(layout.branch.surfaceId, surface.id));
      if (!members.length) return;
      const top = Math.min(...members.map(layout => layout.top));
      const bottom = Math.max(...members.map(layout => layout.top + layout.height));
      bands.push(`<rect x="0" y="${top}" width="${width}" height="${bottom - top}" class="surface-band" fill="${safeColor(surface.color)}" opacity="${surfaceDepth(surface.id) ? ".018" : ".028"}"/>`);
      bands.push(`<line x1="0" y1="${top}" x2="${width}" y2="${top}" class="surface-boundary" stroke="${safeColor(surface.color)}"/><line x1="0" y1="${bottom}" x2="${width}" y2="${bottom}" class="surface-boundary" stroke="${safeColor(surface.color)}"/>`);
      labels.push(`<div class="surface-stage-label" data-stage-surface-id="${surface.id}" style="top:${top + 7}px;--surface-color:${safeColor(surface.color)};--surface-depth:${surfaceDepth(surface.id)}"><b>面</b>${esc(surface.name)}<button class="surface-height-grip" type="button" title="上下拖动调整面线显示高度" aria-label="调整面线显示高度">↕</button></div>`);
    });
    svg.unshift(...bands);
    for (const layout of layouts) {
      const color = safeColor(layout.branch.color);
      svg.push(`<line x1="0" y1="${layout.guideY}" x2="${width}" y2="${layout.guideY}" class="branch-guide" stroke="${color}"/>`);
      labels.push(`<button class="branch-stage-label ${layout.branch.collapsed ? "collapsed" : ""}" data-stage-branch-id="${layout.branch.id}" style="top:${layout.top + 8}px;--c:${color}" title="点击${layout.branch.collapsed ? "展开" : "折叠"}"><b>轨</b>${esc(layout.branch.name)} <span>${layout.branch.collapsed ? "＋" : "−"}</span></button>`);
      if (layout.branch.parentId) {
        const parent = layoutMap.get(layout.branch.parentId);
        const forkX = screenXForYear(layout.branch.forkYear, width);
        if (parent && forkX > -30 && forkX < width + 30) {
          svg.push(`<path d="M ${forkX} ${parent.guideY} C ${forkX + 20} ${parent.guideY}, ${forkX - 20} ${layout.guideY}, ${forkX} ${layout.guideY}" class="fork-line" stroke="${color}"/>`);
        }
      }
      for (const item of layout.items) {
        const event = item.event;
        const y = layout.top + 58 + item.slot * layout.slotSpacing;
        const left = item.x;
        const isSelected = view.selectedEventId === event.id;
        const isMatch = eventMatches(event);
        const eventColor = safeColor(event.color, color);
        svg.push(`<line x1="${item.x}" y1="${layout.guideY}" x2="${item.x}" y2="${y - 8}" stroke="${color}" opacity=".28" stroke-width="1"/>`);
        const rangeStyle = eventEndScalar(event) != null ? `--range-left:${item.rangeLeft}px;--range-width:${item.displayRangeWidth}px;--range-handle-left:${item.rangeWidth}px` : "";
        const rangeClasses = `${item.rangeContinuesLeft ? "range-continues-left" : ""} ${item.rangeContinuesRight ? "range-continues-right" : ""}`;
        const continuityClasses = `${item.continuityFromId ? (item.continuityDirect ? "continuity-from continuity-direct" : "continuity-parent") : ""} ${item.continuityToId ? "continuity-to" : ""} ${item.cardWidth < 126 ? "continuity-compact" : ""} ${item.cardWidth < 72 ? "continuity-micro" : ""}`;
        const cardWidthStyle = item.continuityToId ? `--continuity-card-width:${item.cardWidth}px;` : "";
        const origin = eventOrigin(event);
        cards.push(`<article class="event-card origin-${origin} ${continuityClasses} ${eventEndScalar(event) != null ? `range ${rangeClasses}` : ""} ${isSelected ? "selected" : ""} ${view.searchQuery && !isMatch ? "search-dim" : ""} ${view.searchQuery && isMatch ? "search-match" : ""}" data-event-id="${event.id}" title="${esc(event.title)} · ${esc(formatSpan(event))}" style="left:${left}px;top:${y}px;--event-color:${eventColor};${rangeStyle};${cardWidthStyle}">
          ${eventEndScalar(event) != null ? `<span class="range-ribbon" role="button" tabindex="0" title="点击定位到事件开始位置"></span>${item.rangeHandleVisible ? '<button class="range-handle" type="button" title="拖动调整精确结束时间" aria-label="调整精确结束时间"></button>' : ""}` : ""}<span class="type-mark" title="${typeNames[event.type] || "节点"}">${esc(event.symbol || typeIcons[event.type] || "◆")}</span>
          <span class="node-origin-badge">${esc(eventOriginLabel(event))}</span>${item.continuityFromId ? `<span class="continuity-badge ${item.continuityDirect ? "direct" : "inherited"}" title="${esc(continuityRelationLabel(item.continuityRelation))}">${esc(continuityRelationLabel(item.continuityRelation))}</span>` : ""}<time class="event-year">${esc(formatSpan(event))}</time><h3>${esc(event.title)}</h3><p>${esc(event.description || "尚未补充详细内容")}</p>
          ${event.attachments?.length ? `<span class="attachment-badge">📎 ${event.attachments.length}</span>` : ""}
        </article>`);
      }
    }
    dom.svg.innerHTML = svg.join("");
    dom.branchLabelLayer.innerHTML = labels.join("");
    dom.eventLayer.innerHTML = cards.join("");
    dom.emptyState.hidden = project.events.length > 0;
  }

  function renderMinimap() {
    const canvas = dom.minimapCanvas;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, box.width, box.height);
    if (!project.events.length) return;
    const years = project.events.flatMap(event => [eventStartCoordinate(event), eventEndCoordinate(event) ?? eventStartCoordinate(event)]);
    const min = Math.min(...years) - 20;
    const max = Math.max(...years) + 20;
    const span = Math.max(1, max - min);
    project.branches.forEach((branch, index) => {
      const y = 12 + index * Math.min(10, 25 / Math.max(project.branches.length, 1));
      ctx.strokeStyle = `${branch.color}35`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(box.width, y); ctx.stroke();
      ctx.fillStyle = branch.color;
      project.events.filter(e => e.branchId === branch.id).forEach(event => {
        const x = (eventStartCoordinate(event) - min) / span * box.width;
        ctx.fillRect(x - 1, y - 2, 3, 5);
      });
    });
    const visibleStart = yearForScreenX(0);
    const visibleEnd = yearForScreenX(dom.viewport.clientWidth);
    const left = clamp((visibleStart - min) / span * box.width, 0, box.width);
    const right = clamp((visibleEnd - min) / span * box.width, 0, box.width);
    dom.minimapWindow.style.left = `${left}px`;
    dom.minimapWindow.style.width = `${Math.max(28, right - left)}px`;
  }

  function syncSelects() {
    const options = project.branches.map(branch => `<option value="${branch.id}">${esc(branch.name)}</option>`).join("");
    dom.eventBranch.innerHTML = options;
    dom.branchParent.innerHTML = `<option value="">无（独立世界线）</option>${options}`;
    const surfaceOptions = project.surfaces.map(surface => `<option value="${surface.id}">${"　".repeat(surfaceDepth(surface.id))}${esc(surface.name)}</option>`).join("");
    dom.branchSurface.innerHTML = surfaceOptions;
    dom.surfaceParent.innerHTML = `<option value="">无（顶级面线）</option>${surfaceOptions}`;
  }

  function selectEvent(id) {
    if (eventAutoSaveTimer && view.selectedEventId && view.selectedEventId !== id) flushEventAutoSave("");
    view.selectedEventId = id;
    const event = eventById(id);
    if (event) view.activeBranchId = event.branchId;
    syncInspector();
    render();
    dom.inspector.classList.add("open");
  }

  function attachmentMarkup(attachments, removable = false) {
    return attachments.map((attachment, index) => {
      const link = attachment.dataUrl ? `<a href="${esc(attachment.dataUrl)}" download="${esc(attachment.name)}">${esc(attachment.name)}</a>` : `<span>${esc(attachment.name)}</span>`;
      const remove = removable ? `<button type="button" data-remove-attachment="${index}" title="移除附件">×</button>` : "";
      return `<div>${link}<small>${formatFileSize(attachment.size)}</small>${remove}</div>`;
    }).join("");
  }

  function syncDetailPage(event = eventById(view.selectedEventId)) {
    if (!event) return;
    const branch = branchById(event.branchId);
    const origin = eventOrigin(event);
    dom.detailHeading.textContent = event.title || "未命名节点";
    dom.detailMeta.textContent = `${originNames[origin]} · ${typeNames[event.type] || "节点"} · ${formatSpan(event)} · ${branch?.name || "未分组"}`;
    dom.eventDescription.value = event.description || "";
    dom.detailSource.innerHTML = event.source
      ? (/^https?:\/\//i.test(event.source) ? `<a href="${esc(event.source)}" target="_blank" rel="noopener noreferrer">${esc(event.source)}</a>` : `<p>${esc(event.source)}</p>`)
      : `<p>尚未记录资料来源。</p>`;
    const attachments = event.attachments || [];
    dom.detailAttachments.innerHTML = attachments.length ? `<strong>附件</strong>${attachmentMarkup(attachments)}` : `<p>没有附件。</p>`;
  }

  function openDetailPage(id = view.selectedEventId) {
    const event = eventById(id);
    if (!event) return;
    if (view.selectedEventId !== id) selectEvent(id);
    syncDetailPage(event);
    dom.detailPage.hidden = false;
    document.body.classList.add("detail-open");
    requestAnimationFrame(() => dom.eventDescription.focus());
  }

  function closeDetailPage() {
    dom.detailPage.hidden = true;
    document.body.classList.remove("detail-open");
  }

  function duplicateEvent(source = eventById(view.selectedEventId)) {
    if (!source) return;
    const offset = 18 / Math.max(view.scale, 1);
    return createEvent(eventStartCoordinate(source) + offset, source.branchId, { ...source, sourceEventId: source.id, title: `${source.title}（副本）` });
  }

  function syncInspector() {
    const event = eventById(view.selectedEventId);
    dom.inspectorEmpty.hidden = Boolean(event);
    dom.eventForm.hidden = !event;
    dom.searchResults.hidden = true;
    if (!event) { closeDetailPage(); return; }
    const origin = eventOrigin(event);
    dom.inspectorHeading.textContent = event.title || "编辑节点";
    dom.nodeOriginPill.textContent = origin === "material" ? `外部素材 · ${event.materialSource || "来源未标注"}` : originNames[origin];
    dom.nodeOriginPill.dataset.origin = origin;
    dom.eventTitle.value = event.title || "";
    dom.eventStart.value = formatCalendarInput(eventStartScalar(event));
    dom.eventEnd.value = eventEndScalar(event) == null ? "" : formatCalendarInput(eventEndScalar(event));
    dom.calendarInputHint.textContent = `当前使用「${calendarById().name}」；格式：年-月-日 时:分:秒`;
    dom.eventBranch.value = event.branchId;
    dom.eventContinuityMode.value = event.continuityMode === "separate" ? "separate" : "auto";
    dom.continuityControl.querySelectorAll("[data-continuity-mode]").forEach(button => {
      const active = button.dataset.continuityMode === dom.eventContinuityMode.value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const continuityCandidate = eligibleContinuityPredecessors(event)[0];
    const continuityLinks = buildContinuityLinks(project.events);
    const actualPredecessor = continuityLinks.predecessorBySuccessor.get(event.id);
    const actualRelation = continuityLinks.relationBySuccessor.get(event.id);
    const occupyingSuccessor = continuityCandidate ? continuityLinks.successorByPredecessor.get(continuityCandidate.id) : null;
    dom.eventContinuityHint.className = `continuity-hint ${actualPredecessor ? "active" : ""}`;
    dom.eventContinuityHint.textContent = actualPredecessor
      ? relationMatchesGranularity(actualRelation)
        ? `已按${view.granularity === "year" ? "年" : view.granularity === "month" ? "月" : "日"}粒度接续「${actualPredecessor.title}」，连续链保持同一行。`
        : `与「${actualPredecessor.title}」继承${actualRelation === "month" ? "月" : "年"}级关系；当前粒度不直接连续，但仍稳定同行。`
      : continuityCandidate && event.continuityMode === "separate"
        ? `已设为独立成行；「${continuityCandidate.title}」与本节点不会组成连续链。`
        : continuityCandidate && occupyingSuccessor
          ? `「${continuityCandidate.title}」的交界已由「${occupyingSuccessor.title}」接续，本节点保持独立行。`
          : "当前没有可按年、月或日归入同一连续链的同轨节点。";
    dom.eventType.value = event.type || "event";
    dom.eventColor.value = safeColor(event.color, safeColor(branchById(event.branchId)?.color));
    dom.eventSymbol.value = symbolChoices.has(event.symbol) ? event.symbol : (typeIcons[event.type] || "◆");
    dom.eventDescription.value = event.description || "";
    dom.descriptionPreview.textContent = event.description || "尚未补充详细内容，点击进入详情页面";
    dom.eventSource.value = event.source || "";
    dom.eventSourceGroupTitle.textContent = origin === "material" ? "素材来源" : origin === "file" ? "文件出处" : "资料与素材";
    dom.eventSourceGroupHint.textContent = origin === "material" ? "外部检索记录" : origin === "file" ? "原始位置（可选）" : "引用来源";
    dom.eventSourceLabelText.textContent = origin === "material" ? "来源链接" : origin === "file" ? "原始路径或链接" : "资料来源";
    dom.materialNodeMeta.hidden = origin !== "material";
    dom.materialNodeMeta.innerHTML = origin === "material" ? `<span>素材提供方</span><strong>${esc(event.materialSource || "外部来源")}</strong><small>该节点由跨来源素材库加入，与自建事件和人物分开标识。</small>` : "";
    const attachments = event.attachments || [];
    dom.attachmentList.hidden = !attachments.length;
    dom.attachmentList.innerHTML = attachments.length ? `<strong>附件</strong>${attachmentMarkup(attachments, true)}` : "";
    dom.fileFunctionGroup.hidden = origin !== "file";
    const file = attachments[0];
    dom.fileMetaList.innerHTML = file ? `<div><dt>文件名</dt><dd>${esc(file.name)}</dd></div><div><dt>类型</dt><dd>${esc(file.type || "未知")}</dd></div><div><dt>大小</dt><dd>${formatFileSize(file.size)}</dd></div><div><dt>修改时间</dt><dd>${file.lastModified ? esc(new Date(file.lastModified).toLocaleString("zh-CN")) : "未知"}</dd></div><div><dt>保存方式</dt><dd>${file.dataUrl ? "已内嵌项目" : "仅保存元数据"}</dd></div>` : "";
    if (!dom.detailPage.hidden) syncDetailPage(event);
  }

  function createEvent(year = view.centerYear, branchId = view.activeBranchId, seed = {}) {
    snapshot();
    const targetBranch = branchId || project.branches[0]?.id;
    const startTime = coordinateToScalar(year);
    const event = { id: uid("evt"), branchId: targetBranch, startYear: year, startTime, type: "event", title: "未命名事件", description: "", source: "", attachments: [], origin: "manual", continuityMode: "auto", ...clone(seed) };
    event.id = uid("evt");
    event.branchId = targetBranch;
    const seedStart = eventStartScalar(seed);
    const seedEnd = eventEndScalar(seed);
    event.startTime = startTime;
    event.startYear = scalarToCoordinate(startTime);
    if (seedEnd != null) {
      event.endTime = startTime + Math.max(0, seedEnd - seedStart);
      event.endYear = scalarToCoordinate(event.endTime);
    } else {
      delete event.endTime;
      delete event.endYear;
    }
    project.events.push(event);
    commit("已插入新节点");
    selectEvent(event.id);
    requestAnimationFrame(() => dom.eventTitle.select());
    return event;
  }

  function formatFileSize(size = 0) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function referencePointsToDeleted(value, deletedIds) {
    if (typeof value === "string") return deletedIds.has(value);
    if (!value || typeof value !== "object") return false;
    const endpointKeys = ["eventId", "cardId", "fromEventId", "toEventId", "sourceEventId", "targetEventId", "parentEventId", "childEventId", "from", "to", "source", "target"];
    return endpointKeys.some(key => typeof value[key] === "string" && deletedIds.has(value[key]));
  }

  function cleanupEventReferences(deletedIds) {
    if (!deletedIds.size) return 0;
    let removed = 0;
    const arrayFields = ["references", "relatedEventIds", "linkedEventIds", "referenceIds"];
    const singleFields = ["sourceEventId", "targetEventId", "parentEventId", "referenceEventId", "linkedEventId", "reference"];
    for (const event of project.events) {
      for (const field of arrayFields) {
        if (!Array.isArray(event[field])) continue;
        const before = event[field].length;
        event[field] = event[field].filter(reference => !referencePointsToDeleted(reference, deletedIds));
        removed += before - event[field].length;
      }
      for (const field of singleFields) {
        if (!referencePointsToDeleted(event[field], deletedIds)) continue;
        delete event[field];
        removed += 1;
      }
    }
    for (const collection of ["relations", "links", "cardReferences", "eventLinks"]) {
      if (!Array.isArray(project[collection])) continue;
      const before = project[collection].length;
      project[collection] = project[collection].filter(record => !referencePointsToDeleted(record, deletedIds));
      removed += before - project[collection].length;
    }
    return removed;
  }

  function removeSelectedEvent() {
    const event = eventById(view.selectedEventId);
    if (!event || !confirm(`确定删除“${event.title}”吗？`)) return;
    clearTimeout(eventAutoSaveTimer); eventAutoSaveTimer = null;
    snapshot();
    project.events = project.events.filter(item => item.id !== event.id);
    const removedReferences = cleanupEventReferences(new Set([event.id]));
    view.selectedEventId = null;
    syncInspector();
    commit(removedReferences ? `节点已删除，并清理 ${removedReferences} 条引用` : "节点已删除");
  }

  function fitTimeline() {
    if (!project.events.length) return;
    const years = project.events.flatMap(event => [eventStartCoordinate(event), eventEndCoordinate(event) ?? eventStartCoordinate(event)]);
    const min = Math.min(...years), max = Math.max(...years);
    view.centerYear = (min + max) / 2;
    view.scale = clamp(dom.viewport.clientWidth / Math.max(80, max - min + 40), MIN_SCALE, MAX_SCALE);
    renderTimeline(); renderMinimap();
  }

  function parseNaturalLanguage(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const result = { branches: [], events: [] };
    let branchKey = "现实史线";
    let lastEvent = null;
    const ensureBranch = (name, color, parentName = null, forkYear = null, description = "") => {
      let branch = result.branches.find(item => item.name === name);
      if (!branch) {
        branch = { key: name, name, color, parentName, forkYear, description };
        result.branches.push(branch);
      }
      return branch;
    };
    ensureBranch("现实史线", "#59cbd2", null, null, "从文本识别出的现实历史");

    for (const line of lines) {
      if (/^现实\s*[:：]/.test(line)) {
        branchKey = "现实史线";
      } else if (/^(架空|虚构|假设|另一|分支).*[:：]/.test(line) || /^架空世界观/.test(line)) {
        branchKey = "架空世界线";
        ensureBranch(branchKey, "#d6a85e", "现实史线", 1368, line.replace(/^.*?[:：]/, "").trim());
        lastEvent = null;
        continue;
      }

      const range = line.match(/(-?\d{1,6})\s*年?\s*[-—–~至]\s*(-?\d{1,6})\s*年/);
      const years = [...line.matchAll(/(-?\d{1,6})\s*年/g)].map(match => Number(match[1]));
      if (range) {
        const startYear = Number(range[1]), endYear = Number(range[2]);
        let title = line.replace(range[0], "").replace(/^现实\s*[:：]?/, "").replace(/时间是|时间为|始于|止于/g, "").replace(/^[，,：:\s]+|[，,：:\s]+$/g, "") || `${startYear}—${endYear}年`;
        const event = { branchKey, startYear, endYear, type: /朝|代|时期|时代/.test(title) ? "era" : "event", title, description: line };
        result.events.push(event); lastEvent = event; continue;
      }
      if (years.length) {
        years.forEach((year, index) => {
          const stripped = line.replace(new RegExp(`${year}\\s*年`), "").replace(/^[，,：:\s(（]+|[）)\s]+$/g, "");
          let title = stripped;
          if (years.length > 1) title = `${stripped.slice(0, 28)}${stripped.length > 28 ? "…" : ""}`;
          const type = /出生|逝世|去世|人物|本名|生于/.test(line) ? "person" : /朝|时代|年号/.test(line) ? "era" : /世界|设定|改名|现身|出现/.test(line) ? "lore" : "event";
          const event = { branchKey, startYear: year, type, title: title || `${year}年事件`, description: line };
          result.events.push(event);
          if (index === years.length - 1) lastEvent = event;
        });
      } else if (lastEvent) {
        lastEvent.description = `${lastEvent.description}\n${line}`;
      } else {
        const branch = ensureBranch(branchKey, branchKey === "现实史线" ? "#59cbd2" : "#d6a85e");
        branch.description = [branch.description, line].filter(Boolean).join("；");
      }
    }
    return result;
  }

  function previewParsedText() {
    parseBuffer = parseNaturalLanguage(dom.timelineText.value);
    dom.parseCount.textContent = `${parseBuffer.events.length} 个节点 · ${parseBuffer.branches.length} 条分支`;
    dom.parsePreview.innerHTML = parseBuffer.events.length ? parseBuffer.events.map(event => `<div class="preview-item"><time>${esc(formatSpan(event))}</time><div><strong>${esc(event.title)}</strong><small>${esc(event.branchKey)} · ${typeNames[event.type]}</small></div></div>`).join("") : `<p style="color:var(--muted);font-size:11px">还没有识别到带年份的内容。</p>`;
  }

  function importParsedText() {
    if (!parseBuffer.events.length) return showToast("没有可加入的时间节点");
    snapshot();
    const branchIdMap = new Map();
    for (const parsedBranch of parseBuffer.branches) {
      let branch = project.branches.find(item => item.name === parsedBranch.name);
      if (!branch) {
        const parent = project.branches.find(item => item.name === parsedBranch.parentName);
        branch = { id: uid("branch"), name: parsedBranch.name, color: parsedBranch.color, parentId: parent?.id || null, forkYear: parsedBranch.forkYear ?? parseBuffer.events.find(e => e.branchKey === parsedBranch.name)?.startYear ?? 0, description: parsedBranch.description || "" };
        project.branches.push(branch);
      }
      branchIdMap.set(parsedBranch.key, branch.id);
    }
    for (const parsed of parseBuffer.events) {
      const fallback = project.branches[0];
      project.events.push({ id: uid("evt"), branchId: branchIdMap.get(parsed.branchKey) || project.branches.find(b => b.name === parsed.branchKey)?.id || fallback.id, startYear: parsed.startYear, endYear: parsed.endYear, startTime: legacyYearToScalar(parsed.startYear), endTime: parsed.endYear == null ? undefined : legacyYearToScalar(parsed.endYear), type: parsed.type, title: parsed.title, description: parsed.description || "", source: "" });
    }
    dom.parseDialog.close();
    commit(`已加入 ${parseBuffer.events.length} 个节点`);
    fitTimeline();
  }

  async function searchSelectedEvent() {
    const event = eventById(view.selectedEventId);
    if (!event) return;
    dom.searchResults.hidden = false;
    dom.searchResults.innerHTML = `<p>正在检索中文维基百科……</p>`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: event.title, gsrlimit: "5", prop: "extracts|info", exintro: "1", explaintext: "1", exchars: "280", inprop: "url", format: "json", origin: "*" });
      const response = await fetch(`https://zh.wikipedia.org/w/api.php?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      if (!pages.length) throw new Error("未找到相关条目");
      dom.searchResults.innerHTML = `<p>点击结果可将摘要与来源填入当前节点：</p>${pages.map((page, index) => `<button type="button" class="search-result" data-result-index="${index}"><strong>${esc(page.title)}</strong><span>${esc(page.extract || "暂无摘要")}</span></button>`).join("")}`;
      dom.searchResults._pages = pages;
    } catch (error) {
      const reason = error.name === "AbortError" ? "请求超时" : error.message;
      dom.searchResults.innerHTML = `<p>联网检索失败：${esc(reason)}。请检查网络；若直接双击打开页面，建议改用本地静态服务器。</p>`;
    } finally {
      clearTimeout(timeout);
    }
  }

  const stripHtml = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  async function searchWikipediaMaterials(query, signal) {
    const params = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "6", srprop: "snippet", format: "json", origin: "*" });
    const response = await fetch(`https://zh.wikipedia.org/w/api.php?${params}`, { signal });
    if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);
    const data = await response.json();
    return (data.query?.search || []).map(item => ({ id: `wikipedia-${item.pageid}`, sourceKey: "wikipedia", source: "中文维基", title: item.title, description: stripHtml(item.snippet) || "中文维基百科条目", url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(item.title)}`, type: "lore" }));
  }

  async function searchWikidataMaterials(query, signal) {
    const params = new URLSearchParams({ action: "wbsearchentities", search: query, language: "zh", uselang: "zh", type: "item", limit: "6", format: "json", origin: "*" });
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, { signal });
    if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
    const data = await response.json();
    return (data.search || []).map(item => ({ id: `wikidata-${item.id}`, sourceKey: "wikidata", source: "Wikidata", title: item.label || item.id, description: item.description || `Wikidata 实体 ${item.id}`, url: item.concepturi || `https://www.wikidata.org/wiki/${item.id}`, type: "lore" }));
  }

  async function searchOpenLibraryMaterials(query, signal) {
    const params = new URLSearchParams({ q: query, limit: "6", fields: "key,title,author_name,first_publish_year,subject" });
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, { signal });
    if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);
    const data = await response.json();
    return (data.docs || []).map((item, index) => ({
      id: `openlibrary-${item.key || index}`, sourceKey: "openlibrary", source: "Open Library", title: item.title || "未命名书目",
      description: [item.author_name?.slice(0, 3).join("、"), item.first_publish_year ? `首版 ${item.first_publish_year}` : "", item.subject?.slice(0, 3).join("、")].filter(Boolean).join(" · ") || "Open Library 书目",
      url: item.key ? `https://openlibrary.org${item.key}` : "https://openlibrary.org", type: "lore", suggestedYear: Number(item.first_publish_year) || undefined
    }));
  }

  function renderMaterialSourceControls() {
    dom.materialSources.innerHTML = project.materialSourceOrder.map((key, index) => {
      const source = materialSources[key];
      const checked = project.materialSourceEnabled[key] !== false ? "checked" : "";
      return `<div class="material-source-option" draggable="true" data-material-source-key="${key}"><span class="source-order-grip" title="拖动调整顺序">⋮⋮</span><b>${index + 1}</b><label><input type="checkbox" value="${key}" ${checked} /><span>${esc(source.name)}</span></label></div>`;
    }).join("");
  }

  function renderMaterialResults(status = "") {
    if (status) { dom.materialResults.innerHTML = `<p class="material-status">${esc(status)}</p>`; return; }
    if (!materialBuffer.length) { dom.materialResults.innerHTML = `<p class="material-status">没有找到匹配素材。</p>`; return; }
    dom.materialResults.innerHTML = project.materialSourceOrder.map((key, rank) => {
      const items = materialBuffer.filter(item => (item.sourceKey || materialSourceKey(item.source)) === key);
      if (!items.length) return "";
      return `<section class="material-source-group" data-result-source="${key}"><header><b>${rank + 1}</b><span>${esc(materialSources[key].name)}</span><small>${items.length} 条</small></header>${items.map(item => {
        const index = materialBuffer.indexOf(item);
        return `<article class="material-card" draggable="true" data-material-index="${index}">
          <span class="material-source">${esc(item.source)}</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p>
          <div><a href="${esc(item.url)}" target="_blank" rel="noopener">查看来源</a><button class="button" type="button" data-material-add="${index}">加入中心</button></div>
        </article>`;
      }).join("")}</section>`;
    }).join("");
  }

  async function searchGlobalMaterials() {
    const query = dom.materialQuery.value.trim();
    if (!query) { materialBuffer = []; renderMaterialResults("输入关键字后将自动显示相关素材。"); return; }
    const enabled = project.materialSourceOrder.filter(key => project.materialSourceEnabled[key] !== false);
    if (!enabled.length) return showToast("请至少选择一个素材来源");
    const sequence = ++materialSearchSequence;
    materialSearchController?.abort();
    const controller = new AbortController();
    materialSearchController = controller;
    renderMaterialResults(`正在按自定义顺序检索“${query}”……`);
    const timer = setTimeout(() => controller.abort(), 12000);
    const tasks = { wikipedia: searchWikipediaMaterials, wikidata: searchWikidataMaterials, openlibrary: searchOpenLibraryMaterials };
    const settled = await Promise.allSettled(enabled.map(source => tasks[source](query, controller.signal)));
    clearTimeout(timer);
    if (sequence !== materialSearchSequence || query !== dom.materialQuery.value.trim()) return;
    materialBuffer = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
    renderMaterialResults();
    const failed = settled.filter(result => result.status === "rejected").length;
    if (failed) showToast(`${enabled.length - failed} 个来源成功，${failed} 个来源暂不可用`);
  }

  function scheduleMaterialSearch(immediate = false) {
    clearTimeout(materialSearchTimer);
    materialSearchController?.abort();
    if (!dom.materialQuery.value.trim()) { materialSearchSequence += 1; materialBuffer = []; renderMaterialResults("输入关键字后将自动显示相关素材。"); return; }
    materialSearchTimer = setTimeout(searchGlobalMaterials, immediate ? 0 : 360);
  }

  async function downloadProject() {
    const content = JSON.stringify(project, null, 2);
    const fileName = project.title.replace(/[\\/:*?"<>|]/g, "-") || "时间轴";
    if (window.chronicleDesktop) {
      try {
        const result = await window.chronicleDesktop.saveProject({ name: fileName, content });
        if (!result.canceled) showToast("项目已导出");
      } catch (error) { showToast(`导出失败：${error.message}`); }
      return;
    }
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("项目已导出");
  }

  function importProjectContent(content) {
    try {
      const next = JSON.parse(content);
      if (!Array.isArray(next.branches) || !Array.isArray(next.events)) throw new Error("缺少 branches 或 events");
      snapshot(); project = normalizeProject(next); view.activeBranchId = project.branches[0]?.id; view.selectedEventId = null; view.granularity = project.timeGranularity;
      syncInspector(); commit("项目已导入"); fitTimeline();
    } catch (error) { showToast(`导入失败：${error.message}`); }
  }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = () => importProjectContent(reader.result);
    reader.readAsText(file);
  }

  async function openProject() {
    if (!window.chronicleDesktop) { dom.importFile.click(); return; }
    try {
      const result = await window.chronicleDesktop.openProject();
      if (!result.canceled) importProjectContent(result.content);
    } catch (error) { showToast(`导入失败：${error.message}`); }
  }

  function branchAtViewportY(y) {
    const { layouts } = buildBranchLayouts(dom.viewport.clientWidth);
    const contentY = y + dom.viewport.scrollTop;
    return layouts.find(layout => contentY >= layout.top && contentY < layout.top + layout.height)?.branch || branchById(view.activeBranchId) || project.branches[0];
  }

  function toggleBranch(branchId) {
    const branch = branchById(branchId);
    if (!branch) return;
    snapshot();
    branch.collapsed = !branch.collapsed;
    commit(branch.collapsed ? `已折叠「${branch.name}」` : `已展开「${branch.name}」`);
  }

  function deleteBranch(branchId) {
    const branch = branchById(branchId);
    if (!branch) return;
    if (project.branches.length <= 1) return showToast("项目至少需要保留一条时间线");
    const branchEvents = project.events.filter(event => event.branchId === branchId);
    const childCount = project.branches.filter(item => item.parentId === branchId).length;
    const detail = [
      `将删除时间线“${branch.name}”及其中 ${branchEvents.length} 张事件卡片。`,
      childCount ? `${childCount} 条子时间线会保留，但将解除父级引用。` : "",
      "所有指向这些卡片的关联记录也会一并清理。此操作可通过撤销恢复。"
    ].filter(Boolean).join("\n");
    if (!confirm(detail)) return;

    snapshot();
    const deletedEventIds = new Set(branchEvents.map(event => event.id));
    project.events = project.events.filter(event => event.branchId !== branchId);
    const removedReferences = cleanupEventReferences(deletedEventIds);
    project.branches = project.branches.filter(item => item.id !== branchId);
    project.branches.forEach(item => { if (item.parentId === branchId) item.parentId = null; });

    if (deletedEventIds.has(view.selectedEventId)) view.selectedEventId = null;
    if (view.activeBranchId === branchId) view.activeBranchId = project.branches[0]?.id;
    branchEditingId = null;
    dom.branchDialog.close();
    syncInspector();
    const referenceMessage = removedReferences ? `，清理 ${removedReferences} 条引用` : "";
    commit(`已删除时间线及 ${branchEvents.length} 张卡片${referenceMessage}`);
  }

  function openBranchDialog(branchId = null) {
    branchEditingId = branchId;
    const branch = branchById(branchId);
    syncSelects();
    dom.branchDialogHeading.textContent = branch ? "编辑时间分支" : "创建时间分支";
    dom.branchSubmitBtn.textContent = branch ? "保存分支" : "创建分支";
    dom.deleteBranchBtn.hidden = !branch;
    dom.deleteBranchBtn.disabled = project.branches.length <= 1;
    dom.deleteBranchBtn.title = project.branches.length <= 1 ? "项目至少需要保留一条时间线" : `删除“${branch?.name || ""}”及其中全部卡片`;
    $("#branchName").value = branch?.name || "";
    $("#branchForkYear").value = branch?.forkYear ?? Math.round(view.centerYear);
    $("#branchColor").value = safeColor(branch?.color, "#d4a75b");
    dom.branchParent.value = branch?.parentId || "";
    dom.branchSurface.value = branch?.surfaceId || project.surfaces[0]?.id || "";
    $("#branchDescription").value = branch?.description || "";
    dom.branchDialog.showModal();
  }

  function toggleSurface(surfaceId) {
    const surface = surfaceById(surfaceId);
    if (!surface) return;
    snapshot(); surface.collapsed = !surface.collapsed;
    commit(surface.collapsed ? `已折叠面线「${surface.name}」` : `已展开面线「${surface.name}」`);
  }

  function surfaceWouldCycle(surfaceId, parentId) {
    const visited = new Set([surfaceId]);
    let current = surfaceById(parentId);
    while (current) {
      if (visited.has(current.id)) return true;
      visited.add(current.id);
      current = surfaceById(current.parentId);
    }
    return false;
  }

  function openSurfaceDialog(surfaceId = null) {
    surfaceEditingId = surfaceId;
    const surface = surfaceById(surfaceId);
    syncSelects();
    dom.surfaceDialogHeading.textContent = surface ? "编辑叙事面线" : "创建叙事面线";
    dom.surfaceSubmitBtn.textContent = surface ? "保存面线" : "创建面线";
    dom.deleteSurfaceBtn.hidden = !surface;
    dom.deleteSurfaceBtn.disabled = project.surfaces.length <= 1;
    $("#surfaceName").value = surface?.name || "";
    $("#surfaceColor").value = safeColor(surface?.color, "#7a6ee6");
    dom.surfaceParent.value = surface?.parentId || "";
    $("#surfaceDescription").value = surface?.description || "";
    dom.surfaceDialog.showModal();
  }

  function deleteSurface(surfaceId) {
    const surface = surfaceById(surfaceId);
    if (!surface) return;
    if (project.surfaces.length <= 1) return showToast("项目至少需要保留一条面线");
    const fallbackId = surface.parentId || project.surfaces.find(item => item.id !== surfaceId)?.id;
    const trackCount = project.branches.filter(branch => branch.surfaceId === surfaceId).length;
    const childCount = project.surfaces.filter(item => item.parentId === surfaceId).length;
    if (!confirm(`删除面线“${surface.name}”？\n${trackCount} 条轨线与 ${childCount} 条子面线会迁移到其他面线，事件卡不会删除。`)) return;
    snapshot();
    project.branches.forEach(branch => { if (branch.surfaceId === surfaceId) branch.surfaceId = fallbackId; });
    project.surfaces.forEach(item => { if (item.parentId === surfaceId) item.parentId = surface.parentId || null; });
    project.surfaces = project.surfaces.filter(item => item.id !== surfaceId);
    surfaceEditingId = null; dom.surfaceDialog.close(); commit("面线已删除，轨线与子面线已迁移");
  }

  function focusEvent(event) {
    if (!event) return;
    view.centerYear = eventStartCoordinate(event);
    const branch = branchById(event.branchId);
    if (branch) branch.collapsed = false;
    selectEvent(event.id);
    requestAnimationFrame(() => dom.viewport.scrollTo({ top: Math.max(0, buildBranchLayouts(dom.viewport.clientWidth).layouts.find(item => item.branch.id === event.branchId)?.top - 36), behavior: "smooth" }));
  }

  function reorderTrackForEvent(event, targetSlot) {
    const layout = buildBranchLayouts(dom.viewport.clientWidth).layouts.find(item => item.branch.id === event.branchId);
    const item = layout?.items.find(candidate => candidate.event.id === event.id);
    const branch = branchById(event.branchId);
    if (!layout || !item || !branch || !layout.groupOrder.length) return false;
    const order = layout.groupOrder.slice();
    const from = order.indexOf(item.groupKey);
    const to = clamp(Math.round(targetSlot), 0, order.length - 1);
    if (from < 0 || from === to) return false;
    order.splice(to, 0, order.splice(from, 1)[0]);
    branch.trackOrder = order;
    return true;
  }

  function eventDraftFromForm() {
    const selected = eventById(view.selectedEventId);
    if (!selected) return null;
    let startTime = parseCalendarInput(dom.eventStart.value);
    let endTime = dom.eventEnd.value.trim() === "" ? undefined : parseCalendarInput(dom.eventEnd.value);
    if (startTime == null || (dom.eventEnd.value.trim() && endTime == null)) return null;
    if (endTime != null && endTime < startTime) [startTime, endTime] = [endTime, startTime];
    return {
      title: dom.eventTitle.value.trim() || "未命名事件",
      startTime,
      startYear: scalarToCoordinate(startTime),
      endTime,
      endYear: endTime == null ? undefined : scalarToCoordinate(endTime),
      branchId: dom.eventBranch.value,
      type: dom.eventType.value,
      continuityMode: dom.eventContinuityMode.value === "separate" ? "separate" : "auto",
      color: safeColor(dom.eventColor.value, safeColor(branchById(dom.eventBranch.value)?.color)),
      symbol: symbolChoices.has(dom.eventSymbol.value) ? dom.eventSymbol.value : typeIcons[dom.eventType.value],
      description: dom.eventDescription.value.trim(),
      source: dom.eventSource.value.trim()
    };
  }

  function flushEventAutoSave(message = "") {
    clearTimeout(eventAutoSaveTimer);
    eventAutoSaveTimer = null;
    const selected = eventById(view.selectedEventId);
    const draft = eventDraftFromForm();
    if (!selected || !draft) {
      if (selected) dom.saveStatus.textContent = "时间格式尚未完成";
      return false;
    }
    const changed = Object.entries(draft).some(([key, value]) => (selected[key] ?? undefined) !== (value ?? undefined));
    if (!changed) return true;
    snapshot();
    Object.assign(selected, draft);
    view.activeBranchId = selected.branchId;
    dom.inspectorHeading.textContent = selected.title;
    dom.descriptionPreview.textContent = selected.description || "尚未补充详细内容，点击进入详情页面";
    commit(message);
    if (!dom.detailPage.hidden) syncDetailPage(selected);
    return true;
  }

  function scheduleEventAutoSave() {
    if (!view.selectedEventId) return;
    clearTimeout(eventAutoSaveTimer);
    dom.saveStatus.textContent = "等待自动保存……";
    eventAutoSaveTimer = setTimeout(() => flushEventAutoSave(""), 560);
  }

  function readAttachment(file, embed = true) {
    const base = { name: file.name, type: file.type || "application/octet-stream", size: file.size, lastModified: file.lastModified };
    if (!embed || file.size > 1024 * 1024) return Promise.resolve(base);
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, dataUrl: reader.result });
      reader.onerror = () => resolve(base);
      reader.readAsDataURL(file);
    });
  }

  async function addDroppedFiles(files, year, branchId) {
    const list = [...files].slice(0, 20);
    if (!list.length) return;
    snapshot();
    let embedBudget = 1.5 * 1024 * 1024;
    const attachments = await Promise.all(list.map(file => {
      const embed = file.size <= embedBudget && file.size <= 1024 * 1024;
      if (embed) embedBudget -= file.size;
      return readAttachment(file, embed);
    }));
    attachments.forEach((attachment, index) => {
      project.events.push({
        id: uid("evt"), branchId, startYear: year + index / Math.max(view.scale, 1), startTime: coordinateToScalar(year + index / Math.max(view.scale, 1)), type: "lore",
        title: attachment.name, description: `${attachment.type} · ${formatFileSize(attachment.size)}${attachment.dataUrl ? " · 已内嵌保存" : " · 文件较大，仅保存元数据"}`,
        source: "", symbol: "✦", attachments: [attachment], origin: "file"
      });
    });
    commit(`已将 ${attachments.length} 个文件加入时间线`);
  }

  function bindEvents() {
    window.addEventListener("resize", render);
    dom.branchList.addEventListener("click", event => {
      const surfaceItem = event.target.closest("[data-surface-id]");
      const surfaceAction = event.target.closest("[data-surface-action]")?.dataset.surfaceAction;
      if (surfaceItem && surfaceAction === "collapse") return toggleSurface(surfaceItem.dataset.surfaceId);
      if (surfaceItem && surfaceAction === "edit") return openSurfaceDialog(surfaceItem.dataset.surfaceId);
      const item = event.target.closest("[data-branch-id]");
      if (!item) return;
      const action = event.target.closest("[data-branch-action]")?.dataset.branchAction;
      if (action === "collapse") return toggleBranch(item.dataset.branchId);
      if (action === "edit") return openBranchDialog(item.dataset.branchId);
      view.activeBranchId = item.dataset.branchId;
      renderBranchList();
    });
    let draggedBranchId = null;
    let draggedSurfaceId = null;
    dom.branchList.addEventListener("dragstart", event => {
      const item = event.target.closest("[data-branch-id]");
      if (!item) {
        const surface = event.target.closest("[data-surface-id]");
        if (!surface) return;
        draggedSurfaceId = surface.dataset.surfaceId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/x-chronicle-surface", draggedSurfaceId);
        surface.classList.add("drag-source");
        return;
      }
      draggedBranchId = item.dataset.branchId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/x-chronicle-branch", draggedBranchId);
      item.classList.add("drag-source");
    });
    dom.branchList.addEventListener("dragover", event => {
      if (!draggedBranchId && !draggedSurfaceId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const item = event.target.closest("[data-branch-id],[data-surface-id]");
      dom.branchList.querySelectorAll(".drag-target").forEach(node => node.classList.remove("drag-target"));
      item?.classList.add("drag-target");
    });
    dom.branchList.addEventListener("drop", event => {
      event.preventDefault();
      const target = event.target.closest("[data-branch-id]");
      const targetSurface = event.target.closest("[data-surface-id]");
      if (draggedSurfaceId && targetSurface && targetSurface.dataset.surfaceId !== draggedSurfaceId) {
        const from = project.surfaces.findIndex(surface => surface.id === draggedSurfaceId);
        const to = project.surfaces.findIndex(surface => surface.id === targetSurface.dataset.surfaceId);
        if (from >= 0 && to >= 0) {
          snapshot(); const [surface] = project.surfaces.splice(from, 1); project.surfaces.splice(to, 0, surface); commit("面线顺序已调整");
        }
        return;
      }
      if (draggedBranchId && !target && targetSurface) {
        const branch = branchById(draggedBranchId);
        if (branch && branch.surfaceId !== targetSurface.dataset.surfaceId) { snapshot(); branch.surfaceId = targetSurface.dataset.surfaceId; commit("轨线已移动到新面线"); }
        return;
      }
      if (!draggedBranchId || !target || target.dataset.branchId === draggedBranchId) return;
      const from = project.branches.findIndex(branch => branch.id === draggedBranchId);
      const to = project.branches.findIndex(branch => branch.id === target.dataset.branchId);
      if (from < 0 || to < 0) return;
      snapshot();
      const [branch] = project.branches.splice(from, 1);
      project.branches.splice(to, 0, branch);
      commit("轨线顺序已调整");
    });
    dom.branchList.addEventListener("dragend", () => {
      draggedBranchId = null;
      draggedSurfaceId = null;
      dom.branchList.querySelectorAll(".drag-source,.drag-target").forEach(node => node.classList.remove("drag-source", "drag-target"));
    });
    dom.branchLabelLayer.addEventListener("click", event => {
      const label = event.target.closest("[data-stage-branch-id]");
      if (label) toggleBranch(label.dataset.stageBranchId);
    });
    let surfaceResize = null;
    dom.branchLabelLayer.addEventListener("pointerdown", event => {
      const grip = event.target.closest(".surface-height-grip");
      const label = grip?.closest("[data-stage-surface-id]");
      const surface = label ? surfaceById(label.dataset.stageSurfaceId) : null;
      if (!surface || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      surfaceResize = { surfaceId: surface.id, startY: event.clientY, original: effectiveSurfaceRowHeight(surface.id), moved: false, snapshotted: false };
      document.body.classList.add("resizing-surface");
    });
    document.addEventListener("pointermove", event => {
      if (!surfaceResize) return;
      const delta = event.clientY - surfaceResize.startY;
      if (Math.abs(delta) < 3 && !surfaceResize.moved) return;
      const surface = surfaceById(surfaceResize.surfaceId);
      if (!surface) return;
      if (!surfaceResize.snapshotted) { snapshot(); surfaceResize.snapshotted = true; }
      surfaceResize.moved = true;
      surface.rowHeight = clamp(surfaceResize.original + delta, 82, 240);
      renderTimeline(); renderMinimap();
    });
    const finishSurfaceResize = () => {
      if (!surfaceResize) return;
      const moved = surfaceResize.moved;
      surfaceResize = null; document.body.classList.remove("resizing-surface");
      if (moved) commit("面线显示高度已调整");
    };
    document.addEventListener("pointerup", finishSurfaceResize);
    document.addEventListener("pointercancel", finishSurfaceResize);
    dom.eventLibrary.addEventListener("click", event => {
      const card = event.target.closest("[data-library-event-id]");
      if (card) focusEvent(eventById(card.dataset.libraryEventId));
    });
    dom.eventLibrary.addEventListener("dragstart", event => {
      const card = event.target.closest("[data-library-event-id]");
      if (!card) return;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-chronicle-event", card.dataset.libraryEventId);
      event.dataTransfer.setData("text/plain", eventById(card.dataset.libraryEventId)?.title || "时间线事件");
    });
    dom.eventLayer.addEventListener("click", event => {
      const card = event.target.closest("[data-event-id]");
      if (card && performance.now() > suppressCardClickUntil) selectEvent(card.dataset.eventId);
    });
    dom.eventLayer.addEventListener("keydown", event => {
      if (!event.target.matches(".range-ribbon") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      const card = event.target.closest("[data-event-id]");
      if (card) focusEvent(eventById(card.dataset.eventId));
    });
    dom.eventLayer.addEventListener("contextmenu", event => {
      const card = event.target.closest("[data-event-id]");
      if (!card) return;
      event.preventDefault();
      selectEvent(card.dataset.eventId);
      const selected = eventById(card.dataset.eventId);
      dom.contextMenuTitle.textContent = selected?.title || "节点操作";
      dom.nodeContextMenu.hidden = false;
      const menuWidth = 210;
      const menuHeight = 228;
      dom.nodeContextMenu.style.left = `${clamp(event.clientX, 8, window.innerWidth - menuWidth - 8)}px`;
      dom.nodeContextMenu.style.top = `${clamp(event.clientY, 8, window.innerHeight - menuHeight - 8)}px`;
    });
    dom.viewport.addEventListener("dragenter", event => {
      if (event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes("application/x-chronicle-event") || event.dataTransfer.types.includes("application/x-chronicle-material")) {
        event.preventDefault();
        dom.viewport.classList.add("drop-ready");
      }
    });
    dom.viewport.addEventListener("dragover", event => {
      if (event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes("application/x-chronicle-event") || event.dataTransfer.types.includes("application/x-chronicle-material")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes("Files") ? "copy" : "copy";
      }
    });
    dom.viewport.addEventListener("dragleave", event => {
      if (!dom.viewport.contains(event.relatedTarget)) dom.viewport.classList.remove("drop-ready");
    });
    dom.viewport.addEventListener("drop", event => {
      event.preventDefault();
      dom.viewport.classList.remove("drop-ready");
      const rect = dom.viewport.getBoundingClientRect();
      const year = yearForScreenX(event.clientX - rect.left);
      const branch = branchAtViewportY(event.clientY - rect.top) || project.branches[0];
      if (event.dataTransfer.files?.length) {
        addDroppedFiles(event.dataTransfer.files, year, branch.id);
        return;
      }
      const materialJson = event.dataTransfer.getData("application/x-chronicle-material");
      if (materialJson) {
        try {
          const material = JSON.parse(materialJson);
          createEvent(year, branch.id, { title: material.title || "外部素材", description: material.description || "", source: material.url || "", type: material.type || "lore", symbol: "✦", materialSource: material.source || "", materialSourceKey: material.sourceKey || materialSourceKey(material.source), origin: "material" });
          return;
        } catch (_) { return showToast("素材数据无法解析"); }
      }
      const sourceId = event.dataTransfer.getData("application/x-chronicle-event");
      const source = eventById(sourceId);
      if (source) createEvent(year, branch.id, { ...source, sourceEventId: source.id, title: `${source.title}（副本）` });
    });
    dom.viewport.addEventListener("dblclick", event => {
      if (event.target.closest(".event-card")) return;
      const rect = dom.viewport.getBoundingClientRect();
      const branch = branchAtViewportY(event.clientY - rect.top);
      createEvent(yearForScreenX(event.clientX - rect.left), branch?.id);
    });
    dom.viewport.addEventListener("wheel", event => {
      if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        event.preventDefault();
        const rect = dom.viewport.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const anchorYear = yearForScreenX(x);
        const factor = Math.exp(-event.deltaY * .0014);
        const nextScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
        view.centerYear = anchorYear - (x - rect.width / 2) / nextScale;
        view.scale = nextScale;
        renderTimeline(); renderMinimap();
      }
    }, { passive: false });

    let drag = null;
    let eventDrag = null;
    dom.eventLayer.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const card = event.target.closest("[data-event-id]");
      if (!card) return;
      const item = eventById(card.dataset.eventId);
      if (!item) return;
      event.preventDefault();
      eventDrag = {
        pointerId: event.pointerId, eventId: item.id, startX: event.clientX, startY: event.clientY,
        originalStart: eventStartScalar(item), originalEnd: eventEndScalar(item),
        originalStartCoordinate: eventStartCoordinate(item), originalEndCoordinate: eventEndCoordinate(item), originalBranchId: item.branchId,
        originalRibbonWidth: parseFloat(getComputedStyle(card).getPropertyValue("--range-width")) || 0,
        mode: event.target.closest(".range-handle") ? "resize" : event.target.closest(".range-ribbon") ? "range-jump" : "move", card, moved: false
      };
      dom.viewport.setPointerCapture(event.pointerId);
      card.classList.add("dragging-event");
    });
    dom.viewport.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest(".event-card")) return;
      drag = { x: event.clientX, y: event.clientY, center: view.centerYear, scrollTop: dom.viewport.scrollTop };
      dom.viewport.setPointerCapture(event.pointerId); dom.viewport.classList.add("dragging");
    });
    dom.viewport.addEventListener("pointermove", event => {
      if (eventDrag) {
        const dx = event.clientX - eventDrag.startX;
        const dy = event.clientY - eventDrag.startY;
        eventDrag.moved ||= Math.hypot(dx, dy) > 4;
        if (!eventDrag.moved) return;
        if (eventDrag.mode === "range-jump") return;
        if (eventDrag.mode === "move") {
          eventDrag.card.style.transform = `translate(${dx}px, ${dy}px)`;
        } else {
          const ribbon = eventDrag.card.querySelector(".range-ribbon");
          if (ribbon) ribbon.style.width = `${Math.max(2, eventDrag.originalRibbonWidth + dx)}px`;
          const handle = eventDrag.card.querySelector(".range-handle");
          if (handle) handle.style.transform = `translateX(${dx}px)`;
        }
        return;
      }
      if (!drag) return;
      view.centerYear = drag.center - (event.clientX - drag.x) / view.scale;
      dom.viewport.scrollTop = drag.scrollTop - (event.clientY - drag.y);
      renderTimeline(); renderMinimap();
    });
    const endDrag = event => {
      if (eventDrag) {
        const currentDrag = eventDrag;
        eventDrag = null;
        const item = eventById(currentDrag.eventId);
        if (event.type === "pointercancel") {
          renderTimeline();
        } else if (currentDrag.mode === "range-jump") {
          if (!currentDrag.moved && item) focusEvent(item);
          else renderTimeline();
        } else if (currentDrag.moved && item) {
          const dxYears = (event.clientX - currentDrag.startX) / view.scale;
          const dx = event.clientX - currentDrag.startX;
          const dy = event.clientY - currentDrag.startY;
          view.selectedEventId = item.id;
          if (currentDrag.mode === "resize") {
            snapshot();
            const endCoordinate = (currentDrag.originalEndCoordinate ?? currentDrag.originalStartCoordinate) + dxYears;
            item.endTime = Math.max(item.startTime, coordinateToScalar(endCoordinate));
            item.endYear = scalarToCoordinate(item.endTime);
            commit(`结束时间已调整为 ${formatScalar(item.endTime, 0)}`);
          } else {
            const rect = dom.viewport.getBoundingClientRect();
            const targetBranch = branchAtViewportY(event.clientY - rect.top);
            const sameBranch = !targetBranch || targetBranch.id === item.branchId;
            const layout = buildBranchLayouts(dom.viewport.clientWidth).layouts.find(candidate => candidate.branch.id === item.branchId);
            const contentY = event.clientY - rect.top + dom.viewport.scrollTop;
            const targetSlot = layout ? (contentY - layout.top - 58) / layout.slotSpacing : 0;
            if (sameBranch && Math.abs(dx) < 7 && Math.abs(dy) >= 5) {
              snapshot();
              if (reorderTrackForEvent(item, targetSlot)) commit("轨道行顺序已调整；连续链保持同行");
              else { history.past.pop(); syncUndoButtons(); renderTimeline(); }
            } else {
              snapshot();
              const duration = currentDrag.originalEnd == null ? null : currentDrag.originalEnd - currentDrag.originalStart;
              item.startTime = coordinateToScalar(currentDrag.originalStartCoordinate + dxYears);
              item.startYear = scalarToCoordinate(item.startTime);
              if (duration != null) { item.endTime = item.startTime + duration; item.endYear = scalarToCoordinate(item.endTime); }
              if (targetBranch) item.branchId = targetBranch.id;
              view.activeBranchId = item.branchId;
              commit(`节点已移动到 ${formatScalar(item.startTime, 0)}`);
            }
          }
          syncInspector();
          suppressCardClickUntil = performance.now() + 250;
        } else if (item) {
          selectEvent(item.id);
          suppressCardClickUntil = performance.now() + 100;
        }
      }
      drag = null;
      dom.viewport.classList.remove("dragging");
    };
    dom.viewport.addEventListener("pointerup", endDrag); dom.viewport.addEventListener("pointercancel", endDrag);

    dom.eventForm.addEventListener("submit", event => {
      event.preventDefault();
      if (!eventDraftFromForm()) return showToast(`时间格式无效，请按「年-月-日 时:分:秒」输入`);
      const saved = flushEventAutoSave("节点修改已保存");
      if (saved) syncInspector();
    });
    dom.eventForm.addEventListener("input", event => {
      if (event.target.matches("button,[type='file'],[type='submit']")) return;
      scheduleEventAutoSave();
    });
    dom.eventForm.addEventListener("change", event => {
      if (event.target.matches("button,[type='file'],[type='submit']")) return;
      scheduleEventAutoSave();
    });
    dom.continuityControl.addEventListener("click", event => {
      const button = event.target.closest("[data-continuity-mode]");
      if (!button) return;
      dom.eventContinuityMode.value = button.dataset.continuityMode;
      dom.continuityControl.querySelectorAll("[data-continuity-mode]").forEach(option => {
        const active = option === button;
        option.classList.toggle("active", active);
        option.setAttribute("aria-pressed", String(active));
      });
      scheduleEventAutoSave();
    });
    $("#deleteEventBtn").addEventListener("click", removeSelectedEvent);
    $("#closeInspectorBtn").addEventListener("click", () => { if (eventAutoSaveTimer) flushEventAutoSave(""); view.selectedEventId = null; syncInspector(); renderTimeline(); dom.inspector.classList.remove("open"); });
    $("#searchEventBtn").addEventListener("click", searchSelectedEvent);
    $("#openDetailBtn").addEventListener("click", () => openDetailPage());
    dom.descriptionPreview.addEventListener("click", () => openDetailPage());
    $("#duplicateEventBtn").addEventListener("click", () => duplicateEvent());
    $("#closeDetailBtn").addEventListener("click", closeDetailPage);
    $("#detailSaveBtn").addEventListener("click", () => dom.eventForm.requestSubmit());
    dom.attachmentList.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-attachment]");
      const selected = eventById(view.selectedEventId);
      if (!button || !selected) return;
      snapshot();
      selected.attachments.splice(Number(button.dataset.removeAttachment), 1);
      commit("附件已移除");
      syncInspector();
    });
    dom.searchResults.addEventListener("click", event => {
      const button = event.target.closest("[data-result-index]"); if (!button) return;
      const page = dom.searchResults._pages?.[Number(button.dataset.resultIndex)]; if (!page) return;
      dom.eventDescription.value = [dom.eventDescription.value, page.extract].filter(Boolean).join("\n\n");
      dom.eventSource.value = page.fullurl || `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title)}`;
      scheduleEventAutoSave();
      showToast("摘要已填入，将自动保存");
    });

    $("#addEventBtn").addEventListener("click", () => createEvent());
    $("#fitBtn").addEventListener("click", fitTimeline);
    $("#todayBtn").addEventListener("click", () => {
      const input = prompt(`输入「${calendarById().name}」日期时间：`, formatCalendarInput(coordinateToScalar(view.centerYear)));
      if (input == null) return;
      const scalar = parseCalendarInput(input);
      if (scalar == null) return showToast("请输入有效日期时间");
      view.centerYear = scalarToCoordinate(scalar);
      renderTimeline(); renderMinimap();
      showToast(`已定位到 ${formatScalar(scalar, 0)}`);
    });
    $("#zoomInBtn").addEventListener("click", () => { view.scale = clamp(view.scale * 1.8, MIN_SCALE, MAX_SCALE); renderTimeline(); renderMinimap(); });
    $("#zoomOutBtn").addEventListener("click", () => { view.scale = clamp(view.scale / 1.8, MIN_SCALE, MAX_SCALE); renderTimeline(); renderMinimap(); });
    dom.zoomSlider.addEventListener("input", () => { view.scale = sliderToScale(dom.zoomSlider.value); renderTimeline(); renderMinimap(); });
    dom.timelineSearch.addEventListener("input", () => {
      view.searchQuery = dom.timelineSearch.value;
      renderTimeline();
      renderEventLibrary();
    });
    dom.timelineSearch.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const matches = matchingEvents();
      if (!matches.length) return showToast("没有匹配的事件");
      const current = matches.findIndex(item => item.id === view.selectedEventId);
      focusEvent(matches[(current + 1) % matches.length]);
    });
    $("#undoBtn").addEventListener("click", undo); $("#redoBtn").addEventListener("click", redo);
    dom.projectTitle.addEventListener("change", () => { snapshot(); project.title = dom.projectTitle.value.trim() || "未命名时间轴"; commit(""); });

    $("#parseBtn").addEventListener("click", () => { dom.timelineText.value ||= exampleText; previewParsedText(); dom.parseDialog.showModal(); });
    $("#previewParseBtn").addEventListener("click", previewParsedText);
    $("#confirmParseBtn").addEventListener("click", importParsedText);
    dom.timelineText.addEventListener("input", () => { clearTimeout(dom.timelineText._timer); dom.timelineText._timer = setTimeout(previewParsedText, 250); });

    $("#addBranchBtn").addEventListener("click", () => openBranchDialog());
    dom.deleteBranchBtn.addEventListener("click", () => deleteBranch(branchEditingId));
    $("#closeBranchDialog").addEventListener("click", () => { branchEditingId = null; dom.branchDialog.close(); });
    $("#cancelBranchBtn").addEventListener("click", () => { branchEditingId = null; dom.branchDialog.close(); });
    dom.branchForm.addEventListener("submit", event => {
      event.preventDefault(); snapshot();
      const values = { name: $("#branchName").value.trim() || "未命名轨线", color: safeColor($("#branchColor").value), parentId: dom.branchParent.value || null, surfaceId: dom.branchSurface.value || project.surfaces[0]?.id, forkYear: Number($("#branchForkYear").value), description: $("#branchDescription").value.trim() };
      if (branchEditingId) {
        const branch = branchById(branchEditingId);
        if (branch) Object.assign(branch, values, { parentId: values.parentId === branch.id ? null : values.parentId });
        view.activeBranchId = branchEditingId;
        branchEditingId = null;
        dom.branchDialog.close();
        commit("时间分支已更新");
      } else {
        const branch = { id: uid("branch"), collapsed: false, ...values };
        project.branches.push(branch); view.activeBranchId = branch.id; dom.branchDialog.close(); dom.branchForm.reset(); commit("新世界分支已创建");
      }
    });

    $("#addSurfaceBtn").addEventListener("click", () => openSurfaceDialog());
    $("#closeSurfaceDialog").addEventListener("click", () => { surfaceEditingId = null; dom.surfaceDialog.close(); });
    $("#cancelSurfaceBtn").addEventListener("click", () => { surfaceEditingId = null; dom.surfaceDialog.close(); });
    dom.deleteSurfaceBtn.addEventListener("click", () => deleteSurface(surfaceEditingId));
    dom.surfaceForm.addEventListener("submit", event => {
      event.preventDefault();
      const values = { name: $("#surfaceName").value.trim() || "未命名面线", color: safeColor($("#surfaceColor").value, "#7a6ee6"), parentId: dom.surfaceParent.value || null, description: $("#surfaceDescription").value.trim() };
      if (surfaceEditingId && surfaceWouldCycle(surfaceEditingId, values.parentId)) return showToast("不能把面线移动到自己的子级中");
      snapshot();
      if (surfaceEditingId) {
        const surface = surfaceById(surfaceEditingId); if (surface) Object.assign(surface, values);
        surfaceEditingId = null; dom.surfaceDialog.close(); commit("叙事面线已更新");
      } else {
        project.surfaces.push({ id: uid("surface"), collapsed: false, ...values });
        dom.surfaceDialog.close(); dom.surfaceForm.reset(); commit("新叙事面线已创建");
      }
    });

    $("#presentBtn").addEventListener("click", () => { document.body.classList.toggle("presentation"); setTimeout(render, 360); });
    const openCalendarDialog = () => { renderCalendarList(); dom.calendarDialog.showModal(); };
    dom.calendarBtn.addEventListener("click", openCalendarDialog);
    dom.granularityControl.addEventListener("click", event => {
      const button = event.target.closest("[data-granularity]");
      if (button) switchGranularity(button.dataset.granularity);
    });
    $("#calendarMenuBtn").addEventListener("click", () => { dom.projectMenu.hidden = true; openCalendarDialog(); });
    $("#importCalendarBtn").addEventListener("click", importCalendarDefinition);
    dom.calendarList.addEventListener("click", event => {
      const item = event.target.closest("[data-calendar-id]");
      const action = event.target.closest("[data-calendar-action]")?.dataset.calendarAction;
      if (!item || !action) return;
      if (action === "switch") switchCalendar(item.dataset.calendarId);
      if (action === "delete") {
        const calendar = calendarById(item.dataset.calendarId);
        if (!confirm(`删除自定义历法“${calendar.name}”？事件时间点不会改变。`)) return;
        snapshot();
        project.calendars = project.calendars.filter(entry => entry.id !== calendar.id);
        if (project.activeCalendarId === calendar.id) project.activeCalendarId = "gregorian";
        commit("自定义历法已删除"); syncInspector();
      }
    });
    $("#materialBtn").addEventListener("click", () => {
      dom.materialDrawer.hidden = !dom.materialDrawer.hidden;
      if (!dom.materialDrawer.hidden) {
        renderMaterialSourceControls();
        if (!materialBuffer.length) renderMaterialResults("输入关键字后将自动显示相关素材。");
        requestAnimationFrame(() => dom.materialQuery.focus());
      }
    });
    $("#closeMaterialBtn").addEventListener("click", () => { dom.materialDrawer.hidden = true; });
    dom.materialSearchForm.addEventListener("submit", event => { event.preventDefault(); scheduleMaterialSearch(true); });
    dom.materialQuery.addEventListener("input", () => scheduleMaterialSearch());
    dom.materialSources.addEventListener("change", event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      snapshot();
      project.materialSourceEnabled[input.value] = input.checked;
      commit(input.checked ? `已启用 ${materialSources[input.value].name}` : `已停用 ${materialSources[input.value].name}`);
      scheduleMaterialSearch(true);
    });
    dom.materialSources.addEventListener("dragstart", event => {
      const option = event.target.closest("[data-material-source-key]");
      if (!option) return;
      materialSourceDragKey = option.dataset.materialSourceKey;
      option.classList.add("drag-source");
      event.dataTransfer.effectAllowed = "move";
    });
    dom.materialSources.addEventListener("dragover", event => {
      if (!materialSourceDragKey) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    dom.materialSources.addEventListener("drop", event => {
      const target = event.target.closest("[data-material-source-key]");
      if (!target || !materialSourceDragKey || target.dataset.materialSourceKey === materialSourceDragKey) return;
      event.preventDefault();
      snapshot();
      const order = project.materialSourceOrder.filter(key => key !== materialSourceDragKey);
      order.splice(order.indexOf(target.dataset.materialSourceKey), 0, materialSourceDragKey);
      project.materialSourceOrder = order;
      materialSourceDragKey = null;
      commit("素材来源顺序已更新");
      scheduleMaterialSearch(true);
    });
    dom.materialSources.addEventListener("dragend", () => { materialSourceDragKey = null; renderMaterialSourceControls(); });
    dom.materialResults.addEventListener("dragstart", event => {
      const card = event.target.closest("[data-material-index]");
      const material = card ? materialBuffer[Number(card.dataset.materialIndex)] : null;
      if (!material) return;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-chronicle-material", JSON.stringify(material));
      event.dataTransfer.setData("text/plain", `${material.title}\n${material.url}`);
    });
    dom.materialResults.addEventListener("click", event => {
      const button = event.target.closest("[data-material-add]");
      if (!button) return;
      const material = materialBuffer[Number(button.dataset.materialAdd)];
      if (!material) return;
      createEvent(view.centerYear, view.activeBranchId, { title: material.title, description: material.description, source: material.url, type: material.type, symbol: "✦", materialSource: material.source, materialSourceKey: material.sourceKey || materialSourceKey(material.source), origin: "material" });
    });
    dom.nodeContextMenu.addEventListener("click", event => {
      const command = event.target.closest("[data-node-command]")?.dataset.nodeCommand;
      if (!command) return;
      dom.nodeContextMenu.hidden = true;
      if (command === "detail") openDetailPage();
      if (command === "duplicate") duplicateEvent();
      if (command === "continuity") {
        const selected = eventById(view.selectedEventId);
        if (selected) {
          snapshot();
          selected.continuityMode = selected.continuityMode === "separate" ? "auto" : "separate";
          commit(selected.continuityMode === "separate" ? "已强制将节点与前一节点分行" : "已启用时间相接时自动连贯显示");
          syncInspector();
        }
      }
      if (command === "material") {
        const selected = eventById(view.selectedEventId);
        dom.materialDrawer.hidden = false;
        dom.materialQuery.value = selected?.title || "";
        renderMaterialSourceControls();
        scheduleMaterialSearch(true);
      }
      if (command === "delete") removeSelectedEvent();
    });
    dom.themeBtn.addEventListener("click", event => {
      event.stopPropagation();
      const willOpen = dom.themeMenu.hidden;
      dom.themeMenu.hidden = !willOpen;
      dom.projectMenu.hidden = true;
      dom.themeBtn.setAttribute("aria-expanded", String(willOpen));
    });
    dom.themeMenu.addEventListener("click", event => {
      const option = event.target.closest("[data-theme]");
      if (!option) return;
      setTheme(option.dataset.theme, true);
      dom.themeMenu.hidden = true;
      dom.themeBtn.setAttribute("aria-expanded", "false");
    });
    $("#moreBtn").addEventListener("click", event => {
      event.stopPropagation();
      dom.projectMenu.hidden = !dom.projectMenu.hidden;
      dom.themeMenu.hidden = true;
      dom.themeBtn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", event => {
      if (!event.target.closest("#projectMenu") && !event.target.closest("#moreBtn")) dom.projectMenu.hidden = true;
      if (!event.target.closest("#themeMenu") && !event.target.closest("#themeBtn")) {
        dom.themeMenu.hidden = true;
        dom.themeBtn.setAttribute("aria-expanded", "false");
      }
      if (!event.target.closest("#nodeContextMenu")) dom.nodeContextMenu.hidden = true;
    });
    $("#exportBtn").addEventListener("click", downloadProject);
    $("#importBtn").addEventListener("click", openProject);
    dom.importFile.addEventListener("change", () => { if (dom.importFile.files[0]) importProject(dom.importFile.files[0]); dom.importFile.value = ""; });
    window.chronicleDesktop?.onCommand(command => {
      if (command === "import") openProject();
      if (command === "export") downloadProject();
    });
    $("#resetBtn").addEventListener("click", () => {
      if (!confirm("恢复内置示例？当前项目仍可先导出 JSON 备份。")) return;
      snapshot(); project = normalizeProject(sampleProject()); view.activeBranchId = project.branches[0].id; view.selectedEventId = null; view.granularity = project.timeGranularity; syncInspector(); commit("已恢复示例项目"); fitTimeline();
    });
    document.addEventListener("keydown", event => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (meta && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if (meta && event.key.toLowerCase() === "f") { event.preventDefault(); dom.timelineSearch.focus(); dom.timelineSearch.select(); }
      if (event.key === "Escape") {
        if (!dom.detailPage.hidden) { closeDetailPage(); return; }
        dom.themeMenu.hidden = true;
        dom.themeBtn.setAttribute("aria-expanded", "false");
        dom.nodeContextMenu.hidden = true;
        if (view.selectedEventId) { if (eventAutoSaveTimer) flushEventAutoSave(""); view.selectedEventId = null; syncInspector(); renderTimeline(); }
      }
    });
  }

  setTheme(localStorage.getItem(THEME_KEY) || document.documentElement.dataset.theme);
  bindEvents();
  syncInspector();
  syncUndoButtons();
  render();
  requestAnimationFrame(fitTimeline);
})();
