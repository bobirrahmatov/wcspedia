# SharePoint recordings in WCSpedia

WCSpedia can display a titled recording from SharePoint Online inside an article or training page. The video remains in SharePoint; WCSpedia stores its URL and title in the versioned Markdown body. It does not upload the recording, copy its permissions, or make it public.

## Add a recording

1. Open the recording in its Microsoft 365 web player.
2. Choose **Share → Embed code**, select the playback options, and copy the embed code.
3. Use WCSpedia’s recording control to paste the code and give the recording a useful title, such as “Credit approval: preparing the review evidence.”
4. Preview the page, save the draft, and follow the document’s normal review and approval workflow.

The player requires a signed-in Microsoft 365 user who already has access to the underlying file. Check **Manage access** in SharePoint before distributing the WCSpedia page. Microsoft documents embedding in third-party sites for internal users; a copied embed code does not grant access. [Microsoft’s embedding guidance](https://support.microsoft.com/en-us/clipchamp/stream-pages/embedding-a-clipchamp-video-or-audio-file-in-third-party-sites).

An ordinary SharePoint recording link is also accepted. It becomes a recording card with **Open in SharePoint**, rather than an iframe. The same fallback link remains available beneath an embedded player. Use it if sign-in, browser privacy settings, or host restrictions prevent inline playback.

## Storage and rendering

The editor stores a canonical marker:

```markdown
@[video](https://YOUR-TENANT.sharepoint.com/sites/Learning/_layouts/15/embed.aspx?UniqueId=12345678-1234-1234-1234-1234567890ab "Recording title")
```

Use the real URL returned by SharePoint; the example ID above is a placeholder. Portable Markdown exports convert a live recording marker to a readable source link. Literal examples in code blocks, inline code, and escaped Markdown remain unchanged. Search text includes the recording title. Estimated reading minutes do not represent the recording’s duration, and page views do not establish training completion.

Pasted embed HTML is parsed as inert text. Only the validated source URL and plain title are retained. The renderer creates its own iframe with an accessible title, sandbox restrictions, lazy loading, and an **Open in SharePoint** link. Supplied styles, permissions, event handlers, and other HTML are never executed or copied into the page. Raw HTML in Markdown remains disabled.

## Allowed sources and production configuration

The prototype accepts HTTPS URLs on a single tenant subdomain of `sharepoint.com`, `sharepoint.us`, `sharepoint.de`, or `sharepoint.cn`. This is a Microsoft-host validation rule, not a Citi tenant allowlist. Nested subdomains, credentials in URLs, nonstandard ports, and unrelated domains are rejected. Inline players additionally require an `/_layouts/15/embed.aspx` URL containing exactly one valid `UniqueId` GUID; optional GUID braces must be paired.

Before production, the deployment owner must restrict permitted iframe origins to the approved tenant hosts in the Confluence host’s `Content-Security-Policy` `frame-src` policy and align application URL validation with that tenant list. Keep authentication in Microsoft 365; do not put access tokens into document Markdown. Source file access and WCSpedia/Confluence access must both be configured for the intended audience.

Captions and transcripts should be maintained with the source recording. Microsoft stores them with the video under its file permissions; its web player supports transcript navigation and search. The current WCSpedia embed does not copy or independently index a transcript. [Microsoft’s captions and transcripts guidance](https://support.microsoft.com/en-us/clipchamp/stream-pages/view-edit-and-manage-video-transcripts-and-captions).

## Deployment acceptance checks

- Test a permitted internal account, a signed-out account, and an account without video access.
- Verify playback in the actual Confluence page with the organisation’s browser, authentication, and CSP settings.
- Check the fallback link when iframe playback is blocked and when a recording is moved or deleted.
- Verify the recording title, keyboard navigation, captions, and mobile layout.
- Save, reopen, review, approve, and export a document containing a recording; confirm its source and title survive each transition.

Local tests validate parsing, rendering, export preservation, and rejection of unsafe sources and attributes. They do not verify a live tenant recording, Microsoft 365 authentication, Confluence CSP, or successful playback. An iframe load event is not proof that a user watched a video.
