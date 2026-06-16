// Billet — Module registry and feature flag helpers
export const MODULES = {
  'production-board': {
    slug:  'production-board',
    name:  'Production Board',
    desc:  'Live scheduling board. Every department on the same page.',
    path:  '/app/modules/production-board/',
    phase: 1,
    plans: ['starter','growth','suite'],
    roi:   '10–15% throughput improvement',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="2" y="3" width="18" height="16" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <path d="M7 1.5v3M15 1.5v3M2 9h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="5.5" y="12" width="4" height="3.5" rx=".6" fill="currentColor" opacity=".25"/>
      <rect x="12" y="12" width="4" height="3.5" rx=".6" fill="currentColor"/>
    </svg>`,
  },
  'job-costing': {
    slug:  'job-costing',
    name:  'Job Costing',
    desc:  'Actual vs quoted cost per operation. Find your margin leaks.',
    path:  '/app/modules/job-costing/',
    phase: 2,
    plans: ['starter','growth','suite'],
    roi:   'Finds 8–12% hidden margin gap',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <polyline points="2,17 7,11 11,14 19,7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="16,7 19,7 19,10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'shop-traveler': {
    slug:  'shop-traveler',
    name:  'Shop Traveler',
    desc:  'QR code per job. Paperless operations with full audit trail.',
    path:  '/app/modules/shop-traveler/',
    phase: 3,
    plans: ['starter','growth','suite'],
    roi:   '45 min/day saved per operator',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="5" y="2" width="12" height="18" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
      <path d="M8.5 7h5M8.5 10.5h4M8.5 14h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  'customer-portal': {
    slug:  'customer-portal',
    name:  'Customer Portal',
    desc:  'Real-time order tracking for your customers. No more status calls.',
    path:  '/app/modules/customer-portal/',
    phase: 4,
    plans: ['starter','growth','suite'],
    roi:   'Eliminates 1–2 hrs/day of calls',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M2 6l9 6 9-6M2 6h18v13H2V6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'maintenance': {
    slug:  'maintenance',
    name:  'PM Tracker',
    desc:  'Preventive maintenance schedules. Alert before failure.',
    path:  '/app/modules/maintenance/',
    phase: 4,
    plans: ['starter','growth','suite'],
    roi:   'Prevents $5K–$15K unplanned repairs',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M14.5 3a5 5 0 0 1 0 7L7 17l-3.5 1 1-3.5 7.5-7.5A5 5 0 0 1 14.5 3z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'materials': {
    slug:  'materials',
    name:  'Material Inventory',
    desc:  'Track raw stock and remnants. Stop buying what you own.',
    path:  '/app/modules/materials/',
    phase: 5,
    plans: ['starter','growth','suite'],
    roi:   '$10–$20K/yr saved in overbuying',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M19 7H3l2-4h12l2 4zM4 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'coc': {
    slug:  'coc',
    name:  'CoC Generator',
    desc:  'Auto-generate Certificates of Conformance at job ship.',
    path:  '/app/modules/coc/',
    phase: 5,
    plans: ['starter','growth','suite'],
    roi:   '45 min saved per shipment',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M13 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 2v5h5M8 13l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'crm': {
    slug:  'crm',
    name:  'Shop CRM',
    desc:  'Customer profitability, quote pipeline, follow-up tracking.',
    path:  '/app/modules/crm/',
    phase: 5,
    plans: ['starter','growth','suite'],
    roi:   'Know which customers profit you',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.4"/>
      <path d="M2 20c0-3.8 3.1-7 7-7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M16 14l4.5 4.5M16 18.5l4.5-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  'outside-service': {
    slug:  'outside-service',
    name:  'Outside Services',
    desc:  'Track every job at heat treat, anodize, plating. Zero black holes.',
    path:  '/app/modules/outside-service/',
    phase: 5,
    plans: ['starter','growth','suite'],
    roi:   'Zero jobs lost at vendors',
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.4"/>
      <path d="M11 7v4l3 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
}

export const hasModule     = (account, slug) => account?.modules?.includes(slug) ?? false
export const getVisibleModules = (account) => Object.values(MODULES).filter(m => hasModule(account, m.slug))
export const getAllModules  = () => Object.values(MODULES)
