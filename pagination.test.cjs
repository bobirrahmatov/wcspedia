'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pagination=require('./pagination.js');
const pages=(total,current)=>pagination.items(total,current).map(item=>item.type==='page'?item.page:'…');
test('shows the first and last three pages with an active-page neighborhood',()=>{
  assert.deepEqual(pages(100,1),[1,2,3,'…',98,99,100]);
  assert.deepEqual(pages(100,50),[1,2,3,'…',49,50,51,'…',98,99,100]);
  assert.deepEqual(pages(100,100),[1,2,3,'…',98,99,100]);
});
test('single missing page is shown, adjacent groups are deduplicated',()=>{
  assert.deepEqual(pages(10,5),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(pages(11,5),[1,2,3,4,5,6,'…',9,10,11]);
  assert.deepEqual(pages(7,4),[1,2,3,4,5,6,7]);
});
test('empty, small, and out-of-range page inputs have deterministic bounds',()=>{
  assert.deepEqual(pages(0,1),[]); assert.deepEqual(pages(1,99),[1]);
  assert.deepEqual(pages(2,-3),[1,2]); assert.deepEqual(pages(NaN,1),[]);
  assert.equal(pagination.items(10,999).find(item=>item.current).page,10);
  assert.equal(pagination.items(10,NaN).find(item=>item.current).page,1);
});
test('very large totals stay bounded, sorted, and include the current page once',()=>{
  for(const total of [1000,1000000000,Number.MAX_SAFE_INTEGER]) {
    for(const current of [1,4,50,Math.floor(total/2),total-3,total]) {
      const items=pagination.items(total,current),numbers=items.filter(item=>item.type==='page').map(item=>item.page);
      assert.ok(items.length<=13); assert.equal(new Set(numbers).size,numbers.length);
      assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));
      assert.equal(items.filter(item=>item.current).length,1);
      assert.equal(items.find(item=>item.current).page,current);
      assert.ok(items.filter(item=>item.type==='ellipsis').every(item=>item.to-item.from>=1));
    }
  }
});
test('render distinguishes current, disabled, and omitted pages without interactive gaps',()=>{
  const html=pagination.render({totalPages:100,currentPage:1,href:page=>'#/results?q=credit&page='+page});
  assert.match(html,/<nav class="wcs-pagination" aria-label="Pagination">/);
  assert.match(html,/wcs-page-previous[^>]*aria-label="Previous page" aria-disabled="true"/);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.match(html,/href="#\/results\?q=credit&amp;page=2"/);
  assert.match(html,/<li class="wcs-page-gap"><span aria-hidden="true">…<\/span>/);
  assert.doesNotMatch(html,/<(?:a|button)[^>]*>…/);
  assert.match(pagination.render({totalPages:3,currentPage:3}),/wcs-page-next[^>]*aria-label="Next page" aria-disabled="true"/);
});
test('render escapes caller labels and rejects executable URL schemes',()=>{
  const html=pagination.render({totalPages:5,currentPage:3,ariaLabel:'<script>x</script>',href:()=> 'javascript:alert(1)'});
  assert.match(html,/aria-label="&lt;script&gt;x&lt;\/script&gt;"/);assert.doesNotMatch(html,/href=/);
  assert.equal(pagination.render({totalPages:0}),'');
});
