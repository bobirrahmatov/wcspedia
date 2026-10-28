'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('./editor-content.js');
const ID='12345678-1234-1234-1234-1234567890ab';
const EMBED='https://example.sharepoint.com/sites/Learning/_layouts/15/embed.aspx?UniqueId='+ID;
const LINK='https://example.sharepoint.com/:v:/s/Learning/ExampleRecording?e=abc123';
const marker=(title='Credit approval training',url=EMBED)=>E.videoMarkdown({url,title});
const exported=body=>E.toMarkdown({title:'Recorded training',summary:'A worked example.',bodyMarkdown:body});

test('SharePoint embed URLs normalize to a titled player and ordinary share links remain linked resources',()=>{
  assert.deepEqual(E.videoEmbed(EMBED,'  Credit approval  '),{url:EMBED,embedUrl:EMBED,provider:'SharePoint',title:'Credit approval'});
  assert.deepEqual(E.videoEmbed(LINK,'Credit approval'),{url:LINK,embedUrl:'',provider:'SharePoint',title:'Credit approval'});
  const encoded=E.videoEmbed('https://example.sharepoint.com/sites/Learning/Recording(1).mp4','Recording');
  assert.equal(encoded.url,'https://example.sharepoint.com/sites/Learning/Recording%281%29.mp4');assert.equal(encoded.embedUrl,'');
});

test('official-style wrapped iframe snippets keep only decoded source and plain title',()=>{
  const snippet='<div style="max-width: 853px"><div style="position:relative"><iframe width="853" height="480" src="'+EMBED+'&amp;autoplay=false" title="Credit &amp; approval &quot;basics&quot;" allowfullscreen style="border:none"></iframe></div></div>';
  const value=E.videoEmbed(snippet);assert.equal(value.url,EMBED+'&autoplay=false');assert.equal(value.title,'Credit & approval "basics"');
  assert.equal(E.videoEmbed(snippet,'An editorial title').title,'An editorial title');
  const html=E.render(E.videoMarkdown(value));assert.doesNotMatch(html,/width="853"|height="480"|style="border:none"/);assert.match(html,/title="Credit &amp; approval &quot;basics&quot;"/);
});

test('iframe snippets reject event handlers, srcdoc, duplicate attributes and appended executable markup',()=>{
  for(const attributes of ['onload="alert(1)"','ONERROR=bad','srcdoc="hello"','SRC="'+EMBED+'"','title="one" TITLE="two"'])assert.throws(()=>E.videoEmbed('<iframe src="'+EMBED+'" '+attributes+'></iframe>','Training'),/unmodified|duplicate|script/i);
  for(const snippet of ['<script>alert(1)</script><iframe src="'+EMBED+'"></iframe>','<iframe src="'+EMBED+'"></iframe><iframe src="'+EMBED+'"></iframe>','<iframe src="'+EMBED+'">Unexpected content</iframe>','<iframe src="'+LINK+'"></iframe>'])assert.throws(()=>E.videoEmbed(snippet,'Training'),/single iframe|embed URL/i);
});

test('only HTTPS Microsoft SharePoint tenant hosts can become recording sources',()=>{
  for(const value of ['http://example.sharepoint.com/sites/Learning/video.mp4','https://example.sharepoint.com.evil.test/video','https://example.sharepoint.com@evil.test/video','https://user:password@example.sharepoint.com/video','https://sharepoint.com/video','https://sub.example.sharepoint.com/video','https://example.sharepoint.com:8443/video','https://example.sharepoint.com/','https://evil.test/video','//example.sharepoint.com/video','/sites/Learning/video','javascript:alert(1)','data:text/html,hello','file:///video.mp4'])assert.throws(()=>E.videoEmbed(value,'Training'),/HTTPS|SharePoint/);
});

test('video iframe destinations require exactly one valid UniqueId',()=>{
  for(const query of ['', '?UniqueId=invalid','?UniqueId='+ID+'&UniqueId='+ID,'?UniqueId='+ID+'&uniqueid='+ID,'?UniqueId='+ID+'-extra'])assert.throws(()=>E.videoEmbed(EMBED.split('?')[0]+query,'Training'),/UniqueId/);
  assert.ok(E.videoEmbed(EMBED.replace('UniqueId=','uniqueid='),'Training').embedUrl);
  assert.ok(E.videoEmbed(EMBED.replace(ID,encodeURIComponent('{'+ID+'}')),'Training').embedUrl);
});

test('UniqueId GUID braces must be balanced',()=>{
  for(const value of ['{'+ID,ID+'}'])assert.throws(()=>E.videoEmbed(EMBED.replace(ID,encodeURIComponent(value)),'Training'),/UniqueId/);
});

