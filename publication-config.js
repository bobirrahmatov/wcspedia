/* Shared, non-secret Confluence Server publication routing.
 * Upload this file once beside wcspedia.js and configure the real page IDs.
 * The trusted workflow service must use its own independently managed mapping.
 * Browser configuration is a consistency check, never a permission grant.
 */
(function (root, factory) {
  'use strict';
  var configuration = factory();
  if (typeof module === 'object' && module.exports) module.exports = configuration;
  else root.WCS_PUBLICATION_CONFIG = configuration;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return Object.freeze({
    enabled: true,
    workingRootPageId: 'REPLACE_WITH_RESTRICTED_WORKING_ROOT_PAGE_ID',
    publishedRootPageId: 'REPLACE_WITH_PUBLISHED_LIBRARY_ROOT_PAGE_ID',
    insightsPageId: 'REPLACE_WITH_INSIGHTS_PAGE_ID',
    insightsTypes: Object.freeze(['Procedure','Knowledge sharing','Blog','Training','Reference','Report','Guide','Playbook','Checklist','Template','FAQ']),
    areaPageIds: Object.freeze({
      'credit-approval-control': 'REPLACE_WITH_CREDIT_APPROVAL_CONTROL_PAGE_ID',
      'credit-information-management': 'REPLACE_WITH_CREDIT_INFORMATION_MANAGEMENT_PAGE_ID',
      'credit-management-reporting': 'REPLACE_WITH_CREDIT_MANAGEMENT_REPORTING_PAGE_ID',
      'deal-closing': 'REPLACE_WITH_DEAL_CLOSING_PAGE_ID',
      'documentation-pledging': 'REPLACE_WITH_DOCUMENTATION_PLEDGING_PAGE_ID',
      'emea-credit-admin': 'REPLACE_WITH_EMEA_CREDIT_ADMIN_PAGE_ID',
      'loan-management': 'REPLACE_WITH_LOAN_MANAGEMENT_PAGE_ID',
      'regional-operating-manuals': 'REPLACE_WITH_REGIONAL_OPERATING_MANUALS_PAGE_ID'
    })
  });
});
