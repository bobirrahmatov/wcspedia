'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const metrics = require('./document-metrics.js');
const content = require('./editor-content.js');
const MarkdownIt = require('./vendor/markdown-it-15.0.2.min.js');
const words = count => Array(count).fill('guidance').join(' ');
const pixel = 'data:image/png;base64,iVBORw0KGgo=';

test('recorded training counts its title, not URL tokens or video watch time', () => {
  const video=content.videoMarkdown(content.videoEmbed('https://training.sharepoint.com/sites/learn/_layouts/15/embed.aspx?UniqueId=12345678-1234-1234-1234-123456789abc','Review essentials'));
  assert.deepEqual(metrics.estimate({bodyMarkdown:video}), {words:2,images:0,seconds:0.6,minutes:1});
  assert.equal(metrics.readableText({bodyMarkdown:video}),'Review essentials');
});

test('reading time uses 200 words per minute and rounds only the displayed minutes up', () => {
  assert.deepEqual(metrics.estimate({bodyMarkdown:words(200)}), {words:200,images:0,seconds:60,minutes:1});
  assert.deepEqual(metrics.estimate({bodyMarkdown:words(201)}), {words:201,images:0,seconds:60.3,minutes:2});
  assert.equal(metrics.estimate({bodyMarkdown:'Read'}).seconds, 0.3);
  assert.equal(metrics.estimate({bodyMarkdown:'Read'}).minutes, 1);
  for (const version of [null,{}, {bodyMarkdown:''}, {bodyMarkdown:'---\n\n***'}]) {
    assert.deepEqual(metrics.estimate(version), {words:0,images:0,seconds:0,minutes:0});
  }
});

test('canonical Markdown replaces derived sections without counting content twice', () => {
  const body = '## Check details\n\nKeep the evidence.\n\n- Confirm receipt.';
  const base = {title:'Handover guide',summary:'Transfer safely.',bodyMarkdown:body,sections:content.toSections(body),highlights:['Confirm ownership.']};
  assert.equal(metrics.estimate(base).words, 13);
  assert.deepEqual(metrics.estimate(base),metrics.estimate({...base,sections:[]}));
  assert.equal(metrics.estimate({bodyMarkdown:'',sections:[{title:'Stale',paragraphs:[words(400)]}]}).words,0);
});

test('legacy section headings, paragraphs and bullets are counted with title, summary and explicit highlights', () => {
  const version={title:'Document title',summary:'Short summary',highlights:['First point'],sections:[{title:'Section heading',paragraphs:['A plain paragraph.'],bullets:['Check evidence.']}]};
  assert.equal(metrics.estimate(version).words, 13);
  assert.equal(metrics.readableText(version),'Document title Short summary First point Section heading A plain paragraph. Check evidence.');
  assert.equal(metrics.estimate({...version,tags:[words(100)],processes:[words(100)],regions:[words(100)]}).words,13);
});

test('Markdown counts visible link labels, tables and list text without syntax, destinations or definition URLs', () => {
  const body = '# Guide\n\nRead **this** [handbook](https://example.com/a/very/long/path?one=two).\n\n[Reference guide][ref]\n\n| Step | Owner |\n| --- | --- |\n| Prepare | Author |\n\n1. Review evidence\n2. Submit request\n\n[ref]: https://example.com/hidden/many/many/many/words';
  assert.equal(metrics.estimate({bodyMarkdown:body}).words,14);
  assert.equal(metrics.readableText({bodyMarkdown:body}).includes('https'),false);
});

test('inline formatting does not split one displayed word and line breaks separate words', () => {
  assert.equal(metrics.estimate({bodyMarkdown:'doc**ument**ation'}).words,1);
  assert.equal(metrics.estimate({bodyMarkdown:'doc<u>ument</u>ation'}).words,1);
  assert.equal(metrics.estimate({bodyMarkdown:'First\nsecond<br>third'}).words,3);
  assert.equal(metrics.estimate({bodyMarkdown:'Use `account_id` safely.'}).words,3);
});

