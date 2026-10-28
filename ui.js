/* Shared Citi-styled controls. Native fields remain the source of form values. */
(function (global) {
  'use strict';
  const doc = global.document;
  if (!doc) return;
  let sequence = 0, activePopover = null, cleanupScheduled = false;
  const dialogs = [], enhanced = new Map(), inertState = new Map();
  const isolatedHosts = new WeakSet();
  const busyButtons = new WeakMap();
  const busyScope='#wcspedia,.wcs-add-document,.wcs-article-discussion,.wcs-article-engagement,[data-wcs-article-discussion-host]';
  function syncBusyIndicator(button) {
    if (!button?.matches?.('button')) return;
    const existing=button.querySelector(':scope > .wcs-button-spinner');
    if (button.getAttribute('aria-busy')==='true') {
      button.setAttribute('data-wcs-busy-indicator','');
      if(!existing){const spinner=doc.createElement('span');spinner.className='wcs-button-spinner';spinner.setAttribute('aria-hidden','true');button.append(spinner);}
    } else {
      existing?.remove();button.removeAttribute('data-wcs-busy-indicator');
    }
  }
  function buttonBusy(button, value) {
    if (!button) return;
    if (value) {
      if (!busyButtons.has(button)) busyButtons.set(button, {disabled:button.disabled, aria:button.getAttribute('aria-busy')});
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      syncBusyIndicator(button);
    } else if (busyButtons.has(button)) {
      const previous = busyButtons.get(button); busyButtons.delete(button);
      button.disabled = previous.disabled;
      if (previous.aria === null) button.removeAttribute('aria-busy'); else button.setAttribute('aria-busy', previous.aria);
      syncBusyIndicator(button);
    }
  }
  async function runButton(button, task) {
    if (!button || button.disabled || busyButtons.has(button)) return;
    buttonBusy(button, true);
    try { return await task(); } finally { buttonBusy(button, false); }
  }
  const uid = () => 'wcs-ui-' + (++sequence);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' + ({down:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',left:'<path d="m15 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',check:'<path d="m5 12 4 4L19 6"/>'}[name] || '') + '</svg>';
  function root() { return doc.getElementById('wcspedia'); }
  function layer() {
    const host = root();
    if (!host) throw Error('WCSpedia is not mounted.');
    if(!isolatedHosts.has(host)){
      // Keep application delegation on this root, but do not pass dialog actions
      // to the host's document-level menus or single-letter keyboard shortcuts.
      for(const type of ['click','dblclick','pointerdown','contextmenu','submit','keydown','keypress','keyup'])host.addEventListener(type,event=>{
        if(event.target.closest?.('.wcs-ui-layer'))event.stopPropagation();
      });
      isolatedHosts.add(host);
    }
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
    const isDrawer = options.placement === 'right';
    const before = doc.activeElement, id = uid(), backdrop = doc.createElement(isDrawer ? 'dialog' : 'div');
    backdrop.className = 'wcs-ui-backdrop' + (isDrawer ? ' wcs-ui-drawer-backdrop' : '');
    const panel = doc.createElement('section');
    panel.className = 'wcs-ui-dialog' + (options.size === 'wide' ? ' is-wide' : '') + (isDrawer ? ' wcs-ui-drawer' : '');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', id); panel.tabIndex = -1;
    panel.innerHTML = '<div class="wcs-ui-dialog-heading"><div><h2 id="' + id + '">' + escape(options.title || 'WCSpedia') + '</h2>' + (options.description ? '<p>' + escape(options.description) + '</p>' : '') + '</div><button type="button" class="wcs-ui-close" aria-label="' + escape(options.closeLabel || 'Close dialog') + '">' + icon('close') + '</button></div><div class="wcs-ui-dialog-body"></div>';
    const body = panel.querySelector('.wcs-ui-dialog-body'); put(body, options.body);
    backdrop.append(panel); layer().append(backdrop);
    let closed = false, busy = false, initiator = null, busyButton = null, disabledButtons = [];
    const previousOverflow = doc.documentElement.style.overflow;
    if (isDrawer) {
      backdrop.setAttribute('aria-label', options.title || 'Filters');
      backdrop.showModal(); // Browser top layer: above native Confluence headers and stacking contexts.
      doc.documentElement.style.overflow = 'hidden';
      backdrop.addEventListener('cancel', event => { event.preventDefault(); close('escape'); });
    }
    // Capture the actual submitter (including Enter-key submits) before the
    // form handler starts its asynchronous command.
    panel.addEventListener('submit', event => { if (!busy) initiator = event.submitter || event.target.querySelector('button[type="submit"]'); }, true);
    panel.addEventListener('click', event => { if (!busy) initiator = event.target.closest('button'); }, true);
    const handle = {element:panel, body, backdrop, close, setBusy(value, {pending = true} = {}) {
      value = !!value;
      if (value === busy) return;
      busy = value; panel.setAttribute('aria-busy', String(busy && pending));
      if (busy) {
        busyButton = pending ? (initiator && body.contains(initiator) ? initiator : body.querySelector('button[type="submit"]')) : null;
        buttonBusy(busyButton, true);
        disabledButtons = [...panel.querySelectorAll('button')].filter(button => button !== busyButton && !button.disabled);
        disabledButtons.forEach(button => { button.disabled = true; });
      } else {
        buttonBusy(busyButton, false); busyButton = null;
        disabledButtons.forEach(button => { button.disabled = false; }); disabledButtons = [];
      }
    }, get busy() { return busy; }};
    function close(reason) {
      reason = reason || 'close';
      if (closed || busy) return false;
      if (options.onClose && options.onClose(reason, handle) === false) return false;
      closed = true;
      if (activePopover && panel.contains(activePopover.element)) activePopover.close('owner-close');
      destroyFields(panel);
      if (isDrawer) { backdrop.close(); doc.documentElement.style.overflow = previousOverflow; }
      backdrop.remove();
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
  // Opt-in searchable dropdown; existing selects retain their original behavior.
  function searchableSelectControl(field) {
    const originalHidden=field.hidden,id=uid(),wrapper=doc.createElement('span'),trigger=doc.createElement('button');
    wrapper.className='wcs-ui-select';trigger.type='button';trigger.className='wcs-ui-select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',nameFor(field));
    trigger.innerHTML='<span class="wcs-ui-select-value"></span>'+icon('down');field.after(wrapper);wrapper.append(trigger);field.hidden=true;field.dataset.wcsUi='select';
    let popup=null,active=0;const abort=new AbortController(),signal=abort.signal;
    function sync(){trigger.disabled=field.disabled;trigger.querySelector('span').textContent=field.selectedOptions[0]?.textContent||'Search and select';if(popup&&field.disabled)popup.close('disabled');}
    function open(){if(popup||field.disabled)return;active=0;
      popup=popover({anchor:trigger,role:'dialog',label:nameFor(field),matchWidth:true,className:'wcs-searchable-select',body:'<input type="search" role="combobox" aria-label="Search relationships" aria-autocomplete="list" aria-expanded="true" aria-controls="'+id+'-options" placeholder="Search ID or name…"><div id="'+id+'-options" role="listbox" aria-label="Matching relationships"></div><p role="status"></p>',onClose(){popup=null;trigger.setAttribute('aria-expanded','false');}});
      trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',popup.element.id);
      const input=popup.element.querySelector('input'),list=popup.element.querySelector('[role=listbox]'),status=popup.element.querySelector('[role=status]');let found=[];
      const choose=index=>{const option=found[index];if(!option)return;field.value=option.value;sync();popup.close('select');announceValue(field);};
      function paint(){const query=input.value.trim().toLocaleLowerCase();found=Array.from(field.options).filter(o=>!o.disabled&&(!query||o.textContent.toLocaleLowerCase().includes(query)));active=Math.min(active,Math.max(0,found.length-1));list.innerHTML=found.map((o,i)=>'<div role="option" id="'+id+'-result-'+i+'" data-result="'+i+'" aria-selected="'+(o.value===field.value)+'" class="wcs-ui-option'+(i===active?' is-active':'')+'"><span>'+escape(o.textContent)+'</span>'+(o.value===field.value?icon('check'):'')+'</div>').join('');status.textContent=found.length?found.length+' matching '+(found.length===1?'option':'options'):'No matching relationships. Try another ID or name.';if(found.length)input.setAttribute('aria-activedescendant',id+'-result-'+active);else input.removeAttribute('aria-activedescendant');}
      input.oninput=()=>{active=0;paint();};input.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();active=e.key==='Home'?0:e.key==='End'?found.length-1:Math.max(0,Math.min(found.length-1,active+(e.key==='ArrowDown'?1:-1)));paint();list.querySelector('.is-active')?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();choose(active);}};
      list.onpointerdown=e=>e.preventDefault();list.onclick=e=>{const item=e.target.closest('[data-result]');if(item)choose(Number(item.dataset.result));};paint();focusElement(input);
    }
    trigger.addEventListener('click',()=>popup?popup.close('toggle'):open(),{signal});trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}},{signal});field.addEventListener('change',sync,{signal});
    const observer=new MutationObserver(sync);observer.observe(field,{attributes:true,childList:true,subtree:true,characterData:true});
    enhanced.set(field,{field,wrapper,sync,destroy(){popup?.close('destroy');observer.disconnect();abort.abort();wrapper.remove();field.hidden=originalHidden;delete field.dataset.wcsUi;}});sync();
  }
  function selectControl(field) {
    if(field.hasAttribute('data-searchable'))return searchableSelectControl(field);
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
  // Search uses the same close SVG as dialogs; native browser cancel icons are hidden.
  function searchControl(field) {
    const wrapper=doc.createElement('span'),button=doc.createElement('button'),abort=new AbortController();
    wrapper.className='wcs-ui-search-field';field.before(wrapper);wrapper.append(field);
    button.type='button';button.className='wcs-ui-search-clear';button.setAttribute('aria-label','Clear '+nameFor(field));button.innerHTML=icon('close');wrapper.append(button);
    const sync=()=>{button.hidden=!field.value;button.disabled=field.disabled||field.readOnly;};
    field.addEventListener('input',sync,{signal:abort.signal});field.addEventListener('change',sync,{signal:abort.signal});
    button.addEventListener('click',event=>{event.preventDefault();field.value='';sync();announceValue(field);if(field.isConnected)field.focus({preventScroll:true});},{signal:abort.signal});
    enhanced.set(field,{field,wrapper,sync,destroy(){abort.abort();wrapper.before(field);wrapper.remove();}});sync();
  }
  function enhance(container) {
    if (!container || !container.querySelectorAll) return;
    cleanup();
    container.querySelectorAll('button[aria-busy]').forEach(syncBusyIndicator);
    container.querySelectorAll('form').forEach(form=>{form.noValidate=true;});
    container.querySelectorAll('input[type=search]').forEach(field=>{if(!field.closest('#credit-hub,.credit-ui-surface,.wcs-ui-popover,.wcs-ui-dialog'))return;if(enhanced.has(field))enhanced.get(field).sync();else searchControl(field);});
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
    for(const handle of dialogs.slice())if(!handle.backdrop.isConnected){
      handle.setBusy(false);
      // Notify owners too: otherwise the editor retains a dead dialog handle
      // and every later Insert/Cancel action silently returns.
      if(!handle.close('detached')){const index=dialogs.indexOf(handle);if(index>=0)dialogs.splice(index,1);destroyFields(handle.element);}
    }
    if(!dialogs.length&&inertState.size)syncInert();
  }
  function resumeControls(){if(doc.visibilityState!=='hidden')cleanup();}
  doc.addEventListener('visibilitychange',resumeControls);
  global.addEventListener('pageshow',resumeControls);
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
  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'){
        if(record.target.closest(busyScope))syncBusyIndicator(record.target);
      }else for(const node of record.addedNodes){
        if(node.nodeType!==1||!node.closest(busyScope))continue;
        if(node.matches('button[aria-busy]'))syncBusyIndicator(node);
        node.querySelectorAll('button[aria-busy]').forEach(syncBusyIndicator);
      }
    }
    if(!cleanupScheduled){cleanupScheduled=true;queueMicrotask(()=>{cleanupScheduled=false;cleanup();});}
  }).observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
  global.WCSUI={icon,dialog,popover,enhance,destroy,buttonBusy,runButton,closePopover:()=>activePopover?.close('close'),hasPopup:()=>!!activePopover||dialogs.length>0};
})(typeof window!=='undefined'?window:globalThis);
