export const $ = (selector) => document.querySelector(selector);

export function icon(id, extra = '') {
  return `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}
export function button(action, label, primary = false, symbol = '') {
  return `<button class="action ${primary ? 'primary' : 'secondary'}" data-do="${action}">${symbol ? icon(symbol) : ''}${label}</button>`;
}
export function row(action, label, symbol, shortcut = '') {
  return `<button data-do="${action}">${icon(symbol)}${label}${shortcut ? `<small>${shortcut}</small>` : ''}</button>`;
}
export function heading(kicker, title) {
  return `<div class="dialog-head">
    <div><small>${kicker}</small><h2 id="dialog-title">${title}</h2></div>
    <button class="close" data-do="close" aria-label="关闭">${icon('close')}</button>
  </div>`;
}
export function payRow(label, value) {
  return `<div class="pay-row">${label}<b>${value}</b></div>`;
}
