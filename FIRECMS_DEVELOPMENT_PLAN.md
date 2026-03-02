# FireCMS Development Plan — Laxy Studio

> Derived from **TS-Laxy Studio Function List (28 Feb 2026)**.
> FireCMS is the admin back-office layer at `/admin` inside `laxy-studio` (`studio.laxy.travel/admin`).
> The Studio App (React + Wizard) handles the guide-creation workflow; FireCMS handles **platform configuration, user/tenant management, and operational data**.

---

## Current State

| Layer | Status |
|---|---|
| **laxy-studio** React app | Wizard shell + pipeline debug view built (MUI + Zustand). No FireCMS integration yet. |
| **FireCMS dependency** | Not installed — `package.json` has no `@firecms/*` packages. |
| **Firebase Auth** | Not integrated — no Firebase SDK in deps. |
| **Firestore** | Not integrated — no Firestore SDK in deps. |

---

## 1. Foundation — FireCMS + Firebase Setup

### 1.1 Install Dependencies

```
npm install firebase @firecms/core @firecms/firebase @firecms/mui
npm install react-router-dom
```

### 1.2 Firebase Project Initialisation

- Create `src/firebase.ts` — initialise Firebase App, Auth, Firestore, Storage
- Environment config via `.env` files (`VITE_FIREBASE_*`)
- Setup Firebase Auth providers (Google, Apple, Email/Password)

### 1.3 FireCMS App Mount

- Add `/admin` route (react-router) that renders `<FireCMS>` with `FirebaseAuthController` + `FirestoreDataSource`
- Keep the existing Wizard/Pipeline at the root `/` route
- Scaffold `src/admin/` directory for all FireCMS collections and custom views

### 1.4 Role-Based Access Control (RBAC)

| Role | Scope | Access Level |
|---|---|---|
| **Laxy Super Admin** | Platform-wide | Full access to all FireCMS collections, all tenants |
| **Client Admin** | Tenant-scoped | Manage their tenant's users, entity config, billing info |
| **Client Editor** | Tenant-scoped | Read-only on admin data; full access in Studio Wizard |

- Firebase Auth Custom Claims: `{ role, tenantId }`
- FireCMS `Authenticator` callback to check claims and gate collection access
- Permission matrix defined per collection (see sections below)

---

## 2. Firestore Data Model (Collections)

Design tenant-scoped collections. Root collections prefixed or use sub-collections under `/tenants/{tenantId}/`.

```
tenants/
  {tenantId}/
    info          → company name, logo, billing, timezone, defaults
    users/        → user profiles, roles
    guides/       → guide documents (linked to wizard output)
    assets/       → asset metadata (files in Cloud Storage)
    prompts/      → tenant-specific prompt overrides (Phase 1.5+)

_platform/
  featureFlags    → global + per-tenant flags
  subscriptionPlans → plan definitions
  auditLogs/      → all role actions
  promptLibrary/  → master prompt templates (Super Admin only)
```

---

## 3. FireCMS Collections to Build

### Phase 1 (MVP)

| # | Collection | Purpose | Ref in Function List | Priority |
|---|---|---|---|---|
| 3.1 | **Tenants** | Tenant CRUD — create, read, update, deactivate tenant accounts | User & Tenant Management → Tenant CRUD | P0 |
| 3.2 | **Users** | Manage users within tenants, assign roles (Client Admin / Client Editor) | User & Tenant Management → User CRUD | P0 |
| 3.3 | **Feature Flags** | Enable/disable features per tenant or globally | Platform Config → Feature Flags | P0 |
| 3.4 | **Subscription Plans** | Manual plan setup, view current plan and limits (experiences, storage, users), feature availability by tier | Billing & Subscription → Subscription Plan | P1 |
| 3.5 | **Tenant Information** | Company name, logo, billing info, timezone, default language, default audio settings (Character, Voice, Context) for Quick Process | Account Management → Tenant Information | P1 |
| 3.6 | **Account Management** | Change email, password, display name, profile avatar upload | Account Management | P1 |
| 3.7 | **Audit Logs** (read-only) | Audit logs for all roles actions — display pipeline execution logs | Monitoring & Logging | P2 |

