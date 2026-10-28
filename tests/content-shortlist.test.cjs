'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const content=require('../editor-content.js');
const insights=require('../insights.js');
const {fixture,tick}=require('./app-fixture.cjs');
test('four groups retain every legacy article and Job aids remain separate',()=>{
 assert.deepEqual(content.INSIGHT_CHOICES,['Guide','Blog','Training','Report']);
 assert.equal(content.CREATE_TYPES.length,5);
 const docs=content.INSIGHT_TYPES.map((type,i)=>({id:String(i+1),type,title:type}));
 assert.equal(insights.select({documents:docs,limit:100}).total,11);
 for(const type of content.INSIGHT_CHOICES){
  assert.deepEqual(insights.select({documents:docs,filter:{type},limit:100}).items.map(item=>item.type).sort(),content.typeMembers(type).sort());
 }
 assert.equal(content.publicationModeFor('Job aid'),null);
 assert.equal(content.typeLabel('Training'),'Training');
 assert.deepEqual(content.typeMembers('unknown'),['unknown']);
});
test('landing retains its original hero with three compact cards and no duplicate Explore or FAQ links',async t=>{
 const f=await fixture({sourceMode:true});t.after(f.close);
 assert.equal(f.all('.wcs-home .featured-document').length,3);
 assert.equal(f.find('.discovery-area-grid'),null);
 assert.equal(f.find('.wcs-home-faq'),null);
 assert.doesNotMatch(f.root.textContent,/Your everyday|Wealth Credit Services knowledge base|Find your starting point/);
 assert.equal(f.find('.discovery-hero h1').textContent,'A world of knowledge.One place to find it.');
 assert.equal(f.find('.discovery-hero h1').classList.contains('sr-only'),false);
 assert.equal(f.find('.wcs-home-links'),null);
 assert.deepEqual(f.errors,[]);
});
test('FAQ starts with ten closed answers, filters locally and clears without any data requests',async t=>{
 let requests=0;
 const f=await fixture({role:'faq',sourceMode:true,configureWindow(w){w.WCS_CONFIG.mode='confluence';w.fetch=()=>{requests++;throw Error('FAQ must not load native data');};}});t.after(f.close);
 await new Promise(resolve=>setTimeout(resolve,120));
 assert.equal(f.all('.wcs-help-item[open]').length,0);
 assert.ok(f.find('.workspace-page .press-heading h1'));
 assert.equal(f.d.querySelector('.wcs-loading-overlay:not([hidden])'),null);
 f.input('#wcs-faq-search','bookmark');assert.equal(f.all('.wcs-help-item:not([hidden])').length,1);
 f.input('#wcs-faq-search','<script>');assert.equal(f.all('.wcs-help-item:not([hidden])').length,0);assert.equal(f.find('.wcs-faq-empty').hidden,false);
 f.find('button[type="reset"]').click();assert.equal(f.all('.wcs-help-item:not([hidden])[open]').length,0);
 assert.equal(requests,0);assert.deepEqual(f.errors,[]);
});
test('workspace has no duplicate create button and shared FAB has five matching choices',async()=>{
 const f=await fixture({role:'mine',sourceMode:true});
 try{
  assert.equal(f.find('[data-action="new"]'),null);
  const button=f.d.querySelector('[data-wcs-add-document] button');assert.ok(button);button.click();await tick();
  assert.deepEqual([...f.d.querySelectorAll('[role="menuitem"]')].map(item=>item.textContent.trim()),['Job aids','Guides','Blogs','Training','Reports']);
  await f.navigate('#/create?type=Playbook');
  const types=f.find('#editor-type');assert.equal(types.value,'Guide');
  assert.deepEqual([...types.options].map(item=>item.textContent),['Job aids','Guides','Blogs','Training','Reports']);
  assert.equal(f.find('#editor-area').closest('.editor-field').hidden,true);
  assert.equal(f.find('.editor-ownership').hidden,true);
  assert.equal(f.find('#editor-save-button').textContent,'Publish to Insights');
  assert.equal(f.find('.editor-extra-tags').open,false);
  assert.ok(f.find('#editor-tags'));assert.equal(f.errors.length,0);
 }finally{f.close();}
});
