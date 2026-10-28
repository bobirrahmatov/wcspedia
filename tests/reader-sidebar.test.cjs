const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'../reader-sidebar.js'),'utf8');
function setup(t,content,sidebar=true){const dom=new JSDOM('<body class="citi-hide-sidebar">'+(sidebar?'<aside id="sidebar"><ul class="plugin_pagetree_children_list"><li><button id="branch" aria-expanded="false">Expand Blogs</button><span class="plugin_pagetree_children_span"><a href="?pageId=700">Blogs</a></span><ul hidden><li>Child article</li></ul></li></ul><button id="native-collapse">Collapse sidebar</button></aside>':'')+'<main id="main-content">'+content+'</main></body>',{url:'https://example.test/confluence/pages/viewpage.action?pageId=123',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.fetch=()=>{throw Error('Sidebar must not fetch');};t.after(()=>{w.WCSReaderSidebar?.destroy();w.close();});return w;}
test('styles the original tree without adding or relocating controls, and native collapse still works',t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document,host=d.querySelector('#sidebar'),original=host.innerHTML;
 const branch=d.querySelector('#branch'),collapse=d.querySelector('#native-collapse');let clicks=0;
 branch.onclick=()=>{clicks++;branch.setAttribute('aria-expanded','true');branch.parentElement.querySelector('ul').hidden=false;};collapse.onclick=()=>d.body.classList.toggle('ia-splitter-left-collapsed');
 w.eval(source);assert.equal(host.querySelectorAll(".wcs-native-page-icon").length,1);assert.equal(d.querySelector("#branch"),branch);assert.equal(d.body.dataset.wcsReaderNav,'native');assert.equal(d.body.classList.contains('citi-hide-sidebar'),false);
 branch.click();collapse.click();assert.equal(clicks,1);assert.equal(branch.getAttribute('aria-expanded'),'true');assert.ok(d.body.classList.contains('ia-splitter-left-collapsed'));
 w.eval(source);assert.equal(d.querySelectorAll('aside').length,1);assert.equal(d.querySelectorAll('.wcs-reader-nav-rail,.wcs-reader-nav-toggle,[data-wcs-reader-main-icon]').length,0);
});
test('leaving a reader restores the original hide flag and removes reader styling',t=>{
 const w=setup(t,'<div id="wcspedia"><div class="discovery">Parent</div></div>'),d=w.document;w.eval(source);assert.equal(d.body.dataset.wcsReaderNav,undefined);
 d.querySelector('#wcspedia').innerHTML='<div class="detail-page">Reader</div>';w.WCSReaderSidebar.refresh();assert.equal(d.body.dataset.wcsReaderNav,'native');
 d.querySelector('#wcspedia').innerHTML='<div class="editor">Editor</div>';w.WCSReaderSidebar.refresh();assert.equal(d.body.dataset.wcsReaderNav,undefined);assert.ok(d.body.classList.contains('citi-hide-sidebar'));assert.equal(d.querySelector('#sidebar').className,'');
});
test('no native sidebar means no synthetic sidebar or content offset',t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>',false);w.eval(source);assert.equal(w.document.querySelector('aside,nav,.wcs-reader-navigation'),null);assert.equal(w.document.body.dataset.wcsReaderNav,undefined);assert.equal(w.document.querySelector('main').getAttribute('style'),null);
});
test('article-local loader waits for native article flags and never activates inside navBar',async t=>{
 const w=setup(t,'<div class="wcs-native-article">Article</div>'),d=w.document;w.eval(source);assert.equal(d.body.dataset.wcsReaderNav,undefined);
 d.body.setAttribute('data-wcs-active-style-flags','hide-title');await new Promise(r=>setTimeout(r,0));assert.equal(d.body.dataset.wcsReaderNav,'native');
 const header=d.createElement('header');d.body.prepend(header);header.append(d.querySelector('.wcs-native-article'));await new Promise(r=>setTimeout(r,0));assert.equal(d.body.dataset.wcsReaderNav,undefined);
});
test('compact styling never takes over the native sidebar width, content offset or collapse control',()=>{
 const css=fs.readFileSync(require('node:path').join(__dirname,'../reader-sidebar.css'),'utf8');
 assert.doesNotMatch(css,/(?:#main|#content|\.ia-splitter-left)\s*\{/);assert.doesNotMatch(css,/wcs-reader-nav-toggle|wcs-reader-nav-rail/);
 const hostRules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(m=>/\.wcs-reader-navigation(?:\[data-wcs-native-compact=true\])?$/.test(m[1].trim()));
 for(const rule of hostRules)assert.doesNotMatch(rule[2],/(?:^|;)\s*(?:width|height|position|left|right|top|bottom|margin|overflow|display|transform)\s*:/);
});

const settle=()=>new Promise(r=>setTimeout(r,20));
function routing(w){w.WCS_ARTICLE_DISCUSSION_CONFIG={rootPageId:'123',spaceKey:'wcspedia',contextPath:'/confluence',workingRootPageId:'800',insightsPageId:'700'};}
function article(id,extra={}){return {id,type:'page',status:'current',space:{key:'wcspedia'},ancestors:[{id:'123'}],metadata:{labels:{results:[{name:'wcs-published'},{name:'wcs-reader'}]}},...extra};}
test('verified child links open reader including new tabs; lazy branches and native collections preserved',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);let calls=0;
 w.fetch=async()=>{calls++;return {ok:true,json:async()=>article('701')};};
 w.eval(source);const list=d.querySelector('ul');list.insertAdjacentHTML('beforeend','<li><a href="/confluence/spaces/wcspedia/pages/701/Article">Article</a></li>');await settle();
 const link=list.lastChild.querySelector('a');assert.equal(link.getAttribute('href'),'/confluence/pages/viewpage.action?pageId=123#/published/701');assert.equal(d.querySelector('.plugin_pagetree_children_span a').getAttribute('href'),'?pageId=700');assert.equal(calls,1);
 w.WCSReaderSidebar.refresh();await settle();assert.equal(calls,1);assert.equal(link.querySelectorAll('svg').length,1);
 w.WCSReaderSidebar.destroy();assert.equal(link.getAttribute('href'),'/confluence/spaces/wcspedia/pages/701/Article');assert.equal(d.querySelectorAll('.wcs-native-page-icon').length,0);
});
test('unmanaged, restricted, other-space and working descendants retain native URLs',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>');routing(w);
 const variants=[article('701',{metadata:{}}),article('702',{space:{key:'other'}}),article('703',{ancestors:[{id:'123'},{id:'800'}]}),null];
 w.document.querySelector('ul').innerHTML=variants.map((_,i)=>'<li><a href="?pageId='+String(701+i)+'">Page</a></li>').join('');
 w.fetch=async url=>{const p=variants[Number(url.match(/content\/(\d+)/)[1])-701];return {ok:!!p,json:async()=>p};};w.eval(source);await settle();assert.equal(w.document.querySelectorAll('a[href*="#/published/"]').length,0);
});
test('requests are bounded, deduplicated and late verification cannot alter a departed reader',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>');routing(w);let inflight=0,max=0;const release=[];
 w.document.querySelector('ul').innerHTML=Array.from({length:8},(_,i)=>'<li><a href="?pageId='+String(701+i%4)+'">Page</a></li>').join('');
 w.fetch=url=>new Promise(resolve=>{inflight++;max=Math.max(max,inflight);release.push(()=>{inflight--;resolve({ok:true,json:async()=>article(url.match(/content\/(\d+)/)[1])});});});
 w.eval(source);assert.equal(release.length,3);w.document.querySelector('.detail-page').remove();w.WCSReaderSidebar.refresh();release.forEach(fn=>fn());await settle();assert.equal(max,3);assert.equal(w.document.querySelectorAll('a[href*="#/published/"]').length,0);
});
test('distinct configured menu icons, leaf dots hidden, exact child suffix cleaned and restored',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);
 w.WCS_ARTICLE_DISCUSSION_CONFIG.areaPageIds={'credit-approval-control':'702','loan-management':'703'};
 d.querySelector('ul').innerHTML='<li><div class="plugin_pagetree_childtoggle_container" id="leaf">•</div><a href="?pageId=702">Credit Approval Control</a></li><li><a href="?pageId=703">Loan management</a></li><li><div class="plugin_pagetree_childtoggle_container" id="branch-marker"><a data-type="toggle" href="?pageId=701">›</a></div><span class="plugin_pagetree_children_span" id="childrenspan701-0"><a href="/confluence/display/wcspedia/Blog">Blog · WCS 701</a></span></li><li><a href="?pageId=704">Another · WCS 999</a></li>';
 w.fetch=async url=>({ok:true,json:async()=>article(url.match(/content\/(\d+)/)[1])});w.eval(source);await settle();
 const anchors=[...d.querySelectorAll('a[data-wcs-native-page-link]')];
 assert.equal(new Set(anchors.slice(0,3).map(a=>a.querySelector('path').getAttribute('d'))).size,3);
 assert.equal(anchors[2].textContent,'Blog');assert.match(anchors[2].href,/#\/published\/701$/);assert.equal(anchors[3].textContent,'Another · WCS 999');
 assert.ok(d.querySelector('#leaf').classList.contains('wcs-native-leaf-marker'));assert.ok(!d.querySelector('#branch-marker').classList.contains('wcs-native-leaf-marker'));assert.equal(d.querySelector('#branch-marker svg'),null);
 d.querySelector('#leaf').innerHTML='<button aria-expanded="false">Expand</button>';await settle();assert.ok(!d.querySelector('#leaf').classList.contains('wcs-native-leaf-marker'));
 w.WCSReaderSidebar.destroy();assert.equal(anchors[2].textContent,'Blog · WCS 701');assert.equal(anchors[2].getAttribute('href'),'/confluence/display/wcspedia/Blog');
});

