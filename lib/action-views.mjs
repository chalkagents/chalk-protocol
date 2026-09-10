// Action-oriented projections for human CLI output. The state remains complete in the spine and
// JSON interfaces; these models choose one useful command and group the rest without side effects.
import { completionCurrent } from './spec-revisions.mjs';
import { depsSatisfied, needsRework, pendingDirectives, resolveRef } from './store.mjs';

export function nextActionView(tasks = []) {
  const wip = tasks.filter((task) => task.state === 'in-progress');
  const revalidation = tasks.filter(task => task.state === 'done' && !completionCurrent(task));
  const ready = tasks.filter((task) => task.state === 'specd' && depsSatisfied(task, tasks));
  const waiting = tasks.filter((task) => task.state === 'specd' && !depsSatisfied(task, tasks));
  const todo = tasks.filter((task) => task.state === 'todo');
  const blocked = tasks.filter((task) => task.state === 'blocked');
  const reviewBlocked = blocked.filter((task) => task.block?.needs === 'review');
  const humanBlocked = blocked.filter((task) => ['creds', 'decision', 'human-input', 'upstream'].includes(task.block?.needs));
  const short = (task) => task.id.slice(0, 12);
  let primary = null;
  if (wip[0]) primary = {
    kind: needsRework(wip[0]) ? 'rework' : 'work', task: wip[0],
    command: `chalk context ${short(wip[0])}`,
    label: needsRework(wip[0]) ? `Re-opened for rework: ${wip[0].title} · ${pendingDirectives(wip[0]).length} correction(s) pending rework` : `Continue: ${wip[0].title}`,
    details: needsRework(wip[0]) ? pendingDirectives(wip[0]).map((item) => `Instead of "${item.choice || 'the earlier choice'}": ${item.instead}`) : [],
  };
  else if (reviewBlocked[0]) primary = {
    kind: 'review-rework', task: reviewBlocked[0], command: `chalk review ${short(reviewBlocked[0])}`,
    label: `Review-blocked (agent-owned): fix the findings for ${reviewBlocked[0].title}, then run`,
    details: [],
  };
  else if (revalidation[0]) primary = {
    kind: 'revalidate', task: revalidation[0], command: `chalk start ${short(revalidation[0])}`,
    label: `Revalidate amended contract: ${revalidation[0].title}`, details: [],
  };
  else if (ready[0]) primary = {
    kind: 'start', task: ready[0], command: `chalk start ${short(ready[0])}`,
    label: `Start: ${ready[0].title}`, details: [],
  };
  else if (todo[0]) primary = {
    kind: 'spec', task: todo[0], command: `chalk spec ${short(todo[0])} --criterion "..."`,
    label: `Add acceptance criteria: ${todo[0].title}`, details: [],
  };
  else if (humanBlocked[0]) primary = {
    kind: 'human-input', task: humanBlocked[0], command: `chalk unblock ${short(humanBlocked[0])}`,
    label: `Resolve ${humanBlocked[0].block.needs} for ${humanBlocked[0].title}, then unblock`, details: [],
  };
  else if (waiting[0]) {
    const dependency = (waiting[0].after || []).map((ref) => resolveRef(tasks, ref)).find((task) => task && !completionCurrent(task));
    primary = { kind: 'dependency', task: waiting[0], command: 'chalk backlog', label: `Inspect dependency${dependency ? `: ${dependency.title}` : ` for ${waiting[0].title}`}`, details: [] };
  } else if (!tasks.length) primary = { kind: 'add', task: null, command: 'chalk task add "<title>"', label: 'Add the first task', details: [] };
  else if (tasks.every(completionCurrent)) primary = { kind: 'done', task: null, command: 'chalk task add "<title>"', label: 'All tasks are done; add the next one', details: [] };

  return {
    primary,
    counts: {
      inProgress: wip.length, runnable: ready.length, reviewBlocked: reviewBlocked.length,
      blocked: blocked.length, humanInput: humanBlocked.length, needsCriteria: todo.length,
      dependencies: waiting.length, done: tasks.filter(completionCurrent).length, ...(revalidation.length ? { revalidation: revalidation.length } : {}),
    },
  };
}

export function doctorResultGroups(results = []) {
  const specs = [
    ['blockers', 'Blockers', ['fail']],
    ['warnings', 'Warnings', ['warn']],
    ['improvements', 'Optional improvements', ['info']],
  ];
  return specs.map(([key, title, levels]) => ({ key, title, items: results.filter((item) => levels.includes(item.level)) }));
}