### Phase 1.5

| # | Collection | Purpose | Ref in Function List |
|---|---|---|---|
| 3.8 | **Subscription Tier Override** | Manually adjust tier/quota for a tenant | Subscription Tier Override |

### Phase 2

| # | Collection | Purpose | Ref in Function List |
|---|---|---|---|
| 3.9 | **Module Dashboard** | Enable/disable modules per tenant, controls Studio and Player visibility | Module Dashboard |
| 3.10 | **User Management (Advanced)** | Invite users by email, assign/change roles, deactivate/remove users | User Management (extended) |
| 3.11 | **Usage Meter** | Real-time quota usage display | Billing → Usage Meter |
| 3.12 | **Invoice & Payment History** | View and download invoices | Billing → Invoice & Payment History |

### Phase 3

| # | Collection | Purpose | Ref in Function List |
|---|---|---|---|
| 3.13 | **Platform Analytics** | Usage metrics and revenue overview across all tenants | Platform Analytics |

---

## 4. Detailed Collection Schemas

### 4.1 Tenants Collection

```typescript
// tenants/{tenantId}
interface Tenant {
  id: string;
  companyName: string;
  logo?: string;                     // Cloud Storage URL
  billingInfo: {
    contactEmail: string;
    address?: string;
    taxId?: string;
  };
  timezone: string;                  // e.g. 'Asia/Tokyo'
  defaultLanguage: string;           // ISO 639-1
  supportedLanguages: string[];
  defaultAudioSettings: {            // Used by Quick Process (Phase 2)
    characterId?: string;
    voiceId?: string;
    contextNote?: string;
  };
  subscriptionTier: 'free' | 'starter' | 'pro' | 'enterprise';
  quotas: {
    maxExperiences: number;
    maxStorageBytes: number;
    maxUsers: number;
  };
  status: 'active' | 'suspended' | 'deactivated';
  enabledModules: string[];          // ['guide'] Phase 1, expandable
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**FireCMS Access:**
- Super Admin: full CRUD
- Client Admin: read own tenant, edit info fields only
- Client Editor: read-only

### 4.2 Users Collection

```typescript
// tenants/{tenantId}/users/{userId}
interface TenantUser {
  id: string;                        // matches Firebase Auth UID
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'client-admin' | 'client-editor';
  status: 'active' | 'invited' | 'deactivated';
  invitedAt?: Timestamp;
  lastLoginAt?: Timestamp;
  createdAt: Timestamp;
}
```

**FireCMS Access:**
- Super Admin: full CRUD on all tenants
- Client Admin: CRUD within own tenant
- Client Editor: read own profile only

### 4.3 Feature Flags Collection

```typescript
// _platform/featureFlags/{flagId}
interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabledGlobally: boolean;
  tenantOverrides: Record<string, boolean>;  // tenantId → enabled
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**FireCMS Access:** Super Admin only

### 4.4 Subscription Plans Collection

```typescript
// _platform/subscriptionPlans/{planId}
interface SubscriptionPlan {
  id: string;
  name: string;                      // 'Free', 'Starter', 'Pro', 'Enterprise'
  maxExperiences: number;
  maxStorageBytes: number;
  maxUsers: number;
  enabledFeatures: string[];         // feature identifiers
  priceMonthly?: number;
  priceYearly?: number;
  currency: string;
  sortOrder: number;
  active: boolean;
}
```

**FireCMS Access:** Super Admin only

### 4.5 Prompt Library Collection

