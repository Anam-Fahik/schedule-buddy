import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarCheck2,
  Moon,
  Sun,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Settings2,
} from "lucide-react";

import {
  getActiveSchedule,
  saveSchedule,
  deleteSchedule,
  getAttendanceForRange,
  setAttendance,
  markAllForDay,
  STORAGE_KEY,
  type LocalClass,
  type LocalSchedule,
} from "@/lib/local-store";

export const Route = createFileRoute("/")({
  ssr: false,
  component: AppPage,
});

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_DAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type ClassRow = LocalClass;
type Schedule = LocalSchedule;

function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayIndexFor(schedule: Schedule, date: Date): number {
  if (schedule.mode === "weekly") {
    return (date.getDay() + 6) % 7;
  }
  const start = new Date(schedule.start_date + "T00:00:00");
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const cycle = schedule.cycle_days ?? 6;
  const idx = ((diffDays % cycle) + cycle) % cycle;
  return idx;
}

function AppPage() {
  const qc = useQueryClient();
  const scheduleQ = useQuery({
    queryKey: ["schedule"],
    queryFn: getActiveSchedule,
  });

  const dark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [darkState, setDarkState] = useState(dark);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) qc.invalidateQueries();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc]);

  const toggleDark = () => {
    const next = !darkState;
    setDarkState(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("presence-theme", next ? "dark" : "light");
    } catch {
      // localStorage can be unavailable in private browsing.
    }
  };

  if (scheduleQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = scheduleQ.data;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-32">
      <TopNav dark={darkState} onToggleDark={toggleDark} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {active?.schedule ? (
          <TodayView
            schedule={active.schedule}
            classes={active.classes}
            onResetSchedule={() => {
              deleteSchedule();
              qc.invalidateQueries();
            }}
          />
        ) : (
          <Onboarding
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["schedule"] });
              qc.invalidateQueries({ queryKey: ["attendance"] });
            }}
          />
        )}
      </main>
    </div>
  );
}

function TopNav({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  return (
    <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-3xl mx-auto px-4 h-14 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-8 bg-foreground rounded-md grid place-items-center shrink-0">
            <CalendarCheck2 className="size-4 text-background" />
          </div>
          <span className="font-extrabold tracking-tight text-lg truncate">Presence</span>
          <span className="hidden sm:inline text-xs font-mono text-muted-foreground ml-2 truncate">
            local only
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleDark}
            aria-label="Toggle dark mode"
            className="size-9 grid place-items-center rounded-full hover:bg-muted transition-colors"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </div>
    </nav>
  );
}

