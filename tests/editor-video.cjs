/* Training-video editor integration. No remote media is requested by this DOM
 * harness; real SharePoint playback remains governed by the host and session.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/editor-video.cjs --source
 */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick,STORE}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source');
const embedUrl='https://contoso.sharepoint.com/sites/Learning/_layouts/15/embed.aspx?UniqueId=00000000-0000-0000-0000-000000000001';
const shareUrl='https://contoso.sharepoint.com/:v:/s/Learning/TrainingRecording?e=sample';
const iframe='<iframe src="'+embedUrl+'" width="640" height="360" frameborder="0" allowfullscreen title="Original player title"></iframe>';
function configureWindow(w,d){
  // Model browser insertHTML at the current Range; production uses the browser's
  // editing command. This checks our saved-range contract across the dialog.
  d.execCommand=(command,_ui,html)=>{
    assert.equal(command,'insertHTML');const selection=w.getSelection(),range=selection.getRangeAt(0);range.deleteContents();
    const fragment=range.createContextualFragment(html),last=fragment.lastChild;range.insertNode(fragment);if(last)range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range);return true;
  };
}
const createFixture=opts=>fixture({role:'mine',actor:'alex',hash:'#/create?type=Training',sourceMode,configureWindow,...opts});
function select(f,node,start,end=start){const range=f.d.createRange();range.setStart(node,start);range.setEnd(node,end);f.w.getSelection().removeAllRanges();f.w.getSelection().addRange(range);f.find('#editor-rich').dispatchEvent(new f.w.MouseEvent('mouseup',{bubbles:true}));}
function initialContent(f){f.input('#editor-title','A recorded training');f.input('#editor-summary','A training recording with ownership and an accessible title.');const rich=f.find('#editor-rich');rich.innerHTML='<p>Before placeholder after.</p>';rich.dispatchEvent(new f.w.Event('input',{bubbles:true}));select(f,rich.firstChild.firstChild,7,18);}
async function insertVideo(f,input=iframe,title='Credit approval training'){f.find('[data-format="video"]').click();f.input('#video-input',input);f.input('#video-title',title);await f.submit('[data-video-form]');}
function assertClean(f){assert.deepEqual(f.errors.map(error=>error.message),[]);assert.equal(f.root.querySelectorAll('script').length,0);}
(async()=>{
  let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
  await check('Video is directly after Image in both create and published editing toolbars',async()=>{
    const doc=dataset.documents.find(d=>d.versions.at(-1).status==='Published');
    for(const hash of ['#/create?type=Training','#/edit/'+doc.id]){const f=await createFixture({hash});try{const image=f.find('[data-format="image"]'),video=f.find('[data-format="video"]');assert.ok(video);assert.equal(image.nextElementSibling,video);assert.equal(video.getAttribute('aria-label'),'Insert training video');video.click();assert.match(f.find('.wcs-ui-dialog').textContent,/Share.*Embed.*inline player/);assert.ok(f.find('#video-title'));assertClean(f);}finally{f.close();}}
  });
  await check('SharePoint iframe insertion replaces the saved selection and persists a safe canonical video',async()=>{
    const f=await createFixture();try{initialContent(f);await insertVideo(f);assert.equal(f.find('.wcs-ui-dialog'),null);const rich=f.find('#editor-rich'),video=rich.querySelector('[data-video-url]');assert.ok(video);assert.equal(video.getAttribute('data-video-title'),'Credit approval training');assert.equal(video.getAttribute('contenteditable'),'false');assert.equal(video.querySelectorAll('[data-editor-video]').length,1);assert.match(rich.textContent,/Before/);assert.match(rich.textContent,/after/);assert.doesNotMatch(rich.textContent,/placeholder/);assert.equal(video.querySelector('iframe').getAttribute('title'),'Credit approval training');
      const markdown=f.w.WCSEditor.domToMarkdown(rich);assert.match(markdown,/@\[video\]\(/);assert.doesNotMatch(markdown,/<iframe|Edit video/);assert.match(markdown,/Before[\s\S]*@\[video\][\s\S]*after/);
      f.find('[data-editor-action="preview"]').click();assert.equal(f.find('#editor-reader').hidden,false);assert.ok(f.find('#editor-reader [data-video-url]'));assert.equal(f.find('#editor-reader [data-editor-video]'),null);f.find('[data-editor-action="preview"]').click();
      f.find('[data-editor-action="source"]').click();assert.match(f.find('#editor-source').value,/@\[video\]\(/);f.find('[data-editor-action="source"]').click();assert.equal(f.all('#editor-rich [data-editor-video]').length,1);
      await f.submit('#editor-form');const saved=JSON.parse(f.w.localStorage.getItem(STORE)).documents.find(d=>d.versions.at(-1).title==='A recorded training');assert.ok(saved);assert.equal(saved.versions[0].status,'Published');assert.equal(saved.area,'insights');assert.equal(saved.publicationMode,'direct-insight');assert.match(saved.versions[0].bodyMarkdown,/@\[video\]\(/);assert.equal(saved.audit.at(-1).action,'create');assertClean(f);
    }finally{f.close();}
  });
  await check('a sharing URL becomes a titled link card without inventing an inline player',async()=>{
    const f=await createFixture();try{initialContent(f);await insertVideo(f,shareUrl,'Recorded handover');const video=f.find('#editor-rich [data-video-url]');assert.ok(video);assert.equal(video.querySelector('iframe'),null);assert.equal(video.getAttribute('data-video-title'),'Recorded handover');assert.ok([...video.querySelectorAll('a')].some(a=>a.href===shareUrl));assertClean(f);}finally{f.close();}
  });
  await check('unsafe embed input and missing title stay in the Citi dialog without changing the document',async()=>{
    const f=await createFixture();try{initialContent(f);const before=f.find('#editor-rich').innerHTML;f.find('[data-format="video"]').click();f.input('#video-input',iframe);f.input('#video-title','');await f.submit('[data-video-form]');assert.match(f.find('.editor-dialog-error').textContent,/title/);
      for(const input of ['https://evil.example/player','<iframe src="https://evil.example/player" onload="alert(1)"></iframe>','<script>alert(1)</script>']){f.input('#video-input',input);f.input('#video-title','Unsafe input');await f.submit('[data-video-form]');assert.equal(f.find('.editor-dialog-error').hidden,false);assert.equal(f.find('#editor-rich').innerHTML,before);assert.ok(f.find('[data-video-form]'));assert.equal(f.find('.wcs-ui-dialog iframe,.wcs-ui-dialog script'),null);}
      f.find('[data-dialog-cancel]').click();assert.equal(f.find('#editor-rich').innerHTML,before);assertClean(f);
    }finally{f.close();}
  });
  await check('saved video remains editable through the same control and changes are audited',async()=>{
    let state,docId;const first=await createFixture();try{initialContent(first);await insertVideo(first);await first.submit('#editor-form');state=first.w.localStorage.getItem(STORE);docId=JSON.parse(state).documents.find(d=>d.versions.at(-1).title==='A recorded training').id;}finally{first.close();}
    const f=await createFixture({hash:'#/edit/'+docId,stored:state});try{const button=f.find('[data-editor-video]');assert.ok(button);button.click();assert.equal(f.find('#video-title').value,'Credit approval training');assert.equal(f.find('#video-input').value,embedUrl);f.input('#video-input',shareUrl);f.input('#video-title','Updated handover recording');await f.submit('[data-video-form]');assert.equal(f.find('#editor-rich [data-video-url]').getAttribute('data-video-title'),'Updated handover recording');assert.equal(f.find('#editor-rich iframe'),null);f.input('#editor-comment','Replace the recording with the revised handover session.');await f.submit('#editor-form');const doc=JSON.parse(f.w.localStorage.getItem(STORE)).documents.find(d=>d.id===docId);assert.equal(doc.versions.at(-1).version,2);assert.equal(doc.versions.at(-1).revision,1);assert.equal(doc.versions.at(-1).status,'Published');assert.match(doc.versions.at(-1).bodyMarkdown,/Updated handover recording/);assert.equal(doc.audit.at(-1).action,'revise');assert.ok(doc.audit.at(-1).changes.find(c=>c.field==='bodyMarkdown').after.includes(shareUrl));assertClean(f);
    }finally{f.close();}
  });
  await check('Remove video removes only that media block and retains neighboring content',async()=>{
    const f=await createFixture();try{initialContent(f);await insertVideo(f);f.find('[data-editor-video]').click();f.find('[data-delete-video]').click();assert.equal(f.find('#editor-rich [data-video-url]'),null);const markdown=f.w.WCSEditor.domToMarkdown(f.find('#editor-rich'));assert.match(markdown,/Before/);assert.match(markdown,/after/);assert.doesNotMatch(markdown,/@\[video\]|iframe/);assertClean(f);}finally{f.close();}
  });
  console.log(passed+' training video editor scenarios passed'+(sourceMode?' (source modules)':' (deployment bundle)'));
})().catch(error=>{console.error(error);process.exitCode=1;});
