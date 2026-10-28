/* Compact document controls and bounded, lossless history navigation.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node tests/document-control-app.cjs --source */
'use strict';
const assert=require('node:assert/strict');
const {fixture,dataset,tick}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source'),clone=value=>JSON.parse(JSON.stringify(value));
const ID='credit-data-maintenance',VERSION_COUNT=67,EVENT_COUNT=135;
const route=(tab='content',extra='')=>'#/document/'+ID+'?tab='+tab+'&version=31'+extra;
function historyData({draft=false}={}){
  const data=clone(dataset),doc=data.documents.find(item=>item.id===ID),base=clone(doc.versions[0]);
  doc.versions=Array.from({length:VERSION_COUNT},(_,index)=>{const version=clone(base),number=index+1;version.version=number;version.revision=1;version.title='Retained procedure version '+number;version.changeSummary='Version '+number+' change summary';version.createdAt=new Date(Date.UTC(2018,0,number*7)).toISOString();version.reviewedAt=new Date(Date.UTC(2018,0,number*7+1)).toISOString();version.approvedAt=new Date(Date.UTC(2018,0,number*7+2)).toISOString();version.sections=[{id:'record',title:'Retained guidance',paragraphs:['The full content of version '+number+'.'],bullets:[]}];version.cover=null;version.highlights=[];return version;});
  doc.publishedVersion=VERSION_COUNT;
  doc.audit=Array.from({length:EVENT_COUNT},(_,index)=>({id:'history-event-'+(index+1),action:index%2?'edit':'approve',actorId:index%2?'alex':'jordan',actorSOEID:index%2?'AM12345':'JL12345',at:new Date(Date.UTC(2018,0,index+1)).toISOString(),version:index<100?31:67,revision:index+1,fromStatus:index%2?'Draft':'Awaiting approval',toStatus:index%2?'Draft':'Published',comment:'Recorded change '+(index+1),changes:[{field:'summary',before:'Before '+(index+1),after:'After '+(index+1)}]}));
  if(draft){const next=clone(base);next.version=VERSION_COUNT+1;next.status='Draft';next.title='PRIVATE WORKING DRAFT';next.changeSummary='PRIVATE CHANGE SUMMARY';next.reviewedBy=null;next.reviewedAt=null;next.approvedBy=null;next.approvedAt=null;next.effectiveAt=null;next.nextReviewAt=null;doc.versions.push(next);}
  return data;
}
const noErrors=f=>assert.deepEqual(f.errors.map(error=>error.message),[]);
const open=options=>fixture({hash:route(),actor:'jordan',sourceMode,dataOverride:historyData(),...options});
const afterClick=async node=>{node.click();await tick();await tick();};
(async()=>{
  let passed=0;const failures=[];
  async function check(name,run){try{await run();passed++;console.log('PASS '+name);}catch(error){failures.push(error);console.error('FAIL '+name+'\n'+error.stack);}}
  await check('control summary stays visible while additional metadata expands and collapses without navigation',async()=>{
    const f=await open();try{
      const panel=f.find('.control-panel'),details=panel.querySelector('.control-details'),summary=details.querySelector('summary'),before=f.w.location.hash;
      assert.equal(details.open,false);assert.equal(panel.querySelectorAll('.control-summary .meta-block').length,3);assert.match(panel.querySelector('.control-summary').textContent,/Document owner.*Alex Morgan.*Approved by.*Jordan Lee.*Next review/);assert.match(panel.querySelector('.control-version').textContent,/Superseded.*v31 · r1/);assert.equal(panel.querySelector('.control-summary .document-key'),null);assert.equal(details.querySelector('.document-key').textContent,ID);assert.match(details.textContent,/Written by.*Reviewed by.*Effective from/);
      summary.focus();await afterClick(summary);assert.equal(details.open,true);assert.equal(f.d.activeElement,summary);await afterClick(summary);assert.equal(details.open,false);assert.equal(f.w.location.hash,before);
      for(const link of panel.querySelectorAll('.control-history-links a')){assert.equal(link.closest('details'),null,'History links remain outside the disclosure');const parsed=new URL(link.href);assert.equal(parsed.hash.split('?')[0],'#/document/'+ID);assert.equal(new URLSearchParams(parsed.hash.split('?')[1]).get('version'),'31');}
      assert.ok(f.find('[data-wcs-export]'),'Shared PDF/Word download entry remains available');noErrors(f);
    }finally{f.close();}
  });
  await check('version history shows six snapshots at a time and every retained version remains reachable exactly once',async()=>{
    const f=await open({hash:route('versions')});try{
      assert.equal(f.all('.version-card').length,6);assert.deepEqual(f.all('[data-history-version]').map(node=>Number(node.dataset.historyVersion)),[67,66,65,64,63,62]);assert.match(f.find('.history-summary').textContent,/Showing 1–6 of 67 versions/);const firstPager=f.find('nav[aria-label="Version history pages"]');assert.ok(firstPager.querySelector('.wcs-page-gap'));assert.ok(firstPager.querySelectorAll('.wcs-page-numbers>li').length<=13);
      const firstCard=f.find('.version-card'),details=firstCard.querySelector('details');await afterClick(details.querySelector('summary'));assert.equal(details.open,true);assert.match(details.textContent,/The full content of version 67/);await afterClick(details.querySelector('summary'));assert.equal(details.open,false);
      const seen=[];let page=1;
      while(true){const cards=f.all('[data-history-version]');assert.ok(cards.length<=6);seen.push(...cards.map(card=>Number(card.dataset.historyVersion)));const next=f.find('nav[aria-label="Version history pages"] .wcs-page-next');if(!next?.getAttribute('href'))break;const target=new URL(next.href),params=new URLSearchParams(target.hash.split('?')[1]);assert.equal(target.hash.split('?')[0],'#/document/'+ID);assert.equal(params.get('tab'),'versions');assert.equal(params.get('version'),'31');assert.equal(Number(params.get('historyPage')),page+1);await afterClick(next);page++;}
      assert.deepEqual(seen,Array.from({length:VERSION_COUNT},(_,index)=>VERSION_COUNT-index));assert.equal(page,12);assert.match(f.find('.history-summary').textContent,/Showing 67–67 of 67/);const oldest=f.find('.version-card .link');assert.equal(new URLSearchParams(new URL(oldest.href).hash.split('?')[1]).get('version'),'1');await afterClick(oldest);assert.equal(f.find('h1').textContent,'Retained procedure version 1');noErrors(f);
    }finally{f.close();}
  });
  await check('audit pagination preserves filters and selected version, then resets correctly when filters change',async()=>{
    const f=await open({hash:route('audit','&auditVersion=31&auditAction=edit&historyPage=3')});try{
      const all=historyData().documents.find(doc=>doc.id===ID).audit.filter(event=>event.version===31&&event.action==='edit').reverse();assert.equal(f.all('.audit-event').length,10);assert.deepEqual(f.all('[data-audit-event]').map(node=>node.dataset.auditEvent),all.slice(20,30).map(event=>event.id));assert.match(f.find('.history-summary').textContent,/Showing 21–30 of 50 events/);
      const next=f.find('nav[aria-label="Audit history pages"] .wcs-page-next'),params=new URLSearchParams(new URL(next.href).hash.split('?')[1]);assert.equal(params.get('auditVersion'),'31');assert.equal(params.get('auditAction'),'edit');assert.equal(params.get('version'),'31');assert.equal(params.get('tab'),'audit');await afterClick(next);assert.deepEqual(f.all('[data-audit-event]').map(node=>node.dataset.auditEvent),all.slice(30,40).map(event=>event.id));
      const filter=f.find('[data-audit=auditAction]');filter.value='approve';filter.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();assert.equal(new URLSearchParams(f.w.location.hash.split('?')[1]).get('historyPage'),'1');assert.equal(f.find('[data-audit=auditVersion]').value,'31');assert.deepEqual(f.all('[data-audit-event]').map(node=>node.dataset.auditEvent),historyData().documents.find(doc=>doc.id===ID).audit.filter(event=>event.version===31&&event.action==='approve').reverse().slice(0,10).map(event=>event.id));
      const item=f.find('.audit-event'),details=item.querySelector('details');await afterClick(details.querySelector('summary'));assert.equal(details.open,true);assert.match(details.textContent,/Before 99.*After 99/);assert.equal(f.find('[data-action=export]'),null);assert.equal(f.all('a,button').some(node=>/export.*json|download.*json/i.test(node.textContent)),false);noErrors(f);
    }finally{f.close();}
  });
  await check('all audit events remain in chronological pages with bounded links and safe page normalization',async()=>{
    const f=await open({hash:route('audit')});try{
      const seen=[];let pages=0;while(true){const events=f.all('[data-audit-event]');assert.ok(events.length<=10);seen.push(...events.map(node=>node.dataset.auditEvent));pages++;assert.ok(f.all('nav[aria-label="Audit history pages"] .wcs-page-numbers>li').length<=13);const next=f.find('nav[aria-label="Audit history pages"] .wcs-page-next');if(!next?.getAttribute('href'))break;await afterClick(next);}
      assert.equal(pages,14);assert.deepEqual(seen,Array.from({length:EVENT_COUNT},(_,index)=>'history-event-'+(EVENT_COUNT-index)));await f.navigate(route('audit','&historyPage=999999'));assert.equal(f.find('.document-history-pagination [aria-current=page]').textContent,'14');assert.equal(f.all('.audit-event').length,5);await f.navigate(route('audit','&historyPage=-4'));assert.equal(f.find('.document-history-pagination [aria-current=page]').textContent,'1');await f.navigate(route('audit','&auditAction=missing&historyPage=99'));assert.equal(f.all('.audit-event').length,0);assert.match(f.find('.history-empty').textContent,/No audit events/);assert.equal(f.find('nav[aria-label="Audit history pages"]'),null);noErrors(f);
    }finally{f.close();}
  });
  await check('compact controls retain pending status and reader history cannot expose working drafts or audit',async()=>{
    const data=historyData({draft:true}),f=await open({dataOverride:data,hash:'#/document/'+ID+'?version=68'});try{assert.match(f.find('.control-version').textContent,/Draft.*v68/);assert.match(f.find('.control-summary').textContent,/Pending approval.*Assigned to Jordan Lee.*Set on approval/);assert.equal(f.find('.control-details').open,false);assert.ok(f.find('[data-action=edit]'));assert.ok(f.find('[data-action=delete]'));noErrors(f);}finally{f.close();}
    const reader=await open({actor:'reader',dataOverride:data,hash:route('versions')});try{assert.equal(reader.root.textContent.includes('PRIVATE WORKING DRAFT'),false);assert.equal(reader.root.textContent.includes('PRIVATE CHANGE SUMMARY'),false);assert.match(reader.find('.history-summary').textContent,/of 67 versions/);assert.equal(reader.find('.control-history-links a[href*="tab=audit"]'),null);assert.equal(reader.find('[data-action=edit],[data-action=revise],[data-action=delete]'),null);assert.ok(reader.find('[data-wcs-export]'));await reader.navigate(route('audit'));assert.equal(reader.find('.audit-list'),null);assert.ok(reader.find('.document-body'));noErrors(reader);}finally{reader.close();}
  });
  if(failures.length)throw new AggregateError(failures,failures.length+' document control checks failed.');
  console.log(passed+' document control application checks passed'+(sourceMode?' (source modules)':' (deployment bundle)'));
})().catch(error=>{console.error(error);process.exitCode=1;});
