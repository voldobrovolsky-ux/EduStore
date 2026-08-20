// Свойства спеки 1.1.1: генератор, материализация, журнал, контингент.
// Одноразовая модель (T2): без БД, без сети. Задача — сломать спеку.
import { states, transitions } from './states.mjs';
let fails = 0, notes = [];
const ok  = (m)=>console.log('  ✅ '+m);
const bad = (m)=>{ console.error('  ❌ '+m); fails++; };
const note= (m)=>{ notes.push(m); };

// ---------- P1. Мастер: литеры, пол, превью ----------
console.log('P1. Мастер классов');
const preview = (par, letters)=> letters ? par*letters.length : par;
if (preview(8,null)===8) ok('8 параллелей «без литер» → 8 классов'); else bad('превью без литер');
if (preview(8,['А','Б','В','Г'])===32) ok('8 × А-Г → превью показывает 32 класса до подтверждения (Д5)'); else bad('превью литер');
const derive = (total,boys)=> boys>total ? null : {boys, girls: total-boys};
if (derive(15,9).girls===6) ok('пол: 15 всего, 9 мальчиков → 6 девочек вычислено'); else bad('вычисление пола');
if (derive(15,16)===null) ok('мальчиков больше численности → отказ, не отрицательные девочки'); else bad('валидация пола');

// ---------- P2. Алфавит: ё, отсутствие отчества ----------
console.log('P2. Контингент: сортировка и деактивация');
const norm = s=> (s||'').toLowerCase().replace(/ё/g,'е');
const cmp = (a,b)=> norm(a.last).localeCompare(norm(b.last),'ru') || norm(a.first).localeCompare(norm(b.first),'ru') || norm(a.mid).localeCompare(norm(b.mid),'ru');
const kids = [
  {last:'Ёлкина',first:'Анна',mid:''},{last:'Егоров',first:'Пётр',mid:'Ильич'},
  {last:'Елагин',first:'Иван',mid:''},{last:'Абалкин',first:'Юрий',mid:'Олегович'},
].sort(cmp);
if (kids[0].last==='Абалкин' && kids.map(k=>k.last).indexOf('Ёлкина')===3 && kids[1].last==='Егоров')
  ok('алфавит: Ё=Е при сортировке, отчество опционально не ломает порядок');
else bad('сортировка: '+kids.map(k=>k.last).join(','));

// ---------- P3. Группы: дефолт-разбиение и покрытие ----------
console.log('P3. Группы (AR-75)');
const split = (students, g)=> students.map((s,i)=>({ ...s, group: 1 + Math.floor(i*g/students.length) }));
const cls = split(Array.from({length:15},(_,i)=>({id:i})), 2);
const g1 = cls.filter(s=>s.group===1).length, g2 = cls.filter(s=>s.group===2).length;
if (g1+g2===15 && Math.abs(g1-g2)<=1) ok(`дефолт-разбиение 15 на 2 группы: ${g1}+${g2}, каждый ровно в одной`); else bad('разбиение групп');

