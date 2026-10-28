/* Versioned business-document metadata and deterministic review prompts.
 * These checks support human review; they do not certify compliance or grant
 * exceptions to a formal governance process. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WCSGovernance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var BASELINE_VERSION='wcs-other-documents-2026-10-09-v1';
  var CLASSIFICATIONS=Object.freeze({'other-nhd':'OtherNHD','other-bod':'OtherBOD','formal-reference':'Formal document reference','unclassified':'Unclassified'});
  var BASELINE=Object.freeze({version:BASELINE_VERSION,reviewMonths:24,reviewBasis:'business-best-practice',restrictedTerms:Object.freeze(['policy / policies','standard / standards','procedure / procedures','framework / frameworks','operating manual / operating manuals']),notice:'Business review is expected at least every two years as best practice; this is not a mandatory periodic governance cycle. Human review does not grant formal exceptions.'});
  var reviewChecklist=Object.freeze([
    Object.freeze({key:'classification',label:'The document classification and rationale have been checked against the applicable guidance.'}),
    Object.freeze({key:'ownership',label:'A named owner and accountable owning team are identified.'}),
    Object.freeze({key:'scope',label:'Scope, intended audience, and regional applicability are clear.'}),
    Object.freeze({key:'sources',label:'Source applicability and the recorded source references have been checked.'}),
    Object.freeze({key:'guardrails',label:'Content flags have been reviewed; no unresolved issue or formal exception is being approved here.'}),
    Object.freeze({key:'reviewPlan',label:'The business review target and circumstances for an earlier review have been considered.'})
  ]);
  function fail(message){var error=new Error(message);error.code='GOVERNANCE_INPUT';throw error;}
  function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
  function has(value,key){return Object.prototype.hasOwnProperty.call(value,key);}
  function plain(value,label,max){if(value==null)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail(label+' must be text of no more than '+max+' characters.');return value.trim();}
  function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return null;var parts=value.slice(0,10).split('-').map(Number),calendar=new Date(Date.UTC(parts[0],parts[1]-1,parts[2])),parsed=new Date(value);return calendar.getUTCFullYear()===parts[0]&&calendar.getUTCMonth()===parts[1]-1&&calendar.getUTCDate()===parts[2]&&Number.isFinite(parsed.getTime())?parsed:null;}
  function nextReviewDate(value,months){var source=date(value);months=months==null?24:months;if(!source||!Number.isSafeInteger(months)||months<1||months>1200)fail('Use a valid ISO date and 1–1200 calendar months.');var year=source.getUTCFullYear(),month=source.getUTCMonth()+months,day=source.getUTCDate(),last=new Date(Date.UTC(year,month+1,0)).getUTCDate();return new Date(Date.UTC(year,month,Math.min(day,last))).toISOString().slice(0,10);}
  function normalize(value){
    if(value==null)value={};if(!object(value))fail('Governance metadata must be an object.');
    var allowed=['baselineVersion','classification','owningTeam','scope','audience','supportingTeam','classificationRationale','sources','reviewBasis','reviewMonths'];if(Object.keys(value).some(function(k){return allowed.indexOf(k)<0;}))fail('Governance metadata contains an unsupported field.');
    var classification=value.classification==null?'unclassified':value.classification;if(!has(CLASSIFICATIONS,classification))fail('Choose a recognised document classification.');
    var baseline=value.baselineVersion==null?BASELINE_VERSION:value.baselineVersion;if(baseline!==BASELINE_VERSION)fail('This governance baseline is not supported.');
    var basis=value.reviewBasis==null?(classification==='formal-reference'?'formal-governance':'business-best-practice'):value.reviewBasis;if(['business-best-practice','formal-governance'].indexOf(basis)<0)fail('Choose a recognised review basis.');
    if(value.reviewMonths!=null&&value.reviewMonths!==24)fail('This baseline uses a 24-month business review target.');
    var sources=value.sources==null?[]:value.sources;if(!Array.isArray(sources)||sources.length>30)fail('Use no more than 30 source references.');var ids=new Set();
    sources=sources.map(function(source){if(!object(source)||Object.keys(source).some(function(k){return ['id','title','url','version','lastVerifiedAt'].indexOf(k)<0;}))fail('Use only the source identity, title, URL, version, and verification date.');var result={id:plain(source.id,'Source ID',100),title:plain(source.title,'Source title',300),url:plain(source.url,'Source URL',2000),version:plain(source.version,'Source version',120),lastVerifiedAt:plain(source.lastVerifiedAt,'Source verification date',40)};
      if(result.id){if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(result.id)||ids.has(result.id))fail('Source IDs must be valid and unique.');ids.add(result.id);}
      if(result.url){var url;try{url=new URL(result.url);}catch(_){fail('Source references must use complete HTTPS URLs.');}if(url.protocol!=='https:'||url.username||url.password||/[\s<>"'\\]/.test(result.url))fail('Source references must use complete HTTPS URLs without credentials.');}
      if(result.lastVerifiedAt&&!date(result.lastVerifiedAt))fail('Use a valid ISO source verification date.');return result;});
    return {baselineVersion:baseline,classification:classification,owningTeam:plain(value.owningTeam,'Owning team',200),scope:plain(value.scope,'Scope',2000),audience:plain(value.audience,'Audience',1000),supportingTeam:plain(value.supportingTeam,'Supporting team',300),classificationRationale:plain(value.classificationRationale,'Classification rationale',2000),sources:sources,reviewBasis:basis,reviewMonths:24};
  }
  function metadataIssues(value,now){var issues=[];function issue(field,message){issues.push({field:field,message:message});}if(value.classification==='unclassified')issue('classification','Select and explain the document classification.');['owningTeam','scope','audience','classificationRationale'].forEach(function(field){if(!value[field])issue(field,'Complete '+({owningTeam:'the owning team',scope:'the document scope',audience:'the intended audience',classificationRationale:'the classification rationale'})[field]+'.');});
    if(value.classification==='formal-reference'&&value.reviewBasis!=='formal-governance')issue('reviewBasis','Formal references follow the authoritative document’s governance process.');if(['other-nhd','other-bod'].indexOf(value.classification)>=0&&value.reviewBasis!=='business-best-practice')issue('reviewBasis','Use the business best-practice review basis for this classification.');
    value.sources.forEach(function(source,index){['id','title','url','version','lastVerifiedAt'].forEach(function(field){if(!source[field])issue('sources.'+index+'.'+field,'Complete the '+({id:'source ID',title:'source title',url:'source URL',version:'source version',lastVerifiedAt:'last verified date'})[field]+' for source '+(index+1)+'.');});if(source.lastVerifiedAt&&now&&date(source.lastVerifiedAt)>now)issue('sources.'+index+'.lastVerifiedAt','A source verification date cannot be in the future.');});return issues;}
  function validate(value,options){var result=normalize(value);if(options&&options.complete){var issues=metadataIssues(result,options.now?date(options.now):null);if(issues.length)fail(issues.map(function(i){return i.message;}).join(' '));}return result;}
  function assess(doc,version,options){options=options||{};version=version||{};var value,issues=[];try{value=normalize(version.governance);issues=metadataIssues(value,options.now?date(options.now):null);}catch(error){value=normalize();issues=[{field:'governance',message:error.message}];}
    var body=(version.summary||'')+'\n'+(version.bodyMarkdown|| (version.sections||[]).map(function(section){return [section.title].concat(section.paragraphs||[],section.bullets||[]).join('\n');}).join('\n'))+'\n'+(version.highlights||[]).join('\n'),flags=[];
    function scan(text,location,kind,pattern){var match;while((match=pattern.exec(String(text)))){flags.push({id:location+'-'+kind+'-'+match.index,kind:kind,term:match[0],location:location,snippet:String(text).slice(Math.max(0,match.index-60),Math.min(String(text).length,match.index+match[0].length+80)).replace(/\s+/g,' ').trim()});}}
    ['title','body'].forEach(function(location){var source=location==='title'?(version.title||''):body;scan(source,location,'restricted-term',/\b(?:polic(?:y|ies)|standards?|procedures?|frameworks?|operating\s+manuals?)\b/gi);scan(source,location,'mandatory-wording',/\b(?:must|shall|mandatory|required|prohibited)\b/gi);});
    ['scope','audience','classificationRationale'].forEach(function(field){scan(value[field],'governance-'+field,'restricted-term',/\b(?:polic(?:y|ies)|standards?|procedures?|frameworks?|operating\s+manuals?)\b/gi);scan(value[field],'governance-'+field,'mandatory-wording',/\b(?:must|shall|mandatory|required|prohibited)\b/gi);});
    value.sources.forEach(function(source,index){scan(source.title,'source-'+index,'restricted-term',/\b(?:polic(?:y|ies)|standards?|procedures?|frameworks?|operating\s+manuals?)\b/gi);});
    var target=null;if(['other-nhd','other-bod'].indexOf(value.classification)>=0&&date(version.approvedAt))target=nextReviewDate(version.approvedAt,24);
    return {metadataIssues:issues,flags:flags,classification:value.classification,label:CLASSIFICATIONS[value.classification],reviewTarget:target};
  }
  return Object.freeze({BASELINE_VERSION:BASELINE_VERSION,BASELINE:BASELINE,classifications:CLASSIFICATIONS,reviewChecklist:reviewChecklist,normalize:normalize,validate:validate,assess:assess,nextReviewDate:nextReviewDate});
});
