# PAL sidebar verification

Captured on 28 October 2026 through the Codex browser against `tests/fixtures/pal-reader-sidebar.html`.

The fixture exercises an existing Confluence-style tree and native collapse handler, competing native SVG/pseudo-element rules, a footer, an administration menu, and a document reader. It uses the repository's Citi Text font for local demonstration. Production resolves only fonts already registered by the Confluence theme. The header and article are synthetic verification content, not a capture of the internal site.

Verified expanded and collapsed rails in light and dark mode, centered compact icons, a top control forwarding to the original handler, child expansion, clean article labels, and hidden Space tools/Configure sidebar. Reader URL verification, teardown, font loading, startup, and package integration are covered by automated tests (105 passing in the targeted release run).

The screenshots do not establish live Confluence behavior or exact pixel parity with a particular installed theme. After deployment, verify one reader in both native theme modes and confirm that leaving the reader restores the original sidebar.

The breadcrumb follow-up verifies PAL slash separators, 14px regular navigation, and current-title semantics. Computed browser styles resolve to `Citi-Sans-Text` and `Citi-Sans-Display, Citi-Sans-Text`. This fixture has only the local Citi Text face, so title artwork uses that fallback; production uses the Display face supplied by the existing space stylesheet. The targeted follow-up suite passes 117 tests.