test('recordings require a concise plain title and reject control characters',()=>{
  for(const value of [undefined,'','   ',17,'a'.repeat(301),'Unsafe\nname','Unsafe\u0000name'])assert.throws(()=>E.videoEmbed(EMBED,value),/title/);
  assert.equal(E.videoEmbed(EMBED,'a'.repeat(300)).title.length,300);
  assert.equal(E.videoEmbed(EMBED,'Crédit — review & approval').title,'Crédit — review & approval');
});

test('canonical video markers round-trip JSON-escaped titles and report exact consumed length',()=>{
  const title='A "quoted" title \\ [version 2]',text=marker(title),parsed=E.videoToken(text+' trailing text');
  assert.equal(parsed.length,text.length);assert.equal(parsed.video.title,title);assert.equal(parsed.video.url,EMBED);
  assert.equal(E.videoMarkdown(parsed.video),text);
  for(const source of ['@[video]('+EMBED+')','@[video]('+EMBED+' "")','@[video]('+EMBED+' "Bad\\x")','@[video](https://evil.test/video "Training")'])assert.equal(E.videoToken(source),null);
});

test('rendered recordings use a titled noneditable player and always include the source fallback',()=>{
  const html=E.render(marker('<img src=x> "training"'));
  assert.match(html,/class="wcs-video" contenteditable="false"/);assert.equal((html.match(/<iframe /g)||[]).length,1);
  assert.match(html,/loading="lazy"/);assert.match(html,/sandbox="[^"]*allow-scripts/);assert.match(html,/allowfullscreen/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/Open in SharePoint/);
  assert.match(html,/title="&lt;img src=x&gt; &quot;training&quot;"/);assert.doesNotMatch(html,/<img|<script|srcdoc=/);
  const linked=E.render(marker('Training',LINK));assert.doesNotMatch(linked,/<iframe/);assert.match(linked,/This recording opens in SharePoint/);assert.match(linked,/Open in SharePoint/);
});

test('search projection includes the recording title and stable heading without iframe code or source URL',()=>{
  const source='## Prepare for your review\n\n'+marker('Credit approval walkthrough')+'\n\nFollow the approved job aid.';
  const sections=E.toSections(source);assert.equal(sections[0].id,'prepare-for-your-review');assert.ok(sections[0].paragraphs.includes('Recording: Credit approval walkthrough'));
  assert.doesNotMatch(JSON.stringify(sections),/sharepoint\.com|iframe|UniqueId/);assert.match(E.render(source),/<h2 id="prepare-for-your-review">/);
});

test('portable Markdown exports playable markers as readable source links with safely escaped titles',()=>{
  const output=exported(marker('Review [guide] *basics*'));assert.match(output,/\[Watch recording: Review \\\[guide\\\] \\\*basics\\\*\]\(https:/);assert.ok(output.includes(']('+EMBED+')'));
  assert.doesNotMatch(output,/@\[video\]|<iframe/);
});

test('portable Markdown preserves video examples inside fenced, indented and single-line code',()=>{
  const token=marker(),examples=['```markdown\n'+token+'\n```','~~~markdown\n'+token+'\n~~~','Example:\n\n    '+token,'`'+token+'`','``A literal ` '+token+' ``'];
  for(const body of examples){const output=exported(body);assert.ok(output.includes(body),body);assert.doesNotMatch(output,/\[Watch recording:/);assert.doesNotMatch(E.render(body),/<iframe/);}
});

test('portable Markdown preserves multiline inline-code video examples',()=>{
  const body='Read this example: `before\n'+marker()+'\nafter`.';assert.ok(exported(body).includes(body));assert.doesNotMatch(E.render(body),/<iframe/);
});

test('portable Markdown preserves explicitly escaped video marker examples',()=>{
  const body='Literal syntax: \\'+marker();assert.ok(exported(body).includes(body));assert.doesNotMatch(E.render(body),/<iframe/);
});

test('portable Markdown converts recording titles containing backticks alongside real inline code',()=>{
  const body='Keep `this example` literal. '+marker('Using `quoted code` in training'),output=exported(body);
  assert.ok(output.includes('`this example`'));assert.ok(output.includes('[Watch recording: Using \\`quoted code\\` in training]'));assert.doesNotMatch(output,/@\[video\]/);
});

test('unmatched backticks in separate paragraphs cannot hide a real recording during export',()=>{
  const body='A stray ` delimiter\n\n'+marker()+'\n\nAnother stray ` delimiter',output=exported(body);
  assert.ok(output.includes('[Watch recording: Credit approval training]'));assert.doesNotMatch(output,/@\[video\]/);
});

test('portable Markdown import retains canonical recording markers without creating an uploaded asset',()=>{
  const body='## Watch the recording\n\n'+marker(),result=E.normalizeImport(body,{assets:[],attachments:[]});assert.equal(result.bodyMarkdown,body);assert.deepEqual(result.assets,[]);assert.deepEqual(result.attachments,[]);assert.match(E.render(result.bodyMarkdown),/<iframe/);
});