// ---------- P4. Валидация нагрузки ----------
console.log('P4. Нагрузка и отказы до перебора');
const SANPIN = {1:21,2:23,3:23,4:23,5:29,6:30,7:32,8:33,9:33,10:34,11:34}; // 5-дневка, табл. 6.6
function validateLoad(cls){
  const total = cls.pairs.reduce((a,p)=>a+ (p.scope==='class'? p.hours : 0),0)
              + Math.max(0,...[1,2].map(g=>cls.pairs.filter(p=>p.scope==='group'&&p.groups.includes(g)).reduce((a,p)=>a+p.hours,0)), 0);
  if (total > SANPIN[cls.parallel]) return {code:'LOAD_EXCEEDS_SANPIN', total, cap:SANPIN[cls.parallel]};
  if (total > cls.days*cls.slots) return {code:'LOAD_EXCEEDS_GRID', total, grid:cls.days*cls.slots};
  // групповые часы одного предмета: равны ли по группам?
  for (const subj of new Set(cls.pairs.filter(p=>p.scope==='group').map(p=>p.subject))) {
    const hs = [1,2].map(g=>cls.pairs.filter(p=>p.subject===subj&&p.groups.includes(g)).reduce((a,p)=>a+p.hours,0));
    if (hs[0]!==hs[1]) return {code:'GROUP_HOURS_UNEQUAL', subject:subj, hours:hs};
  }
  return null;
}
const c5 = {parallel:5, days:5, slots:7, pairs:[
  {subject:'математика',scope:'class',hours:5},{subject:'русский',scope:'class',hours:5},
  {subject:'литература',scope:'class',hours:3},{subject:'история',scope:'class',hours:2},
  {subject:'биология',scope:'class',hours:2},{subject:'физкультура',scope:'class',hours:3},
  {subject:'англ',scope:'group',groups:[1],hours:3},{subject:'англ',scope:'group',groups:[2],hours:3},
]};
if (validateLoad(c5)===null) ok('нагрузка 5 класса (23 ч, англ по группам 3+3) проходит'); else bad('ложный отказ на валидной нагрузке');
const over = {...c5, pairs:[...c5.pairs, {subject:'доп',scope:'class',hours:10}]};
const r1 = validateLoad(over);
if (r1?.code==='LOAD_EXCEEDS_SANPIN') ok(`перегруз → ${r1.code} (${r1.total} > ${r1.cap}) — именованный отказ до перебора`); else bad('перегруз не пойман: '+JSON.stringify(r1));
const uneq = {...c5, pairs: c5.pairs.map(p=> p.scope==='group'&&p.groups.includes(2) ? {...p,hours:1} : p)};
const r2 = validateLoad(uneq);
if (r2?.code==='GROUP_HOURS_UNEQUAL') { ok(`англ: группа 1 — 3 ч, группа 2 — 1 ч → ${r2.code}`); note('НАХОДКА: спека (экран 2) не содержала валидации «часы групп одного предмета равны» — два педагога могут вписать разные часы, и полуокно станет неустранимым. Валидация добавлена в спеку.'); }
else bad('неравные часы групп не пойманы');

