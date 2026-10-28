/* Branding and search checks against the generated Confluence deployment assets.
 * NODE_PATH=/tmp/wcspedia-ui-tests/node_modules node --test tests/branding-app.cjs
 */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture,read,files,tick}=require('./app-fixture.cjs');
const sourceMode=process.argv.includes('--source');
const portableFiles=['WCSpedia-prototype.html','WCSpedia-my-workspace-prototype.html','WCSpedia-reviewer-workspace-prototype.html','WCSpedia-saved-items-prototype.html','WCSpedia-entitlements-prototype.html'];
const macroFiles=['WCSpedia-confluence-macro.html','wcspedia-my-workspace-confluence-macro.html','wcspedia-reviewer-workspace-confluence-macro.html','wcspedia-saved-items-confluence-macro.html','wcspedia-entitlements-confluence-macro.html'];
function configuration(file){
  const match=read(file).match(/window\.WCS_CONFIG = (\{[\s\S]*?\n\});/);
  assert.ok(match,'A generated page configuration is present in '+file);
  return JSON.parse(match[1]);
}
function params(f){return new URLSearchParams(f.w.location.hash.split('?')[1]||'');}

test('legacy search links return to the one branded landing page',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);
  const brand=f.find('.discovery-brand');
  assert.ok(brand);
  assert.equal(brand.tagName,'A');
  assert.equal(brand.getAttribute('aria-label'),'WCSpedia home');
  assert.equal(brand.getAttribute('href'),'#/');
  assert.equal(brand.querySelector('img').getAttribute('src'),f.w.WCS_CONFIG.brandLogoUrl);
  assert.equal(brand.querySelector('img').alt,'','The readable home-link label supplies the accessible name');
  assert.equal(brand.querySelector('.discovery-wordmark').textContent,'WCSpedia');
  const homeBrand=brand.outerHTML;
  await f.navigate('#/search');
  assert.equal(f.w.location.hash,'#/');
  assert.equal(f.find('.search-discovery'),null);
  assert.equal(f.d.activeElement,f.find('#knowledge-query'));
  assert.equal(f.find('.discovery-brand').outerHTML,homeBrand);
  assert.equal(f.all('.discovery-brand').length,1);
  f.find('.discovery-brand').click();await tick();await tick();
  assert.equal(f.w.location.hash,'#/');
  assert.equal(f.find('.library-browse'),null);
  assert.ok(f.find('.discovery-area-grid'));
  assert.equal(f.errors.length,0);
});

test('a missing logo leaves the wordmark, home link and search usable on both routes',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);
  for(const route of ['#/','#/search']){
    await f.navigate(route);
    const logo=f.find('.discovery-brand-logo');
    logo.dispatchEvent(new f.w.Event('error'));
    assert.equal(logo.hidden,true);
    assert.equal(f.find('.discovery-wordmark').textContent,'WCSpedia');
    assert.equal(f.find('.discovery-brand').hidden,false);
    f.input('#knowledge-query','Handover');await f.submit('[data-search="global"]');
    assert.equal(params(f).get('q'),'Handover');
    assert.ok(f.find('[aria-label="Search results"]'));
  }
  assert.equal(f.errors.length,0);
});

test('a configured Confluence attachment URL is respected and cannot inject attributes',async t=>{
  const attachment='/confluence/download/attachments/123456/wcspedia-logo.png?api=v2&name=" onerror="window.logoInjected=true';
  const f=await fixture({sourceMode,configureWindow:w=>{w.WCS_CONFIG.brandLogoUrl=attachment;}});t.after(f.close);
  for(const route of ['#/','#/search']){
    await f.navigate(route);
    const logo=f.find('.discovery-brand-logo');
    assert.equal(logo.getAttribute('src'),attachment);
    assert.equal(logo.hasAttribute('onerror'),false);
    assert.equal(f.all('.discovery-brand img').length,1);
    assert.equal(f.w.logoInjected,undefined);
  }
  assert.equal(f.errors.length,0);
});

test('landing search, result filters and keyboard focus work without a second search screen',async t=>{
  const f=await fixture({sourceMode});t.after(f.close);
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));
  assert.equal(f.d.activeElement,f.find('#knowledge-query'));
  f.input('#knowledge-query','Handover');await f.submit('[data-search="global"]');
  assert.equal(params(f).get('q'),'Handover');
  assert.ok(f.all('.press-card').length>0,'A real matching query still returns documents');
  f.input('#knowledge-query','');await f.submit('[data-search="library"]');
  const type=f.find('[data-filter="type"]');
  type.value='Training';type.dispatchEvent(new f.w.Event('change',{bubbles:true}));await tick();await tick();
  assert.equal(params(f).get('type'),'Training');
  assert.ok(f.all('.press-card').length>0);
  assert.ok(f.all('.press-card-kicker>span:first-child').every(el=>el.textContent==='Training'));
  f.find('.press-card h2 a').click();await tick();await tick();
  assert.ok(f.find('.document-body'));
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));await tick();await tick();
  assert.equal(f.w.location.hash,'#/');
  assert.equal(f.d.activeElement,f.find('#knowledge-query'));
  assert.ok(f.find('.discovery-area-grid'));
  assert.equal(f.errors.length,0);
});

test('all generated local entry points reference the saved reusable logo',()=>{
  for(const file of Object.values(files)){
    const config=configuration(file);
    assert.equal(config.brandLogoUrl,'assets/wcspedia-logo.png');
    assert.ok(fs.statSync(path.join(__dirname,'..',config.brandLogoUrl)).size>0);
  }
});

test('all portable previews embed the exact saved PNG for offline branding',()=>{
  const expected=fs.readFileSync(path.join(__dirname,'../assets/wcspedia-logo.png'));
  assert.equal(expected.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  for(const file of portableFiles){
    const logo=configuration(file).brandLogoUrl;
    assert.ok(logo.startsWith('data:image/png;base64,'),file);
    assert.deepEqual(Buffer.from(logo.slice('data:image/png;base64,'.length),'base64'),expected,file);
  }
});

test('both Confluence installation variants use one versioned shared attachment',()=>{
  let expected;
  for(const file of macroFiles){
    const standalone=configuration(file),shared=configuration('confluence-global-header/'+file);
    const logo=new URL(standalone.brandLogoUrl,'https://confluence.example');
    assert.equal(logo.pathname,'/confluence/download/attachments/REPLACE_WITH_WCSPEDIA_PAGE_ID/wcspedia-logo.png');
    assert.equal(logo.searchParams.get('api'),'v2');
    assert.match(logo.searchParams.get('v'),/^[a-f0-9]{12}$/);
    assert.equal(shared.brandLogoUrl,standalone.brandLogoUrl);
    expected=expected||standalone.brandLogoUrl;
    assert.equal(standalone.brandLogoUrl,expected);
  }
  assert.doesNotMatch(read('wcspedia-global-header-confluence-macro.html'),/<img\b|window\.WCS_CONFIG\s*=/,'The global header loads shared resources without mounting another brand or app');
});