test('native branch controls stay wired while row styling places them right and collections stay siblings',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);
 w.WCS_ARTICLE_DISCUSSION_CONFIG.areaPageIds={'loan-management':'703'};
 const list=d.querySelector('ul');list.innerHTML='<li id="blogs"><div class="plugin_pagetree_childtoggle_container"><button id="expand" aria-expanded="false">Expand</button></div><div class="plugin_pagetree_children_content"><a href="?pageId=700">Blogs</a></div><div class="plugin_pagetree_children_container" hidden><ul><li>Article</li></ul></div></li><li id="loans"><div class="plugin_pagetree_childtoggle_container">•</div><div class="plugin_pagetree_children_content"><a href="?pageId=703">Loans</a></div></li>';
 const button=d.querySelector('#expand');button.onclick=()=>{button.setAttribute('aria-expanded','true');d.querySelector('.plugin_pagetree_children_container').hidden=false;};
 w.eval(source);assert.equal(d.querySelector('#expand'),button);button.click();assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(d.querySelector('.plugin_pagetree_children_container').hidden,false);
 assert.equal(d.querySelector('#blogs').parentElement,d.querySelector('#loans').parentElement);assert.equal(d.querySelectorAll('.wcs-native-collection').length,2);assert.equal(d.querySelector('#blogs a').textContent,'Insights');assert.equal(d.querySelectorAll('.wcs-native-tree-row').length,2);
 w.WCSReaderSidebar.destroy();assert.equal(d.querySelectorAll('.wcs-native-tree-row,.wcs-native-collection').length,0);assert.equal(d.querySelector('#blogs a').textContent,'Blogs');
});