// ---------- P5. Генератор: перебор с проверкой ограничений ----------
console.log('P5. Генератор (шаблон недели)');
function generate(classes, teachers, days, slots, seed){
  // Единицы планирования: класс-час (1 педагог) и СПАРЕННЫЙ групповой час
  // (обе группы предмета в одном слоте, 2 педагога) — правило пар из AR-75.
  const units=[];
  for (const c of classes){
    const groupSubjects = new Map();
    for (const p of c.pairs){
      if (p.scope==='class'){ for(let h=0;h<p.hours;h++) units.push({cls:c.id, teachers:[p.teacher], kind:'class'}); }
      else { const k=p.subject; (groupSubjects.get(k)||groupSubjects.set(k,[]).get(k)).push(p); }
    }
    for (const [subj, ps] of groupSubjects){
      const hrs = ps[0].hours;
      if (ps.length!==2 || ps.some(p=>p.hours!==hrs)) return {code:'GROUP_HOURS_UNEQUAL', subject:subj, cls:c.id};
      for(let h=0;h<hrs;h++) units.push({cls:c.id, teachers:ps.map(p=>p.teacher), kind:'paired'});
    }
  }
  // арифметические отказы ДО перебора
  const tHours={};
  for(const u of units) for(const t of u.teachers) tHours[t]=(tHours[t]||0)+1;
  for(const [t,h] of Object.entries(tHours)) if(h>days*slots) return {code:'TEACHER_OVERBOOKED', teacher:t, hours:h, cap:days*slots};
  let rng = seed;
  const rand = ()=> (rng = (rng*1103515245+12345)&0x7fffffff)/0x7fffffff;
  const order = units.map((u,i)=>[rand(),i]).sort((a,b)=>a[0]-b[0]).map(([,i])=>units[i]);
  const busyT={}, dayLen={}, grid={};
  function tryPlace(u){
    const opts=[];
    for(let d=0;d<days;d++){
      const s = dayLen[u.cls+':'+d]||0;              // без окон: следующий подряд слот
      if (s>=slots) continue;
      if (u.teachers.some(t=>busyT[d+':'+s+':'+t])) continue;
      opts.push([d,s]);
    }
    if(!opts.length) return false;
    const [d,s]=opts[Math.floor(rand()*opts.length)];
    for(const t of u.teachers) busyT[d+':'+s+':'+t]=true;
    (grid[d+':'+s]=grid[d+':'+s]||[]).push(u);
    dayLen[u.cls+':'+d]=s+1;
    return true;
  }
  for (const u of order) if(!tryPlace(u)) return {code:'NO_SOLUTION', unit:u};
  return {grid};
}
function verify(res, classes, days, slots){
  const v=[]; const grid=res.grid;
  for(let d=0;d<days;d++) for(const c of classes){
    const daySlots=[];
    for(let s=0;s<slots;s++) daySlots.push((grid[d+':'+s]||[]).filter(u=>u.cls===c.id));
    const lastBusy = daySlots.reduce((m,cell,i)=>cell.length?i:m,-1);
    daySlots.forEach((cell,s)=>{
      if(s<lastBusy && cell.length===0) v.push(`окно: класс ${c.id}, день ${d+1}, урок ${s+1}`);
      if(cell.length>1) v.push(`двойная занятость класса ${c.id}: день ${d+1}, урок ${s+1}`);
      if(cell.length===1 && cell[0].kind==='paired' && cell[0].teachers.length!==2)
        v.push(`групповой час без пары: класс ${c.id}, день ${d+1}, урок ${s+1}`);
    });
  }
  // педагог в двух местах
  const seenT={};
  for(const [k,cell] of Object.entries(grid)) for(const u of cell) for(const t of u.teachers){
    const kk=k+':'+t; if(seenT[kk]) v.push(`педагог ${t} в двух местах: слот ${k}`); seenT[kk]=true;
  }
  return v;
}
const teachers=['Мария','Ольга','Иван','Пётр','Анна','Нина','Олег','Юлия','Егор','Вера'];
const classes = Array.from({length:8},(_,i)=>({id:i+1, parallel:i+1, days:5, slots:7, pairs:[
  {subject:'математика',scope:'class',hours:4,teacher:teachers[i%3]},
  {subject:'русский',scope:'class',hours:4,teacher:teachers[3+i%3]},
  {subject:'окружающий/история',scope:'class',hours:2,teacher:teachers[6]},
  {subject:'физкультура',scope:'class',hours:2,teacher:teachers[7]},
  {subject:'англ',scope:'group',groups:[1],hours:2,teacher:teachers[8]},
  {subject:'англ',scope:'group',groups:[2],hours:2,teacher:teachers[9]},
]}));
let res=null, tries=0;
for(let seed=1;seed<=200 && !res?.grid;seed++){ tries=seed; const r=generate(classes,teachers,5,7,seed); if(r.grid) res=r; }
if(!res?.grid) bad('генератор не нашёл сетку за 200 зёрен на данных первой школы');
else {
  const viol = verify(res, classes, 5, 7);
  if (viol.length===0) ok(`сетка первой школы (8 классов, англ по группам) найдена (зерно ${tries}); окон и полуокон нет — перечислением по ${5*7*8} ячейкам`);
  else { viol.slice(0,5).forEach(bad); note('генератор допускает полуокна — ограничение 4 спеки должно быть жёстким, найдено '+viol.length); }
}
// перегруженный педагог: один ведёт 36 часов при 35 слотах
const overT = classes.map(c=>({...c, pairs: c.pairs.map(p=>({...p, teacher:'Мария'}))}));
const rT = generate(overT, teachers, 5, 7, 1);
if (rT.code==='TEACHER_OVERBOOKED') ok(`один педагог на всё → ${rT.code} (${rT.hours} ч > ${rT.cap} слотов) арифметикой, без перебора`); else bad('перегруз педагога не пойман: '+JSON.stringify(rT));
note('НАХОДКА: групповые часы предмета планируются АТОМАРНОЙ спаренной единицей (один слот, два педагога) — первая версия модели с независимыми групповыми единицами не нашла сетку в принципе: требование к реализации генератора, внесено в спеку (ограничение 4).');
note('НАХОДКА: отказ TEACHER_OVERBOOKED обязан вычисляться арифметикой до перебора (сумма часов педагога > дни×слоты), иначе модератор получает неинформативный NO_SOLUTION после долгого перебора. В спеке код есть — порядок проверок уточнён: арифметические отказы (SANPIN, GRID, OVERBOOKED, UNCOVERED, UNASSIGNED, UNEQUAL) до запуска перебора.');

