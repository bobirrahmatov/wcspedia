/* Upload as native-confluence-config.js to the shared WCSpedia asset page.
 * Replace placeholders before enabling the live integration. Never put a token,
 * password, user role, or asserted SOEID in this browser configuration.
 */
(function (root) {
  'use strict';
  root.WCS_NATIVE_CONFIG = root.WCS_NATIVE_CONFIG || {
    mode: 'native-page',
    authoringMode: 'workflow',
    contextPath: '/confluence',
    assetPageId: 'REPLACE_WITH_ASSET_PAGE_ID',
    publishedRootPageId: 'REPLACE_WITH_PUBLISHED_ROOT_PAGE_ID',
    workingRootPageId: 'REPLACE_WITH_WORKING_ROOT_PAGE_ID',
    publishedSpaceKey: 'REPLACE_WITH_PUBLISHED_SPACE_KEY',
    workingSpaceKey: 'REPLACE_WITH_WORKING_SPACE_KEY',
    nativeWorkflowEndpoint: '',
    pageRole: 'home',
    pages: {
      home: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_LIBRARY_PAGE_ID',
      mine: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_MY_WORKSPACE_PAGE_ID',
      review: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_REVIEWER_WORKSPACE_PAGE_ID',
      saved: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_SAVED_ITEMS_PAGE_ID',
      entitlements: '/confluence/pages/viewpage.action?pageId=REPLACE_WITH_ENTITLEMENTS_PAGE_ID'
    }
  };
}(window));
