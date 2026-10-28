const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./app-fixture.cjs');
for(const [role,hash] of [['home','#/results'],['mine','#/results?view=mine'],['home','#/document/credit-data-maintenance'],['saved','#/saved'],['entitlements','#/entitlements'],['faq','#/faq']])test('PAL breadcrumbs retain navigation and current-page semantics: '+role+' '+hash,async t=>{
 const f=await fixture({sourceMode:true,role,actor:'jordan',hash});t.after(f.close);
 const nav=f.find('nav.breadcrumbs');assert.ok(nav);assert.equal(nav.getAttribute('aria-label'),'Breadcrumb');assert.ok(nav.querySelector('a[href]'));assert.equal(nav.querySelectorAll('svg').length,0);
 const separators=nav.querySelectorAll('.wcs-breadcrumb-separator');assert.ok(separators.length);for(const s of separators){assert.equal(s.textContent,'/');assert.equal(s.getAttribute('aria-hidden'),'true');}
 assert.equal(nav.querySelectorAll('[aria-current="page"]').length,1);assert.ok(nav.querySelector('[aria-current="page"]').textContent.trim());
 if(hash.includes('/document/'))assert.equal(nav.querySelector('[aria-current="page"]').textContent,f.find('#wcspedia h1').textContent);
 assert.deepEqual(f.errors,[]);
});