// ---------- P6. Материализация: праздники, горизонт ----------
console.log('P6. Материализация (AR-73)');
const holidays = ['2027-02-23','2027-03-08'];
const isWorkday = (d)=> d.getDay()>=1 && d.getDay()<=5 && !holidays.includes(d.toISOString().slice(0,10));
function materialize(templatePerDay, from, weeks){
  const lessons=[];
  const start = new Date(from);
  for(let i=0;i<weeks*7;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    if(!isWorkday(d)) continue;
    const dow=(d.getDay()+6)%7;
    for(const u of (templatePerDay[dow]||[])) lessons.push({date:d.toISOString().slice(0,10), ...u});
  }
  return lessons;
}
const tpl = {0:[{slot:1},{slot:2}],1:[{slot:1}],2:[{slot:1}],3:[{slot:1}],4:[{slot:1}]};
const mat = materialize(tpl, '2027-02-22', 3);
if (!mat.some(l=>holidays.includes(l.date))) ok('материализация пропускает 23 февраля и 8 марта — мёртвых колонок в журнале нет (Д3)');
else bad('урок материализован на праздник');
const mondays = mat.filter(l=>l.date==='2027-02-22').length;
if (mondays===2) ok('понедельник с двумя уроками → 2 записи на дату → журнал даёт 2 колонки под одним числом'); else bad('двойной урок в дату потерян');

// ---------- P7. Журнал: гейт дат, деактивация ----------
console.log('P7. Журнал (AR-74, AR-78)');
const today='2027-03-01';
const postMark = (lessonDate, student)=> lessonDate>today ? {err:'LESSON_NOT_HELD'} : student.deactivated ? {err:'STUDENT_INACTIVE'} : {ok:true};
if (postMark('2027-03-02',{}).err==='LESSON_NOT_HELD') ok('отметка в завтрашний урок → LESSON_NOT_HELD (гейт в контракте)'); else bad('будущая отметка прошла');
if (postMark('2027-03-01',{}).ok) ok('текущий день — отметка принята'); else bad('текущий день отклонён');
if (postMark('2027-02-25',{deactivated:true}).err==='STUDENT_INACTIVE') ok('деактивированный ученик: новая отметка отклонена, история не тронута'); else bad('деактивация не держится');
note('НАХОДКА: гейт «текущий урок» в постановке — про уроки, а модель дат сравнивает дни. Урок сегодня в 14:00, отметка в 9:00 — урок ещё не прошёл. Принято [дефолт]: гейт по дате дня, не по времени слота (учитель заполняет журнал в течение дня свободно); сравнение по времени слота — кандидат на ужесточение в 1.1.x.');