```typescript
// _platform/promptLibrary/{promptId}
interface PromptTemplate {
  id: string;
  name: string;
  module: 'ingestion' | 'script' | 'translation' | 'audio' | 'director-note';
  tags: string[];
  version: number;
  content: string;                   // The prompt text
  isActive: boolean;
  createdBy: string;                 // userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**FireCMS Access:**
- Super Admin: full CRUD (only Super Admin can edit prompts per function list)
- Client Admin / Editor: read-only (consumed via ADK pipeline)

### 4.6 Audit Logs Collection (Read-Only View)

```typescript
// _platform/auditLogs/{logId}
interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: string;                    // e.g. 'guide.publish', 'user.invite'
  resource: string;                  // e.g. 'guides/abc123'
  details?: Record<string, any>;
  timestamp: Timestamp;
}
```

**FireCMS Access:** Read-only for all roles (scoped by tenant for non-Super Admins)

---

## 5. Implementation Roadmap

### Sprint 1 — Foundation (Week 1-2)

| Task | Description | Estimate |
|---|---|---|
| **F-001** | Install Firebase SDK + FireCMS packages | 0.5d |
| **F-002** | Create `src/firebase.ts` with env-based config | 0.5d |
| **F-003** | Setup React Router — `/` for Studio, `/admin` for FireCMS | 1d |
| **F-004** | Create FireCMS app shell with `FirebaseAuthController` | 1d |
| **F-005** | Implement RBAC — custom claims, `Authenticator`, permission checks | 2d |
| **F-006** | Firebase Auth setup — Google, Apple, Email/Password providers | 1d |
| **F-007** | Environment configuration (DEV / Staging / PROD) — totally separate Firebase projects | 1d |

### Sprint 2 — Core Collections (Week 3-4)

| Task | Description | Estimate |
|---|---|---|
| **F-008** | Tenants collection — schema, CRUD, validation, tenant-scoped filtering | 2d |
| **F-009** | Users collection — schema, CRUD, role assignment, invite flow | 2d |
| **F-010** | Feature Flags collection — global + per-tenant toggle UI | 1d |
| **F-011** | Subscription Plans collection — plan definitions, feature mapping | 1d |
| **F-012** | Tenant Information — extended fields (billing, timezone, defaults, audio settings) | 1.5d |
| **F-013** | Account Management — profile editing (email, display name, avatar) | 1d |

### Sprint 3 — Prompt Library & Audit (Week 5-6)

| Task | Description | Estimate |
|---|---|---|
| **F-014** | Prompt Library collection — create, version, activate prompts per function | 2d |
| **F-015** | Prompt tagging by module | 0.5d |
| **F-016** | Prompt version history view | 1d |
| **F-017** | Audit Logs — read-only collection view with tenant scoping | 1.5d |
| **F-018** | Cloud Logging integration (display ADK pipeline logs) | 1d |

### Sprint 4 — Auth Flows in Studio App (Week 7-8)

> These are in the **Studio App** (not FireCMS) but depend on Firebase Auth setup from Sprint 1.

| Task | Description | Estimate |
|---|---|---|
| **F-019** | Login page — Social login (Google, Apple) + Email/Password + Email OTP | 2d |
| **F-020** | Registration — Tenant sign-up form, email verification, onboarding walkthrough | 2d |
| **F-021** | Forget Password — Reset via email link, OTP expiry | 1d |
| **F-022** | Session management — JWT refresh, token expiry | 1d |

### Sprint 5 — Phase 1.5 / Phase 2 Prep (Week 9-10)

| Task | Description | Estimate |
|---|---|---|
| **F-023** | Subscription Tier Override — manual tier/quota adjustment per tenant | 1d |
| **F-024** | Module Dashboard — enable/disable modules per tenant | 1.5d |
| **F-025** | Advanced User Management — invite by email, role change, deactivate/remove | 2d |
| **F-026** | Usage Meter — real-time quota display | 1.5d |

---

## 6. Integration Points

### 6.1 FireCMS ↔ Studio Wizard

The Studio wizard reads tenant configuration from Firestore:

| Data | Read by Wizard | Written by FireCMS |
|---|---|---|
| Tenant default language & supported languages | Entity Config step | Tenant Information |
| Enabled modules | Module Select step | Module Dashboard |
| Default audio settings (Character, Voice, Context) | Audio step / Quick Process | Tenant Information |
| Feature flags | Throughout wizard (conditional features) | Feature Flags |
| Subscription limits | Upload limits, experience count | Subscription Plans + Tenant |

### 6.2 FireCMS ↔ ADK Pipeline

| Data | Flow | Purpose |
|---|---|---|
| Prompt Library | ADK pipeline reads active prompts from `functions/agents/prompts/` | Decouple AI tuning from code deployment |
| Audit Logs | ADK pipeline writes to Firestore, FireCMS displays | All role actions logged |
| Asset metadata | ADK pipeline processes, FireCMS displays | Asset Data Lake references |

### 6.3 FireCMS ↔ Firebase Auth

| Flow | Description |
|---|---|
| User creation in FireCMS → Firebase Auth user + custom claims | Sync role & tenantId |
| Login in Studio App → Firebase Auth → Custom claims read | RBAC enforcement |
| Password reset | Firebase Auth `sendPasswordResetEmail` |

---

## 7. File / Folder Structure

```
src/
  admin/
    AdminApp.tsx                 ← FireCMS root component
    auth/
      authenticator.ts           ← RBAC gate for FireCMS access
      permissions.ts             ← Permission matrix per role/collection
    collections/
      tenants.ts                 ← Tenant collection config
      users.ts                   ← User collection config
      featureFlags.ts            ← Feature flags config
      subscriptionPlans.ts       ← Plans config
      promptLibrary.ts           ← Prompt templates config
      auditLogs.ts               ← Read-only audit log view
      moduleDashboard.ts         ← Module toggles (Phase 2)
    views/
      TenantInfoView.tsx         ← Extended tenant info editor
      UsageMeterView.tsx         ← Quota usage dashboard (Phase 2)
      PlatformAnalyticsView.tsx  ← Revenue/usage overview (Phase 3)
    hooks/
      useTenantScope.ts          ← Hook to filter by current user's tenant
      useFeatureFlags.ts         ← Read flags for conditional rendering
  firebase.ts                    ← Firebase init
  ...existing files...
