/* OPTIONAL EXPERIMENT: not the default WCSpedia interface. */
(function(){if(window.WCSNativeApp)return;

/* Source: ui.js */
if(!window.WCSUI){
/* Shared Citi-styled controls. Native fields remain the source of form values. */
(function (global) {
  'use strict';
  const doc = global.document;
  if (!doc) return;
  let sequence = 0, activePopover = null, cleanupScheduled = false;
  const dialogs = [], enhanced = new Map(), inertState = new Map();
  const uid = () => 'wcs-ui-' + (++sequence);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' + ({down:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',left:'<path d="m15 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',check:'<path d="m5 12 4 4L19 6"/>'}[name] || '') + '</svg>';
  function root() { return doc.getElementById('wcspedia'); }
  function layer() {
    const host = root();
    if (!host) throw Error('WCSpedia is not mounted.');
    let mount = host.querySelector(':scope > .wcs-ui-layer');
    if (!mount) { mount = doc.createElement('div'); mount.className = 'wcs-ui-layer'; host.append(mount); }
    return mount;
  }
  function put(element, body) { if (body && body.nodeType) element.append(body); else element.innerHTML = String(body || ''); }
  function focusable(host) { return Array.from(host.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(el => !el.hidden && !el.closest('[hidden],[inert]') && el.getClientRects().length); }
  function focusElement(el) { if (el && el.isConnected && !el.disabled && !el.closest('[inert]')) el.focus({preventScroll:true}); }
  function syncInert() {
    for (const [el, state] of inertState) { if (el.isConnected) el.inert = state; }
    inertState.clear();
    const top = dialogs[dialogs.length - 1];
    if (!top || !root()) return;
    const mount = layer();
    for (const el of root().children) if (el !== mount) { inertState.set(el, el.inert); el.inert = true; }
    for (const el of mount.children) if (el !== top.backdrop) { inertState.set(el, el.inert); el.inert = true; }
  }
  function dialog(options) {
    options = options || {};
    if (activePopover) activePopover.close('replace');
    const before = doc.activeElement, id = uid(), backdrop = doc.createElement('div');
    backdrop.className = 'wcs-ui-backdrop';
    const panel = doc.createElement('section');
    panel.className = 'wcs-ui-dialog' + (options.size === 'wide' ? ' is-wide' : '');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', id); panel.tabIndex = -1;
    panel.innerHTML = '<div class="wcs-ui-dialog-heading"><div><h2 id="' + id + '">' + escape(options.title || 'WCSpedia') + '</h2>' + (options.description ? '<p>' + escape(options.description) + '</p>' : '') + '</div><button type="button" class="wcs-ui-close" aria-label="' + escape(options.closeLabel || 'Close dialog') + '">' + icon('close') + '</button></div><div class="wcs-ui-dialog-body"></div>';
    const body = panel.querySelector('.wcs-ui-dialog-body'); put(body, options.body);
    backdrop.append(panel); layer().append(backdrop);
    let closed = false, busy = false;
    const handle = {element:panel, body, backdrop, close, setBusy(value) { busy = !!value; panel.setAttribute('aria-busy', String(busy)); panel.querySelector('.wcs-ui-close').disabled = busy; }, get busy() { return busy; }};
    function close(reason) {
      reason = reason || 'close';
      if (closed || busy) return false;
      if (options.onClose && options.onClose(reason, handle) === false) return false;
      closed = true;
      if (activePopover && panel.contains(activePopover.element)) activePopover.close('owner-close');
      destroyFields(panel); backdrop.remove();
      const index = dialogs.indexOf(handle); if (index >= 0) dialogs.splice(index, 1);
      syncInert();
      if (options.restoreFocus !== false) focusElement(before);
      return true;
    }
    panel.querySelector('.wcs-ui-close').addEventListener('click', () => close('close'));
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop && options.dismissOnBackdrop !== false) close('backdrop'); });
    // All validation belongs to the same inline error surface, never browser bubbles.
    panel.querySelectorAll('form').forEach(form => { form.noValidate = true; });
    dialogs.push(handle); syncInert(); enhance(panel);
    if (options.onMount) options.onMount(handle);
    if (!closed) focusElement(panel.querySelector('[autofocus]') || focusable(body)[0] || panel);
    return handle;
  }
  function popover(options) {
    options = options || {};
    if (!options.anchor || !options.anchor.isConnected) return null;
    if (activePopover) activePopover.close('replace');
    const anchor = options.anchor, panel = doc.createElement('div');
    panel.className = 'wcs-ui-popover' + (options.className ? ' ' + options.className : ''); panel.id = options.id || uid();
    if (options.role) panel.setAttribute('role', options.role);
    if (options.label) panel.setAttribute('aria-label', options.label);
    put(panel, options.body);
    const parent = anchor.closest('.wcs-ui-dialog') || layer(); parent.append(panel);
    let closed = false;
    function position() {
      if (closed) return;
      if (!anchor.isConnected) { close('detached'); return; }
      const rect = anchor.getBoundingClientRect(), view = global.visualViewport;
      const width = view ? view.width : global.innerWidth, height = view ? view.height : global.innerHeight;
      const gap = 8, pad = 12;
      panel.style.maxWidth = Math.max(180, width - pad * 2) + 'px';
      if (options.matchWidth) panel.style.width = Math.min(rect.width, width - pad * 2) + 'px';
      panel.style.maxHeight = Math.max(100, Math.min(options.maxHeight || 360, height - pad * 2)) + 'px';
      const size = panel.getBoundingClientRect();
      let left = Math.max(pad, Math.min(rect.left, width - size.width - pad));
      let top = rect.bottom + gap;
      if (top + size.height > height - pad && rect.top - gap - size.height >= pad) top = rect.top - gap - size.height;
      else top = Math.max(pad, Math.min(top, height - size.height - pad));
      panel.style.left = left + 'px'; panel.style.top = top + 'px';
    }
    function close(reason) {
      reason = reason || 'close'; if (closed) return false;
      if (options.onClose && options.onClose(reason, handle) === false) return false;
      closed = true; global.removeEventListener('resize', position); global.removeEventListener('scroll', position, true);
      destroyFields(panel); panel.remove(); if (activePopover === handle) activePopover = null;
      if (options.restoreFocus !== false && !['outside','replace','owner-close','detached','destroy'].includes(reason)) focusElement(anchor);
      return true;
    }
    const handle = {element:panel, anchor, close, reposition:position}; activePopover = handle;
    global.addEventListener('resize', position); global.addEventListener('scroll', position, true);
    enhance(panel); position();
    if (options.onMount) options.onMount(handle);
    position();
    if (options.focus !== false) focusElement(focusable(panel)[0] || panel);
    return handle;
  }
  function nameFor(field) {
    if (field.getAttribute('aria-label')) return field.getAttribute('aria-label');
    const labelled = field.getAttribute('aria-labelledby');
    if (labelled) return labelled.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ').trim();
    return Array.from(field.labels || []).map(label => (label.querySelector('span') || label).textContent.trim()).join(' ') || field.name || 'Choose an option';
  }
  function announceValue(field) { field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); }
  function selectControl(field) {
    if (field.multiple || Number(field.size) > 1) return;
    const originalHidden = field.hidden, id = uid(), wrapper = doc.createElement('span'), trigger = doc.createElement('button');
    wrapper.className = 'wcs-ui-select'; trigger.type = 'button'; trigger.className = 'wcs-ui-select-trigger'; trigger.id = id;
    trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', nameFor(field)); trigger.innerHTML = '<span class="wcs-ui-select-value"></span>' + icon('down');
    field.after(wrapper); wrapper.append(trigger); field.hidden = true; field.dataset.wcsUi = 'select';
    let popup = null, index = field.selectedIndex, buffer = '', bufferTimer;
    const abort = new AbortController(), signal = abort.signal;
    function opts() { return Array.from(field.options); }
    function enabled(i) { const option = field.options[i]; return option && !option.disabled && !option.closest('optgroup[disabled]'); }
    function sync() {
      trigger.disabled = field.disabled; trigger.setAttribute('aria-required', String(field.required));
      trigger.querySelector('.wcs-ui-select-value').textContent = field.selectedOptions[0]?.textContent || 'Choose an option';
      trigger.setAttribute('aria-invalid', field.getAttribute('aria-invalid') || 'false');
      if (field.disabled && popup) popup.close('disabled');
      if (popup) renderOptions();
    }
    function renderOptions() {
      if (!popup) return;
      const items = opts();
      popup.element.innerHTML = items.map((option, i) => '<div id="' + id + '-option-' + i + '" role="option" aria-selected="' + (field.selectedIndex === i) + '" aria-disabled="' + !enabled(i) + '" data-wcs-option="' + i + '" class="wcs-ui-option' + (i === index ? ' is-active' : '') + '"><span>' + escape(option.textContent) + '</span>' + (field.selectedIndex === i ? icon('check') : '') + '</div>').join('');
      if(index >= 0) trigger.setAttribute('aria-activedescendant', id + '-option-' + index); else trigger.removeAttribute('aria-activedescendant');
    }
    function move(next) {
      const items = opts(), direction = next >= index ? 1 : -1;
      next = Math.max(0, Math.min(items.length - 1, next));
      while (next >= 0 && next < items.length && !enabled(next)) next += direction;
      if (next < 0 || next >= items.length) return;
      index = next; renderOptions(); popup?.element.querySelector('.is-active')?.scrollIntoView({block:'nearest'});
    }
    function choose(next) {
      if (!enabled(next)) return;
      field.selectedIndex = next; sync(); if (popup) popup.close('select'); announceValue(field); queueMicrotask(() => { if (field.isConnected) sync(); });
    }
    function open() {
      if (field.disabled || popup) return;
      index = field.selectedIndex >= 0 ? field.selectedIndex : opts().findIndex((_, i) => enabled(i));
      popup = popover({anchor:trigger, id:id + '-list', role:'listbox', label:nameFor(field), matchWidth:true, className:'wcs-ui-options', focus:false, onClose() { popup = null; trigger.setAttribute('aria-expanded','false'); trigger.removeAttribute('aria-activedescendant'); }});
      trigger.setAttribute('aria-controls', popup.element.id); trigger.setAttribute('aria-expanded', 'true'); renderOptions();
      popup.element.addEventListener('pointerdown', event => { if (event.target.closest('[data-wcs-option]')) event.preventDefault(); });
      popup.element.addEventListener('click', event => { const item = event.target.closest('[data-wcs-option]'); if (item) choose(Number(item.dataset.wcsOption)); });
    }
    trigger.addEventListener('click', () => popup ? popup.close('toggle') : open(), {signal});
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); if (!popup) { open(); if (!['Home','End'].includes(event.key)) return; }
        if (event.key === 'Home') { index = -1; move(0); }
        else if (event.key === 'End') { index = opts().length; move(opts().length - 1); }
        else move(index + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (popup) choose(index); else open(); }
      else if (event.key === 'Tab' && popup) popup.close('outside');
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        clearTimeout(bufferTimer); buffer += event.key.toLocaleLowerCase(); bufferTimer = setTimeout(() => {buffer = '';}, 650);
        const items = opts(); const start = (index + 1) % Math.max(1, items.length);
        const order = items.map((_, i) => (start + i) % items.length);
        const match = order.find(i => enabled(i) && items[i].textContent.trim().toLocaleLowerCase().startsWith(buffer));
        if (match !== undefined) { if (popup) move(match); else choose(match); }
      }
    }, {signal});
    field.addEventListener('change', sync, {signal}); field.addEventListener('input', sync, {signal});
    field.form?.addEventListener('reset', () => queueMicrotask(sync), {signal});
    for (const label of field.labels || []) label.addEventListener('click', event => { if (event.target === label || event.target.tagName === 'SPAN' && !wrapper.contains(event.target)) focusElement(trigger); }, {signal});
    const observer = new MutationObserver(sync); observer.observe(field, {attributes:true,childList:true,subtree:true,characterData:true});
    const record = {field, wrapper, sync, destroy() { if (popup) popup.close('destroy'); observer.disconnect(); abort.abort(); clearTimeout(bufferTimer); wrapper.remove(); field.hidden = originalHidden; delete field.dataset.wcsUi; }};
    enhanced.set(field, record); sync();
  }
  function iso(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0'); }
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-').map(Number), date = new Date(parts[0],parts[1]-1,parts[2],12);
    return iso(date) === value ? date : null;
  }
  function dateControl(field) {
    const wrapper = doc.createElement('span'), trigger = doc.createElement('button'); wrapper.className = 'wcs-ui-date';
    const fieldName = nameFor(field);
    const original = {type:field.type,placeholder:field.getAttribute('placeholder'),inputmode:field.getAttribute('inputmode'),pattern:field.getAttribute('pattern'),'aria-label':field.getAttribute('aria-label')};
    field.before(wrapper); wrapper.append(field,trigger); field.type = 'text'; field.inputMode = 'numeric'; field.placeholder = 'YYYY-MM-DD'; field.pattern = '\\d{4}-\\d{2}-\\d{2}'; field.dataset.wcsUi = 'date';
    // Keep an implicit label's calendar button out of the input's accessible name.
    if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) field.setAttribute('aria-label',fieldName);
    trigger.type = 'button'; trigger.className = 'wcs-ui-date-trigger'; trigger.setAttribute('aria-label', 'Choose ' + fieldName.toLocaleLowerCase()); trigger.setAttribute('aria-haspopup','dialog'); trigger.setAttribute('aria-expanded','false'); trigger.innerHTML = icon('calendar');
    const error = doc.createElement('span'); error.className = 'wcs-ui-field-error'; error.id = uid(); error.hidden = true; error.setAttribute('role','status'); wrapper.after(error);
    const describedBy = field.getAttribute('aria-describedby'); field.setAttribute('aria-describedby', [describedBy,error.id].filter(Boolean).join(' '));
    let popup = null, displayed = null, selectedDay = null;
    const abort = new AbortController(), signal = abort.signal;
    function validDay(date) { const value = iso(date); return (!field.min || value >= field.min) && (!field.max || value <= field.max); }
    function validate(show) {
      const value = field.value.trim(), date = parseDate(value); let message = '';
      if (value && !date) message = 'Enter a valid date as YYYY-MM-DD.';
      else if (date && !validDay(date)) message = field.min && value < field.min ? 'Choose ' + field.min + ' or later.' : 'Choose ' + field.max + ' or earlier.';
      field.setCustomValidity(message); error.textContent = message; error.hidden = !message || !show; field.setAttribute('aria-invalid', String(!!message)); return !message;
    }
    function sync() { trigger.disabled = field.disabled || field.readOnly; if (trigger.disabled && popup) popup.close('disabled'); }
    function renderCalendar(focusDate) {
      if (!popup) return;
      const first = new Date(displayed.getFullYear(),displayed.getMonth(),1,12), start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
      const month = first.toLocaleDateString('en-GB',{month:'long',year:'numeric'}), today = iso(new Date());
      let days = '';
      for (let i=0;i<42;i++) { const date = new Date(start); date.setDate(start.getDate()+i); const value = iso(date); days += '<button type="button" data-wcs-date="' + value + '" class="wcs-ui-day' + (date.getMonth()!==first.getMonth()?' is-other':'') + (value===field.value?' is-selected':'') + '" aria-label="' + escape(date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})) + '"' + (value===today?' aria-current="date"':'') + (value===field.value?' aria-pressed="true"':'') + (validDay(date)?'':' disabled') + ' tabindex="' + (value===iso(selectedDay)?'0':'-1') + '">' + date.getDate() + '</button>'; }
      popup.element.innerHTML = '<div class="wcs-ui-calendar-heading"><button type="button" data-wcs-month="-1" aria-label="Previous month">'+icon('left')+'</button><strong aria-live="polite">'+escape(month)+'</strong><button type="button" data-wcs-month="1" aria-label="Next month">'+icon('right')+'</button></div><div class="wcs-ui-calendar-week" aria-hidden="true">'+['Mo','Tu','We','Th','Fr','Sa','Su'].map(day=>'<span>'+day+'</span>').join('')+'</div><div class="wcs-ui-calendar-days" role="group" aria-label="Days in '+escape(month)+'">'+days+'</div><div class="wcs-ui-calendar-actions"><button type="button" class="link" data-wcs-today'+(validDay(new Date())?'':' disabled')+'>Today</button>'+(!field.required?'<button type="button" class="link" data-wcs-clear>Clear date</button>':'')+'<span>YYYY-MM-DD</span></div>';
      popup.reposition();
      if (focusDate) focusElement(popup.element.querySelector('[data-wcs-date="'+iso(focusDate)+'"]'));
    }
    function choose(value) { field.value = value; validate(true); popup?.close('select'); announceValue(field); }
    function open() {
      if (trigger.disabled || popup) return;
      selectedDay = parseDate(field.value) || new Date(); selectedDay.setHours(12,0,0,0);
      if (field.min && iso(selectedDay) < field.min) selectedDay = parseDate(field.min) || selectedDay;
      if (field.max && iso(selectedDay) > field.max) selectedDay = parseDate(field.max) || selectedDay;
      displayed = new Date(selectedDay.getFullYear(),selectedDay.getMonth(),1,12);
      popup = popover({anchor:trigger, role:'dialog', label:'Choose a date', className:'wcs-ui-calendar', focus:false, maxHeight:410, onClose() {popup=null;trigger.setAttribute('aria-expanded','false');}});
      trigger.setAttribute('aria-expanded','true'); trigger.setAttribute('aria-controls',popup.element.id); renderCalendar(selectedDay);
      popup.element.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button || button.disabled) return;
        if (button.dataset.wcsDate) choose(button.dataset.wcsDate);
        else if (button.hasAttribute('data-wcs-month')) { displayed.setMonth(displayed.getMonth()+Number(button.dataset.wcsMonth)); selectedDay = new Date(displayed); renderCalendar(); focusElement(popup.element.querySelector('[data-wcs-month="'+button.dataset.wcsMonth+'"]')); }
        else if (button.hasAttribute('data-wcs-today')) choose(iso(new Date()));
        else if (button.hasAttribute('data-wcs-clear')) choose('');
      });
      popup.element.addEventListener('keydown', event => {
        const button = event.target.closest('[data-wcs-date]'); if (!button) return;
        const date = parseDate(button.dataset.wcsDate), offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
        if (event.key in offsets) date.setDate(date.getDate()+offsets[event.key]);
        else if (event.key === 'Home') date.setDate(date.getDate()-((date.getDay()+6)%7));
        else if (event.key === 'End') date.setDate(date.getDate()+6-((date.getDay()+6)%7));
        else if (event.key === 'PageUp' || event.key === 'PageDown') { const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+(event.key==='PageUp'?-1:1));date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate())); }
        else return;
        event.preventDefault(); if (!validDay(date)) return; selectedDay=date; displayed=new Date(date.getFullYear(),date.getMonth(),1,12);renderCalendar(date);
      });
    }
    trigger.addEventListener('click',()=>popup?popup.close('toggle'):open(),{signal});
    field.addEventListener('blur',()=>validate(true),{signal}); field.addEventListener('input',()=>validate(false),{signal});field.addEventListener('change',()=>validate(true),{signal});
    field.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&event.altKey){event.preventDefault();open();}},{signal});
    const observer=new MutationObserver(sync);observer.observe(field,{attributes:true,attributeFilter:['disabled','readonly','min','max']});
    enhanced.set(field,{field,wrapper,sync,destroy(){if(popup)popup.close('destroy');observer.disconnect();abort.abort();wrapper.before(field);wrapper.remove();error.remove();field.type=original.type;for(const attr of ['placeholder','inputmode','pattern','aria-label']){if(original[attr]===null)field.removeAttribute(attr);else field.setAttribute(attr,original[attr]);}if(describedBy)field.setAttribute('aria-describedby',describedBy);else field.removeAttribute('aria-describedby');field.setCustomValidity('');delete field.dataset.wcsUi;}});sync();validate(false);
  }
  function enhance(container) {
    if (!container || !container.querySelectorAll) return;
    cleanup();
    container.querySelectorAll('form').forEach(form=>{form.noValidate=true;});
    container.querySelectorAll('select').forEach(field=>{ if(enhanced.has(field))enhanced.get(field).sync();else selectControl(field); });
    container.querySelectorAll('input[type="date"],input[data-wcs-ui="date"]').forEach(field=>{if(enhanced.has(field))enhanced.get(field).sync();else dateControl(field);});
    container.querySelectorAll('[title]').forEach(el=>{const title=el.getAttribute('title');el.removeAttribute('title');if(title){el.dataset.tooltip=title;if(!el.hasAttribute('aria-label')&&!el.textContent.trim())el.setAttribute('aria-label',title);}});
  }
  function destroyFields(container) { for (const [field,record] of enhanced) if (container===field||container.contains(field)) {record.destroy();enhanced.delete(field);} }
  function destroy(container) {
    if (!container) return;
    if(activePopover&&(container.contains(activePopover.anchor)||container.contains(activePopover.element)))activePopover.close('destroy');
    for(const handle of dialogs.slice())if(container===handle.backdrop||container.contains(handle.backdrop)){
      handle.setBusy(false);
      // Navigation owns teardown; a stale busy/veto callback cannot leave an inert page.
      if(!handle.close('destroy')){destroyFields(handle.element);handle.backdrop.remove();const index=dialogs.indexOf(handle);if(index>=0)dialogs.splice(index,1);}
    }
    destroyFields(container);syncInert();
  }
  function cleanup() {
    for (const [field,record] of enhanced) if(!field.isConnected){record.destroy();enhanced.delete(field);}
    if(activePopover&&!activePopover.anchor.isConnected)activePopover.close('detached');
    for(const handle of dialogs.slice())if(!handle.backdrop.isConnected){handle.setBusy(false);const index=dialogs.indexOf(handle);if(index>=0)dialogs.splice(index,1);destroyFields(handle.element);}
    if(!dialogs.length&&inertState.size)syncInert();
  }
  doc.addEventListener('pointerdown',event=>{if(activePopover&&!activePopover.element.contains(event.target)&&!activePopover.anchor.contains(event.target))activePopover.close('outside');},true);
  doc.addEventListener('focusin',event=>{if(activePopover&&!activePopover.element.contains(event.target)&&!activePopover.anchor.contains(event.target))activePopover.close('outside');},true);
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(activePopover){event.preventDefault();event.stopImmediatePropagation();activePopover.close('escape');return;}
      const current=dialogs[dialogs.length-1];if(current){event.preventDefault();event.stopImmediatePropagation();current.close('escape');}
    }
    if(event.key==='Tab'){
      const current=dialogs[dialogs.length-1];if(!current)return;const items=focusable(current.element);if(!items.length){event.preventDefault();current.element.focus();return;}
      const first=items[0],last=items[items.length-1];if(event.shiftKey&&(doc.activeElement===first||!current.element.contains(doc.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(doc.activeElement===last||!current.element.contains(doc.activeElement))){event.preventDefault();first.focus();}
    }
  },true);
  new MutationObserver(()=>{if(!cleanupScheduled){cleanupScheduled=true;queueMicrotask(()=>{cleanupScheduled=false;cleanup();});}}).observe(doc.documentElement,{childList:true,subtree:true});
  global.WCSUI={dialog,popover,enhance,destroy,closePopover:()=>activePopover?.close('close'),hasPopup:()=>!!activePopover||dialogs.length>0};
})(typeof window!=='undefined'?window:globalThis);

}
;

