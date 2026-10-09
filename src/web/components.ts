import { el, button } from './dom.js';
import type { StatementNode } from '../shared/openui/openui-model.js';
import type { TimerLedger } from '../shared/openui/timer-store.js';
import type { WorkoutController } from '../shared/workout/controller.js';
import type { TrainerAnimation } from '../shared/workout/state.js';
import { createTrainer, type TrainerView } from './trainer.js';
export const trainerViews = new WeakMap<HTMLElement, TrainerView>();
export type Context = { send: (text:string)=>void; timers: TimerLedger; timerAction: (id:string, action:'start'|'pause'|'reset'|'finish')=>void; updates: (()=>void)[]; paused: boolean; workout?: WorkoutController };
// Trusted DOM ports of the source component signatures; no model-generated code.
export const renderers: Record<string,(node:StatementNode,context:Context)=>HTMLElement> = {
  Trainer: ({ props:p }, c) => {
    const view = createTrainer(c.workout?.state.trainerAnimation ?? p.animation as TrainerAnimation);
    trainerViews.set(view.element, view); view.element.setAttribute('aria-label', String(p.label));
    c.updates.push(() => view.update(c.workout?.state.trainerAnimation ?? p.animation as TrainerAnimation, c.workout?.state.paused ?? c.paused, c.workout?.state.movementLabel));
    let mounted = false;
    const observer = new MutationObserver(() => { if (view.element.isConnected) mounted = true; else if (mounted) { observer.disconnect(); view.dispose(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    return view.element;
  },
  Progress: ({ props:p }) => {
    const wrapper = el('div', '', 'session-progress');
    const label = el('span', String(p.label)); const value = el('span', `${Math.round(Number(p.value) * 100)}%`);
    const track = el('div', '', 'progress-track'), fill = el('div', '', 'progress-fill'); fill.style.width = `${Number(p.value) * 100}%`;
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', String(p.label)); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(Math.round(Number(p.value) * 100)));
    track.append(fill); wrapper.append(label, value, track); return wrapper;
  },
  CoachPanel: ({ props:p }) => {
    const panel = el('div', '', 'coach-panel'); panel.dataset.phase = String(p.phase);
    const sticker = el('img', '', 'mascot-sticker coach-spark') as HTMLImageElement;
    sticker.src = '/web/assets/aira-sticker.png'; sticker.alt = ''; sticker.setAttribute('aria-hidden', 'true');
    sticker.width = 28; sticker.height = 28;
    panel.append(sticker, el('p', String(p.cue))); return panel;
  },
  Text: ({props:p}) => el(p.variant==='title'?'h3':p.variant==='subtitle'?'h4':'p',String(p.text),'block block-'+String(p.variant??'body')),
  Keyword: ({props:p}) => {const n=el('div','','keyword');n.append(el('strong',String(p.text)));if(p.caption)n.append(el('p',String(p.caption)));return n;},
  Alert: ({props:p}) => el('aside',String(p.text),'block alert'),
  List: ({props:p},c) => {const n=el('ul','','block');for(const row of p.items as StatementNode[])n.append(renderComponent(row,c));return n;},
  ListItem: ({props:p}) => el('li',String(p.text)),
  FollowUps: ({props:p},c) => {const n=el('div','','row');for(const text of p.prompts as string[])n.append(button(text,()=>c.send(text)));return n;},
  Timer: ({key,props:p},c) => {
    const n=el('section','','timer');n.setAttribute('aria-label',String(p.label));
    n.append(el('p','SIMULATED TIMER · LOCAL ONLY','eyebrow'),el('h3',String(p.label)));
    const value=el('strong'),status=el('span','','micro timer-status'),row=el('div','','row');
    const start=button('Start simulation',()=>c.timerAction(key,'start')),pause=button('Pause timer',()=>c.timerAction(key,'pause')),reset=button('Reset timer',()=>c.timerAction(key,'reset')),finish=button('Simulate finish',()=>c.timerAction(key,'finish'));
    row.append(start,pause,reset,finish);n.append(value,status,row,el('p','Finishing records a local timer event.','micro'));
    const update=()=>{const entry=c.timers.list().find(t=>t.id===key);if(!entry)return;const seconds=Math.ceil(entry.remaining);value.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;status.textContent=entry.status;start.hidden=entry.status==='running'||entry.status==='paused';start.textContent=entry.status==='done'?'Restart simulation':'Start simulation';pause.hidden=entry.status==='stopped'||entry.status==='done';pause.textContent=entry.status==='paused'?'Resume timer':'Pause timer';for(const b of [start,pause,reset,finish])b.disabled=c.paused;};
    c.updates.push(update);update();return n;
  },
};
export function renderComponent(node:StatementNode,context:Context):HTMLElement {
  if(!Object.hasOwn(renderers,node.name))throw new Error('No renderer for '+node.name);
  const n=renderers[node.name](node,context);n.dataset.statement=node.key;
  if(typeof node.props.color==='string' && /^#[0-9a-fA-F]{6}$/.test(node.props.color))n.style.color=node.props.color;
  return n;
}
