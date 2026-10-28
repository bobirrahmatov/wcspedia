/* Shared governance presentation. Decisions are validated again by workflow.js
 * and the authenticated service; display helpers never confer permissions. */
(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {'other-nhd':'Other non-hierarchy document','other-bod':'Other business owned document','formal-reference':'Formal source reference',unclassified:'Classification review needed'};
  const checks = {
    classification:'The classification is appropriate for this document.',
    ownership:'The named owner and team are accountable for this content.',
    scope:'The scope, audience and regional applicability are clear.',
    sources:'Applicable authoritative sources and their versions have been checked.',
    guardrails:'The content introduces no new mandatory obligations, does not conflict with or reinterpret formal requirements, and is not an unapproved sole authority for Tier 1 regulation.',
    reviewPlan:'The business review target and change-triggered maintenance approach are appropriate.'
  };
  const href = value => {try { const url = new URL(value, root.location?.href); return url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; }};
  function tag(version,doc) {if(root.WCSEditorContent?.isInsightType(doc?.type))return '';const value=version?.governance?.classification||'unclassified';return '<span class="wcs-governance-tag"'+(value==='unclassified'?' data-governance-unclassified':'')+'>'+esc(labels[value]||labels.unclassified)+'</span>';}
  function metadata(version) {
    const g=version?.governance;
    if (!g) return '<p class="quiet-note">Governance information has not been assessed for this retained version. Classify it in a new draft; its approval history is unchanged.</p>';
    const row=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'Not recorded')+'</dd></div>';
    return '<dl class="wcs-governance-metadata">'+row('Classification',labels[g.classification])+row('Owning team',g.owningTeam)+row('Scope',g.scope)+row('Intended audience',g.audience)+(g.supportingTeam?row('Supporting team',g.supportingTeam):'')+row('Classification rationale',g.classificationRationale)+row('Review basis',g.reviewBasis==='formal-governance'?'Applicable formal governance process':'Business best practice · within 24 calendar months; sooner when changes occur')+row('Guidance baseline',g.baselineVersion)+'</dl>'+(g.sources?.length?'<h3 class="wcs-governance-sources-title">Authoritative references</h3><ul class="wcs-governance-sources">'+g.sources.map(source=>{const link=href(source.url);return '<li>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title||source.id)+'</a>':esc(source.title||source.id))+'<span>'+esc([source.id,source.version?'Version '+source.version:'Version not recorded',source.lastVerifiedAt?'Verified '+source.lastVerifiedAt:'Not yet verified'].join(' · '))+'</span></li>';}).join('')+'</ul>':'<p class="quiet-note">No authoritative references recorded. The reviewer assesses whether sources are applicable.</p>');
  }
  function findings(doc,version) {
    const report=root.WCSGovernance.assess(doc,version),issues=report.metadataIssues||[],flags=report.flags||[];
    const issueText=issue=>typeof issue==='string'?issue:issue.message||issue.label||issue.field||'Metadata needs review';
    return '<div class="wcs-governance-findings">'+(issues.length?'<p><strong>Complete before submission</strong></p><ul>'+issues.map(issue=>'<li>'+esc(issueText(issue))+'</li>').join('')+'</ul>':'<p class="quiet-note">Required governance metadata is present. Human review remains necessary.</p>')+(flags.length?'<details class="wcs-governance-flags" open><summary>'+flags.length+' passage'+(flags.length===1?'':'s')+' to assess</summary><p class="quiet-note">Matches identify wording to review. They do not determine a breach or grant an exception.</p><ol>'+flags.map(flag=>'<li><strong>'+esc(flag.term||flag.label||flag.code||'Wording review')+'</strong><span>'+esc(flag.field||flag.location||'Content')+'</span><blockquote>'+esc(flag.snippet||flag.excerpt||flag.message||'Review the matching wording in context.')+'</blockquote></li>').join('')+'</ol></details>':'<p class="quiet-note">No configured wording matches. This is not a compliance certification.</p>')+'</div>';
  }
  function summary(doc,version) {
    if(root.WCSEditorContent?.isInsightType(doc?.type))return '';
    const evidence=version.governanceReview;
    return '<details class="wcs-governance-panel"><summary>'+tag(version,doc)+'<span>Governance & source checks</span></summary><div class="wcs-governance-panel-body">'+metadata(version)+findings(doc,version)+(evidence?'<p class="wcs-governance-evidence"><strong>Reviewer assessment recorded</strong><br>Version '+esc(evidence.version)+' · revision '+esc(evidence.revision)+' · '+esc(evidence.findingDisposition)+'<br>'+esc(evidence.reason)+'</p>':'')+'</div></details>';
  }
  function reviewForm(doc,version) {
    const report=root.WCSGovernance.assess(doc,version);
    return '<div class="wcs-governance-review-form">'+findings(doc,version)+'<fieldset><legend>Review this exact revision</legend>'+Object.entries(checks).map(([key,label])=>'<label class="wcs-governance-check"><input type="checkbox" name="governance-'+key+'" required><span>'+esc(label)+'</span></label>').join('')+'</fieldset><div class="form-group"><label for="governance-disposition">Wording assessment</label><select id="governance-disposition" name="governance-disposition" required><option value="">Choose the outcome</option>'+(!report.flags.length?'<option value="clear">No configured wording flags</option>':'')+'<option value="addressed">Flagged wording assessed with documented rationale</option><option value="changes-required">Content changes are needed</option><option value="needs-authority">Guidance or exception authority is needed</option></select></div><p class="quiet-note">Document your reasoning in the decision comment. Changes needed or authority needed cannot complete review. This action cannot grant a policy or regulatory exception; return the document with the required follow-up.</p></div>';
  }
  function readReview(fields,version) {
    return {version:version.version,revision:version.revision,baselineVersion:version.governance?.baselineVersion,checks:Object.fromEntries(Object.keys(checks).map(key=>[key,fields.has('governance-'+key)])),findingDisposition:String(fields.get('governance-disposition')||''),reason:String(fields.get('action-comment')||'').trim()};
  }
  root.WCSGovernanceUI=Object.freeze({tag,metadata,findings,summary,reviewForm,readReview});
})(typeof globalThis!=='undefined'?globalThis:this);