/* Source: data-table.js */
/* One presentation component for WCSpedia directories and work queues.
 * Values are escaped. Only renderer-owned markup may use html(); never pass
 * unescaped attachment/API data to it. Permissions remain the caller's job.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WCSDataTable=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const trusted=Symbol('WCSpedia table markup');
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const classes=value=>String(value||'').split(/\s+/).filter(v=>/^[a-zA-Z][\w-]*$/.test(v)).join(' ');
  const html=value=>Object.freeze({[trusted]:true,value:String(value==null?'':value)});
  const content=value=>value&&value[trusted]===true?value.value:escape(value);
  function render(options){
    options=options||{};const columns=options.columns||[],rows=options.rows||[];
    if(!columns.length)throw Error('A shared table needs at least one column.');
    const label=options.label||'Records',loading=options.loading===true,hasState=loading||!rows.length;
    const columnClass=column=>classes(column.className)+(column.actions?' wcs-data-table-action-cell':'');
    const empty=options.empty||{};
    // A status is outside the wide table so it always fits the visible scrollport.
    const state='<div class="wcs-data-table-state" role="status">'+(loading?'<p>'+escape(options.loadingLabel||'Loading records…')+'</p>':'<strong>'+escape(empty.title||'No records to show')+'</strong>'+(empty.description?'<p>'+escape(empty.description)+'</p>':'')+(empty.action?'<div class="wcs-data-table-state-action">'+content(empty.action)+'</div>':''))+'</div>';
    return '<div class="wcs-data-table-frame'+(hasState?' has-state':'')+'"><div class="wcs-data-table-scroll '+classes(options.scrollClassName)+'" tabindex="0" role="region" aria-label="'+escape(label)+'"'+(loading?' aria-busy="true"':'')+'><table class="wcs-data-table '+classes(options.className)+'"><caption class="sr-only">'+escape(label)+'</caption><thead><tr>'+columns.map(column=>'<th scope="col" class="'+columnClass(column)+'">'+(column.visuallyHidden?'<span class="sr-only">'+escape(column.label)+'</span>':escape(column.label))+'</th>').join('')+'</tr></thead><tbody>'+(hasState?'':rows.map(row=>'<tr class="wcs-data-table-row '+classes(row.className)+'"'+(row.id!=null?' data-record-key="'+escape(row.id)+'"':'')+'>'+columns.map((column,index)=>'<td class="'+columnClass(column)+'">'+content(row.cells?.[index])+'</td>').join('')+'</tr>').join(''))+'</tbody></table></div>'+(hasState?state:'')+'</div>';
  }
  return Object.freeze({render,html,escape});
});

;

/* Source: pagination.js */
/* Bounded pagination shared by the library and entitlement directory. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSPagination = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function total(value) { var number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number))) : 0; }
  function current(value, count) { var number = Number(value); return Math.min(Math.max(1, Math.floor(Number.isFinite(number) ? number : 1)), Math.max(1, count)); }
  function items(totalPages, currentPage) {
    var count = total(totalPages), selected = current(currentPage, count), pages = new Set();
    // The amount of work stays constant even for a very large result set.
    for (var offset = 0; offset < 3; offset++) {
      if (offset + 1 <= count) pages.add(offset + 1);
      if (count - offset >= 1) pages.add(count - offset);
    }
    for (var neighbor = -1; neighbor <= 1; neighbor++) { var page = selected + neighbor; if (page >= 1 && page <= count) pages.add(page); }
    var ordered = Array.from(pages).sort(function (a, b) { return a - b; }), tokens = [];
    ordered.forEach(function (number, index) {
      var previous = ordered[index - 1], gap = number - previous;
      if (index && gap === 2) tokens.push({type:'page', page:previous + 1, current:previous + 1 === selected});
      if (index && gap > 2) tokens.push({type:'ellipsis', from:previous + 1, to:number - 1});
      tokens.push({type:'page', page:number, current:number === selected});
    });
    return tokens;
  }
  function safeHref(value) {
    var href = String(value == null ? '' : value).trim();
    if (!href || /[\u0000-\u0020]/.test(href) || /^(?:javascript|data|vbscript):/i.test(href)) return '';
    if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^https?:/i.test(href)) return '';
    return href;
  }
  function render(options) {
    options = options || {};
    var count = total(options.totalPages), selected = current(options.currentPage, count);
    if (!count) return '';
    function control(page, label, className, disabled, visible) {
      var href = disabled ? '' : safeHref(typeof options.href === 'function' ? options.href(page) : '#?page=' + page);
      var attributes = ' class="wcs-page-control ' + className + '" aria-label="' + escape(label) + '"';
      return href ? '<a' + attributes + ' href="' + escape(href) + '" data-page="' + page + '">' + visible + '</a>'
        : '<span' + attributes + ' aria-disabled="true">' + visible + '</span>';
    }
    var previous = options.previousLabel || 'Previous', next = options.nextLabel || 'Next';
    return '<nav class="wcs-pagination" aria-label="' + escape(options.ariaLabel || 'Pagination') + '">' +
      control(selected - 1, previous + ' page', 'wcs-page-previous', selected === 1, '<span aria-hidden="true">←</span><span class="wcs-page-direction">' + escape(previous) + '</span>') +
      '<ol class="wcs-page-numbers">' + items(count, selected).map(function (token) {
        if (token.type === 'ellipsis') return '<li class="wcs-page-gap"><span aria-hidden="true">…</span><span class="wcs-pagination-sr">Pages ' + token.from + ' to ' + token.to + ' omitted</span></li>';
        if (token.current) return '<li><span class="wcs-page-control is-current" aria-current="page" aria-label="Page ' + token.page + ', current page">' + token.page + '</span></li>';
        return '<li>' + control(token.page, 'Page ' + token.page, '', false, String(token.page)) + '</li>';
      }).join('') + '</ol>' +
      control(selected + 1, next + ' page', 'wcs-page-next', selected === count, '<span class="wcs-page-direction">' + escape(next) + '</span><span aria-hidden="true">→</span>') + '</nav>';
  }
  return Object.freeze({items:items, render:render});
});

;

/* Source: native-confluence.js */
/* WCSpedia native-page adapter for self-hosted Confluence REST v1.
 * Content remains in native page bodies. This client never writes article JSON
 * attachments or treats labels/UI permissions as an approval authority.
 * https://developer.atlassian.com/server/confluence/confluence-rest-api-examples/
 * https://developer.atlassian.com/server/confluence/cql-field-reference/
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSNativeConfluence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var EXPAND = 'body.view,body.storage,version,space,ancestors,operations,metadata.labels';
  var ACTIONS = ['submit', 'complete-review', 'request-changes', 'approve', 'delete'];
  var MAX_RESPONSE = 8 * 1024 * 1024;
  var MAX_COLLECTION_PAGES = 20;
  function fail(message, code, status) { var e = new Error(message); e.code = code || 'INVALID_DATA'; if (status) e.status = status; throw e; }
  function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
  function id(value, name) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('Invalid ' + (name || 'page ID') + '.');
    if (!/^[1-9]\d{0,19}$/.test(String(value == null ? '' : value))) fail('Set a valid ' + (name || 'page ID') + '.');
    return String(value);
  }
  function number(value, min, max, name) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail('Invalid ' + name + '.');
    return value;
  }
  function text(value, max, name, allowEmpty) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!allowEmpty && !value.trim())) fail('Invalid ' + name + '.');
    return value.trim();
  }
  function only(value, keys, name) {
    if (!object(value) || Object.keys(value).some(function (key) { return keys.indexOf(key) < 0; })) fail('Unsupported ' + name + ' field.');
  }
  function quote(value) { return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function label(kind, value) {
    var normalized = text(value, 80, kind).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9 &/-]*$/.test(normalized)) fail('Use a recognised ' + kind + ' name or label slug.');
    return 'wcs-' + kind + '-' + normalized.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  }
  function nativePage(value, expectedId) {
    if (!object(value) || value.type !== 'page' || typeof value.title !== 'string' || !object(value.version)) fail('Confluence did not return a native page.', 'INVALID_RESPONSE');
    id(value.id); number(value.version.number, 1, Number.MAX_SAFE_INTEGER, 'native page version');
    if (expectedId && String(value.id) !== expectedId) fail('Confluence returned a different page.', 'INVALID_RESPONSE');
    return value;
  }
  function withinTree(page, rootId) {
    return !!rootId && (String(page.id) === rootId || (Array.isArray(page.ancestors) &&
      page.ancestors.some(function (ancestor) { return object(ancestor) && String(ancestor.id) === rootId; })));
  }
  function scopeMatch(page, rootId, space) {
    return String(page.id) !== rootId && object(page.space) && page.space.key === space && withinTree(page, rootId);
  }
  function operation(page, name) {
    return Array.isArray(page.operations) && page.operations.some(function (item) {
      return object(item) && item.operation === name && (item.targetType == null || item.targetType === 'page');
    });
  }
  function create(config, fetchImpl) {
    config = config || {};
    var fetcher = fetchImpl || (root.fetch && root.fetch.bind(root));
    if (typeof fetcher !== 'function') fail('Fetch is unavailable.', 'CONFIGURATION');
    // config.location exists solely for non-browser test harnesses. A real
    // browser's origin cannot be replaced by page configuration.
    var location = root.location || config.location;
    var href = location && (location.href || location.origin);
    var pageURL;
    try { pageURL = new URL(href); } catch (_) { fail('Serve the native adapter on the Confluence origin.', 'CONFIGURATION'); }
    if (!/^https?:$/.test(pageURL.protocol)) fail('Serve the native adapter over HTTP or HTTPS.', 'CONFIGURATION');
    var origin = pageURL.origin;
    var context = config.contextPath == null ? '/confluence' : config.contextPath;
    if (typeof context !== 'string' || (context !== '' && !/^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(context))) fail('Use a plain Confluence context path.', 'CONFIGURATION');
    context = context.replace(/\/+$/, '');
    var publishedRoot = id(config.publishedRootPageId, 'published root page ID');
    var workingRoot = config.workingRootPageId ? id(config.workingRootPageId, 'working root page ID') : null;
    if (workingRoot === publishedRoot) fail('Use separate published and restricted working roots.', 'CONFIGURATION');
    function spaceKey(value, name) { var key = text(value, 255, name); if (!/^[A-Za-z0-9_~.-]+$/.test(key)) fail('Invalid ' + name + '.', 'CONFIGURATION'); return key; }
    var publishedSpace = spaceKey(config.publishedSpaceKey || config.spaceKey, 'published space key');
    var workingSpace = config.workingSpaceKey ? spaceKey(config.workingSpaceKey, 'working space key') : publishedSpace;
    var authoringMode = config.authoringMode || 'workflow';
    if (['workflow', 'native-template'].indexOf(authoringMode) < 0) fail('Choose workflow or native-template authoring.', 'CONFIGURATION');
    function safeURL(value) {
      if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value) || /%(?:2e|2f|5c|25)/i.test(value.split(/[?#]/)[0])) fail('Invalid Confluence URL.', 'CONFIGURATION');
      var result;
      try { result = new URL(value, origin + context + '/'); } catch (_) { fail('Invalid Confluence URL.', 'CONFIGURATION'); }
      if (result.origin !== origin || result.username || result.password || result.hash || (context && result.pathname !== context && !result.pathname.startsWith(context + '/'))) fail('Only the signed-in Confluence origin and context are allowed.', 'CONFIGURATION');
      return result;
    }
    var workflowURL = config.nativeWorkflowEndpoint ? safeURL(config.nativeWorkflowEndpoint) : null;
    var workflowSnapshots = new Map();
    if (workflowURL && workflowURL.search) fail('The workflow endpoint must not contain query parameters.', 'CONFIGURATION');
    function endpoint(path) { return safeURL(origin + context + path); }
    function requireWorking() { if (!workingRoot) fail('Configure a restricted working root before authoring.', 'CONFIGURATION'); }
    function requireWorkflow() { if (!workflowURL) fail('A trusted native workflow endpoint is required for this action.', 'WORKFLOW_UNAVAILABLE'); }
    async function request(url, data) {
      url = safeURL(url.href || String(url));
      var settings = { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } };
      if (data !== undefined) { settings.headers['Content-Type'] = 'application/json'; settings.headers['X-Requested-With'] = 'XMLHttpRequest'; settings.body = JSON.stringify(data); }
      var response;
      try { response = await fetcher(url.href, settings); }
      catch (error) { if (error && error.name === 'AbortError') throw error; fail(data === undefined ? 'Confluence could not be reached. Check your session and connection.' : 'The request outcome is unknown. Check the document before retrying.', 'NETWORK'); }
      if (response.redirected) fail('A redirected Confluence response was refused. Sign in and try again.', 'REDIRECT');
      if (response.url) { var actual = safeURL(response.url); if (actual.href !== url.href) fail('An unexpected response URL was refused.', 'REDIRECT'); }
      if (!response.ok) {
        var status = response.status;
        fail(status === 401 ? 'Your Confluence session has expired. Sign in again.' : status === 403 ? 'Confluence does not permit this action.' : status === 409 ? 'This page or workflow changed. Reload before continuing.' : 'Confluence request failed (' + status + ').', status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : 'HTTP_ERROR', status);
      }
      var result;
      try {
        if (typeof response.text === 'function') { var raw = await response.text(); if (raw.length > MAX_RESPONSE) fail('The Confluence response is too large.', 'RESPONSE_LIMIT'); result = JSON.parse(raw); }
        else result = await response.json();
      } catch (error) { if (error.code === 'RESPONSE_LIMIT') throw error; fail('Confluence returned an invalid JSON response.', 'INVALID_RESPONSE'); }
      if (!object(result)) fail('Confluence returned an invalid response.', 'INVALID_RESPONSE');
      return result;
    }
    async function currentUser() { return request(endpoint('/rest/api/user/current')); }
    async function getPage(pageId) {
      pageId = id(pageId); var url = endpoint('/rest/api/content/' + pageId); url.searchParams.set('expand', EXPAND);
      return nativePage(await request(url), pageId);
    }
    function editorUrl(pageId) { var url = endpoint('/pages/editpage.action'); url.searchParams.set('pageId', id(pageId)); return url.href; }
    function pageUrl(pageId) { var url = endpoint('/pages/viewpage.action'); url.searchParams.set('pageId', id(pageId)); return url.href; }
    function nativeCreateUrl() {
      requireWorking();
      if (authoringMode !== 'native-template') fail('Native template authoring has not been enabled.', 'CONFIGURATION');
      var url = endpoint('/pages/createpage-choosetemplate.action');
      url.searchParams.set('spaceKey', workingSpace); url.searchParams.set('newspaceKey', workingSpace); url.searchParams.set('fromPageId', workingRoot);
      return url.href;
    }
    async function prepareNativeCreate() {
      var editor = nativeCreateUrl();
      var observed = await Promise.all([currentUser(), getPage(workingRoot)]), user = observed[0], parent = observed[1];
      if (user.type !== 'known' || typeof user.username !== 'string' || !user.username.trim()) fail('Sign in to Confluence before creating a page.', 'UNAUTHENTICATED');
      if (!object(parent.space) || parent.space.key !== workingSpace || withinTree(parent, publishedRoot)) fail('The authoring parent must be outside the published library and in the configured working space.', 'INVALID_SCOPE');
      // Navigation only. Confluence checks native create permission and offers
      // installed templates; no custom workflow or approval is implied.
      return { editorUrl: editor };
    }
    function pagination(result, start, limit) {
      if (!Array.isArray(result.results) || result.results.length > limit) fail('Confluence returned an invalid result list.', 'INVALID_RESPONSE');
      if (result.start != null && result.start !== start) fail('Confluence returned an unexpected pagination position.', 'INVALID_RESPONSE');
      var total = Number.isSafeInteger(result.totalSize) && result.totalSize >= 0 ? result.totalSize : null;
      var hasNext = result.hasNext === true || !!(result._links && result._links.next) || (total != null && start + result.results.length < total);
      if (hasNext && !result.results.length) fail('Confluence returned a non-advancing result page.', 'INVALID_RESPONSE');
      // Never follow response URLs: a server-controlled next link must not
      // redirect authenticated requests. Advance this same endpoint ourselves.
      return { results: result.results, start: start, limit: limit, size: result.results.length, totalSize: total, hasNext: hasNext, nextStart: hasNext ? start + result.results.length : null };
    }
    async function search(options) {
      options = options || {}; only(options, ['query', 'type', 'area', 'region', 'start', 'limit', 'sort', 'scope', 'saved'], 'search');
      var scope = options.scope || 'published'; if (scope !== 'published' && scope !== 'working') fail('Choose published or working search scope.');
      if (scope === 'working') requireWorking();
      var rootId = scope === 'working' ? workingRoot : publishedRoot, space = scope === 'working' ? workingSpace : publishedSpace;
      var start = number(options.start == null ? 0 : options.start, 0, 1000000, 'search start');
      var limit = number(options.limit == null ? 12 : options.limit, 1, 100, 'search limit');
      var sort = options.sort || 'relevance'; if (['relevance', 'updated', 'title'].indexOf(sort) < 0) fail('This native search supports relevance, updated and title sorting.');
      var clauses = ['type = page', 'space = ' + quote(space), 'ancestor = ' + rootId, 'label = "wcspedia"'];
      var excludedRoot = scope === 'published' ? workingRoot : publishedRoot;
      if (excludedRoot) { clauses.push('id != ' + excludedRoot); clauses.push('ancestor != ' + excludedRoot); }
      // The restricted/public roots and native permissions define visibility.
      // Published labels are not treated as authority or required for reads.
      ['type', 'area', 'region'].forEach(function (key) { if (options[key]) clauses.push('label = ' + quote(label(key, options[key]))); });
      var query = text(options.query == null ? '' : options.query, 500, 'search text', true);
      var tokens = query.split(/\s+/).filter(Boolean); if (tokens.length > 30) fail('Use at most 30 search terms.');
      tokens.forEach(function (token) { var literal = '"' + token.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&') + '"'; clauses.push('text ~ ' + quote(literal)); });
      if (options.saved != null && typeof options.saved !== 'boolean') fail('The saved filter must be true or false.');
      if (options.saved) clauses.push('favourite = currentUser()');
      var cql = clauses.join(' AND ') + (sort === 'updated' ? ' ORDER BY lastmodified DESC' : sort === 'title' ? ' ORDER BY title ASC' : '');
      var url = endpoint('/rest/api/content/search'); url.searchParams.set('cql', cql); url.searchParams.set('start', String(start)); url.searchParams.set('limit', String(limit)); url.searchParams.set('expand', EXPAND);
      var result = pagination(await request(url), start, limit);
      result.results.forEach(function (page) { nativePage(page); if (!scopeMatch(page, rootId, space) || withinTree(page, excludedRoot)) fail('A search result was outside the configured library or overlaps the other library. Check the root configuration.', 'INVALID_SCOPE'); });
      result.cql = cql; return result;
    }
    async function collection(pageId, path, validate) {
      pageId = id(pageId); var start = 0, all = [], seen = new Set();
      for (var count = 0; count < MAX_COLLECTION_PAGES; count++) {
        var url = endpoint('/rest/api/content/' + pageId + path); url.searchParams.set('start', String(start)); url.searchParams.set('limit', '100'); url.searchParams.set('expand', 'version');
        var result = pagination(await request(url), start, 100);
        result.results.forEach(function (item) { var key = validate(item); if (seen.has(key)) fail('Confluence repeated a collection item. Reload before continuing.', 'INVALID_RESPONSE'); seen.add(key); all.push(item); });
        if (!result.hasNext) return all;
        start = result.nextStart;
      }
      fail('The document collection exceeds the supported page limit. No partial snapshot was returned.', 'COLLECTION_LIMIT');
    }
    async function getProperties(pageId) { return collection(pageId, '/property', function (item) { if (!object(item) || typeof item.key !== 'string' || !item.key || !Object.prototype.hasOwnProperty.call(item, 'value')) fail('Invalid page property.', 'INVALID_RESPONSE'); return item.key; }); }
    async function attachments(pageId) { return collection(pageId, '/child/attachment', function (item) { if (!object(item) || item.type !== 'attachment' || !object(item.version)) fail('Invalid native attachment.', 'INVALID_RESPONSE'); number(item.version.number, 1, Number.MAX_SAFE_INTEGER, 'attachment version'); return id(item.id, 'attachment ID'); }); }
    function editResult(page) {
      requireWorking();
      if (!scopeMatch(page, workingRoot, workingSpace) || withinTree(page, publishedRoot)) fail('The editor target must be in the restricted working library only.', 'INVALID_SCOPE');
      if (!operation(page, 'update')) fail('Confluence does not permit editing this working page.', 'FORBIDDEN');
      return { page: page, workingPageId: String(page.id), editorUrl: editorUrl(page.id), snapshot: { pageId: String(page.id), version: page.version.number } };
    }
    async function prepareEdit(pageId) {
      requireWorking(); var page = await getPage(pageId);
      if (scopeMatch(page, workingRoot, workingSpace)) return editResult(page);
      if (!scopeMatch(page, publishedRoot, publishedSpace)) fail('This page is outside the configured WCSpedia library.', 'INVALID_SCOPE');
      requireWorkflow();
      var prepared = await request(workflowURL, { action: 'prepare-edit', pageId: String(page.id), expectedVersion: page.version.number, snapshot: { pageId: String(page.id), version: page.version.number } });
      return editResult(await getPage(id(prepared.workingPageId, 'returned working page ID')));
    }
    async function createWorkingPage(fields) {
      requireWorking(); requireWorkflow(); only(fields, ['title', 'type', 'summary'], 'new document');
      var payload = { title: text(fields.title, 255, 'title'), type: text(fields.type, 80, 'content type'), summary: text(fields.summary == null ? '' : fields.summary, 2000, 'summary', true) };
      label('type', payload.type);
      var result = await request(workflowURL, Object.assign({ action: 'prepare-create' }, payload));
      return editResult(await getPage(id(result.workingPageId, 'returned working page ID')));
    }
    function attachmentSnapshot(items) {
      if (!Array.isArray(items) || items.length > 2000) fail('Invalid attachment snapshot.');
      var seen = new Set(); return items.map(function (item) { only(item, ['id', 'version'], 'attachment snapshot'); var key = id(item.id, 'attachment ID'); if (seen.has(key)) fail('Duplicate attachment snapshot.'); seen.add(key); return { id: key, version: number(item.version, 1, Number.MAX_SAFE_INTEGER, 'attachment version') }; });
    }
    async function submit(action, payload) {
      requireWorkflow(); if (ACTIONS.indexOf(action) < 0) fail('Unsupported native workflow action.');
      only(payload, ['pageId', 'expectedVersion', 'comment', 'expectedMetadataVersion', 'attachmentVersions', 'submissionId', 'governanceReview'], 'workflow');
      var pageId = id(payload.pageId), expectedVersion = number(payload.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'expected page version');
      var command = { action: action, pageId: pageId, expectedVersion: expectedVersion, comment: text(payload.comment, 4000, 'decision comment'), snapshot: { pageId: pageId, version: expectedVersion } };
      var observed = workflowSnapshots.get(pageId);
      if (!observed || observed.version !== expectedVersion || !observed.token) fail('Reload this document to obtain a current workflow snapshot before deciding.', 'WORKFLOW_SNAPSHOT_REQUIRED');
      command.submissionToken = observed.token;
      if (payload.expectedMetadataVersion != null) command.snapshot.metadataVersion = number(payload.expectedMetadataVersion, 1, Number.MAX_SAFE_INTEGER, 'metadata version');
      if (payload.attachmentVersions != null) command.snapshot.attachments = attachmentSnapshot(payload.attachmentVersions);
      if (payload.submissionId != null) command.submissionId = text(payload.submissionId, 120, 'submission ID');
      if (payload.governanceReview != null) {
        if (!object(payload.governanceReview) || JSON.stringify(payload.governanceReview).length > 20000) fail('Invalid governance review.');
        command.governanceReview = JSON.parse(JSON.stringify(payload.governanceReview));
      }
      var page = await getPage(pageId);
      if (!scopeMatch(page, workingRoot, workingSpace) && !scopeMatch(page, publishedRoot, publishedSpace)) fail('This document is outside WCSpedia.', 'INVALID_SCOPE');
      if (page.version.number !== expectedVersion) fail('The native page changed. Reload before submitting this decision.', 'CONFLICT');
      // The server must independently re-read this version, validate metadata /
      // attachments, assignment and entitlements, and bind the authenticated
      // actor. Browser values are preconditions, never proof of authority.
      try {
        var committed = await request(workflowURL, command);
        if (committed.committed !== true || committed.action !== action || String(committed.pageId) !== pageId || typeof committed.eventId !== 'string' || !committed.eventId.trim() || committed.eventId.length > 200) fail('The workflow service did not confirm this exact committed action. Reload the document before retrying.', 'UNCONFIRMED_WRITE');
        if (committed.publishedPageId != null) id(committed.publishedPageId, 'published page ID');
        return committed;
      }
      finally { workflowSnapshots.delete(pageId); }
    }
    async function getWorkflowState(pageId) {
      requireWorkflow(); pageId = id(pageId); workflowSnapshots.delete(pageId); var url = new URL(workflowURL.href); url.searchParams.set('view', 'document'); url.searchParams.set('pageId', pageId);
      var result = await request(url);
      if (result.pageId != null && id(result.pageId) !== pageId) fail('Workflow returned a different document.', 'INVALID_RESPONSE');
      if (!object(result.capabilities)) fail('Workflow capabilities are missing.', 'INVALID_RESPONSE');
      var flags = ['edit', 'submit', 'review', 'complete-review', 'request-changes', 'approve', 'delete'];
      if (Object.keys(result.capabilities).some(function (key) { return flags.indexOf(key) < 0 || typeof result.capabilities[key] !== 'boolean'; })) fail('Invalid workflow capabilities.', 'INVALID_RESPONSE');
      result.capabilities = Object.assign({ edit: false, submit: false, review: false, 'complete-review': false, 'request-changes': false, approve: false, delete: false }, result.capabilities);
      number(result.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'workflow page version');
      if (result.submissionToken != null) text(result.submissionToken, 4096, 'server submission token');
      if (ACTIONS.some(function (action) { return result.capabilities[action]; }) && !result.submissionToken) fail('The workflow service did not supply a decision snapshot.', 'INVALID_RESPONSE');
      workflowSnapshots.set(pageId, { version: result.expectedVersion, token: result.submissionToken || null });
      return result;
    }
    async function workspace(options) {
      requireWorkflow(); requireWorking(); options = options || {}; only(options, ['role', 'start', 'limit', 'query', 'type', 'region', 'sort'], 'workspace');
      if (['mine', 'review'].indexOf(options.role) < 0) fail('Choose your workspace or review workspace.');
      var start = number(options.start == null ? 0 : options.start, 0, 1000000, 'workspace start'), limit = number(options.limit == null ? 12 : options.limit, 1, 100, 'workspace limit');
      var url = new URL(workflowURL.href); url.searchParams.set('view', options.role); url.searchParams.set('start', String(start)); url.searchParams.set('limit', String(limit)); url.searchParams.set('query', text(options.query || '', 500, 'workspace query', true));
      ['type', 'region'].forEach(function (key) { if (options[key]) { label(key, options[key]); url.searchParams.set(key, options[key]); } });
      var sort = options.sort || 'updated'; if (['relevance', 'updated', 'title'].indexOf(sort) < 0) fail('Choose a supported workspace sort.'); url.searchParams.set('sort', sort);
      var result = pagination(await request(url), start, limit), ids = new Set();
      // Actual native REST reads verify that each service result is still
      // accessible to this signed-in user and refresh native operations.
      result.results = await Promise.all(result.results.map(async function (item) {
        if (!object(item)) fail('Invalid workspace document.', 'INVALID_RESPONSE');
        var pageId = id(item.id); if (ids.has(pageId)) fail('Duplicate workspace document.', 'INVALID_RESPONSE'); ids.add(pageId);
        var page = await getPage(pageId);
        if (!scopeMatch(page, workingRoot, workingSpace) || withinTree(page, publishedRoot)) fail('Workspace returned a document outside the working library or inside the published library.', 'INVALID_SCOPE');
        if (item.workflow != null) { if (!object(item.workflow)) fail('Invalid workflow projection.', 'INVALID_RESPONSE'); page.workflow = item.workflow; }
        return page;
      }));
      return result;
    }
    return { currentUser: currentUser, getPage: getPage, search: search, getProperties: getProperties, attachments: attachments, editorUrl: editorUrl, pageUrl: pageUrl, nativeCreateUrl: nativeCreateUrl, prepareNativeCreate: prepareNativeCreate, prepareEdit: prepareEdit, createWorkingPage: createWorkingPage, submit: submit, getWorkflowState: getWorkflowState, workspace: workspace };
  }
  return { create: create };
});

;

/* Source: native-content.js */
/* WCSpedia native-page view adapter. Native Confluence bodies remain authoritative. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.WCSNativeContent = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var ALLOWED = new Set('a p br hr h1 h2 h3 h4 h5 h6 strong b em i u s del ins sub sup code pre blockquote ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td div span section article figure figcaption img details summary video audio source time kbd samp'.split(' '));
  var DROP = new Set('script style noscript template form input button select textarea option optgroup nav header footer svg math object embed base link meta canvas'.split(' '));
  var WIDGETS = '[data-wcs-native-document-controls], [data-wcs-native-create-widget], #wcs-native-document-controls, #wcs-native-create-widget, .wcs-native-document-controls, .wcs-native-create, .wcs-ui-layer';
  var TYPES = { 'job-aid': 'Job aid', 'job-aids': 'Job aid', 'knowledge-sharing': 'Knowledge sharing', 'reference': 'Reference', 'training': 'Training', 'blog': 'Blog', 'report': 'Report', 'guide': 'Guide', 'checklist': 'Checklist', 'playbook': 'Playbook', 'faq': 'FAQ', 'template': 'Template' };
  function clean(value) { return value == null ? '' : String(value).replace(/\s+/g, ' ').trim(); }
  function list(value) { return (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : []).map(clean).filter(Boolean).filter(function (item, index, values) { return values.indexOf(item) === index; }); }
  function parse(html) {
    if (typeof root.DOMParser !== 'function') throw new Error('A browser DOMParser is required to process native Confluence content.');
    return new root.DOMParser().parseFromString(String(html || ''), 'text/html');
  }
  function baseAddress(baseUrl) {
    var result;
    try { result = new URL(baseUrl || (root.location && root.location.href) || 'https://confluence.invalid/'); } catch (_) { throw new Error('A valid Confluence page URL is required.'); }
    if (!/^https?:$/.test(result.protocol) || result.username || result.password) throw new Error('A valid Confluence page URL is required.');
    return result;
  }
  function safeUrl(value, base, kind, options) {
    value = String(value || '').trim();
    if (!value || /[\u0000-\u0020\u007f\\]/.test(value) || value.slice(0, 2) === '//') return '';
    if (kind === 'link' && value.charAt(0) === '#') return '#wcs-native-' + value.slice(1).replace(/[^A-Za-z0-9_.:-]/g, '-');
    var url; try { url = new URL(value, base); } catch (_) { return ''; }
    if (url.username || url.password) return '';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === base.origin)) return '';
    if (kind === 'image' || kind === 'media') {
      var configured = options[kind === 'image' ? 'imageOrigins' : 'mediaOrigins'] || [];
      if (url.origin !== base.origin && configured.indexOf(url.origin) < 0) return '';
    }
    return url.href;
  }
  function sourceHtml(page) {
    return page && page.body && (page.body.view && page.body.view.value || page.body.export_view && page.body.export_view.value) || '';
  }
  function note(doc, message) { var p = doc.createElement('p'); p.setAttribute('data-wcs-omitted', 'true'); p.textContent = message; return p; }
  function sanitizeView(html, baseUrl, options) {
    options = options || {}; var base = baseAddress(baseUrl), input = parse(html), output = parse('');
    function copy(node, parent) {
      if (node.nodeType === 3) { parent.appendChild(output.createTextNode(node.nodeValue)); return; }
      if (node.nodeType !== 1) return;
      var tag = node.localName.toLowerCase(), macro = node.getAttribute('data-macro-name') || '';
      if (node.matches(WIDGETS) || DROP.has(tag) || node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden') || /^(toc|children|pagetree|contentbylabel|recently-updated)$/.test(macro)) return;
      if (tag === 'iframe') {
        var src = safeUrl(node.getAttribute('src'), base, 'link', options), address;
        try { address = new URL(src); } catch (_) { address = null; }
        var hostAllowed = address && (/(^|\.)sharepoint\.com$/i.test(address.hostname) || (options.sharePointOrigins || []).indexOf(address.origin) >= 0);
        if (hostAllowed) { var p = output.createElement('p'), a = output.createElement('a'); a.href = src; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = clean(node.getAttribute('title')) || 'Open recording in SharePoint'; p.setAttribute('data-wcs-omitted', 'true'); p.appendChild(a); parent.appendChild(p); }
        else parent.appendChild(note(output, 'Embedded content is available on the native Confluence page.'));
        return;
      }
      if (tag.indexOf(':') >= 0) { parent.appendChild(note(output, 'This Confluence macro is available on the native page.')); return; }
      if (!ALLOWED.has(tag)) { Array.from(node.childNodes).forEach(function (child) { copy(child, parent); }); return; }
      if (tag === 'img') {
        var imageSrc = safeUrl(node.getAttribute('src'), base, 'image', options);
        if (!imageSrc) { parent.appendChild(note(output, 'Image omitted' + (clean(node.getAttribute('alt')) ? ': ' + clean(node.getAttribute('alt')) : '.') )); return; }
      }
      var el = output.createElement(tag);
      ['title', 'lang', 'dir'].forEach(function (name) { var val = node.getAttribute(name); if (val && (name !== 'dir' || /^(ltr|rtl|auto)$/.test(val))) el.setAttribute(name, val); });
      if (node.id) el.id = 'wcs-native-' + node.id.replace(/[^A-Za-z0-9_.:-]/g, '-');
      if (tag === 'a') {
        var href = safeUrl(node.getAttribute('href'), base, 'link', options);
        if (href) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); if (href.charAt(0) !== '#' && new URL(href).origin !== base.origin) el.setAttribute('target', '_blank'); }
      }
      if (tag === 'img') { el.setAttribute('src', imageSrc); el.setAttribute('alt', node.getAttribute('alt') || ''); el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); }
      if (tag === 'video' || tag === 'audio' || tag === 'source') {
        var mediaSrc = safeUrl(node.getAttribute('src'), base, 'media', options);
        if (mediaSrc) el.setAttribute('src', mediaSrc);
        if (tag !== 'source') { el.setAttribute('controls', ''); el.setAttribute('preload', 'none'); }
        else if (/^(video|audio)\/[a-z0-9.+-]+$/i.test(node.getAttribute('type') || '')) el.setAttribute('type', node.getAttribute('type'));
      }
      if (tag === 'th' && /^(row|col|rowgroup|colgroup)$/.test(node.getAttribute('scope') || '')) el.setAttribute('scope', node.getAttribute('scope'));
      ['colspan', 'rowspan', 'width', 'height', 'start'].forEach(function (name) {
        if ((/^(td|th)$/.test(tag) && /span$/.test(name)) || (/^(img|col)$/.test(tag) && /^(width|height)$/.test(name)) || (tag === 'ol' && name === 'start')) {
          var val = node.getAttribute(name); if (/^\d{1,4}$/.test(val || '') && Number(val) > 0) el.setAttribute(name, val);
        }
      });
      if (tag === 'time' && /^\d{4}-\d{2}-\d{2}(T[0-9:.+-]+Z?)?$/.test(node.getAttribute('datetime') || '')) el.setAttribute('datetime', node.getAttribute('datetime'));
      Array.from(node.childNodes).forEach(function (child) { copy(child, el); }); parent.appendChild(el);
    }
    Array.from(input.body.childNodes).forEach(function (node) { copy(node, output.body); });
    return output.body.innerHTML;
  }
  function tableMetadata(html) {
    if (!html) return {};
    var doc = parse(html), found = {};
    Array.from(doc.querySelectorAll('table')).some(function (table) {
      var values = {};
      Array.from(table.rows).forEach(function (row) {
        var cells = Array.from(row.cells); if (cells.length !== 2) return;
        var key = clean(cells[0].textContent).toLowerCase().replace(/[:\s]+$/g, '');
        values[key] = clean(cells[1].textContent);
      });
      if (!('document key' in values) && !('content type' in values && 'document owner' in values)) return false;
      found = {
        docKey: values['document key'], type: values['content type'], owner: { name: values['document owner'], soeid: values['owner soeid'] },
        team: values['owning team'], summary: values['scope and audience'], regions: values['regions covered'], processes: values.processes,
        topics: values.topics, nextReviewDate: values['next review due date'] || values['next review due'], reviewBasis: values['review basis'], supportingTeam: values['supporting team']
      }; return true;
    });
    return found;
  }
  function metadataProperty(page, properties) {
    if (properties && Array.isArray(properties.results)) properties = properties.results;
    var match = Array.isArray(properties) ? properties.find(function (p) { return p.key === 'wcs.metadata'; }) : properties && properties['wcs.metadata'];
    if (!match && page.metadata && page.metadata.properties) match = page.metadata.properties['wcs.metadata'];
    var value = match && (Object.prototype.hasOwnProperty.call(match, 'value') ? match.value : match);
    // A property is only a projection of its exact native page version.
    // A stale/unversioned property must not override the current page table.
    return value && typeof value === 'object' && !Array.isArray(value) && page.version && Number.isInteger(value.sourcePageVersion) && value.sourcePageVersion === page.version.number ? value : {};
  }
  function plainText(html) {
    var doc = parse(html);
    doc.querySelectorAll('script,style,nav,header,footer,[aria-hidden="true"],[hidden],[data-wcs-omitted], ' + WIDGETS).forEach(function (node) { node.remove(); });
    doc.querySelectorAll('p,div,section,article,li,td,th,h1,h2,h3,h4,h5,h6,br').forEach(function (node) { node.appendChild(doc.createTextNode(' ')); });
    return clean(doc.body.textContent);
  }
  function readingMinutes(html, options) {
    options = options || {}; var words = plainText(html).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    var wpm = Number(options.wordsPerMinute); if (!Number.isFinite(wpm) || wpm < 100 || wpm > 1000) wpm = 200;
    return words.length ? Math.max(1, Math.ceil(words.length / wpm)) : 0;
  }
  function normalizePage(page, properties, options) {
    page = page || {}; options = options || {}; var html = sourceHtml(page), table = tableMetadata(html), metadata = metadataProperty(page, properties);
    var rawLabels = page.metadata && page.metadata.labels && page.metadata.labels.results || page.labels || [];
    if (!Array.isArray(rawLabels)) rawLabels = Array.isArray(rawLabels.results) ? rawLabels.results : [];
    var labels = list(rawLabels.map(function (label) { return typeof label === 'string' ? label : label && label.name; }));
    function choose(key, fallback) { return Object.prototype.hasOwnProperty.call(metadata, key) ? metadata[key] : Object.prototype.hasOwnProperty.call(table, key) && table[key] != null ? table[key] : fallback; }
    function labelValue(prefix) { return labels.filter(function (label) { return label.indexOf(prefix) === 0; }).map(function (label) { return label.slice(prefix.length); }); }
    var typeLabel = labelValue('wcs-type-')[0], owner = choose('owner', {}), version = page.version || {};
    var base = options.baseUrl || page._links && page._links.base || (root.location && root.location.href) || 'https://confluence.invalid/';
    if (page._links && page._links.webui) {
      var address = baseAddress(base), webui = String(page._links.webui), context = address.pathname.replace(/\/$/, '');
      if (page._links.base && webui.charAt(0) === '/' && context && webui.indexOf(context + '/') !== 0) webui = context + webui;
      base = safeUrl(webui, address, 'link', options) || address.href;
    }
    var excerpt = html && parse(html).querySelector('.excerpt, .excerpt-macro, [data-macro-name="excerpt"]');
    var sanitized = html ? sanitizeView(html, base, options) : '', updatedBy = version.by || {};
    return {
      id: clean(page.id), pageId: clean(page.id), documentKey: clean(choose('docKey', choose('documentKey', ''))), title: clean(page.title),
      summary: clean(choose('summary', excerpt ? excerpt.textContent : '')), version: Number.isInteger(version.number) ? version.number : null,
      updated: clean(version.when), updatedBy: { name: clean(updatedBy.displayName), username: clean(updatedBy.username), userKey: clean(updatedBy.userKey) },
      type: clean(choose('type', TYPES[typeLabel] || typeLabel || 'Document')), area: clean(choose('area', labelValue('wcs-area-')[0] || '')),
      labels: labels, owner: { name: clean(owner && owner.name), soeid: clean(owner && owner.soeid).toUpperCase() }, team: clean(choose('team', '')),
      regions: list(choose('regions', labelValue('wcs-region-'))), processes: list(choose('processes', [])), topics: list(choose('topics', [])),
      nextReviewDate: clean(choose('nextReviewDate', '')), reviewBasis: clean(choose('reviewBasis', '')), supportingTeam: clean(choose('supportingTeam', '')),
      nativeBodyHtml: sanitized, readingMinutes: sanitized ? readingMinutes(sanitized, options) : null,
      metadataSource: Object.keys(metadata).length ? 'content-property' : Object.keys(table).length ? 'page-properties-table' : 'labels',
      metadataNotice: 'Page Properties tables and REST content properties are separate metadata sources. A REST projection is used only when its sourcePageVersion matches the native revision. Neither establishes approval.'
    };
  }
  function exportMarkdown(page, properties, options) {
    options = options || {}; var normalized = normalizePage(page, properties, options), doc = parse(normalized.nativeBodyHtml), omitted = false;
    function escapeText(text) { return String(text || '').replace(/\\/g, '\\\\').replace(/([`*_\[\]<>])/g, '\\$1'); }
    function children(node) { return Array.from(node.childNodes).map(render).join(''); }
    function render(node) {
      if (node.nodeType === 3) return escapeText(node.nodeValue);
      if (node.nodeType !== 1) return '';
      var tag = node.localName, value;
      if (node.hasAttribute('data-wcs-omitted')) omitted = true;
      if (tag === 'table') {
        var rows = Array.from(node.rows).map(function (row) { return Array.from(row.cells).map(function (cell) { if (cell.colSpan > 1 || cell.rowSpan > 1) omitted = true; return children(cell).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); }); });
        if (!rows.length) return '';
        var width = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
        var lines = rows.map(function (row) { while (row.length < width) row.push(''); return '| ' + row.join(' | ') + ' |'; });
        lines.splice(1, 0, '| ' + Array(width).fill('---').join(' | ') + ' |'); return '\n\n' + lines.join('\n') + '\n\n';
      }
      if (tag === 'pre') { var raw = node.textContent, fence = '`'.repeat(Math.max(3, (raw.match(/`+/g) || []).reduce(function (longest, run) { return Math.max(longest, run.length + 1); }, 3))); return '\n\n' + fence + '\n' + raw + '\n' + fence + '\n\n'; }
      if (tag === 'code') { var code = node.textContent, marker = '`'.repeat(Math.max(1, (code.match(/`+/g) || []).reduce(function (longest, run) { return Math.max(longest, run.length + 1); }, 1))); return marker + ' ' + code + ' ' + marker; }
      value = children(node);
      if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag.slice(1))) + ' ' + value.trim() + '\n\n';
      if (tag === 'strong' || tag === 'b') return '**' + value + '**';
      if (tag === 'em' || tag === 'i') return '*' + value + '*';
      if (tag === 's' || tag === 'del') return '~~' + value + '~~';
      if (tag === 'a' && node.getAttribute('href')) return '[' + value + '](' + node.getAttribute('href').replace(/[()]/g, function (c) { return encodeURIComponent(c).replace('(', '%28').replace(')', '%29'); }) + ')';
      if (tag === 'img') return '![' + escapeText(node.getAttribute('alt')) + '](' + node.getAttribute('src').replace(/\(/g, '%28').replace(/\)/g, '%29') + ')';
      if (tag === 'br') return '  \n'; if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'blockquote') return '\n\n' + value.trim().split('\n').map(function (line) { return '> ' + line; }).join('\n') + '\n\n';
      if (tag === 'li') { var prefix = node.parentNode.localName === 'ol' ? (Array.from(node.parentNode.children).indexOf(node) + Number(node.parentNode.getAttribute('start') || 1)) + '. ' : '- '; return '\n' + prefix + value.trim().replace(/\n/g, '\n  '); }
      if (tag === 'video' || tag === 'audio') { omitted = true; return '\n\n' + (node.getAttribute('src') ? '[Open media](' + node.getAttribute('src') + ')' : value) + '\n\n'; }
      if (tag === 'source') return node.getAttribute('src') ? '[Open media](' + node.getAttribute('src') + ')' : '';
      if (/^(p|div|section|article|figure|figcaption|details|summary|ul|ol|dl)$/.test(tag)) return '\n\n' + value.trim() + '\n\n';
      return value;
    }
    var body = children(doc.body).replace(/\n{3,}/g, '\n\n').trim();
    var result = '# ' + escapeText(normalized.title || 'Untitled document') + '\n\n' + body;
    result += '\n\n---\n\nExported from native Confluence page ' + normalized.id + (normalized.version == null ? '' : ', version ' + normalized.version) + '. This Markdown file is a derived copy; the native page is the source of truth.';
    result += '\n\nConfluence macros and interactive content may not be represented in Markdown. Open the native page for the complete document.';
    if (omitted) result += ' Some embedded content or table layout was simplified in this export.';
    return result.trim() + '\n';
  }
  return { normalizePage: normalizePage, sanitizeView: sanitizeView, exportMarkdown: exportMarkdown, readingMinutes: readingMinutes };
}));

;

/* Source: native-app.js */
/* Native-page WCSpedia. Confluence owns article bodies and editing.
 * HTML macros mount this presentation layer; workflow writes stay server-side.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WCSNativeApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const TYPES = ['Job aid', 'Guide', 'Checklist', 'Training', 'Blog', 'Knowledge sharing', 'Reference', 'Report', 'FAQ', 'Template', 'Playbook'];
  const LABELS = {'submit':'Submit for review','complete-review':'Complete review','request-changes':'Request changes','approve':'Approve publication','delete':'Delete document'};
  const mounted = new WeakMap();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'Not recorded';
  function client(config) { return root.WCSNativeConfluence.create(config); }
  function uiHost() {
    let host = root.document.getElementById('wcspedia');
    if (!host) { host = root.document.createElement('div'); host.id = 'wcspedia'; host.className = 'wcs-native-tools'; root.document.body.append(host); }
    return host;
  }
  function errorBox(error) { return '<div class="wcs-native-notice" role="alert"><strong>'+esc(error.code === 'FORBIDDEN' ? 'Not permitted' : 'Unable to complete this request')+'</strong><p>'+esc(error.message || 'Please try again.')+'</p></div>'; }
  function pageId(element, config) {
    const value = element.dataset.pageId || config.currentPageId || root.AJS?.Meta?.get('page-id') || root.document.querySelector('meta[name="ajs-page-id"]')?.content;
    if (!/^[1-9]\d*$/.test(String(value || ''))) throw Error('The current Confluence page ID is unavailable. Set data-page-id on the document controls macro.');
    return String(value);
  }
  function enhance(element) { root.WCSUI?.enhance(element); }
  function status(element, message, error) { element.innerHTML = error ? errorBox(error) : '<p class="wcs-native-notice" role="status">'+esc(message)+'</p>'; }
  function navigate(url) { root.location.assign(url); }
  function options(items, selected, all) { return '<option value="">'+esc(all)+'</option>'+items.map(item=>'<option value="'+esc(slug(item))+'"'+(slug(item)===selected?' selected':'')+'>'+esc(item)+'</option>').join(''); }
  function searchMarkup(params) {
    return '<form class="wcs-native-search" novalidate><div class="wcs-native-search-row"><label class="sr-only" for="wcs-native-query">Search documents</label><input id="wcs-native-query" name="q" type="search" maxlength="200" placeholder="Search job aids, training, and shared knowledge" value="'+esc(params.get('q'))+'"><button class="button" type="submit">Search <span aria-hidden="true">→</span></button></div><div class="wcs-native-filters"><label>Content type<select name="type">'+options(TYPES,params.get('type'),'All content types')+'</select></label><label>Region<select name="region">'+options(['Global','NAM','EMEA','APAC','LATAM'],params.get('region'),'All regions')+'</select></label><label>Sort by<select name="sort"><option value="updated"'+(params.get('sort')==='updated'?' selected':'')+'>Recently updated</option><option value="title"'+(params.get('sort')==='title'?' selected':'')+'>Title A–Z</option><option value="relevance"'+(params.get('sort')==='relevance'?' selected':'')+'>Relevance</option></select></label><button class="button secondary compact" type="button" data-native-reset>Reset</button></div></form>';
  }
  function href(params, start) { const next = new URLSearchParams(params); next.set('start',String(start)); return '#/results?'+next.toString(); }
  function pager(result, params) {
    const start = result.start || 0, limit = result.limit || 12, count = result.totalSize;
    if (Number.isSafeInteger(count) && count >= 0 && root.WCSPagination) return root.WCSPagination.render({totalPages:Math.ceil(count/limit),currentPage:Math.floor(start/limit)+1,href:page=>href(params,(page-1)*limit)});
    if (!start && !result.hasNext) return '';
    return '<nav class="wcs-native-pager" aria-label="Pagination">'+(start?'<a class="button secondary" href="'+esc(href(params,Math.max(0,start-limit)))+'">← Previous</a>':'<span></span>')+'<span>Page '+(Math.floor(start/limit)+1)+'</span>'+(result.hasNext?'<a class="button secondary" href="'+esc(href(params,result.nextStart ?? start+limit))+'">Next →</a>':'<span></span>')+'</nav>';
  }
  function cards(result, api) {
    if (!result.results.length) return '<div class="empty"><h2>No documents found</h2><p>Try another phrase or remove a filter.</p></div>';
    return '<div class="wcs-native-grid">'+result.results.map(raw=>{
      const page = raw.content || raw, item = root.WCSNativeContent.normalizePage(page);
      return '<article class="wcs-native-card"><div class="wcs-native-tags"><span class="eyebrow">'+esc(item.type || 'Document')+'</span>'+(item.regions || []).map(region=>'<span class="wcs-native-tag">'+esc(region)+'</span>').join('')+'</div><h2><a href="'+esc(api.pageUrl(page.id))+'">'+esc(item.title)+' <span aria-hidden="true">↗</span></a></h2>'+(item.summary?'<p>'+esc(item.summary)+'</p>':'')+'<div class="wcs-native-card-meta"><span>Updated '+esc(date(item.updated))+'</span><span>Version '+esc(item.version || '—')+'</span></div></article>';
    }).join('')+'</div>';
  }
  function workspaceTable(result, api) {
    const table = root.WCSDataTable;
    return table.render({label:'Native document workspace',columns:[{label:'Document'},{label:'Confluence version'},{label:'Last updated'},{label:'Action',actions:true}],rows:result.results.map(raw=>{
      const page = raw.content || raw;
      return {id:page.id,cells:[page.title,page.version?.number || '—',date(page.version?.when),table.html('<a class="button secondary compact" href="'+esc(api.pageUrl(page.id))+'">Open document ↗</a>')]};
    }),empty:{title:'Your queue is clear',description:'No documents match this workspace and search.'}});
  }
  function mount(element, config) {
    if (mounted.has(element)) return mounted.get(element);
    config = config || root.WCS_NATIVE_CONFIG || {};
    element.id = element.id || 'wcspedia'; element.classList.add('wcs-native');
    let generation=0, disposed=false;
    const role=config.pageRole || 'home';
    let api;
    try { api=client(config); } catch(error) { status(element,'',error); return {destroy(){}}; }
    async function render() {
      const request=++generation, params=new URLSearchParams(root.location.hash.split('?')[1] || ''), start=Number(params.get('start') || 0);
      const isWorkspace=role==='mine'||role==='review', isHome=role==='home'&&!root.location.hash.startsWith('#/results');
      const title=role==='mine'?'My workspace':role==='review'?'Reviewer workspace':role==='saved'?'Saved items':isHome?'A world of knowledge.<br>One place to find it.':'Explore our knowledge';
      const description=role==='saved'?'Your Confluence Save for later pages, together in one place.':isWorkspace?'Your assigned documents, with version-specific review and approval.':'Practical guidance. Shared experience. Knowledge that moves us forward.';
      root.WCSUI?.destroy(element);
      element.innerHTML='<div class="shell"><section class="wcs-native-hero"><p class="eyebrow">Wealth Credit Services · WCSpedia</p><h1>'+title+'</h1><p>'+description+'</p></section><div class="wcs-native-container">'+searchMarkup(params)+(isHome?'<nav class="wcs-native-types" aria-label="Browse by content type">'+TYPES.slice(0,7).map(type=>'<a href="#/results?type='+slug(type)+'">'+esc(type)+' <span aria-hidden="true">→</span></a>').join('')+'</nav>':'')+'<div class="wcs-native-results" aria-live="polite"><p role="status">Loading Confluence pages…</p></div></div></div>';
      enhance(element);
      element.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const values=new URLSearchParams(new root.FormData(event.currentTarget));values.delete('start');const hash='#/results?'+values.toString();if(root.location.hash===hash)render();else root.location.hash=hash;});
      element.querySelector('[data-native-reset]').onclick=()=>{if(root.location.hash==='#/results')render();else root.location.hash='/results';};
      try {
        const args={query:params.get('q')||'',type:params.get('type')||'',region:params.get('region')||'',sort:params.get('sort')||'updated',start:Number.isSafeInteger(start)&&start>=0?start:0,limit:12};
        const result=isWorkspace?await api.workspace({...args,role}):await api.search({...args,saved:role==='saved'});
        if(disposed||request!==generation)return;
        const target=element.querySelector('.wcs-native-results');
        target.innerHTML=(isWorkspace?workspaceTable(result,api):cards(result,api))+pager(result,params);
      } catch(error) { if(!disposed&&request===generation)status(element.querySelector('.wcs-native-results'),'',error); }
    }
    const listener=()=>render();root.addEventListener('hashchange',listener);
    const handle={ready:render(),refresh:render,destroy(){disposed=true;generation++;root.removeEventListener('hashchange',listener);root.WCSUI?.destroy(element);mounted.delete(element);}};
    mounted.set(element,handle);return handle;
  }
  function mountCreateWidget(element, config) {
    if(mounted.has(element))return mounted.get(element);
    config=config||root.WCS_NATIVE_CONFIG||{};uiHost();
    element.classList.add('wcs-native-create');
    element.innerHTML='<button type="button" class="wcs-native-create-button">Add document <span aria-hidden="true">+</span></button>';
    let api;try{api=client(config);}catch(error){status(element,'',error);return {destroy(){}};}
    const button=element.querySelector('button');
    // Creation authority is checked by prepare-create on the server. A visible
    // launcher is not a permission grant and does not write anything on mount.
    button.onclick=async()=>{
      if(config.authoringMode==='native-template'){
        button.disabled=true;
        try{const result=await api.prepareNativeCreate();navigate(result.editorUrl);}
        catch(error){root.WCSUI.dialog({title:'Create in Confluence',body:errorBox(error)});button.disabled=false;}
        return;
      }
      const dialog=root.WCSUI.dialog({title:'Create a document',description:'Choose a starting point. Your document opens in the Confluence editor.',body:'<form class="wcs-native-form" novalidate><div data-native-error role="alert"></div><label>Title<input name="title" maxlength="255" autofocus></label><label>Content type<select name="type">'+TYPES.map(type=>'<option value="'+slug(type)+'">'+esc(type)+'</option>').join('')+'</select></label><label>Summary<textarea name="summary" rows="3" maxlength="2000"></textarea></label><p class="quiet-note">Confluence owns the page and its version history. The page link is generated automatically.</p><div class="wcs-native-actions"><button class="button secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Continue to Confluence →</button></div></form>'});
      const form=dialog.body.querySelector('form');form.querySelector('[data-cancel]').onclick=()=>dialog.close();
      form.onsubmit=async event=>{event.preventDefault();if(dialog.busy)return;const values=new root.FormData(form),title=String(values.get('title')||'').trim();const message=form.querySelector('[data-native-error]');if(!title){message.textContent='Enter a document title.';form.elements.title.focus();return;}
        dialog.setBusy(true);form.querySelector('[type=submit]').disabled=true;form.querySelector('[data-cancel]').disabled=true;
        try{const result=await api.createWorkingPage({title,type:String(values.get('type')),summary:String(values.get('summary')||'').trim()});navigate(result.editorUrl);}
        catch(error){message.innerHTML=errorBox(error);dialog.setBusy(false);form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-cancel]').disabled=false;}
      };
    };
    const handle={destroy(){button.onclick=null;mounted.delete(element);}};mounted.set(element,handle);return handle;
  }
  function downloadText(name,text){const blob=new root.Blob([text],{type:'text/markdown;charset=utf-8'}),url=root.URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.append(a);a.click();a.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);}
  function mountDocumentControls(element,config){
    if(mounted.has(element))return mounted.get(element);
    config=config||root.WCS_NATIVE_CONFIG||{};uiHost();element.classList.add('wcs-native-document-controls');
    let disposed=false,api,id,page,properties=[],workflow=null;
    try{api=client(config);id=pageId(element,config);}catch(error){status(element,'',error);return {destroy(){}};}
    async function refresh(){
      status(element,'Loading document controls…');
      try{
        const results=await Promise.allSettled([api.getPage(id),api.getProperties(id),api.getWorkflowState(id)]);
        if(disposed)return;
        if(results[0].status==='rejected')throw results[0].reason;
        page=results[0].value;properties=results[1].status==='fulfilled'?results[1].value:[];workflow=results[2].status==='fulfilled'?results[2].value:null;
        if(workflow&&workflow.expectedVersion!==page.version.number)workflow=null;
        const item=root.WCSNativeContent.normalizePage(page,properties),caps=workflow?.capabilities||{};
        const inWorking=(page.ancestors||[]).some(ancestor=>String(ancestor.id)===String(config.workingRootPageId));
        const canEdit=(page.operations||[]).some(op=>op.operation==='update'&&op.targetType==='page')&&inWorking;
        const ctx=(config.contextPath ?? '/confluence').replace(/\/$/,'');
        element.innerHTML='<section class="wcs-native-control-card"><div class="wcs-native-control-heading"><div><p class="eyebrow">Document control</p><h2>'+esc(item.title)+'</h2></div><span class="wcs-native-tag">'+esc(workflow?.status || (inWorking?'Working page':'Confluence page'))+'</span></div><dl class="wcs-native-facts"><div><dt>Owner</dt><dd>'+esc(typeof item.owner==='object'?item.owner.name||item.owner.soeid:item.owner||'Not recorded')+'</dd></div><div><dt>Team</dt><dd>'+esc(item.team||'Not recorded')+'</dd></div><div><dt>Updated</dt><dd>'+esc(date(item.updated))+'</dd></div><div><dt>Native version</dt><dd>'+esc(item.version)+'</dd></div><div><dt>Next review</dt><dd>'+esc(date(item.nextReviewDate))+'</dd></div></dl><div class="wcs-native-actions">'+(canEdit||caps.edit===true?'<button class="button" data-native-action="edit">Edit in Confluence ↗</button>':'')+Object.keys(LABELS).filter(action=>caps[action]===true).map(action=>'<button class="button '+(action==='delete'?'danger':'secondary')+'" data-native-action="'+action+'">'+LABELS[action]+'</button>').join('')+'<button class="button secondary" data-native-action="download">Download ↓</button><button class="button secondary" data-native-action="copy">Copy Markdown</button><a class="button secondary" href="'+esc(ctx+'/pages/viewpreviousversions.action?pageId='+id)+'">Version history ↗</a></div><div data-native-feedback aria-live="polite"></div>'+(results[1].status==='rejected'?'<p class="quiet-note">Structured metadata could not be loaded. Values shown come from the page body where available.</p>':'')+(!workflow?'<p class="quiet-note">Review and approval controls become available when the workflow connection is configured. Native page history remains available.</p>':'')+'</section>';
        element.querySelectorAll('[data-native-action]').forEach(button=>button.onclick=()=>action(button));
      }catch(error){if(!disposed)status(element,'',error);}
    }
    async function action(button){
      const name=button.dataset.nativeAction,feedback=element.querySelector('[data-native-feedback]');
      try{
        if(name==='edit'){button.disabled=true;const result=await api.prepareEdit(id);navigate(result.editorUrl);return;}
        if(name==='copy'){if(!root.navigator.clipboard?.writeText)throw Error('Clipboard access is unavailable. Download Markdown instead.');await root.navigator.clipboard.writeText(root.WCSNativeContent.exportMarkdown(page,properties));feedback.textContent='Markdown copied.';return;}
        if(name==='download'){
          const ctx=(config.contextPath ?? '/confluence').replace(/\/$/,'');
          const popup=root.WCSUI.popover({anchor:button,label:'Download document',body:'<div class="wcs-native-download"><a href="'+esc(ctx+'/spaces/flyingpdf/pdfpageexport.action?pageId='+id)+'">PDF document ↗</a><a href="'+esc(ctx+'/exportword?pageId='+id)+'">Word document ↗</a><button type="button" data-markdown>Markdown file</button></div>'});
          popup.element.querySelector('[data-markdown]').onclick=()=>{downloadText((slug(page.title)||'document')+'.md',root.WCSNativeContent.exportMarkdown(page,properties));popup.close();};return;
        }
        const expectedVersion=page.version.number;
        const dialog=root.WCSUI.dialog({title:LABELS[name],description:'This decision applies to Confluence version '+expectedVersion+'. The server verifies your entitlement and the submitted evidence.',body:'<form class="wcs-native-form" novalidate><div data-native-error role="alert"></div><label>Reason or review notes<textarea name="comment" rows="4" maxlength="4000" autofocus></textarea></label>'+(name==='delete'?'<p>Deletion follows the configured server workflow and Confluence permissions. Confirm the document title before continuing.</p><label>Document title<input name="confirmation" autocomplete="off"></label>':'')+'<div class="wcs-native-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="submit" class="button '+(name==='delete'?'danger':'')+'">'+LABELS[name]+'</button></div></form>'});
        const form=dialog.body.querySelector('form');form.querySelector('[data-cancel]').onclick=()=>dialog.close();
        form.onsubmit=async event=>{
          event.preventDefault();if(dialog.busy)return;const values=new root.FormData(form),comment=String(values.get('comment')||'').trim(),message=form.querySelector('[data-native-error]');
          if(!comment){message.textContent='Enter a reason for the audit record.';return;}
          if(name==='delete'&&values.get('confirmation')!==page.title){message.textContent='Enter the exact document title.';return;}
          dialog.setBusy(true);form.querySelector('[type=submit]').disabled=true;form.querySelector('[data-cancel]').disabled=true;
          try{
            await api.submit(name,{pageId:id,expectedVersion,comment});dialog.setBusy(false);dialog.close();
            if(name==='delete'){status(element,'The workflow service confirmed deletion.');return;}
            await refresh();
          }catch(error){message.innerHTML=errorBox(error);dialog.setBusy(false);form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-cancel]').disabled=false;}
        };
      }catch(error){feedback.innerHTML=errorBox(error);}finally{if(button.isConnected)button.disabled=false;}
    }
    const handle={ready:refresh(),refresh,destroy(){disposed=true;mounted.delete(element);}};mounted.set(element,handle);return handle;
  }
  return Object.freeze({mount,mountCreateWidget,mountDocumentControls,types:TYPES,slug,pageId,pager});
});

;
})();
