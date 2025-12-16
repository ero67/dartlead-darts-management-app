# Landing Page & Payment/Subscription System Plan

## Overview
This document outlines the plan for creating a marketing landing page and implementing a payment/subscription system for the Darts Tournament Management Application.

---

## Part 1: Landing Page

### 1.1 Page Structure & Routes

**New Route:** `/` (Home/Landing Page)
- **Current:** Dashboard is likely at `/` or `/dashboard`
- **Action:** Create new landing page component, move dashboard to `/dashboard` or `/app`

**Route Structure:**
```
/                    → Landing Page (public)
/about               → About Page (optional)
/pricing             → Pricing Plans Page
/contact             → Contact Page (or modal on landing)
/login               → Existing Auth page
/dashboard           → Dashboard (protected)
/tournaments         → Existing tournaments list (protected)
```

### 1.2 Landing Page Sections

#### **Hero Section**
- **Headline:** "Professional Darts Tournament Management"
- **Subheadline:** "Streamline your league operations with real-time scoring, bracket management, and comprehensive statistics"
- **CTA Buttons:**
  - Primary: "Start Free Trial" → `/login` or signup
  - Secondary: "View Demo" → Video or interactive demo
- **Visual:** Screenshot/gif of the app in action

#### **Features Section**
**Key Features to Highlight:**

1. **Tournament Management**
   - Group stage and playoff brackets
   - Playoff-only tournaments
   - Flexible tournament formats
   - Real-time match tracking

2. **Live Scoring**
   - Multi-device support
   - Real-time updates
   - Automatic statistics calculation
   - Match history tracking

3. **Statistics & Analytics**
   - Player performance metrics
   - Match averages
   - Checkout tracking
   - Tournament standings

4. **User-Friendly Interface**
   - Intuitive design
   - Mobile-responsive
   - Dark mode support
   - Multi-language support (English/Slovak)

5. **League Management**
   - Multiple tournaments
   - Player database
   - Tournament history
   - Export capabilities

#### **How It Works Section**
**3-Step Process:**
1. **Create Tournament** - Set up your tournament with custom settings
2. **Add Players** - Register participants
3. **Track Matches** - Score matches live and view statistics

#### **Testimonials Section** (Optional - add later)
- Quotes from early users
- League organizer testimonials

#### **Pricing Preview Section**
- Brief overview of plans
- Link to full pricing page
- "Start Free Trial" CTA

#### **Contact Section**
- Contact form (see 1.3)
- Email: support@yourdomain.com
- Social media links (if applicable)

#### **Footer**
- Links: About, Pricing, Contact, Privacy Policy, Terms of Service
- Copyright notice
- Social media links

### 1.3 Contact Form Implementation

#### **Form Fields:**
- Name (required)
- Email (required)
- Organization/League Name (optional)
- Message (required)
- Phone (optional)
- How did you hear about us? (dropdown)

#### **Implementation Options:**

**Option A: Supabase Edge Functions + Email Service**
- Create Supabase Edge Function to handle form submission
- Use email service (SendGrid, Mailgun, Resend, or Supabase Email)
- Store submissions in Supabase `contact_submissions` table

**Option B: Third-Party Form Service**
- Use Formspree, Netlify Forms, or similar
- Simple integration, less control

**Option C: Direct Email API**
- Use Resend API (recommended - simple, good free tier)
- Or SendGrid/Mailgun
- Call from frontend or Edge Function

**Recommended: Option A with Resend**
- More control
- Can store submissions in DB
- Professional email delivery
- Can set up auto-reply

#### **Database Schema:**
```sql
CREATE TABLE contact_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  message TEXT NOT NULL,
  source TEXT, -- how they heard about us
  status TEXT DEFAULT 'new', -- new, replied, archived
  created_at TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) -- if logged in
);
```

#### **Email Template:**
- **To:** Your email
- **Subject:** "New Contact Form Submission - [Organization Name]"
- **Body:** Formatted with all fields
- **Auto-reply:** Thank you email to submitter

---

## Part 2: Payment/Subscription System

### 2.1 Subscription Model

#### **Tier Structure:**

**Free Tier (Trial)**
- 1 active tournament
- Up to 16 players per tournament
- Basic statistics
- Limited to 1 month trial

**Starter Plan - $X/month**
- 3 active tournaments
- Up to 32 players per tournament
- Full statistics
- Email support

**Professional Plan - $Y/month**
- Unlimited tournaments
- Up to 64 players per tournament
- Advanced analytics
- Priority support
- Custom branding (future)

**Enterprise Plan - Custom Pricing**
- Everything in Professional
- Custom features
- Dedicated support
- API access (future)
- White-label options (future)

### 2.2 Payment Provider Selection

**Recommended: Stripe**
- Industry standard
- Excellent Supabase integration
- Subscription management built-in
- Webhook support
- PCI compliance handled
- Good documentation

**Alternative: LemonSqueezy**
- Simpler setup
- Handles taxes automatically
- Less control over checkout flow

### 2.3 Database Schema for Subscriptions