// ---------- P8. Регенерация после ready: судьба уроков и отметок ----------
console.log('P8. Жизненный цикл сетки после подтверждения (AR-74, AR-85)');
const { regenerationPolicy, editEffects, wizard } = await import('./states.mjs');
function rematerialize(existing, nextKeys, policy){
  const lessons=[], events=[];
  for (const l of existing){
    if (nextKeys.has(l.key)) { lessons.push(l); continue; }
    if (policy==='detach-marked' && l.marks>0){ lessons.push({...l, detached:true}); events.push('schedule.lesson.detached.v1'); }
    // иначе урок исчезает вместе со старым шаблоном
  }
  return {lessons, events};
}
const wasLessons = [
  {key:'пн:1:5:матем', marks:12},   // проведён, отметки стоят — новый шаблон его не содержит
  {key:'пн:2:5:русск', marks:0},    // пустой урок, нового шаблона тоже нет
  {key:'вт:1:5:матем', marks:3},    // остаётся в новом шаблоне
];
const nextKeys = new Set(['вт:1:5:матем','ср:1:5:матем']);
const rem = rematerialize(wasLessons, nextKeys, regenerationPolicy);
const kept = rem.lessons.find(l=>l.key==='пн:1:5:матем');
if (kept?.detached) ok('регенерация: урок с отметками отвязан (detached), история не удалена');
else bad('регенерация уничтожает урок с выставленными отметками — история теряется');
if (rem.events.includes('schedule.lesson.detached.v1')) ok('журнал узнаёт об отвязке событием — колонок-призраков нет');
else bad('журнал подписан только на материализацию: об исчезновении урока не узнаёт');
if (!rem.lessons.some(l=>l.key==='пн:2:5:русск')) ok('урок без отметок исчезает вместе со старым шаблоном'); else bad('пустой урок пережил регенерацию');

// ---------- P9. Таксономия правок после ready ----------
console.log('P9. Что делает расписание устаревшим (AR-85)');
if (Array.isArray(editEffects) && editEffects.length) {
  const bogus = editEffects.filter(([,,target]) => !states.includes(target));
  if (!bogus.length) ok(`таксономия правок: ${editEffects.length} видов, у каждого назван исход`);
  else bad('правка ведёт в несуществующее состояние: '+bogus.map(e=>e[0]).join(', '));
  const roster = editEffects.filter(([name]) => /ученик/.test(name));
  if (roster.length && roster.every(([,affects,target]) => affects===false && target==='ready'))
    ok('правки контингента не роняют подтверждённую сетку в stale — отметки не под угрозой');
  else bad('добавление ученика переводит расписание в stale → регенерация ради нового ученика');
  const unbind = editEffects.find(([name]) => /открепить педагога/.test(name));
  if (unbind && unbind[1]===true && unbind[2]==='stale') ok('открепление педагога помечает сетку устаревшей — уроки без педагога видны');
  else bad('открепление педагога после ready: исход не определён');
  const hasIdle = transitions.some(([f,t,label]) => f==='ready' && t==='ready' && /правк/i.test(label));
  if (hasIdle) ok('в FSM есть правка, не выводящая из ready'); else bad('в FSM любая правка после ready ведёт в stale — таксономия правок не выражена');
} else bad('таксономия правок после ready не объявлена: editEffects отсутствует в states.mjs');

// ---------- P10. Класс из одного ученика и пустые группы ----------
console.log('P10. Крайний случай: класс из одного ученика (AR-75)');
if (wizard && typeof wizard.groupsFit === 'function') {
  if (wizard.groupsFit(15,2) && !wizard.groupsFit(1,2)) ok('мастер отклоняет 2 группы в классе из одного ученика');
  else bad('мастер допускает группу без учеников: класс 1 ученик × 2 группы');
  const one = split(Array.from({length:1},(_,i)=>({id:i})), 1);
  if (one.every(s=>s.group===1)) ok('класс из одного ученика без деления: единственная группа непуста'); else bad('разбиение сломалось на классе из одного ученика');
} else bad('правило «групп не больше, чем учеников» не объявлено: wizard.groupsFit отсутствует в states.mjs');

console.log(fails? `\n❌ Свойства: ${fails} падений` : '\n✅ Свойства: все инварианты держатся.');
if (notes.length){ console.log('\nЗаметки для 40-bench.md:'); notes.forEach(n=>console.log('  · '+n)); }
process.exit(fails?1:0);
