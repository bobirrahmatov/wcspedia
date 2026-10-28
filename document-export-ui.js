/* Export controls use the same Citi popover/dialog as the editor and workspaces. */
(function (global) {
  'use strict';
  function mount(root, options) {
    const abort = new AbortController();
    let popup = null, dialog = null, job = null, disposed = false;
    const labels = {pdf: 'PDF', docx: 'Word', md: 'Markdown', mdx: 'MDX', 'mdx-template': 'MDX template'};
    function download(file) {
      if (!(file.blob instanceof Blob) || !file.blob.size || !/\.(pdf|docx|md|mdx)$/i.test(file.filename)) throw Error('The exported file is empty or invalid.');
      const url = URL.createObjectURL(file.blob), link = document.createElement('a');
      link.href = url; link.download = file.filename; link.hidden = true;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    }
    async function prepareText(format, current, signal) {
      const template = format === 'mdx-template', callback = template ? options.getMDXTemplate : format === 'mdx' ? options.getMDX : options.getMarkdown;
      if (typeof callback !== 'function') throw Error(labels[format] + (template ? ' download' : ' export') + ' is unavailable. Reload the page and try again.');
      if (!template && (!Number.isSafeInteger(current.version.version) || current.version.version < 1 || !Number.isSafeInteger(current.version.revision) || current.version.revision < 1)) throw Error('The document version and revision are invalid. Reload the page before exporting.');
      const base = String(current.version.slug || current.doc.reference || current.doc.id || 'document').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'document';
      const filename = template ? 'wcspedia-document.mdx' : base + '-v' + current.version.version + '-r' + current.version.revision + '.' + format;
      // Use the host's existing canonical serializer for the selected snapshot.
      // This path does not load the PDF or Word libraries or select a newer draft.
      // The template callback retrieves and validates its trusted configured
      // attachment. This UI never invents a URL or loads executable libraries.
      const value = await callback(current, {signal});
      if (!(typeof value === 'string' && value.trim()) && !(template && value instanceof Blob && value.size)) throw Error('The ' + labels[format] + (template ? ' download' : ' export') + ' is empty or invalid.');
      const mimeType = 'text/markdown;charset=utf-8';
      return {blob: new Blob([value], {type: mimeType}), filename, mimeType};
    }
    function cancel() { if (job) job.abort(); job = null; }
    async function run(format) {
      if (disposed || job || !labels[format]) return;
      popup?.close('select'); popup = null;
      const current = options.getDocument();
      if (!current?.doc || !current?.version) { options.notify('Open a document before exporting.', {type: 'warning'}); return; }
      const request = new AbortController(); job = request;
      dialog = global.WCSUI.dialog({
        title: (format === 'mdx-template' ? 'Download ' : 'Export ') + labels[format],
        description: format === 'md' ? 'Includes this document version in Markdown, with its images, tags, and attachment links.' : format === 'mdx' ? 'Includes this document version with its metadata block and portable MDX source.' : format === 'mdx-template' ? 'Downloads the WCSpedia metadata and document template for preparing new content.' : 'Includes this document version, its control information, and approval record.',
        body: '<div class="wcs-export-progress" role="status"><span class="wcs-export-spinner" aria-hidden="true"></span><p>Preparing your document…</p></div><div class="form-error" role="alert" hidden></div><div class="modal-actions"><button type="button" class="button secondary" data-export-cancel>Cancel</button><button type="button" class="button" data-export-retry hidden>Try again</button></div>',
        onClose() { cancel(); dialog = null; }
      });
      const handle = dialog;
      handle.element.setAttribute('aria-busy', 'true');
      handle.element.querySelector('[data-export-cancel]').onclick = () => handle.close();
      handle.element.querySelector('[data-export-retry]').onclick = () => { handle.close(); run(format); };
      try {
        const file = await (['md', 'mdx', 'mdx-template'].includes(format) ? prepareText(format, current, request.signal) : global.WCSDocumentExport.create(current).prepare(format, {signal: request.signal}));
        if (disposed || request.signal.aborted || job !== request || !handle.element.isConnected) return;
        (options.download || download)(file);
        handle.close();
        options.notify(labels[format] + ' download started.', {type: 'success'});
      } catch (error) {
        if (disposed || request.signal.aborted || job !== request || !handle.element.isConnected) return;
        job = null;
        handle.element.querySelector('.wcs-export-progress').hidden = true;
        const message = handle.element.querySelector('.form-error');
        message.hidden = false; message.textContent = error.message || 'The document could not be exported. Try again.';
        options.notify(message.textContent, {type: 'error'});
        handle.element.querySelector('[data-export-retry]').hidden = false;
        handle.element.querySelector('[data-export-cancel]').textContent = 'Close';
      } finally {
        if (handle.element.isConnected) handle.element.setAttribute('aria-busy', 'false');
      }
    }
    function open(anchor) {
      if (popup) { popup.close('toggle'); return; }
      popup = global.WCSUI.popover({
        anchor, role: 'menu', label: 'Export document', className: 'wcs-export-menu',
        body: '<button type="button" role="menuitem" data-export-format="pdf"><strong>PDF document</strong><small>Ready to read and share</small></button><button type="button" role="menuitem" data-export-format="docx"><strong>Word document</strong><small>Editable .docx file</small></button><button type="button" role="menuitem" data-export-format="md"><strong>Markdown file</strong><small>Portable .md source</small></button><button type="button" role="menuitem" data-export-format="mdx"><strong>MDX file</strong><small>Document source and metadata</small></button><button type="button" role="menuitem" data-export-format="mdx-template"><strong>Download MDX template</strong><small>Standard format for new content</small></button>',
        onClose() { anchor.setAttribute('aria-expanded', 'false'); popup = null; }
      });
      anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', popup.element.id);
      popup.element.addEventListener('click', event => { const button = event.target.closest('[data-export-format]'); if (button) run(button.dataset.exportFormat); });
      popup.element.addEventListener('keydown', event => {
        const items = Array.from(popup?.element.querySelectorAll('[role=menuitem]') || []);
        const index = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      });
    }
    root.addEventListener('click', event => { const button = event.target.closest('[data-wcs-export]'); if (button && root.contains(button)) { event.preventDefault(); open(button); } }, {signal: abort.signal});
    return {destroy() { disposed = true; abort.abort(); cancel(); popup?.close('destroy'); dialog?.close('destroy'); }};
  }
  global.WCSDocumentExportUI = Object.freeze({mount});
})(window);