test('compact mode preserves collection anchors and native expansion, supplies accessible tooltips and restores on exit',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);
 w.WCS_ARTICLE_DISCUSSION_CONFIG.areaPageIds={'loan-management':'703'};
 const list=d.querySelector('ul');list.insertAdjacentHTML('beforeend','<li><span><a id="loans" href="?pageId=703" aria-describedby="help">Loan Management</a></span></li>');
 const original=d.querySelector('#loans'),text=original.firstChild;let clicks=0;original.onclick=e=>{e.preventDefault();clicks++;};
 w.eval(source);d.body.classList.add('ia-splitter-left-collapsed');await settle();
 assert.equal(d.querySelector('#sidebar').dataset.wcsNativeCompact,'true');assert.equal(d.querySelector('#loans'),original);assert.equal(d.querySelectorAll('a[data-wcs-compact-link]').length,2);assert.equal(original.getAttribute('aria-label'),'Loan Management');
 original.focus();assert.equal(d.querySelector('[role=tooltip]').textContent,'Loan Management');assert.match(original.getAttribute('aria-describedby'),/^help wcs-native-sidebar-tooltip$/);
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.querySelector('[role=tooltip]'),null);assert.equal(original.getAttribute('aria-describedby'),'help');
 original.dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));assert.equal(d.querySelector('[role=tooltip]').textContent,'Loan Management');original.click();assert.equal(clicks,1);
 d.body.classList.remove('ia-splitter-left-collapsed');await settle();assert.equal(d.querySelector('#sidebar').dataset.wcsNativeCompact,'false');assert.equal(d.querySelector('[role=tooltip]'),null);
 d.querySelector('#wcspedia').innerHTML='<div class="discovery">Landing</div>';w.WCSReaderSidebar.refresh();assert.equal(original.firstChild,text);assert.equal(original.getAttribute('aria-label'),null);assert.equal(original.getAttribute('aria-describedby'),'help');assert.equal(d.querySelectorAll('.wcs-native-compact-path,[data-wcs-compact-link],[data-wcs-native-compact]').length,0);
});
test('compact mode also follows measured native rail width without rewriting native preferences',t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);let width=56,resize,disconnected=false;
 w.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}disconnect(){disconnected=true;}};
 const host=d.querySelector('#sidebar');host.getBoundingClientRect=()=>({width});w.eval(source);assert.equal(host.dataset.wcsNativeCompact,'true');assert.ok(!d.body.classList.contains('ia-splitter-left-collapsed'));
 width=280;resize();assert.equal(host.dataset.wcsNativeCompact,'false');w.WCSReaderSidebar.destroy();assert.equal(disconnected,true);assert.equal(host.getAttribute('style'),null);
});