test('each valid displayed image receives ten seconds, including repeated inline images and a separate cover', () => {
  const version={bodyMarkdown:'![Diagram](attachment:diagram)\n\n![Diagram again](attachment:diagram)\n\n![Photo](https://example.com/photo.png)\n\n![Missing diagram](attachment:missing)',assets:[{id:'diagram',src:pixel,alt:'Diagram'}],cover:{src:pixel,alt:'Cover',caption:'Process overview'}};
  const value=metrics.estimate(version);
  assert.equal(value.images,4);
  assert.equal(value.words,4); // Cover caption plus the visible missing-image placeholder.
  assert.equal(value.seconds,41.2);
  assert.equal(value.minutes,1);
  assert.equal(metrics.estimate({bodyMarkdown:'![Only image]('+pixel+')'}).minutes,1);
});

test('unused assets, linked attachments, embedded video duration and decorative fallback do not add image time', () => {
  const version={bodyMarkdown:'[Template](attachment:template)\n\n@[embed](https://example.com/training)',assets:[{id:'unused',src:pixel,alt:'Unused'}],attachments:[{id:'template',name:words(100),url:'data:application/pdf;base64,'+'a'.repeat(10000),duration:3600}],cover:{src:'javascript:alert(1)',alt:'Bad'},duration:3600};
  assert.deepEqual(metrics.estimate(version),{words:4,images:0,seconds:1.2,minutes:1});
  assert.equal(metrics.estimate({bodyMarkdown:'```md\n![Example](https://example.com/image.png)\n```'}).images,0);
});

test('code keeps readable tokens but excludes fence language, URL and data payloads', () => {
  const body='```javascript\nconst name = "Alice";\nhttps://example.com/code/path\ndata:application/pdf;base64,'+'a'.repeat(10000)+'\n```';
  assert.equal(metrics.estimate({bodyMarkdown:body}).words,3);
});

test('unsafe raw HTML, comments, URLs and base64 payloads cannot inflate the estimate', () => {
  const body='Visible words.\n\n<script>'+words(500)+'</script>\n<style>'+words(500)+'</style>\n<iframe src="https://example.com">'+words(500)+'</iframe>\n<!-- '+words(500)+' -->\n\nhttps://example.com/one/two/three\n\n<https://example.com/four/five>\n\ndata:text/plain;base64,'+'a'.repeat(10000);
  assert.equal(metrics.estimate({bodyMarkdown:body}).words,2);
  assert.equal(metrics.estimate({bodyMarkdown:'Before<script>unterminated '+words(1000)}).words,1);
});

test('Unicode words work with Intl segmentation and the deterministic fallback', () => {
  const version={bodyMarkdown:'Zażółć gęślą jaźń Привет мир مرحبا بالعالم'};
  assert.equal(metrics.estimate(version).words,7);
  assert.ok(metrics.estimate({bodyMarkdown:'客户信贷服务'}).words>0);
  const context={WCSMarkdownIt:MarkdownIt,WCSEditorContent:content,Intl:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./document-metrics.js'),'utf8'),context);
  assert.equal(context.WCSDocumentMetrics.estimate(version).words,7);
  assert.equal(context.WCSDocumentMetrics.estimate({bodyMarkdown:"Don't re-enter café"}).words,4);
});

test('estimate options are explicit, validated and do not mutate snapshots', () => {
  const version={bodyMarkdown:words(240),cover:{src:pixel,alt:'Cover'}};
  const before=JSON.stringify(version);
  assert.deepEqual(metrics.estimate(version,{wordsPerMinute:240,imageSeconds:12}),{words:240,images:1,seconds:72,minutes:2});
  assert.equal(metrics.estimate({cover:{src:pixel,alt:'Cover'}},{imageSeconds:0}).minutes,1);
  assert.equal(JSON.stringify(version),before);
  for(const value of [0,-1,NaN,Infinity,'200',null]) assert.throws(()=>metrics.estimate(version,{wordsPerMinute:value}),RangeError);
  for(const value of [-1,NaN,Infinity,'10',null]) assert.throws(()=>metrics.estimate(version,{imageSeconds:value}),RangeError);
});
