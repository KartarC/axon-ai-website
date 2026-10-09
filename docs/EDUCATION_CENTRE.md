# Education centre release

The public /education/ hub contains 16 written guides, three suggested learning paths and the two existing captioned videos. Seven new written tutorials cover import review, drafts and revisions, customer approvals, customer responses, PDF checks, billing/access and support reporting. The first-quote guide was rewritten for the guided workflow. Videos remain the existing short introductions; the hub directs users to the written instructions for the latest approval controls.

Every guide has a category, estimated reading time, contents links and related lessons. Search combines keyword matching and category filtering, with clear reset and empty states. Guides and videos remain available without signing in. Module access is enforced in the app, not granted by opening a lesson. No additional tracking or local-storage keys were introduced.

Getting Started now has six steps including issue and approval, retaining the existing per-user/company checkbox storage. The walkthrough retains its once-only behavior and eight steps, with updated import-review and sharing text. The downloadable user handbook and sitemap were updated, including canonical custom-domain URLs.

Validation: all 16 guide routes, local links, section anchors, search/category/reset/empty states, video caption tracks, 390/820/1440 layouts; existing education integration checks for setup persistence, walkthrough replay and module upgrade guards. Run tests with npm run test:education --prefix tests and a supported Playwright browser.