test('selected native rows highlight their collection without a mutation refresh loop',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document;routing(w);
 const li=d.querySelector('li');li.classList.add('plugin_pagetree_current');li.querySelector('span').classList.add('plugin_pagetree_children_content');li.querySelector('button').outerHTML='<div class="plugin_pagetree_childtoggle_container"><button>Expand</button></div>';
 w.eval(source);await settle();const a=li.querySelector('a');assert.equal(a.dataset.wcsCurrentCollection,'true');li.classList.remove('plugin_pagetree_current');await settle();assert.equal(a.dataset.wcsCurrentCollection,'false');
});

test('reader uses native collapse once and preserves a subsequent manual expansion',async t=>{
 const w=setup(t,'<div id="wcspedia"><div class="detail-page">Reader</div></div>'),d=w.document,button=d.querySelector('#native-collapse');
 routing(w);button.className='ia-toggle-button';let clicks=0;button.onclick=()=>{clicks++;d.body.classList.toggle('ia-splitter-left-collapsed');};
 w.eval(source);await settle();assert.equal(clicks,1);assert.equal(d.querySelector('#sidebar').getAttribute('data-wcs-native-compact'),'true');
 button.click();d.querySelector('#main-content').append(d.createElement('p'));await settle();assert.equal(clicks,2);assert.equal(d.querySelector('#sidebar').getAttribute('data-wcs-native-compact'),'false');
});
