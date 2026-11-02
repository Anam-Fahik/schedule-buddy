export type AttendanceStatus = "attended" | "missed" | "cancelled";
export type ScheduleMode = "weekly" | "rotating";

export type LocalClass = {
  id: string;
  name: string;
  room: string | null;
  teacher: string | null;
  color: string | null;
  day_index: number;
  start_time: string;
  end_time: string;
};

export type LocalSchedule = {
  id: string;
  mode: ScheduleMode;
  cycle_days: number | null;
  start_date: string;
  active: true;
};

export type LocalAttendance = {
  class_id: string;
  date: string;
  status: AttendanceStatus;
};

type LocalState = {
  version: 1;
  schedule: LocalSchedule | null;
  classes: LocalClass[];
  attendance: LocalAttendance[];
};

export const STORAGE_KEY = "presence.data.v1";

const emptyState = (): LocalState => ({
  version: 1,
  schedule: null,
  classes: [],
  attendance: [],
});

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function read(): LocalState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.classes) ||
      !Array.isArray(parsed.attendance)
    ) {
      return emptyState();
    }
    return {
      version: 1,
      schedule: parsed.schedule ?? null,
      classes: parsed.classes as LocalClass[],
      attendance: parsed.attendance as LocalAttendance[],
    };
  } catch {
    return emptyState();
  }
}

function write(state: LocalState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private browsing or when full.
  }
}

export function getActiveSchedule() {
  const state = read();
  if (!state.schedule) return { schedule: null, classes: [] as LocalClass[] };
  return { schedule: state.schedule, classes: state.classes };
}

export type SaveScheduleInput = {
  mode: ScheduleMode;
  cycle_days?: number | null;
  start_date: string;
  classes: Array<Omit<LocalClass, "id">>;
};

export function saveSchedule(input: SaveScheduleInput) {
  const classes = input.classes.map((c) => ({ ...c, id: makeId() }));
  const schedule: LocalSchedule = {
    id: makeId(),
    mode: input.mode,
    cycle_days: input.mode === "rotating" ? (input.cycle_days ?? 6) : null,
    start_date: input.start_date,
    active: true,
  };
  write({ version: 1, schedule, classes, attendance: [] });
  return { schedule_id: schedule.id };
}

export function deleteSchedule() {
  write(emptyState());
  return { ok: true };
}

export function getAttendanceForRange(input: { from: string; to: string }) {
  return read().attendance.filter((a) => a.date >= input.from && a.date <= input.to);
}

export function setAttendance(input: {
  class_id: string;
  date: string;
  status: AttendanceStatus | null;
}) {
  const state = read();
  const idx = state.attendance.findIndex(
    (a) => a.class_id === input.class_id && a.date === input.date,
  );
  if (input.status === null) {
    if (idx >= 0) state.attendance.splice(idx, 1);
  } else if (idx >= 0) {
    state.attendance[idx] = { ...state.attendance[idx], status: input.status };
  } else {
    state.attendance.push({
      class_id: input.class_id,
      date: input.date,
      status: input.status,
    });
  }
  write(state);
  return { ok: true };
}

export function markAllForDay(input: {
  date: string;
  class_ids: string[];
  status: "attended" | "missed";
}) {
  const state = read();
  input.class_ids.forEach((class_id) => {
    const idx = state.attendance.findIndex((a) => a.class_id === class_id && a.date === input.date);
    if (idx >= 0) {
      state.attendance[idx] = { ...state.attendance[idx], status: input.status };
    } else {
      state.attendance.push({ class_id, date: input.date, status: input.status });
    }
  });
  write(state);
  return { ok: true };
}