```

---

## 8. Key Decisions & Open Questions

| # | Decision / Question | Notes from Function List |
|---|---|---|
| 1 | **Tenant vs Client terminology** | Function list uses both — align on "Tenant" in code, "Client" in UI? |
| 2 | **Separate Firebase projects per env** | DEV, Staging, PROD — "data are totally isolated, no data migration" |
| 3 | **No signed URLs in Phase 1** | Follow standard Firestore/Storage practice; signed URLs Phase 2 |
| 4 | **No GCP Secret Manager in Phase 1** | Just follow Firestore security rules practice |
| 5 | **PostgreSQL for Users/Tenants/Billing/Prompts** | Function list says PostgreSQL — evaluate if Firestore alone suffices for Phase 1 or if a backend API layer is needed |
| 6 | **Prompt editing scope** | Only Super Admin can edit prompts; Client Super Admin can edit "selected" prompts — confirm which ones |
| 7 | **Decap CMS migration** | "From this part, v2 now in Decap CMS — what is the plan to merge it to Laxy Studio?" — Publishing/slideshow builder needs migration plan |
| 8 | **Subscription Plan scope for Phase 1** | "no idea the scope of phase 1" — define minimum viable billing fields |
| 9 | **Rate limiting** | "Per-tenant rate limits — confirm set in Phase 1?" — needs testing with Gemini limits first |

---

## 9. Phase Summary

| Phase | FireCMS Scope |
|---|---|
| **Phase 1 (MVP)** | Firebase Auth + RBAC, Tenants CRUD, Users CRUD, Feature Flags, Subscription Plans, Tenant Information, Account Management, Prompt Library (Super Admin), Audit Logs (read-only) |
| **Phase 1.5** | Subscription Tier Override |
| **Phase 2** | Module Dashboard, Advanced User Management (invite flow), Usage Meter, Invoice & Payment History, A/B Prompt Testing |
| **Phase 3** | Platform Analytics, Payment Gateway integration, Plan Upgrade/Downgrade |

---

*Last updated: 2026-03-01*