```sql
-- User subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  plan_id TEXT NOT NULL, -- 'free', 'starter', 'professional', 'enterprise'
  status TEXT NOT NULL, -- 'active', 'canceled', 'past_due', 'trialing'
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscription plans table (for reference)
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY, -- 'free', 'starter', 'professional', 'enterprise'
  name TEXT NOT NULL,
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  features JSONB, -- Array of feature strings
  max_tournaments INTEGER,
  max_players_per_tournament INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment history
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id),
  stripe_payment_intent_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- 'succeeded', 'failed', 'pending'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking (for limits)
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  metric_type TEXT NOT NULL, -- 'tournaments', 'players', 'matches'
  count INTEGER DEFAULT 0,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.4 Implementation Architecture

#### **Frontend Components Needed:**

1. **Pricing Page (`/pricing`)**
   - Display all plans
   - Feature comparison table
   - "Choose Plan" buttons
   - Link to Stripe Checkout

2. **Subscription Management Page (`/settings/subscription`)**
   - Current plan display
   - Upgrade/downgrade options
   - Payment method management
   - Billing history
   - Cancel subscription option

3. **Usage Dashboard**
   - Show current usage vs limits
   - Progress bars/indicators
   - Warnings when approaching limits

#### **Backend Components Needed:**

1. **Stripe Integration Service**
   - Create checkout sessions
   - Handle webhooks
   - Manage subscriptions
   - Update subscription status

2. **Supabase Edge Functions:**
   - `create-checkout-session` - Create Stripe checkout
   - `create-portal-session` - Customer portal for managing subscription
   - `stripe-webhook` - Handle Stripe events

3. **Subscription Middleware**
   - Check subscription status before actions
   - Enforce limits (tournaments, players)
   - Show upgrade prompts

### 2.5 Stripe Webhook Events to Handle

- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Plan changed
- `customer.subscription.deleted` - Cancelled
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed
- `customer.subscription.trial_will_end` - Trial ending soon

### 2.6 Subscription Flow

1. **User selects plan** → Redirects to Stripe Checkout
2. **Stripe processes payment** → Webhook fires
3. **Webhook updates database** → Subscription status updated
4. **User redirected back** → Success page
5. **App checks subscription** → Grants access based on plan

### 2.7 Feature Gating Logic

**Example Implementation:**

```javascript
// services/subscriptionService.js
export const checkTournamentLimit = async (userId) => {
  const subscription = await getSubscription(userId);
  const activeTournaments = await getActiveTournamentCount(userId);
  
  if (subscription.plan_id === 'free' && activeTournaments >= 1) {
    return { allowed: false, reason: 'free_limit_reached' };
  }
  if (subscription.plan_id === 'starter' && activeTournaments >= 3) {
    return { allowed: false, reason: 'starter_limit_reached' };
  }
  // Professional and Enterprise have unlimited
  return { allowed: true };
};
```

---

## Part 3: Implementation Steps

### Phase 1: Landing Page (Week 1-2)
1. ✅ Create landing page component
2. ✅ Design hero section
3. ✅ Add features section
4. ✅ Implement contact form
5. ✅ Set up email service (Resend)
6. ✅ Create contact submissions table
7. ✅ Style and responsive design
8. ✅ Add routing

### Phase 2: Payment Infrastructure (Week 3-4)
1. ✅ Set up Stripe account
2. ✅ Create database tables
3. ✅ Install Stripe SDK
4. ✅ Create Edge Functions
5. ✅ Set up webhook endpoint
6. ✅ Test payment flow

### Phase 3: Subscription Management (Week 5-6)
1. ✅ Create pricing page
2. ✅ Build subscription management UI
3. ✅ Implement feature gating
4. ✅ Add usage tracking
5. ✅ Create upgrade prompts
6. ✅ Test subscription lifecycle

### Phase 4: Polish & Launch (Week 7-8)
1. ✅ Add error handling
2. ✅ Email notifications
3. ✅ Documentation
4. ✅ Testing
5. ✅ Launch!

---

## Part 4: Technical Details

### 4.1 Required Packages

```json
{
  "stripe": "^14.0.0",
  "@stripe/stripe-js": "^2.0.0"
}
```

### 4.2 Environment Variables

```env
# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...

# Supabase (already have)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 4.3 Supabase Edge Functions Structure

```
supabase/
  functions/
    create-checkout-session/
      index.ts
    create-portal-session/
      index.ts
    stripe-webhook/
      index.ts
```

---

## Part 5: Content Suggestions

### Landing Page Copy

**Headline Options:**
- "Professional Darts Tournament Management Made Simple"
- "Run Your Darts League Like a Pro"
- "The Complete Tournament Management Solution for Darts Leagues"

**Key Benefits:**
- Save time with automated bracket generation
- Real-time scoring from any device
- Comprehensive statistics and analytics
- Easy player management
- Professional tournament presentation

**Call-to-Action:**
- "Start Your Free Trial"
- "Get Started Free"
- "Try It Free for 30 Days"

---

## Part 6: Future Enhancements

- Custom branding/white-label
- API access for integrations
- Mobile apps (iOS/Android)
- Advanced reporting/export
- Team tournaments
- Integration with dart scoring hardware
- Social media sharing
- Player profiles and rankings across tournaments

---

## Next Steps

1. Review and approve this plan
2. Set up Stripe account
3. Create landing page mockup/design
4. Begin implementation Phase 1
5. Set up email service (Resend)
6. Create database migrations
7. Build Stripe integration

---

## Questions to Consider

1. **Pricing:** What are your target prices for each tier?
2. **Trial Period:** How long should the free trial be? (30 days recommended)
3. **Payment Frequency:** Monthly only, or also yearly with discount?
4. **Geographic Pricing:** Different prices for different regions?
5. **Support:** What level of support for each tier?
6. **Domain:** What domain will you use for the landing page?

