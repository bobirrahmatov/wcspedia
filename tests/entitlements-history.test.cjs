'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function fixture(count=51){
  const dom=new JSDOM('<div id="wcspedia"></div>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=123#/entitlements?q=BR&page=2',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,root=w.document.querySelector('#wcspedia'),downloads=[];
  for(const file of ['data-table.js','pagination.js','entitlements-page.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  const policy={revision:count+1,records:[{id:'one',soeid:'BR47149',displayName:'Person',scope:'*',permissions:['content.create'],active:true}],audit:Array.from({length:count},(_,i)=>({id:'event-'+i,revision:i+2,action:i%2?'edit':'add',actorSOEID:'BR47149',at:'2026-10-20T10:00:00Z',comment:i===0?'<img src=x onerror=alert(1)>':'Reason '+i,changes:[{before:null,after:{soeid:'AB12345'}}]}))};
  const options={policy,identity:{soeid:'BR47149'},can:()=>true,documents:[],download:(...args)=>downloads.push(args),notify(){},go(){throw Error('History must not navigate');}};
  root.innerHTML=w.WCSEntitlementsPage.markup(options);
  const handle=w.WCSEntitlementsPage.mount(root,options);
  const history=root.querySelector('[data-entitlement-history]'),rows=()=>[...history.querySelectorAll('tbody tr')];
  return {w,root,history,rows,downloads,close(){handle.destroy();w.close();}};
}
test('history paginates every audit record locally, independently of entitlement paging',()=>{
  const f=fixture();try{
    const href=f.w.location.href;
    assert.equal(f.rows().length,10);assert.equal(f.rows()[0].cells[0].textContent,'52');
    assert.match(f.history.textContent,/Showing 1–10 of 51 changes/);
    assert.equal(f.history.querySelector('.wcs-page-previous').getAttribute('aria-disabled'),'true');
    f.history.querySelector('.wcs-page-next').click();assert.equal(f.rows()[0].cells[0].textContent,'42');
    f.history.querySelector('a[data-page="6"]').click();assert.equal(f.rows().length,1);
    assert.equal(f.rows()[0].cells[0].textContent,'2');
    assert.equal(f.history.querySelector('.wcs-page-next').getAttribute('aria-disabled'),'true');
    assert.equal(f.history.querySelector('img'),null,'Audit text must remain escaped');
    assert.ok(f.root.querySelector('.entitlement-table code'));
    assert.ok(f.history.querySelector('pre code'));
    assert.equal(f.root.querySelector('.entitlement-summary'),null);
    assert.ok(f.history.querySelector('.entitlement-pagination #entitlement-history-size'));
    assert.ok(f.root.querySelector('.entitlement-pagination #entitlement-page-size'));
    assert.equal(f.root.querySelector('.entitlement-table .entitlement-soeid').tagName,'CODE');
    assert.equal(f.w.location.href,href);
    f.root.querySelector('[data-entitlement="export"]').click();
    assert.match(f.downloads[0][0],/Reason 50/);assert.match(f.downloads[0][0],/onerror/);
  }finally{f.close();}
});
test('history page size, search and clear reset the page without changing entitlement search',()=>{
  const f=fixture();try{
    const size=f.history.querySelector('select'),query=f.history.querySelector('input'),form=f.history.querySelector('form');
    for(const n of [25,50,10]){size.value=String(n);size.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(f.rows().length,n);}
    f.history.querySelector('a[data-page="6"]').click();
    query.value='Reason 40';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(f.rows().length,1);assert.match(f.rows()[0].textContent,/Reason 40/);
    assert.equal(f.root.querySelector('#entitlement-query').value,'BR');
    query.value='no such reason';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(f.rows().length,0);assert.match(f.history.textContent,/No matching changes/);
    f.history.querySelector('[data-history-clear]').click();assert.equal(f.rows().length,10);assert.equal(query.value,'');
  }finally{f.close();}
});
test('empty history has table headings and a clear empty state',()=>{
  const f=fixture(0);try{
    assert.equal(f.rows().length,0);assert.equal(f.history.querySelectorAll('th').length,6);
    assert.match(f.history.textContent,/No changes recorded yet/);assert.equal(f.history.querySelector('nav'),null);
  }finally{f.close();}
});
