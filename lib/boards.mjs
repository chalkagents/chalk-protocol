// Chalk Protocol — board projector. Second half of the Chalk Browser bridge: projects
// tasks.json into a single canonical `.chalk/boards/chalk-protocol.board.json` (the card
// kanban chalk-browser/src/main/boards.ts reads). Where plans/ is the spec/planning view,
// the board is the EXECUTION view: each card carries a `testArtifact` wiring the task's
// locked acceptance test + last known run — Protocol's tests-as-contract, made visible.
//
// One-way + single-file ownership: Protocol owns exactly this one board file (stable id), and
// rewrites it wholesale each sync. Any board the user creates in the Browser is a separate
// *.board.json and is never touched. Timestamps derive from task data (not wall-clock) so the
// file is stable across re-runs. Zero dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './store.mjs';

const BOARD_SLUG = 'chalk-protocol';
// Stable board identity so re-projection UPDATES the same board instead of spawning a new one
// (boards.ts looks boards up by `id`). Deterministic — derived from the project name, no UUID.
const boardId = (projectName) => 'proto-' + sha256(`chalk-protocol:${projectName}`).slice(0, 12);

// Protocol task state → board column id. NB the board uses `in_progress` (underscore) — distinct
// from the plans/ folder `inprogress`. `testing` stays empty (Protocol has no discrete
// verify-passed-but-not-done state). See BoardView.tsx COLUMNS.
const STATE_COLUMN = { todo: 'todo', specd: 'todo', 'in-progress': 'in_progress', done: 'done' };

const ms = (iso, fallback) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : fallback;
};

function cardFor(task, index) {
  const created = ms(task.createdAt, 0);
  const updated = ms(task.doneAt || task.startedAt || task.createdAt, created);
  const criteria = task.acceptanceCriteria || [];
  const tests = task.tests || [];
  const reviews = task.reviews || [];
  const card = {
    id: task.id, // stable: the Protocol task UUID
    title: task.title,
    column: STATE_COLUMN[task.state] || 'todo',
    createdAt: created,
    updatedAt: updated,
    order: index,
  };
  if (criteria.length) card.description = criteria.map((c) => `- ${c.text}`).join('\n');

  // testArtifact — the heart of the execution view: the locked acceptance test + last run.
  // lastRun is derived honestly from what the gates already prove: `done` means verify was
  // green (P4); otherwise fall back to the latest adversarial review verdict (P5).
  const lastReview = reviews[reviews.length - 1];
  let lastRun;
  if (task.state === 'done') {
    lastRun = { runId: `done-${task.id}`, status: 'passed', at: updated };
  } else if (lastReview) {
    lastRun = { runId: `review-${task.id}`, status: lastReview.verdict === 'pass' ? 'passed' : 'failed', at: ms(lastReview.at, updated) };
  }
  if (tests.length || lastRun) {
    card.testArtifact = {};
    if (tests.length) card.testArtifact.specPath = tests[0].path; // the locked contract
    if (lastRun) card.testArtifact.lastRun = lastRun;
  }
  return card;
}

// Project all tasks into the one Protocol-owned board file. Returns {file, cards, boardId}.
export function projectBoard(store) {
  const dir = join(store.root, '.chalk', 'boards');
  mkdirSync(dir, { recursive: true });
  const meta = store.meta();
  const name = meta?.project?.name || 'Chalk Protocol';
  const cards = store.tasks().map(cardFor);
  const board = {
    id: boardId(name),
    name: `${name} — Chalk Protocol`,
    createdAt: ms(meta?.createdAt, cards.length ? Math.min(...cards.map((c) => c.createdAt)) : 0),
    updatedAt: cards.length ? Math.max(...cards.map((c) => c.updatedAt)) : ms(meta?.updatedAt, 0),
    order: 0,
    cards,
  };
  const file = join(dir, `${BOARD_SLUG}.board.json`);
  writeFileSync(file, JSON.stringify(board, null, 2) + '\n');
  return { file, cards: cards.length, boardId: board.id };
}

// Best-effort projection for state-changing commands — never let a board refresh break a gate.
export function syncBoard(store) {
  try { return projectBoard(store); } catch { return null; }
}
