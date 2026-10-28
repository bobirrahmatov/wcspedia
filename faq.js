/* Static help: no workspace, entitlement, document or analytics requests. */
(function(global){
  'use strict';
  const entries=[
    ['How do I find a document or browse a business area?', 'Search from the landing page to find documents and Insights articles. Choose Explore documents to filter by business area, content type, topic or updated year. Only content your signed-in Confluence account can access is included.'],
    ['What is Insights, and which content type should I choose?', 'Insights brings together Guides, Blogs, Training and Reports. Use a Guide for procedures, playbooks or checklists; a Blog for updates and stories; Training for learning materials; and a Report for findings or reference information. Choose Job aid for operational instructions that require review and approval.'],
    ['How do I create a document and use a template?', 'Select the floating + button, then choose a content type. In the editor, use the template button for that type and complete the title, summary, topics and content. Available actions depend on your entitlements and native Confluence permissions.'],
    ['Where are my drafts, and how does publishing work?', 'My Workspace contains your documents and their workflow status. Save unfinished work there. Guides, Blogs, Training and Reports publish directly to Insights when you select Publish to Insights. Job aids require a business area and assigned reviewers, then follow the review and manager approval steps. Saving a draft does not publish it.'],
    ['How do I review a Job aid or respond to requested changes?', 'Open Reviewer Workspace for work assigned to you. Read the document and review comments before choosing an available action. Authors can find requested changes in My Workspace, update the document and resubmit it. The audit trail records workflow decisions.'],
    ['How do I save an article for later?', 'Use the save action in the document reader, then open Saved from the header to return to it. Removing a saved item removes your bookmark, not the original document. A saved article may become unavailable if it is deleted or your Confluence access changes.'],
    ['How do I edit, suggest a correction or delete a document?', 'Open your document from My Workspace and use the actions available to you. For someone else’s article, use Suggest an edit when available. Deletion requires the document key and a decision comment; you can copy the key from the confirmation dialog. A successful deletion returns you to your originating list.'],
    ['How are covers, summaries, authors and view counts shown?', 'An uploaded cover takes priority. Insights without a cover use a fallback image assigned consistently to the article. Cards use the document’s summary and author, and display recorded view counts when available. “Views unavailable” means a count could not be retrieved; it does not mean zero views.'],
    ['Why can’t I see a document or use an action?', 'Native Confluence permissions control access to pages and attachments. WCSpedia entitlements control the application actions offered to your account; they do not grant Confluence access. If something is missing, ask your space administrator to check both your native access and your entitlement record.'],
    ['What should I do if loading, search or publishing fails?', 'Keep your editor open if a save or publication fails and read the error before retrying. For loading or search errors, use Try again and check that your Confluence session is still signed in. Newly published articles can take time to appear in native search. If the problem continues, share the page link and error with your space administrator; do not share tokens or cookies.']
  ];
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function mount(root,config){
    const home=global.WCSNavigation.resolve('#/',config,global.location.href);
    const explore=global.WCSNavigation.resolve('#/results',config,global.location.href);
    root.innerHTML='<div class="shell discovery-shell"><div class="discovery workspace-page wcs-faq-page"><section class="press-heading page-panel"><div class="discovery-container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="'+escape(home)+'">WCSpedia</a><span aria-hidden="true">›</span><span aria-current="page">FAQs</span></nav><div class="eyebrow">Help &amp; guidance</div><h1>Frequently asked questions</h1><p>Find your way around WCSpedia, from your first search to publishing a document.</p></div></section><div class="discovery-container"><form class="library-workspace-search" role="search"><label for="wcs-faq-search">Search FAQs</label><div class="wcs-faq-search-row"><input id="wcs-faq-search" type="search" maxlength="200" placeholder="Try publishing, saved items or access…" aria-controls="wcs-faq-list" autocomplete="off"><button class="button secondary" type="reset">Clear</button></div></form><p class="library-count" id="wcs-faq-count" role="status"></p><div id="wcs-faq-list">'+entries.map(([q,a],i)=>'<details class="wcs-help-item"><summary id="wcs-help-q-'+i+'">'+escape(q)+'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></summary><div role="region" aria-labelledby="wcs-help-q-'+i+'"><p>'+escape(a)+'</p></div></details>').join('')+'</div><p class="wcs-faq-empty" hidden>No matching questions. Try a different word or clear your search.</p><div class="wcs-faq-footer"><p>Ready to find what you need?</p><a class="discovery-text-link" href="'+escape(explore)+'">Explore documents <span aria-hidden="true">→</span></a></div></div></div></div>';
    const input=root.querySelector('#wcs-faq-search'),items=[...root.querySelectorAll('.wcs-help-item')];
    const filter=()=>{
      const words=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let visible=0;
      items.forEach((item,i)=>{const matches=words.every(word=>entries[i].join(' ').toLocaleLowerCase().includes(word));item.hidden=!matches;if(matches){visible++;if(words.length)item.open=true;}});
      root.querySelector('#wcs-faq-count').textContent=words.length?visible+' of '+entries.length+' questions':entries.length+' questions';
      root.querySelector('.wcs-faq-empty').hidden=visible!==0;
    };
    input.addEventListener('input',filter);
    root.querySelector('form').addEventListener('submit',event=>event.preventDefault());
    root.querySelector('form').addEventListener('reset',event=>{event.preventDefault();input.value='';items.forEach(item=>item.open=false);filter();input.focus();});
    filter();
  }
  global.WCSFAQ={mount};
})(window);
