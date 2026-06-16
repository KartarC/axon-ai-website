# Billet — Website

Marketing website for **Billet** — modular software tools and website design for CNC machine shops and metal fabrication shops.

## Stack

- Pure HTML + CSS + JS — no framework, zero dependencies
- Deployed on Vercel (KartarC/axon-ai-website → auto-deploy on push)
- Supabase: `public.website_leads` table for form submissions
- Admin dashboard: `/admin.html` (password-protected)

## Pages

- `index.html` — Home
- `tools.html` — All 9 tool modules with live mockups
- `website-design.html` — Website design service
- `admin.html` — Lead management dashboard

## To deploy

1. Push to GitHub (`git push origin main`)
2. Vercel auto-deploys on push
3. Custom domain: `axonai.com` or `billet.app`

## Brand

- **Primary:** `#1D4ED8` (blue)
- **Background:** `#FFFFFF` (white)
- **Font:** Inter
- **Tagline:** "Replace the whiteboard, the clipboard, and the spreadsheet."

## Environment variables (Vercel)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
