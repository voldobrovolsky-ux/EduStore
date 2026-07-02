import { useEffect, useMemo, useState } from "react";
import type { TeacherClass } from "@edustore/shared";
import { Icon } from "@/design/Icon";
import { api } from "@/lib/api";
import { eduApi, type EduLesson } from "@/lib/eduApi";
import "./schedule.css";

type Filter = "all" | "upcoming" | "done";

const dayKey = (iso: string) => iso.slice(0, 10);
const fmtDay = (key: string) =>
  new Date(key + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

/** Моё расписание (движок schedule/me): уроки по дням, класс/предмет/тема/состояние. */
export function ScheduleScreen() {
  const [lessons, setLessons] = useState<EduLesson[] | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    eduApi.scheduleMe().then(setLessons).catch(() => setLessons([]));
    api.getClasses().then(setClasses).catch(() => {});
  }, []);

  const classLabel = useMemo(() => new Map(classes.map((c) => [c.classId, c.label])), [classes]);
  const subjName = useMemo(() => new Map(classes.map((c) => [c.subjectId, c.subject])), [classes]);

  const days = useMemo(() => {
    const src = (lessons ?? []).filter((l) =>
      filter === "all" ? true : filter === "done" ? l.state === "done" : l.state !== "done",
    );
    const m = new Map<string, EduLesson[]>();
    for (const l of [...src].sort((a, b) => a.date.localeCompare(b.date))) {
      const k = dayKey(l.date);
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [lessons, filter]);

  const todayKey = dayKey(new Date().toISOString());
  const total = lessons?.length ?? 0;

  return (
    <div className="sch-wrap">
      <div className="sch-head">
        <Icon name="schedule" size={22} />
        <div>
          <h2>Моё расписание</h2>
          <div className="sub">{lessons === null ? "Загружаем…" : `${total} уроков · из утверждённых КПП`}</div>
        </div>
        <div className="sch-filters">
          {([["all", "Все"], ["upcoming", "Предстоящие"], ["done", "Проведённые"]] as const).map(([k, t]) => (
            <button key={k} className={`sch-chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{t}</button>
          ))}
        </div>
      </div>

      {lessons !== null && days.length === 0 && (
        <div className="sch-empty">
          {total === 0 ? "Уроков пока нет — расписание появится после утверждения КТП и КПП." : "Под фильтр ничего не попало."}
        </div>
      )}

      {days.map(([k, ls], i) => (
        <div key={k} className="sch-day" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
          <div className={`sch-day-h${k === todayKey ? " today" : ""}`}>
            {fmtDay(k)} {k === todayKey && "· сегодня"}
          </div>
          <div className="sch-rows">
            {ls.map((l) => (
              <div key={l.id} className="sch-row">
                <span className="sch-class">{classLabel.get(l.classId) ?? "—"}</span>
                <span className="t">
                  <span className="topic">{l.topic}</span>
                  <span className="subj">{subjName.get(l.subjectId) ?? ""}</span>
                </span>
                <span className={`sch-st ${l.state}`}>
                  {l.state === "done" ? "проведён" : l.state === "running" ? "идёт" : "план"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