function TodayView({
  schedule,
  classes,
  onResetSchedule,
}: {
  schedule: Schedule;
  classes: ClassRow[];
  onResetSchedule: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const iso = todayISO(date);
  const dIdx = dayIndexFor(schedule, date);

  const todaysClasses = useMemo(
    () =>
      classes
        .filter((c) => c.day_index === dIdx)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [classes, dIdx],
  );

  const attQ = useQuery({
    queryKey: ["attendance", iso],
    queryFn: () => getAttendanceForRange({ from: iso, to: iso }),
  });

  const statusMap = useMemo(() => {
    const m = new Map<string, "attended" | "missed" | "cancelled">();
    (attQ.data ?? []).forEach((r) => m.set(r.class_id, r.status));
    return m;
  }, [attQ.data]);

  const setMut = useMutation({
    mutationFn: async (input: Parameters<typeof setAttendance>[0]) => setAttendance(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", iso] }),
  });

  const markMut = useMutation({
    mutationFn: async (input: Parameters<typeof markAllForDay>[0]) => markAllForDay(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", iso] });
      toast.success("Day updated");
    },
  });

  const label =
    schedule.mode === "weekly" ? WEEK_DAYS_FULL[dIdx] : `Day ${dIdx + 1} of ${schedule.cycle_days}`;

  const dateNice = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const attended = todaysClasses.filter((c) => statusMap.get(c.id) === "attended").length;
  const total = todaysClasses.length;
  const pct = total ? Math.round((attended / total) * 100) : 0;

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div className="min-w-0">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            {schedule.mode === "weekly" ? "Weekly" : "Rotating"} · {label}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight truncate">{dateNice}</h1>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-2xl font-extrabold text-primary">{pct}%</div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase">today</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setDate(new Date(date.getTime() - 86400000))}
          className="size-9 grid place-items-center rounded-full border border-border hover:bg-muted"
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => setDate(new Date())}
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Today
        </button>
        <button
          onClick={() => setDate(new Date(date.getTime() + 86400000))}
          className="size-9 grid place-items-center rounded-full border border-border hover:bg-muted"
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {todaysClasses.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-16 text-center">
          <p className="font-semibold">No classes on this day</p>
          <p className="text-sm text-muted-foreground mt-1">Enjoy the break.</p>
          <button
            onClick={onResetSchedule}
            className="mt-6 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Settings2 className="size-3" /> Reset schedule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {todaysClasses.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-surface border border-border rounded-xl"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center sm:justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-muted-foreground w-14 leading-tight">
                      {c.start_time.slice(0, 5)}
                      <br />
                      <span className="text-muted-foreground/60">{c.end_time.slice(0, 5)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{c.name}</h3>
                      {(c.room || c.teacher) && (
                        <p className="text-xs font-mono text-muted-foreground uppercase truncate">
                          {[c.room, c.teacher].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <StatusPills
                  status={statusMap.get(c.id)}
                  onSelect={(s) =>
                    setMut.mutate({
                      class_id: c.id,
                      date: iso,
                      status: statusMap.get(c.id) === s ? null : s,
                    })
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {todaysClasses.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/95 to-transparent z-30">
          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-3">
            <button
              disabled={markMut.isPending}
              onClick={() =>
                markMut.mutate({
                  date: iso,
                  class_ids: todaysClasses.map((c) => c.id),
                  status: "attended",
                })
              }
              className="py-4 bg-foreground text-background rounded-xl active:scale-[0.98] transition-transform shadow-lg font-extrabold text-sm"
            >
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">
                Mark all
              </div>
              PRESENT
            </button>
            <button
              disabled={markMut.isPending}
              onClick={() =>
                markMut.mutate({
                  date: iso,
                  class_ids: todaysClasses.map((c) => c.id),
                  status: "missed",
                })
              }
              className="py-4 bg-surface border border-border text-foreground rounded-xl active:scale-[0.98] transition-transform shadow-lg font-extrabold text-sm"
            >
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">
                Mark all
              </div>
              ABSENT
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function StatusPills({
  status,
  onSelect,
}: {
  status?: "attended" | "missed" | "cancelled";
  onSelect: (s: "attended" | "missed" | "cancelled") => void;
}) {
  const items: { key: "attended" | "missed" | "cancelled"; label: string }[] = [
    { key: "attended", label: "Attended" },
    { key: "missed", label: "Missed" },
    { key: "cancelled", label: "Cancelled" },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((i) => {
        const active = status === i.key;
        const activeCls =
          i.key === "attended"
            ? "border-attended bg-attended/10 text-attended ring-2 ring-attended/20"
            : i.key === "missed"
              ? "border-missed bg-missed/10 text-missed ring-2 ring-missed/20"
              : "border-cancelled bg-cancelled/10 text-cancelled ring-2 ring-cancelled/20";
        return (
          <button
            key={i.key}
            onClick={() => onSelect(i.key)}
            className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
              active ? activeCls : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

type DraftClass = {
  name: string;
  room: string;
  teacher: string;
  day_index: number;
  start_time: string;
  end_time: string;
};

function Onboarding({ onSaved }: { onSaved: () => void }) {
  const [mode, setMode] = useState<"weekly" | "rotating">("weekly");
  const [cycleDays, setCycleDays] = useState(6);
  const [startDate, setStartDate] = useState(todayISO());
  const [drafts, setDrafts] = useState<DraftClass[]>([]);

  const dayCount = mode === "weekly" ? 7 : cycleDays;
  const dayLabel = (i: number) => (mode === "weekly" ? WEEK_DAYS[i] : `Day ${i + 1}`);

  const addBlank = () =>
    setDrafts((d) => [
      ...d,
      {
        name: "",
        room: "",
        teacher: "",
        day_index: 0,
        start_time: "09:00",
        end_time: "10:00",
      },
    ]);

  const updateDraft = (i: number, patch: Partial<DraftClass>) =>
    setDrafts((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeDraft = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i));

  const save = () => {
    const valid = drafts.filter((c) => c.name.trim().length > 0);
    if (valid.length === 0) {
      toast.error("Add at least one class");
      return;
    }
    saveSchedule({
      mode,
      cycle_days: mode === "rotating" ? cycleDays : undefined,
      start_date: startDate,
      classes: valid.map((c) => ({
        name: c.name.trim(),
        room: c.room || null,
        teacher: c.teacher || null,
        color: null,
        day_index: c.day_index,
        start_time: c.start_time,
        end_time: c.end_time,
      })),
    });
    toast.success("Schedule saved on this device");
    onSaved();
  };

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
          Schedule setup
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Configure your schedule</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-[52ch]">
          Pick how your term is structured, then add your classes. Everything stays in this browser.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              mode === "weekly" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              checked={mode === "weekly"}
              onChange={() => setMode("weekly")}
            />
            <div className="font-bold">Recurring weekly</div>
            <div className="text-xs text-muted-foreground mt-1">
              Same classes every week (Mon–Sun).
            </div>
          </label>
          <label
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              mode === "rotating" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              checked={mode === "rotating"}
              onChange={() => setMode("rotating")}
            />
            <div className="font-bold">Rotating cycle</div>
            <div className="text-xs text-muted-foreground mt-1">
              Day 1..Day N cycles that repeat.
            </div>
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {mode === "rotating" && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Cycle length
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={cycleDays}
                onChange={(e) => setCycleDays(Number(e.target.value) || 6)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {drafts.length === 0 && (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
            No classes yet — add one below.
          </div>
        )}
        {drafts.map((c, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-xl p-4 grid gap-2 sm:grid-cols-6"
          >
            <input
              className="sm:col-span-2 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="Class name"
              value={c.name}
              onChange={(e) => updateDraft(i, { name: e.target.value })}
            />
            <input
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="Room"
              value={c.room}
              onChange={(e) => updateDraft(i, { room: e.target.value })}
            />
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={c.day_index}
              onChange={(e) => updateDraft(i, { day_index: Number(e.target.value) })}
            >
              {Array.from({ length: dayCount }).map((_, di) => (
                <option key={di} value={di}>
                  {dayLabel(di)}
                </option>
              ))}
            </select>
            <input
              type="time"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={c.start_time}
              onChange={(e) => updateDraft(i, { start_time: e.target.value })}
            />
            <div className="flex gap-2">
              <input
                type="time"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={c.end_time}
                onChange={(e) => updateDraft(i, { end_time: e.target.value })}
              />
              <button
                onClick={() => removeDraft(i)}
                className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addBlank}
          className="w-full py-3 rounded-xl border border-dashed border-border text-sm font-semibold hover:bg-muted flex items-center justify-center gap-2"
        >
          <Plus className="size-4" /> Add class
        </button>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          onClick={save}
          disabled={drafts.length === 0}
          className="rounded-xl bg-foreground text-background px-6 py-3 font-extrabold text-sm disabled:opacity-40"
        >
          Save schedule ({drafts.filter((d) => d.name.trim()).length})
        </button>
      </div>
    </div>
  );
}
